"""Veröffentlichung: alle Unfälle als eine GeoParquet-Datei für data.vizsim.de.

Nimmt `accidents.harmonize()` (alle Jahre der Registry, auch `karte: false`), bildet das
öffentliche Schema (Spaltennamen der Datensatzbeschreibung), sortiert räumlich entlang einer
Hilbert-Kurve und schreibt kleine Row Groups. So laden Skripte (DuckDB) und der spätere
Karten-Export per HTTP-Range nur den Ausschnitt, den sie brauchen.

Ausgabe data/publish/<dataset>/ (Konfiguration: config/publish.yaml):
  <dataset>_<min>-<max>_<stand>.parquet   versioniert, unveränderlich
  <dataset>_latest.parquet                dieselben Bytes unter festem Namen (Alias)
  latest.json                             Zeiger auf die aktuelle Datei + Metadaten
  coverage.csv, schluessel.csv, SHA256SUMS, README.md (aus config/publish_README.md)

`deploy()` lädt das per `b2 file upload` in den Bucket hinter data.vizsim.de — bewusst nicht
über `unfallkarte deploy` (b2 sync): Header je Datei, latest.json zuletzt, versionierte
Dateien nie überschreiben.
"""

from __future__ import annotations

import hashlib
import json
import os
import re
import shlex
import shutil
import subprocess
from datetime import date
from pathlib import Path
from shutil import which
from typing import Any

import numpy as np
import pandas as pd
import pyarrow as pa
import pyarrow.parquet as pq
import shapely
from pyproj import CRS

from unfallkarte import accidents
from unfallkarte.config import get_paths, get_settings, load_yaml

_CFG = "publish.yaml"

# Bounding Box für die Hilbert-Sortierung (etwas größer als Deutschland) und Plausibilität.
_BBOX = (5.5, 47.0, 15.5, 55.5)
_DE = (5.8, 47.2, 15.1, 55.1)

# Öffentliches Schema: Reihenfolge = Spaltenreihenfolge in der Datei.
SCHEMA = pa.schema(
    [
        ("unfall_id", pa.string()),
        ("UJAHR", pa.int16()),
        ("UMONAT", pa.int8()),
        ("USTUNDE", pa.int8()),
        ("UWOCHENTAG", pa.int8()),
        ("UKATEGORIE", pa.int8()),
        ("UART", pa.int8()),
        ("UTYP1", pa.int8()),
        ("ULICHTVERH", pa.int8()),
        ("USTRZUSTAND", pa.int8()),
        ("IstRad", pa.int8()),
        ("IstPKW", pa.int8()),
        ("IstFuss", pa.int8()),
        ("IstKrad", pa.int8()),
        ("IstGkfz", pa.int8()),
        ("IstSonstige", pa.int8()),
        ("PLST", pa.int8()),
        ("ULAND", pa.string()),
        ("UREGBEZ", pa.string()),
        ("UKREIS", pa.string()),
        ("UGEMEINDE", pa.string()),
        ("ags", pa.string()),
        ("XGCSWGS84", pa.float64()),
        ("YGCSWGS84", pa.float64()),
        ("geometry", pa.binary()),
    ]
)

_KEY_WIDTH = {"ULAND": 2, "UREGBEZ": 1, "UKREIS": 2, "UGEMEINDE": 3}
# Ohne Dictionary: (fast) eindeutige Werte, da kostet das Wörterbuch nur Platz.
_NO_DICT = {"unfall_id", "XGCSWGS84", "YGCSWGS84", "geometry"}
# Ohne Min/Max-Statistik: hilft beim Überspringen nicht, bläht nur den Footer auf.
_NO_STATS = {"geometry"}


def load_config() -> dict[str, Any]:
    """publish.yaml plus die aus `dataset` abgeleiteten Namen (Ordner, URL, Alias)."""
    cfg = load_yaml(_CFG)
    ds = cfg["dataset"]
    return {**cfg, "subdir": f"publish/{ds}", "base_url": f"{cfg['host']}{ds}/",
            "prefix": f"{ds}/", "alias": f"{ds}_latest.parquet"}


def _num(s: pd.Series) -> pd.Series:
    """Zahl aus CSV-Text mit Dezimalkomma (oder schon numerisch)."""
    if pd.api.types.is_numeric_dtype(s):
        return s.astype(float)
    return pd.to_numeric(s.astype(str).str.replace(",", ".", regex=False), errors="coerce")


def _key(s: pd.Series, width: int) -> pd.Series:
    """Schlüsselteil mit führenden Nullen (2021 liefert NRW z. B. ULAND 5 statt 05)."""
    return _num(s).astype("Int64").astype(str).str.zfill(width)


def hilbert_index(lon: np.ndarray, lat: np.ndarray, order: int) -> np.ndarray:
    """Position auf einer Hilbert-Kurve (xy2d), vektorisiert. Nah beieinander = nah im Index."""
    n = 1 << order
    x0, y0, x1, y1 = _BBOX
    x = np.clip(((lon - x0) / (x1 - x0) * (n - 1)).astype(np.int64), 0, n - 1)
    y = np.clip(((lat - y0) / (y1 - y0) * (n - 1)).astype(np.int64), 0, n - 1)
    d = np.zeros(len(x), dtype=np.uint64)
    s = n >> 1
    while s > 0:
        rx = (x & s) > 0
        ry = (y & s) > 0
        d += np.uint64(s) * np.uint64(s) * ((3 * rx.astype(np.uint64)) ^ ry.astype(np.uint64))
        flip = ~ry & rx
        x = np.where(flip, n - 1 - x, x)
        y = np.where(flip, n - 1 - y, y)
        swap = ~ry
        x, y = np.where(swap, y, x), np.where(swap, x, y)
        s >>= 1
    return d


def _nummer(out: pd.DataFrame) -> pd.Series:
    """Unfallnummer für die unfall_id, je Land und Jahr einheitlich gewählt.

    UIDENTSTLAE (20-stellig), wo sie in der Gruppe vollständig und eindeutig ist. Sonst für
    die ganze Gruppe `o<OBJECTID>` (laufende Nummer der Jahresdatei): 2016, 2018 und 2019 fehlt
    UIDENTSTLAE ganz, 2021 ist sie für NRW verstümmelt (als Zahl gerundet, nicht eindeutig).
    """
    if "UIDENTSTLAE" in out:
        nr = out["UIDENTSTLAE"].astype("string").str.zfill(20)
    else:
        nr = pd.Series(pd.NA, index=out.index, dtype="string")
    key = [out["UJAHR"].astype(int), out["ULAND"]]
    ok = nr.groupby(key).transform(lambda s: bool(s.notna().all() and s.is_unique)).astype(bool)
    oid = pd.to_numeric(out["OBJECTID"], errors="coerce").astype("Int64")
    if oid[~ok].isna().any():
        raise ValueError("unfall_id: weder UIDENTSTLAE noch OBJECTID für alle Zeilen einer Gruppe")
    return nr.where(ok, "o" + oid.astype("string"))


def to_public(df: pd.DataFrame, cfg: dict[str, Any]) -> pd.DataFrame:
    """Internes Schema (accidents.harmonize) → öffentliches Schema (Namen, abgeleitete Spalten)."""
    out = df.rename(columns=cfg["rename"]).copy()
    for col in ("XGCSWGS84", "YGCSWGS84"):
        out[col] = _num(out[col])
    for col, width in _KEY_WIDTH.items():
        out[col] = _key(out[col], width)
    out["ags"] = out["ULAND"] + out["UREGBEZ"] + out["UKREIS"] + out["UGEMEINDE"]
    # Der AGS vorn hält Min/Max der ID je Row Group eng (Datei ist räumlich sortiert).
    out["unfall_id"] = out["ags"] + "-" + out["UJAHR"].astype(int).astype(str) + "-" + _nummer(out)
    dup = out["unfall_id"].duplicated(keep=False)
    if dup.any():
        raise ValueError(f"unfall_id nicht eindeutig ({int(dup.sum())} Zeilen) — Schlüssel prüfen")
    x0, y0, x1, y1 = _DE
    bad = ~out["XGCSWGS84"].between(x0, x1) | ~out["YGCSWGS84"].between(y0, y1)
    if bad.any():
        raise ValueError(f"{int(bad.sum())} Koordinaten außerhalb Deutschlands")
    return out


def check_coverage(pub: pd.DataFrame, cfg: dict[str, Any]) -> None:
    """Abdeckung je Land gegen `erstes_jahr`: vorher keine Zeile, danach jedes Jahr welche."""
    first = cfg["erstes_jahr"]
    counts = pd.crosstab(pub["ULAND"], pub["UJAHR"])
    errors = [f"Land {land} ist nicht in erstes_jahr" for land in counts.index if land not in first]
    for land, start in first.items():
        for col in counts.columns:
            year, n = int(col), int(counts.at[land, col]) if land in counts.index else 0
            if year < start and n:
                errors.append(f"Land {land}: {n} Unfälle {year}, erwartet erst ab {start}")
            if year >= start and not n:
                errors.append(f"Land {land}: keine Unfälle {year}, erwartet ab {start}")
    if errors:
        raise ValueError("Abdeckung passt nicht zu erstes_jahr:\n  " + "\n  ".join(errors))


def quellenvermerk(cfg: dict[str, Any]) -> str:
    q = cfg["quelle"]
    return (
        f"{q['datensatz']}, {q['bereitsteller']}, {q['lizenz_kurz']} ({q['lizenz_url']}), "
        f"{q['datensatz_url']}. {q['veraenderung']}"
    )


def to_table(pub: pd.DataFrame, cfg: dict[str, Any], version: str) -> pa.Table:
    """Sortiert räumlich und baut die Arrow-Tabelle samt GeoParquet- und Quellen-Metadaten."""
    lon = pub["XGCSWGS84"].to_numpy()
    lat = pub["YGCSWGS84"].to_numpy()
    order = np.argsort(hilbert_index(lon, lat, cfg["hilbert_order"]), kind="stable")
    pub = pub.iloc[order].reset_index(drop=True)
    pub["geometry"] = shapely.to_wkb(shapely.points(pub["XGCSWGS84"], pub["YGCSWGS84"]))

    arrays = []
    for field in SCHEMA:
        col = pub[field.name]
        if pa.types.is_integer(field.type):
            col = _num(col).astype("Int64")  # NULL bleibt NULL (z. B. IstGkfz 2017, PLST < 2023)
        arrays.append(pa.array(col, type=field.type, from_pandas=True))
    table = pa.Table.from_arrays(arrays, schema=SCHEMA)

    geo = {
        "version": "1.1.0",
        "primary_column": "geometry",
        "columns": {
            "geometry": {
                "encoding": "WKB",
                "geometry_types": ["Point"],
                # EPSG:4326 ausdrücklich (Achsen in GeoParquet immer Länge, Breite). Ohne
                # Angabe gälte OGC:CRS84 — gleichwertig, aber GeoPandas meldet dann
                # CRS-Konflikte beim Verschneiden mit EPSG:4326-Daten.
                "crs": CRS.from_epsg(4326).to_json_dict(),
                "bbox": [float(lon.min()), float(lat.min()), float(lon.max()), float(lat.max())],
            }
        },
    }
    years = sorted(int(y) for y in pub["UJAHR"].unique())
    meta = {
        b"geo": json.dumps(geo).encode(),
        b"vizsim:version": version.encode(),
        b"vizsim:jahre": f"{years[0]}-{years[-1]}".encode(),
        b"vizsim:quellenvermerk": quellenvermerk(cfg).encode(),
        b"vizsim:readme": f"{cfg['base_url']}README.md".encode(),
        b"vizsim:sortierung": f"Hilbert-Kurve, Ordnung {cfg['hilbert_order']}".encode(),
        b"vizsim:lizenz": cfg["quelle"]["lizenz_kurz"].encode(),
    }
    return table.replace_schema_metadata(meta)


def write_parquet(table: pa.Table, path: Path, cfg: dict[str, Any]) -> None:
    pq.write_table(
        table,
        path,
        row_group_size=cfg["row_group_size"],
        compression=cfg["compression"],
        compression_level=cfg["compression_level"],
        use_dictionary=[f.name for f in SCHEMA if f.name not in _NO_DICT],
        write_statistics=[f.name for f in SCHEMA if f.name not in _NO_STATS],
        # Bloom-Filter: Suche nach einer ID oder Gemeinde überspringt Row Groups, in denen
        # der Wert sicher nicht vorkommt (DuckDB ≥ 1.2 und hyparquet nutzen das).
        bloom_filter_options=cfg.get("bloom_filter") or None,
    )


def coverage(pub: pd.DataFrame, cfg: dict[str, Any]) -> pd.DataFrame:
    """Unfälle je Land × Jahr; 0 heißt: Land in diesem Jahr nicht im Unfallatlas."""
    names = cfg["schluessel"]["ULAND"]
    t = pd.crosstab(pub["ULAND"], pub["UJAHR"]).reindex(sorted(names), fill_value=0)
    t.insert(0, "land", t.index.map(names))
    return t.rename_axis("ULAND").reset_index()


def schluessel_table(cfg: dict[str, Any]) -> pd.DataFrame:
    rows = [
        {"spalte": spalte, "code": str(code), "bedeutung": text}
        for spalte, codes in cfg["schluessel"].items()
        for code, text in codes.items()
    ]
    for spalte, text in cfg["beteiligung"].items():
        rows += [
            {"spalte": spalte, "code": "0", "bedeutung": f"ohne {text}-Beteiligung"},
            {"spalte": spalte, "code": "1", "bedeutung": f"mit {text}-Beteiligung"},
        ]
    return pd.DataFrame(rows)


def id_ersatz(pub: pd.DataFrame) -> dict[str, list[str]]:
    """Jahr → Länder, deren unfall_id auf OBJECTID statt UIDENTSTLAE beruht."""
    alt = pub.loc[pub["unfall_id"].str.contains(r"-o\d+$"), ["UJAHR", "ULAND"]].drop_duplicates()
    return {str(y): sorted(g["ULAND"]) for y, g in alt.groupby("UJAHR")}


def _sha256(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


# ---------------------------------------------------------------------------------------
# README aus der Vorlage


def _und(items: list[str]) -> str:
    return items[0] if len(items) == 1 else f"{', '.join(items[:-1])} und {items[-1]}"


def _abdeckung_md(latest: dict[str, Any]) -> str:
    """Tabelle „ab <Jahr>: Länder“ aus latest.json (Folgezeilen eingerückt wie der Listenpunkt,
    in dem der Platzhalter steht)."""
    names = latest["schluessel"]["ULAND"]
    by_start: dict[int, list[str]] = {}
    for land, years in latest["abdeckung"].items():
        if years:
            by_start.setdefault(years[0], []).append(names[land])
    starts = sorted(by_start)
    rows = [
        "| " + " | ".join(f"ab {y}" for y in starts) + " |",
        "|" + "---|" * len(starts),
        "| " + " | ".join(", ".join(sorted(by_start[y])) for y in starts) + " |",
    ]
    return "\n   ".join(rows)


def _id_ersatz_text(latest: dict[str, Any]) -> str:
    names = latest["schluessel"]["ULAND"]
    voll, teil = [], []
    for year, lands in latest["id_ersatz"].items():
        present = {land for land, ys in latest["abdeckung"].items() if int(year) in ys}
        if set(lands) == present:
            voll.append(year)
        else:
            teil.append(f"{year} für {_und([names[land] for land in lands])}")
    parts = ([f"{_und(voll)} vollständig"] if voll else []) + teil
    return _und(parts) if parts else "kein Jahr"


def render_readme(latest: dict[str, Any], cfg: dict[str, Any]) -> str:
    """config/<readme_vorlage> mit Umfang, Größe, Stand, Abdeckung … aus latest.json."""
    text = (get_paths().config / cfg["readme_vorlage"]).read_text(encoding="utf-8")
    # Hinweise auf den Karten-Export erst, wenn es ihn gibt (Block samt folgender Leerzeile).
    block = re.compile(r"<!-- karten-export -->\n(.*?)<!-- /karten-export -->\n(\n?)", re.S)
    text = block.sub(lambda m: m[1] + m[2] if cfg.get("karten_export") else "", text)
    values = {
        "jahr_von": str(latest["jahre"][0]),
        "jahr_bis": str(latest["jahre"][1]),
        "zeilen": f"{latest['zeilen']:,}".replace(",", "."),
        "groesse": f"{latest['bytes'] / 1e6:.0f} MB",
        "version": latest["version"],
        "datei": latest["datei"],
        "dataset": cfg["dataset"],
        "alias": cfg["alias"],
        "base_url": cfg["base_url"],
        "abdeckung": _abdeckung_md(latest),
        "gkfz_leer": _und([str(y) for y in latest["gkfz_leer"]]) if latest["gkfz_leer"] else "nie",
        "id_ersatz": _id_ersatz_text(latest),
        "versionen": "\n".join(f"| {v['stand']} | {v['aenderung']} |" for v in cfg["versionen"]),
    }
    return re.sub(r"\{\{(\w+)\}\}", lambda m: values[m[1]], text)


# ---------------------------------------------------------------------------------------
# Build


def write_all(df: pd.DataFrame, out_dir: Path, cfg: dict[str, Any], version: str | None = None
              ) -> dict[str, Any]:
    """Schreibt Parquet (versioniert + Alias), latest.json, CSVs, SHA256SUMS und README."""
    version = version or date.today().isoformat()
    pub = to_public(df, cfg)
    check_coverage(pub, cfg)
    years = sorted(int(y) for y in pub["UJAHR"].unique())
    name = f"{cfg['dataset']}_{years[0]}-{years[-1]}_{version}.parquet"
    if (out_dir / name).exists():
        # Versionierte Dateien sind unveränderlich (CDN, Range-Leser, zitierte Auswertungen).
        raise FileExistsError(
            f"{out_dir / name} gibt es schon. Anderen Stand wählen (--stand) oder die Datei "
            "löschen, falls sie noch nicht veröffentlicht ist."
        )
    out_dir.mkdir(parents=True, exist_ok=True)
    write_parquet(to_table(pub, cfg, version), out_dir / name, cfg)
    alias = cfg["alias"]
    shutil.copyfile(out_dir / name, out_dir / alias)  # fester Name, immer der neueste Stand

    cov = coverage(pub, cfg)
    cov.to_csv(out_dir / "coverage.csv", index=False)
    schluessel_table(cfg).to_csv(out_dir / "schluessel.csv", index=False)

    md = pq.ParquetFile(out_dir / name).metadata
    gkfz = pub.groupby("UJAHR")["IstGkfz"].apply(lambda s: bool(s.isna().all()))
    latest = {
        "datei": name,
        "alias": alias,
        "url": f"{cfg['base_url']}{name}",
        "version": version,
        "jahre": [years[0], years[-1]],
        "zeilen": md.num_rows,
        "row_groups": md.num_row_groups,
        "bytes": (out_dir / name).stat().st_size,
        "footer_bytes": md.serialized_size,  # ein Range-Leser holt damit genau den Footer
        "sha256": _sha256(out_dir / name),
        "quellenvermerk": quellenvermerk(cfg),
        "quelle": cfg["quelle"],
        "schluessel": {k: {str(c): t for c, t in v.items()} for k, v in cfg["schluessel"].items()},
        "beteiligung": cfg["beteiligung"],
        "abdeckung": {
            row["ULAND"]: [y for y in years if row[y] > 0] for _, row in cov.iterrows()
        },
        "id_ersatz": id_ersatz(pub),
        "gkfz_leer": [int(y) for y, leer in gkfz.items() if leer],
    }
    (out_dir / "latest.json").write_text(
        json.dumps(latest, ensure_ascii=False, indent=1), encoding="utf-8"
    )
    (out_dir / "SHA256SUMS").write_text(
        f"{latest['sha256']}  {name}\n{latest['sha256']}  {alias}\n", encoding="utf-8"
    )
    (out_dir / "README.md").write_text(render_readme(latest, cfg), encoding="utf-8")
    return latest


def build(version: str | None = None) -> dict[str, Any]:
    """Alle Jahre der Registry → data/publish/<dataset>/ (siehe Moduldoku)."""
    cfg = load_config()
    print("  · harmonisiere alle Jahre …")
    df = accidents.harmonize()
    print(f"  · {len(df):,} Unfälle → öffentliches Schema, Hilbert-Sortierung, Parquet …")
    return write_all(df, get_paths().out(cfg["subdir"]), cfg, version)


# ---------------------------------------------------------------------------------------
# Deploy nach data.vizsim.de (B2-Bucket hinter Cloudflare)


def deploy_plan(out_dir: Path, cfg: dict[str, Any]) -> list[dict[str, Any]]:
    """Reihenfolge und Header aller Uploads.

    Erst die versionierte Datei (unveränderlich, lang cachebar), dann Alias und
    Begleitdateien, ganz zuletzt latest.json. So zeigt latest.json nie auf etwas, das fehlt.
    """
    d = cfg["deploy"]
    latest = json.loads((out_dir / "latest.json").read_text(encoding="utf-8"))
    names = [latest["datei"], cfg["alias"], "coverage.csv", "schluessel.csv", "README.md",
             "SHA256SUMS", "latest.json"]
    plan = []
    for n in names:
        if not (out_dir / n).exists():
            raise FileNotFoundError(f"{out_dir / n} fehlt — erst `unfallkarte publish build`")
        immutable = n == latest["datei"]
        plan.append({
            "local": str(out_dir / n),
            "b2_name": cfg["prefix"] + n,
            "content_type": d["content_type"][Path(n).suffix or n],
            "cache_control": d["cache_control"]["versioniert" if immutable else "sonst"],
            "immutable": immutable,
        })
    return plan


def _upload_cmd(bucket: str, step: dict[str, Any]) -> list[str]:
    return ["b2", "file", "upload", "--no-progress",
            "--content-type", step["content_type"],
            "--cache-control", step["cache_control"],
            bucket, step["local"], step["b2_name"]]


def _b2_env() -> dict[str, str]:
    """Schlüssel für den Bucket hinter data.vizsim.de, nur für die b2-Aufrufe dieses Laufs.

    b2 nimmt B2_APPLICATION_KEY_ID/B2_APPLICATION_KEY aus der Umgebung und lässt die
    gespeicherte Anmeldung (die von `unfallkarte deploy` für unfallkarte-data-v2) unberührt.
    """
    s = get_settings()
    if not (s.b2_archive_key_id and s.b2_archive_key):
        raise RuntimeError(
            "B2_ARCHIVE_KEY_ID/B2_ARCHIVE_KEY fehlen in .env "
            "(Schlüssel mit Schreibrecht auf den Bucket hinter data.vizsim.de)."
        )
    return {**os.environ, "B2_APPLICATION_KEY_ID": s.b2_archive_key_id,
            "B2_APPLICATION_KEY": s.b2_archive_key}


def _remote_sizes(bucket: str, prefix: str, env: dict[str, str]) -> dict[str, int | None]:
    res = subprocess.run(["b2", "ls", "--json", f"b2://{bucket}/{prefix}"],
                         capture_output=True, text=True, env=env)
    if res.returncode != 0:
        raise RuntimeError(f"b2 ls b2://{bucket}/{prefix} fehlgeschlagen — Schlüssel prüfen.")
    return {f["fileName"]: f.get("size") for f in json.loads(res.stdout or "[]")}


def deploy(out_dir: Path | None = None, cfg: dict[str, Any] | None = None, *,
           dry_run: bool = False) -> None:
    """Lädt data/publish/<dataset>/ hoch: versionierte Datei zuerst (falls neu), latest.json
    zuletzt."""
    cfg = cfg or load_config()
    out_dir = out_dir or get_paths().out(cfg["subdir"])
    bucket, prefix = cfg["deploy"]["bucket"], cfg["prefix"]
    plan = deploy_plan(out_dir, cfg)
    if dry_run:
        for step in plan:
            print(f"  [dry-run] $ {shlex.join(_upload_cmd(bucket, step))}")
        return
    if which("b2") is None:
        raise RuntimeError("'b2' nicht installiert (uv tool install b2).")
    env = _b2_env()
    remote = _remote_sizes(bucket, prefix, env)
    for step in plan:
        if step["immutable"] and step["b2_name"] in remote:
            local = Path(step["local"]).stat().st_size
            if remote[step["b2_name"]] not in (None, local):
                raise RuntimeError(
                    f"{step['b2_name']} liegt mit anderer Größe im Bucket. Versionierte Dateien "
                    "werden nie überschrieben — mit neuem Stand bauen (`publish build --stand`)."
                )
            print(f"  = {step['b2_name']} liegt schon im Bucket (unveränderlich) → übersprungen")
            continue
        cmd = _upload_cmd(bucket, step)
        print(f"  $ {shlex.join(cmd)}")
        subprocess.run(cmd, check=True, env=env)
