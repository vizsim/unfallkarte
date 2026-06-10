"""Tests für hvs: to_fgb-Filter/Cleanup + Config-/Tile-Wiring + Build-Kommando."""

from __future__ import annotations

import json
from pathlib import Path

import geopandas as gpd

from unfallkarte import hvs, tiles
from unfallkarte.config import load_yaml


def _geojson(path: Path) -> Path:
    # 2 Linien mit annualTrafficFlow + Extra-Spalte 'junk'; eine mit null-Geometrie.
    fc = {
        "type": "FeatureCollection",
        "features": [
            {"type": "Feature", "properties": {"annualTrafficFlow": 12000, "junk": "x"},
             "geometry": {"type": "LineString", "coordinates": [[10.0, 50.0], [10.01, 50.0]]}},
            {"type": "Feature", "properties": {"annualTrafficFlow": 5000, "junk": "y"},
             "geometry": {"type": "LineString", "coordinates": [[10.0, 50.1], [10.02, 50.1]]}},
            {"type": "Feature", "properties": {"annualTrafficFlow": 999, "junk": "z"},
             "geometry": None},  # null-Geometrie -> muss rausfallen (FlatGeobuf-Write bräche sonst)
        ],
    }
    path.write_text(json.dumps(fc), encoding="utf-8")
    return path


def test_to_fgb_keeps_only_trafficflow_and_drops_null_geom(tmp_path: Path) -> None:
    fgb = tmp_path / "hvs_lines.fgb"
    out, n = hvs.to_fgb(_geojson(tmp_path / "hvs.geojson"), fgb)

    assert out.exists()
    assert n == 2  # die null-Geometrie ist verworfen
    gdf = gpd.read_file(out)
    assert "annualTrafficFlow" in gdf.columns and "junk" not in gdf.columns
    assert sorted(int(v) for v in gdf["annualTrafficFlow"]) == [5000, 12000]


def test_dataset_and_tile_profile_wired() -> None:
    ds = load_yaml("sources.yaml")["datasets"]["hvs"]
    assert ds["file"] == "uba/hvs_verkehrsmengen.pmtiles"

    args = tiles._profile_args(tiles._profiles()["hvs_lines"], layer_override="lines")
    assert "-l" in args and "lines" in args  # interner Layer = Frontend-Vertrag
    assert "--no-tile-size-limit" in args


def test_build_dry_run_constructs_command(capsys) -> None:
    out = hvs.build(dry_run=True)
    captured = capsys.readouterr().out
    assert out.name == "hvs_verkehrsmengen.pmtiles" and out.parent.name == "uba"
    assert "tippecanoe" in captured and "-l lines" in captured
