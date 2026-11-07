# Analyse-Report (`report.html`)

Stand: 2026-11-07 · Regelwerk und Textbausteine 0.1.0 · Status: **experimentell; live nur der
Datenteil, der Rechtsteil ist juristisch ungeprüft und abgeschaltet**

Der Analyse-Report beantwortet für eine gewählte Stelle: Was sagen die Daten der Unfallkarte
hier? Mit Rechtsteil zusätzlich: Welche Maßnahme käme nach § 45 StVO in Betracht, und wie
schreibe ich das der Behörde? Er ist eine zweite Seite neben der Karte und liest **dieselben
PMTiles** (Local-first, sonst B2) direkt im Browser — kein Server, kein Schlüssel. Ausgabe:
Report am Bildschirm und Druckansicht („Als PDF speichern"), mit Rechtsteil auch ein Briefentwurf.

Kennzeichnung: *datenbasierte Auswertung · kein Gutachten · keine amtliche Feststellung* (mit
Rechtsteil: *datenbasierte Einschätzung · keine Rechtsberatung · …*). Wortwahl wie Sc9:
„rechnerisch", „auffällig", „Hinweis"; mit Rechtsteil auch „Kandidat".

## Datenteil und Rechtsteil (Schalter `VITE_REPORT_LEGAL`)

Bis zur juristischen Durchsicht (docs/TODO.md R0) baut Pages **nur den Datenteil**: Kopf mit
Karte, 1 Auf einen Blick (Befunde aus den Daten, `facts()` in `rules/synthesis.js`), 2 Unfalllage
inkl. M Uko rechnerisch, 3 Schutzbedürftige Nutzungen (Einrichtungen nach Art), 4 Straße und
Verkehr, 5 Umwelt, 6 Datengrundlage — dazu die Druckansicht.

Der **Rechtsteil** bleibt im Code und in den Tests: Weg A/B/C (6), Maßnahmen (7), Gegenargumente
(8), Datengrundlage dann als 9, Landesregeln-Auswahl, „Vermutlich zuständig", Maßnahmen-Kandidaten,
Nr.-6-Spalte, Tempo-30-Vorschlag in der Karte, Brief-Tab und Briefseite im Druck. Einschalten:
`VITE_REPORT_LEGAL=1 npm run dev` bzw. `… npm run build` (oder Eintrag in
`.env.development.local`). Bewusst eine Build-Variable (`js/config/env.js`, `REPORT_LEGAL`) und
kein URL-Parameter — den könnte auf der Live-Seite jeder setzen. `main.js` reicht den Modus als
`V.legal` an die Ansichten; `report.html` zeigt statisch den Datenteil.

## Einstieg

Gewählt wird **in der Karte** (`js/analysis/`, experimentell); alle Wege setzen dieselbe
Auswahl, zeigen sie als Kreis bzw. Umfeld und eine Vorschau im Akkordeon, „Report öffnen" führt
hierher:

- **Akkordeon „Analyse"** in der Legende zwischen Unfällen und Szenarien: Kreuzung (Klick rastet am nächsten Knoten ein)
  oder Einrichtung (Schule, Kita, Spielplatz, Gesundheit/Pflege; der Chip blendet sie ein).
- **Kontextmenü:** Rechtsklick, am Handy langes Drücken (MapLibre meldet beides als
  `contextmenu`).
- **Popup:** im fixierten Popup von Schulen/Kitas, Gesundheit, Spielplätzen, Unfällen und den
  Szenarien 2, 6, 8, 9 steht „Analysieren →" (PopupSpec-Feld `report`, `js/report/entry.js`);
  der Klick öffnet das Akkordeon, Mittel-/Strg-Klick direkt den Report.

`report.html` ohne gültige Auswahl erklärt diese Wege und verlinkt die Karte; im Report selbst
lassen sich Radius, Jahre und Straße ändern (mit Rechtsteil auch das Land).
- **Per Link** (Vertrag, `js/report/reportLink.js`, Kürzel nie neu vergeben):

  ```
  report.html?rv=1&sel=<art>:<daten>[&r=<m>][&jahr=<jj-jj>][&land=<xx>][&rw=<version>][&map=<z/lat/lng>]
  sel=k:<lat>,<lng>                 Kreuzung/Stelle, r 15–100 m (Standard 25)
  sel=e:<way|node|relation>/<id>@<lat>,<lng>   Einrichtung, Umfeld 50–300 m (Standard 150)
  sel=s:… / g:… / ags:…             reserviert (Straßenzug, Gebiet, Gemeinde – Stufe 2/3)
  ```

  `jahr` steht immer im Link (anders als beim Karten-Permalink): ein Link an eine Behörde soll
  auch nach dem nächsten Datenjahr dieselben Zahlen zeigen. Eigene Eingaben (Rolle,
  Beobachtung, Name) stehen nie im Link und werden nirgends gespeichert.

## Aufbau

| Datei | Aufgabe | rein? |
|---|---|---|
| `report.html`, `js/report/main.js` | Seite, Zustand, Ereignisse (kein MapLibre: die Karte ist SVG) | – |
| `js/analysis/` | Auswahl in der Karte: Akkordeon, Kontextmenü, Popup-Link; Vorschau lazy | – |
| `reportLink.js` | Link ↔ Auswahl | ja |
| `sources.js` | Datensätze, Leseradien, Feldvertrag, Auflösung über das Manifest | – |
| `tileReader.js` | PMTiles lesen, MVT + MLT dekodieren, Kachelkanten | – |
| `geometry.js` | lokale Metrik, Abstände, Zuschnitt, Puffer | ja |
| `roads.js`, `facilities.js`, `model.js` | Straßen (Tempo, Ketten, Knoten), Einrichtungen (Nr. 6), Datenmodell | ja |
| `rules/` | `params` (Landesprofile), `uko`, `wegA`, `wegB`, `wegC`, `synthesis` | ja |
| `texts.js`, `addressee.js`, `place.js` | Briefbausteine, Zuständigkeit je Land, Land/Stadt | ja* |
| `render/` | Ansichten, SVG-Karte, Diagramme | ja |

\* `place.js`: `landAt`/`placeFrom` rein, dazu der Photon-Aufruf.

**Daten im Auswahlbereich.** Gelesen wird je Archiv auf dessen **maxZoom** (volle Auflösung).
tippecanoe legt einen Puffer um jede Kachel: Punkte zählen nur in ihrer eigenen Kachel
(`0 ≤ x, y < extent`), Linien und Flächen werden auf die Kachel zugeschnitten, Stücke desselben
OSM-Objekts führt das Modell über die ID wieder zusammen. Die Unfall-Kacheln sind MLT; der
Decoder (`@maplibre/mlt`, jetzt Laufzeit-Abhängigkeit) lädt als eigener Chunk erst bei Bedarf.
Metrik in einer lokalen Tangentialebene um die Stelle (Abweichung zu EPSG:25832 < 0,1 % bei
wenigen km; Referenzwerte rechnet später ausschließlich die Pipeline in 25832).

**Land und Zuständigkeit.** Land aus Photon (OSM-Adressdaten), sonst aus
`public/report/laender.json` (Natural Earth, gemeinfrei, ~1 km genau; erzeugt mit
`tools/report/make-laender.mjs`). Im Datenteil bestimmt das Land nur, welche M-Uko-Kriterien
gelten (Bund 3, NRW 5, Sachsen 4; `land=` im Link überschreibt). Mit Rechtsteil kann die
Nutzerin das Land wählen, und es trägt Landesregeln und Zuständigkeit. Die Behörde ist ein
**Vorschlag** mit Alternativen („falls Große Kreisstadt …"); Einwohnerzahlen und Städtelisten
fehlen noch. Keine erfundenen Anschriften: die Nutzerin trägt sie ein, der Link zum
Bundesportal („Aufstellung von Verkehrszeichen anregen", FIM 99108014042000) hilft beim Finden.

## Was das Regelwerk 0.1.0 prüft

Im Datenteil nur M Uko (rechnerisch); alles andere nur mit Rechtsteil.

- **Weg A** (§ 45 Abs. 9 S. 4 Nr. 6 und Nr. 4 StVO, VwV zu Z. 274 Rn. 13 ff.): A0–A5 Pflicht
  (Tempo, innerorts, Straßenkategorie, Einrichtung, Lage ≤ 30/60 m, Zugang), A6 Vorschlag
  ±150 m entlang der Straße (nicht in bestehende Tempo-30-Abschnitte), A7 Zeitfenster, A8 ÖPNV,
  A9 Lückenschluss ≤ 500 m entlang derselben Straße (Hamburg: nicht über Ampeln).
- **M Uko rechnerisch**: 3-Jahres-Karte (≥ 5 U(P), 50 m), Unfallhäufungslinie Typ 4, 1-Jahres-
  Karte nur als Untergrenze; NRW- und Sachsen-Kriterien über das Landesprofil.
- **Weg B** (Gefahrenlage): Befunde ohne Referenzvergleich — B3 sagt offen, dass die Referenz
  (`report/baselines.json`) noch fehlt.
- **Weg C** (Lärm): nur Indizien aus der UBA-Kartierung; Hamburger Auslösewerte (65/55) sind
  direkt vergleichbar, die Klasse „65–69" erreicht sie.
- **Landesprofile**: bund, hh (HRVV T30 2026, LAP), bw (Lärm-Erlass 2023), nw (UKo-Erlass 2017),
  sn (VwV 2020). Die übrigen Länder: Bundesrecht + Zuständigkeitstext.

Nutzerangaben lösen nur „unklar" auf; ein „nicht erfüllt" aus den Daten bleibt stehen.

**Bewusste Abweichungen vom Konzept (KONZEPT_ANALYSE_REPORT.md):**
- Schulen ohne `isced:level` gelten als allgemeinbildend, wenn der Name eine allgemeinbildende
  Schulform nennt („Grundschule …", „Gymnasium …"); sonst wäre fast jede Schule „unklar". Der
  Report schreibt „laut Name". Umgekehrt macht ein Name („Berufsschule …") nur „unklar" mit
  Frage, nie „nicht erfüllt" — das bleibt `isced:level` ≥ 4 vorbehalten.
- A0 mit bestehendem **zeitweisem** Tempo 30 (`maxspeed:conditional`) ergibt das Urteil
  „Tempo 30 gilt schon zeitweise – Zeiten prüfen" statt „Kandidat".
- A9: Endet der Vorschlag direkt an einer bestehenden Tempo-30-Strecke, ist das eine
  Verlängerung (Hinweis), kein Lückenschluss; gezählt wird dann die nächste echte Lücke.
- `§ 45 Abs. 9 S. 4 Nr. 4` deckt beides: Tempo-30-Zonen **und** kurze Abschnitte bis 500 m
  zwischen zwei Tempo-30-Strecken (Wortlaut nach Abdruck, vor Freigabe amtlich prüfen, R0).
- Links aus Sc2/6/8 mit `node/<Relations-ID>` (Pipeline-Fehler R13) finden die Fläche ersatzweise
  über `relation/<ID>`; fehlt die Einrichtung ganz, heißt das Urteil „nicht in den Daten".
- Kein Referenzvergleich (erfundene Referenzen wären schlimmer als keine).
- Abdeckung je Land und Jahr heuristisch (Jahr ohne einen Unfall im Umfeld, obwohl die anderen
  Jahre viele haben → Hinweis), bis `report/coverage.json` kommt.

## Grenzen

Keine Sachschäden im Unfallatlas · OSM ist nicht die Beschilderung vor Ort · in den Kacheln
fehlen noch: Fahrstreifen, Eingänge, Vorfahrtstraße, `amenity=childcare`, `crossing_ref`,
Ampelknoten (`highway=traffic_signals`, nur Ampel-Querungen) · Lärm nur an kartierten
Hauptverkehrsstraßen · kein Gemeindeschlüssel (AGS) in den Zensus-Kacheln · Radinfrastruktur
(TILDA) noch nicht im Report · Straßenzug und Gebiet noch nicht wählbar.

## Tests

- `tests/unit/report-*.test.js` (browserlos): Link, Metrik, TileReader (MVT/MLT, Kachelkanten),
  Datenmodell, Regelwerk, Briefe, Zuständigkeit, Land; `report-views.test.js` rendert beide Modi
  und prüft, dass ohne Rechtsteil nichts davon durchsickert (mit Gegenprobe).
- `tests/web/report-fixture.spec.js`: ein **erfundener Ort** (`tests/fixtures/report/`) als echte
  PMTiles-Archive, per Routing ausgeliefert — Link → Kacheln → Report → Druck, Land und
  M-Uko-Kriterien, Radius im Report, kaputter Link. Unabhängig von `data/` und B2. Die Tests
  „Rechtsteil: …" (Weg A, Nutzerangabe, Brief, Hamburger Regeln, Zuständigkeit) laufen nur mit
  `VITE_REPORT_LEGAL=1 npx playwright test report-fixture`, die übrigen dann nicht.
- `tests/web/analysis.spec.js`: die Auswahl in der Karte (Akkordeon, Esc, Rechtsklick,
  Einrichtung, Popup-Link) gegen echte Daten.
- `tests/web/report.spec.js`: echte Daten (CI: B2) — eine Kreuzung in Berlin, der
  **Feldvertrag** (jedes Feld, das der Report liest, steht in den Archiven) und der
  Popup-Einstieg.
- Testdaten zum Ausprobieren: `node tests/fixtures/report/build.mjs data` (nur, wenn `data/`
  nicht der Symlink auf `pipeline/data` ist), dann `npm run dev` →
  `report.html?rv=1&sel=e:way/3001@53.56065,10.04651`.

## Bündel

Zwei Vite-Einstiege (`index`, `report`). Einrasten und Vorschau laden erst bei der ersten
Auswahl. Report: ~36 KB gzip + MLT-Decoder ~18 KB (nur bei Bedarf), **ohne MapLibre** —
Importmap und Preload setzt `vite.config.js` nur noch in `index.html`.

**Was der Kartenstart dafür zahlt** (2026-11-07, `tools/perf/`, Pages-ähnlicher Server, B2,
Mobilfunk-Profil 1,6 Mbit/s, zwei Reihen à 7 Läufe mit getauschten Armen): Start-JS 45,0 → 54,0 KB
gzip in 2 statt 1 Datei (eigene Herkunft 391 → 401 KB, 17 → 18 Anfragen); Legende, erster
Unfallpunkt und fertige Startansicht je **+0,04–0,06 s**. Davon ~5,6 KB das Akkordeon (statisch
in `main.js`), der Rest der Report-Link im Popup (`reportLink.js`) und der mit dem Report geteilte
Chunk. Ein Lazy-Akkordeon spart höchstens die 5,6 KB (~30 ms) — als Option in docs/TODO.md R16.
