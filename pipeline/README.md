# unfallkarte — Pipeline

Python-Pipeline (uv) für die Unfallkarte: Unfalldaten laden/harmonisieren, OSM-
Kontextlayer bauen, Szenarien rechnen, PMTiles erzeugen und nach B2 deployen.
Ersetzt die alten Notebooks in `../preprocessing/` und `../scenarios/`.

Strategie & Begründung: `../REFACTORING_PLAN.md`. Regeln: `../CLAUDE.md`.
Status/Offenes: `../WRAPUP.md`.

## Setup

```bash
uv sync                       # Environment + Paket (editable) installieren
uv run unfallkarte info       # Wiring-Smoke-Check (Pfade/Config)
uv run pytest                 # Tests
uvx ruff check                # Lint
```

`.env` aus `.env.example` ableiten (B2-Keys, Mapillary-Token); niemals committen.

## CLI

```
unfallkarte accidents fetch|build|tiles   # Unfalldaten → GeoParquet → PMTiles
unfallkarte osm fetch|build               # Geofabrik + osmium → PMTiles
unfallkarte scenario list|run|run-all     # Szenarien
unfallkarte manifest                      # data/manifest.json (Local-first + Datenstand)
unfallkarte deploy                        # b2 sync (PMTiles + manifest)
```

## System-Binaries (nicht via pip)

`tippecanoe` + `tile-join`, `osmium-tool`. b2-CLI via `uv tool install b2`.
(`ogr2ogr`/gdal-bin nicht nötig — OSM-PBF wird direkt via pyogrio gelesen.)

## Szenarien

`scenario run-all` rechnet: **1** (Unfall-Cluster auf Tempo-100-Straßen, DBSCAN) ·
**2** (Unfälle nahe Schulen) · **3** (Tempo-30 durchgängig, 50er-Lückenschlüsse) ·
**6** (Tempo-50-Straßen vor Schulen) · **8** (Lärm vor Schulen, UBA). sc8 braucht die
UBA-Lärm-fgb unter `data/raw/laerm/` (statisch, verlinkt).

## Layout

`data/` (gitignored) liegt unter `pipeline/data/` — `config.py` löst die Paket-Wurzel
relativ zu `src/unfallkarte/config.py` auf. Fürs Frontend-Local-first zeigt ein
gitignored Symlink `../data` → `pipeline/data` auf den Baum (Repo-Root-Serving); das
Manifest wird local-first gelesen, sonst aus dem B2-Bucket.
