# SPDX-License-Identifier: AGPL-3.0-or-later
"""Telraam-Kontextlayer: Verkehrszähl-Segmente (Standorte) laden & tilen.

Holt alle Segmente von telraam-api.net (`segments/all`, weltweit in EPSG:31370),
reprojiziert nach EPSG:4326, filtert auf Deutschland und tilet als PMTiles. Pro
Segment bleibt nur die `oidn` (Segment-ID) — daraus baut das Frontend den Klick-
Link `https://telraam.net/en/location/<oidn>`. Token kommt aus `.env`
(TELRAAM_API_KEY); Daten stehen unter CC BY-NC 4.0 (Attribution, nicht kommerziell).
"""

from __future__ import annotations

import json
from pathlib import Path

import requests

from unfallkarte import tiles
from unfallkarte.config import get_paths, get_settings, load_yaml

_API_URL = "https://telraam-api.net/v1/segments/all"
# Deutschland-Bbox (grob inkl. Puffer): lon_min, lat_min, lon_max, lat_max
_DE_BBOX = (5.8, 47.2, 15.1, 55.1)
_SOURCE_CRS = "EPSG:31370"  # Telraam liefert segments/all global in Belgischem Lambert72


def _raw() -> Path:
    return get_paths().raw / "telraam"


def _dataset() -> dict:
    return load_yaml("sources.yaml")["datasets"]["telraam_segments"]


def fetch(*, force: bool = False) -> Path:
    """Lädt segments/all (weltweit, EPSG:31370) nach data/raw/telraam/segments_all.json."""
    token = get_settings().telraam_api_key
    if not token:
        raise RuntimeError("TELRAAM_API_KEY fehlt in pipeline/.env")
    _raw().mkdir(parents=True, exist_ok=True)
    dest = _raw() / "segments_all.json"
    if dest.exists() and not force:
        print(f"  vorhanden: {dest}")
        return dest
    print(f"  lade {_API_URL}")
    resp = requests.get(_API_URL, headers={"X-Api-Key": token}, timeout=180)
    resp.raise_for_status()
    dest.write_bytes(resp.content)
    return dest


def to_de_fgb(src_json: Path, fgb: Path) -> tuple[Path, int]:
    """Reprojiziert 31370->4326, filtert auf die DE-Bbox, schreibt FlatGeobuf.

    Behält nur `oidn` (Segment-ID). Gibt (fgb, feature_count) zurück. Reiner
    Geo-Schritt ohne Netz — gut testbar.
    """
    import geopandas as gpd
    from shapely.geometry import shape

    data = json.loads(src_json.read_text(encoding="utf-8"))
    feats = data["features"]
    gdf = gpd.GeoDataFrame(
        {"oidn": [f["properties"]["oidn"] for f in feats]},
        geometry=[shape(f["geometry"]) for f in feats],
        crs=_SOURCE_CRS,
    ).to_crs("EPSG:4326")

    lon0, lat0, lon1, lat1 = _DE_BBOX
    pts = gdf.geometry.representative_point()
    mask = (pts.x >= lon0) & (pts.x <= lon1) & (pts.y >= lat0) & (pts.y <= lat1)
    gdf = gdf[mask].reset_index(drop=True)
    if gdf.empty:
        raise ValueError("Keine Segmente in der DE-Bbox")

    fgb.parent.mkdir(parents=True, exist_ok=True)
    gdf.to_file(fgb, driver="FlatGeobuf")
    return fgb, len(gdf)


def build(*, dry_run: bool = False) -> Path:
    """Voller Telraam-Build: fetch (falls nötig) -> DE-FGB -> PMTiles.

    Layer-/Dateiname = Frontend-Vertrag (siehe sources.yaml / addSources.js).
    """
    src = _raw() / "segments_all.json"
    if not src.exists() and not dry_run:
        src = fetch()

    out = get_paths().data / _dataset()["file"]
    fgb = _raw() / "telraam_segments_de.fgb"
    if dry_run or not src.exists():
        print("  [skip] Reprojektion/Filter (kein JSON / dry-run)")
    else:
        _, n = to_de_fgb(src, fgb)
        print(f"  DE-Segmente: {n}")
    return tiles.tippecanoe(
        "telraam_segments", fgb, out, layer_override="telraam_segments", dry_run=dry_run
    )
