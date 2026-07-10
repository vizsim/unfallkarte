# SPDX-License-Identifier: AGPL-3.0-or-later
"""movebis (TU Dresden / Stadtradeln): Rad-Geschwindigkeiten → PMTiles.

Quelle: `data/raw/movebis_speed_germany_10.gpkg` (Layer `links`, EPSG:4326,
~9,9 Mio LineStrings, Felder `avg_speed_kmh` + `visits`, bereits auf visits>=10
gefiltert). Verarbeitung ist minimal — die GPKG ist schon der saubere Stand:
GPKG → FlatGeobuf → tippecanoe.

Frontend-Vertrag: Source-ID `movebis`, interner Layer `links`, Felder
`avg_speed_kmh`/`visits` (js/mapdata/addLayers.js, js/ui/popupHandlers.js). Das
gestufte Ausdünnen bei niedrigem Zoom (nur Hauptkorridore) macht das tippecanoe-
Profil `movebis` (config/tiles.yaml, feature_filter auf `visits`/`$zoom`).
"""

from __future__ import annotations

from pathlib import Path

from unfallkarte import tiles
from unfallkarte.config import get_paths, load_yaml

_SRC = "movebis_speed_germany_10.gpkg"
_LAYER = "links"          # Layer in GPKG UND interner tippecanoe-Layer = Frontend-Vertrag


def _dataset() -> dict:
    return load_yaml("sources.yaml")["datasets"]["movebis"]


def add_major_direction(gdf):
    """Markiert je ungerichtetem Kantenpaar (Hin/Rück, gleiche Endpunkte) die Richtung mit
    den meisten `visits` als `is_major=1` (Gleichstand → beide 1, Einzelrichtung → 1).

    Damit kann der Tile-Filter bei niedrigem Zoom die schwächere Gegenrichtung ausblenden
    (eine Linie pro Straße statt zwei überlappender) — halbiert die Feature-Zahl ~sauber,
    ohne Droppen/Löcher. Endpunkt-Schlüssel genügt (im Test 0 Gruppen mit >2 Segmenten).
    """
    import numpy as np
    import pandas as pd
    import shapely

    geom = gdf.geometry.values
    last_idx = shapely.get_num_points(geom) - 1
    first, last = shapely.get_point(geom, 0), shapely.get_point(geom, last_idx)
    r = 1_000_000  # ~1e-6 Grad Raster
    fx = np.round(shapely.get_x(first) * r).astype("int64")
    fy = np.round(shapely.get_y(first) * r).astype("int64")
    lx = np.round(shapely.get_x(last) * r).astype("int64")
    ly = np.round(shapely.get_y(last) * r).astype("int64")
    swap = (fx > lx) | ((fx == lx) & (fy > ly))            # Endpunkte kanonisch sortieren
    k1x, k1y = np.where(swap, lx, fx), np.where(swap, ly, fy)
    k2x, k2y = np.where(swap, fx, lx), np.where(swap, fy, ly)
    key = pd.DataFrame({"k1x": k1x, "k1y": k1y, "k2x": k2x, "k2y": k2y})
    key["visits"] = gdf["visits"].to_numpy()
    maxv = key.groupby(["k1x", "k1y", "k2x", "k2y"])["visits"].transform("max")
    gdf = gdf.copy()
    gdf["is_major"] = (gdf["visits"].to_numpy() >= maxv.to_numpy()).astype("int32")
    return gdf


def gpkg_to_fgb(gpkg: Path, fgb: Path) -> Path:
    """Liest den `links`-Layer der GPKG (EPSG:4326), markiert die Hauptrichtung und
    schreibt FlatGeobuf für tippecanoe."""
    from pyogrio import read_dataframe

    gdf = read_dataframe(gpkg, layer=_LAYER)
    gdf = add_major_direction(gdf)
    fgb.parent.mkdir(parents=True, exist_ok=True)
    gdf.to_file(fgb, driver="FlatGeobuf")
    return fgb


def build(*, dry_run: bool = False) -> Path:
    """GPKG → FGB → traffic/movebis.pmtiles (interner Layer `links`, ab z9)."""
    paths = get_paths()
    gpkg = paths.raw / _SRC
    if not dry_run and not gpkg.exists():
        raise FileNotFoundError(f"GPKG fehlt: {gpkg} — movebis-Quelle nach data/raw/ legen.")

    fgb = paths.raw / "movebis.fgb"
    if not dry_run:
        gpkg_to_fgb(gpkg, fgb)

    out = paths.data / _dataset()["file"]
    return tiles.tippecanoe("movebis", fgb, out, layer_override=_LAYER, dry_run=dry_run)
