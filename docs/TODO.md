# TODO — Offene Punkte

Stand: 2026-09-18 (Review 2026-07-11, ergänzt um Ideen aus der Popup-/Cleanup-Session).
Ersetzt das frühere `WRAPUP.md` (dessen Punkte sind alle erledigt). Historie des
Notebook→Pipeline-Refactors: [`REFACTORING_PLAN.md`](REFACTORING_PLAN.md).

## Roadmap Web-Teil (Reihenfolge bewusst: jede Stufe nutzt die vorige)

Auslöser: das MapLibre-Upgrade 5.6→5.24 (f58bd27) hat den Cluster-Hover zwei Monate
lang stumm gebrochen (`setData` klont per Structured-Clone, rohe `MapGeoJSONFeature`
sind nicht klonbar). Kein Typ hätte das gefangen — ein Browser-Smoke-Test schon.

1. [x] **Playwright-Smoke-Tests + CI** (2026-09-18) — `tests/web/smoke.spec.js` (6 Tests:
       Laden ohne JS-Fehler, Cluster-Hover mit Hover-Pie, #30 gestapeltes Popup + Pin/Unpin,
       #31 überlappende Sc9-Flächen, Sweep über alle Layer, openOnClick→OSM), `npm run
       test:web`; datentolerant (Tests suchen ihre Stellen selbst), läuft ohne Build und ohne
       lokale Daten (B2-Fallback, verifiziert). Gegenprobe: mit wieder eingebautem
       setData-Bug schlägt der Cluster-Test an. CI: `.github/workflows/ci.yml`
       (ruff + pytest + Smoke-Tests). Ausbaubar: Permalink-Roundtrip, Filter/Feature-Counter,
       Legenden-Zoom-Hinweise.
2. [ ] **Layer-Registry als Single Source of Truth** — ein Layer existiert heute an ~7
       Stellen parallel: `sources.yaml`, `addSources.js`, `addLayers.js` (1677 Z.),
       `setupLayerToggles.js`, `legendHandlers.js` (vier parallele Listen), `permalink.js`
       (Kontext-Keys), `popupHandlers.js` (Registry), `index.html` (1336 Z. handgeschriebene
       Legende). Ziel: `{id, source, layers, toggle, legend, minzoom, popup}` → Toggles,
       Legende, Zoom-Hinweise, Permalink und Popups werden daraus generiert. Die
       Popup-Registry (`hoverPopup.js`, 2026-09) ist der erste Baustein; deckt „Legende aus
       Config generieren" und REFACTORING_PLAN §13 Punkt 9/10 mit ab.
3. [ ] **Vite** — ~20 einzeln geladene ES-Module bündeln (Initial-Load), Dev-Server mit
       HMR, `import.meta.env` statt `config.js`/`config.public.js`-Umschaltung.
       Haken: GitHub Pages served heute das Repo-Root direkt → braucht eine Action, die
       `dist/` baut und deployt (Prozesswechsel). Vendor-Libs dann via `package.json`
       gepinnt statt Handkopie in `vendor/` (Upgrades laufen durch die Smoke-Tests).
4. [ ] **TypeScript** — lohnt an den Stellen mit impliziten Objektformen: Popup-Entry,
       Layer-Registry, Manifest, Permalink-Format. Günstiger Zwischenschritt ohne Build:
       `tsconfig.json` mit `checkJs` + JSDoc-Typen (IDE meldet heute schon z. B.
       `window.map`-Zugriffe und ungenutzte Variablen). Konkreter Fund: `showUspeedChartPopup`
       nutzt das globale `window.map` statt ein `map` übergeben zu bekommen.

## Stabilität

- [x] **CI einrichten** (2026-09-18) — `.github/workflows/ci.yml`: Job `pipeline`
      (uv sync --locked → ruff → pytest) + Job `web` (Playwright-Smoke-Tests gegen den
      public B2-Bucket, Report als Artefakt bei Fehlschlag). Erster echter Lauf nach dem Push
      prüfen (WebGL im Runner = Software-Rendering, Timeouts sind großzügig gesetzt).
- [ ] **Frontend-Vertrag testen statt nur dokumentieren** — PMTiles-Dateinamen + Layer-Namen
      sind der Vertrag mit dem Frontend (CLAUDE.md), durchgesetzt nur per Disziplin. Ein
      pytest kann die `vector_layers` aus den gebauten PMTiles (bzw. `sources.yaml`) gegen die
      `source-layer`-Strings in `addLayers.js` abgleichen → fängt Drift beim nächsten
      Pipeline-Umbau.
- [ ] **Popup-Härtung (klein)** — (a) OSM-Attribute (`name`, `operator` …) landen ungeescaped
      in `innerHTML`; OSM ist nutzergeneriert → `esc()`-Helper in der Registry. (b) Wirft ein
      einzelnes `render()` (z. B. `getElementById("uspeed-slider").value` bei fehlendem
      Element), stirbt der gesamte Hover → `hoverPopup.js` sollte pro Karte try/catch machen.
- [x] JS-Libs vendoren statt unpkg (erledigt 2026-07, siehe `vendor/README.md`).

## Frontend / UX

- [ ] **Mobile-Breakpoint** — `style.css` hat keine einzige `@media`-Query; die
      320-px-Legende verdeckt auf Handys die halbe Karte. Idee: Legende auf kleinen
      Screens als einklappbares Bottom-Sheet.
- [x] **Fehler-Banner** (2026-07-11) — ist das Manifest weder lokal noch auf B2
      ladbar, zeigt `js/ui/errorBanner.js` ein schließbares Banner oben mittig
      (+ "Neu laden"); Wiring über `resolveSources().manifestOk` in addSources.js.
- [x] **Tastatur/A11y (Klapp-Pfeile)** — erledigt 2026-07: alle 10 Pfeile sind
      `<button>` mit `aria-expanded` + `aria-label` und `:focus-visible`-Ring;
      per Enter/Space bedienbar (headless verifiziert). Offen bleibt A11y darüber
      hinaus (z. B. Kontrast-Audit, Screenreader-Test der Filterlisten).
- [x] **Inline-Styles abbauen** — erledigt 2026-07: 175 wiederkehrende `style="…"`
      durch Utility-Klassen ersetzt (`.row`, `.mt-*`, `.swatch-*` … am Ende von
      `style.css`), verifiziert per Computed-Style-Diff (811 Elemente, 0 Abweichungen).
      Bewusst inline geblieben: `display:none` (JS-gemanagter Zustand — Code setzt
      `el.style.display = ""` als Reset), Swatch-**Farben** (Dateninhalt je Layer)
      und Einzelfälle (~149 Reste).
- [ ] **Legende aus Config generieren** (langfristig) — die repetitiven
      Legenden-Blöcke in `index.html` sind Hauptquelle für Drift zwischen Layern
      und Legende. → Teil von Roadmap 2 (Layer-Registry).
- [ ] **Touch/Mobile-Durchgang** — Hover-Popups gibt es auf Touch nicht; Tap = Klick = Pin
      funktioniert, aber `openOnClick`-Layer (Tempolimit, Übergänge, Telraam) springen auf
      Touch sofort zu OSM/Telraam ohne Vorschau. Zusammen mit dem Mobile-Breakpoint angehen
      (z. B. auf Touch immer erst pinnen, Link nur im Pin).

## Daten / Pipeline

- [ ] **Sc6-Tiles ohne Namen** — `scenario6-polys` tragen nur `oid` +
      `total_tempo50_highway_length_m`, kein `name`/`amenity`. Deshalb sahen überlappende
      Buffer (Schulgelände + Kita-Node) im Popup identisch aus; Popup zeigt jetzt Länge +
      OSM-Objekt als Notlösung. Kleine Pipeline-Änderung, große Popup-Verbesserung — dabei
      auch prüfen, welche Attribute Sc1/Sc3/Sc9 mitgeben.
- [ ] **Lazy-Sources** (REFACTORING_PLAN §13 Punkt 7) — größter offener Perf-Posten:
      alle ~18 Quellen werden beim Start angelegt (Metadaten-Fetch + HEAD-Probe je Quelle).
      Nur accidents/cluster eager, Rest beim ersten Einschalten (`ensureSource(id)`).

## Sichtbarkeit / Auffindbarkeit

- [x] **Meta-Tags** — `<meta name="description">` + OpenGraph/Twitter-Cards ergänzt
      (erledigt 2026-07); `og:image` = `docs/screenshot.png`, absolute URLs auf
      `vizsim.de/unfallkarte/` (kanonisch; Crawler führen kein JS aus).
      Beim Erneuern des Screenshots mitdenken.
- [ ] **Favicon ersetzen** — aktuell `stationary-bike-gym-svgrepo-com.svg`
      (Heimtrainer-Icon).

## Deploy-Status klären

- [x] Geklärt (2026-07-11): `unfallkarte deploy` (b2 sync) zeigte den Bucket als
      aktuell — Telraam, Crossings, movebis & Co. lagen schon auf B2; hochgeladen
      wurden nur die neu gebauten z6-hvs-Tiles + Manifest.

## Aufräumen

- [x] `schrott/` (war 7,0 GB, gitignored): gelöscht (2026-09-18). Alle Notebooks dort
      waren durch die Pipeline reproduziert (Uber/OBS/Lärm/sc3/sc8) oder bewusst
      entfernt (Mapillary sc4/5/7). Vorher geprüft: Uber-Roh-CSV + berlin-200101.pbf
      byte-identisch in `pipeline/data/raw/uber/`; sc8 liest `data/raw/laerm/` (echte
      Dateien, keine Symlinks); `laerm_blr/` (5,5 GB, UBA-BLR 4210/4220) nutzte kein
      Szenario. Einzig aufbewahrt: der letzte Snapshot des inzwischen toten Portals
      obs.adfc-ac.de als `pipeline/data/raw/obs/_archive_2025-06-11_adfc-ac.geojson`
      (Name absichtlich außerhalb des `portal_*`-Globs von obs.py).
- [x] `preprocessing/` (~6,2 GB): gelöscht (2026-07-11). Die unersetzliche
      Uber-Roh-CSV liegt in `pipeline/data/raw/uber/` UND als Backup auf B2
      (`unfallkarte-data-v2/raw/uber/…csv.zip`, manuell hochgeladen — der normale
      Deploy synct nur PMTiles+Manifest).
- [x] `preprocessing/uber_movement/prepare_uber_movement_allhours.ipynb` entfernt
      (Logik lebt in `pipeline/src/unfallkarte/uber.py`, Output war byte-identisch
      verifiziert).
- [ ] Altes B2-Bucket `unfallkarte-data` hat nach der Uber-Migration keinen
      Verbraucher mehr → stilllegbar (vorher kurz verifizieren, dass nichts
      Externes darauf zeigt).

## Uber-Speed-Layer

- [x] **Wide-Format** (2026-07-11): 1 Feature je Segment mit `speed_0`…`speed_23`
      statt 24 Long-Features — 33.480 statt 536.759 Features, PMTiles 12,9 statt
      31,3 MB. Stunden ohne Messwert fehlen als Attribut → Slider setzt Filter
      (`["has", "speed_<h>"]`) + line-color neu (`applyUspeedHour` in addLayers.js);
      Klick-Chart liest die 24 Werte direkt aus dem Feature (vorher
      querySourceFeatures über geladene Tiles — konnte Stunden unterschlagen).
