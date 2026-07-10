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


def gpkg_to_fgb(gpkg: Path, fgb: Path) -> Path:
    """Liest den `links`-Layer der GPKG (EPSG:4326) und schreibt FlatGeobuf für tippecanoe."""
    from pyogrio import read_dataframe

    gdf = read_dataframe(gpkg, layer=_LAYER)
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
