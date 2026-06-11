# SPDX-License-Identifier: AGPL-3.0-or-later
"""OpenBikeSensor-Kontextlayer: Überholabstände aus den Community-Portalen.

Pipeline:
  1. fetch    -> je öffentlichem OBS-Portal `api/export/events` (DACH-Bbox) als GeoJSON
                 nach data/raw/obs/. Tote/umgezogene Portale werden übersprungen.
  2. assemble -> alle Portal-Snapshots zusammenführen, Mehrfach-Uploads dedupen,
                 auf das Bundesgebiet clippen, schlanke Spalten -> FlatGeobuf.
  3. tiles    -> PMTiles (interner Layer `obs_data-points` = Frontend-Vertrag).

Properties im Output: distance_overtaker, distance_stationary, speed, zone, portal.
Das Frontend färbt/filtert nach `distance_overtaker`+`zone` und zeigt Speed/Zone im Popup.
"""

from __future__ import annotations

import json
import re
from pathlib import Path

import requests

from unfallkarte import tiles
from unfallkarte.config import get_paths, load_yaml

# Riesige DACH-Bbox (OBS-Reihenfolge: West, Nord, Ost, Süd) — danach auf DE geclippt.
_DACH_BBOX = "-0.19922377649033446,58.13748613913617,20.921758549385075,43.25705589043925"
# Dedup-Schlüssel: dieselbe Messung kann auf mehreren Portalen liegen.
_DEDUP_KEYS = ["distance_overtaker", "time", "geometry"]
# Output-Spalten (schlank halten -> kleinere Tiles); `time` nur intern zum Dedupen.
_KEEP = ["distance_overtaker", "distance_stationary", "speed", "zone", "portal"]
_RATE_SLEEP = 0.3


def _raw() -> Path:
    return get_paths().raw / "obs"


def _dataset() -> dict:
    return load_yaml("sources.yaml")["datasets"]["obs"]


def _slug(url: str) -> str:
    """Stabiler Kurzname je Portal (Dateiname + `portal`-Spalte)."""
    host = url.split("://", 1)[-1].strip("/").lower()
    if "pub.solar" in host:  # obs-portal.pub.solar = Köln (wie Alt-Notebook)
        return "obs-portal-koeln"
    host = re.sub(r"^(obs\.|portal\.)", "", host)
    host = re.sub(r"\.(de|org|at|fr)$", "", host)
    return re.sub(r"[^a-z0-9]+", "-", host).strip("-")


# --- 1) Fetch je Portal ----------------------------------------------------
def _export_url(portal: str) -> str:
    base = portal if portal.endswith("/") else portal + "/"
    return f"{base}api/export/events?bbox={_DACH_BBOX}&fmt=geojson"


def fetch(*, force: bool = False) -> list[Path]:
    """Zieht je Portal den GeoJSON-Export. Robust: ein totes Portal (404/Timeout/
    kein JSON) wird mit Warnung übersprungen, statt den Lauf abzubrechen."""
    _raw().mkdir(parents=True, exist_ok=True)
    portals: list[str] = _dataset()["portals"]
    written: list[Path] = []
    for portal in portals:
        dest = _raw() / f"portal_{_slug(portal)}.geojson"
        if dest.exists() and not force:
            print(f"  vorhanden: {dest.name}")
            written.append(dest)
            continue
        try:
            resp = requests.get(_export_url(portal), timeout=180)
            resp.raise_for_status()
            data = resp.json()
            if not (isinstance(data, dict) and isinstance(data.get("features"), list)):
                raise ValueError("kein FeatureCollection")
        except (requests.RequestException, ValueError, json.JSONDecodeError) as exc:
            print(f"  ! übersprungen {portal}: {exc}")
            continue
        dest.write_text(json.dumps(data), encoding="utf-8")
        print(f"  {dest.name}: {len(data['features'])} Features")
        written.append(dest)
    return written


# --- 2) Assemblierung (netzfrei -> testbar) --------------------------------
def dedupe(gdf):
    """Mehrfach-Uploads (gleiche Messung auf mehreren Portalen) entfernen."""
    keys = [k for k in _DEDUP_KEYS if k in gdf.columns or k == "geometry"]
    return gdf.drop_duplicates(subset=keys).copy()


def clip_to(gdf, boundary):
    """Punkte auf das Boundary-Polygon beschränken (topologisch -> 4326 ok)."""
    import geopandas as gpd

    if gdf.crs != boundary.crs:
        boundary = boundary.to_crs(gdf.crs)
    hit = gpd.sjoin(gdf, boundary[["geometry"]], predicate="within", how="inner")
    return hit.drop(columns=[c for c in hit.columns if c.startswith("index_right")])


def _germany_boundary():
    """DE-Außengrenze (low-res, gecacht) als ein GeoDataFrame in EPSG:4326."""
    import geopandas as gpd

    cache = _raw() / "germany.geojson"
    if not cache.exists():
        url = _dataset()["boundary_url"]
        print(f"  lade DE-Grenze {url}")
        resp = requests.get(url, timeout=60)
        resp.raise_for_status()
        cache.write_bytes(resp.content)
    gdf = gpd.read_file(cache).to_crs("EPSG:4326")
    return gdf.dissolve()[["geometry"]]


def assemble_fgb(raw_dir: Path, fgb: Path) -> tuple[Path, int]:
    """Alle portal_*.geojson -> dedupen -> DE-Clip -> schlanke FlatGeobuf."""
    import geopandas as gpd
    import pandas as pd

    parts = []
    for f in sorted(raw_dir.glob("portal_*.geojson")):
        g = gpd.read_file(f)
        if g.empty:
            continue
        g["portal"] = f.stem.removeprefix("portal_")
        parts.append(g)
    if not parts:
        raise ValueError("keine Portal-GeoJSONs in data/raw/obs/ (erst `obs fetch`)")

    gdf = gpd.GeoDataFrame(pd.concat(parts, ignore_index=True), crs="EPSG:4326")
    gdf = clip_to(dedupe(gdf), _germany_boundary())

    cols = [c for c in _KEEP if c in gdf.columns]
    gdf = gpd.GeoDataFrame(gdf[[*cols, "geometry"]], crs="EPSG:4326").reset_index(drop=True)
    fgb.parent.mkdir(parents=True, exist_ok=True)
    gdf.to_file(fgb, driver="FlatGeobuf")
    return fgb, len(gdf)


# --- 3) Build ---------------------------------------------------------------
def build(*, refresh: bool = False, dry_run: bool = False) -> Path:
    """Voller Build: fetch (gecacht, force=refresh) -> FGB -> PMTiles.

    Layer-/Dateiname = Frontend-Vertrag (`obs_data-points` / obs/obs_data.pmtiles).
    """
    raw = _raw()
    if not dry_run:
        fetch(force=refresh)

    out = get_paths().data / _dataset()["file"]
    fgb = raw / "obs_points.fgb"
    if dry_run or not any(raw.glob("portal_*.geojson")):
        print("  [skip] Assemblierung (keine Rohdaten / dry-run)")
    else:
        _, n = assemble_fgb(raw, fgb)
        print(f"  OBS-Punkte (DE, dedupliziert): {n}")
    return tiles.tippecanoe("obs_points", fgb, out, dry_run=dry_run)
