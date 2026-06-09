"""Tests für telraam.aggregate_traffic (Stunden-Report -> Ø Auto/Rad pro Tag)."""

from __future__ import annotations

from unfallkarte import telraam


def _hours(day: str, n: int, uptime: float, car: float, bike: float) -> list[dict]:
    return [
        {"date": f"{day}T{h:02d}:00:00.000Z", "uptime": uptime, "car": car, "bike": bike}
        for h in range(n)
    ]


def test_aggregate_averages_only_valid_days() -> None:
    report = [
        *_hours("2026-06-01", 4, 0.9, 100, 50),   # Σ uptime 3.6 -> gültig: car 400, bike 200
        *_hours("2026-06-02", 4, 0.9, 200, 100),  # gültig: car 800, bike 400
        *_hours("2026-06-03", 2, 0.5, 999, 999),  # Σ uptime 1.0 < 3 -> verworfen
    ]
    res = telraam.aggregate_traffic(report)
    assert res == {"car_per_day": 600.0, "bike_per_day": 300.0, "days_with_data": 2}


def test_aggregate_dedupes_timestamp_keeping_higher_uptime() -> None:
    report = [
        *_hours("2026-06-01", 4, 0.9, 100, 50),
        {"date": "2026-06-01T00:00:00.000Z", "uptime": 0.1, "car": 9999, "bike": 9999},
    ]
    res = telraam.aggregate_traffic(report)
    # Die Dup-Zeile (niedrigere uptime) wird ignoriert -> Werte wie ohne sie
    assert res == {"car_per_day": 400.0, "bike_per_day": 200.0, "days_with_data": 1}


def test_aggregate_returns_none_without_valid_day() -> None:
    assert telraam.aggregate_traffic(_hours("2026-06-01", 5, 0.1, 100, 50)) is None
    assert telraam.aggregate_traffic([]) is None
