"""Tippecanoe-/tile-join-Wrapper + Accident-Tiles-Build.

Profile stehen in config/tiles.yaml (keine kopierten Argumentlisten). Wenn die
Binaries fehlen oder dry_run=True, werden die Kommandos nur ausgegeben statt
ausgeführt — so kannst du die Pipeline auch ohne installiertes tippecanoe prüfen.
"""

from __future__ import annotations

import gzip
import json
import shutil
import subprocess
from pathlib import Path
from shutil import which
from typing import Any

from unfallkarte.config import get_paths, load_yaml, repo_root

_CFG = "tiles.yaml"

# Formatwechsel MVT -> MLT (docs/MLT_EVALUATION.md): ein Node-Werkzeug im Repo-Root, weil es die
# npm-Abhängigkeiten des Frontends nutzt (@maplibre/mlt exakt gepinnt = Decoder in MapLibre).
MVT_TO_MLT = repo_root().parent / "tools" / "mlt" / "mvt-to-mlt.mjs"


def _profiles() -> dict[str, Any]:
    return load_yaml(_CFG)["profiles"]


def _profile_args(profile: dict[str, Any], layer_override: str | None = None) -> list[str]:
    """Übersetzt ein Profil-Dict in tippecanoe-Flags (ohne -o/Input)."""
    args: list[str] = ["--force"]
    layer = layer_override or profile.get("layer")
    if layer:
        args += ["-l", layer]
    # Attribut-Diät: -y hält NUR die genannten Felder, -x wirft die genannten weg.
    # Die Quell-Dateien tragen oft weit mehr Spalten, als das Frontend liest — jedes
    # ungelesene Attribut kostet in JEDEM Feature Platz im Tile (siehe docs/PERFORMANCE_PLAN.md).
    for key in profile.get("include", []):
        args += ["-y", key]
    for key in profile.get("exclude", []):
        args += ["-x", key]
    if "minzoom" in profile:
        args.append(f"--minimum-zoom={profile['minzoom']}")
    if "maxzoom" in profile:
        args.append(f"--maximum-zoom={profile['maxzoom']}")
    if "base_zoom" in profile:
        args.append(f"--base-zoom={profile['base_zoom']}")
    if "full_detail" in profile:
        # Koordinatenauflösung am maxzoom (Default 12 = 4096 Einheiten je Kachel). Höher, wenn
        # Geometrie weit überzoomt wird und Ecken sonst sichtbar auf ein grobes Raster springen.
        args.append(f"--full-detail={profile['full_detail']}")
    if profile.get("no_tiny_polygon_reduction"):
        # Kleine Polygone NICHT zu Ersatzquadraten zusammenfassen (Gitterzellen bei kleinem Zoom).
        args.append("--no-tiny-polygon-reduction")
    if "drop_rate" in profile:
        args.append(f"--drop-rate={profile['drop_rate']}")
    if "simplification" in profile:
        # DP-Vereinfachung bei Zooms < maxzoom (höher = stärker) → weniger Stützpunkte,
        # kleinere Tiles, ohne Features zu droppen.
        args.append(f"--simplification={profile['simplification']}")
    if profile.get("drop_densest_as_needed"):
        args.append("--drop-densest-as-needed")
    if profile.get("coalesce"):
        args.append("--coalesce")
    if profile.get("coalesce_densest_as_needed"):
        args.append("--coalesce-densest-as-needed")
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
    if "feature_filter" in profile:
        # tippecanoe -j: per-Layer GL-Filter (unterstützt "$zoom") → zoom-abhängiges Droppen.
        args += ["-j", json.dumps(profile["feature_filter"], separators=(",", ":"))]
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
    overrides: dict[str, Any] | None = None,
    dry_run: bool = False,
) -> Path:
    """`overrides` ersetzt einzelne Profil-Schlüssel (z. B. erst zur Laufzeit bekannte
    accumulate-/include-Listen), ohne das Profil zu kopieren."""
    profile = {**_profiles()[profile_name], **(overrides or {})}
    output_path.parent.mkdir(parents=True, exist_ok=True)
    cmd = [
        "tippecanoe", "-o", str(output_path),
        *_profile_args(profile, layer_override), str(input_path),
    ]
    _run(cmd, dry_run=dry_run)
    return output_path


def tile_join(
    output_path: Path,
    inputs: list[Path],
    *,
    no_tile_size_limit: bool = False,
    dry_run: bool = False,
) -> Path:
    """`no_tile_size_limit`: tile-join überspringt Kacheln > 500 KB sonst STUMM."""
    output_path.parent.mkdir(parents=True, exist_ok=True)
    cmd = ["tile-join", "--force", "-o", str(output_path)]
    if no_tile_size_limit:
        cmd.append("--no-tile-size-limit")
    cmd += [str(p) for p in inputs]
    _run(cmd, dry_run=dry_run)
    return output_path


def mvt_to_mlt(src: Path, dst: Path, *, dry_run: bool = False) -> Path:
    """MVT-PMTiles (tippecanoe) -> MLT-PMTiles. Es ändert sich nur das Kachelformat; das Werkzeug
    liest jede Kachel zurück, vergleicht sie mit dem Original und bricht bei Abweichung ab."""
    dst.parent.mkdir(parents=True, exist_ok=True)
    _run(["node", str(MVT_TO_MLT), str(src), str(dst)], dry_run=dry_run)
    return dst


def convert_accident_tiles_to_mlt(*, dry_run: bool = False) -> Path | None:
    """Einzel-Unfälle nach MLT, wenn `accidents_build.single_mlt_output` gesetzt ist.

    Eigener CLI-Schritt (`unfallkarte accidents mlt`), damit sich das Format ohne erneutes
    Tilen (~2 min tippecanoe + GeoJSON-Export) umstellen lässt.
    """
    cfg = load_yaml(_CFG)["accidents_build"]
    if not cfg.get("single_mlt_output"):
        return None
    out_dir = get_paths().out("accidents")
    src, dst = out_dir / cfg["single_output"], out_dir / cfg["single_mlt_output"]
    return mvt_to_mlt(src, dst, dry_run=dry_run)


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


def write_cluster_modes_geojson(
    parquet: Path, out_gz: Path, columns: list[str], beteiligung_bits: list[str]
) -> list[str]:
    """Dünn besetztes, zeilenweises GeoJSON für die Merkmals-Cluster (siehe tiles.yaml,
    `cluster_modes_*`): je Unfall nur `<SPALTE>__<wert>: 1` und `BET__<bitmaske>: 1`.

    Gibt die vorkommenden Feldnamen zurück (= accumulate-/include-Liste für tippecanoe).
    """
    import geopandas as gpd
    import numpy as np
    import pandas as pd

    gdf = gpd.read_parquet(parquet, columns=[*columns, *beteiligung_bits, "geometry"])
    props = pd.Series("", index=gdf.index)
    fields: set[str] = set()
    for col in columns:
        values = gdf[col].astype(int).astype(str)
        props += f'"{col}__' + values + '":1,'
        fields.update(f"{col}__{v}" for v in values.unique())

    mask = np.zeros(len(gdf), dtype=np.int64)
    for bit, col in enumerate(beteiligung_bits):
        mask |= (gdf[col].to_numpy() == 1).astype(np.int64) << bit
    bet = pd.Series(mask, index=gdf.index)
    has_bet = bet > 0  # ohne jede Beteiligung: kein BET-Feld (zählt dann zu keiner Auswahl)
    props[has_bet] += '"BET__' + bet[has_bet].astype(str) + '":1,'
    fields.update(f"BET__{m}" for m in bet[has_bet].unique())

    lon = gdf.geometry.x.round(6).astype(str)
    lat = gdf.geometry.y.round(6).astype(str)
    lines = ('{"type":"Feature","geometry":{"type":"Point","coordinates":[' + lon + "," + lat
             + ']},"properties":{' + props.str.rstrip(",") + "}}\n")

    out_gz.parent.mkdir(parents=True, exist_ok=True)
    with gzip.open(out_gz, "wt", encoding="utf-8") as fh:
        fh.writelines(lines)
    return sorted(fields)


def build_cluster_modes(parquet: Path, *, dry_run: bool = False) -> Path:
    """Merkmals-Cluster (cluster_modes.pmtiles): gleiche Profile wie die Schwere-Cluster,
    aber mit einer Summe je Merkmalswert. Eigene Datei, damit der Kartenstart sie nicht lädt."""
    cfg = load_yaml(_CFG)["accidents_build"]
    paths = get_paths()
    raw = paths.raw / "accidents"
    src = raw / cfg["cluster_modes_geojson"]

    if dry_run:
        fields = ["<SPALTE>__<wert>"]
    else:
        fields = write_cluster_modes_geojson(
            parquet, src, cfg["cluster_modes_columns"], cfg["beteiligung_bits"]
        )
        print(f"  {len(fields)} Summen-Felder je Cluster möglich")
    overrides = {"accumulate": [f"{f}:sum" for f in fields], "include": fields}

    parts: list[Path] = []
    for prof in cfg["cluster_profiles"]:
        part = raw / f"_tmp_modes_{prof}.pmtiles"
        tippecanoe(prof, src, part, overrides=overrides, dry_run=dry_run)
        parts.append(part)
    out = tile_join(paths.out("accidents") / cfg["cluster_modes_output"], parts,
                    no_tile_size_limit=True, dry_run=dry_run)
    if not dry_run:
        for part in parts:
            part.unlink(missing_ok=True)
    return out


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
    result = tile_join(output, tmp_parts, dry_run=dry_run)
    if not dry_run:  # Zwischen-PMTiles entfernen (sollen nicht ins Deploy)
        for part in tmp_parts:
            part.unlink(missing_ok=True)
    return result


def build_accident_tiles(parquet: Path, *, dry_run: bool = False) -> dict[str, Path]:
    """Voller Accident-Tiles-Build: grouped GeoJSON -> single + Cluster-PMTiles.

    Reproduziert accidents_single.pmtiles und combined_cluster.pmtiles, dazu die MLT-Variante
    der Einzel-Unfälle, falls konfiguriert (die MVT-Datei bleibt als Eingabe und für noch
    gecachte alte Seiten bestehen).
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
    if not dry_run:  # Zwischen-Cluster-PMTiles entfernen
        for part in tmp_parts:
            part.unlink(missing_ok=True)

    out = {"single": single, "cluster": combined}
    if cfg.get("cluster_modes_output"):
        out["cluster_modes"] = build_cluster_modes(parquet, dry_run=dry_run)
    single_mlt = convert_accident_tiles_to_mlt(dry_run=dry_run)
    if single_mlt:
        out["single_mlt"] = single_mlt
    return out
