"""Tests für geteilte Geo-Helper und die tippecanoe-Argument-Konstruktion."""

from __future__ import annotations

import geopandas as gpd
from shapely.geometry import Point

from unfallkarte import geo, tiles


def _accidents() -> gpd.GeoDataFrame:
    # 3 Unfälle nahe (10.0, 50.0); zwei mit Rad, einer mit Fuß.
    return gpd.GeoDataFrame(
        {
            "IstRad": [1, 1, 0],
            "IstFuss": [0, 0, 1],
            "geometry": [Point(10.0000, 50.0000), Point(10.0003, 50.0000), Point(10.0006, 50.0000)],
        },
        crs="EPSG:4326",
    )


def _feature() -> gpd.GeoDataFrame:
    # Ein Feature, gepuffert um 100 m → fängt die nahen Punkte ein.
    base = gpd.GeoDataFrame({"oid": ["f1"], "geometry": [Point(10.0003, 50.0000)]}, crs="EPSG:4326")
    return geo.buffer(base, 100)


def test_buffer_keeps_crs_and_grows_area() -> None:
    buffered = _feature()
    assert buffered.crs.to_epsg() == 4326
    # Polygon statt Punkt
    assert buffered.geometry.iloc[0].geom_type == "Polygon"


def test_count_accidents_per_feature_with_categories() -> None:
    feat = _feature()
    result = geo.count_accidents_per_feature(
        _accidents(), feat, "oid", categories={"bike": ("IstRad", 1), "ped": ("IstFuss", 1)}
    )
    row = result[result["oid"] == "f1"].iloc[0]
    assert int(row["total_count"]) == 3
    assert int(row["bike_count"]) == 2
    assert int(row["ped_count"]) == 1


def test_centroids_return_points() -> None:
    cent = geo.centroids(_feature())
    assert cent.geometry.iloc[0].geom_type == "Point"
    assert cent.crs.to_epsg() == 4326


def test_tippecanoe_cluster_args() -> None:
    # Cluster-Profil muss die accumulate-Flags + cluster-distance + Layer-Namen tragen.
    profile = tiles._profiles()["clusters_6_8"]
    args = tiles._profile_args(profile)
    assert "-l" in args and "clusters_6_8" in args
    assert "--cluster-distance=25" in args
    assert "--accumulate-attribute=UKATEGORIE__1:sum" in args
    assert "--minimum-zoom=6" in args and "--maximum-zoom=8" in args


def test_tippecanoe_single_args() -> None:
    args = tiles._profile_args(tiles._profiles()["accidents_single"])
    assert "accidents" in args  # Layer-Name = Frontend-Vertrag
    assert "--drop-densest-as-needed" in args
    assert "--no-feature-limit" in args
