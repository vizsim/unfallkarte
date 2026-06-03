"""Tests für scenario2 (Schul-Buffer + Unfallzählung) und scenario6 (Tempo-50
vor Schulen), je end-to-end synthetisch mit Tile-Dry-Run."""

from __future__ import annotations

import geopandas as gpd
from shapely.geometry import LineString, Point

from unfallkarte.scenarios import registry
from unfallkarte.scenarios.base import ScenarioContext
from unfallkarte.scenarios.scenario1_clusters_ms100 import run as run_scenario1
from unfallkarte.scenarios.scenario2_schools import run as run_scenario2
from unfallkarte.scenarios.scenario6_schools_tempo50 import run as run_scenario6


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


def _write_sc6_inputs(tmp_path):
    osm_raw = tmp_path / "raw" / "osm"
    osm_raw.mkdir(parents=True)
    # Eine Schule; zwei kreuzende Tempo-50-Straßen durch die Mitte
    # (je ~60 m im 30-m-Buffer -> Summe ~120 m > Schwelle 60 m).
    gpd.GeoDataFrame(
        {"osm_way_id": [222], "osm_id": [None], "geometry": [Point(10.0, 50.0)]},
        crs="EPSG:4326",
    ).to_file(osm_raw / "schools.fgb", driver="FlatGeobuf")
    gpd.GeoDataFrame(
        {
            "osm_id": [1, 2],
            "maxspeed": ["50", "50"],
            "maxspeed_type": ["DE:urban", "DE:urban"],
            "maxspeed_conditional": ["", ""],
            "geometry": [
                LineString([(9.997, 50.0), (10.003, 50.0)]),
                LineString([(10.0, 49.9985), (10.0, 50.0015)]),
            ],
        },
        crs="EPSG:4326",
    ).to_file(osm_raw / "maxspeed_major.fgb", driver="FlatGeobuf")
    return osm_raw


def test_scenario6_tempo50(tmp_path, capsys):
    osm_raw = _write_sc6_inputs(tmp_path)
    acc = tmp_path / "accidents.parquet"  # von sc6 ungenutzt, aber Context-Pflichtfeld
    gpd.GeoDataFrame(
        {"UJAHR": [2023], "geometry": [Point(10, 50)]}, crs="EPSG:4326"
    ).to_parquet(acc)
    out_dir = tmp_path / "scenarios"
    ctx = ScenarioContext(accidents_parquet=acc, osm_raw=osm_raw, out_dir=out_dir, dry_run=True)

    run_scenario6(ctx)

    polys = gpd.read_file(out_dir / "_tmp" / "scenario6_polys.fgb")
    assert len(polys) == 1
    assert float(polys.iloc[0]["total_tempo50_highway_length_m"]) > 60
    # Punkte (Zentroide) + Link-Polygone existieren
    assert len(gpd.read_file(out_dir / "_tmp" / "scenario6_points.fgb")) == 1
    assert len(gpd.read_file(out_dir / "_tmp" / "scenario6_links.fgb")) == 1

    out = capsys.readouterr().out
    for layer in ("scenario6-points", "scenario6-polys", "scenario6-polys2"):
        assert layer in out
    assert "tile-join" in out


def test_scenario1_clusters(tmp_path, capsys):
    osm_raw = tmp_path / "raw" / "osm"
    osm_raw.mkdir(parents=True)
    # Eine Tempo-100-Hauptstraße (trunk) ...
    gpd.GeoDataFrame(
        {
            "osm_id": [1],
            "maxspeed": ["100"],
            "maxspeed_type": ["DE:rural"],
            "highway": ["trunk"],
            "geometry": [LineString([(9.999, 50.0), (10.001, 50.0)])],
        },
        crs="EPSG:4326",
    ).to_file(osm_raw / "maxspeed_major.fgb", driver="FlatGeobuf")
    # ... mit 3 dicht beieinander liegenden Unfällen darauf (-> 1 DBSCAN-Cluster)
    # plus ein weit entfernter Einzel-Unfall (Rauschen, wird verworfen).
    acc = tmp_path / "accidents.parquet"
    gpd.GeoDataFrame(
        {
            "UKATEGORIE": [1, 2, 3, 1],
            "geometry": [
                Point(10.00000, 50.0),
                Point(10.00002, 50.0),
                Point(10.00004, 50.0),
                Point(10.00100, 50.0),
            ],
        },
        crs="EPSG:4326",
    ).to_parquet(acc)
    out_dir = tmp_path / "scenarios"
    ctx = ScenarioContext(accidents_parquet=acc, osm_raw=osm_raw, out_dir=out_dir, dry_run=True)

    run_scenario1(ctx)

    polys = gpd.read_file(out_dir / "_tmp" / "scenario1_polys.fgb")
    assert len(polys) == 1  # genau ein Cluster
    row = polys.iloc[0]
    assert int(row["cluster_size"]) == 3
    assert int(row["UKATEGORIE__1"]) == 1 and int(row["UKATEGORIE__2"]) == 1
    assert len(gpd.read_file(out_dir / "_tmp" / "scenario1_points.fgb")) == 1

    out = capsys.readouterr().out
    assert "scenario1-points" in out and "scenario1-polys" in out and "tile-join" in out


def test_registry_has_scenarios():
    assert {"scenario1", "scenario2", "scenario6"} <= set(registry.REGISTRY)
    assert "scenario3" in registry.PLANNED
