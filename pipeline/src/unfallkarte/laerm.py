# SPDX-License-Identifier: AGPL-3.0-or-later
"""UBA-Umgebungslärm: Hauptverkehrsstraßen-Lärmpegelklassen (END-Lärmkartierung).

Zieht je Lärmindex einen Polygon-Layer vom UBA-ArcGIS-Dienst
(datahub.uba.de VeLa/LK), schneidet die riesigen Multipolygone an einem 2-km-Raster
klein (sonst sprengen sie FlatGeobuf/tippecanoe), explodiert auf Einzelpolygone und
tilet als PMTiles. Analog zu `hvs.py`, nur mehrere Varianten + Polygon-Vorverarbeitung.

Varianten (interner Layer-Name = `source-layer` in addLayers.js = Frontend-Vertrag):
  laerm_den   -> UBA 4110 (Lden, Tag-Abend-Nacht), Layer `laerm_hlq_den-polys`
  laerm_night -> UBA 4120 (Lnight, Nacht),          Layer `laerm_4120_hlq_night-polys`

CRS: Fetch nach EPSG:4326, Grid-Cut/`buffer(0)` metrisch in EPSG:25832, Output 4326
(FGB + PMTiles). Portiert aus preprocessing/laerm/get_laerm_v0{1,2}_*.ipynb.
"""

from __future__ import annotations

import json
import time
from dataclasses import dataclass
from pathlib import Path

import requests

from unfallkarte import tiles
from unfallkarte.config import get_paths, load_yaml

_SERVICE = "https://datahub.uba.de/server/rest/services/VeLa/LK/MapServer"
_PAGE = 200          # Features/Seite (wenige, aber riesige Multipolygone)
_RATE_SLEEP = 0.3    # höflich zum UBA-Server
_GRID_M = 2000       # 2-km-Raster: zerschneidet die DE-weiten Multipolygone
_METRIC = 25832      # metrisch für buffer(0)+Grid (CLAUDE.md), Output bleibt 4326


@dataclass(frozen=True)
class Variant:
    uba_layer: int   # ArcGIS-Layer-ID (datahub.uba.de VeLa/LK)
    layer: str       # interner Tile-/source-layer-Name (Frontend-Vertrag, NICHT ändern)
    dataset: str     # Key in sources.yaml -> Output-Datei
    raw_fgb: str     # vorab prozessiertes exploded-FGB in data/raw/laerm/ (raw-Cache)


VARIANTS: dict[str, Variant] = {
    "laerm_den": Variant(
        4110, "laerm_hlq_den-polys", "laerm_den", "laerm_den_road.fgb"
    ),
    "laerm_night": Variant(
        4120, "laerm_4120_hlq_night-polys", "laerm_night", "laerm_night_road.fgb"
    ),
}


def _raw() -> Path:
    return get_paths().raw / "laerm"


def _dataset(name: str) -> dict:
    return load_yaml("sources.yaml")["datasets"][VARIANTS[name].dataset]


def fetch(name: str, *, force: bool = False) -> Path:
    """Zieht den UBA-Layer der Variante paginiert (outSR=4326) als GeoJSON."""
    v = VARIANTS[name]
    _raw().mkdir(parents=True, exist_ok=True)
    dest = _raw() / f"{name}_{v.uba_layer}.geojson"
    if dest.exists() and not force:
        print(f"  vorhanden: {dest}")
        return dest

    query = f"{_SERVICE}/{v.uba_layer}/query"
    session = requests.Session()
    n = session.get(
        query, params={"where": "1=1", "returnCountOnly": "true", "f": "json"}, timeout=60
    ).json()["count"]
    print(f"  Layer {v.uba_layer}: {n} Features, Seiten à {_PAGE}")

    feats: list[dict] = []
    offset = 0
    while offset < n:
        r = session.get(query, params={
            "where": "1=1",
            "outFields": "*",
            "outSR": 4326,
            "orderByFields": "OBJECTID",   # stabile Pagination
            "resultOffset": offset,
            "resultRecordCount": _PAGE,
            "returnGeometry": "true",
            "f": "geojson",
        }, timeout=300)
        r.raise_for_status()
        page = r.json().get("features", [])
        if not page:
            break
        feats.extend(page)
        offset += _PAGE
        print(f"    {min(offset, n)}/{n}")
        time.sleep(_RATE_SLEEP)

    dest.write_text(
        json.dumps({"type": "FeatureCollection", "features": feats}), encoding="utf-8"
    )
    print(f"  geschrieben: {len(feats)} Features")
    return dest


def to_fgb(src_json: Path, fgb: Path) -> tuple[Path, int]:
    """GeoJSON(4326) -> 2-km-Raster-Schnitt -> explode -> FlatGeobuf(4326).

    Die UBA-Polygone sind DE-weite Multipolygone; ungeschnitten brechen sie
    FlatGeobuf/tippecanoe. Schnitt+`buffer(0)` metrisch (25832), Output 4326.
    """
    import geopandas as gpd
    from shapely.geometry import box

    gdf = gpd.read_file(src_json)  # EPSG:4326
    gdf = gdf[gdf.geometry.notna() & ~gdf.geometry.is_empty]

    metric = gdf.to_crs(_METRIC)
    metric["geometry"] = metric.geometry.buffer(0)  # invalide Ringe heilen

    minx, miny, maxx, maxy = metric.total_bounds
    cells = [
        box(x, y, x + _GRID_M, y + _GRID_M)
        for x in range(int(minx), int(maxx) + _GRID_M, _GRID_M)
        for y in range(int(miny), int(maxy) + _GRID_M, _GRID_M)
    ]
    grid = gpd.GeoDataFrame(geometry=cells, crs=metric.crs)
    cut = gpd.overlay(metric, grid, how="intersection", keep_geom_type=True)
    cut = cut.explode(index_parts=False).to_crs(4326)
    cut = cut[cut.geometry.notna() & ~cut.geometry.is_empty].reset_index(drop=True)

    fgb.parent.mkdir(parents=True, exist_ok=True)
    cut.to_file(fgb, driver="FlatGeobuf")
    return fgb, len(cut)


def build(name: str, *, dry_run: bool = False) -> Path:
    """Voller Build einer Variante -> noise/laerm_*.pmtiles (interner Layer = Vertrag).

    Bevorzugt das vorab prozessierte exploded-FGB (data/raw/laerm/<raw_fgb>) als
    raw-Cache; fehlt es, wird frisch von der UBA-API gezogen und zerschnitten.
    """
    v = VARIANTS[name]
    _raw().mkdir(parents=True, exist_ok=True)
    out = get_paths().data / _dataset(name)["file"]

    fgb = _raw() / v.raw_fgb
    if not fgb.exists() and not dry_run:
        src = _raw() / f"{name}_{v.uba_layer}.geojson"
        if not src.exists():
            src = fetch(name)
        fgb = _raw() / f"{name}_cut.fgb"
        _, k = to_fgb(src, fgb)
        print(f"  Polygone: {k}")
    else:
        print(f"  raw-FGB: {fgb}")

    return tiles.tippecanoe("laerm", fgb, out, layer_override=v.layer, dry_run=dry_run)


def build_all(*, dry_run: bool = False) -> list[Path]:
    return [build(name, dry_run=dry_run) for name in VARIANTS]
