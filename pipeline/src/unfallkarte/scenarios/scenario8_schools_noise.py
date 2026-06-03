"""Szenario 8: Lärm vor Schulen — Schulen in einer Straßen-Lärmzone ≥60 dB.

UBA-Umgebungslärm (Hauptverkehrsstraßen, Lden) als Lärmpegelklassen-Polygone
(datahub.uba.de, statisch — liegt als exploded fgb vor, kein Re-Fetch). Je Schule
der höchste überlappende Lärmpegel (sjoin), Schulen mit >56 dB (Klasse Lden6064+)
behalten.

Output = Dual-Layer (scenario8-points/-polys). Portiert aus
scenario8_laerm_schulen.ipynb (Germany-weit statt Berlin-Clip), auf geo.py.
"""

from __future__ import annotations

from pathlib import Path

import geopandas as gpd

from unfallkarte import geo, tiles

from .base import ScenarioContext

NAME = "scenario8"
DESCRIPTION = "Lärm vor Schulen (Straßen-Lden > 56 dB)"
OUTPUT = "scenarios/scenario8_laerm_schulen.pmtiles"

LAERM_FGB = "laerm_den_road.fgb"
LAERM_THRESHOLD = 56  # > 56 -> ab Klasse Lden6064 (60er-Zone)
POINT_BUFFER_M = 3
LAERM_CLASS_NUM = {
    "Lden5559": 55,
    "Lden6064": 60,
    "Lden6569": 65,
    "Lden7074": 70,
    "LdenGreaterThan75": 75,
}


def run(ctx: ScenarioContext) -> Path:
    if ctx.laerm_raw is None:
        raise FileNotFoundError("scenario8: ScenarioContext.laerm_raw nicht gesetzt.")
    laerm_path = ctx.laerm_raw / LAERM_FGB
    if not laerm_path.exists():
        raise FileNotFoundError(
            f"scenario8: Lärm-fgb fehlt: {laerm_path} (UBA-Lärmdaten, statisch verlinken)."
        )

    schools = geo.make_osm_oid(gpd.read_file(ctx.osm_raw / "schools.fgb"))  # EPSG:4326

    laerm = gpd.read_file(laerm_path)  # EPSG:4326, 2km-exploded Polygone
    laerm["laerm_num"] = laerm["Lärmpegelklasse"].map(LAERM_CLASS_NUM)
    laerm = laerm[["laerm_num", "geometry"]].dropna(subset=["laerm_num"])

    # sjoin in 4326 (intersects ist topologisch -> kein Reprojizieren der 1,3 Mio Polygone).
    joined = gpd.sjoin(schools, laerm, how="left", predicate="intersects")
    max_laerm = joined.groupby(joined.index)["laerm_num"].max()
    schools["max_laerm_num"] = schools.index.map(max_laerm)

    loud = schools[schools["max_laerm_num"] > LAERM_THRESHOLD].copy()
    if loud.empty:
        raise ValueError("scenario8: keine Schule über der Lärm-Schwelle (56 dB)")
    loud["max_laerm_num"] = loud["max_laerm_num"].astype(int)

    # Punkt-Schulen 3 m puffern (Polygon-Schulen bleiben) — metrisch, dann zurück WGS84.
    loud_m = geo.to_metric(loud)
    loud_m["geometry"] = loud_m.geometry.apply(
        lambda g: g.buffer(POINT_BUFFER_M) if g.geom_type == "Point" else g
    )
    loud_wgs = geo.to_wgs(loud_m)

    tmp = ctx.out_dir / "_tmp"
    tmp.mkdir(parents=True, exist_ok=True)
    polys_fgb = tmp / "scenario8_polys.fgb"
    points_fgb = tmp / "scenario8_points.fgb"
    loud_wgs.to_file(polys_fgb, driver="FlatGeobuf")
    geo.centroids(loud_wgs).to_file(points_fgb, driver="FlatGeobuf")

    output = ctx.out_dir.parent / OUTPUT  # data/scenarios/...
    return tiles.build_dual_layer(
        points_fgb,
        polys_fgb,
        output,
        points_layer="scenario8-points",
        polys_layer="scenario8-polys",
        dry_run=ctx.dry_run,
    )
