# MLT statt MVT für die Unfall-Tiles — Evaluation

Stand: **2026-09-23**. Schritt 1 (Offline-Vergleich) ist durchgeführt; Schritt 1b (ganzes
Archiv) und 2 (Browser-Messung) sind erledigt und die Umstellung ist auf dem Branch **`temp/mlt`
vorbereitet** (Werkzeug, Pipeline, Frontend, Tests) — **offen ist die Entscheidung** (siehe
„Schritt 2" unten). Offene Punkte stehen wie immer in
[`TODO.md`](TODO.md); hier stehen Begründung, Zahlen und Methode. Was als Zahl dasteht, ist
gemessen — Vermutungen und Schätzungen sind als solche gekennzeichnet.

## Ergebnis auf einen Blick

- **Das Format lohnt sich.** MLT (MapLibre Tiles) spart bei den Einzel-Unfällen **30–37 %
  übertragene Bytes** auf Stadt-Viewports und halbiert die zu dekodierenden Bytes.
- **freestiler 0.2.0 taugt dafür derzeit nicht.** Es schreibt alle Ganzzahlen als INT_64. Im
  Browser werden daraus BigInts, an denen **jeder unserer Filter scheitert** — die Karte
  zeigte keine Unfälle. Dazu schwache gzip-Stufe, mehr als doppelt so viele Rand-Duplikate,
  10× RAM.
- **Der bessere Weg:** tippecanoe behalten und dessen MVT-Kacheln nach MLT **konvertieren**
  (offizieller Encoder `@maplibre/mlt`, Spalten als int32). Stichprobe: **−24 bis −30 %**
  Transfer, Werte bleiben normale Zahlen (Frontend unverändert bis auf `encoding: "mlt"`),
  Dekodieren schneller (fair nachgemessen 28 → 19 ms je schwerer Kachel, nicht „halb so lang",
  wie die erste Stichprobe nahelegte). Es ändert sich nur das Format — auch die
  Cluster-Datei ließe sich so umstellen.

---

## Ausgangslage

`accidents_single.pmtiles` (91,7 MB, 48.667 Kacheln, z11–13) ist die schwerste Nutzlast der
Karte, und sie skaliert mit der Unfalldichte:

| Kachel | gzip (übertragen) | roh (dekodiert) |
|---|---|---|
| Berlin-Mitte z11 | 348 KB | 1,5 MB (39.847 Punkte) |
| Berlin-Mitte z12 | 174 KB | 729 KB |
| München z11 | 304 KB | 1,27 MB |
| Görlitz z12 | 13 KB | 48 KB |

Ein Stadt-Viewport auf z11 (3×3 Kacheln) kostet damit rund **1 MB Transfer und 4 MB Dekodieren**.

**Warum MLT hier besonders passt:** Ein Punkt kostet im MVT 37 Byte roh, davon **26 Byte
Attribute** (13 Schlüssel/Wert-Paare je Feature) und nur 5 Byte Geometrie. MVT speichert
zeilenweise, MLT spaltenweise — 13 kleine Ganzzahlen, sechs davon nur 0/1, sind der Idealfall
für spaltenweise Kodierung.

**Das Frontend kann MLT schon:** MapLibre 6.10 kennt `encoding: "mlt"` an Vektor-Quellen, der
Decoder (`@maplibre/mlt` 1.3) steckt bereits im vendorten Bundle — **kein zusätzliches JS**.
pmtiles 4.5 kennt den Kacheltyp 6 (MLT), setzt `encoding` aber **nicht** selbst in die
TileJSON; das muss an `addSource` stehen. tippecanoe (v2.78) kann kein MLT schreiben.

---

## Versuchsaufbau

| Variante | Tiler | Format | Zweck |
|---|---|---|---|
| **A** | tippecanoe (heutiges Profil `accidents_single`) | MVT | Status quo |
| **B** | freestiler 0.2.0 | MVT | Tiler-Effekt isolieren (A→B) |
| **C** | freestiler 0.2.0 | MLT | Format-Effekt (B→C) und Gesamteffekt (A→C) |
| **C-f64** | freestiler 0.2.0, Attribute als float64 | MLT | Ausweg aus dem BigInt-Problem? |
| **A→MLT** | tippecanoe + Konvertierung (`@maplibre/mlt` `encodeTile`, int32) | MLT | Stichprobe, 3 Kacheln |

Nur A→C zu vergleichen hätte zwei Änderungen vermischt; B trennt sie.

**Eingabe für B/C:** direkt `accidents_germany_2017-2025_oid.parquet` (2.219.353 Punkte,
EPSG:4326), die 13 `include`-Spalten aus `tiles.yaml`. Vorbereitung, für B und C identisch:

```python
gdf = gpd.read_parquet(PARQUET, columns=INCLUDE + ["geometry"])
gdf["IstGkfz"] = gdf["IstGkfz"].astype("Int64")        # im Parquet double, 195.229 Nullwerte
gdf = gdf.iloc[gdf.geometry.hilbert_distance().argsort()]  # freestiler behält die Eingabe-Reihenfolge

freestile(gdf, out, layer_name="accidents", tile_format="mvt" | "mlt",
          min_zoom=11, max_zoom=13, base_zoom=11, drop_rate=None, generate_ids=False)
```

Bewusst der GeoDataFrame-Weg: `freestile_file` kann keine Spalten auswählen (nähme alle 21),
`freestile_query` (DuckDB) hat keinen `generate_ids`-Parameter. tippecanoe schreibt keine IDs,
freestiler standardmäßig schon (in einer Probe +35–40 % Größe) — daher `False`.

**Gemessen:**

- **Vollständigkeit:** Punkte *innerhalb* der Kachel je Zoomstufe (der Rand-Puffer dupliziert
  Punkte an Kachelgrenzen und muss herausgerechnet werden), Soll 2.219.353.
- **Gleichheit:** je z13-Kachel die Multimenge der 13-Tupel, einmal ohne, einmal mit Koordinaten.
- **Größen:** Archiv, je Zoomstufe, und **Viewport-Bytes** (3×3-Kachelblock um Berlin-Mitte,
  München, Köln bei z11/z12; Görlitz als ländliche Referenz). Jeweils wie gespeichert **und
  einheitlich mit gzip -6 nachkomprimiert** — freestiler komprimiert schwächer als tippecanoe,
  das würde sonst den Format-Vergleich verzerren.
- **Dekodierzeit** der Berlin-z11-Kachel in Node (ohne gunzip, alle Features + Geometrie + alle
  13 Properties; Median aus 40 nach 10 Aufwärmläufen). MapLibres MLT-Adapter ruft intern
  ebenfalls `getFeatures()` auf, der Aufbau ist also ein brauchbarer Stellvertreter — aber eben
  Node auf einem Laptop, kein Handy-Browser.
- **Build:** Wandzeit und maximaler Arbeitsspeicher (`/usr/bin/time -v`).

---

## Ergebnisse

### Vollständigkeit und Gleichheit

| | z11 | z12 | z13 | Rand-Puffer | Kacheln |
|---|---|---|---|---|---|
| A | 2.219.086 (−267) | 2.218.784 (−569) | 2.219.353 | 7,4 % der Features | 48.667 |
| B / C | 2.219.353 | 2.219.353 | 2.219.353 | 17,3 % der Features | 49.145 |

- B und C sind **vollständig**. A verliert auf z11/z12 ein paar hundert Punkte (0,01–0,03 %) —
  trotz `drop_rate=0`, vernachlässigbar, aber gut zu wissen.
- Attribute: in **36.008 von 36.012** z13-Kacheln identisch mit A. Inklusive Koordinaten in
  27.950 (78 %) — vermutlich Rundungsunterschiede um eine Kachel-Einheit (< 1 m), nicht geprüft.
- Die 478 zusätzlichen Kacheln bei B/C tragen vermutlich nur Puffer-Punkte (Folge des
  breiteren Puffers; nicht einzeln geprüft).

### Größen

**Archiv gesamt:**

| | wie gespeichert | gzip -6 (fair) | roh |
|---|---|---|---|
| A tippecanoe-MVT | 91,7 MB | 92,4 MB | 291 MB |
| B freestiler-MVT | 130,1 MB | 102,1 MB | 325 MB |
| **C freestiler-MLT** | **75,6 MB** (−18 %) | **68,5 MB** (−26 %) | **152 MB** (−48 %) |
| C-f64 | 108,8 MB | 86,8 MB | 872 MB |

**Viewport 3×3, gzip -6 (fair), Differenz zu A:**

| | A | B | **C** | C-f64 | C roh |
|---|---|---|---|---|---|
| Berlin-Mitte z11 | 1020 KB | +10 % | **−37 %** | −15 % | −52 % |
| Berlin-Mitte z12 | 731 KB | +11 % | **−35 %** | −14 % | −51 % |
| München z11 | 657 KB | +12 % | **−34 %** | −13 % | −50 % |
| München z12 | 467 KB | +11 % | **−33 %** | −12 % | −50 % |
| Köln z11 | 537 KB | +10 % | **−35 %** | −13 % | −51 % |
| Köln z12 | 312 KB | +13 % | **−30 %** | −9 % | −50 % |
| Görlitz z11 | 29 KB | +14 % | −24 % | −2 % | −48 % |
| Görlitz z12 | 21 KB | +6 % | −28 % | −8 % | −51 % |

So wie freestiler die Kacheln **tatsächlich speichert**, spart C gegenüber A nur **14–23 %**.

**Lesart:** Der Tiler kostet (+10 %, fast nur Puffer), das Format spart viel (B→C rund −40 %).
Floats statt Ganzzahlen verschenken den Großteil des Vorteils (C-f64).

### Dekodierzeit (Berlin-Mitte z11, Node)

| | A MVT | B MVT | C MLT (INT_64) | C-f64 MLT | A→MLT (int32) |
|---|---|---|---|---|---|
| Median | 79 ms | 73 ms | **114 ms** | 42 ms | **35 ms** ¹ |

¹ In einem zweiten, leicht anderen Messaufbau (direkt `decodeTile` + `getFeatures`); C lag
dort bei 106 ms, ist also vergleichbar. München z11: C 89 ms gegen A→MLT 38 ms.

MLT selbst dekodiert **schneller** als MVT — C ist nur wegen der BigInt-Erzeugung langsamer.

### Build

| | Wandzeit | max. RAM |
|---|---|---|
| tippecanoe (A) | 1:42 min | 0,35 GB |
| freestiler MVT / MLT | 0:53 / 0:49 min | 3,6 / 3,5 GB |

tippecanoe-Zeit ohne den vorgelagerten GeoJSON-Export der Pipeline (`write_grouped_geojson`).

---

## Befunde zu freestiler 0.2.0

1. **Blocker: jede Ganzzahl-Spalte wird INT_64** — auch bei int8/int16/int32/uint8, geprüft.
   Der MLT-Decoder liefert INT_64 als **BigInt**, und MapLibre reicht MLT-Properties
   **unverändert** an den Style durch (nur die Feature-ID wird per `Number()` gewandelt).
   Mit MapLibres eigener Style-Spec (26.4) getestet:

   | Ausdruck (aus unserem Frontend) | Wert `1` | Wert `1n` |
   |---|---|---|
   | `["==", "IstRad", 1]` (Beteiligung, Legacy-Filter) | ✓ | ✗ |
   | `["in", "UKATEGORIE", 1, 2]` (Auswahl, Legacy-Filter) | ✓ | ✗ |
   | `["==", ["get", "IstRad"], 1]` (Symbol-Text) | ✓ | ✗ |
   | `["match", ["get", "UKATEGORIE"], 1, …]` (Farbe) | rot | grau (Fallback) |
   | `["==", ["to-number", ["get", "IstRad"]], 1]` | ✓ | ✓ |

   `to-number` überall wäre ein Ausweg (Legacy-Filter in Expressions umschreiben), lässt das
   Dekodieren aber 44 % langsamer als heute. Floats statt Ganzzahlen: siehe C-f64, lohnt nicht.
2. **Schwache Kompression:** Kacheln sind schwächer komprimiert als `gzip -1` (Berlin z11, B:
   gespeichert 543 KB, gzip -1 445 KB, gzip -6 373 KB). Kostet rund 10 Prozentpunkte.
   Nachträgliches Umkomprimieren des Archivs würde reichen.
3. **Breiterer Rand-Puffer:** 17,3 % statt 7,4 % der Features sind Duplikate vom Kachelrand,
   nicht konfigurierbar. tippecanoes schmalerer Puffer reicht heute sichtbar aus.
4. **ID-Spalte bei MLT immer**, auch mit `generate_ids=False` (bei gleichen IDs praktisch
   kostenlos). Mit `generate_ids=True` kamen in einer Probe negative IDs heraus.
5. **Metadaten** nur `vector_layers`, alle Felder als `"string"` typisiert.
   `contract.spec.js` prüft nur die Namen — für uns egal, für QGIS kosmetisch.
6. **Positiv:** schnell, vollständig, kein System-Binary, liest GeoParquet direkt. Status
   „Alpha" — die Punkte 1–3 sind gute Kandidaten für ein Upstream-Issue.

---

## Der bessere Weg: tippecanoe-MVT nach MLT konvertieren

Stichprobe mit `encodeTile` aus `@maplibre/mlt` (dieselbe Bibliothek, deren Decoder MapLibre
6.10 benutzt), Eingabe = die heutigen A-Kacheln, `propertyTypes` = int32:

| Kachel (gzip -6) | A (MVT) | C (freestiler-MLT) | **A→MLT** | roh A → A→MLT |
|---|---|---|---|---|
| Berlin-Mitte z11 | 347 KB | 205 KB | **242 KB (−30 %)** | 1516 → 738 KB |
| München z11 | 303 KB | 180 KB | **212 KB (−30 %)** | 1269 → 622 KB |
| Berlin-Mitte z13 | 46 KB | 31 KB | **35 KB (−24 %)** | 183 → 89 KB |

- Werte kommen als **`number`** an → Filter, Farben, Zähler, Popups laufen unverändert.
- Dekodieren ~35 ms statt ~80 ms (MVT) bzw. ~110 ms (freestiler-MLT).
- **Nur eine Variable ändert sich:** Puffer, Attribut-Diät, Ausdünnen bleiben tippecanoes.
  Die Cluster-Datei (`accumulate: sum`, das freestiler nicht kann) ließe sich genauso umwandeln.
- **Preis:** Der JS-Encoder schreibt laut eigener Doku die *schlichteste* Kodierung (Varints,
  kein RLE/Dictionary/FastPFOR) und liegt daher ~15 % über freestiler. Die Rust- und
  Java-Encoder aus `maplibre-tile-spec` kämen vermutlich näher heran — **nicht getestet**.
  Außerdem käme ein Node-Schritt in die Python-Pipeline (Node ist für die Tests ohnehin da).

---

## Beim Umstieg zu beachten

- **Frontend:** `encoding: "mlt"` an der Quelle. `addSources.js` registriert beide
  Unfall-Quellen in einer Schleife → Option je Quelle nötig.
- **Neuer Dateiname statt Ersetzen** (Frontend-Vertrag, im selben Commit). Eine noch gecachte
  alte Seite würde sonst MLT-Kacheln als MVT parsen → Unfall-Layer kaputt. Die alte Datei
  bleibt einen Deploy-Zyklus liegen (Muster wie `vendor/maplibre-gl.js`). Gilt auch nach Vite:
  gehashte Bundles lösen das für JS, nicht für Daten-Dateien mit festem Namen.
- **Experiment-Dateien nie unter `pipeline/data/`:** `deploy.py` lädt **jede** `*.pmtiles`
  darunter nach B2.
- **Metadaten:** Ein Konverter muss `vector_layers` samt Feldnamen mitschreiben (von A
  übernehmen), sonst schlägt `contract.spec.js` an.
- **Kopplung:** MapLibre-Upgrades hängen dann auch am MLT-Decoder. Die Playwright-Tests decken
  den Unfall-Layer ab, laufen vor jedem Vendor-Upgrade ohnehin.
- **Messen** wie in [`PERFORMANCE_PLAN.md`](PERFORMANCE_PLAN.md) („Messmethode"): Pages-ähnlich,
  nie gegen `npm run serve`, zusätzlich mit CPU-Drosselung — der Dekodier-Gewinn zählt vor
  allem auf dem Handy.

## Schritt 1b — ganzes Archiv umgewandelt (2026-09-23, Branch `temp/mlt`)

Werkzeug: `tools/mlt/mvt-to-mlt.mjs` (A→MLT mit `@maplibre/mlt` 1.3.0 — exakt die Version, deren
Decoder MapLibre 6.10 mitbringt; Ganzzahl-Spalten int32, Kacheln gzip -6, Metadaten von A
übernommen). Es liest danach **jede** Kachel zurück und vergleicht sie Feature für Feature mit A.
Ergebnis: **alle 48.667 Kacheln identisch** (Geometrie + alle 13 Attribute, kein einziger BigInt).
Dauer 2:02 min (je rund die Hälfte Umwandeln und Prüfen), max. 1,1 GB RAM. Vergleich per
`tools/mlt/compare.mjs` (dieselbe Methode wie oben — die MVT-Werte stimmen exakt mit A überein):

| | MVT (A) | MLT (A→MLT) | Δ |
|---|---|---|---|
| Archiv (gespeichert) | 91,6 MB | 71,6 MB | −22 % |
| Berlin-Mitte z11, Viewport 3×3 (gzip -6) | 1020 KB | 735 KB | **−28 %** |
| Berlin-Mitte z12 | 731 KB | 543 KB | −26 % |
| München z11 / z12 | 657 / 467 KB | 478 / 351 KB | −27 / −25 % |
| Köln z11 / z12 | 537 / 312 KB | 394 / 235 KB | −27 / −25 % |
| Görlitz z11 / z12 (ländlich) | 29 / 21 KB | 23 / 17 KB | −21 / −21 % |

**Entscheidungsregel (≥ 30 % in den Städten): knapp verfehlt** — der JS-Encoder schreibt die
schlichteste Kodierung (Varints, kein RLE/Dictionary/FastPFOR). freestiler kam mit besserer
Kodierung auf 30–37 %, scheitert aber an INT_64. Ein Encoder mit den stärkeren Verfahren (Java-
Referenz bzw. Rust aus `maplibre-tile-spec`) würde die 30 % vermutlich überschreiten — **nicht
getestet**; das Werkzeug ließe sich dafür austauschen, der Rest der Kette (Pipeline, Frontend,
Tests) bleibt gleich.

## Schritt 2 — Browser-Messung (2026-09-23)

Dieselbe App zweimal gebaut — `main` (MVT) gegen `temp/mlt` (MLT) —, beide über
`tools/perf/pages-like-server.mjs` auf 127.0.0.1, Kacheln lokal aus demselben `data/`-Baum
(Local-first), `tools/perf/measure-start.mjs`, abwechselnd, frischer Kontext, 5 Läufe je Arm:

| Ansicht / Profil | | MVT | MLT | Δ |
|---|---|---|---|---|
| **Berlin-Mitte z11**, Mobilfunk | erster Unfallpunkt | 10,01 s | 9,78 s | −0,23 s |
| | **fertige Ansicht** | 14,74 s | **13,12 s** | **−1,62 s (−11 %)** |
| | eigene Herkunft übertragen | 1531 KB | 1222 KB | −309 KB |
| Berlin-Mitte z11, Mobilfunk + CPU ×4 | erster Unfallpunkt | 11,42 s | 11,26 s | ≈ 0 (Spannen überlappen) |
| | fertige Ansicht | 17,70 s | 16,05 s | −1,65 s (−9 %) |
| Startansicht (z12, ländlich), Mobilfunk | erster Unfallpunkt / fertig | 5,99 / 7,58 s | 6,02 / 7,60 s | ≈ 0 |

Dekodieren derselben Kachel in Node, fair (MVT: Geometrie + Attribute je Feature wie im Worker;
MLT: `decodeTile` + `getFeatures`): **28 ms gegen 19 ms**.

**Lesart:** Der Gewinn ist **Bandbreite**, nicht CPU — er wächst mit der Unfalldichte (Innenstadt
bei langsamer Leitung ≈ 1,6 s bis zur fertigen Ansicht) und verschwindet in dünnen Gegenden und
auf schneller Leitung. Die CPU-Drosselung vergrößert ihn nicht messbar: 9 ms weniger Dekodieren je
Kachel gehen neben Sekunden Übertragung unter. Der erste Punkt gewinnt kaum, er braucht nur die
erste Kachel. Nebengewinn: −22 % Speicher und Egress auf B2.

**Kosten:** Build +~2 min (je ~1 min Umwandeln und Prüfen, ~1,1 GB RAM) bei jedem Unfall-Build;
Node-Schritt in der Python-Pipeline (`npm ci` nötig); MapLibre-Upgrades hängen zusätzlich am
MLT-Decoder; viele Werkzeuge (QGIS, tippecanoe-decode) lesen MLT noch nicht.

## Stand auf `temp/mlt`

- `tools/mlt/`: `mvt-to-mlt.mjs` (Umwandeln + Prüfen, Ausgabe erst nach bestandener Prüfung
  umbenannt), `compare.mjs` (Größen, Viewport, Dekodieren), `lib.mjs` (PMTiles v3 lesen/schreiben).
- Pipeline: `accidents_build.single_mlt_output` in `tiles.yaml`; `unfallkarte accidents mlt`
  wandelt die vorhandene MVT-Datei um, `accidents tiles` hängt den Schritt an. 3 Tests.
- Frontend: `ACCIDENT_SOURCES.accidents_single` → `accidents_single_mlt.pmtiles` mit
  `encoding: "mlt"`; Golden hält jetzt auch `encoding` fest. 54/54 Playwright mit lokaler Datei.

**Vor einem Merge:** `accidents_single_mlt.pmtiles` nach B2 (`unfallkarte deploy`) — sonst findet
die CI die Datei nicht (Deploy bleibt dann aus, live passiert nichts). Die MVT-Datei bleibt einen
Deploy-Zyklus für gecachte alte Seiten; danach als Zwischenstand nach `raw/` verlegen, damit sie
nicht dauerhaft mit hochgeht (noch nicht umgesetzt).

## Nächste Schritte (zurückgestellt, siehe TODO.md)

1. **1b — ganzes Archiv konvertieren** (A→MLT, int32, gzip -6, Metadaten übernehmen) und
   dieselbe Analyse wiederholen: Gesamtgröße, Vollständigkeit, Gleichheit mit A.
2. **2 — Browser-Messung** auf `temp/mlt`, nur `accidents_single` umgestellt: Bytes, Zeit bis
   zum ersten Unfallpunkt bei z11 über Berlin, Dekodierzeit im Worker (Performance-Trace).
3. **3 — Pipeline-Integration**, config-getrieben (z. B. `format: mlt` am Output in
   `tiles.yaml`), danach die Cluster-Datei.
4. Optional: **Upstream-Issue bei freestiler** (INT_32-Spalten, gzip-Stufe, Puffer-Option).

Entscheidungsregel aus der Planung: weiter bei ≥ 30 % weniger gzip-Viewport-Bytes in den
Städten. C erfüllt das im fairen Vergleich; A→MLT liegt in der Stichprobe bei 24–30 % — dafür
ohne Frontend-Umbau und mit dem schnellsten Dekodieren. Schritt 1b entscheidet.

## Reproduzieren

Schritt 1b/2 (auf `temp/mlt`): `node tools/mlt/mvt-to-mlt.mjs <mvt> <mlt>` bzw.
`uv --directory pipeline run unfallkarte accidents mlt`, dann
`node tools/mlt/compare.mjs <mvt> <mlt>`; Browser-Messung mit `tools/perf/` wie oben. Der
Stolperstein von Schritt 1 — `@maplibre/mlt` importiert intern ohne Dateiendungen — ist dort mit
einem Resolve-Hook gelöst (`tools/mlt/lib.mjs`), kein Bundler nötig.

Schritt 1 (freestiler) lag nur im Scratchpad jener Sitzung: ein PMTiles-v3-Leser, Dekodieren mit
`@mapbox/vector-tile` bzw. `@maplibre/mlt`, Filtertest mit `@maplibre/maplibre-gl-style-spec`;
freestiler lief aus dem venv von `~/pmtiles-projekt`.
