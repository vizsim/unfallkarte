# SPDX-License-Identifier: AGPL-3.0-or-later
"""Szenario 9: Unfallhäufungen nach M-Uko-Kriterien (vereinfacht), regelgetrieben.

Wortwahl: bewusst "Unfallhäufungen", NICHT "Unfallschwerpunkte"/"Unfallhäufungsstellen" —
deren Feststellung ist Sache der Unfallkommission (M Uko / VwV-StVO zu §44); wir weisen
nur nach, dass Kriterien rechnerisch erfüllt sind.

Rollierende 3-Jahres-Fenster über die Unfallatlas-Daten; je Regel (U(P)>=5,
U(SP)>=3, gleicher UTYP1>=5) DBSCAN-Cluster (eps=25 m). Überlappende Fenster-
Hüllen werden je (rule, utyp) gemergt; Attribute siehe Property-Vertrag im
Issue-Brief (rule, utyp, n_max, window_best, n_windows, UKATEGORIE__1/2/3).

Die M-Uko-Kriterien sind als kleine `Rule`-Liste modelliert (regelgetrieben):
ein neues Kriterium = ein Eintrag in RULES, keine Logikänderung.

Caveat: Der Unfallatlas enthält nur Unfälle mit Personenschaden -> die offizielle
1-Jahres-Typenkarte der UKo (inkl. Sachschaden) ist damit NICHT abbildbar. Die
Karte ist eine Annäherung, keine amtliche UKo-Karte.
"""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

import geopandas as gpd
import numpy as np
import pandas as pd
from sklearn.cluster import DBSCAN

from unfallkarte import geo, tiles

from .base import ScenarioContext

NAME = "scenario9"
DESCRIPTION = "Unfallhäufungen nach M-Uko-Kriterien (vereinfacht): 3-Jahres-Fenster + DBSCAN"
OUTPUT = "scenarios/scenario9_hotspots.pmtiles"

EPS_M = 25          # "geringer Abstand" ~ Knotenbereich
HULL_BUFFER_M = 10  # heilt Punkt-/Linien-Hüllen kleiner Cluster
UKAT_COLS = ["UKATEGORIE__1", "UKATEGORIE__2", "UKATEGORIE__3"]


@dataclass(frozen=True)
class Rule:
    """Ein M-Uko-Kriterium. `group_by` macht es typbezogen ("gleichartig"),
    `where` schränkt die zugrunde liegenden Unfälle ein (pandas-query)."""

    id: str
    window_years: int
    min_count: int
    group_by: str | None = None   # z. B. "UTYP1" für "gleichartig"
    where: str | None = None      # pandas-query, z. B. "UKATEGORIE <= 2"


RULES: list[Rule] = [
    Rule("up5_3y", 3, 5),                          # >=5 U(P) / 3 Jahre
    Rule("usp3_3y", 3, 3, where="UKATEGORIE <= 2"),  # >=3 schwere U(SP) / 3 Jahre
    Rule("utyp5_3y", 3, 5, group_by="UTYP1"),      # >=5 gleicher Unfalltyp / 3 Jahre
]


def _windows(years: list[int], width: int) -> list[tuple[int, int]]:
    """Rollierende [lo, hi]-Fenster der Breite `width` über die vorhandenen Jahre."""
    hi_max = max(years)
    return [(y, y + width - 1) for y in years if y + width - 1 <= hi_max]


def _valid_laender(acc: gpd.GeoDataFrame, lo: int, hi: int) -> set[int]:
    """ULAND, die in JEDEM Jahr des Fensters Daten haben (Abdeckungs-Check).

    Frühe Unfallatlas-Jahrgänge decken nicht alle Bundesländer ab; Länder mit
    Lücken im Fenster werden übersprungen (nicht skaliert), sonst entstehen
    künstlich zu niedrige Counts. Immer auf den GESAMT-Daten prüfen.
    """
    sub = acc[acc["UJAHR"].between(lo, hi)]
    per_land = sub.groupby("ULAND")["UJAHR"].nunique()
    return set(per_land[per_land == (hi - lo + 1)].index)


def _cluster_hulls(
    grp: gpd.GeoDataFrame, rule: Rule, utyp: int, label: str
) -> gpd.GeoDataFrame:
    """DBSCAN-Cluster (eps=EPS_M, min_samples=rule.min_count) -> konvexe Hüllen
    je Cluster mit Cluster-Größe `n` und UKATEGORIE-One-Hot."""
    coords = np.column_stack([grp.geometry.x.to_numpy(), grp.geometry.y.to_numpy()])
    labels = DBSCAN(eps=EPS_M, min_samples=rule.min_count, metric="euclidean").fit_predict(coords)
    clustered = grp.assign(cluster_id=labels)
    clustered = clustered[clustered["cluster_id"] != -1]  # -1 = Rauschen
    if clustered.empty:
        return gpd.GeoDataFrame(geometry=[], crs=grp.crs)

    hulls = clustered.dissolve(by="cluster_id").convex_hull.reset_index(name="geometry")
    hulls = gpd.GeoDataFrame(hulls, geometry="geometry", crs=grp.crs)
    hulls["geometry"] = hulls.geometry.buffer(HULL_BUFFER_M)

    sizes = clustered.groupby("cluster_id").size().rename("n").reset_index()
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
    return hulls.assign(rule=rule.id, utyp=utyp, window=label).drop(columns=["cluster_id"])


def _dedupe_windows(hulls: gpd.GeoDataFrame) -> gpd.GeoDataFrame:
    """Überlappende Fenster-Hüllen je (rule, utyp) zu einem Hotspot mergen.

    Attribute aus dem stärksten Fenster (n_max/window_best/UKATEGORIE-One-Hot),
    plus n_windows = in wie vielen Fenstern der Ort auffällig war.
    """
    out: list[gpd.GeoDataFrame] = []
    for (rule_id, utyp), part in hulls.groupby(["rule", "utyp"]):
        merged = gpd.GeoDataFrame(
            geometry=gpd.GeoSeries([part.union_all()], crs=part.crs).explode(ignore_index=True),
            crs=part.crs,
        ).reset_index(names="hotspot_id")
        joined = gpd.sjoin(part, merged, how="inner", predicate="intersects")
        attrs = joined.drop(columns="geometry")  # plain DataFrame -> kein groupby auf Geometrie
        best = attrs.sort_values("n", ascending=False).groupby("hotspot_id").first()
        agg = attrs.groupby("hotspot_id").agg(n_windows=("window", "nunique"))
        res = (
            merged.merge(
                best[["n", "window", *UKAT_COLS]].rename(
                    columns={"n": "n_max", "window": "window_best"}
                ),
                on="hotspot_id",
            )
            .merge(agg, on="hotspot_id")
            .assign(rule=rule_id, utyp=utyp)
            .drop(columns=["hotspot_id"])
        )
        out.append(res)
    return gpd.GeoDataFrame(pd.concat(out, ignore_index=True), geometry="geometry", crs=hulls.crs)


def compute_hotspots(acc: gpd.GeoDataFrame) -> gpd.GeoDataFrame:
    """Reine Berechnung (ohne Tiles): metrische Unfälle -> deduplizierte Hotspots.

    `acc` muss in einem metrischen CRS (EPSG:25832) vorliegen und die Spalten
    UJAHR/ULAND/UKATEGORIE(/UTYP1) tragen. Rückgabe im selben CRS.
    """
    years = sorted(int(y) for y in acc["UJAHR"].unique())

    window_hulls: list[gpd.GeoDataFrame] = []
    for rule in RULES:
        df = acc.query(rule.where) if rule.where else acc
        for lo, hi in _windows(years, rule.window_years):
            laender = _valid_laender(acc, lo, hi)  # Abdeckung auf GESAMT-Daten prüfen
            win = df[df["UJAHR"].between(lo, hi) & df["ULAND"].isin(laender)]
            label = f"{lo}–{hi}"  # 2019–2021
            if rule.group_by:
                groups = list(win.groupby(rule.group_by))
            else:
                groups = [(0, win)]
            for key, grp in groups:
                if len(grp) < rule.min_count:
                    continue
                utyp = int(key) if rule.group_by else 0
                hulls = _cluster_hulls(grp, rule, utyp, label)
                if not hulls.empty:
                    window_hulls.append(hulls)

    if not window_hulls:
        raise ValueError("scenario9: keine Unfallhäufungen gefunden")

    all_hulls = gpd.GeoDataFrame(
        pd.concat(window_hulls, ignore_index=True),
        geometry="geometry",
        crs=window_hulls[0].crs,
    )
    return _dedupe_windows(all_hulls)


def run(ctx: ScenarioContext) -> Path:
    acc = geo.to_metric(gpd.read_parquet(ctx.accidents_parquet))
    hotspots = geo.to_wgs(compute_hotspots(acc))

    tmp = ctx.out_dir / "_tmp"
    tmp.mkdir(parents=True, exist_ok=True)
    polys_fgb = tmp / "scenario9_polys.fgb"
    points_fgb = tmp / "scenario9_points.fgb"
    hotspots.to_file(polys_fgb, driver="FlatGeobuf")
    geo.centroids(hotspots).to_file(points_fgb, driver="FlatGeobuf")

    output = ctx.out_dir.parent / OUTPUT  # data/scenarios/...
    return tiles.build_dual_layer(
        points_fgb,
        polys_fgb,
        output,
        points_layer="scenario9-points",
        polys_layer="scenario9-polys",
        dry_run=ctx.dry_run,
    )
