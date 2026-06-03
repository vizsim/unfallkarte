"""Tippecanoe-/tile-join-Wrapper + Accident-Tiles-Build.

Profile stehen in config/tiles.yaml (keine kopierten Argumentlisten). Wenn die
Binaries fehlen oder dry_run=True, werden die Kommandos nur ausgegeben statt
ausgeführt — so kannst du die Pipeline auch ohne installiertes tippecanoe prüfen.
"""

from __future__ import annotations

import gzip
import shutil
import subprocess
from pathlib import Path
from shutil import which
from typing import Any

from unfallkarte.config import get_paths, load_yaml

_CFG = "tiles.yaml"


def _profiles() -> dict[str, Any]:
    return load_yaml(_CFG)["profiles"]


def _profile_args(profile: dict[str, Any], layer_override: str | None = None) -> list[str]:
    """Übersetzt ein Profil-Dict in tippecanoe-Flags (ohne -o/Input)."""
    args: list[str] = ["--force"]
    layer = layer_override or profile.get("layer")
    if layer:
        args += ["-l", layer]
    if "minzoom" in profile:
        args.append(f"--minimum-zoom={profile['minzoom']}")
    if "maxzoom" in profile:
        args.append(f"--maximum-zoom={profile['maxzoom']}")
    if "base_zoom" in profile:
        args.append(f"--base-zoom={profile['base_zoom']}")
    if "drop_rate" in profile:
        args.append(f"--drop-rate={profile['drop_rate']}")
    if profile.get("drop_densest_as_needed"):
        args.append("--drop-densest-as-needed")
    if "cluster_distance" in profile:
        args.append(f"--cluster-distance={profile['cluster_distance']}")
    for acc in profile.get("accumulate", []):
        args.append(f"--accumulate-attribute={acc}")
    if profile.get("no_feature_limit"):
        args.append("--no-feature-limit")
    if profile.get("no_tile_size_limit"):
        args.append("--no-tile-size-limit")
    if profile.get("force_feature_limit"):
        args.append("--force-feature-limit")
    if "maximum_tile_bytes" in profile:
        args.append(f"--maximum-tile-bytes={profile['maximum_tile_bytes']}")
    return args


def _run(cmd: list[str], *, dry_run: bool) -> None:
    printable = " ".join(cmd)
    if dry_run or which(cmd[0]) is None:
        reason = "dry-run" if dry_run else f"'{cmd[0]}' nicht installiert"
        print(f"  [{reason}] {printable}")
        return
    print(f"  $ {printable}")
    subprocess.run(cmd, check=True)


def tippecanoe(
    profile_name: str,
    input_path: Path,
    output_path: Path,
    *,
    layer_override: str | None = None,
    dry_run: bool = False,
) -> Path:
    profile = _profiles()[profile_name]
    output_path.parent.mkdir(parents=True, exist_ok=True)
    cmd = [
        "tippecanoe", "-o", str(output_path),
        *_profile_args(profile, layer_override), str(input_path),
    ]
    _run(cmd, dry_run=dry_run)
    return output_path


def tile_join(output_path: Path, inputs: list[Path], *, dry_run: bool = False) -> Path:
    output_path.parent.mkdir(parents=True, exist_ok=True)
    cmd = ["tile-join", "--force", "-o", str(output_path), *[str(p) for p in inputs]]
    _run(cmd, dry_run=dry_run)
    return output_path


def write_grouped_geojson(parquet: Path, out_gz: Path) -> Path:
    """Liest das Unfall-Parquet, fügt UKATEGORIE__1/2/3 (One-Hot) hinzu und schreibt
    gezipptes GeoJSON für tippecanoe (Cluster-Akkumulation + Tortendiagramme)."""
    import geopandas as gpd

    gdf = gpd.read_parquet(parquet)
    for k in (1, 2, 3):
        gdf[f"UKATEGORIE__{k}"] = (gdf["UKATEGORIE"] == k).astype(int)

    out_gz.parent.mkdir(parents=True, exist_ok=True)
    tmp = out_gz.with_suffix("")  # ohne .gz
    gdf.to_file(tmp, driver="GeoJSON")
    with open(tmp, "rb") as f_in, gzip.open(out_gz, "wb") as f_out:
        shutil.copyfileobj(f_in, f_out)
    tmp.unlink(missing_ok=True)
    return out_gz


def build_dual_layer(
    points_fgb: Path,
    polys_fgb: Path,
    output: Path,
    *,
    points_layer: str,
    polys_layer: str,
    dry_run: bool = False,
) -> Path:
    """Szenario-Output: Punkte- + Polygon-Layer getrennt tilen, dann tile-join.

    Punkte tragen bei niedrigem Zoom, Polygone bei hohem Zoom (siehe Profile).
    """
    return build_multi_layer(
        [
            (points_fgb, points_layer, "scenario_points"),
            (polys_fgb, polys_layer, "scenario_polys"),
        ],
        output,
        dry_run=dry_run,
    )


def build_multi_layer(
    layers: list[tuple[Path, str, str]], output: Path, *, dry_run: bool = False
) -> Path:
    """Mehrere FGB getrennt tilen, dann per tile-join zu einem PMTiles vereinen.

    layers = Liste von (fgb, layer_name, profile_name). Layer-Namen = Frontend-Vertrag.
    """
    tmp_parts: list[Path] = []
    for i, (fgb, layer_name, profile) in enumerate(layers):
        part = output.with_name(f"{output.stem}_tmp{i}.pmtiles")
        tippecanoe(profile, fgb, part, layer_override=layer_name, dry_run=dry_run)
        tmp_parts.append(part)
    return tile_join(output, tmp_parts, dry_run=dry_run)


def build_accident_tiles(parquet: Path, *, dry_run: bool = False) -> dict[str, Path]:
    """Voller Accident-Tiles-Build: grouped GeoJSON -> single + Cluster-PMTiles.

    Reproduziert accidents_single.pmtiles und combined_cluster.pmtiles.
    """
    cfg = load_yaml(_CFG)["accidents_build"]
    paths = get_paths()
    raw = paths.raw / "accidents"
    out_dir = paths.out("accidents")

    grouped = write_grouped_geojson(parquet, raw / cfg["grouped_geojson"])

    single = tippecanoe(
        "accidents_single", grouped, out_dir / cfg["single_output"], dry_run=dry_run
    )

    tmp_parts: list[Path] = []
    for prof in cfg["cluster_profiles"]:
        part = raw / f"_tmp_{prof}.pmtiles"
        tippecanoe(prof, grouped, part, dry_run=dry_run)
        tmp_parts.append(part)
    combined = tile_join(out_dir / cfg["cluster_output"], tmp_parts, dry_run=dry_run)

    return {"single": single, "cluster": combined}
