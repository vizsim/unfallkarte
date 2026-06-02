"""Smoke-Tests für das Phase-0-Gerüst: Config lädt, Registry ist plausibel."""

from __future__ import annotations

from unfallkarte.config import load_yaml


def test_accidents_registry_loads() -> None:
    acc = load_yaml("accidents.yaml")
    years = acc["years"]
    assert years, "keine Jahre in der Registry"
    # jedes Jahr braucht zip + csv_path zum Laden
    for year, spec in years.items():
        assert "zip" in spec, f"{year}: zip fehlt"
        assert "csv_path" in spec, f"{year}: csv_path fehlt"


def test_sources_have_label_or_live() -> None:
    src = load_yaml("sources.yaml")
    for key, meta in src["datasets"].items():
        assert "label" in meta, f"{key}: label fehlt"
        # entweder ein Datums-Schema, live:true ODER external (URL)
        has_kind = "date" in meta or meta.get("live") is True or "external" in meta
        assert has_kind, f"{key}: weder date noch live noch external"
