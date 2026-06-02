"""OSM-Kontextlayer: Geofabrik laden, mit osmium vorfiltern, via ogr2ogr nach
fgb/GeoJSON, dann Tippecanoe.

Der osmium-Vorfilter schneidet die ~4 GB Deutschland-PBF streaming auf kleine
Kategorie-PBFs runter, bevor der schwere ogr2ogr-Schritt läuft. Profile/Filter
stehen in config/osm.yaml. Binär-Schritte (osmium/ogr2ogr/tippecanoe) werden bei
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


def _ogr2ogr(args: list[str], osmconf: str | None, *, dry_run: bool) -> None:
    env = os.environ.copy()
    if osmconf:
        env["OSM_CONFIG_FILE"] = str(_osmconf_path(osmconf))
    _run(["ogr2ogr", *args], dry_run=dry_run, env=env)


def filter_gpkg_to_fgb(
    gpkg: Path, fgb: Path, layers: list[str], tag_filters: dict[str, list[str]]
) -> Path:
    """Liest die gewünschten GPKG-Layer, filtert per tag_filters (OR über Tags),
    schreibt nach FlatGeobuf. (Reiner geopandas-Schritt — gut testbar.)"""
    import geopandas as gpd
    import pandas as pd
    from pyogrio import list_layers

    available = {row[0] for row in list_layers(gpkg)}
    frames: list[gpd.GeoDataFrame] = []
    for layer in layers:
        if layer not in available:
            continue
        gdf = gpd.read_file(gpkg, layer=layer)
        if tag_filters:
            mask = pd.Series(False, index=gdf.index)
            for tag, allowed in tag_filters.items():
                if tag in gdf.columns:
                    mask |= gdf[tag].isin(allowed)
            gdf = gdf[mask]
        if len(gdf):
            frames.append(gdf)
    if not frames:
        raise ValueError(f"Keine Features nach Filter in {gpkg}")
    merged = gpd.GeoDataFrame(pd.concat(frames, ignore_index=True), crs=frames[0].crs)
    fgb.parent.mkdir(parents=True, exist_ok=True)
    merged.to_file(fgb, driver="FlatGeobuf")
    return fgb


def _build_poi(name: str, spec: dict[str, Any], pbf: Path, *, dry_run: bool) -> Path:
    raw = _raw()
    cat_pbf = tags_filter(pbf, spec["osmium_filter"], raw / f"{name}.osm.pbf", dry_run=dry_run)
    gpkg = raw / f"{name}.gpkg"
    _ogr2ogr(
        ["-overwrite", "-f", "GPKG", str(gpkg), str(cat_pbf)],
        spec.get("osmconf"), dry_run=dry_run,
    )
    fgb = raw / f"{name}.fgb"
    if dry_run or not gpkg.exists():
        print(f"  [skip] filter_gpkg_to_fgb {gpkg.name} -> {fgb.name} (kein GPKG / dry-run)")
    else:
        filter_gpkg_to_fgb(gpkg, fgb, spec["gpkg_layers"], spec.get("tag_filters", {}))
    out = get_paths().data / spec["output"]
    return tiles.tippecanoe(
        spec["tile_profile"], fgb, out, layer_override=spec["tippecanoe_layer"], dry_run=dry_run
    )


def _build_line(name: str, spec: dict[str, Any], pbf: Path, *, dry_run: bool) -> Path:
    raw = _raw()
    cat_pbf = tags_filter(pbf, spec["osmium_filter"], raw / f"{name}.osm.pbf", dry_run=dry_run)
    geojson = raw / f"{name}.geojson.gz"
    _ogr2ogr(
        ["-f", "GeoJSON", str(geojson), str(cat_pbf), spec["ogr_layer"]],
        spec.get("osmconf"), dry_run=dry_run,
    )
    out = get_paths().data / spec["output"]
    return tiles.tippecanoe(
        spec["tile_profile"], geojson, out, layer_override=spec["tippecanoe_layer"], dry_run=dry_run
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
        spec = cfg["layers"][name]
        print(f"OSM-Layer: {name} ({spec['kind']})")
        if spec["kind"] == "poi":
            results[name] = _build_poi(name, spec, pbf, dry_run=dry_run)
        elif spec["kind"] == "line":
            results[name] = _build_line(name, spec, pbf, dry_run=dry_run)
        else:
            raise ValueError(f"{name}: unbekanntes kind '{spec['kind']}'")
    return results
