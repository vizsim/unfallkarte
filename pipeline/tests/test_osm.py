"""Tests für osm.py: PBF-Layer-Filter/Merge, oid-Helper, Dry-Run-Build."""

from __future__ import annotations

import os
from pathlib import Path

import geopandas as gpd
import pytest
from shapely.geometry import LineString, Point

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
    # POI-Pfad liest die PBF-Layer direkt (kein ogr2ogr/GPKG/GeoJSON mehr)
    assert "ogr2ogr" not in out and "GPKG" not in out and "GeoJSON" not in out
    assert "PBF-Layer" in out
    assert "tippecanoe" in out and "germany_osm_schools" in out

    # Line-Layer laufen über denselben Direkt-PBF-Pfad (osm_layers ["lines"]).
    osm.build("maxspeed_major", dry_run=True)
    out = capsys.readouterr().out
    assert "osmium tags-filter" in out and "w/highway=motorway" in out
    assert "ogr2ogr" not in out and "GeoJSON" not in out
    assert "PBF-Layer" in out and "lines" in out
    assert "-l highways" in out


def test_osm_build_crossings_dry_run(capsys) -> None:
    # Crossings: Nodes (highway=crossing) + Ways (footway/cycleway/path=crossing)
    # in EINEM Layer -> osm_layers points+lines, tippecanoe_layer germany_osm_crossings.
    osm.build("crossings", dry_run=True)
    out = capsys.readouterr().out
    assert "osmium tags-filter" in out
    assert "n/highway=crossing" in out and "w/footway=crossing" in out
    assert "PBF-Layer ['points', 'lines']" in out
    assert "-l germany_osm_crossings" in out


class _FakeResponse:
    def __init__(self, chunks: list[bytes], fail: bool = False) -> None:
        self.chunks, self.fail = chunks, fail

    def __enter__(self) -> _FakeResponse:
        return self

    def __exit__(self, *exc: object) -> None:
        return None

    def raise_for_status(self) -> None:
        return None

    def iter_content(self, chunk_size: int):
        yield from self.chunks
        if self.fail:
            raise ConnectionError("Abbruch mitten im Download")


def _fake_fetch_env(monkeypatch, tmp_path: Path, response: _FakeResponse) -> Path:
    monkeypatch.setattr(osm, "_raw", lambda: tmp_path)
    monkeypatch.setattr(osm, "_config", lambda: {"geofabrik": {"url": "x", "pbf": "de.osm.pbf"}})
    monkeypatch.setattr(osm.requests, "get", lambda *a, **k: response)
    return tmp_path / "de.osm.pbf"


def test_fetch_keeps_hardlinked_snapshot(monkeypatch, tmp_path: Path) -> None:
    # Die PBF teilt sich per Hardlink die Datei mit einem datierten Snapshot woanders:
    # der neue Download darf den Snapshot nicht überschreiben.
    dest = _fake_fetch_env(monkeypatch, tmp_path, _FakeResponse([b"neu"]))
    dest.write_bytes(b"alt")
    snapshot = tmp_path / "germany-260710.osm.pbf"
    os.link(dest, snapshot)
    osm.fetch(force=True)
    assert dest.read_bytes() == b"neu"
    assert snapshot.read_bytes() == b"alt"
    assert not dest.with_name(dest.name + ".part").exists()


def test_fetch_abort_keeps_old_pbf(monkeypatch, tmp_path: Path) -> None:
    dest = _fake_fetch_env(monkeypatch, tmp_path, _FakeResponse([b"halb"], fail=True))
    dest.write_bytes(b"alt")
    with pytest.raises(ConnectionError):
        osm.fetch(force=True)
    assert dest.read_bytes() == b"alt"
    assert not dest.with_name(dest.name + ".part").exists()


def test_crossings_tag_filters_keep_points_and_lines() -> None:
    # OR-Semantik: Punkte über highway=crossing, Linien über footway=crossing behalten;
    # ein Stray-Node (highway!=crossing, kein footway/cycleway/path=crossing) fällt raus.
    points = gpd.GeoDataFrame(
        {"highway": ["crossing", "traffic_signals"], "footway": [None, None],
         "geometry": [Point(10, 50), Point(10.1, 50.1)]},
        crs="EPSG:4326",
    )
    lines = gpd.GeoDataFrame(
        {"highway": ["footway"], "footway": ["crossing"],
         "geometry": [LineString([(10, 50), (10.001, 50)])]},
        crs="EPSG:4326",
    )
    tag_filters = {"highway": ["crossing"], "footway": ["crossing"],
                   "cycleway": ["crossing"], "path": ["crossing"]}
    merged = osm._filter_and_merge([points, lines], tag_filters)
    assert len(merged) == 2  # crossing-Node + footway=crossing-Way; Stray-Node raus
    assert set(merged.geom_type) == {"Point", "LineString"}
