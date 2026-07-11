"""Tests für scenario9 (Unfallschwerpunkte nach M Uko, vereinfacht).

Synthetisch, ohne echte Daten und ohne tippecanoe: getestet wird die reine
Berechnung `compute_hotspots` (metrische Punkte -> deduplizierte Hotspots) sowie
der Länder-Abdeckungs-Check `_valid_laender`.
"""

from __future__ import annotations

import geopandas as gpd
import pytest
from shapely.geometry import Point

from unfallkarte.scenarios.scenario9_hotspots import (
    _valid_laender,
    compute_hotspots,
)

WINDOW = "2019–2021"  # en-dash wie im Modul (f"{lo}–{hi}")


def _cluster(base_x: float, n: int, dx: float = 5.0) -> list[Point]:
    """n Punkte auf einer Linie, je dx Meter Abstand (Spanne (n-1)*dx < eps=25 m)."""
    return [Point(base_x + i * dx, 0.0) for i in range(n)]


def _accidents() -> gpd.GeoDataFrame:
    """Vier Lagen + Jahres-Filler (alle ULAND=1, volle Abdeckung 2017–2024).

    - A: 5 Punkte gleicher UTYP1=2, UKAT=3, Jahre 2019–2021  -> up5_3y UND utyp5_3y
    - B: 4 Punkte gleicher Konfiguration (unter Schwelle)    -> kein Hotspot
    - C: 5 Punkte über 2017–2024 verstreut (kein 3-J-Fenster) -> kein Hotspot
    - D: 3 Punkte UKAT=1 in 2019–2021                        -> nur usp3_3y
    """
    geoms: list[Point] = []
    ujahr: list[int] = []
    utyp: list[int] = []
    ukat: list[int] = []

    # Hotspot A: 5x UTYP1=2, UKAT=3, 2019–2021 (2/2/1)
    geoms += _cluster(0.0, 5)
    ujahr += [2019, 2019, 2020, 2020, 2021]
    utyp += [2] * 5
    ukat += [3] * 5

    # Kein Hotspot B: 4x gleiche Konfiguration -> unter up5/utyp5-Schwelle
    geoms += _cluster(5000.0, 4)
    ujahr += [2019, 2019, 2020, 2021]
    utyp += [2] * 4
    ukat += [3] * 4

    # Kein Hotspot C: 5x UTYP1=4, über 8 Jahre verstreut -> nie 5 in 3 Jahren
    geoms += _cluster(10000.0, 5)
    ujahr += [2017, 2019, 2021, 2023, 2024]
    utyp += [4] * 5
    ukat += [3] * 5

    # Hotspot D: 3x UKAT=1 (schwer), 2019–2021 -> nur usp3_3y
    geoms += _cluster(15000.0, 3)
    ujahr += [2019, 2020, 2021]
    utyp += [3] * 3
    ukat += [1] * 3

    # Jahres-Filler: je 1 isolierter Punkt pro Jahr -> sichert volle ULAND-Abdeckung,
    # bleibt selbst Rauschen (1 km Abstand, nie geclustert).
    for i, year in enumerate(range(2017, 2025)):
        geoms.append(Point(20000.0 + i * 1000.0, 0.0))
        ujahr.append(year)
        utyp.append(7)
        ukat.append(3)

    return gpd.GeoDataFrame(
        {
            "UJAHR": ujahr,
            "ULAND": [1] * len(geoms),
            "UKATEGORIE": ukat,
            "UTYP1": utyp,
            "geometry": geoms,
        },
        crs="EPSG:25832",
    )


def test_compute_hotspots_rules() -> None:
    hs = compute_hotspots(_accidents())

    # Genau drei Hotspots: A (up5), A (utyp5), D (usp3).
    assert len(hs) == 3
    assert set(hs["rule"]) == {"up5_3y", "usp3_3y", "utyp5_3y"}

    by_rule = {r: hs[hs["rule"] == r].iloc[0] for r in hs["rule"]}

    # up5_3y: Hotspot A, 5 Unfälle, nicht typbezogen, alle UKAT=3.
    up5 = by_rule["up5_3y"]
    assert int(up5["n_max"]) == 5
    assert int(up5["utyp"]) == 0
    assert up5["window_best"] == WINDOW
    assert int(up5["n_windows"]) >= 1
    assert int(up5["UKATEGORIE__3"]) == 5
    assert int(up5["UKATEGORIE__1"]) == 0 and int(up5["UKATEGORIE__2"]) == 0

    # utyp5_3y: gleicher Hotspot A, aber typbezogen (UTYP1=2).
    utyp5 = by_rule["utyp5_3y"]
    assert int(utyp5["n_max"]) == 5
    assert int(utyp5["utyp"]) == 2
    assert utyp5["window_best"] == WINDOW
    assert int(utyp5["UKATEGORIE__3"]) == 5

    # usp3_3y: Hotspot D, 3 schwere Unfälle (UKAT=1).
    usp3 = by_rule["usp3_3y"]
    assert int(usp3["n_max"]) == 3
    assert int(usp3["utyp"]) == 0
    assert usp3["window_best"] == WINDOW
    assert int(usp3["UKATEGORIE__1"]) == 3
    assert int(usp3["UKATEGORIE__2"]) == 0 and int(usp3["UKATEGORIE__3"]) == 0

    # Output bleibt im Eingangs-CRS (metrisch), Geometrien sind Polygone.
    assert hs.crs == "EPSG:25832"
    assert (hs.geom_type == "Polygon").all()


def test_valid_laender_coverage() -> None:
    # Land 1 hat 2017–2019 vollständig, Land 2 fehlt 2018.
    acc = gpd.GeoDataFrame(
        {
            "UJAHR": [2017, 2018, 2019, 2017, 2019],
            "ULAND": [1, 1, 1, 2, 2],
            "geometry": [Point(i, 0.0) for i in range(5)],
        },
        crs="EPSG:25832",
    )
    # Fenster 2017–2019: nur Land 1 ist in JEDEM Jahr vertreten.
    assert _valid_laender(acc, 2017, 2019) == {1}
    # Fenster 2017–2018: Land 2 fehlt 2018 -> ebenfalls nur Land 1.
    assert _valid_laender(acc, 2017, 2018) == {1}


def test_coverage_excludes_incomplete_land() -> None:
    # 5 Unfälle am selben Ort in 2017 & 2019 (kein 2018) in Land 2:
    # Der Coverage-Check schließt Land 2 aus Fenster 2017–2019 aus -> kein Hotspot.
    acc = gpd.GeoDataFrame(
        {
            "UJAHR": [2017, 2017, 2017, 2019, 2019],
            "ULAND": [2] * 5,
            "UKATEGORIE": [3] * 5,
            "UTYP1": [1] * 5,
            "geometry": _cluster(0.0, 5),
        },
        crs="EPSG:25832",
    )
    with pytest.raises(ValueError, match="keine Unfallhäufungen"):
        compute_hotspots(acc)
