"""Tests für osm.py: GPKG->fgb-Filter, oid-Helper, Dry-Run-Build."""

from __future__ import annotations

import geopandas as gpd
from shapely.geometry import Point

from unfallkarte import geo, osm


def test_make_osm_oid_prefers_way() -> None:
    gdf = gpd.GeoDataFrame(
        {
            "osm_way_id": [123, None],
            "osm_id": [None, 456],
            "geometry": [Point(10, 50), Point(11, 51)],
        },
        crs="EPSG:4326",
    )
    out = geo.make_osm_oid(gdf)
    assert list(out["oid"]) == ["way/123", "node/456"]


def test_filter_gpkg_to_fgb(tmp_path) -> None:
    # Mini-GPKG mit zwei Layern + amenity-Spalte; nur schools/kindergarten behalten.
    gpkg = tmp_path / "in.gpkg"
    points = gpd.GeoDataFrame(
        {"amenity": ["school", "cafe"], "geometry": [Point(10, 50), Point(10.1, 50.1)]},
        crs="EPSG:4326",
    )
    polys = gpd.GeoDataFrame(
        {"amenity": ["kindergarten"], "geometry": [Point(11, 51).buffer(0.01)]},
        crs="EPSG:4326",
    )
    points.to_file(gpkg, layer="points", driver="GPKG")
    polys.to_file(gpkg, layer="multipolygons", driver="GPKG")

    fgb = tmp_path / "out.fgb"
    osm.filter_gpkg_to_fgb(
        gpkg, fgb, ["points", "multipolygons"], {"amenity": ["school", "kindergarten"]}
    )
    result = gpd.read_file(fgb)
    # 'cafe' rausgefiltert -> school + kindergarten = 2
    assert len(result) == 2
    assert set(result["amenity"]) == {"school", "kindergarten"}


def test_osm_build_dry_run_constructs_commands(capsys) -> None:
    # dry_run: keine Binaries nötig, prüft nur, dass die Pipeline die richtigen
    # Schritte für einen POI- und einen Line-Layer plant.
    osm.build("schools", dry_run=True)
    out = capsys.readouterr().out
    assert "osmium tags-filter" in out
    assert "nwr/amenity=school,kindergarten" in out
    assert "ogr2ogr" in out and "GPKG" in out
    assert "tippecanoe" in out and "germany_osm_schools" in out

    osm.build("cycleways", dry_run=True)
    out = capsys.readouterr().out
    assert "GeoJSON" in out
    assert "-l cycleways" in out
