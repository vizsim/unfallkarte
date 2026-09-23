# CLAUDE.md — unfallkarte

Interaktive Webkarte für Verkehrsunfälle in Deutschland (Unfallatlas). Die frühere
Notebook-Verarbeitung ist zu einer wartbaren Python-Pipeline umgebaut (Refactor
abgeschlossen). **Offene Punkte stehen ausschließlich in `docs/TODO.md`.**
`docs/REFACTORING_PLAN.md` ist reine Historie — was umgebaut wurde und warum
(CRS, Bucket-Struktur, Local-first, keyless, AGPL); dort nichts mehr als offen führen.
Überblick: `README.md`.
Diese Datei = die Regeln, die in JEDER Session gelten.

## Repo-Layout
- **`pipeline/`** — Python-Pipeline (uv-Paket `unfallkarte`): Code in `src/`, Config in
  `pipeline/config/*.yaml`, Tests in `pipeline/tests/`, Daten (gitignored) in `pipeline/data/`.
  CLI immer aus `pipeline/` heraus, z. B. `uv --directory pipeline run unfallkarte <cmd>`.
- **Repo-Root** — Frontend, gebaut mit **Vite** (`index.html`, `main.js`, `js/`, `style.css`,
  `vite.config.js`). `public/` = Dateien, die zur Laufzeit per URL geholt werden und darum
  ungehasht bleiben (`style.json`, Sprite in `icons/`, og:image). Build → `dist/` (gitignored).
  Ungebaut läuft das Root nicht (nackte Imports aus npm). Plan/Hintergrund:
  `docs/VITE_MIGRATION.md`.

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
  Einzige bewusste Ausnahme: der öffentliche Mapillary-**Client**-Token in `.env.production`
  (steht ohnehin im ausgelieferten JS); der lokale liegt in `.env.development.local` (gitignored).
- **Lizenz:** AGPL-3.0-or-later. Neue Quelldateien dürfen einen kurzen Header tragen.

## Konventionen
- **Packaging: uv.** Nie `pip install`. Deps via `uv --directory pipeline add`, Ausführung
  via `uv --directory pipeline run`.
- **Tools:** `uv run unfallkarte <cmd>`. Lint: `uvx ruff check` (aus `pipeline/`). Tests:
  `uv run pytest`. Frontend: `npm run dev` (Vite + HMR; `data/` per Middleware mit
  Range-Requests), `npm run build` (→ `dist/`), `npm run test:unit` (browserlos,
  node --test, Sekunden), `npm run test:web` (Playwright gegen den BUILD via `vite preview`;
  belegter Port = Fehler, zweiter Lauf daneben mit `PW_PORT=4174`).
- **Vite-Regeln:** `appType: "mpa"` nicht entfernen (sonst beantwortet Vite fehlende Dateien mit
  200 → Local-first hält sie für lokal vorhanden). `import.meta.env` nur in `js/config/env.js`
  (Unit-Tests importieren `js/` direkt, in Node ist `import.meta.env` undefined). Tests greifen
  auf App-Module über den Test-Hook `window.__app` (main.js) zu, nie per `import("/js/…")` — im
  Bündel gibt es die Pfade nicht.
- **Permalink:** Format v2 in `js/utils/permalinkFormat.js` — REIN halten (kein DOM, kein
  `window`), sonst fällt die browserlose Testbarkeit weg. DOM-Bindung nur in
  `permalinkState.js`. Kürzel (Layer-Zeichen, Regler-Keys, Stil-Codes) sind Vertrag mit
  geteilten Links: nie neu vergeben, nur ergänzen. Neuer Regler = Eintrag in `CONTROLS`.
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
- **MapLibre (seit v6 ESM-only):** kein globales `maplibregl` mehr — immer aus
  `js/lib/maplibre.js` importieren (`import { Popup } from "../lib/maplibre.js"`), nie direkt
  aus dem Paket. MapLibre wird **nicht gebündelt** (versionierte Kopie + Importmap,
  `vite.config.js`): es sucht seinen Worker zur Laufzeit neben der eigenen Datei — gebündelt
  bleibt die Karte ohne jeden Fehler leer. Feature-Objekte aus `queryRenderedFeatures` nie roh
  in `setData` reichen: `properties` hat einen Null-Prototyp und bricht MapLibres Serializer
  STUMM → `{ ...f.properties }`. Ladezeiten nie gegen `npm run dev` oder `vite preview`
  beurteilen (kein gzip, kein Pages-Cache — verfälscht um Sekunden); `dist/` über einen
  Pages-ähnlichen Server messen.
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
  Neues Verhalten = neuer Test dort. Pflicht vor jedem Lib-Upgrade (`package.json`, exakt
  gepinnt).
- CI (`.github/workflows/ci.yml`): ruff + pytest + Build + Smoke-Tests bei Push/PR; auf `main`
  danach Deploy des getesteten `dist/` nach GitHub Pages (nur hinter grünen Frontend-Tests).

## Vorgehen
- Refactor abgeschlossen: accidents (2017–2024), OSM-Layer und alle Szenarien (1/2/3/6/8/9)
  sind portiert, gebaut und deployt; Frontend keyless mit Local-first/B2.
- Kleine, fokussierte Commits auf `main` — ein Push dorthin wird nach grünen Frontend-Tests
  automatisch nach GitHub Pages deployt (vizsim.de/unfallkarte/), ist also ein
  Produktiv-Deploy. Größere
  Umbauten auf einem `temp/*`-Branch bauen und erst nach grünen Tests mergen. Der Stand vor
  dem Pipeline-Refactor hängt als Tag `v2025` (kein Branch — er liegt auf derselben Linie),
  der letzte Stand vor Vite als Tag `pre-vite` (Rückweg: `docs/VITE_MIGRATION.md`, Schritt 4).
  Offene Punkte siehe Auto-Memory
  bzw. `docs/TODO.md`.
