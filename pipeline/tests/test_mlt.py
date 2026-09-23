"""MLT-Variante der Unfall-Tiles: Werkzeug-Aufruf + Dateinamen-Vertrag (docs/MLT_EVALUATION.md)."""

from __future__ import annotations

from pathlib import Path

import pytest

from unfallkarte import tiles
from unfallkarte.config import load_yaml


def test_mvt_to_mlt_calls_the_node_tool(tmp_path: Path, capsys: pytest.CaptureFixture[str]) -> None:
    out = tiles.mvt_to_mlt(tmp_path / "in.pmtiles", tmp_path / "out.pmtiles", dry_run=True)
    assert out == tmp_path / "out.pmtiles"
    assert f"node {tiles.MVT_TO_MLT} {tmp_path / 'in.pmtiles'} {out}" in capsys.readouterr().out
    # Pfad-Drift fangen: das Werkzeug muss dort liegen, wo die Pipeline es aufruft.
    assert tiles.MVT_TO_MLT.is_file()


def test_mlt_output_has_its_own_file_name() -> None:
    # Eigener Name: eine noch gecachte alte Seite läse MLT-Kacheln sonst als MVT.
    build = load_yaml("tiles.yaml")["accidents_build"]
    assert build["single_mlt_output"] != build["single_output"]


def test_sources_yaml_points_to_the_mlt_file() -> None:
    # sources.yaml (-> Manifest; ACCIDENT_SOURCES hält tests/unit/accidentSources.test.js dagegen)
    # zeigt auf die MLT-Datei, die die Pipeline baut.
    build = load_yaml("tiles.yaml")["accidents_build"]
    single = load_yaml("sources.yaml")["datasets"]["accidents_single"]
    assert single["file"] == f"accidents/{build['single_mlt_output']}"
