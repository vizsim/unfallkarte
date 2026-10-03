"""Synthetische Unfälle im Schema von accidents.harmonize() — für Tests ohne Daten.

Mit den Eigenheiten der Echtdaten: UIDENTSTLAE fehlt 2016/2018/2019, ist 2021 für NRW
verstümmelt (19-stellig, doppelt), OBJECTID fehlt 2025, IstGkfz 2017, PLST vor 2023.
Orte: Kottbusser Tor und Köln, weil die README-Beispiele dort abfragen.

Genutzt von tests/test_publish.py und — als kleine Veröffentlichung — von den Playwright-Tests
des Karten-Exports (tests/fixtures/export/ im Repo-Root). Die neu schreiben:

    uv run python tests/synthetic.py
"""

from __future__ import annotations

import sys
from pathlib import Path

import numpy as np
import pandas as pd

# Land, RegBez, Kreis, Gemeinde, Länge, Breite, Streuung (Grad), erstes Jahr.
ORTE = [
    (11, 0, 2, 2, 13.4183, 52.4990, 0.0002, 2018),  # Berlin, Kottbusser Tor
    (11, 0, 2, 2, 13.4100, 52.5000, 0.0050, 2018),  # Berlin-Kreuzberg
    (5, 3, 15, 0, 6.9600, 50.9400, 0.0200, 2019),   # Köln
    (2, 0, 0, 0, 9.9900, 53.5500, 0.0200, 2016),    # Hamburg
    (13, 0, 3, 0, 12.1000, 54.0900, 0.0200, 2020),  # Rostock
]
ERSTES_JAHR = {"02": 2016, "05": 2019, "11": 2018, "13": 2020}
N = 30  # Unfälle je Ort und Jahr

# Ziel der Web-Fixture (Repo-Root/tests/fixtures/export/<dataset>/).
WEB_FIXTURE = Path(__file__).resolve().parents[2] / "tests" / "fixtures" / "export"
WEB_VERSION = "2026-10-01"


def harmonisiert() -> pd.DataFrame:
    """Kleine Tabelle im Schema von accidents.harmonize()."""
    rng = np.random.default_rng(7)
    teile = []
    for jahr in range(2016, 2026):
        oid = 0
        for land, rb, kr, gem, lon, lat, s, ab in ORTE:
            if jahr < ab:
                continue
            k = np.arange(oid, oid + N)
            oid += N
            if jahr in (2016, 2018, 2019):
                uid = [None] * N
            elif jahr == 2021 and land == 5:  # als Zahl gerundet: führende Null weg, doppelt
                uid = [f"5{jahr % 100}{i % 7:012d}0000" for i in k]
            else:
                uid = [f"{land:02d}{jahr % 100}{i:012d}{jahr}" for i in k]
            ints = {c: rng.integers(lo, hi, N) for c, lo, hi in [
                ("UMONAT", 1, 13), ("USTUNDE", 0, 24), ("UWOCHENTAG", 1, 8),
                ("UKATEGORIE", 1, 4), ("UART", 0, 10), ("UTYP1", 1, 8), ("LICHT", 0, 3),
                ("USTRZUSTAND", 0, 3), ("IstRad", 0, 2), ("IstPKW", 0, 2), ("IstFuss", 0, 2),
                ("IstKrad", 0, 2), ("IstSonstig", 0, 2)]}
            # Wie in den Echtdaten: jeder Unfall hat mindestens eine Beteiligung (sonst
            # zeigte ihn die Karte nicht, deren Filter die Beteiligungen ODER-verknüpft).
            flags = ("IstRad", "IstPKW", "IstFuss", "IstKrad", "IstSonstig")
            ints["IstSonstig"][sum(ints[c] for c in flags) == 0] = 1
            teile.append(pd.DataFrame({
                "OBJECTID": (k + 1).astype(float) if jahr != 2025 else np.nan,
                "UIDENTSTLA": uid,
                "ULAND": land, "UREGBEZ": rb, "UKREIS": kr, "UGEMEINDE": gem, "UJAHR": jahr,
                **ints,
                "IstGkfz": rng.integers(0, 2, N).astype(float) if jahr != 2017 else np.nan,
                "PLST": rng.integers(1, 3, N).astype(float) if jahr >= 2023 else np.nan,
                "LINREFX": 0.0, "LINREFY": 0.0,
                "XGCSWGS84": lon + rng.normal(0, s, N),
                "YGCSWGS84": lat + rng.normal(0, s, N),
            }))
    return pd.concat(teile, ignore_index=True)


def write_web_fixture() -> Path:
    """Kleine Veröffentlichung für tests/web/export.spec.js: nur Parquet + latest.json."""
    from unfallkarte import publish

    cfg = {**publish.load_config(), "row_group_size": 200, "erstes_jahr": ERSTES_JAHR}
    out = WEB_FIXTURE / cfg["dataset"]
    for old in out.glob("*") if out.exists() else []:
        old.unlink()
    latest = publish.write_all(harmonisiert(), out, cfg, version=WEB_VERSION)
    for extra in (cfg["alias"], "coverage.csv", "schluessel.csv", "SHA256SUMS", "README.md"):
        (out / extra).unlink()
    print(f"{out / latest['datei']}: {latest['zeilen']} Unfälle, {latest['bytes'] / 1e3:.0f} KB")
    return out


if __name__ == "__main__":
    sys.exit(0 if write_web_fixture() else 1)
