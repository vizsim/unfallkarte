# SPDX-License-Identifier: AGPL-3.0-or-later
"""UBA-Verkehrsmengen: Hauptverkehrsstraßennetz (END 4. Runde, Bezugsjahr 2021).

Zieht Layer 8100 (Hauptverkehrsstraßennetz, VOLLE Geometrie) vom UBA-ArcGIS-Dienst
paginiert nach EPSG:4326, behält nur `annualTrafficFlow` (Kfz/Jahr) und tilet als
PMTiles. NICHT 81002 nehmen — das ist die auf 1:10.000 generalisierte Variante
(Linien auf ~2 Stützpunkte reduziert). Frontend-Vertrag: Source-ID `hvs`, Layer `lines`.
"""

from __future__ import annotations

import json
import time
from pathlib import Path

import requests

from unfallkarte import tiles
from unfallkarte.config import get_paths, load_yaml

_LAYER = 8100         # volle Geometrie (NICHT 81002 = GEN10000/generalisiert)
_QUERY = f"https://datahub.uba.de/server/rest/services/VeLa/LK/MapServer/{_LAYER}/query"
_GEOJSON = f"hvs_{_LAYER}.geojson"
_PAGE = 2000          # = maxRecordCount des Dienstes
_RATE_SLEEP = 0.2     # höflich zum UBA-Server


def _raw() -> Path:
    return get_paths().raw / "hvs"


def _dataset() -> dict:
    return load_yaml("sources.yaml")["datasets"]["hvs"]


def fetch(*, force: bool = False) -> Path:
    """Lädt Layer 8100 (volle Geometrie) paginiert (outSR=4326) nach data/raw/hvs/."""
    _raw().mkdir(parents=True, exist_ok=True)
    dest = _raw() / _GEOJSON
    if dest.exists() and not force:
        print(f"  vorhanden: {dest}")
        return dest

    session = requests.Session()
    n = session.get(
        _QUERY, params={"where": "1=1", "returnCountOnly": "true", "f": "json"}, timeout=60
    ).json()["count"]
    print(f"  {n} Features, Seiten à {_PAGE}")

    feats: list[dict] = []
    offset = 0
    while offset < n:
        r = session.get(_QUERY, params={
            "where": "1=1",
            "outFields": "annualTrafficFlow",
            "outSR": 4326,
            "orderByFields": "OBJECTID",   # stabile Pagination
            "resultOffset": offset,
            "resultRecordCount": _PAGE,
            "returnGeometry": "true",
            "f": "geojson",
        }, timeout=180)
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
    """GeoJSON (4326) -> FlatGeobuf, behält nur annualTrafficFlow."""
    import geopandas as gpd

    gdf = gpd.read_file(src_json)
    keep = [c for c in ("annualTrafficFlow",) if c in gdf.columns]
    gdf = gdf[[*keep, "geometry"]]
    # Einige Features (~23) haben NULL/leere Geometrie -> FlatGeobuf-Write bräche sonst ab.
    gdf = gdf[gdf.geometry.notna() & ~gdf.geometry.is_empty].reset_index(drop=True)
    fgb.parent.mkdir(parents=True, exist_ok=True)
    gdf.to_file(fgb, driver="FlatGeobuf")
    return fgb, len(gdf)


def build(*, dry_run: bool = False) -> Path:
    """Voller Build: fetch (falls nötig) -> FGB -> PMTiles (Layer `lines`)."""
    src = _raw() / _GEOJSON
    if not src.exists() and not dry_run:
        src = fetch()
    out = get_paths().data / _dataset()["file"]
    fgb = _raw() / "hvs_lines.fgb"
    if dry_run or not src.exists():
        print("  [skip] FGB (kein GeoJSON / dry-run)")
    else:
        _, k = to_fgb(src, fgb)
        print(f"  Linien: {k}")
    return tiles.tippecanoe("hvs_lines", fgb, out, layer_override="lines", dry_run=dry_run)
