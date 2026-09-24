# TODO — Offene Punkte

Stand: 2026-09-18 (Review 2026-07-11, ergänzt um Ideen aus der Popup-/Cleanup-Session).
Ersetzt das frühere `WRAPUP.md` (dessen Punkte sind alle erledigt). **Diese Datei ist die
einzige Liste offener Punkte** — seit 2026-09-19 auch für die Pipeline; der Review-Backlog
aus [`REFACTORING_PLAN.md`](REFACTORING_PLAN.md) §13 ist abgearbeitet bzw. hierher gewandert.
Der Plan bleibt als Historie/Begründung erhalten.

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
2. [ ] **Layer-Registry als Single Source of Truth** — ein Layer stand an ~8 Stellen parallel
       (`sources.yaml`, `addSources.js`, `addLayers.js` 1677 Z., `setupLayerToggles.js`, drei
       Listen in `legendHandlers.js`, `permalink.js`, `popupHandlers.js`, `index.html`). Jetzt:
       `js/layers/registry.js` + ein Eintrag je Legenden-Zeile (`{id, kind, source, layers,
       permalink, dataMinZoom, popups}`), Dateien nach Gruppe (`context-osm.js`,
       `context-noise.js`, `context-cycling.js`). Abgesichert durch `tests/web/golden.spec.js`
       (Snapshot: Quellen, alle Layer-Definitionen, Toggle→Layer/Legende/Zoom-Hinweis/Permalink).
       - [x] Schritt 0 (2026-09-18): Golden-Reference aufgenommen.
       - [x] Schritt 1 (2026-09-18): 8 einfache Kontext-Layer (Schulen, Gesundheit, Spielplätze,
             Übergänge, Lärm 1/2, OBS, Stadtradeln) → Quellen, Toggles, Legenden-Sichtbarkeit,
             Zoom-Hinweise, Permalink-Zeichen und Popups kommen aus der Registry. Golden-Diff =
             nur der gewollte Permalink-Fix (Telraam `z` + Radinfra `f` fehlten in `kontextKeys`).
       - [x] Schritt 2 (2026-09-18): Layer-DEFINITIONEN (Paint/Filter) dieser 8 per Skript
             wortgleich aus `addLayers.js` in die Einträge gezogen (1677 → 1266 Z.). Einträge
             lassen weg, was sie schon sagen (`source`, `minzoom` = `dataMinZoom`,
             `visibility: none` → Defaults in `registry.js`). Zeichenreihenfolge = Reihenfolge der
             `addEntryLayers()`-Aufrufe in `addLayers.js`; Golden unverändert grün.
       - [x] Schritt 3 (2026-09-18): Szenarien über die Fabrik `scenario({n, color, fillOpacity,
             polysFilter, pointsFilter, extraLayers, controls, popup})` in `js/layers/scenarios.js`;
             Schwellen-Regler generisch in `js/ui/setupEntryControls.js`. `addLayers.js` 1266 →
             966 Z., `setupScenarioControls.js` 180 → 32 Z. (nur noch Uber-Regler). Golden
             unverändert. Einzige Verhaltensänderung: beim Wiedereinschalten gilt der ANGEZEIGTE
             Reglerwert (Sc1/2/8 sprangen still auf „>= 0" zurück). Aufgefallen: doppelte
             `filter`-Schlüssel in den alten Layer-Objekten (letzter gewann still; durch die
             Fabrik weg), tote Legenden-Keys `scenario1…6` (entfernt). Nachgezogen: tote
             auskommentierte Sc3/Sc6-Slider-Blöcke aus `index.html` entfernt, Sc8-Slider
             `value="50"` lag unter `min="60"` (Browser klemmte still auf 60) → `value="60"`. sc6 `fill-opacity` 0.4 ist KEIN Bug: benannter Parameter `fillOpacity` — halbtransparent, damit Straßen + rote Tempo-50-Abschnitte darüber lesbar bleiben.
       - [x] Schritt 4 (2026-09-18): Layer mit Hook statt reinem Sichtbarkeits-Toggle —
             `js/layers/traffic-speed.js` (Tempolimit: 12 Layer aus EINER Fabrik = 2 Netze ×
             Richtung × bedingt, eine Farb-Expression; Uber mit Stunden-Regler über
             `controls.apply` + `debounceMs`) und `js/layers/traffic-volumes.js` (hvs + svz mit
             `toggle: "custom"` + `setup()` für Master/Unter-Haken/DTV|SV-Modus; Telraam mit
             `setup()` für Auto/Rad). Registry kann jetzt mehrere Quellen je Eintrag (`sources`).
             Chart-Popup → `js/ui/uspeedChart.js` (bekommt `map` aus dem Event statt `window.map`).
             `addLayers.js` 1677 → 401 Z. (nur noch Unfälle, Cluster, Mapillary),
             `setupLayerToggles.js` → 40 Z., `setupScenarioControls.js` gelöscht, der
             `setLayerZoomRange`-Nachbrenner in `main.js` entfällt (Tempolimit-`minzoom` kommt aus
             `dataMinZoom: 11`). Golden-Diff: nur 12× `maxzoom: 24` weg (= MapLibre-Maximum,
             Überbleibsel von `setLayerZoomRange`). Neu: `tests/web/traffic.spec.js`.
       - [ ] Rest außerhalb der Registry (bewusst): Unfälle/Cluster (Kern-App, eigene Filter-UI),
             Mapillary (eigenes Modul mit Token + dynamischen Layern), Radinfrastruktur
             (`js/map/bikeLanesLayers.js`, externe TILDA-Tiles). Radinfra wäre der einfachste
             Nachzügler.
       - [x] Schritt 5a (2026-09-19): **Sichtbarkeit bekommt EINEN Eigentümer.** JS setzt nur
             noch Zustand (`.legend.collapsed`, `.legend[data-zoom]`, `.is-on`/`.is-due`), über
             `display` entscheidet CSS. Vorher taten das drei Mechanismen gleichzeitig (inline
             aus dem JS, CSS-Klasse, 39 inline `display:none` im HTML) — inline gewann, also
             reparierte `updateLegendVisibilityByZoom` hinterher, was `setLegendCollapsed`
             überschrieben hatte. Darin liefen zwei Bedingungen unbemerkt tot: `clusterLegendEl`
             (Schlüssel existierte nie) und `#mapillary-legend` (ID existiert nicht im Repo).
             `style.display` in legendHandlers.js 11 → 0 (334 → 254 Z.), inline im Markup 39 → 5
             (die 5 gehören eigenen Modulen). `updateScenarioLegendVisibility` ersatzlos weg —
             hing an `map.on("zoom")`, lief also bei JEDEM Zoom-Frame.
       - [~] Schritt 5b (2026-09-19): **Legenden-Einträge aus der Registry erzeugen.**
             `js/ui/legendMarkup.js` + Feld `legend` ({label, tip, vintage/vintageAttr,
             swatches} bzw. {heading, note, stops}); im HTML nur noch
             `<div data-legend-entry="<id>">` — die Reihenfolge bleibt so im Markup ablesbar.
             Erledigt: schools, health, playgrounds, crossings, laerm1, laerm2.
             `index.html` 1325 → 1161 Z. (−164). Der Generator wirft laut bei Platzhalter ohne
             Eintrag bzw. Eintrag ohne `legend`. Nebenbei: das hartkodierte Datum `25-07-31` in
             den Quellen-Tooltips ist weg (der Stand kam ohnehin aus dem Manifest).
             **Offen:** obs + movebis (mehrere Überschriften/Swatch-Gruppen, inline gestylte
             Linienstärken) und bewusst NICHT vorgesehen: svz/telraam (Modus-Radios),
             maxspeed/uspeed (Farbverlauf bzw. Regler im Block), bikelanes (eigenes Markup).
             Für die müsste der Generator Layout in Daten kodieren — teurer als der Gewinn.
2b. [x] **Permalink neu aufgesetzt** (2026-09-19) — Format **v2**:
       `?v=2&map=<zoom>/<lat>/<lng>&uk=…&bet=…&jahr=…&typ=…&art=…&s=…&d=1&l=…&n=…&o=…`,
       benannte Parameter statt positionsbasiertem `?p=a,b,c,…`, Ansicht in OSM-Konvention
       (`map=z/lat/lng`), und **geschrieben wird nur, was vom Default abweicht** — die
       Startansicht ist damit `?v=2&map=12.00/52.31500/13.63400` (112 → 32 Zeichen).
       - Drei Module: `permalinkFormat.js` (REIN — kein DOM, kein `window`; ohne Browser
         testbar), `permalinkState.js` (`readState`/`applyState`, die einzige DOM-Bindung),
         `permalink.js` (nur noch Verdrahtung, 269 → 69 Z.).
       - **Regler/Modi sind jetzt im Link** (Sc-Schwellen, Sc9-Kriterium, Uber-Stunde,
         SVZ-DTV/SV, SVZ-Unterhaken, Telraam Auto/Rad) — fehlten in v1 komplett.
       - `applyState` SETZT `checked`/`value` statt `.click()` zu simulieren (ein Klick
         toggelt → hing am Vorzustand) und feuert nur bei echter Änderung → idempotent,
         reihenfolge-unabhängig. Die URL wird nur noch geschrieben, nie zurückgelesen: der
         rAF-Umweg samt hartkodierter Default-Ansicht in `permalink.js` entfällt (Ursache
         des CI-Rennens).
       - Jahre ohne Tabelle (`2017`↔`17`, Bereiche `jahr=20-25`) — v1 hatte eine Liste, die
         bei jedem neuen Datenjahr nachgezogen werden musste; 2026 hätte still gefehlt.
       - Alte `?p=`-Links werden weiter gelesen und beim Laden auf v2 hochgeschrieben.
       - Tests: `tests/unit/permalinkFormat.test.js` (17 Stück, `npm run test:unit`, node
         --test, läuft in ~0,2 s ohne Browser) + `tests/web/permalink.spec.js` (Roundtrip
         inkl. Regler, Kurz-Link, v1→v2-Aufstieg). Golden-Diff = nur die Szenario-Kodierung
         (`sc9` → `9`). Dabei gefunden und gefixt: ohne Link lief `updateLayerFilter` nicht
         mehr → Unfall-Layer ohne Filter/unsichtbar (vom Golden-Snapshot gefangen).
       - *Bewusst NICHT „verhasht":* Kontext/Szenarien stehen schon bei einem Zeichen je
         Layer; eine Bitmaske über die Unfall-Filter spart gegenüber „Defaults weglassen" im
         schlechtesten Fall ein Zeichen, kostet aber Lesbarkeit und macht die Bit-Reihenfolge
         zum harten Vertrag (ein neues Unfalljahr verschöbe alle alten Links).
3. [x] **Vite** (2026-09-23, live seit `50d7fd5`) — Plan, Spike, Messungen und Begründungen in
       [`VITE_MIGRATION.md`](VITE_MIGRATION.md). Build nach `dist/`; MapLibre bleibt
       ungebündelt (Importmap + versionierter Ordner — gebündelt fände es seinen Worker nicht,
       die Karte bliebe ohne jeden Fehler leer); Libs aus npm exakt gepinnt, `vendor/`
       gelöscht; Mapillary-Token zur Bauzeit (`.env.production` / `.env.development.local`);
       Playwright testet den Build, die CI deployt genau dieses `dist/` nach Pages.
       Pages-Quelle jetzt „GitHub Actions" (Push → CI → Deploy nur bei Grün, Stand davor =
       Tag `pre-vite`). 54/54 Playwright, Golden unverändert. Gemessen: lokal A/B −0,78 s bis
       zum ersten Unfallpunkt (Mobilfunk), live 5,76 → 5,1 s. Nebenbei zwei alte Handy-Fehler
       behoben (Sheet blitzte 3–4 s ausgeklappt auf; Ziehen machte die Seite scrollbar).
4. [ ] **TypeScript** — lohnt an den Stellen mit impliziten Objektformen: Popup-Entry,
       Layer-Registry, Manifest, Permalink-Format. Günstiger Zwischenschritt ohne Build:
       `tsconfig.json` mit `checkJs` + JSDoc-Typen (IDE meldet heute schon z. B.
       `window.map`-Zugriffe und ungenutzte Variablen). Konkreter Fund: `showUspeedChartPopup`
       nutzt das globale `window.map` statt ein `map` übergeben zu bekommen.

## Stabilität

- [x] **CI einrichten** (2026-09-18) — `.github/workflows/ci.yml`: Job `pipeline`
      (uv sync --locked → ruff → pytest) + Job `web` (Playwright-Smoke-Tests gegen den
      public B2-Bucket, Report als Artefakt bei Fehlschlag). Erster Lauf: pipeline grün,
      web 5/6 — der Tempolimit-Test lief auf dem Runner los, BEVOR die App den
      Default-Permalink angewandt hatte (setzt Center/Zoom + alle Haken zurück). Fix:
      Bereit-Signal `<html data-app-ready>` (permalink.js), Tests pollen auf ihre Bedingung
      statt auf `map.loaded()`; `PW_CPU_THROTTLE=4 npm run test:web` simuliert langsame Runner.
      Artefakte öffentlicher Repos ohne Login: `nightly.link/vizsim/unfallkarte/actions/runs/<id>/playwright-report.zip`.
- [x] **CI: `ubuntu-latest` wird ab 2026-10-19 Ubuntu 26** (2026-09-19) — beide Jobs auf
      `ubuntu-24.04` gepinnt, damit der Umstieg ein eigener, datierbarer Schritt bleibt und der
      `web`-Job nicht unvermittelt an `npx playwright install --with-deps` scheitert. Zum Lösen
      des Pins: `@playwright/test` anheben, Pin entfernen, CI gegenprüfen.
- [x] **Frontend-Vertrag testen** (2026-09-18) — `tests/web/contract.spec.js` liest die
      Metadaten der echten PMTiles (lokal = frisch gebaut VOR dem Deploy, CI = Stand auf B2)
      und prüft jeden `source-layer` + jedes im Style benutzte Attribut (automatisch aus
      Filter/Paint/Layout abgeleitet; Slider werden vorher ausgelöst → dynamische Filter
      zählen mit). Nötig, weil MapLibre bei PMTiles NICHT validiert (`vectorLayerIds = null`).
      Fand auf Anhieb zwei alte Bugs: `healthcare:speciality` vs. Tile-Feld
      `healthcare_speciality` (Psychiatrie-Farbe/-Icon + Popup-Zeilen tot) und `biped_counts`
      vs. `biped_count` (Sc2-Slider blendete alles aus) — beide im Frontend gefixt.
      Popup-Attribute deckt ein zweiter Test ab: `render()` läuft mit einem aufzeichnenden
      Proxy → gelesene Properties werden automatisch gegen die Tile-Felder geprüft; bekannte
      Lücken stehen begründet in `KNOWN_POPUP_GAPS` (mit Verfallskontrolle).
- [x] **Popup-Härtung** (2026-09-18) — (a) `hoverPopup.js` reicht `render()` eine
      ESCAPED-Sicht der Properties (Proxy: jeder String HTML-escaped) → Escaping per Default,
      kein Eintrag kann es vergessen; Link-hrefs nur http(s) + Attribut escaped. (b) Jeder
      Eintrags-Callback (render/link/anchor/onEnter/onLeave/onClick) läuft abgesichert: wirft
      ein `render()`, fehlt nur diese Karte („Details nicht darstellbar" + einmaliges
      console.error). Tests: `tests/web/popup-hardening.spec.js` (präparierte Features ersetzen
      einen registrierten Layer; Gegenprobe ohne Escaping schlägt an).
- [x] JS-Libs vendoren statt unpkg (erledigt 2026-07, siehe `vendor/README.md`).
- [x] **MapLibre 5.24 → 6.10** (2026-09-19) — Analyse, Messung und Abweichungen vom Plan stehen in
      [`MAPLIBRE_6_UPGRADE.md`](MAPLIBRE_6_UPGRADE.md). Kurz: ESM-only (Import über
      `js/lib/maplibre.js`), Pies über `setMissingStyleImageResolver`, WebGL2-Fehlerbanner, zwei
      `modulepreload`. Zweiter, im Plan nicht vorhergesehener Bruch: `properties` mit
      Null-Prototyp → `setData` scheiterte stumm (Hover-Pie leer), gefangen vom Smoke-Test.
      Ladezeit Pages-ähnlich gemessen: 7,66 → 7,30 s. Golden unverändert.
- [x] **pmtiles 4.4.1 → 4.5.0** (2026-09-19) — einzige Änderung: Verzeichnis-Anfragen werden
      abgebrochen, wenn MapLibre die zugehörigen Tile-Anfragen verwirft (spart Bandbreite gegen
      B2). API identisch, Suite + Vertragstests gegen B2 grün, schrittweise B2-Probe in 10 s durch.
      Bleibt ein klassisches `<script>`: der ESM-Build importiert `"fflate"` als nackten
      Bezeichner und ist ohne Bundler nicht ladbar (erledigt sich mit Vite).
- [ ] **Beobachten: pmtiles 4.5.0 unter hektischem Zoomen gegen B2** — genau der Pfad, den
      4.5.0 ändert, ist NICHT verifiziert: drei Proben (schnelle `jumpTo`-Folge ohne lokale
      Daten) scheiterten an einem Playwright-/Node-Fehler (`Cannot create a string longer than
      0x1fffffe8 characters`, Läufe von 4–5 min trotz kürzerem Limit), dessen Ursache offen
      blieb — Artefakt des Probe-Skripts oder echtes Hängen nach abgebrochenen Anfragen.
      Bewusste Entscheidung (User), 4.5.0 trotzdem mitzunehmen, weil der Normalbetrieb belegt
      ist. **Wenn auf der Live-Seite nach schnellem Zoomen Tiles ausbleiben:** pmtiles auf
      4.4.1 zurück (`npm i -E pmtiles@4.4.1`), sonst nichts nötig.
      Sauber klären ließe es sich mit derselben Probe gegen 4.4.1 UND 4.5.0, Logs nach jedem
      Schritt, nie zwei Playwright-Läufe parallel.
- [x] **`vendor/maplibre-gl.js` (5.24) löschen** (2026-09-23) — mit dem ganzen `vendor/` beim
      Vite-Umbau entfernt (Libs kommen jetzt aus npm).
- [ ] **Deploy ohne Retry/Backoff** (`pipeline/src/unfallkarte/deploy.py`) — ein transienter
      B2-500 bricht `b2 sync` mittendrin ab und hinterlässt ein Teil-Deploy. Retry-Loop
      (3× exponentieller Backoff) für B2, dazu `requests`-Retry für die Geofabrik- und
      Accidents-Downloads. *(vorher REFACTORING_PLAN §13 Punkt 4)*
- [x] **Golden-Reference der Pipeline läuft in keinem Test** (2026-09-19) — `golden.py` gab es
      seit dem Refactor, aber keine pytest-Datei rief es auf: das Sicherheitsnetz der Pipeline
      existierte nur, wenn man daran dachte. Jetzt `pipeline/tests/test_golden.py`, zwei Stufen:
      der Abgleich gegen das echte Parquet (Zeilen, Spalten, Unfälle je Jahr, CRS) läuft lokal
      und überspringt sich ohne Daten — und eine Plausibilitätsprüfung der Referenz selbst, die
      IMMER läuft (auch in der CI) und anschlägt, wenn ein Jahr in `accidents.yaml` landet, ohne
      dass die Referenz nachgezogen wurde; die Fehlermeldung nennt den `capture`-Befehl.
      `golden.py` um `diff()` ergänzt (lesbare Abweichungen statt nur Exit-Code) und um die
      Erkennung von Jahren, die NUR im Parquet stehen.
      Beide Zusicherungen per Gegenprobe verifiziert (2026 eingefügt / Referenzzahl verfälscht →
      schlagen an). Korrektur zum alten Eintrag: die Referenz war **nicht** veraltet, sie stand
      längst auf 2017–2025 / 2.219.353 Zeilen. Pipeline-Tests 39 → 41.
      *(vorher REFACTORING_PLAN §13 Punkt 5)*

## Ladezeit / Laufzeit

Hintergrund, Messungen und Bewertung: [`PERFORMANCE_PLAN.md`](PERFORMANCE_PLAN.md) und
[`PERFORMANCE_REPORT_2026-09-24.md`](PERFORMANCE_REPORT_2026-09-24.md) (IDs = Report).

- [x] **A1 + A2: Startpfad** (2026-09-24, `cd492aa`, `f8b055d`) — UI/Permalink bei `style.load`
      statt `load`; PMTiles-Ranges mit `cache: "no-store"` gegen die Chromium-Cache-Sperre.
      Mobilfunk: Legende 5,26 → 2,73 s, erster Punkt 6,08 → 4,18 s, fertig 7,72 → 5,67 s.
- [ ] **D1 — Zähler nur einmal je Bewegung** (auf `idle`, per `requestIdleCallback`, Abbruch
      bei `movestart`); heute läuft `recount()` auf `moveend` UND `idle`.
- [ ] **D3 — Torten-Bilder quantisieren** (5-%-Schritte, drei Größenklassen); vorher mit echten
      Clustern zählen, wie viele Bilder es real sind (Report Abschnitt 9).
- [ ] **A7 — Mapillary-TS-Layer unsichtbar anlegen** (`addLayers.js`), sonst Anfragen bei
      Links direkt auf z ≥ 14.
- [ ] **B1 — CDN-Cache für `tiles.vizsim.de`** = Stufe 1 in `PERFORMANCE_PLAN.md` (erst Purge,
      dann Regel scharf).
- [ ] **C1 — z11-Einzelpunkt-Kacheln** messen (größte z11-Kacheln), dann inhaltlich entscheiden.
- [ ] **B3 — ZXY-Kacheln über einen Worker** (Muster OSM-US-Tileservice), wenn Kosten/Limits
      passen. Später: D2 (Zähler im Worker), B4 (Brotli), E1–E4.

## Frontend / UX

- [x] **Mobile-Breakpoint** (2026-09-19) — erste `@media`-Query im Projekt (< 640px): Legende
      wird zum Bottom-Sheet, zugeklappt als Startzustand (gemessen 17 % statt ~50 % verdeckte
      Karte), aufgeklappt max. 72 dvh. Karten-Bedienelemente sitzen über dem Streifen
      (`--legend-peek` wird gemessen) und blenden aus, wenn aufgeklappt. Suche schrumpft zum
      44-px-Lupen-Knopf, fährt beim Antippen aus, klappt nur bei leerem Feld wieder ein.
      Am Desktop mitgenommen: klebende Titelzeile beim Scrollen (Trennung per weichem Schatten
      statt Linie — 12px darunter steht ohnehin schon ein Trenner). `tests/web/mobile.spec.js`.
- [x] **Sheet straffen + Zieh-Geste** (2026-09-20) — der zugeklappte Streifen trug vier
      Textzeilen und maß 144px; bei gleichem Inhalt jetzt zwei Zeilen und 105px (Untertitel
      einzeilig, Zähler + Zoom nebeneinander, kleinerer Titel). Status-Abzeichen von einem
      shields.io-Bild („Status | Experimental", 128px + Fremd-Request bei jedem Laden) auf
      eine inline gezeichnete Pille „Beta" umgestellt (47px, keyless). Neu: das Sheet lässt
      sich am Titel mit dem Finger hoch-/zuziehen — während der Geste rendert es in voller
      Höhe und wird per `transform` zurückgeschoben, beim Loslassen schnappt es (Wurf schlägt
      Weg). Tippen klappt weiter um. Zwei Tests in `tests/web/mobile.spec.js`.
- [x] **Attribution mobil erreichbar** (2026-09-20) — sie wurde gerendert, lag aber hinter
      dem Sheet: in KEINEM Zustand sichtbar (Lizenzpflicht OSM/ODbL, OpenFreeMap,
      Mapterhorn). Jetzt über dem Streifen, auf dem Handy als ⓘ-Knopf (ausgeklappt wäre
      es ein Band über die volle Breite, das unter den Karten-Knopf links läuft — Breite
      gedeckelt, Test prüft die Überlappung). Zweites Loch gestopft: der Quellenvermerk
      der Unfalldaten hing nur am ⓘ-Tooltip, und `tooltip.js` kannte nur `mouseover` —
      auf Touch ein totes Zeichen. Tipp öffnet jetzt jeden Hinweis (Capture-Phase, damit
      ein Tipp aufs ⓘ nicht das Sheet umklappt oder einen Layer schaltet), und die
      Unfall-Quelle trägt zusätzlich ein `attribution` in der Karten-Attribution.
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
- [~] **Legende aus Config generieren** — läuft, siehe Roadmap 2 Schritt 5b (6 von 13
      Kontext-Einträgen kommen aus der Registry).
- [x] **Touch/Mobile-Durchgang** (2026-09-19) — auf Touch fixiert ein Tap jetzt IMMER das
      Fenster; der Link steht darin in der Fußzeile und wird bewusst angetippt. Vorher rissen
      `openOnClick`-Layer (Tempolimit, Übergänge, Telraam) den Nutzer ungefragt nach
      OSM/Telraam — ohne die Vorschau, die das auf dem Desktop ankündigt.
      Die Eingabeart wird am EVENT abgelesen (`pointerdown`/`pointermove` → `pointerType`),
      nicht am Gerät: auf Hybridgeräten (Laptop mit Touchscreen) öffnet die Maus weiter
      direkt, und `pointermove` muss mit, sonst bliebe das Gerät nach einer Berührung auf
      „Touch" stehen. Zusätzlich unterdrückt: die Hover-Vorschau aus dem synthetischen
      mousemove, das Browser vor dem Klick nachschieben — sie blitzte nur auf und trug einen
      Hinweis („Klick fixiert …"), der ohne Zeigegerät sinnlos ist.
      `tests/web/touch.spec.js` (3 Tests, echte Touch-Events); beide Zusicherungen per
      Gegenprobe verifiziert. Der Desktop-Test in `smoke.spec.js` bleibt unverändert grün.

## Daten / Pipeline

- [x] **Unfall-Tiles als MLT** (2026-09-23, übernommen) — Details + Zahlen in
      [`MLT_EVALUATION.md`](MLT_EVALUATION.md): tippecanoe-MVT per `tools/mlt/mvt-to-mlt.mjs`
      (`@maplibre/mlt`, int32) umgewandelt, alle 48.667 Kacheln identisch; Pipeline-Schritt
      `unfallkarte accidents mlt`; Frontend auf `accidents_single_mlt.pmtiles` (`encoding:
      "mlt"`), 54/54 Playwright. Gemessen: Archiv −22 %, Stadt-Viewport −25…−28 % (Schwelle
      30 % knapp verfehlt), Berlin z11 auf Mobilfunk fertige Ansicht 14,7 → 13,1 s; erster
      Punkt, ländlich und schnelle Leitung ≈ 0. MLT-Datei vor dem Merge nach B2 (nur diese
      Datei, öffentlich geprüft), Suite unter CI-Bedingungen grün.
- [ ] **MLT-Nacharbeiten** (siehe [`MLT_EVALUATION.md`](MLT_EVALUATION.md), „Nächste
      Schritte"): MVT-Zwischenstand nach einem Deploy-Zyklus nach `raw/` + alte Datei auf B2
      von Hand löschen (`b2 sync` löscht nicht); stärkerer Encoder (Java/Rust) als
      Werkzeug-Tausch; Cluster-Datei; optional Upstream-Issue bei freestiler.
- [ ] **Sc6-Tiles ohne Namen** — `scenario6-polys` tragen nur `oid` +
      `total_tempo50_highway_length_m`, kein `name`/`amenity`. Deshalb sahen überlappende
      Buffer (Schulgelände + Kita-Node) im Popup identisch aus; Popup zeigt jetzt Länge +
      OSM-Objekt als Notlösung. Kleine Pipeline-Änderung, große Popup-Verbesserung — dabei
      auch prüfen, welche Attribute Sc1/Sc3/Sc9 mitgeben.
- [x] **Tote Popup-Zeilen: OSM-Tags fehlen in den Tiles** (Rebuild 2026-09-19) — Popup-Zeilen
      „Träger"/„Ausstattung" erschienen nie, weil `operator` (Gesundheit, Spielplätze) und
      `playground` nicht in den Tiles standen. Config-Fix war 187c78a (`attributes=` in
      `osmconf_health.ini` / `osmconf_playgrounds.ini`), jetzt nachgebaut mit
      `uv --directory pipeline run unfallkarte osm build health` bzw. `… playgrounds`.
      **Bewusst auf der ALTEN PBF gebaut** (`germany-latest.osm.pbf`, Datenstand 2026-07-10):
      so ist jeder Unterschied dem Config-Fix zuzurechnen und nicht OSM-Änderungen seither;
      `osm build` lädt von sich aus nichts nach (nur `osm fetch --force` täte das), und das
      Manifest führt korrekt `vintage: 2026-07-10` / `built: 2026-09-19`.
      Verifiziert: Tile-Felder 9→10 (health) bzw. 5→7 (playgrounds); in Berlin z14 tragen 23/47
      Gesundheits-Objekte `operator`, Spielplätze 12× `operator` + 25× `playground`.
      `KNOWN_POPUP_GAPS` um health/playgrounds erleichtert, Vertragstests grün.
      **B2-Deploy erledigt** (2026-09-19): `b2 sync` fasste genau 3 Dateien an (manifest.json +
      die 2 Tiles); gegengeprüft über die öffentliche URL (Größen identisch, Felder 10 bzw. 7)
      und mit den Vertragstests OHNE lokales `data/` (= der CI-Pfad, 3/3 grün).
      (Doppelpunkt-Tags heißen im Tile mit `_`.)
- [x] **Lazy-Sources** (2026-09-18, REFACTORING_PLAN §13 Punkt 7) — beim Start werden nur die
      Unfall-Quellen registriert; Quellen + Layer eines Registry-Eintrags entstehen beim ersten
      Einschalten (`ensureEntry` in `js/layers/registry.js`). `addLayers.js` legt nur noch die
      Zeichenreihenfolge fest (`DRAW_ORDER`); nachträglich angelegte Layer hängen per `beforeId`
      vor dem nächsten existierenden Layer eines späteren Slots → Reihenfolge identisch zum
      früheren Sofort-Anlegen (Golden unverändert; `tests/web/lazy.spec.js` prüft zusätzlich
      verschränkte/umgekehrte Einschalt-Reihenfolgen). Gemessen gegen B2: Start-Requests
      28 → 7, 415 → 79 KB; erster Unfallpunkt auf schneller Leitung ~0,1–0,4 s früher (große
      Streuung, Ausreißer 3,0 → 2,2 s), auf Mobilfunk-Profil (1,6 Mbit/s, 150 ms RTT) stabil
      14,4 → 12,6 s. Die 12 s dort zeigen: der nächste große Hebel ist die Nutzlast selbst
      (maplibre-gl ~1 MB + ~20 Einzel-Module → Vite/Bundling, Roadmap 3; Unfall-Tiles).

## Sichtbarkeit / Auffindbarkeit

- [x] **Meta-Tags** — `<meta name="description">` + OpenGraph/Twitter-Cards ergänzt
      (erledigt 2026-07); `og:image` = `public/screenshot.png` (bis Vite `docs/`), absolute URLs auf
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
