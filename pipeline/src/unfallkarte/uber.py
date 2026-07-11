# SPDX-License-Identifier: AGPL-3.0-or-later
"""Uber Movement (Berlin, Q2/2019): Pkw-Geschwindigkeiten je Stunde → PMTiles.

Uber Movement ist seit 2023 abgeschaltet — die Roh-CSV
(`movement-speeds-quarterly-by-hod-berlin-2019-Q2.csv.zip`) ist NICHT mehr
beschaffbar und liegt als archivierter Input in `data/raw/uber/`. Die passende
historische OSM-Basis (berlin-200101.osm.pbf) kommt weiter von Geofabrik.

Ablauf (1:1 aus `preprocessing/uber_movement/prepare_uber_movement_allhours.ipynb`):
CSV referenziert Segmente als (osm_way_id, osm_start_node_id, osm_end_node_id) —
oft NICHT benachbarte Nodes. Darum: highway-Ways in Node-zu-Node-Minisegmente
zerlegen (osmium-tool: tags-filter → add-locations-to-ways → OPL, kein pyosmium),
dann je CSV-Segment die Geometrie per BFS im Way-Graph rekonstruieren (Tiefen-
Staffel 6→100, Rückrichtung als Fallback → `reconstruction_direction`).

Frontend-Vertrag: Source-ID `uspeed`, interner Layer `uber_movement_osm`, Felder
`hour_of_day` / `reconstruction_direction` ("forward"/"reverse") / `speed_kph_mean`
(js/mapdata/addLayers.js, js/ui/setupLayerToggles.js, js/ui/popupHandlers.js).

Bewusst im Long-Format portiert (24 Features je Segment/Richtung, Stunden-Slider
filtert auf `hour_of_day`). Ein Wide-Format — ein Feature je Segment/Richtung mit
`speed_0`…`speed_23` — würde nachweislich funktionieren (das Alt-Notebook hat den
Wide-Stand `df_final` sogar als Zwischenschritt) und die Featurezahl auf 1/24
drücken; dafür müsste der Slider im Frontend aber per setPaintProperty auf
["get", "speed_"+h] umgestellt werden statt per Filter → Vertragsänderung an drei
Stellen, daher als Folgeschritt notiert (docs/TODO.md).
"""

from __future__ import annotations

import re
import subprocess
from collections import defaultdict, deque
from pathlib import Path
from shutil import which

import requests

from unfallkarte import tiles
from unfallkarte.config import get_paths, load_yaml

_CSV = "movement-speeds-quarterly-by-hod-berlin-2019-Q2.csv.zip"
_PBF = "berlin-200101.osm.pbf"
# Geofabrik-Snapshot passend zum Datenstand der Uber-CSV (Q2/2019 → OSM 2020-01-01,
# wie im Alt-Notebook). Dated snapshots bleiben bei Geofabrik dauerhaft verfügbar.
_PBF_URL = f"https://download.geofabrik.de/europe/germany/{_PBF}"
_LAYER = "uber_movement_osm"  # interner tippecanoe-Layer = Frontend-Vertrag
_DEPTHS = (6, 12, 18, 24, 50, 100)  # BFS-Tiefen-Staffel wie im Notebook

# OPL-Way-Node-Ref mit eingebetteter Location: "n<ref>x<lon>y<lat>"
_ND = re.compile(r"^n(\d+)x(-?[\d.]+)y(-?[\d.]+)$")


def _raw() -> Path:
    return get_paths().raw / "uber"


def _dataset() -> dict:
    return load_yaml("sources.yaml")["datasets"]["uber_speed"]


def _run(cmd: list[str], *, dry_run: bool) -> None:
    printable = " ".join(cmd)
    if dry_run or which(cmd[0]) is None:
        reason = "dry-run" if dry_run else f"'{cmd[0]}' nicht installiert"
        print(f"  [{reason}] {printable}")
        return
    print(f"  $ {printable}")
    subprocess.run(cmd, check=True)


def fetch(*, force: bool = False) -> Path:
    """Lädt die historische Berlin-PBF von Geofabrik; prüft, dass die Uber-CSV liegt."""
    _raw().mkdir(parents=True, exist_ok=True)
    csv = _raw() / _CSV
    if not csv.exists():
        raise FileNotFoundError(
            f"Uber-CSV fehlt: {csv} — Uber Movement ist abgeschaltet, die Datei ist "
            "nicht mehr beschaffbar. Archivkopie (lokal/B2) nach data/raw/uber/ legen."
        )
    dest = _raw() / _PBF
    if dest.exists() and not force:
        print(f"  vorhanden: {dest}")
        return dest
    print(f"  lade {_PBF_URL}")
    with requests.get(_PBF_URL, stream=True, timeout=600) as resp:
        resp.raise_for_status()
        with open(dest, "wb") as fh:
            for chunk in resp.iter_content(chunk_size=1 << 20):
                fh.write(chunk)
    return dest


def _highways_opl(pbf: Path, *, dry_run: bool = False) -> Path:
    """PBF → highway-Ways als OPL mit eingebetteten Node-Locations (Nn<ref>x<lon>y<lat>).

    pyogrio/GDAL liefert keine Node-IDs je Way — die braucht der Segment-Graph aber,
    weil die Uber-CSV Segmente über (way_id, start_node, end_node) referenziert.
    """
    highways = _raw() / "highways.pbf"
    opl = _raw() / "highways.opl"
    _run(
        ["osmium", "tags-filter", "--overwrite", str(pbf), "w/highway", "-o", str(highways)],
        dry_run=dry_run,
    )
    _run(
        ["osmium", "add-locations-to-ways", "--ignore-missing-nodes", "--overwrite",
         str(highways), "-o", str(opl)],
        dry_run=dry_run,
    )
    return opl


def build_way_graph(opl: Path, way_ids: set[int]) -> dict:
    """Zerlegt highway-Ways in Node-zu-Node-Minisegmente:
    way_id -> start_node -> [(end_node, LineString)].

    Semantik wie im Notebook: Ways mit <2 Nodes oder fehlenden Node-Locations werden
    komplett ausgelassen. `way_ids` beschränkt den Graph auf Ways, die in der CSV
    vorkommen — reine Speicheroptimierung, die BFS schaut eh nur dort hinein.
    """
    from shapely.geometry import LineString

    graph: dict = defaultdict(lambda: defaultdict(list))
    n_ways = 0
    with open(opl, encoding="utf-8") as fh:
        for line in fh:
            if not line.startswith("w"):
                continue
            fields = line.rstrip("\n").split(" ")
            way_id = int(fields[0][1:])
            if way_id not in way_ids:
                continue
            nd_field = next((f for f in fields if f.startswith("N")), None)
            if nd_field is None:
                continue
            refs = nd_field[1:].split(",")
            if len(refs) < 2:
                continue
            nodes: list[tuple[int, float, float]] = []
            for ref in refs:
                m = _ND.match(ref)
                if m is None:  # Node ohne Location -> ganzen Way auslassen (wie Notebook)
                    nodes = []
                    break
                nodes.append((int(m.group(1)), float(m.group(2)), float(m.group(3))))
            if len(nodes) < 2:
                continue
            n_ways += 1
            for (a, ax, ay), (b, bx, by) in zip(nodes, nodes[1:], strict=False):
                graph[way_id][a].append((b, LineString([(ax, ay), (bx, by)])))
    print(f"  Graph: {n_ways} Ways (von {len(way_ids)} in der CSV referenzierten)")
    return graph


def _find_path(graph: dict, way_id: int, start: int, end: int, max_depth: int):
    """BFS im Minisegment-Graph EINES Ways; gibt (Pfad, gemergte Geometrie) zurück."""
    from shapely.ops import linemerge

    visited: set[int] = set()
    queue: deque = deque([(start, [start], [])])
    while queue:
        current, path, geoms = queue.popleft()
        if current == end:
            return path, linemerge(geoms)
        if len(path) > max_depth:
            continue
        for neighbor, geom in graph[way_id].get(current, []):
            if neighbor not in visited:
                visited.add(neighbor)
                queue.append((neighbor, path + [neighbor], geoms + [geom]))
    return None, None


def reconstruct_geometries(df_movement, graph: dict):
    """Rekonstruiert je eindeutigem CSV-Segment die Geometrie (forward, sonst reverse
    mit umgekehrter Geometrie). Gibt GeoDataFrame mit `reconstruction_direction`."""
    import geopandas as gpd
    from shapely.geometry import LineString
    from tqdm import tqdm

    keys = ["osm_way_id", "osm_start_node_id", "osm_end_node_id"]
    segment_keys = df_movement[keys].drop_duplicates()
    rows: list[dict] = []
    for way_id, start, end in tqdm(
        segment_keys.itertuples(index=False), total=len(segment_keys), desc="  BFS"
    ):
        way_id, start, end = int(way_id), int(start), int(end)
        geom = direction = None
        for depth in _DEPTHS:
            _, geom = _find_path(graph, way_id, start, end, max_depth=depth)
            if geom:
                direction = "forward"
                break
        if not geom:
            for depth in _DEPTHS:
                _, geom = _find_path(graph, way_id, end, start, max_depth=depth)
                if geom:
                    geom = LineString(list(geom.coords)[::-1])
                    direction = "reverse"
                    break
        if geom:
            rows.append({
                "osm_way_id": way_id,
                "osm_start_node_id": start,
                "osm_end_node_id": end,
                "reconstruction_direction": direction,
                "geometry": geom,
            })
    print(f"  rekonstruiert: {len(rows)}/{len(segment_keys)} Segmente")
    return gpd.GeoDataFrame(rows, geometry="geometry", crs="EPSG:4326")


def csv_to_fgb(csv: Path, opl: Path, fgb: Path) -> tuple[Path, int]:
    """Uber-CSV + Way-Graph → Long-Format-FGB (24 Zeilen je Segment/Richtung).

    Entspricht dem Notebook-Pivot/Melt-Roundtrip: die CSV hat keine Duplikate je
    (Segment, Stunde), damit ist inner-merge + Spaltenauswahl exakt äquivalent.
    Für ein Wide-Format würde man hier stattdessen auf speed_0..speed_23 pivoten
    (ein Feature je Segment/Richtung) — funktioniert, braucht aber den Frontend-
    Umbau des Stunden-Sliders (s. Modul-Docstring).
    """
    import geopandas as gpd
    import pandas as pd

    df_movement = pd.read_csv(csv)
    keys = ["osm_way_id", "osm_start_node_id", "osm_end_node_id"]
    graph = build_way_graph(opl, set(df_movement["osm_way_id"].astype(int)))
    geometry_df = reconstruct_geometries(df_movement, graph)

    merged = df_movement.merge(geometry_df, on=keys, how="inner")
    gdf = gpd.GeoDataFrame(
        merged[[*keys, "reconstruction_direction", "speed_kph_mean", "hour_of_day"]],
        geometry=merged["geometry"],
        crs="EPSG:4326",
    )
    gdf = gdf[~gdf["speed_kph_mean"].isna()]
    fgb.parent.mkdir(parents=True, exist_ok=True)
    gdf.to_file(fgb, driver="FlatGeobuf")
    return fgb, len(gdf)


def build(*, dry_run: bool = False) -> Path:
    """Voller Build: fetch (falls nötig) → OPL → BFS-Rekonstruktion → FGB → PMTiles."""
    pbf = _raw() / _PBF
    if not pbf.exists() and not dry_run:
        pbf = fetch()

    opl = _highways_opl(pbf, dry_run=dry_run)
    fgb = _raw() / "uber_speed.fgb"
    if dry_run or not opl.exists():
        print("  [skip] FGB (kein OPL / dry-run)")
    else:
        _, k = csv_to_fgb(_raw() / _CSV, opl, fgb)
        print(f"  Features (long, 24h): {k}")

    out = get_paths().data / _dataset()["file"]
    return tiles.tippecanoe("uber_speed", fgb, out, layer_override=_LAYER, dry_run=dry_run)
