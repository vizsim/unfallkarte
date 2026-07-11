# unfallkarte — Pipeline

Python-Pipeline (uv) für die Unfallkarte: Unfalldaten laden/harmonisieren, OSM- und
Kontextlayer bauen, Szenarien rechnen, PMTiles erzeugen und nach B2 deployen.
Ersetzt die früheren Jupyter-Notebooks (Refactor abgeschlossen).

Historie & Begründung: `../docs/REFACTORING_PLAN.md`. Regeln: `../CLAUDE.md`.
Offene Punkte: `../docs/TODO.md`.

## Setup

```bash
uv sync                       # Environment + Paket (editable) installieren
uv run unfallkarte info       # Wiring-Smoke-Check (Pfade/Config)
uv run pytest                 # Tests
uvx ruff check                # Lint
```

`.env` aus `.env.example` ableiten (B2-Keys, Mapillary-Token); niemals committen.

## CLI

```text
unfallkarte accidents fetch|build|tiles   # Unfalldaten → GeoParquet → PMTiles
unfallkarte osm fetch|build               # Geofabrik + osmium → PMTiles
unfallkarte scenario list|run|run-all     # Szenarien
unfallkarte hvs fetch|build               # UBA-Verkehrsmengen (Hauptverkehrsstraßen)
unfallkarte laerm fetch|build             # UBA-Umgebungslärm (Tag/Nacht)
unfallkarte obs fetch|build               # OpenBikeSensor-Überholabstände
unfallkarte telraam fetch|build           # Telraam-Zählstellen
unfallkarte movebis build                 # movebis Rad-Geschwindigkeiten (GPKG lokal)
unfallkarte manifest                      # data/manifest.json (Local-first + Datenstand)
unfallkarte deploy                        # b2 sync (PMTiles + manifest)
```

## System-Binaries (nicht via pip)

`tippecanoe` + `tile-join`, `osmium-tool`. b2-CLI via `uv tool install b2`.
(`ogr2ogr`/gdal-bin nicht nötig — OSM-PBF wird direkt via pyogrio gelesen.)

## Szenarien

`scenario run-all` rechnet: **1** (Unfall-Cluster auf Tempo-100-Straßen, DBSCAN) ·
**2** (Unfälle nahe Schulen) · **3** (Tempo-30 durchgängig, 50er-Lückenschlüsse) ·
**6** (Tempo-50-Straßen vor Schulen) · **8** (Lärm vor Schulen, UBA) ·
**9** (Unfallhäufungen, M-Uko-Kriterien vereinfacht: 3-Jahres-Fenster + DBSCAN).
sc8 braucht die UBA-Lärm-fgb unter `data/raw/laerm/` (statisch, verlinkt).

## Laufzeiten (grobe Richtwerte)

Gemessen beim Jahres-Update 2026-07 (WSL2, lokale SSD). Reihenfolge = typischer
Update-Ablauf; accidents- und osm-Strang sind unabhängig und können parallel laufen.

| Schritt | Dauer | Anmerkung |
| --- | --- | --- |
| `accidents fetch` | Sekunden/Jahr | ~13 MB ZIP pro Jahr |
| `accidents build` | ~2 min | 9 Jahre, 2,2 Mio. Zeilen → GeoParquet |
| `accidents tiles` | ~10 min | single ~6 min, cluster ~4 min (Tippecanoe) |
| `osm fetch` | ~10 min | 4,5 GB Geofabrik-PBF (netzabhängig) |
| `osm build all` | ~20 min | 6 Layer; je Layer osmium-Filter über die volle PBF + Tippecanoe |
| `scenario run-all` | ~30 min | Szenarien 1/2/3/6/8/9; teuerstes: 3 (Tempo-30-Netz-Analyse, ~18 min) |
| `manifest` + `deploy` | ~3 min | b2 sync; ~2,5 min für ~1,1 GB Upload bei Voll-Update |

## Layout

`data/` (gitignored) liegt unter `pipeline/data/` — `config.py` löst die Paket-Wurzel
relativ zu `src/unfallkarte/config.py` auf. Fürs Frontend-Local-first zeigt ein
gitignored Symlink `../data` → `pipeline/data` auf den Baum (Repo-Root-Serving); das
Manifest wird local-first gelesen, sonst aus dem B2-Bucket.
