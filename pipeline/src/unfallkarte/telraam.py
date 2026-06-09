# SPDX-License-Identifier: AGPL-3.0-or-later
"""Telraam-Kontextlayer: aktive Verkehrszähl-Segmente mit Ø Auto/Rad pro Tag.

Pipeline in drei API-Schritten (Token aus .env, CC BY-NC 4.0):
  1. segments/all      -> alle Segment-Geometrien (weltweit, EPSG:31370).
  2. traffic_snapshot  -> die aktuell AKTIVEN DE-Segmente (1 Call; tote Sensoren
                          tauchen gar nicht auf -> Aktiv-Filter gratis).
  3. reports/traffic   -> je aktivem Segment der 14-Tage-Verlauf (per-hour), den
                          wir zu Ø Auto/Tag + Ø Rad/Tag aggregieren.
Ergebnis: nur aktive Segmente, reprojiziert nach 4326, als PMTiles mit Properties
`oidn, car_per_day, bike_per_day, days_with_data, last_seen`. Das Frontend färbt
nach Modus (Auto/Rad) und verlinkt per Klick auf telraam.net/en/location/<oidn>.
"""

from __future__ import annotations

import json
import time
from collections import defaultdict
from datetime import UTC, datetime, timedelta
from pathlib import Path

import requests

from unfallkarte import tiles
from unfallkarte.config import get_paths, get_settings, load_yaml

_API = "https://telraam-api.net/v1"
# Deutschland-Bbox (grob inkl. Puffer): lon_min, lat_min, lon_max, lat_max
_DE_BBOX = (5.8, 47.2, 15.1, 55.1)
_SOURCE_CRS = "EPSG:31370"  # Telraam liefert segments/all global in Belgischem Lambert72

WINDOW_DAYS = 14            # Mittelungsfenster für die Tagesstärke
MIN_UPTIME_HOURS = 3.0      # ein Tag zählt nur, wenn Σ uptime-Stunden >= dieser Schwelle
_RATE_SLEEP = 1.1           # API-Limit: 1 req/s -> defensiv throtteln


def _raw() -> Path:
    return get_paths().raw / "telraam"


def _dataset() -> dict:
    return load_yaml("sources.yaml")["datasets"]["telraam_segments"]


def _token() -> str:
    token = get_settings().telraam_api_key
    if not token:
        raise RuntimeError("TELRAAM_API_KEY fehlt in pipeline/.env")
    return token


def _post(path: str, body: dict, *, token: str) -> dict:
    resp = requests.post(
        f"{_API}{path}",
        json=body,
        headers={"X-Api-Key": token, "Content-Type": "application/json"},
        timeout=120,
    )
    resp.raise_for_status()
    return resp.json()


# --- 1) Geometrie ----------------------------------------------------------
def fetch(*, force: bool = False) -> Path:
    """Lädt segments/all (weltweit, EPSG:31370) nach data/raw/telraam/segments_all.json."""
    _raw().mkdir(parents=True, exist_ok=True)
    dest = _raw() / "segments_all.json"
    if dest.exists() and not force:
        print(f"  vorhanden: {dest}")
        return dest
    print(f"  lade {_API}/segments/all")
    resp = requests.get(
        f"{_API}/segments/all", headers={"X-Api-Key": _token()}, timeout=180
    )
    resp.raise_for_status()
    dest.write_bytes(resp.content)
    return dest


# --- 2) aktive DE-Segmente -------------------------------------------------
def fetch_snapshot(*, force: bool = False) -> Path:
    """Lädt den Live-Snapshot der DE-Bbox -> aktive Segmente. 1 Call."""
    _raw().mkdir(parents=True, exist_ok=True)
    dest = _raw() / "snapshot.json"
    if dest.exists() and not force:
        print(f"  vorhanden: {dest}")
        return dest
    lon0, lat0, lon1, lat1 = _DE_BBOX
    print("  lade traffic_snapshot (DE-Bbox)")
    data = _post(
        "/reports/traffic_snapshot",
        {"time": "live", "contents": "minimal", "area": f"{lon0},{lat0},{lon1},{lat1}"},
        token=_token(),
    )
    dest.write_text(json.dumps(data), encoding="utf-8")
    return dest


def active_ids(snapshot_json: Path) -> list[int]:
    feats = json.loads(snapshot_json.read_text(encoding="utf-8"))["features"]
    return sorted({f["properties"]["segment_id"] for f in feats})


# --- 3) Verkehrsstärke je Segment -----------------------------------------
def aggregate_traffic(report: list[dict]) -> dict | None:
    """Stunden-Report -> Ø Auto/Tag + Ø Rad/Tag (Mittel über Tage mit echten Daten).

    Pro Zeitstempel die Zeile mit der höchsten uptime behalten (robust gegen
    mehrere Instanzen). Tag zählt nur, wenn Σ uptime-Stunden >= MIN_UPTIME_HOURS.
    Reiner Schritt ohne Netz -> testbar.
    """
    hourly: dict[str, dict] = {}
    for row in report:
        ts = row.get("date")
        if ts is None:
            continue
        up = row.get("uptime") or 0.0
        if ts not in hourly or up > (hourly[ts].get("uptime") or 0.0):
            hourly[ts] = row

    days: dict[str, dict] = defaultdict(lambda: {"car": 0.0, "bike": 0.0, "uptime": 0.0})
    for ts, row in hourly.items():
        d = days[ts[:10]]
        d["car"] += row.get("car") or 0.0
        d["bike"] += row.get("bike") or 0.0
        d["uptime"] += row.get("uptime") or 0.0

    valid = [v for v in days.values() if v["uptime"] >= MIN_UPTIME_HOURS]
    if not valid:
        return None
    n = len(valid)
    return {
        "car_per_day": round(sum(v["car"] for v in valid) / n, 1),
        "bike_per_day": round(sum(v["bike"] for v in valid) / n, 1),
        "days_with_data": n,
    }


def fetch_traffic(ids: list[int], *, force: bool = False) -> Path:
    """Holt je aktivem Segment den 14-Tage-Report und aggregiert. Gecacht in
    traffic_agg.json (das ist der teure ~452-Call-Schritt; wird nur bei force
    oder fehlender Datei erneut gezogen)."""
    dest = _raw() / "traffic_agg.json"
    if dest.exists() and not force:
        print(f"  vorhanden: {dest}")
        return dest

    token = _token()
    end = datetime.now(UTC).replace(hour=0, minute=0, second=0, microsecond=0)
    start = end - timedelta(days=WINDOW_DAYS)
    fmt = "%Y-%m-%d %H:%M:%SZ"
    t0, t1 = start.strftime(fmt), end.strftime(fmt)

    agg: dict[str, dict] = {}
    print(f"  hole {len(ids)} Segment-Reports ({WINDOW_DAYS}d, ~{len(ids)}s)…")
    for i, sid in enumerate(ids, 1):
        try:
            data = _post(
                "/reports/traffic",
                {"level": "segments", "format": "per-hour", "id": str(sid),
                 "time_start": t0, "time_end": t1},
                token=token,
            )
            res = aggregate_traffic(data.get("report", []))
            if res is not None:
                agg[str(sid)] = res
        except requests.HTTPError as exc:
            print(f"    ! {sid}: {exc}")
        time.sleep(_RATE_SLEEP)
        if i % 50 == 0:
            print(f"    {i}/{len(ids)} ({len(agg)} mit Daten)")
    dest.write_text(json.dumps(agg), encoding="utf-8")
    print(f"  aggregiert: {len(agg)}/{len(ids)} Segmente")
    return dest


# --- Assemblierung + Tiling ------------------------------------------------
def assemble_fgb(
    segments_json: Path, snapshot_json: Path, agg_json: Path, fgb: Path
) -> tuple[Path, int]:
    """Aktive Segment-Geometrien (31370->4326) + Ø-Werte -> FlatGeobuf. Pure-ish."""
    import geopandas as gpd
    from shapely.geometry import shape

    ids = set(active_ids(snapshot_json))
    agg = json.loads(agg_json.read_text(encoding="utf-8"))
    feats = json.loads(segments_json.read_text(encoding="utf-8"))["features"]

    rows, geoms = [], []
    for f in feats:
        oidn = f["properties"]["oidn"]
        if oidn not in ids:
            continue
        a = agg.get(str(oidn), {})
        rows.append({
            "oidn": oidn,
            "car_per_day": a.get("car_per_day"),
            "bike_per_day": a.get("bike_per_day"),
            "days_with_data": a.get("days_with_data"),
        })
        geoms.append(shape(f["geometry"]))

    gdf = gpd.GeoDataFrame(rows, geometry=geoms, crs=_SOURCE_CRS).to_crs("EPSG:4326")
    if gdf.empty:
        raise ValueError("Keine aktiven Segmente nach Join")
    fgb.parent.mkdir(parents=True, exist_ok=True)
    gdf.to_file(fgb, driver="FlatGeobuf")
    return fgb, len(gdf)


def build(*, refresh: bool = False, dry_run: bool = False) -> Path:
    """Voller Build: Geometrie + aktive IDs + Verkehrsstärke -> gefiltertes PMTiles.

    `refresh=True` zieht Snapshot + Traffic neu (sonst werden gecachte Rohdaten
    wiederverwendet). Layer-/Dateiname = Frontend-Vertrag.
    """
    segments = _raw() / "segments_all.json"
    snapshot = _raw() / "snapshot.json"
    agg = _raw() / "traffic_agg.json"

    if not dry_run:
        if not segments.exists():
            segments = fetch()
        snapshot = fetch_snapshot(force=refresh)
        ids = active_ids(snapshot)
        agg = fetch_traffic(ids, force=refresh)

    out = get_paths().data / _dataset()["file"]
    fgb = _raw() / "telraam_segments_de.fgb"
    if dry_run or not (segments.exists() and snapshot.exists() and agg.exists()):
        print("  [skip] Assemblierung (Rohdaten fehlen / dry-run)")
    else:
        _, n = assemble_fgb(segments, snapshot, agg, fgb)
        print(f"  aktive DE-Segmente mit Geometrie: {n}")
    return tiles.tippecanoe(
        "telraam_segments", fgb, out, layer_override="telraam_segments", dry_run=dry_run
    )
