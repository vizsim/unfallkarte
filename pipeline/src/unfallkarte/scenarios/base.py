"""Gemeinsamer Kontext für Szenarien (aufgelöste Eingabe-/Ausgabe-Pfade)."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

from unfallkarte.config import get_paths


@dataclass
class ScenarioContext:
    accidents_parquet: Path  # data/accidents/accidents_germany_<min>-<max>_oid.parquet
    osm_raw: Path            # data/raw/osm/ (enthält die *.fgb aus `osm build`)
    out_dir: Path            # data/scenarios/
    laerm_raw: Path | None = None  # data/raw/laerm/ (UBA-Lärm-fgb, statisch; für sc8)
    dry_run: bool = False


def default_context(*, dry_run: bool = False) -> ScenarioContext:
    """Löst Standardpfade auf; nimmt das neueste Accident-Parquet."""
    paths = get_paths()
    acc_dir = paths.out("accidents")
    candidates = sorted(acc_dir.glob("accidents_germany_*_oid.parquet"))
    if not candidates:
        raise FileNotFoundError(f"Kein Accident-Parquet in {acc_dir} — erst `accidents build`.")
    return ScenarioContext(
        accidents_parquet=candidates[-1],
        osm_raw=paths.raw / "osm",
        out_dir=paths.out("scenarios"),
        laerm_raw=paths.raw / "laerm",
        dry_run=dry_run,
    )
