"""Test für scenario2: Schul-Buffer + Unfallzählung + Dual-Layer-Output (dry-run)."""

from __future__ import annotations

import geopandas as gpd
from shapely.geometry import Point

from unfallkarte.scenarios import registry
from unfallkarte.scenarios.base import ScenarioContext
from unfallkarte.scenarios.scenario2_schools import run as run_scenario2


def _write_inputs(tmp_path):
    # Eine Schule; 3 Unfälle ab 2020 sehr nah dran (2x Rad, 1x Fuß) + 1 Altfall 2019.
    schools = gpd.GeoDataFrame(
        {"osm_way_id": [111], "osm_id": [None], "geometry": [Point(10.0, 50.0)]},
        crs="EPSG:4326",
    )
    osm_raw = tmp_path / "raw" / "osm"
    osm_raw.mkdir(parents=True)
    schools.to_file(osm_raw / "schools.fgb", driver="FlatGeobuf")

    accidents = gpd.GeoDataFrame(
        {
            "UJAHR": [2020, 2021, 2022, 2019],
            "IstRad": [1, 1, 0, 1],
            "IstFuss": [0, 0, 1, 0],
            "geometry": [
                Point(10.00010, 50.0),
                Point(10.00020, 50.0),
                Point(10.00030, 50.0),
                Point(10.00010, 50.0),  # 2019 → muss rausgefiltert werden
            ],
        },
        crs="EPSG:4326",
    )
    acc_parquet = tmp_path / "accidents.parquet"
    accidents.to_parquet(acc_parquet)
    return acc_parquet, osm_raw


def test_scenario2_counts_and_outputs(tmp_path, capsys):
    acc_parquet, osm_raw = _write_inputs(tmp_path)
    out_dir = tmp_path / "scenarios"
    ctx = ScenarioContext(
        accidents_parquet=acc_parquet, osm_raw=osm_raw, out_dir=out_dir, dry_run=True
    )

    run_scenario2(ctx)

    # fgb-Outputs existieren und enthalten genau die eine Schule (3 biped-Unfälle > 2)
    polys = gpd.read_file(out_dir / "_tmp" / "scenario2_polys.fgb")
    assert len(polys) == 1
    row = polys.iloc[0]
    assert int(row["total_count"]) == 3   # 2019 ausgeschlossen
    assert int(row["bike_count"]) == 2
    assert int(row["ped_count"]) == 1

    # Dual-Layer-Tile-Kommandos wurden geplant (dry-run, kein tippecanoe nötig)
    out = capsys.readouterr().out
    assert "scenario2-points" in out
    assert "scenario2-polys" in out
    assert "tile-join" in out


def test_registry_has_scenario2():
    assert "scenario2" in registry.REGISTRY
    assert "scenario6" in registry.PLANNED
