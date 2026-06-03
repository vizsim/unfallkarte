# Unfallkarte — Stand & Offenes

Der Notebook→Pipeline-Refactor ist abgeschlossen. Überblick: `README.md`.
Warum/Historie: `REFACTORING_PLAN.md`. Regeln für Sessions: `CLAUDE.md`.

## Erledigt ✅

- **Pipeline** (`pipeline/`, uv): Unfalldaten **2017–2024**, OSM-Layer (schools/health/
  playgrounds, maxspeed major+minor), Szenarien **1/2/3/6/8**. Tests grün, ruff sauber.
- **Build** über Direkt-PBF→FGB (pyogrio) — kein ogr2ogr/gdal-bin. Golden-Reference
  bestätigt (Python-Build == altes Notebook für 2017–2023).
- **Deploy**: Deliverable-PMTiles + `manifest.json` im B2-Bucket `unfallkarte-data-v2`
  (public, CORS `*`, Range).
- **Frontend keyless**: MapTiler raus → OpenFreeMap + Mapterhorn; Karten-Panel + Geocoder
  (hilo_profiler-Stil), Radinfra (TILDA). **Local-first + B2-Fallback** (Manifest local-first,
  sonst aus dem Bucket). 2024 in der UI. sc4/5/7 (Mapillary) entfernt.
- **Aufgeräumt**: reproduzierte Notebooks + `new/` raus, `preprocessing/` 91 GB → 21 GB.
  Lizenz auf **AGPL-3.0-or-later** umgestellt.

## Offen 🔲

- **Frontend auf GitHub Pages deployen** + live testen — der eigentliche End-to-End-Test.
- Statische Kontextlayer (Uber-Geschwindigkeiten, UBA-Lärm, OBS, Hauptverkehrsstraßen,
  movebis) laufen weiterhin vom **alten** Bucket `unfallkarte-data` — bewusst nicht neu
  prozessiert (Daten unverändert; Notebooks für sie bleiben erhalten).
- Optional: nicht von sc8 genutzte Lärmdaten in `preprocessing/laerm/` trimmen (~12 GB).
