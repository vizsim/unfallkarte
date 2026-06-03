"""Szenario 3: Tempo-30 durchgängig — kurze 50er-Lücken zwischen zwei 30er-Zonen.

Auf dem Hauptstraßennetz (maxspeed_major): zusammenhängende 30/50-Abschnitte
topologisch verschmelzen (nach maxspeed/maxspeed_conditional/name, nur geometrisch
verbundene Linien), dann kurze Tempo-50-Segmente (<400 m) finden, die an beiden
Enden je genau ein VERSCHIEDENES Tempo-30-Segment berühren — potenzielle
Lückenschlüsse für durchgängiges Tempo 30.

Output = Dual-Layer (scenario3-points/-polys). Portiert aus
scenario3_tempo30_continuous_v03_production.ipynb (Germany-weit), auf geo.py.
"""

from __future__ import annotations

from pathlib import Path

import geopandas as gpd
import networkx as nx
import pandas as pd
from shapely.geometry import LineString, MultiLineString, Point
from shapely.ops import linemerge, unary_union

from unfallkarte import geo, tiles

from .base import ScenarioContext

NAME = "scenario3"
DESCRIPTION = "Tempo-30 durchgängig (kurze 50er-Lücken zwischen 30er-Zonen)"
OUTPUT = "scenarios/scenario3_tempo30_conti.pmtiles"

GROUP_COLS = ["maxspeed", "maxspeed_conditional", "name"]
LENGTH_THRESHOLD_M = 400
POINT_BUFFER_M = 0.1
LINK_BUFFER_M = 10


def _dissolve_touching(gdf: gpd.GeoDataFrame, group_cols: list[str]) -> gpd.GeoDataFrame:
    """Verschmilzt NUR geometrisch verbundene Linien gleicher Attribute (group_cols)
    zu durchgehenden Linien: je Gruppe sjoin(intersects) -> networkx-Komponenten ->
    unary_union + linemerge."""
    df = gdf.copy()
    for col in group_cols:
        df[col] = df[col].fillna("__NA__")

    results: list[dict] = []
    for key, group in df.groupby(group_cols):
        if group.empty:
            continue
        joined = gpd.sjoin(group, group, predicate="intersects", how="left")
        g = nx.Graph()
        g.add_nodes_from(group.index)
        for i, j in zip(joined.index, joined["index_right"], strict=False):
            if not pd.isna(j) and i != j:
                g.add_edge(i, int(j))
        keys = key if isinstance(key, tuple) else (key,)
        for comp in nx.connected_components(g):
            unioned = unary_union(df.loc[list(comp)].geometry)
            if isinstance(unioned, LineString):
                merged = unioned
            elif isinstance(unioned, MultiLineString):
                merged = linemerge(unioned)
            else:
                continue
            row = {
                c: (None if v == "__NA__" else v)
                for c, v in zip(group_cols, keys, strict=False)
            }
            row["geometry"] = merged
            results.append(row)
    return gpd.GeoDataFrame(results, geometry="geometry", crs=gdf.crs)


def _endpoints(geom):
    if isinstance(geom, MultiLineString):
        lines = list(geom.geoms)
        if not lines:
            return None
        return Point(lines[0].coords[0]), Point(lines[-1].coords[-1])
    if isinstance(geom, LineString):
        return Point(geom.coords[0]), Point(geom.coords[-1])
    return None


def _short_50_between_30(gdf: gpd.GeoDataFrame) -> gpd.GeoDataFrame:
    """Kurze 50er-Segmente (<400 m), die an beiden Enden je genau EIN verschiedenes
    30er-Segment berühren."""
    short50 = gdf[(gdf["maxspeed"] == "50") & (gdf["length_m"] < LENGTH_THRESHOLD_M)]
    gdf30 = gdf[gdf["maxspeed"] == "30"]
    sindex30 = gdf30.sindex

    def hits(pt: Point) -> gpd.GeoDataFrame:
        pos = sindex30.query(pt.buffer(POINT_BUFFER_M), predicate="intersects")
        return gdf30.iloc[pos]

    keep: list = []
    for idx, geom in short50.geometry.items():
        ends = _endpoints(geom)
        if ends is None:
            continue
        start_hits, end_hits = hits(ends[0]), hits(ends[1])
        if len(start_hits) == 1 and len(end_hits) == 1 and start_hits.index[0] != end_hits.index[0]:
            keep.append(idx)
    return short50.loc[keep]


def run(ctx: ScenarioContext) -> Path:
    hw = gpd.read_file(ctx.osm_raw / "maxspeed_major.fgb")
    na = hw["maxspeed"].isna() | (hw["maxspeed"].astype(str) == "None")
    hw.loc[na & (hw["maxspeed_type"] == "DE:urban"), "maxspeed"] = "50"
    na = hw["maxspeed"].isna() | (hw["maxspeed"].astype(str) == "None")
    hw.loc[na & (hw["maxspeed_type"] == "DE:rural"), "maxspeed"] = "100"
    hw3050 = geo.to_metric(hw[hw["maxspeed"].isin(["30", "50"])].copy())

    dissolved = _dissolve_touching(hw3050, GROUP_COLS)  # EPSG:25832
    dissolved["length_m"] = dissolved.geometry.length
    connectors = _short_50_between_30(dissolved)
    if connectors.empty:
        raise ValueError("scenario3: keine 50er-Lücken zwischen 30er-Zonen gefunden")

    polys = connectors.copy()
    polys["geometry"] = connectors.geometry.buffer(LINK_BUFFER_M)
    polys = gpd.GeoDataFrame(polys, geometry="geometry", crs=connectors.crs)
    polys_wgs = geo.to_wgs(polys)

    tmp = ctx.out_dir / "_tmp"
    tmp.mkdir(parents=True, exist_ok=True)
    polys_fgb = tmp / "scenario3_polys.fgb"
    points_fgb = tmp / "scenario3_points.fgb"
    polys_wgs.to_file(polys_fgb, driver="FlatGeobuf")
    geo.centroids(polys_wgs).to_file(points_fgb, driver="FlatGeobuf")

    output = ctx.out_dir.parent / OUTPUT  # data/scenarios/...
    return tiles.build_dual_layer(
        points_fgb,
        polys_fgb,
        output,
        points_layer="scenario3-points",
        polys_layer="scenario3-polys",
        dry_run=ctx.dry_run,
    )
