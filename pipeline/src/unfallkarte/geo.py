"""Geteilte Spatial-Helper.

Kapselt die Muster, die heute über die Szenarien hinweg kopiert sind: Reprojektion
metrisch/WGS84, Buffern, Punkte-pro-Feature zählen (sjoin + value_counts),
Zentroide, Index-Dedupe. Szenarien bauen darauf auf statt jeweils eigene Varianten.

CRS-Konvention: metrische Operationen in EPSG:25832, Output/Speicherung in EPSG:4326.
"""

from __future__ import annotations

import geopandas as gpd
import pandas as pd

METRIC_CRS = "EPSG:25832"
WGS84 = "EPSG:4326"


def to_metric(gdf: gpd.GeoDataFrame) -> gpd.GeoDataFrame:
    """Nach EPSG:25832 (Meter) für Buffer/Distanz/Joins."""
    return gdf.to_crs(METRIC_CRS)


def to_wgs(gdf: gpd.GeoDataFrame) -> gpd.GeoDataFrame:
    """Nach EPSG:4326 für Output."""
    return gdf.to_crs(WGS84)


def buffer(gdf: gpd.GeoDataFrame, meters: float) -> gpd.GeoDataFrame:
    """Buffert in Metern (intern in EPSG:25832), behält das Eingangs-CRS bei."""
    src_crs = gdf.crs
    metric = to_metric(gdf).copy()
    metric["geometry"] = metric.geometry.buffer(meters)
    return metric.to_crs(src_crs) if src_crs else metric


def centroids(gdf: gpd.GeoDataFrame) -> gpd.GeoDataFrame:
    """Zentroide (berechnet in EPSG:25832, zurück im Eingangs-CRS)."""
    src_crs = gdf.crs
    metric = to_metric(gdf).copy()
    metric["geometry"] = metric.geometry.centroid
    return metric.to_crs(src_crs) if src_crs else metric


def dedupe_index(gdf: gpd.GeoDataFrame) -> gpd.GeoDataFrame:
    """Entfernt Zeilen mit dupliziertem Index (z.B. Mehrfachtreffer aus sjoin)."""
    return gdf[~gdf.index.duplicated(keep="first")]


def make_osm_oid(gdf: gpd.GeoDataFrame) -> gpd.GeoDataFrame:
    """Baut eine einheitliche `oid`: 'way/<osm_way_id>' falls vorhanden, sonst
    'node/<osm_id>'. Geteilt zwischen OSM-Daten und Szenarien (z.B. Schulen)."""
    out = gdf.copy()

    def _oid(row: pd.Series) -> str | None:
        way = row.get("osm_way_id")
        node = row.get("osm_id")
        if pd.notnull(way):
            return f"way/{int(way)}"
        if pd.notnull(node):
            return f"node/{int(node)}"
        return None

    out["oid"] = out.apply(_oid, axis=1)
    return out


def count_accidents_per_feature(
    accidents: gpd.GeoDataFrame,
    features: gpd.GeoDataFrame,
    feature_id: str,
    categories: dict[str, tuple[str, object]] | None = None,
    *,
    predicate: str = "intersects",
) -> pd.DataFrame:
    """Zählt Unfälle je Feature (sjoin) — verallgemeinert das Szenario-2/6-Muster.

    Args:
        accidents: Punkt-GeoDataFrame der Unfälle.
        features:  Polygon/Buffer-GeoDataFrame mit Spalte `feature_id`.
        feature_id: Spaltenname der Feature-ID (z.B. "oid").
        categories: optional {name: (spalte, wert)}, z.B.
            {"bike": ("IstRad", 1), "ped": ("IstFuss", 1)} → bike_count, ped_count.
        predicate: sjoin-Prädikat (default "intersects").

    Returns:
        DataFrame mit feature_id + total_count + <name>_count je Kategorie
        (fehlende = 0, int).
    """
    if accidents.crs != features.crs:
        accidents = accidents.to_crs(features.crs)

    joined = gpd.sjoin(
        accidents, features[[feature_id, "geometry"]], how="inner", predicate=predicate
    )

    counts = joined[feature_id].value_counts().rename("total_count")
    out = counts.to_frame()

    for name, (col, val) in (categories or {}).items():
        sub = joined[joined[col] == val][feature_id].value_counts().rename(f"{name}_count")
        out = out.join(sub, how="left")

    out = out.fillna(0).astype(int).reset_index()
    return out.rename(columns={"index": feature_id})
