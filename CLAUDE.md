# CLAUDE.md — unfallkarte

Interaktive Webkarte für Verkehrsunfälle in Deutschland (Unfallatlas). Wir bauen
die Jupyter-Notebooks zu einer wartbaren Python-Pipeline um. Strategie & Begründung:
siehe `REFACTORING_PLAN.md`. Diese Datei = die Regeln, die in JEDER Session gelten.

## Harte Regeln (nicht brechen)
- **Frontend-Vertrag:** PMTiles-**Dateinamen** und **interne Layer-Namen** sind ein
  Vertrag mit dem Frontend (`js/mapdata/addSources.js`, `addLayers.js`). Änderst du
  einen Namen, musst du das Frontend im selben PR mitziehen.
- **CRS:** metrische Operationen (Buffer, Distanz, sjoin) in **EPSG:25832**, Output
  immer **EPSG:4326**. Nie vermischen.
- **Keyless:** kein MapTiler, kein API-Key im Code. Basemap = OpenFreeMap,
  Terrain/Hillshade = Mapterhorn (gehosteter Endpoint).
- **Secrets nur in `.env`** (gitignored). Niemals Tokens/Keys committen. Der
  Mapillary-Token aus der alten `config.public.js` ist als kompromittiert zu
  behandeln → rotieren, nicht wiederverwenden.
- **Lizenz:** AGPL-3.0-or-later. Neue Quelldateien dürfen einen kurzen Header tragen.

## Konventionen
- **Packaging: uv.** Nie `pip install`. Deps via `uv add`, Ausführung via `uv run`.
- **Tools:** `uv run unfallkarte <cmd>`. Lint: `uvx ruff check`. Tests: `uv run pytest`.
- Code: kurz, getippt, ruff-konform. Keine Notebooks in der Pipeline.
- Config-getrieben: Jahres-Quirks/Filter/Tile-Profile in `config/*.yaml`, nicht im Code.

## System-Binaries (nicht via pip)
`tippecanoe` + `tile-join`, `osmium-tool`. b2-CLI via `uv tool install b2`.
Versionen siehe README. (`ogr2ogr`/gdal-bin wird **nicht** mehr gebraucht — OSM-PBF
wird direkt mit pyogrio gelesen, das GDAL mitbringt.)

## Referenz-Repos (lesen, Muster übernehmen — nicht neu erfinden)
- `vizsim/gradients2osm` → Karten-Panel unten links, OpenFreeMap+Mapterhorn-Setup
  (`viz/js/map/initMap.js`), B2-Upload (`viz/preprocessing/upload_pmtiles.sh`,
  `B2-UPLOAD.md`, `.env.example`).
- `vizsim/mapillary_coverage_analysis` → Radinfrastruktur-Layer
  (`viz/map/bikeLanesLayers.js`), Datums-Anzeige-Muster (`viz/utils/layerUpdateDates.js`).
- `vizsim/mapillary_trafficsigns` → externe Pipeline für Mapillary-Verkehrszeichen
  & -Markings (eigenes Repo, regelmäßig aktualisiert, CC BY-SA 4.0 / © Mapillary).
  **Kein Mapillary-Fetcher in unfallkarte bauen** — die fertigen PMTiles dieses
  Repos als `external`-Quellen konsumieren (scenario4/5/7). Markings nicht
  öffentlich → Skript dort läuft, Output selbst hosten (B2) und URL eintragen.

## Daten & Deploy
- `data/` ist gitignored: rohe + abgeleitete Artefakte (PMTiles/Parquet/PBF) liegen
  lokal und auf B2, nicht im Git.
- **Local-first + B2-Fallback:** Frontend probt `./data/<file>`, fällt bei 404 auf
  B2 zurück. Steuerung über ein generiertes `data/manifest.json` (Local-first-Index
  + Datenstand je Quelle), gespeist aus `config/sources.yaml`.
- Bucket: neues Bucket mit Subfoldern (`accidents/ scenarios/ osm/ traffic/ noise/
  obs/`). `b2 sync` spiegelt den lokalen `data/`-Baum 1:1 → Pfade lokal == remote.
- Stabile Dateinamen (kein Datum im Namen) + B2-Versionierung. Datum lebt im Manifest.

## Verifizieren (Sicherheitsnetz)
Vor/nach Pipeline-Änderungen: **Golden-Reference** prüfen (`tests/golden/`) — Feature-
Counts/Größen der Schlüssel-PMTiles müssen gegenüber dem Ist-Stand stabil bleiben.
Das ist die echte Absicherung des Frontend-Vertrags, nicht diese Datei.

## Vorgehen
- In kleinen, fokussierten PRs auf `refactor/python-pipeline`.
- Reihenfolge: Phase 0 (Gerüst) → 1 (Accidents-Core) → 2 (Helpers/OSM/Tiles) →
  3 (Szenarien) → 4 (Orchestrierung/Deploy) → 5 (Aufräumen). Details im Plan.
