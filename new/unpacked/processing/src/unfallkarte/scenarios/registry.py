"""Szenario-Registry: name -> run-Funktion. Reihenfolge für run-all.

Implementiert: scenario2. Die übrigen sind als PLANNED gelistet (in VS Code
nach gleichem Muster portieren — geo.py-Helfer nutzen, tiles.build_dual_layer
bzw. passende Profile).
"""

from __future__ import annotations

from collections.abc import Callable
from pathlib import Path

from .base import ScenarioContext
from .scenario2_schools import run as run_scenario2

REGISTRY: dict[str, Callable[[ScenarioContext], Path]] = {
    "scenario2": run_scenario2,
}

# Noch zu portieren (Phase 3). Kurzbeschreibung je Szenario.
# Hinweis: scenario4/5/7 basieren auf Mapillary-Daten aus dem externen Repo
# vizsim/mapillary_trafficsigns (als `external`-PMTiles konsumieren, NICHT fetchen).
PLANNED: dict[str, str] = {
    "scenario1": "Cluster der Unfälle (marker-size 100)",
    "scenario3": "Tempo-30 durchgängig",
    "scenario4": "Tempo-30 fehlend — extern (mapillary_trafficsigns)",
    "scenario5": "Zebrastreifen fehlend — extern (mapillary markings)",
    "scenario6": "Tempo-50 vor Schulen (Highway-Länge, 30 m Buffer)",
    "scenario7": "fehlende Radwege — extern (mapillary_trafficsigns)",
    "scenario8": "Lärm vor Schulen",
}

# Reihenfolge für run-all (nur implementierte).
ORDER: list[str] = ["scenario2"]
