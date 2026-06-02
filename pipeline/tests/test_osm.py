"""Tests für osm.py: PBF-Layer-Filter/Merge, oid-Helper, Dry-Run-Build."""

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


def test_filter_and_merge() -> None:
    # Zwei Layer (Punkte + Polygone) wie direkt aus der PBF gelesen; nur
    # school/kindergarten behalten, 'cafe' fällt raus. OR über die Tags.
    points = gpd.GeoDataFrame(
        {"amenity": ["school", "cafe"], "geometry": [Point(10, 50), Point(10.1, 50.1)]},
        crs="EPSG:4326",
    )
    polys = gpd.GeoDataFrame(
        {"amenity": ["kindergarten"], "geometry": [Point(11, 51).buffer(0.01)]},
        crs="EPSG:4326",
    )
    merged = osm._filter_and_merge([points, polys], {"amenity": ["school", "kindergarten"]})
    assert len(merged) == 2
    assert set(merged["amenity"]) == {"school", "kindergarten"}
    assert merged.crs == points.crs


def test_osm_build_dry_run_constructs_commands(capsys) -> None:
    # dry_run: keine Binaries nötig, prüft nur, dass die Pipeline die richtigen
    # Schritte für den POI-Pfad plant (osmium -> direktes PBF-Lesen -> tippecanoe).
    osm.build("schools", dry_run=True)
    out = capsys.readouterr().out
    assert "osmium tags-filter" in out
    assert "nwr/amenity=school,kindergarten" in out
    # POI-Pfad liest die PBF-Layer direkt (kein ogr2ogr/GPKG mehr)
    assert "ogr2ogr" not in out and "GPKG" not in out
    assert "PBF-Layer" in out
    assert "tippecanoe" in out and "germany_osm_schools" in out
