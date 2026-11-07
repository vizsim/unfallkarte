# TODO — Offene Punkte

Stand: 2026-10-04. **Diese Datei ist die einzige Liste offener Punkte** — für Web und Pipeline.
Was erledigt ist, zieht mit Datum, Begründung und Messwerten nach [`DONE.md`](DONE.md) um
(gleiche Gliederung), damit diese Liste kurz bleibt. Hintergrund und Messungen stehen in den
Fachdokumenten, auf die die Punkte verweisen.

## Web-Architektur

Die Roadmap Web-Teil (Smoke-Tests → Layer-Registry → Permalink v2 → Vite) ist bis auf Stufe 4
erledigt; Verlauf und Begründungen in [`DONE.md`](DONE.md).

- [ ] **TypeScript** (Roadmap-Stufe 4) — lohnt an den Stellen mit impliziten Objektformen:
      Popup-Entry, Layer-Registry, Manifest, Permalink-Format. Günstiger Zwischenschritt ohne
      Build: `tsconfig.json` mit `checkJs` + JSDoc-Typen (IDE meldet heute schon z. B.
      `window.map`-Zugriffe und ungenutzte Variablen). Vite transpiliert TS, prüft aber keine
      Typen → `tsc --noEmit` als eigener CI-Schritt.
- [~] **Legende aus der Registry erzeugen** (Registry-Schritt 5b) — 7 Einträge kommen über das
      Feld `legend` (`js/ui/legendMarkup.js`): schools, health, playgrounds, crossings,
      platforms, population und Lärm (EIN Eintrag `laerm1` mit Chip); die SVZ-Größenskala
      entsteht aus den Karten-Konstanten. **Offen:** obs + movebis (mehrere
      Überschriften/Swatch-Gruppen, inline gestylte Linienstärken). Bewusst NICHT vorgesehen:
      svz/telraam (Modus-Chips), maxspeed/uspeed (Farbverlauf bzw. Regler im Block), bikelanes
      (eigenes Markup) — dafür müsste der Generator Layout in Daten kodieren, teurer als der
      Gewinn.
- [ ] **Rest außerhalb der Registry** (bewusst): Unfälle/Cluster (Kern-App, eigene Filter-UI),
      Mapillary (eigenes Modul mit Token + dynamischen Layern), Radinfrastruktur
      (`js/map/bikeLanesLayers.js`, externe TILDA-Tiles). Radinfra wäre der einfachste
      Nachzügler.

## Stabilität

- [ ] **Deploy ohne Retry/Backoff** (`pipeline/src/unfallkarte/deploy.py`) — ein transienter
      B2-500 bricht `b2 sync` mittendrin ab und hinterlässt ein Teil-Deploy. Retry-Loop
      (3× exponentieller Backoff) für B2, dazu `requests`-Retry für die Geofabrik- und
      Accidents-Downloads. *(vorher REFACTORING_PLAN §13 Punkt 4)*
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

## Ladezeit / Laufzeit

Hintergrund, Messungen und Bewertung: [`PERFORMANCE_PLAN.md`](PERFORMANCE_PLAN.md) und
[`PERFORMANCE_REPORT_2026-09-24.md`](PERFORMANCE_REPORT_2026-09-24.md) (IDs = Report).
Reihenfolge wie im Report, Abschnitt 8.

- [ ] **D1 — Zähler nur einmal je Bewegung** (auf `idle`, per `requestIdleCallback`, Abbruch
      bei `movestart`); heute läuft `recount()` auf `moveend` UND `idle`.
- [ ] **D3b — Torten ggf. auf 2-%-Schritte** (Option nach D3, das mit 1 % läuft — siehe DONE.md).
      Gleiche Tour gemessen (z6 → z7 → Ruhrgebiet z8 → Berlin z8–z10): Zusatzzeit durch Torten
      1 % 38,8 s · 2 % 26,8 s · 5 % 19,8 s; Bilder 670 · 359 · 163; Stufe 3,6° · 7,2° · 18°.
      Umstellung = eine Zeile in `percent()` (`js/utils/generatePieIcon.js`), Erwartungen in
      `tests/unit/pieIcon.test.js` anpassen, Golden neu aufnehmen.
- [ ] **A7 — Mapillary-TS-Layer unsichtbar anlegen** (`addLayers.js`), sonst Anfragen bei
      Links direkt auf z ≥ 14.
- [ ] **B1 — CDN-Cache für `tiles.vizsim.de`** = Stufe 1 in `PERFORMANCE_PLAN.md` (erst Purge,
      dann Regel scharf). Danach neu bewerten, was dort in Stufe 3 zurückgestellt ist:
      Cluster-Quelle lazy, `cache: "no-cache"` beim Manifest.
- [ ] **C1 — z11-Einzelpunkt-Kacheln** messen (größte z11-Kacheln), dann inhaltlich entscheiden.
      Hängt mit der offenen Größenbremse zusammen (`no_tile_size_limit`/`no_feature_limit`,
      PERFORMANCE_PLAN Stufe 2).
- [ ] **B3 — ZXY-Kacheln über einen Worker** (Muster OSM-US-Tileservice), wenn Kosten/Limits
      passen. Später: D2 (Zähler im Worker), B4 (Brotli), C3 (zopfli), E1–E4.

## Analyse-Report (`report.html`, Stand: [`ANALYSE_REPORT.md`](ANALYSE_REPORT.md))

Experimentell auf `temp/analyse-report`, noch nicht live (Patch vom 2026-09-26, am 2026-10-05 auf den
Stand mit Export und „Gebiet zeichnen" gehoben): Kreuzung und Einrichtung, Abschnitte 0–9,
Weg A/B/C, M Uko, Brief, Druck, Popup-Einstiege. Vision, Konzept mit Quellen und Prototyp:
`docs/intern/anaylse_report/`.

- [ ] **R0 — Juristische Durchsicht** von Regelwerk 0.1.0 und Textbausteinen (RDG § 6 Abs. 2);
      danach `rules/params.js` + Changelog versionieren. Amtliche Wortlaute (§ 45 Nr. 4/6/10,
      VwV zu Z. 274) gegen gesetze-im-internet.de/BAnz prüfen.
- [ ] **R7 — Pipeline:** `ags` in `census_population` (include) → Gemeinde/Kreis sicher statt
      über Photon; `LICHT`/`USTRZUSTAND` in `accidents_single` (vorher Kachelgröße messen).
- [ ] **R8 — Pipeline:** `report/coverage.json` (Land × Jahr, Logik `_valid_laender`) statt
      der Heuristik im Report; `report/uko_rules.json` gemeinsam mit Sc9; später
      `report/baselines.json` → Weg B mit Referenzvergleich (B3).
- [ ] **R9 — OSM K3:** `priority_road`, `lanes`, `oneway`, `entrance`, `opening_hours`,
      `amenity=childcare`, `crossing_ref`, `school:*`, `access`, Knoten `highway=traffic_signals`,
      `source:maxspeed` (in DE häufiger Träger von `DE:urban` — fehlt es, bleibt „innerorts" im
      Report oft „unklar") in osmconf/`osm.yaml` + Report-Feldvertrag (`js/report/sources.js`).
- [ ] **R10 — Sc3 auf 500 m** (§ 45 Abs. 9 S. 4 Nr. 4 seit 11.10.2024) + Legendentext.
- [ ] **R11 — Sc8-Popup:** „Orientierungswert ~57 dB(A)" ersetzen (L_DEN ≠ Beurteilungspegel).
- [ ] **R12 — Zuständigkeit:** `report/zustaendigkeit.json` (GV-ISys + Landeslisten: Große
      Kreisstädte, selbständige Gemeinden …) statt der Textregeln in `addressee.js`; ST, SH, TH,
      RP, SL primär belegen.
- [ ] **R13 — `geo.make_osm_oid`:** Relations-Multipolygone ergeben `node/<Relations-ID>` →
      `relation/…` (Sc6-OSM-Link, Report-Einstieg aus Sc2/6/8 findet die Einrichtung sonst nicht).
- [ ] **R14 — Sc9 an `report/uko_rules.json`** anbinden (Kriterien je Land wie im Report).
- [ ] **R15 — Straßenzug und Gebiet** (`sel=s:`/`g:`), Radinfrastruktur (TILDA) im Report,
      Knopf „Analyse" in der Karte (bisher nur Popup-Einstiege und direkter Aufruf).
- [ ] **R16 — Ladezeit messen** (Pages-ähnlicher Server, `tools/perf/`): Range-Anfragen je
      Report (~16 Archive), ggf. Leseradien/Zoom je Archiv nachschärfen.

## Frontend / UX

- [ ] **Cluster ausbauen** (Stand: DONE.md) — Unfalltyp/-art als weitere Chips (Daten stecken schon in
      `cluster_modes.pmtiles`). Trend: relativ zum Bundestrend färben („stärker gestiegen als Deutschland")
      und je Land einen längeren Zeitraum nutzen, wo es länger erfasst ist (z. B. 2017–19 gegen 2023–25).
      Nach jedem Daten-Update meldet `cluster-modes.spec.js`, wenn ein Bundesschnitt oder der Bundestrend
      in `clusterModes.js` abweicht — dann dort nachziehen (Trend-Zeitraum ggf. um ein Jahr schieben).
- [ ] **Punktfarbe „Beteiligung" zeigt den schwächsten Beteiligten nicht** — `styleConfig.js` prüft
      Rad, Pkw, Fuß, … der Reihe nach; ein Unfall Fußgänger + Pkw erscheint darum als Pkw. Reihenfolge
      nach Verletzlichkeit (Fuß, Rad, Krad, Pkw, Güter-Kfz, Sonstige) wäre ehrlicher.
- [ ] **Favicon ersetzen** — aktuell `stationary-bike-gym-svgrepo-com.svg`
      (Heimtrainer-Icon).
- [ ] **A11y über die Klapp-Pfeile hinaus** — z. B. Kontrast-Audit, Screenreader-Test der
      Filterlisten (Tastatur-Bedienung der Klapp-Pfeile ist erledigt, siehe DONE.md).
- [ ] Optional: `line-layer-opacity` / `fill-layer-opacity` (MapLibre 6) für die halbtransparenten
      Linien (Verkehrsmengen, Tempolimit) — Deckkraft je Layer statt je Feature, also keine
      dunkleren Stellen, wo sich Linien überlappen. *(aus der Analyse zum MapLibre-6-Upgrade)*

## Daten / Pipeline

- [ ] **MLT-Nacharbeiten** (siehe [`MLT_EVALUATION.md`](MLT_EVALUATION.md), „Nächste
      Schritte"): MVT-Zwischenstand nach einem Deploy-Zyklus nach `raw/` + alte Datei auf B2
      von Hand löschen (`b2 sync` löscht nicht) — der Deploy-Zyklus ist längst um,
      `accidents_single.pmtiles` liegt aber noch in `data/accidents/`; stärkerer Encoder
      (Java/Rust) als Werkzeug-Tausch; Cluster-Datei; optional Upstream-Issue bei freestiler.
- [ ] **Sc6-Tiles ohne Namen** — `scenario6-polys` tragen nur `oid` +
      `total_tempo50_highway_length_m`, kein `name`/`amenity`. Deshalb sahen überlappende
      Buffer (Schulgelände + Kita-Node) im Popup identisch aus; Popup zeigt jetzt Länge +
      OSM-Objekt als Notlösung. Kleine Pipeline-Änderung, große Popup-Verbesserung — dabei
      auch prüfen, welche Attribute Sc1/Sc3/Sc9 mitgeben.
- [ ] **Zensus-Rohdaten auf B2 sichern** — die Archivkopien in `pipeline/data/raw/census/`
      (npgeo-Gitter 100 m 1,05 GB + 1 km 119 MB, PLZ-Gebiete 100 MB, RegioStaR-Excel 11 MB)
      liegen nur lokal und in Nextcloud; der Hub-Download kann verschwinden. Wie bei Uber nach
      B2 `raw/census/` (von Hand, `deploy` synct nur PMTiles + Manifest).
- [ ] **`manifest` stempelt `built` für alle Einträge auf heute** (`manifest.py:86`) — ein
      Regenerieren verpasst unbeteiligten Layern ein falsches Baudatum. Das Frontend liest das
      Feld nirgends; sauberer wäre die mtime der jeweiligen Datei. *(vorher PERFORMANCE_PLAN,
      „Neue Funde" 3)*

## Daten-Export (alle Unfälle als Datei auf data.vizsim.de)

Datei, Export in der Karte und „Gebiet zeichnen" sind seit 2026-10-03 live (Verlauf in
`DONE.md`). Konzept: `KONZEPT_DATENEXPORT.md` (intern, nicht im Repo; Entwürfe und
Messskripte in `docs/intern/entwuerfe_datenexport.zip`).

- [ ] **Cloudflare-Cache für die beweglichen Dateien** — B2 liefert `latest.json`, Alias und
      CSVs mit `no-cache`, Cloudflare macht daraus `max-age=14400` und cacht am Edge (HIT). Nach
      dem nächsten Update zeigen sie also bis zu ~4 h den alten Stand (unschädlich: `latest.json`
      zeigt dann auf die alte, weiter vorhandene Datei). Abhilfe: Cache Rule für
      `/unfallorte/*` „Edge TTL + Browser TTL: Header der Origin respektieren“, oder nach dem
      Deploy diese Dateien purgen.
- [ ] **Vor dem nächsten Deploy**: Lifecycle-Regel für `unfallorte/` (überschriebene Fassungen
      nach 30 Tagen löschen; der Bucket hat bisher keine Regeln — `b2 bucket update
      --lifecycle-rule` setzt trotzdem immer ALLE neu). Optional B2 „Caps & Alerts“
      (Tageslimits gegen Massen-Downloads).
- [ ] Später: Auswertung im Gebiet (Report) auf derselben Auswahl; Kreis um eine Kreuzung
      (`sel=k:…`, Terra Draw hat den Modus schon).
- [ ] Quellenvermerk: vorgegebenen Wortlaut des Bereitstellers prüfen (Konzept § 7.3).

## Aufräumen

- [ ] Altes B2-Bucket `unfallkarte-data` hat nach der Uber-Migration keinen
      Verbraucher mehr → stilllegbar (vorher kurz verifizieren, dass nichts
      Externes darauf zeigt). **Doch, drei** (Suche über ~/ am 2026-09-25):
      - `routing_bulk`: Zensus-Kacheln (`POPULATION_PMTILES_URL` in `src/core/config.js`)
      - `matsim-py-helper`: dieselben Zensus-Kacheln (`pop_writer_v02/_v03*.ipynb`)
      - `maplibre_routing`: `planetiler-de.pmtiles` (`style.json`) — liegt NICHT im v2-Bucket
      Achtung beim Umstellen der ersten beiden: `unfallkarte-data-v2/census/population_100m.pmtiles`
      ist seit 2026-09-25 NICHT mehr die alte Datei — z11–12 statt z9–10 und nur 9 Felder
      (Einwohner, Unter18, AnteilUnter18, a65undaelter, AnteilUeber65, Durchschnittsalter,
      name_23, plz, RegioStaR7). Vorher prüfen, welchen Zoom/welche Felder sie lesen; ggf. ein
      eigenes Profil in tiles.yaml. Für die Planetiler-Basiskarte erst ein neues Zuhause klären.
- [ ] **Git-History entschlacken — oder bewusst lassen** (offen seit dem Refactor,
      REFACTORING_PLAN §12) — die Historie trägt noch die Großdateien der Notebook-Zeit
      (`accidents_12-13.pmtiles` 83 MB, `accidents_11-12.pmtiles` 68 MB, Unfall-Parquet 43 MB,
      Notebooks je 33–37 MB). `git filter-repo` + Force-Push schreibt ALLE Hashes neu: die Tags
      `v2025`/`pre-vite` und die vielen Commit-Verweise in Doku und Code-Kommentaren zeigten
      danach ins Leere. Erst entscheiden, ob ein schlankerer Klon das wert ist.
