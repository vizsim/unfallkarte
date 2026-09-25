"""Tests für census: Join-Regeln (PLZ, RegioStaR, Einwohner > 0), 1-km-Gitter, schlanke
Kachel-Felder, Rohdaten-Check, Wiring.

Auf einem Mini-Gitter (drei Zellen) statt der echten 1-GB-Rohdaten — die Regeln sind dieselben,
die der Vergleich mit dem Original-Parquet bestätigt hat (siehe census.py).
"""

from __future__ import annotations

from pathlib import Path

import geopandas as gpd
import pandas as pd
import pytest
from shapely.geometry import box

from unfallkarte import census, tiles
from unfallkarte.config import load_yaml

# Drei Zellen in Berlin-Mitte (EPSG:3035, linke untere Ecke in der ID)
_IDS = ["CRS3035RES100mN3270000E4550000", "CRS3035RES100mN3270000E4550100",
        "CRS3035RES100mN3270100E4550000"]


def _cells(ids: list[str]) -> gpd.GeoDataFrame:
    """Zellen-Polygone aus den IDs (`…N<y>E<x>` = linke untere Ecke in EPSG:3035)."""
    rows = []
    for gid in ids:
        n, e = (int(v) for v in gid.removeprefix("CRS3035RES100mN").split("E"))
        rows.append(box(e, n, e + 100, n + 100))
    return gpd.GeoDataFrame(geometry=rows, crs=3035)


def _raw_dir(tmp_path: Path) -> Path:
    cells = _cells(_IDS).to_crs(3857)
    grid = gpd.GeoDataFrame({
        "id": ["a", "b", "c"],
        "GITTER_ID_100m": _IDS,
        "ags": ["11000000", "11000000", "99999999"],  # c: Gemeinde fehlt in RegioStaR
        "Einwohner": pd.array([12, 0, 30], dtype="int16"),  # b: unbewohnt
        # Typen wie im npgeo-Gitter (int16/float32 -> in FGB für tippecanoe sonst Text)
        "Unter18": pd.array([3, 0, 4], dtype="int16"),
        "a65undaelter": pd.array([4, 0, 5], dtype="int16"),
        "AnteilUnter18": [25.0, 0.0, 13.33],
        "AnteilUeber65": [33.33, 0.0, 16.67],
        "Durchschnittsalter": pd.array([41.3, 0.0, 38.9], dtype="float32"),
    }, geometry=cells.geometry, crs=3857)
    grid.to_file(tmp_path / "grid.gpkg", driver="GPKG")

    # PLZ-Gebiet deckt nur die Zellen a + b (untere Reihe)
    lower = _cells(_IDS[:2]).union_all().buffer(1)
    gpd.GeoDataFrame({"plz": ["10178"]}, geometry=[lower], crs=3035).to_crs(4326).to_file(
        tmp_path / "plz.gpkg", driver="GPKG")

    pd.DataFrame({"gem_23": [11000000], "name_23": ["Berlin, Stadt"], "RegioStaR7": [71]}).to_excel(
        tmp_path / "regio.xlsx", sheet_name="ReferenzGebietsstand2023", index=False)

    # 1-km-Gitter: unbewohnte Zellen stehen dort mit NaN statt 0
    km = gpd.GeoDataFrame({
        "id": ["k1", "k2"], "Einwohner": [1234.0, float("nan")], "Unter18": [200.0, float("nan")],
        "a65undaelter": [300.0, float("nan")], "AnteilUnter18": [16.21, float("nan")],
        "AnteilUeber65": [24.31, float("nan")], "Durchschnittsalter": [44.25, float("nan")],
    }, geometry=[box(4550000, 3270000, 4551000, 3271000), box(4551000, 3270000, 4552000, 3271000)],
        crs=3035).to_crs(3857)
    km.to_file(tmp_path / "grid_1km.gpkg", driver="GPKG")
    return tmp_path


@pytest.fixture
def mini(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    raw = _raw_dir(tmp_path)
    ds = {"file": "census/population_100m.pmtiles",
          "raw": {"grid": "grid.gpkg", "plz": "plz.gpkg", "regiostar": "regio.xlsx",
                  "regiostar_sheet": "ReferenzGebietsstand2023", "grid_1km": "grid_1km.gpkg"}}
    monkeypatch.setattr(census, "_raw", lambda: raw)
    monkeypatch.setattr(census, "_dataset", lambda: ds)
    return raw


def test_join_rules(mini: Path) -> None:
    out = census.join(verbose=False)
    # b fällt raus (Einwohner 0), c fällt raus (Gemeinde nicht im RegioStaR-Gebietsstand)
    assert out["id"].tolist() == ["a"]
    assert out.loc[0, "plz"] == "10178"
    assert (out.loc[0, "gem_23_str"], out.loc[0, "RegioStaR7"]) == ("11000000", 71)
    assert out.crs.to_epsg() == 4326
    # Spaltenreihenfolge wie im Original-Parquet: Merkmale, plz, geometry, RegioStaR-Spalten
    assert list(out.columns)[-5:] == ["plz", "geometry", "gem_23_str", "name_23", "RegioStaR7"]


def test_join_keeps_cells_outside_any_plz(mini: Path) -> None:
    grid = gpd.read_file(mini / "grid.gpkg")
    grid["ags"] = "11000000"
    grid["Einwohner"] = 5
    grid.to_file(mini / "grid.gpkg", driver="GPKG")
    out = census.join(verbose=False)
    assert out.set_index("id")["plz"].isna().to_dict() == {"a": False, "b": False, "c": True}


def test_grid_1km_keeps_only_populated_cells(mini: Path) -> None:
    out = census.grid_1km(verbose=False)
    assert out["id"].tolist() == ["k1"] and out.crs.to_epsg() == 4326


def test_tile_frame_only_include_fields_all_numbers_as_float(mini: Path) -> None:
    # tippecanoe liest aus FGB nur double als Zahl -> alle Zahlen float64, sonst Text im Tile
    frame = census.tile_frame(census.join(verbose=False), "census_population")
    include = tiles._profiles()["census_population"]["include"]
    assert list(frame.columns) == [*include, "geometry"]
    numeric = frame.drop(columns=["geometry", "name_23", "plz"])
    assert all(str(t) == "float64" for t in numeric.dtypes)
    assert frame.loc[0, "Einwohner"] == 12.0 and frame.loc[0, "plz"] == "10178"
    assert frame.loc[0, "Durchschnittsalter"] == 41.3  # float32-Rauschen weggerundet


def test_missing_raw_file_fails_clearly(mini: Path) -> None:
    (mini / "plz.gpkg").unlink()
    with pytest.raises(FileNotFoundError, match="nicht sicher neu beschaffbar"):
        census.raw_files()


def test_dataset_and_tile_profiles_wired() -> None:
    datasets = load_yaml("sources.yaml")["datasets"]
    # Dateien + Layer-Namen = Frontend-Vertrag (js/layers/context-population.js)
    assert datasets["census_population"]["file"] == "census/population_100m.pmtiles"
    assert datasets["census_population_1km"]["file"] == "census/population_1km.pmtiles"
    assert set(datasets["census_population"]["raw"]) >= {
        "grid", "plz", "regiostar", "regiostar_sheet", "grid_1km"}

    for name, layer, zooms in (("census_population", "rasters-polys", (11, 12)),
                               ("census_population_1km", "rasters-1km-polys", (8, 10))):
        args = tiles._profile_args(tiles._profiles()[name], layer_override=layer)
        assert args[args.index("-l") + 1] == layer
        assert f"--minimum-zoom={zooms[0]}" in args and f"--maximum-zoom={zooms[1]}" in args
        assert "--no-tiny-polygon-reduction" in args


def test_build_dry_run_constructs_both_commands(capsys: pytest.CaptureFixture[str]) -> None:
    out = census.build(dry_run=True)
    captured = capsys.readouterr().out
    assert {p.name for p in out.values()} == {"population_100m.pmtiles", "population_1km.pmtiles"}
    assert "-l rasters-polys" in captured and "-l rasters-1km-polys" in captured
