"""Tests für laerm: Varianten-/Config-Wiring, coalesce-Profil, 2-km-Grid-Cut, Build."""

from __future__ import annotations

from pathlib import Path

import geopandas as gpd
from shapely.geometry import box

from unfallkarte import laerm, tiles
from unfallkarte.config import load_yaml


def test_variants_wired_to_sources_and_layers() -> None:
    datasets = load_yaml("sources.yaml")["datasets"]
    expected = {
        "laerm_den": ("laerm_hlq_den-polys", "noise/laerm_den.pmtiles"),
        "laerm_night": ("laerm_4120_hlq_night-polys", "noise/laerm_night.pmtiles"),
    }
    assert set(laerm.VARIANTS) == set(expected)
    for name, v in laerm.VARIANTS.items():
        layer, file = expected[name]
        assert v.layer == layer  # interner Layer = Frontend-Vertrag (source-layer)
        assert v.layer.endswith("-polys")
        assert datasets[v.dataset]["file"] == file


def test_laerm_profile_has_coalesce() -> None:
    # Regression: tiles.py muss coalesce-Flags aus dem Profil durchreichen (1:1 Notebook).
    args = tiles._profile_args(tiles._profiles()["laerm"], layer_override="laerm_hlq_den-polys")
    assert "--coalesce" in args and "--coalesce-densest-as-needed" in args
    assert "-l" in args and "laerm_hlq_den-polys" in args
    assert "--minimum-zoom=6" in args and "--maximum-zoom=14" in args


def test_to_fgb_grid_cuts_big_polygon_and_keeps_class(tmp_path: Path) -> None:
    # Ein ~4 km großes Polygon (4326) muss am 2-km-Raster in mehrere Stücke zerfallen.
    src = tmp_path / "laerm.geojson"
    gpd.GeoDataFrame(
        {"Lärmpegelklasse": ["Lden6064"], "source": ["road"],
         "geometry": [box(10.00, 50.00, 10.06, 50.04)]},
        crs="EPSG:4326",
    ).to_file(src, driver="GeoJSON")

    fgb = tmp_path / "out.fgb"
    out, n = laerm.to_fgb(src, fgb)

    assert out.exists()
    assert n > 1  # Grid-Cut hat das eine Polygon zerschnitten
    gdf = gpd.read_file(out)
    assert gdf.crs.to_epsg() == 4326  # Output immer 4326 (CLAUDE.md)
    assert (gdf["Lärmpegelklasse"] == "Lden6064").all()  # Attribut erhalten
    assert set(gdf.geom_type) <= {"Polygon"}  # exploded -> nur Einzelpolygone


def test_build_dry_run_constructs_command(capsys) -> None:
    out = laerm.build("laerm_den", dry_run=True)
    captured = capsys.readouterr().out
    assert out.name == "laerm_den.pmtiles" and out.parent.name == "noise"
    assert "tippecanoe" in captured and "-l laerm_hlq_den-polys" in captured
