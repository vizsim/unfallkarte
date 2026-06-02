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

`tippecanoe` + `tile-join`, `osmium-tool`, `gdal-bin` (für `ogr2ogr`).
b2-CLI via `uv tool install b2`.

## Layout

`data/` (gitignored) liegt unter `pipeline/data/` — `config.py` löst die Paket-
Wurzel relativ zu `src/unfallkarte/config.py` auf. Ob das Frontend-Local-first
direkt aus `pipeline/data/` oder einem Repo-Root-`data/` liest, ist eine offene
Phase-4-Entscheidung (Deploy/Frontend-Integration).
