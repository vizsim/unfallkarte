"""Generiert data/manifest.json: Local-first-Index + Datenstand je Quelle.

Eine Datei für beides — das Frontend liest sie einmal: (a) welche PMTiles lokal
vorliegen (sonst B2-Fallback), (b) „Stand:"-Anzeige je Layer. Gespeist aus der
handgepflegten config/sources.yaml; Datum für `date: auto` wird hier aufgelöst.
"""

from __future__ import annotations

import json
from datetime import date
from pathlib import Path
from typing import Any

from unfallkarte.config import get_paths, load_yaml


def _accidents_vintage() -> str | None:
    """Max-Jahr aus dem tatsächlich gebauten Accident-Parquet-Dateinamen."""
    files = sorted(get_paths().out("accidents").glob("accidents_germany_*_oid.parquet"))
    if not files:
        return None
    parts = files[-1].stem.split("_")  # accidents_germany_<min>-<max>_oid
    rng = next((p for p in parts if "-" in p and p[:4].isdigit()), None)
    return rng.split("-")[-1] if rng else None


def _osm_vintage() -> str | None:
    """Datenstand der Geofabrik-PBF via osmium (None, wenn nicht ermittelbar)."""
    from unfallkarte import osm

    cfg = load_yaml("osm.yaml")["geofabrik"]
    return osm.data_date(get_paths().raw / "osm" / cfg["pbf"])


def _telraam_vintage() -> str | None:
    """Datenstand = Build-Zeit des Telraam-PMTiles (Segment-Standorte ändern sich selten)."""
    f = get_paths().out("telraam") / "telraam_segments.pmtiles"
    return date.fromtimestamp(f.stat().st_mtime).isoformat() if f.exists() else None


def _resolve_date(dataset_id: str, date_spec: Any) -> str | None:
    if isinstance(date_spec, dict) and "fixed" in date_spec:
        return str(date_spec["fixed"])
    if date_spec == "osm":  # explizit OSM-getrieben (z.B. OSM-Szenarien ohne Unfallbezug)
        return _osm_vintage()
    if date_spec == "telraam":  # Harvest-getrieben (Telraam-API)
        return _telraam_vintage()
    if date_spec == "auto":
        # Szenarien sind unfallgetrieben -> Datenstand = max. Unfalljahr
        if dataset_id.startswith("accidents") or dataset_id.startswith("scenario"):
            return _accidents_vintage()
        if dataset_id.startswith(("osm", "maxspeed")):  # OSM-abgeleitete Layer
            return _osm_vintage()
    return None


def generate() -> Path:
    sources = load_yaml("sources.yaml")["datasets"]
    paths = get_paths()
    today = date.today().isoformat()

    manifest: dict[str, dict[str, Any]] = {}
    for ds_id, meta in sources.items():
        entry: dict[str, Any] = {"label": meta.get("label")}
        if meta.get("attribution"):
            entry["attribution"] = meta["attribution"]
        if meta.get("live"):
            entry["live"] = True
        elif "external" in meta:
            # Externe PMTiles per URL (z.B. mapillary_trafficsigns). Nicht local-first;
            # Frontend lädt direkt von der URL. Datenstand ggf. clientseitig.
            entry["external"] = meta["external"]
        else:
            entry["file"] = meta["file"]
            entry["present"] = (paths.data / meta["file"]).exists()
            entry["vintage"] = _resolve_date(ds_id, meta.get("date"))
            entry["built"] = today
        manifest[ds_id] = entry

    out = paths.data / "manifest.json"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(manifest, indent=2, ensure_ascii=False), encoding="utf-8")
    return out
