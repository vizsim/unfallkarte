"""Szenario 2: Unfälle nahe Schulen/Kindergärten.

Unfälle (ab 2020, da bundesweit vollständig) im 50-m-Umkreis von Schulen zählen;
Schulen mit > 2 Rad-/Fußunfällen behalten. Output = Dual-Layer-PMTiles
(Punkte für Übersicht, Buffer-Polygone im Detail).

Portiert aus scenario2_accidents_close2schools.ipynb, jetzt auf geo.py-Helfern.
"""

from __future__ import annotations

from pathlib import Path

import geopandas as gpd

from unfallkarte import geo, tiles

from .base import ScenarioContext

NAME = "scenario2"
DESCRIPTION = "Unfälle nahe Schulen (50 m Buffer, > 2 Rad/Fuß-Unfälle ab 2020)"
OUTPUT = "scenarios/scenario2_accidents_close2schools.pmtiles"

YEARS = [2020, 2021, 2022, 2023, 2024]  # ab 2020 bundesweit vollständig (inkl. 2024)
BUFFER_M = 50
BIPED_THRESHOLD = 2
COUNT_COLS = ["total_count", "biped_count", "bike_count", "ped_count"]


def run(ctx: ScenarioContext) -> Path:
    accidents = gpd.read_parquet(ctx.accidents_parquet)
    schools = geo.make_osm_oid(gpd.read_file(ctx.osm_raw / "schools.fgb"))

    buffered = geo.buffer(schools, BUFFER_M)  # in EPSG:4326 zurück

    acc = accidents[accidents["UJAHR"].isin(YEARS)].copy()
    # biped = Rad ODER Fuß; als Hilfsspalte, damit count_accidents_per_feature (col==val) greift
    acc["__biped"] = ((acc["IstRad"] == 1) | (acc["IstFuss"] == 1)).astype(int)

    counts = geo.count_accidents_per_feature(
        acc,
        buffered,
        "oid",
        categories={"biped": ("__biped", 1), "bike": ("IstRad", 1), "ped": ("IstFuss", 1)},
    )

    feats = buffered.merge(counts, on="oid", how="inner")
    feats = feats[feats["biped_count"] > BIPED_THRESHOLD].copy()
    feats[COUNT_COLS] = feats[COUNT_COLS].fillna(0).astype(int)

    out_dir = ctx.out_dir
    tmp = out_dir / "_tmp"
    tmp.mkdir(parents=True, exist_ok=True)
    polys_fgb = tmp / "scenario2_polys.fgb"
    points_fgb = tmp / "scenario2_points.fgb"
    geo.to_wgs(feats).to_file(polys_fgb, driver="FlatGeobuf")
    geo.centroids(feats).to_file(points_fgb, driver="FlatGeobuf")

    output = ctx.out_dir.parent / OUTPUT  # data/scenarios/...
    return tiles.build_dual_layer(
        points_fgb,
        polys_fgb,
        output,
        points_layer="scenario2-points",
        polys_layer="scenario2-polys",
        dry_run=ctx.dry_run,
    )
