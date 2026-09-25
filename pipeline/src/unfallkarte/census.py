# SPDX-License-Identifier: AGPL-3.0-or-later
"""Zensus 2022, 100-m-Gitter → Parquet (Pipeline-Eingang) + PMTiles (Kontextlayer „Einwohner").

Reproduziert die Kette, die bis 2026-09 außerhalb dieser Pipeline lief (Herkunft in
docs/TODO.md):
  1. npgeo-Hub (vfdb): Zensus-2022-Gitter 100 m mit ~45 Merkmalen + Gemeindeschlüssel `ags`
  2. erreichbarad `1aa_add_plz_to_pop_ger_v03_regiosta.ipynb`: Zellmitte `within` PLZ-Gebiet
     -> `plz`; RegioStaR 2023 über `ags` == `gem_23` (INNER Join) -> `name_23`, `RegioStaR7`
  3. routing_bulk `prepare_population.ipynb`: nur `Einwohner > 0`, FGB -> tippecanoe z9–10

Rohdaten in data/raw/census/ (Dateinamen in sources.yaml, census_population.raw). Das npgeo-
Gitter und der PLZ-Stand sind nicht mehr sicher neu beschaffbar — Archivkopien, nicht löschen.

Verifiziert 2026-09-25 gegen das Original-Parquet: 3.081.328 Zeilen, Reihenfolge, Spalten,
Datentypen, Werte und Geometrien identisch. Die Zellmitte wird dafür wie im Notebook als
Schwerpunkt des Web-Mercator-Polygons gebildet (nicht exakt aus der Gitter-ID, EPSG:3035): beide
liegen < 1 mm auseinander, aber eine Zelle in München sitzt 1 mm neben der PLZ-Grenze
81543/81545 und kippt sonst im Rundungsrauschen.

Frontend-Vertrag (js/layers/context-population.js): Datei census/population_100m.pmtiles,
Layer `rasters-polys`, Felder Einwohner/Unter18/AnteilUnter18/a65undaelter/AnteilUeber65/
Durchschnittsalter/name_23. Die int16/float32-Spalten landen per FGB als TEXT in den Kacheln
(tippecanoe liest diese FGB-Typen als String) — darum liest das Frontend überall to-number.
"""

from __future__ import annotations

from pathlib import Path

from unfallkarte import tiles
from unfallkarte.config import get_paths, load_yaml

_LAYER = "rasters-polys"  # interner tippecanoe-Layer = Frontend-Vertrag (Name aus routing_bulk)

# Spaltenreihenfolge wie im Original-Parquet (`…_wPLZ_wRS.parquet`)
_REGIO_COLS = ["gem_23_str", "name_23", "RegioStaR7"]


def _dataset() -> dict:
    return load_yaml("sources.yaml")["datasets"]["census_population"]


def _raw() -> Path:
    return get_paths().raw / "census"


def raw_files() -> dict[str, Path]:
    """Die drei Rohdateien (Pfade aus sources.yaml). Fehlt eine, klar abbrechen."""
    cfg = _dataset()["raw"]
    files = {key: _raw() / cfg[key] for key in ("grid", "plz", "regiostar")}
    missing = [str(p) for p in files.values() if not p.exists()]
    if missing:
        raise FileNotFoundError(
            "Zensus-Rohdaten fehlen: " + ", ".join(missing) + " — Archivkopien nach "
            "data/raw/census/ legen (npgeo-Gitter + PLZ-Stand sind nicht sicher neu beschaffbar)."
        )
    return files


def parquet_path() -> Path:
    return get_paths().data / Path(_dataset()["file"]).with_suffix(".parquet")


def read_regiostar(xlsx: Path, sheet: str):
    """RegioStaR-Referenz: Gemeindeschlüssel 8-stellig als Text (Excel liefert Zahlen ohne 0)."""
    import pandas as pd

    df = pd.read_excel(xlsx, sheet_name=sheet)
    df["gem_23_str"] = df["gem_23"].apply(lambda x: str(x).zfill(8))
    return df[_REGIO_COLS]


def join(*, verbose: bool = True):
    """Gitter + PLZ + RegioStaR -> GeoDataFrame in 4326 (wie das Original-Parquet)."""
    import geopandas as gpd

    log = print if verbose else (lambda *_: None)
    files = raw_files()
    cfg = _dataset()["raw"]

    grid = gpd.read_file(files["grid"], engine="pyogrio")
    log(f"  Gitter: {len(grid):,} Zellen ({grid.crs})")

    plz = gpd.read_file(files["plz"], engine="pyogrio", columns=["plz"]).to_crs(4326)
    # Zellmitte wie im Notebook: Schwerpunkt in Web-Mercator (das Gitter liegt schon in 3857),
    # dann 4326 — siehe Modul-Docstring, warum nicht exakt aus der Gitter-ID.
    centers = gpd.GeoDataFrame(
        {"id": grid["id"]}, geometry=grid.geometry.to_crs(3857).centroid.to_crs(4326)
    )
    # `within` ist topologisch -> darf in 4326 laufen (CLAUDE.md, CRS-Ausnahme)
    hit = gpd.sjoin(centers, plz, how="left", predicate="within").drop(columns="index_right")
    if hit.index.duplicated().any():
        raise ValueError("Zellmitte liegt in mehreren PLZ-Gebieten — PLZ-Datei prüfen")
    log(f"  PLZ: {hit['plz'].notna().sum():,} Zellen zugeordnet, {hit['plz'].isna().sum():,} ohne")

    attrs = [c for c in grid.columns if c != "geometry"]
    out = gpd.GeoDataFrame(
        grid[attrs].assign(plz=hit["plz"]),
        geometry=grid.geometry.to_crs(4326),
        crs=4326,
    )

    regio = read_regiostar(files["regiostar"], cfg["regiostar_sheet"])
    before = len(out)
    out = out.merge(regio, left_on="ags", right_on="gem_23_str", how="inner")  # wie im Notebook
    log(f"  RegioStaR: {len(out):,} Zellen, {before - len(out):,} ohne Gemeinde im Gebietsstand")

    before = len(out)
    out = out[out["Einwohner"] > 0].reset_index(drop=True)  # routing_bulk: nur bewohnte Zellen
    log(f"  Einwohner > 0: {len(out):,} ({before - len(out):,} entfernt)")
    return out


def build(*, dry_run: bool = False) -> Path:
    """Voller Build: Join -> Parquet + FGB -> PMTiles (Layer `rasters-polys`)."""
    out = get_paths().data / _dataset()["file"]
    fgb = _raw() / "population_100m.fgb"
    if dry_run:
        print("  [skip] Join/FGB (dry-run)")
    else:
        gdf = join()
        pq = parquet_path()
        pq.parent.mkdir(parents=True, exist_ok=True)
        gdf.to_parquet(pq)
        print(f"  Parquet: {pq}")
        gdf.to_file(fgb, driver="FlatGeobuf")
    return tiles.tippecanoe("census_population", fgb, out, layer_override=_LAYER, dry_run=dry_run)
