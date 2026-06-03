"""Szenario 1: Unfall-Cluster auf Tempo-100-Straßen (DBSCAN, marker-size 100).

Unfälle auf 100-km/h-Hauptstraßen (highway trunk/primary/secondary/tertiary inkl.
_link, maxspeed=100) werden via DBSCAN (eps=50 m, min_samples=3) geclustert; je
Cluster die konvexe Hülle (+10 m Buffer) mit Cluster-Größe und UKATEGORIE-
Verteilung (UKATEGORIE__1/2/3 für die Tortendiagramme).

Output = Dual-Layer (scenario1-points/-polys). Portiert aus
scenario1_cluster_accidents_ms100.ipynb, auf geo.py + maxspeed_major.fgb.
"""

from __future__ import annotations

from pathlib import Path

import geopandas as gpd
import numpy as np
from sklearn.cluster import DBSCAN

from unfallkarte import geo, tiles

from .base import ScenarioContext

NAME = "scenario1"
DESCRIPTION = "Unfall-Cluster auf Tempo-100-Straßen (DBSCAN eps=50, min_samples=3)"
OUTPUT = "scenarios/scenario1_cluster_accidents_ms100.pmtiles"

ROAD_BUFFER_M = 10
HULL_BUFFER_M = 10
DBSCAN_EPS_M = 50
DBSCAN_MIN_SAMPLES = 3
UKAT_COLS = ["UKATEGORIE__1", "UKATEGORIE__2", "UKATEGORIE__3"]
HIGHWAY_TYPES = [
    "trunk", "primary", "secondary", "tertiary",
    "trunk_link", "primary_link", "secondary_link", "tertiary_link",
]


def _tempo100_roads(osm_raw: Path) -> gpd.GeoDataFrame:
    """maxspeed=100-Hauptstraßen, 10 m gepuffert (EPSG:25832)."""
    hw = gpd.read_file(osm_raw / "maxspeed_major.fgb")
    na = hw["maxspeed"].isna() | (hw["maxspeed"].astype(str) == "None")
    hw.loc[na & (hw["maxspeed_type"] == "DE:urban"), "maxspeed"] = "50"
    na = hw["maxspeed"].isna() | (hw["maxspeed"].astype(str) == "None")
    hw.loc[na & (hw["maxspeed_type"] == "DE:rural"), "maxspeed"] = "100"
    roads = hw[(hw["maxspeed"] == "100") & hw["highway"].isin(HIGHWAY_TYPES)].copy()
    roads = geo.to_metric(roads)
    roads["geometry"] = roads.geometry.buffer(ROAD_BUFFER_M)
    return roads


def run(ctx: ScenarioContext) -> Path:
    accidents = geo.to_metric(gpd.read_parquet(ctx.accidents_parquet))
    roads = _tempo100_roads(ctx.osm_raw)

    # Unfälle auf 100er-Straßen (Mehrfachtreffer z.B. an Kreuzungen entdoppeln).
    on_roads = geo.dedupe_index(
        gpd.sjoin(accidents, roads[["geometry"]], how="inner", predicate="intersects")
    )
    if on_roads.empty:
        raise ValueError("scenario1: keine Unfälle auf Tempo-100-Straßen")

    coords = np.column_stack([on_roads.geometry.x.to_numpy(), on_roads.geometry.y.to_numpy()])
    labels = DBSCAN(
        eps=DBSCAN_EPS_M, min_samples=DBSCAN_MIN_SAMPLES, metric="euclidean"
    ).fit_predict(coords)
    on_roads = on_roads.assign(cluster_id=labels)
    clustered = on_roads[on_roads["cluster_id"] != -1].copy()  # -1 = Rauschen
    if clustered.empty:
        raise ValueError("scenario1: keine Cluster gefunden (nur Rauschen)")

    # Konvexe Hülle je Cluster (+10 m Buffer).
    hulls = clustered.dissolve(by="cluster_id").convex_hull.reset_index(name="geometry")
    hulls = gpd.GeoDataFrame(hulls, geometry="geometry", crs=clustered.crs)
    hulls["geometry"] = hulls.geometry.buffer(HULL_BUFFER_M)

    # Cluster-Größe + UKATEGORIE-Verteilung (One-Hot per Kategorie).
    sizes = clustered.groupby("cluster_id").size().rename("cluster_size").reset_index()
    ukat = (
        clustered.groupby(["cluster_id", "UKATEGORIE"])
        .size()
        .unstack(fill_value=0)
        .rename(columns={1: "UKATEGORIE__1", 2: "UKATEGORIE__2", 3: "UKATEGORIE__3"})
        .reset_index()
    )
    hulls = hulls.merge(sizes, on="cluster_id").merge(ukat, on="cluster_id", how="left")
    for col in UKAT_COLS:
        if col not in hulls.columns:
            hulls[col] = 0
    hulls[UKAT_COLS] = hulls[UKAT_COLS].fillna(0).astype(int)

    hulls_wgs = geo.to_wgs(hulls)

    tmp = ctx.out_dir / "_tmp"
    tmp.mkdir(parents=True, exist_ok=True)
    polys_fgb = tmp / "scenario1_polys.fgb"
    points_fgb = tmp / "scenario1_points.fgb"
    hulls_wgs.to_file(polys_fgb, driver="FlatGeobuf")
    geo.centroids(hulls_wgs).to_file(points_fgb, driver="FlatGeobuf")

    output = ctx.out_dir.parent / OUTPUT  # data/scenarios/...
    return tiles.build_dual_layer(
        points_fgb,
        polys_fgb,
        output,
        points_layer="scenario1-points",
        polys_layer="scenario1-polys",
        dry_run=ctx.dry_run,
    )
