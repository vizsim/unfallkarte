# SPDX-License-Identifier: AGPL-3.0-or-later
"""Zensus 2022, 100-m- und 1-km-Gitter → Parquet + PMTiles (Kontextlayer „Einwohner").

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

Die Kacheln sind seitdem verschlankt (tiles.yaml): nur die Felder, die die Karte liest, als
echte Zahlen — bis dahin steckten ~50 Attribute als TEXT in jedem Feature (tippecanoe liest die
FGB-Typen int16/float32 als String). Für die Übersicht kommt das 1-km-Gitter derselben Quelle
dazu (ohne PLZ/RegioStaR).

Frontend-Vertrag (js/layers/context-population.js): census/population_100m.pmtiles mit Layer
`rasters-polys` und census/population_1km.pmtiles mit Layer `rasters-1km-polys`; Felder = die
`include`-Listen der Profile census_population / census_population_1km in tiles.yaml.
"""

from __future__ import annotations

from pathlib import Path

from unfallkarte import tiles
from unfallkarte.config import get_paths, load_yaml

_LAYER = "rasters-polys"  # interner tippecanoe-Layer = Frontend-Vertrag (Name aus routing_bulk)
_LAYER_1KM = "rasters-1km-polys"

# Spaltenreihenfolge wie im Original-Parquet (`…_wPLZ_wRS.parquet`)
_REGIO_COLS = ["gem_23_str", "name_23", "RegioStaR7"]


def _dataset() -> dict:
    return load_yaml("sources.yaml")["datasets"]["census_population"]


def _dataset_1km() -> dict:
    return load_yaml("sources.yaml")["datasets"]["census_population_1km"]


def _raw() -> Path:
    return get_paths().raw / "census"


def raw_files() -> dict[str, Path]:
    """Die Rohdateien (Pfade aus sources.yaml). Fehlt eine, klar abbrechen."""
    cfg = _dataset()["raw"]
    files = {key: _raw() / cfg[key] for key in ("grid", "plz", "regiostar", "grid_1km")}
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


def grid_1km(*, verbose: bool = True):
    """1-km-Gitter derselben Quelle, nur bewohnte Zellen, in 4326 (ohne PLZ/RegioStaR)."""
    import geopandas as gpd

    grid = gpd.read_file(raw_files()["grid_1km"], engine="pyogrio")
    out = grid[grid["Einwohner"] > 0].to_crs(4326).reset_index(drop=True)  # unbewohnt = NaN
    if verbose:
        print(f"  1 km: {len(out):,} bewohnte von {len(grid):,} Zellen")
    return out


def tile_frame(gdf, profile_name: str):
    """Nur die Felder aus `include` des Tile-Profils, alle Zahlen als float64.

    tippecanoe liest aus FlatGeobuf nur `double` als Zahl — JEDER Ganzzahltyp (int16…int64)
    und float32 landet als TEXT in den Kacheln (so im Original). Ganzzahlige Werte speichert
    tippecanoe trotz float64 kompakt als Ganzzahl; Kommazahlen auf 2 Stellen gerundet.
    """
    import pandas as pd

    fields = tiles._profiles()[profile_name]["include"]
    out = gdf[[*fields, "geometry"]].copy()
    for col in fields:
        if pd.api.types.is_numeric_dtype(out[col]):
            out[col] = out[col].astype("float64").round(2)
    return out


def build(*, reuse_parquet: bool = False, dry_run: bool = False) -> dict[str, Path]:
    """Voller Build: Join -> Parquet; 100 m + 1 km -> schlanke FGB -> je ein PMTiles.

    reuse_parquet: vorhandenes Parquet nehmen statt neu zu joinen (spart ~1,5 min beim Justieren
    der Kachel-Einstellungen).
    """
    import geopandas as gpd

    data = get_paths().data
    out = {"100m": data / _dataset()["file"], "1km": data / _dataset_1km()["file"]}
    fgb = {"100m": _raw() / "population_100m.fgb", "1km": _raw() / "population_1km.fgb"}
    if dry_run:
        print("  [skip] Join/FGB (dry-run)")
    else:
        pq = parquet_path()
        if reuse_parquet and pq.exists():
            print(f"  Parquet (vorhanden): {pq}")
            cells = gpd.read_parquet(pq)
        else:
            cells = join()
            pq.parent.mkdir(parents=True, exist_ok=True)
            cells.to_parquet(pq)
            print(f"  Parquet: {pq}")
        tile_frame(cells, "census_population").to_file(fgb["100m"], driver="FlatGeobuf")
        tile_frame(grid_1km(), "census_population_1km").to_file(fgb["1km"], driver="FlatGeobuf")
    tiles.tippecanoe("census_population", fgb["100m"], out["100m"], layer_override=_LAYER,
                     dry_run=dry_run)
    tiles.tippecanoe("census_population_1km", fgb["1km"], out["1km"], layer_override=_LAYER_1KM,
                     dry_run=dry_run)
    return out
