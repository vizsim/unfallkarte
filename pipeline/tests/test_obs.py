"""Tests für obs: dedup + DE-Clip (netzfrei) + Config-/Tile-Wiring + Build-Dry-Run."""

from __future__ import annotations

import geopandas as gpd
from shapely.geometry import Point, box

from unfallkarte import obs, tiles
from unfallkarte.config import load_yaml


def _gdf(rows: list[dict]) -> gpd.GeoDataFrame:
    return gpd.GeoDataFrame(rows, geometry="geometry", crs="EPSG:4326")


def test_dedupe_drops_same_measurement_on_multiple_portals() -> None:
    # Gleiche Messung (distance_overtaker+time+geometry) auf zwei Portalen -> 1x.
    g, t = Point(10.0, 50.0), "2025-01-01T10:00:00+0000"
    gdf = _gdf([
        {"distance_overtaker": 0.9, "time": t, "portal": "a", "geometry": g},
        {"distance_overtaker": 0.9, "time": t, "portal": "b", "geometry": g},  # Dublette
        {"distance_overtaker": 1.4, "time": t, "portal": "a", "geometry": g},
    ])
    out = obs.dedupe(gdf)
    assert len(out) == 2  # die exakte Dublette fällt raus, andere Distanz bleibt


def test_clip_to_keeps_only_points_inside_boundary() -> None:
    boundary = gpd.GeoDataFrame(geometry=[box(0, 0, 10, 10)], crs="EPSG:4326")
    gdf = _gdf([
        {"distance_overtaker": 1.0, "geometry": Point(5, 5)},     # drin
        {"distance_overtaker": 1.0, "geometry": Point(20, 20)},   # draußen
    ])
    out = obs.clip_to(gdf, boundary)
    assert len(out) == 1
    assert not any(c.startswith("index_right") for c in out.columns)  # sjoin-Spalte weg


def test_slug_matches_expected_portal_names() -> None:
    assert obs._slug("https://obs.adfc-bw.de/") == "adfc-bw"
    assert obs._slug("https://obs-portal.pub.solar/") == "obs-portal-koeln"
    assert obs._slug("https://portal.openbikesensor.org/") == "openbikesensor"
    assert obs._slug("https://portal.1meter50.at/") == "1meter50"


def test_dataset_and_tile_profile_wired() -> None:
    ds = load_yaml("sources.yaml")["datasets"]["obs"]
    assert ds["file"] == "obs/obs_data.pmtiles"
    assert ds["date"] == "obs" and ds["portals"]  # Portal-Liste config-getrieben

    args = tiles._profile_args(tiles._profiles()["obs_points"])
    assert "-l" in args and "obs_data-points" in args  # interner Layer = Frontend-Vertrag
    assert "--no-tile-size-limit" in args


def test_build_dry_run_constructs_command(capsys) -> None:
    out = obs.build(dry_run=True)
    captured = capsys.readouterr().out
    assert out.name == "obs_data.pmtiles" and out.parent.name == "obs"
    assert "tippecanoe" in captured and "-l obs_data-points" in captured
