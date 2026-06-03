"""Szenario-Registry: name -> run-Funktion. Reihenfolge für run-all.

Implementiert: scenario2, scenario6. Die übrigen sind als PLANNED gelistet (nach
gleichem Muster portieren — geo.py-Helfer + tiles.build_dual_layer/build_multi_layer).
"""

from __future__ import annotations

from collections.abc import Callable
from pathlib import Path

from .base import ScenarioContext
from .scenario1_clusters_ms100 import run as run_scenario1
from .scenario2_schools import run as run_scenario2
from .scenario3_tempo30_continuous import run as run_scenario3
from .scenario6_schools_tempo50 import run as run_scenario6
from .scenario8_schools_noise import run as run_scenario8

REGISTRY: dict[str, Callable[[ScenarioContext], Path]] = {
    "scenario1": run_scenario1,
    "scenario2": run_scenario2,
    "scenario3": run_scenario3,
    "scenario6": run_scenario6,
    "scenario8": run_scenario8,
}

# scenario4/5/7 (Mapillary-Mapping) wurden bewusst NICHT übernommen. Alle übrigen
# Szenarien sind portiert -> PLANNED leer.
PLANNED: dict[str, str] = {}

# Reihenfolge für run-all (nur implementierte).
ORDER: list[str] = ["scenario1", "scenario2", "scenario3", "scenario6", "scenario8"]
