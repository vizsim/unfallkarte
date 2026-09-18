# CLAUDE.md — unfallkarte

Interaktive Webkarte für Verkehrsunfälle in Deutschland (Unfallatlas). Die frühere
Notebook-Verarbeitung ist zu einer wartbaren Python-Pipeline umgebaut (Refactor
abgeschlossen). Strategie & Historie: siehe `docs/REFACTORING_PLAN.md`. Überblick:
`README.md`. Offene Punkte: `docs/TODO.md`.
Diese Datei = die Regeln, die in JEDER Session gelten.

## Repo-Layout
- **`pipeline/`** — Python-Pipeline (uv-Paket `unfallkarte`): Code in `src/`, Config in
  `pipeline/config/*.yaml`, Tests in `pipeline/tests/`, Daten (gitignored) in `pipeline/data/`.
  CLI immer aus `pipeline/` heraus, z. B. `uv --directory pipeline run unfallkarte <cmd>`.
- **Repo-Root** — statisches Frontend (`index.html`, `js/`, `style.json`, `style.css`).

## Harte Regeln (nicht brechen)
- **Frontend-Vertrag:** PMTiles-**Dateinamen** und **interne Layer-Namen** sind ein
  Vertrag mit dem Frontend (`js/mapdata/addSources.js`, `addLayers.js`). Änderst du
  einen Namen, musst du das Frontend im selben Schritt mitziehen.
- **CRS:** metrische Operationen (Buffer, Distanz, sjoin) in **EPSG:25832**, Output
  immer **EPSG:4326**. Nie vermischen. (Ausnahme: reine `intersects`-sjoins sind
  topologisch und dürfen in 4326 laufen.)
- **Keyless:** kein MapTiler, kein API-Key im Code. Basemap = OpenFreeMap,
  Terrain/Hillshade = Mapterhorn (gehosteter Endpoint).
- **Secrets nur in `.env`** (gitignored, in `pipeline/.env`). Niemals Tokens/Keys committen.
- **Lizenz:** AGPL-3.0-or-later. Neue Quelldateien dürfen einen kurzen Header tragen.

## Konventionen
- **Packaging: uv.** Nie `pip install`. Deps via `uv --directory pipeline add`, Ausführung
  via `uv --directory pipeline run`.
- **Tools:** `uv run unfallkarte <cmd>`. Lint: `uvx ruff check` (aus `pipeline/`). Tests:
  `uv run pytest`. Frontend: `npm run serve` (Range-fähig; `python -m http.server` kann
  keine Range-Requests → lokale PMTiles scheitern), `npm run test:web`.
- **Layer-Registry** (`js/layers/`): ein Eintrag je Legenden-Zeile liefert Quelle(n), Layer-
  Definitionen, Toggle, Zoom-Hinweis, Permalink-Zeichen, Regler (`controls`), Sonderlogik
  (`setup`) und Popups — alle Kontext-Layer + Szenarien laufen darüber. Neue Layer dort
  eintragen (nicht in `addLayers.js`/Einzellisten) und die ID in `DRAW_ORDER` (`addLayers.js`)
  an der gewünschten Stelle der Zeichenreihenfolge einreihen. Quellen + Layer entstehen LAZY
  beim ersten Einschalten (`ensureEntry`) — Code darf nicht voraussetzen, dass ein Registry-
  Layer schon existiert (`map.getLayer(id)` prüfen; Tests: `ensureAllLayers`).
  DOM-IDs (`#toggle-<id>`, `#<id>-legend`) und Permalink-Zeichen sind Vertrag — nie
  umbenennen/neu vergeben. Nach Umbauten: `npx playwright test golden` muss unverändert grün
  sein; gewollte Änderungen mit `--update-snapshots` aufnehmen und den Snapshot-Diff prüfen.
  Außerhalb der Registry: Unfälle/Cluster, Mapillary, Radinfrastruktur.
- **Popups:** ein Hover-Popup für alle Layer (`js/ui/hoverPopup.js`). Neuer Layer mit
  Popup = neuer Eintrag in der Registry `js/ui/popupHandlers.js` — keine eigenen
  `map.on("mousemove", layerId)`-Handler (sonst wieder überlappende Popups).
  `render(props, feature)`: `props` ist bereits HTML-escaped (OSM-Attribute sind
  nutzergeneriert); Rohwerte nur über `feature.properties` und nie ungeescaped ins HTML.
- Code: kurz, getippt, ruff-konform. Keine Notebooks in der Pipeline.
- Config-getrieben: Jahres-Quirks/Filter/Tile-Profile in `pipeline/config/*.yaml`, nicht im Code.
- Tippecanoe legt FGB-Integer-Attribute als **String** im PMTiles ab → im Frontend immer
  `["to-number", …]` bzw. `Number(...)` benutzen.

## System-Binaries (nicht via pip)
`tippecanoe` + `tile-join`, `osmium-tool`. b2-CLI via `uv tool install b2`.
Versionen siehe README. (`ogr2ogr`/gdal-bin wird **nicht** gebraucht — OSM-PBF
wird direkt mit pyogrio gelesen, das GDAL mitbringt.)

## Referenz-Repos (Muster übernommen)
- `vizsim/gradients2osm` → Karten-Panel unten links, OpenFreeMap+Mapterhorn-Setup, B2-Upload.
- `vizsim/hilo_profiler` → Karten-Panel-/Geocoder-Stil, Layout der Bottom-Left-Controls.
- `vizsim/mapillary_coverage_analysis` → Radinfrastruktur-Layer (TILDA).

  Hinweis: Die Mapillary-Mapping-Szenarien (sc4/5/7) wurden **bewusst nicht** übernommen
  und sind aus Pipeline und Frontend entfernt.

## Daten & Deploy
- `pipeline/data/` ist gitignored: rohe + abgeleitete Artefakte (PMTiles/Parquet/PBF) liegen
  lokal und auf B2, nicht im Git. Lokales `./data/` (Repo-Root) ist ein gitignored Symlink darauf.
- **Local-first + B2-Fallback:** Frontend probt `./data/<file>`, fällt bei 404 auf B2 zurück.
  Steuerung über ein generiertes `manifest.json` (local-first gelesen, sonst aus dem Bucket),
  gespeist aus `pipeline/config/sources.yaml`.
- **Bucket `unfallkarte-data-v2`** (public + CORS), Subfolder `accidents/ osm/ scenarios/`.
  `b2 sync` spiegelt den lokalen `data/`-Baum 1:1 → Pfade lokal == remote. Stabile Dateinamen
  (kein Datum im Namen), Datum lebt im Manifest. Einziger Legacy-Layer: Uber-uspeed läuft
  noch vom alten Bucket `unfallkarte-data` (siehe `LEGACY` in `js/mapdata/addSources.js`);
  Lärm/OBS/HVS sind in die Pipeline migriert.

## Verifizieren (Sicherheitsnetz)
- **Golden-Reference** (`pipeline/tests/golden/`): Feature-Counts/Spalten/Jahre des Accident-
  Parquets müssen stabil bleiben (`golden.py compare`). `uv run pytest` + `uvx ruff check` grün.
- Frontend-Änderungen: `npm run test:web` (Playwright-Smoke-Tests in `tests/web/`, headless
  Chromium) — keine JS-Fehler, Layer laden local-first/B2, Hover/Popup/Klick funktionieren.
  Neues Verhalten = neuer Test dort. Pflicht vor jedem Upgrade der Libs in `vendor/`.
- CI (`.github/workflows/ci.yml`): ruff + pytest + Smoke-Tests bei Push/PR.

## Vorgehen
- Refactor abgeschlossen: accidents (2017–2024), OSM-Layer und alle Szenarien (1/2/3/6/8/9)
  sind portiert, gebaut und deployt; Frontend keyless mit Local-first/B2.
- Kleine, fokussierte Commits auf `unfallkarte-2026`. Offene Punkte siehe Auto-Memory
  bzw. `docs/TODO.md`.
