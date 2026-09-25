"""Tests für census: Join-Regeln (PLZ, RegioStaR, Einwohner > 0), Rohdaten-Check, Wiring.

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
    }, geometry=cells.geometry, crs=3857)
    grid.to_file(tmp_path / "grid.gpkg", driver="GPKG")

    # PLZ-Gebiet deckt nur die Zellen a + b (untere Reihe)
    lower = _cells(_IDS[:2]).union_all().buffer(1)
    gpd.GeoDataFrame({"plz": ["10178"]}, geometry=[lower], crs=3035).to_crs(4326).to_file(
        tmp_path / "plz.gpkg", driver="GPKG")

    pd.DataFrame({"gem_23": [11000000], "name_23": ["Berlin, Stadt"], "RegioStaR7": [71]}).to_excel(
        tmp_path / "regio.xlsx", sheet_name="ReferenzGebietsstand2023", index=False)
    return tmp_path


@pytest.fixture
def mini(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    raw = _raw_dir(tmp_path)
    ds = {"file": "census/population_100m.pmtiles",
          "raw": {"grid": "grid.gpkg", "plz": "plz.gpkg", "regiostar": "regio.xlsx",
                  "regiostar_sheet": "ReferenzGebietsstand2023"}}
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


def test_missing_raw_file_fails_clearly(mini: Path) -> None:
    (mini / "plz.gpkg").unlink()
    with pytest.raises(FileNotFoundError, match="nicht sicher neu beschaffbar"):
        census.raw_files()


def test_dataset_and_tile_profile_wired() -> None:
    ds = load_yaml("sources.yaml")["datasets"]["census_population"]
    assert ds["file"] == "census/population_100m.pmtiles"  # Frontend-Vertrag
    assert set(ds["raw"]) >= {"grid", "plz", "regiostar", "regiostar_sheet"}

    profile = tiles._profiles()["census_population"]
    args = tiles._profile_args(profile, layer_override="rasters-polys")
    assert args[args.index("-l") + 1] == "rasters-polys"  # Layer-Name = Frontend-Vertrag
    assert "--minimum-zoom=9" in args and "--maximum-zoom=10" in args


def test_build_dry_run_constructs_command(capsys: pytest.CaptureFixture[str]) -> None:
    out = census.build(dry_run=True)
    captured = capsys.readouterr().out
    assert out.name == "population_100m.pmtiles" and out.parent.name == "census"
    assert "tippecanoe" in captured and "-l rasters-polys" in captured
