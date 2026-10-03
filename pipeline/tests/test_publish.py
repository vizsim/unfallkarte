"""Tests für publish: öffentliches Schema, unfall_id, Abdeckung, Dateien, README, Deploy.

Laufen ohne Daten (die CI hat keine) auf einer kleinen synthetischen Tabelle im Schema von
accidents.harmonize() (tests/synthetic.py — mit den Eigenheiten der Echtdaten). Nur der
Abgleich der echten Veröffentlichung mit der Golden-Reference braucht Daten.
"""

from __future__ import annotations

import hashlib
import json
import re
import shutil
from pathlib import Path
from types import SimpleNamespace

import geopandas as gpd
import numpy as np
import pandas as pd
import pyarrow.parquet as pq
import pytest
from synthetic import ERSTES_JAHR, N, harmonisiert

from unfallkarte import accidents, publish
from unfallkarte.config import get_paths

CFG = publish.load_config()
TEST_CFG = {**CFG, "row_group_size": 200, "erstes_jahr": ERSTES_JAHR}

GEBIET = {"type": "FeatureCollection", "features": [{
    "type": "Feature", "properties": {}, "geometry": {"type": "Polygon", "coordinates": [[
        [13.395, 52.493], [13.425, 52.490], [13.433, 52.501], [13.414, 52.509],
        [13.392, 52.503], [13.395, 52.493]]]}}]}


@pytest.fixture(scope="module")
def raw() -> pd.DataFrame:
    return harmonisiert()


@pytest.fixture(scope="module")
def built(raw: pd.DataFrame, tmp_path_factory: pytest.TempPathFactory) -> tuple[Path, dict]:
    out = tmp_path_factory.mktemp("pub") / CFG["dataset"]
    return out, publish.write_all(raw, out, TEST_CFG, version="2026-10-01")


# --- Schema und unfall_id ---------------------------------------------------------------


def test_schema_vertrag(built: tuple[Path, dict]) -> None:
    out, latest = built
    f = pq.ParquetFile(out / latest["datei"])
    assert f.schema_arrow.remove_metadata() == publish.SCHEMA  # Namen, Typen, Reihenfolge
    geo = json.loads(f.schema_arrow.metadata[b"geo"])
    col = geo["columns"]["geometry"]
    assert geo["version"] == "1.1.0" and col["geometry_types"] == ["Point"]
    assert col["crs"]["id"] == {"authority": "EPSG", "code": 4326}
    gdf = gpd.read_parquet(out / latest["datei"])
    assert gdf.geom_type.eq("Point").all() and gdf.crs.to_epsg() == 4326
    assert (gdf.geometry.x == gdf["XGCSWGS84"]).all()


def test_unfall_id_eindeutig_mit_ersatz(built: tuple[Path, dict]) -> None:
    out, latest = built
    pub = pd.read_parquet(out / latest["datei"], columns=["unfall_id", "UJAHR", "ags"])
    assert pub["unfall_id"].is_unique
    assert (pub["unfall_id"].str.split("-").str[0] == pub["ags"]).all()
    ersatz = pub["unfall_id"].str.contains(r"-o\d+$")
    assert set(pub.loc[ersatz, "UJAHR"]) == {2016, 2018, 2019, 2021}
    assert pub.loc[~ersatz, "unfall_id"].str.len().eq(8 + 1 + 4 + 1 + 20).all()
    assert latest["id_ersatz"] == {
        "2016": ["02"], "2018": ["02", "11"], "2019": ["02", "05", "11"], "2021": ["05"]}


def test_id_ersatz_je_land_und_jahr(raw: pd.DataFrame) -> None:
    df = raw[raw["UJAHR"] == 2022].head(6).copy()
    df["ULAND"] = [11, 11, 11, 2, 2, 2]
    df["UIDENTSTLA"] = ["7", "7", "8", "1", "2", "3"]  # Berlin doppelt → ganze Gruppe Ersatz
    df["OBJECTID"] = [10.0, 11, 12, 13, 14, 15]
    nr = publish.to_public(df, CFG)["unfall_id"].str.split("-").str[2]
    assert nr.tolist() == ["o10", "o11", "o12", *(s.zfill(20) for s in "123")]


def test_doppelte_id_bricht_ab(raw: pd.DataFrame) -> None:
    dup = pd.concat([raw.head(3), raw.head(1)], ignore_index=True)  # 2016: o<OBJECTID> doppelt
    with pytest.raises(ValueError, match="nicht eindeutig"):
        publish.to_public(dup, CFG)


def test_ohne_jede_nummer_bricht_ab(raw: pd.DataFrame) -> None:
    df = raw[raw["UJAHR"] == 2025].head(3).copy()
    df["UIDENTSTLA"] = None  # 2025 gibt es kein OBJECTID als Ersatz
    with pytest.raises(ValueError, match="weder UIDENTSTLAE noch OBJECTID"):
        publish.to_public(df, CFG)


# --- Abdeckung ---------------------------------------------------------------------------


def test_abdeckung_gegen_erstes_jahr(raw: pd.DataFrame) -> None:
    pub = publish.to_public(raw, CFG)
    publish.check_coverage(pub, TEST_CFG)
    zu_frueh = {**TEST_CFG, "erstes_jahr": {**ERSTES_JAHR, "02": 2019}}
    with pytest.raises(ValueError, match="erwartet erst ab 2019"):
        publish.check_coverage(pub, zu_frueh)
    luecke = pub[~((pub["ULAND"] == "13") & (pub["UJAHR"] == 2022))]
    with pytest.raises(ValueError, match="keine Unfälle 2022"):
        publish.check_coverage(luecke, TEST_CFG)
    ohne_mv = {**TEST_CFG, "erstes_jahr": {k: v for k, v in ERSTES_JAHR.items() if k != "13"}}
    with pytest.raises(ValueError, match="nicht in erstes_jahr"):
        publish.check_coverage(pub, ohne_mv)


def test_erstes_jahr_fuer_jedes_land() -> None:
    assert set(CFG["erstes_jahr"]) == set(CFG["schluessel"]["ULAND"])


# --- Dateien und README ------------------------------------------------------------------


def test_dateien_alias_pruefsummen(built: tuple[Path, dict]) -> None:
    out, latest = built
    datei, alias = out / latest["datei"], out / CFG["alias"]
    assert latest["datei"] == f"{CFG['dataset']}_2016-2025_2026-10-01.parquet"
    assert datei.read_bytes() == alias.read_bytes()
    sha = hashlib.sha256(datei.read_bytes()).hexdigest()
    assert latest["sha256"] == sha and latest["bytes"] == datei.stat().st_size
    assert latest["footer_bytes"] == pq.ParquetFile(datei).metadata.serialized_size
    assert (out / "SHA256SUMS").read_text().splitlines() == [
        f"{sha}  {latest['datei']}", f"{sha}  {CFG['alias']}"]
    assert json.loads((out / "latest.json").read_text())["datei"] == latest["datei"]
    assert latest["gkfz_leer"] == [2017]
    assert latest["abdeckung"]["13"] == list(range(2020, 2026))
    cov = pd.read_csv(out / "coverage.csv", dtype={"ULAND": str}).set_index("ULAND")
    assert len(cov) == 16 and cov.loc["05", "2018"] == 0 and cov.loc["05", "2019"] == N


def test_versionierte_datei_wird_nie_ueberschrieben(raw: pd.DataFrame,
                                                    built: tuple[Path, dict]) -> None:
    out, _ = built
    with pytest.raises(FileExistsError):
        publish.write_all(raw, out, TEST_CFG, version="2026-10-01")


def test_bloom_filter_und_sortierung(built: tuple[Path, dict]) -> None:
    out, latest = built
    md = pq.ParquetFile(out / latest["datei"]).metadata
    assert md.num_row_groups > 1
    names = [md.row_group(0).column(i).path_in_schema for i in range(md.num_columns)]
    for col in ("unfall_id", "ags"):
        meta = md.row_group(0).column(names.index(col)).to_dict()
        assert meta.get("bloom_filter_offset"), f"kein Bloom-Filter für {col}"
    t = pq.read_table(out / latest["datei"], columns=["XGCSWGS84", "YGCSWGS84"])
    h = publish.hilbert_index(t["XGCSWGS84"].to_numpy(), t["YGCSWGS84"].to_numpy(),
                              CFG["hilbert_order"])
    assert np.all(np.diff(h.astype(np.int64)) >= 0), "nicht räumlich sortiert"


def test_readme_gerendert(built: tuple[Path, dict]) -> None:
    out, latest = built
    text = (out / "README.md").read_text(encoding="utf-8")
    assert "{{" not in text and "karten-export" not in text and "Kartenausschnitt" not in text
    assert f"| Umfang | {latest['zeilen']:,} Unfälle |".replace(",", ".") in text
    assert "2016, 2018 und 2019 vollständig und 2021 für Nordrhein-Westfalen" in text
    assert "**`IstGkfz` fehlt 2017.**" in text
    assert "   | ab 2016 | ab 2018 | ab 2019 | ab 2020 |\n   |---|" in text
    mit_export = publish.render_readme(latest, {**TEST_CFG, "karten_export": True})
    assert "Kartenausschnitt als GeoJSON" in mit_export and "karten-export" not in mit_export


def test_readme_beispiele_laufen(built: tuple[Path, dict], tmp_path: Path,
                                 monkeypatch: pytest.MonkeyPatch) -> None:
    """Alle Python- und SQL-Blöcke des README, gegen die Testdatei per file:// statt https."""
    duckdb = pytest.importorskip("duckdb")
    out, _ = built
    text = (out / "README.md").read_text(encoding="utf-8")
    text = text.replace(CFG["base_url"], out.as_uri() + "/")
    monkeypatch.chdir(tmp_path)
    (tmp_path / "gebiet.geojson").write_text(json.dumps(GEBIET), encoding="utf-8")
    blocks = re.findall(r"```python\n(.*?)```", text, flags=re.S)
    assert len(blocks) == 10
    ns: dict = {}
    for i, code in enumerate(blocks, 1):
        exec(compile(code, f"README-Block-{i}", "exec"), ns)
    assert len(ns["kreuzung"]) and len(ns["unfall"]) == 1 and len(ns["unfaelle"])
    for sql in re.findall(r"```sql\n(.*?)```", text, flags=re.S):
        duckdb.sql(sql)
    assert (tmp_path / "berlin.csv").stat().st_size > 0


# --- Deploy ------------------------------------------------------------------------------


def test_deploy_reihenfolge_und_header(built: tuple[Path, dict]) -> None:
    out, latest = built
    plan = publish.deploy_plan(out, TEST_CFG)
    names = [p["b2_name"] for p in plan]
    pre = CFG["prefix"]
    assert names[0] == pre + latest["datei"] and names[-1] == pre + "latest.json"
    assert names.index(pre + CFG["alias"]) < names.index(pre + "latest.json")
    assert plan[0]["immutable"] and plan[0]["cache_control"].endswith("immutable")
    assert all(p["cache_control"] == "no-cache" for p in plan[1:])
    by = {p["b2_name"]: p for p in plan}
    assert by[pre + CFG["alias"]]["content_type"] == "application/vnd.apache.parquet"
    assert by[pre + "README.md"]["content_type"].startswith("text/markdown")


def test_deploy_trockenlauf_und_schluessel(built: tuple[Path, dict],
                                           capsys: pytest.CaptureFixture[str],
                                           monkeypatch: pytest.MonkeyPatch) -> None:
    out, latest = built
    publish.deploy(out, TEST_CFG, dry_run=True)
    lines = [ln for ln in capsys.readouterr().out.splitlines() if "$ b2 file upload" in ln]
    assert lines[0].endswith(CFG["prefix"] + latest["datei"])
    assert lines[-1].endswith(CFG["prefix"] + "latest.json")
    assert all(f" {CFG['deploy']['bucket']} " in ln for ln in lines)
    # Ohne Archiv-Schlüssel bricht der echte Lauf vor jedem Upload ab …
    monkeypatch.setattr(publish, "which", lambda _: "/usr/bin/b2")
    monkeypatch.setattr(publish, "get_settings",
                        lambda: SimpleNamespace(b2_archive_key_id="", b2_archive_key=""))
    with pytest.raises(RuntimeError, match="B2_ARCHIVE_KEY_ID"):
        publish.deploy(out, TEST_CFG)
    # … mit Schlüssel bekommt b2 ihn nur über die Umgebung, nie in der Kommandozeile.
    monkeypatch.setattr(publish, "get_settings",
                        lambda: SimpleNamespace(b2_archive_key_id="id-x", b2_archive_key="geheim"))
    env = publish._b2_env()
    assert env["B2_APPLICATION_KEY_ID"] == "id-x" and env["B2_APPLICATION_KEY"] == "geheim"


def test_readme_neu_und_nur_geaenderte_dateien_hochladen(built: tuple[Path, dict], tmp_path: Path,
                                                         monkeypatch: pytest.MonkeyPatch) -> None:
    out, latest = built
    pub = tmp_path / "pub"
    shutil.copytree(out, pub)   # Kopie: `built` ist modulweit geteilt
    remote = {CFG["prefix"] + p.name: publish._sha1(p) for p in pub.iterdir()}

    # `publish readme`: nur das README ändert sich, kein neuer Datenstand.
    publish.readme(pub, {**TEST_CFG, "karten_export": True})
    assert "Kartenausschnitt als GeoJSON" in (pub / "README.md").read_text(encoding="utf-8")
    assert sorted(p.name for p in pub.iterdir()) == sorted(p.name for p in out.iterdir())

    uploads: list[str] = []
    monkeypatch.setattr(publish, "which", lambda _: "/usr/bin/b2")
    monkeypatch.setattr(publish, "get_settings",
                        lambda: SimpleNamespace(b2_archive_key_id="id", b2_archive_key="k"))
    monkeypatch.setattr(publish, "_remote_sha1", lambda *_: remote)
    monkeypatch.setattr(publish.subprocess, "run", lambda cmd, **_: uploads.append(cmd[-1]))
    publish.deploy(pub, TEST_CFG)
    assert uploads == [CFG["prefix"] + "README.md"]   # die 86 MB bleiben, wo sie sind

    # Liegt die versionierte Datei mit anderem Inhalt im Bucket: Abbruch statt Überschreiben.
    remote[CFG["prefix"] + latest["datei"]] = "0" * 40
    with pytest.raises(RuntimeError, match="anderem Inhalt"):
        publish.deploy(pub, TEST_CFG)


# --- accidents.harmonize -----------------------------------------------------------------


def test_harmonize_liest_nummer_als_text(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    """Als Zahl würde die 20-stellige Nummer uint64 bzw. float: führende Null weg, gerundet."""
    kopf = "OBJECTID;UIDENTSTLAE;ULAND;UJAHR;ULICHTVERH;LINREFX;LINREFY;XGCSWGS84;YGCSWGS84\n"
    (tmp_path / "a.csv").write_text(
        kopf + "1;01240526125013102024;01;2024;0;1,5;2;13,4;52,5\n"
        "2;12200116471201851100;12;2024;1;1;2;13,5;52,6\n")
    (tmp_path / "b.csv").write_text(
        "OBJECTID;ULAND;UJAHR;ULICHTVERH;LINREFX;LINREFY;XGCSWGS84;YGCSWGS84\n"
        "7;01;2016;2;3,25;4;10,1;53,7\n")
    cfg = {**accidents._registry(), "years": {
        "2016": {"csv_path": "b.csv", "karte": False}, "2024": {"csv_path": "a.csv"}}}
    monkeypatch.setattr(accidents, "_registry", lambda: cfg)
    monkeypatch.setattr(accidents, "_csv_path", lambda year, spec: tmp_path / spec["csv_path"])
    df = accidents.harmonize().set_index("OBJECTID")
    assert df.loc[1, "UIDENTSTLA"] == "01240526125013102024"
    assert df.loc[2, "UIDENTSTLA"] == "12200116471201851100"
    assert pd.isna(df.loc[7, "UIDENTSTLA"])
    assert df["LINREFX"].tolist() == [3.25, 1.5, 1.0] and df["LICHT"].tolist() == [2, 0, 1]
    assert accidents.map_years(cfg) == ["2024"]


# --- echte Veröffentlichung (nur lokal) --------------------------------------------------

VEROEFFENTLICHT = get_paths().out(CFG["subdir"]) / "latest.json"


@pytest.mark.skipif(not VEROEFFENTLICHT.exists(),
                    reason="keine Veröffentlichung lokal (die CI hat keine Daten)")
def test_veroeffentlichung_passt_zur_golden_reference() -> None:
    """Unfälle je Jahr wie im Karten-Parquet (Golden-Reference); Jahre nur für publish dazu."""
    golden = json.loads((Path(__file__).parent / "golden" / "accidents.json").read_text("utf-8"))
    cov = pd.read_csv(VEROEFFENTLICHT.parent / "coverage.csv", dtype={"ULAND": str})
    per_year = {c: int(cov[c].sum()) for c in cov.columns if c.isdigit()}
    abweichung = {y: (per_year.get(y), n) for y, n in golden["per_year"].items()
                  if per_year.get(y) != n}
    assert not abweichung, f"Jahr: (Veröffentlichung, Golden) {abweichung}"
    latest = json.loads(VEROEFFENTLICHT.read_text(encoding="utf-8"))
    assert latest["zeilen"] == sum(per_year.values())
