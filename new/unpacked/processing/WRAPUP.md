# Unfallkarte-Refactoring — Wrap-up & Status

Stand der Vorarbeit für das Makeover. Zwei Bundles zum Mitnehmen:
- **`unfallkarte-processing.zip`** — die Python-Pipeline (ersetzt die Notebooks).
- **`unfallkarte-frontend.zip`** — die Makeover-Module fürs Frontend.

Doku: dieses `WRAPUP.md`, `REFACTORING_PLAN.md` (Strategie/Warum), `CLAUDE.md`
(Regeln für Claude-in-VSC, liegt im Processing-Bundle), `EINBAU.md` (Frontend).

---

## Getroffene Entscheidungen (Log)

- **Packaging:** uv (kuratierte Deps, `uv.lock`), kein pip.
- **Daten-Hosting:** Local-first + B2-Fallback, gesteuert über generiertes
  `data/manifest.json`. Neues Bucket mit Subfoldern; `b2 sync` spiegelt `data/` 1:1.
- **Dateinamen:** stabil (kein Datum im Namen) + B2-Versionierung; Datenstand lebt
  im Manifest.
- **OSM:** Geofabrik + `osmium tags-filter`-Vorschnitt → ogr2ogr → Tiles.
- **Orchestrierung:** einfache CLI (kein DAG).
- **Lizenz:** AGPL-3.0-or-later.
- **Basemap/Terrain:** MapTiler raus → OpenFreeMap (Positron) + Mapterhorn
  (gehosteter DEM-Endpoint); Karten-Panel nach `gradients2osm`.
- **Radinfrastruktur:** Kontextlayer aus TILDA (live), kein Preprocessing.
- **Mapillary:** kein eigener Fetcher — externe PMTiles aus `vizsim/mapillary_trafficsigns`
  als `external`-Quellen konsumieren (Markings: Skript dort, selbst hosten).
- **Git-History:** ab jetzt `data/` gitignoren; History-Cleanup erst nach dem Merge.

---

## PROCESSING — getan ✅ (15 Tests grün, ruff sauber)

| Modul | Inhalt | getestet |
|---|---|---|
| `config.py` | Pfade, `.env` (pydantic-settings), YAML-Loader | ✓ |
| `accidents.py` | `fetch` (Jahres-ZIPs) + `build` (harmonisieren → GeoParquet) über Jahres-Registry | Build synthetisch + Golden |
| `tiles.py` | Tippecanoe/tile-join-Wrapper, Accident-Tiles, Dual-Layer; Dry-Run | Dry-Run + One-Hot |
| `osm.py` | Geofabrik + osmium + ogr2ogr → fgb/GeoJSON → Tiles (POI + Linien) | GPKG-Filter, oid, Dry-Run |
| `geo.py` | geteilte Helfer: to_metric/wgs, buffer, centroids, dedupe, `count_accidents_per_feature`, `make_osm_oid` | ✓ |
| `scenarios/scenario2_schools.py` | Szenario 2 voll: Schulen 50 m, Unfälle zählen, Dual-Layer-PMTiles | end-to-end synthetisch |
| `scenarios/{base,registry}.py` | Context + Registry + `run`/`run-all`/`list` | ✓ |
| `manifest.py` | generiert `data/manifest.json` (Local-first + Datenstand) | ✓ |
| `deploy.py` | `b2 sync` (PMTiles + manifest), Secrets aus `.env`, maskiert | Kommando-Dry-Run |
| Configs | `accidents.yaml` (inkl. 2024-Stub), `osm.yaml`, `tiles.yaml`, `sources.yaml`, `osmconf/*` | — |
| `tests/golden/` | `golden.py` + `accidents.json` (Referenz vom 1,68-Mio-Zeilen-Parquet) | ✓ |

**CLI:** `accidents fetch|build|tiles` · `osm fetch|build` · `scenario list|run|run-all`
· `manifest` · `deploy` · `info`.

---

## PROCESSING — offen 🔲 (in VSC)

- **End-to-End echt laufen lassen:** System-Binaries installieren
  (`tippecanoe`+`tile-join`, `osmium-tool`, `gdal-bin`), dann ohne `--dry-run`.
  Danach `golden.py compare` → muss „OK" liefern (Beweis: Python == Notebook).
- **`verify: true`-Stellen prüfen:**
  - Unfall-Jahr **2024** (Zip-Name/`csv_path`/Spalten gegen NRW-Quelle).
  - OSM **crossings**/**cycleways** (exakte `osmium`-Filterausdrücke gegen die
    `prepare_*`-Notebooks).
  - Mapillary-`external`-URLs (Branch/Pfad; Markings selbst hosten).
- **Restliche Szenarien portieren** (nach scenario2-Muster, `geo.py` nutzen):
  - `scenario1` Cluster · `scenario3` Tempo-30 durchgängig · `scenario6` Tempo-50
    vor Schulen (Highway-Länge + overlay — braucht Highway-Netz-Artefakt) ·
    `scenario8` Lärm vor Schulen (braucht Lärm-PMTiles).
  - `scenario4/5/7` = **keine** Pipeline-Szenarien → externe Mapillary-Layer.
- **Fehlende Kontext-Daten in die Pipeline holen** (heute nur im Frontend
  referenziert): Lärm (UBA), Uber-Movement, OBS, Hauptverkehrsstraßennetz,
  maxspeed major/minor (als OSM-Linien-Layer in `osm.yaml` ergänzbar).
- **Git-History-Cleanup** nach dem Merge (`git filter-repo`, einmalig).

---

## FRONTEND — getan ✅ (JS syntax-geprüft, `node --check`)

| Datei | Inhalt |
|---|---|
| `js/map/basemapTerrain.js` | OpenFreeMap-Basis + OSM Carto + Esri (Visibility-Toggle), Mapterhorn-DEM (Hillshade + 3D-Terrain + Sky), 3D-Gebäude; lazy. Host-Layer-Schutz via `source==="openmaptiles"`. |
| `js/map/bikeLanesLayers.js` | Radinfrastruktur (TILDA), Kategorien-Styling, Toggle. |
| `js/mapdata/resolveSources.js` | Local-first + B2-Fallback über `manifest.json`. |
| `partials/panel.html` + `panel.css` | Karten-Panel unten links (Basemaps + Relief + 3D-Gebäude + Radinfra). |

---

## FRONTEND — offen 🔲 (Integration + Browser-Test, in VSC)

- **MapTiler entfernen** in `addSources.js` (hillshade/terrain) + `main.js`
  (`MAPTILER_API_KEY`, alte Toggle-Handler) + `config.public.js`.
- **Panel verdrahten** in `main.js` + `index.html` + `style.css` (Snippets in `EINBAU.md`).
  5 Dateien greifen ineinander → am besten mit offenem Frontend in VSC.
- **`thumb-osm.png`** ergänzen (aus `gradients2osm/viz/assets/basemaps/`).
- **Attribution** aktualisieren (OpenFreeMap, OSM, Esri, Mapterhorn, TILDA).
- Optional: Basemap/Relief-Zustand in den Permalink; Radinfra ins bestehende
  Legenden-/Toggle-System.
- **Browser-Test** (Label-Überlagerung beim Basemap-Wechsel, Modulpfade,
  Terrain-Performance) — der irreduzible Rest.

---

## Empfohlener Ablauf in VSC

1. Branch `refactor/python-pipeline`; Processing-Bundle einsortieren, `data/`
   gitignoren + getrackte Großdateien `git rm --cached`.
2. `uv sync` · `uv run unfallkarte info` · `uv run pytest` (grün) · `uvx ruff check`.
3. Binaries installieren → Accidents end-to-end → `golden.py compare` = OK →
   **2024 als YAML-Block ergänzen** (erster echter Mehrwert).
4. OSM bauen, scenario2 laufen lassen, `manifest`, `deploy --dry-run` → `deploy`.
5. Frontend-Bundle einsortieren, MapTiler raus, Panel verdrahten, Browser-Test.
6. Restliche Szenarien/Kontextdaten iterativ; am Ende History-Cleanup.

`CLAUDE.md` wird von Claude-in-VSC automatisch geladen und hält die Regeln
(Frontend-Vertrag, CRS, keyless, Secrets, uv); `REFACTORING_PLAN.md` erklärt das Warum.
