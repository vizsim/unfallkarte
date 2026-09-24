# Initiale Ladezeit — Plan, Messungen, offene Punkte

Stand: **2026-09-21**. Der Plan vom 20.09. war eine Analyse ohne Zahlen; seither ist Stufe 0
(messen) durchgeführt und die Stufen 2 und 3 sind gebaut, getestet und deployt. Was hier als
Zahl steht, ist gemessen — Schätzungen sind als solche gekennzeichnet.

Ergänzt `docs/TODO.md` Roadmap 3 (Vite), ersetzt sie nicht.

## Stand auf einen Blick

| Stufe | Status | Ergebnis |
|---|---|---|
| 0 Messen | **erledigt** | siehe „Was Stufe 0 ergeben hat" |
| 1 CDN-Cache für die Tiles | **offen — größter verbleibender Hebel** | heute wird NICHTS gecacht |
| 2 Attribut-Diät der Tiles | **erledigt + deployt** (`cadff01`) | −40 % / −63 % Dateigröße, −43 % je Kachel |
| 3 Roundtrip-Diät | **erledigt + deployt** (`cacd3f0`, `77ec4c9`, `acb5ef6`) | live −0,35 s, erste Kachel-Anfrage −0,51 s |
| 4 Vite | **erledigt + live** (`50d7fd5`, 2026-09-23) | live erster Unfallpunkt 5,76 → 5,1 s, erste Kachel-Anfrage 2,98 → 2,46 s; lokal A/B −0,78 s; schnelle Leitung ≈ 0 — [`VITE_MIGRATION.md`](VITE_MIGRATION.md) |
| 5 Lazy-Chunks | offen (nach Vite) | — |
| 6 Gefühlte Ladezeit, Perf-Budget | teilweise (`tests/web/perf.spec.js` steht) | — |
| 7 Startpfad: UI bei `style.load` (A1), PMTiles ohne Cache-Sperre (A2) | **erledigt + live** (`cd492aa`, `f8b055d`, 2026-09-24) | Mobilfunk: Legende 5,26 → 2,73 s, erster Punkt 6,08 → 4,18 s, fertig 7,72 → 5,67 s; Städtesprung schnelle Leitung: Unfall-Kacheln −40 % |

---

## Was die einzelnen Maßnahmen gebracht haben

**Live gemessen** (vizsim.de, 1,6 Mbit/s / 150 ms RTT, 7 Läufe, Median; Spannen in Klammern):

| | vorher | nachher |
|---|---|---|
| erster Unfallpunkt | 6,11 s (6,07–6,25) | **5,76 s** (5,70–5,84) |
| vollständige Startansicht | 7,24 s (7,18–7,36) | **6,87 s** (6,80–6,96) |
| erste Kachel-Anfrage | 3,49 s | **2,98 s** |

Die Läufe überlappen sich nicht — der Unterschied ist echt. Dieser Vergleich zeigt **nur
Stufe 3**: die schlanken Tiles lagen zu beiden Zeitpunkten schon auf B2.

**Stufe 3 im Einzelnen** (lokal, Pages-ähnlicher Server, je 5 Läufe — die Einzelschritte sind
nur so trennbar):

| Schritt | Gesamtzeit | erste Kachel-Anfrage |
|---|---|---|
| Ausgangsstand `4f38cad` | 6,19 s | 3,58 s |
| + `style.json`-Preload | 6,07 s (−0,12) | 3,57 s (±0) |
| + Unfall-Quellen ohne Manifest | 5,94 s (−0,13) | 3,23 s (**−0,34**) |
| + Token-Konfig parallel | 5,85 s (−0,09) | 3,06 s (**−0,17**) |

Der **Preload wirkt nicht auf den Unfall-Pfad** (erste Kachel-Anfrage unverändert), bringt die
Gesamtzeit aber trotzdem nach vorn: der Style kommt früher, also starten die *Basemap*-Kacheln
früher. Die Zahl der Anfragen vor der ersten Unfall-Kachel steigt dabei von 64 auf 72 — das ist
kein Fehler, sondern genau dieser Effekt.

**Stufe 2** (Attribut-Diät), gemessen mit identischem Code gegen alte und neue Tiles, beide
lokal ausgeliefert und gedrosselt:

| | alte Tiles | neue Tiles |
|---|---|---|
| `accidents_single.pmtiles` | 152,5 MB | **91,7 MB** (−39,9 %) |
| `combined_cluster.pmtiles` | 18,7 MB | **7,0 MB** (−62,7 %) |
| z12-Kachel Berlin | 311,0 KB | 177,7 KB (−42,9 %) |
| z12-Kachel Hamburg | 270,3 KB | 153,3 KB (−43,3 %) |
| z12-Kachel Köln | 136,6 KB | 79,9 KB (−41,5 %) |
| erster Unfallpunkt | 6,39 s | 6,08 s |
| **vollständige Startansicht** | **7,89 s** | **7,21 s** (−0,68 s) |
| Cluster sichtbar auf z10 | 7,57 s | 6,75 s |

Wichtig für die Einordnung: der Gewinn **skaliert mit der Unfalldichte**. Die Startansicht
(Schönefeld) ist der dünne Fall; über einer Innenstadt wiegt eine Kachel 133 KB weniger, bei
1,6 Mbit/s also gut 0,6 s pro Kachel. Der Nebengewinn ist B2-Speicher und -Egress: −43 %.

Gegenprobe, dass nur Attribute fehlen und keine Daten: Berlin z12 trägt vorher wie nachher
19.148 Features (Attribute 24 → 13); Tilestats über alle 3514 Cluster-Kacheln: `clusters_6_8`
7759, `clusters_9_11` 634903 Features — in beiden Dateien identisch.

---

## Was Stufe 0 ergeben hat

- **Kompression:** GitHub Pages liefert **gzip** (`maplibre-gl.mjs` 151 KB statt 585 KB über
  die Leitung, `-shared.mjs` 148 KB). Der im alten Plan vermutete 784-KB-Posten **existiert
  nicht**. Brotli liefert Pages auch bei `Accept-Encoding: br` nicht.
- **Tiles über CDN?** Nein: `cf-cache-status: DYNAMIC` bei jeder Anfrage. B2 sendet **weder
  `Cache-Control` noch `ETag` noch `Last-Modified`** — es wird also weder am Edge noch im
  Browser irgendetwas gecacht. Jede Bereichsanfrage geht bis zum Ursprung: TTFB 170–440 ms
  gegen ~90 ms bei einem Treffer.
- **Größte Unfall-Kacheln (alt):** Berlin z12 311 KB, Hamburg 270 KB, Köln 137 KB.
- **404-Probe in Produktion:** `./data/manifest.json` kostete 230 ms **plus 9.379 Bytes**
  Fehlerseite bei jedem Laden. Seit `77ec4c9` liegt sie nicht mehr auf dem kritischen Pfad.
- **`vendor/chart.umd.min.js`** (208 KB) lädt wirklich lazy (Script-Injektion beim Klick,
  `uspeedChart.js:14`) — kein Handlungsbedarf.

---

## Stufe 1 — CDN-Cache für die Tiles (offen, größter Hebel)

PMTiles ist **eine** Datei, aus der der Browser Bereiche holt: Kopf → Verzeichnis → Kachel.
Drei Anfragen für die erste Kachel, und weiter für jede neue Gegend — jede mit voller
Ursprungs-Latenz, weil nichts gecacht wird. Das trifft nicht nur den Erstladen, sondern jedes
Scrollen und Zoomen, und es überlagert alles, was Stufe 3 einspart.

- [ ] **Cache-Rule in Cloudflare** (Dashboard, ~2 min): `hostname eq "tiles.vizsim.de"`,
      „Eligible for cache", **Edge-TTL 1 Monat**, **Browser-TTL 1 Stunde**. Eine Regel ist
      zwingend — Cloudflare cacht `.pmtiles` nicht über die Default-Extensionliste, und ein
      `Cache-Control` von B2 allein ändert daran nichts.
- [ ] **Purge nach dem Deploy** in `deploy.py`: `b2 sync` nennt die angefassten Dateien, daraus
      die URL-Liste → Cloudflare-API (Purge by URL, 30 pro Aufruf). Token + Zone-ID nach
      `pipeline/.env`, nie geloggt (Muster wie bei den B2-Keys).
      **Reihenfolge beachten:** erst den Purge einbauen und prüfen, dann die Regel scharf
      schalten. Sonst liefert ein Deploy gemischte Byte-Bereiche aus alter und neuer Datei —
      und weil PMTiles-Bereiche sich über Byte-Positionen referenzieren, ist das nicht
      „etwas veraltet", sondern kaputt.
      Das kurze Browser-TTL ist Absicht: ein Purge räumt den Edge, **nicht** die Browser.
- [ ] Verifikation: `cf-cache-status: HIT` und TTFB gegen die gemessenen 170–440 ms.

*Nicht* nötig: `vizsim.de` selbst läuft über GitHub Pages, nicht über Cloudflare. Ein Purge
trifft also ausschließlich die Tiles.

---

## Stufe 2 — Attribut-Diät (erledigt, `cadff01`)

`tiles.py` übersetzt `include`/`exclude` aus dem Profil nach `-y`/`-x`; die Listen stehen in
`tiles.yaml`. Die Einzel-Unfälle tragen die 13 vom Frontend gelesenen Spalten, die Cluster nur
die drei Summen für die Torten.

Abgesichert durch `tests/web/contract.spec.js` (leitet die erwarteten Felder **aus dem Style**
ab — keine zweite Liste, die driftet) und drei Pipeline-Tests, darunter einer, der prüft, dass
jede akkumulierte Spalte die Diät überlebt.

**Preis, bewusst in Kauf genommen:** `OBJECTID` ist aus den Tiles verschwunden — ein gerenderter
Punkt lässt sich nicht mehr auf seine Quellzeile zurückführen. Ebenso die Gebietsschlüssel
(`ULAND`, `UREGBEZ`, `UKREIS`, `UGEMEINDE`), die man für ein künftiges „nach Landkreis filtern"
bräuchte. Beides ist eine Zeile in `tiles.yaml` plus ein Rebuild entfernt.

**Offen geblieben:** `no_tile_size_limit` + `no_feature_limit` stehen in 14 bzw. 13 Profilen und
hebeln `drop_densest_as_needed` sowie `maximum_tile_bytes` aus. Nach der Diät liegt die größte
gemessene Kachel bei ~178 KB — die Bremse scharf zu machen hieße, Unfälle bei niedrigem Zoom
wegzulassen. Das ist eine inhaltliche, keine Performance-Entscheidung; erst neu messen, dann
getrennt entscheiden.

---

## Stufe 3 — Roundtrip-Diät (erledigt, 3 von 7 Punkten)

Erledigt:

- **`style.json` vorladen** (`cacd3f0`). `crossorigin` ist Pflicht, obwohl die Datei
  gleich-origin liegt: `as="fetch"` ohne das Attribut lädt no-cors, `fetch()` benutzt per
  Default `mode:"cors"` — der Preload passt dann nicht und die Datei kommt **zweimal**.
  Gegengeprüft: ohne 2 Anfragen, mit 1.
- **Unfall-Quellen ohne Manifest** (`77ec4c9`). Dateinamen als Konstante `ACCIDENT_SOURCES`;
  das Manifest läuft parallel für Registry-URLs und Datenstände.
- **Token-Konfig parallel + zwei Weiße-Seite-Löcher** (`acb5ef6`).

Verworfen:

- **TileJSON-Indirektion auflösen.** Die TileJSON von OpenFreeMap zeigt auf
  `planet/20260913_164504_pt/{z}/{x}/{y}.pbf` — eine **rotierende, datierte Build-ID**. Inlinen
  würde die Basemap an einen Snapshot nageln, der planmäßig verschwindet. Ein Roundtrip
  (~100 ms, CDN-gecacht) gegen eine Karte, die irgendwann stumm weiß bleibt: schlechter Tausch.

Zurückgestellt:

- **Cluster-Quelle lazy.** Die Cluster-Layer tragen `maxzoom` 9 bzw. 11; beim Startzoom 12
  fragt MapLibre dort keine Kacheln an, es bleibt der PMTiles-Kopf der Quelle. Der läuft
  parallel zum Kopf der Unfall-Quelle, ist also kein serieller Roundtrip. Dem stünde gegenüber,
  Cluster-Layer, Zähler, Legende und den Permalink-auf-z8-Fall aus dem Kernpfad zu lösen —
  mehr Fläche als die drei erledigten Schritte zusammen. Erst nach Stufe 1 neu bewerten.
- **`cache: "no-cache"` beim Manifest.** Ohne `Cache-Control`/`ETag` von B2 ist ein Wechsel auf
  `"default"` heute wirkungslos. Gehört zu Stufe 1.
- **Doppelte Probe in der Entwicklung.** `resolveAccidentSources()` probt die zwei
  Unfall-Dateien, `resolveSources()` probt alle 25 inklusive derselben zwei. Zwei überflüssige
  HEAD-Anfragen, nur auf localhost, ohne übertragene Bytes. Ein memoisiertes `existsLocally`
  wäre der Einzeiler.

---

## Neue Funde, die im alten Plan fehlten

1. **Deploy-Risiko bei einzeln geladenen ES-Modulen.** Pages cacht jede Datei **einzeln** zehn
   Minuten. Nach einem Push kann ein Besucher ein neues `main.js` mit einem alten
   `addSources.js` bekommen — das neue importiert `attachManifest`, das alte Modul kennt es
   nicht → Importfehler → keine Karte. Genau das ist bei der ersten Nachher-Messung passiert
   (180 s Timeout, während die Seite kurz darauf einwandfrei lief).
   **Konsequenz:** nach einem Push zehn Minuten warten, bevor man misst oder Fehler bewertet.
   Und es ist ein handfestes Argument für Vite mit gehashten Dateinamen — dort kann diese
   Mischung nicht entstehen.
2. **Messfalle: `queryRenderedFeatures` als Poll-Bedingung.** Eine Sonde, die damit auf das
   Erscheinen von Cluster-Symbolen wartet, bremst genau das aus, was sie misst: der
   z10→z8-Wechsel „dauerte" so 14,5 s. Über die Kartenereignisse gemessen sind es **1,6–2,1 s**
   (letzte Cluster-Kachel nach ~1,0 s, `idle` nach 1,6 s). Für Zeitmessungen an Symbol-Layern
   also Ereignisse abhören, nicht abfragen.
3. **`manifest.generate()` stempelt `built` für alle 25 Einträge auf heute**
   (`manifest.py:86`) — ein Regenerieren verpasst unbeteiligten Layern ein falsches Baudatum.
   Das Feld wird vom Frontend nirgends gelesen. Sauberer wäre, es aus der mtime der jeweiligen
   Datei abzuleiten.
4. **Toter Dekorator:** über `accidents_tiles` in `cli.py` hängt ein
   `@accidents_app.command("build")`, den der echte `build`-Befehl (Parquet) überschreibt.
5. **Source-Map-404 in der Konsole:** die Vendor-Dateien tragen `sourceMappingURL`-Kommentare,
   die `.map`-Dateien vendoren wir nicht. Kosmetisch, nur bei offenen Entwicklerwerkzeugen
   sichtbar — beim Vendoring die Kommentarzeile entfernen oder die Maps mitnehmen.
6. **`-x` greift nicht auf Tippecanoes eigene Cluster-Attribute** (`point_count` & Co.): sie
   entstehen nach dem Filter, die Kacheln sind byte-identisch. Keine Config dafür eintragen.
7. **`contract.spec.js` braucht keine gepflegte Attributliste** — es leitet die benutzten
   Felder zur Laufzeit aus dem Style ab. Der alte Plan behauptete das Gegenteil.

---

## Stufe 7 — Startpfad: Legende und Unfall-Kacheln entkoppelt (2026-09-24)

Aus dem [Performance-Report vom 24.09.](PERFORMANCE_REPORT_2026-09-24.md) (Maßnahmen A1 + A2,
dort im Labor mit synthetischen Daten gemessen). Hier nachgemessen mit **echten Daten von B2** (TTFB von hier ~0,18 s,
`cf-cache-status: DYNAMIC`), MLT-Unfallkacheln, Pages-ähnlicher Server, je 7 Läufe, Median
(Spanne).

**A1 — UI + Permalink bei `style.load` statt `load`** (`main.js`). Die Unfall-Layer starten
unsichtbar und werden erst im Permalink-Restore sichtbar; unsichtbare Layer laden keine
Kacheln. Der Restore hing an `load` — und das feuert erst, wenn die Basemap der Startansicht
komplett ist (Kacheln, Glyphen, Sprite). Die Unfalldaten luden also **nach** der Basemap, die
Legende war bis dahin tot.

**A2 — PMTiles-Ranges mit `cache: "no-store"`** (`js/mapdata/pmtilesProtocol.js`). Chromium
lässt je URL nur **eine** Anfrage gleichzeitig laufen (Schreib-Sperre des HTTP-Caches), auch
für Range-Anfragen, und kein Antwort-Header hebt das auf (Minimaltest: 8 parallele Ranges mit
300 ms TTFB brauchen 2,45 s statt 0,32 s). Alle Kacheln eines Archivs teilen sich die URL,
luden also nacheinander. pmtiles setzt `no-store` selbst nur für Chromium **unter Windows**; der
eigene Handler tut es für alle. Preis: kein Browser-Cache für Ranges — den gab es mangels
Cache-Headern von B2 ohnehin nicht.

Start, **Mobilfunk** (1,6 Mbit/s / 150 ms):

| | Baseline | A1 | A2 | A1 + A2 |
|---|---|---|---|---|
| Legende bedienbar | 4,99–5,26 s | **2,66–2,71 s** | 4,99 s | **2,71–2,73 s** |
| erster Unfallpunkt | 5,77–6,08 s | 4,40–4,50 s | 5,81 s | **4,13–4,18 s** |
| fertige Startansicht | 7,43–7,72 s | 5,98–6,10 s | 6,00 s | **5,65–5,67 s** |

(Mehrere Werte = mehrere Serien; die Baseline schwankt zwischen den Serien um ~0,3 s, darum
immer im selben Lauf vergleichen.) Je Serie direkt verglichen:

- **A1** (2 Serien): Legende −2,5 s, erster Punkt −1,4/−1,5 s, fertig −1,5/−1,6 s.
- **A2 allein**: Legende und erster Punkt ±0, fertig **−1,4 s** (7,43 → 6,00).
- **A2 auf A1**: erster Punkt −0,37 s (4,50 → 4,13), fertig −0,45 s (6,10 → 5,65).
- **A1 + A2 gegen Baseline**: Legende −2,5 s, erster Punkt **−1,9 s**, fertig **−2,05 s**.

Keine der Spannen überlappt. Start, **schnelle Leitung** (ungedrosselt): A1 macht die Legende
bedienbar in 0,57 statt 1,24 s; erster Punkt und fertige Ansicht nur −0,2 bis −0,5 s, Spannen
überlappen. A2 ändert beim Start dort nichts Messbares.

**Städtesprung** (nach dem Start `jumpTo` auf z12 nach Köln, München, Hamburg, Leipzig; Zeit bis
alle Unfall-Kacheln der Ansicht da sind, `isSourceLoaded`), A1 gegen A1 + A2, je 5 Läufe:

| | ohne A2 | mit A2 |
|---|---|---|
| schnelle Leitung, Summe 4 Städte | 5,97 s (5,72–6,81) | **3,55 s** (3,34–3,62) |
| je Stadt | 1,01–1,81 s | 0,53–1,00 s |
| Mobilfunk, Summe 4 Städte | 22,07 s | 21,88 s (Rauschen) |

Wo A2 wirkt, hängt davon ab, was knapp ist: auf der **schnellen Leitung** bestimmt die
Wartezeit je Anfrage das Tempo, und die Sperre reiht die ~0,2 s TTFB je Kachel hintereinander.
Bei **1,6 Mbit/s über einer Stadt** ist die Bandbreite der Engpass (Kacheln bis 178 KB); dort
füllt auch das Nacheinander die Leitung, und A2 bringt nichts. `idle` bleibt beim Sprung gleich
(Basemap von OpenFreeMap bestimmt es) — der Gewinn ist, dass die Unfalldaten zuerst stehen.

**Testfalle:** Playwrights Gerät „Desktop Chrome" meldet sich mit einem **Windows**-User-Agent —
die ganze Testsuite lief also schon immer mit pmtiles' `no-store` und hat die Sperre nie
gesehen. Der A2-Test (`perf.spec.js`) setzt darum einen Linux-UA; mit dem Geräte-UA war die
Gegenprobe (Flag entfernt) grün. `measure-start.mjs` nutzt keinen Geräte-UA und misst den
Standardpfad (Linux = wie Android/macOS).

Tests: A1 hält die OpenFreeMap-Kacheln 8 s zurück und verlangt in der Zeit Legende +
Unfall-Kachel-Anfragen; A2 prüft per `fetch`-Spion, dass jede PMTiles-Range `no-store` trägt
(`page.route` taugt dafür nicht: Routing schaltet den HTTP-Cache ab, dann sähe auch der alte
Code parallel aus). Beide Gegenproben rot.

**Folge für Stufe 1:** nach A2 zahlt man die Ursprungs-TTFB je Ebene (Kopf → Blatt → Kachel)
nur einmal statt je Kachel. Der Edge-Cache bleibt wertvoll, vor allem beim Pannen/Zoomen, aber
der Start-Gewinn schrumpft. Die Browser-TTL aus Stufe 1 wirkt nach A2 für niemanden mehr — der
Nutzen liegt im Edge.

---

## Messmethode (zum Nachmessen)

Wie in `docs/MAPLIBRE_6_UPGRADE.md`: Zeit bis zum ersten Unfallpunkt, Profil 1,6 Mbit/s /
150 ms RTT (CDP `Network.emulateNetworkConditions`), mehrere Läufe, Median **und** Spanne.

- **Nie gegen `npm run dev` oder `vite preview` messen** — ohne gzip und Pages-Cache verfälscht das
  um Sekunden. Für lokale Vergleiche einen Server mit gzip + `max-age=600` benutzen, und die
  404-Antwort auf ~9,4 KB aufblasen, damit die Manifest-Probe nicht billiger aussieht als
  deployt.
- **Produktionspfad lokal testen:** über `http://127.0.0.2:<port>` laden. `main.js` und
  `resolveSources.js` schalten bei `localhost`/`127.0.0.1` auf den Entwicklungszweig
  (local-first-Proben); 127.0.0.2 ist derselbe Rechner, für den Code aber eine fremde Herkunft.
- **Einzelschritte trennen** geht nur lokal (Worktrees je Commit). Online schwankt zu viel und
  die Kachel-Diät lässt sich nachträglich nicht mehr A/B-testen.
- **Nach einem Push zehn Minuten warten** (siehe Fund 1).

Die Skripte liegen seit 2026-09-23 im Repo: `tools/perf/pages-like-server.mjs <dir> <port>` und
`tools/perf/measure-start.mjs <urlA> <urlB> [läufe] [mobil|schnell]` (A/B abwechselnd, frischer
Kontext je Lauf, Aufwärmlauf je Arm). Vorher lagen sie nur im Scratchpad der jeweiligen Sitzung.

---

## Reihenfolge von hier aus

Vite (Stufe 4) und der Startpfad (Stufe 7) sind erledigt. Die weitere Reihenfolge steht im
[Performance-Report](PERFORMANCE_REPORT_2026-09-24.md), Abschnitt 8, die offenen Punkte in
`docs/TODO.md`:

1. **Laufzeit:** Zähler nur einmal je Bewegung (D1), Torten-Bilder quantisieren (D3).
2. **Stufe 1 (CDN + Purge)** — nach A2 vor allem fürs Pannen/Zoomen; die Browser-TTL wirkt
   nicht mehr, der Nutzen liegt im Edge-Cache.
3. **z11-Einzelpunkt-Kacheln** erst messen, dann inhaltlich entscheiden (C1).
4. Zielbild ZXY über einen Worker (B3), wenn Kosten und Limits passen.
