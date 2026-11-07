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


def test_profile_args_translate_include_and_exclude() -> None:
    args = tiles._profile_args({"include": ["A", "B"], "exclude": ["C"]})
    assert args.count("-y") == 2 and args.count("-x") == 1
    # Paarweise, nicht nur irgendwo in der Liste: -y A -y B -x C
    assert [args[i + 1] for i, a in enumerate(args) if a == "-y"] == ["A", "B"]
    assert [args[i + 1] for i, a in enumerate(args) if a == "-x"] == ["C"]


def test_accident_profiles_carry_only_frontend_attributes() -> None:
    """Die Attribut-Diät ist ein Vertrag mit dem Frontend: die Einzel-Unfälle tragen
    die 13 gelesenen Spalten, die Cluster NUR die drei Summen für die Torten.
    Gegenstück im Browser: tests/web/contract.spec.js (Style -> Tile-Metadaten)."""
    profiles = tiles._profiles()
    single = profiles["accidents_single"]["include"]
    assert "UKATEGORIE" in single and "UJAHR" in single and "IstRad" in single
    # Die One-Hot-Spalten entstehen nur für die Cluster-Akkumulation.
    assert not any(k.startswith("UKATEGORIE__") for k in single)
    for name in ("clusters_6_8", "clusters_9_11"):
        prof = profiles[name]
        assert prof["include"] == ["UKATEGORIE__1", "UKATEGORIE__2", "UKATEGORIE__3"]
        # Jede akkumulierte Spalte muss die Diät überleben, sonst summiert tippecanoe ins Leere.
        assert {a.split(":")[0] for a in prof["accumulate"]} <= set(prof["include"])


def _modes_parquet(tmp_path):
    """Drei Unfälle: Rad+Pkw, nur Fuß, ohne Beteiligung (Grenzfall)."""
    gdf = gpd.GeoDataFrame(
        {
            "UKATEGORIE": [3, 1, 2], "UTYP1": [2, 4, 7], "UART": [5, 6, 0],
            "UJAHR": [2024, 2017, 2025],
            "IstRad": [1, 0, 0], "IstPKW": [1, 0, 0], "IstFuss": [0, 1, 0],
            "IstKrad": [0, 0, 0], "IstGkfz": [0, 0, 0], "IstSonstig": [0, 0, 0],
        },
        geometry=[Point(13.4, 52.52), Point(13.5, 52.53), Point(13.6, 52.54)],
        crs="EPSG:4326",
    )
    path = tmp_path / "acc.parquet"
    gdf.to_parquet(path)
    return path


def test_cluster_modes_geojson_is_sparse_with_bitmask(tmp_path) -> None:
    """Je Unfall NUR die eigenen Merkmale (= 1), Beteiligung als Bitmaske in der Reihenfolge
    aus tiles.yaml — Vertrag mit js/map/clusterModes.js."""
    import gzip
    import json

    cfg = tiles.load_yaml("tiles.yaml")["accidents_build"]
    out = tmp_path / "modes.geojsonl.gz"
    fields = tiles.write_cluster_modes_geojson(
        _modes_parquet(tmp_path), out, cfg["cluster_modes_columns"], cfg["beteiligung_bits"]
    )
    rows = [json.loads(line) for line in gzip.open(out, "rt")]
    assert [r["properties"] for r in rows] == [
        # Rad = Bit 1, Pkw = Bit 2 -> 3; Fuß = Bit 4; ohne Beteiligung kein BET-Feld
        {"UKATEGORIE__3": 1, "UTYP1__2": 1, "UART__5": 1, "UJAHR__2024": 1, "BET__3": 1},
        {"UKATEGORIE__1": 1, "UTYP1__4": 1, "UART__6": 1, "UJAHR__2017": 1, "BET__4": 1},
        {"UKATEGORIE__2": 1, "UTYP1__7": 1, "UART__0": 1, "UJAHR__2025": 1},
    ]
    assert rows[0]["geometry"]["coordinates"] == [13.4, 52.52]
    assert "BET__3" in fields and "BET__0" not in fields and "UJAHR__2017" in fields
    assert cfg["beteiligung_bits"][:3] == ["IstRad", "IstPKW", "IstFuss"]


def test_cluster_modes_build_accumulates_every_field(tmp_path, monkeypatch, capsys) -> None:
    """Jedes vorkommende Feld wird summiert UND überlebt die Attribut-Diät; tile-join ohne
    500-KB-Grenze (sonst fallen dicke Übersichts-Kacheln stumm weg)."""
    from unfallkarte.config import Paths

    monkeypatch.setattr(tiles, "write_cluster_modes_geojson",
                        lambda *a, **k: ["UTYP1__2", "BET__3"])
    monkeypatch.setattr(tiles, "which", lambda _: None)  # Binaries „fehlen" -> nur ausgeben
    # NIE die echten Datenpfade: der Build räumt seine Zwischendateien auf und hätte einem
    # parallel laufenden echten Build die halb geschriebene Kachel-Datei weggelöscht.
    monkeypatch.setattr(tiles, "get_paths", lambda: Paths(root=tmp_path))
    tiles.build_cluster_modes(_modes_parquet(tmp_path))
    out = capsys.readouterr().out
    for field in ("UTYP1__2", "BET__3"):
        assert f"--accumulate-attribute={field}:sum" in out and f"-y {field}" in out
    assert "--cluster-distance=25" in out and "--cluster-distance=10" in out
    assert "tile-join --force -o" in out and "--no-tile-size-limit" in out
