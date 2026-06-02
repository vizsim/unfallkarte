"""OSM-Kontextlayer: Geofabrik laden, mit osmium vorfiltern, dann Tippecanoe.

Der osmium-Vorfilter schneidet die ~4 GB Deutschland-PBF streaming auf kleine
Kategorie-PBFs runter. Daraus werden die gewünschten OSM-Layer (points/
multipolygons/lines) DIREKT mit pyogrio gelesen (GDAL-OSM-Treiber, KEIN ogr2ogr/
GPKG/GeoJSON-Zwischenschritt), gefiltert und nach FlatGeobuf geschrieben, dann
getilet. Profile/Filter stehen in config/osm.yaml. osmium/tippecanoe werden bei
dry_run oder fehlendem Binary nur ausgegeben.
"""

from __future__ import annotations

import os
import subprocess
from pathlib import Path
from shutil import which
from typing import Any

import requests

from unfallkarte import tiles
from unfallkarte.config import get_paths, load_yaml

_CFG = "osm.yaml"


def _config() -> dict[str, Any]:
    return load_yaml(_CFG)


def _osmconf_path(name: str) -> Path:
    return get_paths().config / "osmconf" / name


def _raw() -> Path:
    return get_paths().raw / "osm"


def _run(cmd: list[str], *, dry_run: bool, env: dict[str, str] | None = None) -> None:
    printable = " ".join(cmd)
    if dry_run or which(cmd[0]) is None:
        reason = "dry-run" if dry_run else f"'{cmd[0]}' nicht installiert"
        print(f"  [{reason}] {printable}")
        return
    print(f"  $ {printable}")
    subprocess.run(cmd, check=True, env=env)


def fetch(*, force: bool = False) -> Path:
    """Lädt germany-latest.osm.pbf von Geofabrik nach data/raw/osm/."""
    cfg = _config()["geofabrik"]
    _raw().mkdir(parents=True, exist_ok=True)
    dest = _raw() / cfg["pbf"]
    if dest.exists() and not force:
        print(f"  vorhanden: {dest}")
        return dest
    print(f"  lade {cfg['url']}")
    with requests.get(cfg["url"], stream=True, timeout=600) as resp:
        resp.raise_for_status()
        with open(dest, "wb") as fh:
            for chunk in resp.iter_content(chunk_size=1 << 20):
                fh.write(chunk)
    return dest


def data_date(pbf: Path) -> str | None:
    """Datenstand der PBF via `osmium fileinfo` (YYYY-MM-DD). None wenn nicht ermittelbar."""
    if which("osmium") is None or not pbf.exists():
        return None
    out = subprocess.run(
        ["osmium", "fileinfo", "-e", "-g", "data.timestamp.last", str(pbf)],
        check=True, capture_output=True, text=True,
    ).stdout.strip()
    return out[:10] or None  # "2025-05-28T..." -> "2025-05-28"


def tags_filter(pbf: Path, expressions: list[str], out_pbf: Path, *, dry_run: bool = False) -> Path:
    out_pbf.parent.mkdir(parents=True, exist_ok=True)
    cmd = ["osmium", "tags-filter", "--overwrite", str(pbf), *expressions, "-o", str(out_pbf)]
    _run(cmd, dry_run=dry_run)
    return out_pbf


def _filter_and_merge(frames: list, tag_filters: dict[str, list[str]]):
    """Filtert je GeoDataFrame per tag_filters (OR über Tags) und merged zu einem.
    Reiner pandas/geopandas-Schritt ohne IO — gut testbar."""
    import geopandas as gpd
    import pandas as pd

    kept: list = []
    for gdf in frames:
        if tag_filters:
            mask = pd.Series(False, index=gdf.index)
            for tag, allowed in tag_filters.items():
                if tag in gdf.columns:
                    mask |= gdf[tag].isin(allowed)
            gdf = gdf[mask]
        if len(gdf):
            kept.append(gdf)
    if not kept:
        raise ValueError("Keine Features nach Filter")
    return gpd.GeoDataFrame(pd.concat(kept, ignore_index=True), crs=kept[0].crs)


def pbf_layers_to_fgb(
    pbf: Path,
    fgb: Path,
    layers: list[str],
    tag_filters: dict[str, list[str]],
    osmconf: str | None = None,
) -> Path:
    """Liest OSM-Layer (z.B. points + multipolygons) DIREKT aus der gefilterten PBF
    (GDAL-OSM-Treiber via pyogrio), filtert per tag_filters und schreibt FlatGeobuf.

    Kein ogr2ogr/GPKG-Zwischenschritt: der OSM-Treiber liefert die Layer direkt.
    Wichtig: OGR_INTERLEAVED_READING NICHT auf YES zwingen (Default liefert die
    Features, YES → 0). `osmconf` wird via OSM_CONFIG_FILE beim Lesen angewandt.
    """
    from pyogrio import list_layers, read_dataframe

    env_key = "OSM_CONFIG_FILE"
    prev = os.environ.get(env_key)
    if osmconf:
        os.environ[env_key] = str(_osmconf_path(osmconf))
    try:
        available = {row[0] for row in list_layers(pbf)}
        frames = [read_dataframe(pbf, layer=lyr) for lyr in layers if lyr in available]
    finally:
        if osmconf:
            if prev is None:
                os.environ.pop(env_key, None)
            else:
                os.environ[env_key] = prev

    merged = _filter_and_merge(frames, tag_filters)
    fgb.parent.mkdir(parents=True, exist_ok=True)
    merged.to_file(fgb, driver="FlatGeobuf")
    return fgb


def _build_layer(name: str, spec: dict[str, Any], pbf: Path, *, dry_run: bool) -> Path:
    """Ein OSM-Layer: osmium-Vorfilter -> PBF-Layer direkt nach FGB -> Tippecanoe.

    Einheitlich für POI (osm_layers points+multipolygons, mit tag_filters) und
    Linien (osm_layers lines, ohne tag_filters) — der osmium-Filter selektiert dort
    schon die Ways, daher kein zusätzlicher tag_filter nötig.
    """
    raw = _raw()
    cat_pbf = tags_filter(pbf, spec["osmium_filter"], raw / f"{name}.osm.pbf", dry_run=dry_run)
    fgb = raw / f"{name}.fgb"
    if dry_run or not cat_pbf.exists():
        print(f"  [skip] PBF-Layer {spec['osm_layers']} -> {fgb.name} direkt (kein PBF / dry-run)")
    else:
        pbf_layers_to_fgb(
            cat_pbf, fgb, spec["osm_layers"], spec.get("tag_filters", {}), spec.get("osmconf")
        )
    out = get_paths().data / spec["output"]
    return tiles.tippecanoe(
        spec["tile_profile"], fgb, out, layer_override=spec["tippecanoe_layer"], dry_run=dry_run
    )


def build(layer: str | None = None, *, dry_run: bool = False) -> dict[str, Path]:
    """Baut einen oder alle OSM-Layer. Setzt eine vorhandene Geofabrik-PBF voraus
    (sonst erst `osm fetch`)."""
    cfg = _config()
    pbf = _raw() / cfg["geofabrik"]["pbf"]
    if not dry_run and not pbf.exists():
        raise FileNotFoundError(f"PBF fehlt: {pbf} — erst `unfallkarte osm fetch`.")

    names = list(cfg["layers"]) if layer in (None, "all") else [layer]
    results: dict[str, Path] = {}
    for name in names:
        print(f"OSM-Layer: {name}")
        results[name] = _build_layer(name, cfg["layers"][name], pbf, dry_run=dry_run)
    return results
