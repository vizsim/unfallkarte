"""Golden-Reference der Accident-Pipeline — jetzt im pytest statt nur als Handkommando.

tests/golden/golden.py gab es schon lange, aber niemand rief es auf: das Sicherheitsnetz
für die Pipeline existierte nur, wenn man daran dachte. Hier hängt es an `uv run pytest`
und damit auch in der CI.

Zwei Stufen, weil die CI keine Daten hat:
  * der Abgleich gegen das echte Parquet läuft nur lokal (sonst skip),
  * die Plausibilität der Referenz selbst läuft IMMER — sie fängt den Fall, dass ein neues
    Datenjahr in accidents.yaml landet, aber niemand die Referenz neu aufnimmt.
"""

from __future__ import annotations

import importlib.util
import sys
from pathlib import Path

import pytest

from unfallkarte.config import get_paths, load_yaml

GOLDEN_JSON = Path(__file__).parent / "golden" / "accidents.json"


def _golden_module():
    """tests/golden/golden.py laden — liegt als Skript daneben, nicht als Paket."""
    spec = importlib.util.spec_from_file_location("golden", GOLDEN_JSON.parent / "golden.py")
    module = importlib.util.module_from_spec(spec)
    sys.modules["golden"] = module
    spec.loader.exec_module(module)
    return module


def _expected_parquet() -> Path:
    """Pfad wie accidents.build ihn bildet: <subdir>/<basename>_<min>-<max>_oid.parquet."""
    cfg = load_yaml("accidents.yaml")
    years = sorted(int(y) for y in cfg["years"])
    out = cfg["output"]
    return get_paths().out(out["subdir"]) / f"{out['basename']}_{years[0]}-{years[-1]}_oid.parquet"


def test_reference_covers_the_configured_years() -> None:
    """Läuft auch ohne Daten: deckt die Referenz noch alle Jahre aus der Registry ab?

    Genau hier reißt es, wenn jemand ein Jahr in accidents.yaml ergänzt und vergisst, die
    Referenz neu aufzunehmen — dann prüfte der Abgleich unten stillschweigend zu wenig.
    """
    reference = _golden_module()
    assert GOLDEN_JSON.exists(), f"Golden-Referenz fehlt: {GOLDEN_JSON}"

    want = __import__("json").loads(GOLDEN_JSON.read_text(encoding="utf-8"))
    configured = {str(y) for y in load_yaml("accidents.yaml")["years"]}
    covered = set(want["per_year"])

    missing = sorted(configured - covered)
    assert not missing, (
        f"Jahre in accidents.yaml, aber nicht in der Golden-Referenz: {missing}. "
        f"Nach dem Build neu aufnehmen: uv run python tests/golden/golden.py capture "
        f"{_expected_parquet()} {GOLDEN_JSON}"
    )
    assert want["n_rows"] == sum(want["per_year"].values()), "n_rows passt nicht zur Jahres-Summe"
    assert reference.measure is not None  # Modul ist ladbar (Syntax/Importe intakt)


@pytest.mark.skipif(
    not _expected_parquet().exists(),
    reason="kein Accident-Parquet lokal (die CI hat keine Daten)",
)
def test_parquet_matches_reference() -> None:
    """Der eigentliche Abgleich: Zeilenzahl, Spalten, Unfälle je Jahr, CRS."""
    diffs = _golden_module().diff(str(_expected_parquet()), str(GOLDEN_JSON))
    assert not diffs, "Abweichung zur Golden-Reference:\n  - " + "\n  - ".join(diffs)
