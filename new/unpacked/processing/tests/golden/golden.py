"""Golden-Reference für die Accident-Pipeline (Sicherheitsnetz).

Vermisst invariante Kennzahlen des erzeugten GeoParquet, damit der Notebook->Python-
Umbau objektiv abgesichert ist: Zeilenzahl, Spalten, Unfälle je Jahr, BBox, CRS.

Workflow:
  1) einmalig vom ALTEN (Notebook-)Parquet eine Referenz ziehen:
       python tests/golden/golden.py capture <alt.parquet> tests/golden/accidents.json
  2) nach dem refaktorierten Build vergleichen:
       python tests/golden/golden.py compare <neu.parquet> tests/golden/accidents.json
     Exit-Code != 0 bei Abweichung.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import geopandas as gpd


def measure(parquet: str) -> dict:
    gdf = gpd.read_parquet(parquet)
    per_year: dict[str, int] = {}
    if "UJAHR" in gdf.columns:
        vc = gdf["UJAHR"].value_counts().sort_index()
        per_year = {str(int(k)): int(v) for k, v in vc.items()}
    epsg = gdf.crs.to_epsg() if gdf.crs else None
    return {
        "n_rows": int(len(gdf)),
        "columns": sorted(map(str, gdf.columns)),
        "per_year": per_year,
        "bounds": [round(float(b), 5) for b in gdf.total_bounds],
        "crs": f"EPSG:{epsg}" if epsg else str(gdf.crs),
    }


def capture(parquet: str, out: str) -> None:
    rec = measure(parquet)
    Path(out).parent.mkdir(parents=True, exist_ok=True)
    Path(out).write_text(json.dumps(rec, indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"golden geschrieben: {out}  (n_rows={rec['n_rows']}, Jahre={list(rec['per_year'])})")


def compare(parquet: str, golden: str) -> int:
    want = json.loads(Path(golden).read_text(encoding="utf-8"))
    got = measure(parquet)
    diffs: list[str] = []
    if got["n_rows"] != want["n_rows"]:
        diffs.append(f"n_rows: {want['n_rows']} -> {got['n_rows']}")
    miss = sorted(set(want["columns"]) - set(got["columns"]))
    extra = sorted(set(got["columns"]) - set(want["columns"]))
    if miss:
        diffs.append(f"fehlende Spalten: {miss}")
    if extra:
        diffs.append(f"neue Spalten: {extra}")
    for year, n in want["per_year"].items():
        if got["per_year"].get(year) != n:
            diffs.append(f"Jahr {year}: {n} -> {got['per_year'].get(year)}")
    if got["crs"] != want["crs"]:
        diffs.append(f"crs: {want['crs']} -> {got['crs']}")

    if diffs:
        print("ABWEICHUNG ggü. Golden:")
        for d in diffs:
            print(f"  - {d}")
        return 1
    print("OK — identisch zur Golden-Reference.")
    return 0


def main() -> int:
    p = argparse.ArgumentParser(description=__doc__)
    sub = p.add_subparsers(dest="cmd", required=True)
    c = sub.add_parser("capture")
    c.add_argument("parquet")
    c.add_argument("out")
    cmp = sub.add_parser("compare")
    cmp.add_argument("parquet")
    cmp.add_argument("golden")
    args = p.parse_args()
    if args.cmd == "capture":
        capture(args.parquet, args.out)
        return 0
    return compare(args.parquet, args.golden)


if __name__ == "__main__":
    sys.exit(main())
