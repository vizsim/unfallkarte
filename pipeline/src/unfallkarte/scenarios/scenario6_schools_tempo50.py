"""Szenario 6: Tempo-50-Straßen vor Schulen.

Schulen im 30-m-Umkreis, vor denen ≥60 m echte Tempo-50-Straße verläuft
(maxspeed=50, nicht conditional „30 @ …"). Highway-Netz = major + minor zusammen
(≈ das „almostall"-Set des alten Notebooks). Nutzt KEINE Unfalldaten.

Output = 3 Layer:
  scenario6-points  — Zentroide der Schul-Buffer (Übersicht, niedriger Zoom)
  scenario6-polys   — Schul-Buffer-Polygone (30 m)
  scenario6-polys2  — die Tempo-50-Segmente (10 m gepuffert; Frontend rendert als Linie)

Portiert aus scenario6_tempo50_schulen.ipynb (Germany-weit, ohne Berlin-Clip),
auf geo.py-Helfern.
"""

from __future__ import annotations

from pathlib import Path

import geopandas as gpd
import pandas as pd

from unfallkarte import geo, tiles

from .base import ScenarioContext

NAME = "scenario6"
DESCRIPTION = "Tempo-50 vor Schulen (30 m Buffer, ≥60 m Tempo-50-Straße)"
OUTPUT = "scenarios/scenario6_tempo50_30mbuffer_schulen.pmtiles"

SCHOOL_BUFFER_M = 30
LINK_BUFFER_M = 10
LENGTH_THRESHOLD_M = 60


def _load_highways(osm_raw: Path) -> gpd.GeoDataFrame:
    """major + minor zusammen (≈ almostall), maxspeed-Defaults gesetzt, in EPSG:25832."""
    parts = [
        gpd.read_file(osm_raw / name)
        for name in ("maxspeed_major.fgb", "maxspeed_minor.fgb")
        if (osm_raw / name).exists()
    ]
    if not parts:
        raise FileNotFoundError(
            f"Kein maxspeed_*.fgb in {osm_raw} — erst `osm build maxspeed_major maxspeed_minor`."
        )
    hw = gpd.GeoDataFrame(pd.concat(parts, ignore_index=True), crs=parts[0].crs)
    # Unbekannte maxspeed über maxspeed_type ableiten (DE:urban->50, DE:rural->100).
    na = hw["maxspeed"].isna() | (hw["maxspeed"].astype(str) == "None")
    hw.loc[na & (hw["maxspeed_type"] == "DE:urban"), "maxspeed"] = "50"
    na = hw["maxspeed"].isna() | (hw["maxspeed"].astype(str) == "None")
    hw.loc[na & (hw["maxspeed_type"] == "DE:rural"), "maxspeed"] = "100"
    return geo.to_metric(hw)


def run(ctx: ScenarioContext) -> Path:
    schools = geo.make_osm_oid(gpd.read_file(ctx.osm_raw / "schools.fgb"))
    schools_m = geo.to_metric(schools)
    buffers = schools_m[["oid", "geometry"]].copy()
    buffers["geometry"] = schools_m.geometry.buffer(SCHOOL_BUFFER_M)  # EPSG:25832

    highways = _load_highways(ctx.osm_raw)  # EPSG:25832

    # Highway-Segmente, die einen Schul-Buffer schneiden; davon echte Tempo-50.
    clipped = gpd.sjoin(highways, buffers, how="inner", predicate="intersects").drop(
        columns=["index_right"], errors="ignore"
    )
    links = clipped[
        (clipped["maxspeed"] == "50")
        & ~clipped["maxspeed_conditional"].astype(str).str.startswith("30 @")
    ].copy()
    if links.empty:
        raise ValueError("scenario6: keine Tempo-50-Straßen an Schulen gefunden")

    # Schul-Buffer, die eine Tempo-50-Straße haben.
    school_links = links[["oid"]].merge(buffers, how="inner", on="oid").drop_duplicates("oid")
    school_links = gpd.GeoDataFrame(school_links, geometry="geometry", crs=buffers.crs)

    # Tempo-50-Segmente in die Buffer clippen, Länge je Schule (oid) summieren.
    seg = gpd.overlay(links, school_links, how="intersection")
    seg["length_m"] = seg.geometry.length
    lengths = seg.groupby("oid_1")["length_m"].sum()
    school_links["total_tempo50_highway_length_m"] = school_links["oid"].map(lengths)

    keep = school_links[
        school_links["total_tempo50_highway_length_m"] > LENGTH_THRESHOLD_M
    ].copy()
    if keep.empty:
        raise ValueError("scenario6: keine Schule über der Längen-Schwelle (60 m)")

    # Segmente der behaltenen Schulen: dissolve + 10 m Buffer (für die Link-Polygone).
    seg_keep = seg[seg["oid_1"].isin(keep["oid"])]
    links_dissolved = seg_keep.dissolve(by="oid_1").reset_index()[["oid_1", "geometry"]]
    links_dissolved["geometry"] = links_dissolved.geometry.buffer(LINK_BUFFER_M)
    links_dissolved = gpd.GeoDataFrame(links_dissolved, geometry="geometry", crs=seg.crs)

    keep_wgs = geo.to_wgs(keep)
    links_wgs = geo.to_wgs(links_dissolved)

    tmp = ctx.out_dir / "_tmp"
    tmp.mkdir(parents=True, exist_ok=True)
    points_fgb = tmp / "scenario6_points.fgb"
    polys_fgb = tmp / "scenario6_polys.fgb"
    links_fgb = tmp / "scenario6_links.fgb"
    keep_wgs.to_file(polys_fgb, driver="FlatGeobuf")
    geo.centroids(keep_wgs).to_file(points_fgb, driver="FlatGeobuf")
    links_wgs.to_file(links_fgb, driver="FlatGeobuf")

    output = ctx.out_dir.parent / OUTPUT  # data/scenarios/...
    return tiles.build_multi_layer(
        [
            (points_fgb, "scenario6-points", "scenario_points"),
            (polys_fgb, "scenario6-polys", "scenario_polys"),
            (links_fgb, "scenario6-polys2", "scenario_polys"),
        ],
        output,
        dry_run=ctx.dry_run,
    )
