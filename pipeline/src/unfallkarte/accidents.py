"""Unfalldaten: laden, harmonisieren, als GeoParquet exportieren.

Ersetzt das alte `data_get_accident_data`-Notebook. Sämtliche Jahres-Quirks
(Pfade, Spalten-Renames) stecken in config/accidents.yaml — neues Jahr = ein
YAML-Block, kein Code-Edit hier.
"""

from __future__ import annotations

import io
import zipfile
from pathlib import Path
from typing import Any

import geopandas as gpd
import pandas as pd
import requests

from unfallkarte.config import get_paths, load_yaml

_CFG = "accidents.yaml"
_SUBDIR = "accidents"  # data/raw/accidents/<year>/ und data/accidents/ (Output)


def _registry() -> dict[str, Any]:
    return load_yaml(_CFG)


def _select_years(cfg: dict[str, Any], years: list[str] | None) -> list[str]:
    available = list(cfg["years"])
    if years is None:
        return sorted(available)
    unknown = [y for y in years if y not in available]
    if unknown:
        raise ValueError(f"Unbekannte Jahre (nicht in Registry): {unknown}")
    return sorted(years)


def _csv_path(year: str, spec: dict[str, Any]) -> Path:
    return get_paths().raw / _SUBDIR / year / spec["csv_path"]


def map_years(cfg: dict[str, Any] | None = None) -> list[str]:
    """Jahre für Karte, Kacheln und Szenarien — ohne `karte: false` (nur Veröffentlichung)."""
    cfg = cfg or _registry()
    return sorted(y for y, spec in cfg["years"].items() if spec.get("karte", True))


def _available(cfg: dict[str, Any], years: list[str] | None) -> list[str]:
    selected = [y for y in _select_years(cfg, years) if _csv_path(y, cfg["years"][y]).exists()]
    if not selected:
        raise FileNotFoundError("Keine entpackten Jahres-CSVs gefunden — erst `accidents fetch`.")
    return selected


def fetch(years: list[str] | None = None, *, force: bool = False) -> list[str]:
    """Lädt die Jahres-ZIPs und entpackt sie nach data/raw/accidents/<year>/.

    Bereits vorhandene (entpackte) Jahre werden übersprungen (außer force=True).
    Jahre mit `verify: true` (z.B. 2024, Quelle noch nicht bestätigt) werden bei
    einem Download-Fehler nur gewarnt, nicht als Fehler behandelt.
    """
    cfg = _registry()
    base = cfg["download_base"]
    get_paths().ensure()
    done: list[str] = []
    for year in _select_years(cfg, years):
        spec = cfg["years"][year]
        marker = _csv_path(year, spec)
        if marker.exists() and not force:
            done.append(year)
            continue
        url = base + spec["zip"]
        try:
            resp = requests.get(url, timeout=180)
            resp.raise_for_status()
        except requests.RequestException as exc:
            if spec.get("verify"):
                print(f"  ! {year}: Download fehlgeschlagen ({exc}); verify-Jahr → übersprungen")
                continue
            raise
        dest = get_paths().raw / _SUBDIR / year
        dest.mkdir(parents=True, exist_ok=True)
        with zipfile.ZipFile(io.BytesIO(resp.content)) as zf:
            zf.extractall(dest)
        if not marker.exists():
            msg = f"{year}: csv_path '{spec['csv_path']}' nach Entpacken nicht gefunden"
            if spec.get("verify"):
                print(f"  ! {msg} → übersprungen (verify-Jahr)")
                continue
            raise FileNotFoundError(msg)
        done.append(year)
    return done


def harmonize(years: list[str] | None = None) -> pd.DataFrame:
    """Liest die (vorhandenen) Jahres-CSVs und vereinheitlicht sie zu EINER Tabelle.

    Spaltennamen nach `rename`, alle vier Koordinatenspalten Komma->Punkt, Unfallnummer als
    Text. Noch mit allen Spalten (UIDENTSTLA, OBJECTID, LINREF*) — `build()` verwirft für die
    Kacheln einen Teil, `publish` bildet daraus das öffentliche Schema. Default: alle Jahre
    der Registry, auch die mit `karte: false`.
    """
    cfg = _registry()
    rename = cfg.get("rename", {})
    text = dict.fromkeys(cfg.get("text_cols", []), str)

    frames: list[pd.DataFrame] = []
    for year in _available(cfg, years):
        spec = cfg["years"][year]
        df = pd.read_csv(
            _csv_path(year, spec), sep=spec.get("sep", ";"), low_memory=False, dtype=text
        )
        frames.append(df.rename(columns=rename))
    data = pd.concat(frames, ignore_index=True)

    # Koordinaten: Komma->Punkt, float.
    for col in (cfg["lon_col"], cfg["lat_col"], *cfg.get("utm_cols", [])):
        if col in data:
            data[col] = data[col].astype(str).str.replace(",", ".", regex=False).astype(float)
    return data


def build(years: list[str] | None = None) -> Path:
    """Harmonisiert alle (vorhandenen) Kartenjahre zu einem GeoParquet.

    Output: data/accidents/<basename>_<min>-<max>_oid.parquet. Der Jahresbereich
    wird aus den tatsächlich gebauten Jahren abgeleitet (kein hartes '2017-2023').
    Jahre mit `karte: false` (nur Veröffentlichung) bleiben draußen.
    """
    cfg = _registry()
    paths = get_paths()
    lon, lat = cfg["lon_col"], cfg["lat_col"]

    karte = map_years(cfg)
    selected = _available(cfg, [y for y in _select_years(cfg, years) if y in karte])
    data = harmonize(selected)

    gdf = gpd.GeoDataFrame(
        data, geometry=gpd.points_from_xy(data[lon], data[lat]), crs=cfg["crs"]
    )
    gdf = gdf.drop(columns=cfg.get("drop_columns", []), errors="ignore")

    yrs = sorted(int(y) for y in selected)
    out_cfg = cfg["output"]
    out = paths.out(out_cfg["subdir"]) / f"{out_cfg['basename']}_{yrs[0]}-{yrs[-1]}_oid.parquet"
    out.parent.mkdir(parents=True, exist_ok=True)
    gdf.to_parquet(out)
    return out
