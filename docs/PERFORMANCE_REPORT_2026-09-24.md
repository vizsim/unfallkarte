# Unfallkarte — Performance-Report: was noch geht, und was wir von OpenTrailMap lernen können

Stand: **2026-09-24** · Repo `vizsim/unfallkarte` @ `50d7fd5` (Vite live, Attribut-Diät und Roundtrip-Diät
deployt) · Vergleich: `osmus/OpenTrailMap` @ `c8e4548` und der Tile-Server dahinter, `osmus/tileservice` @ `d734235`.

> **Nachtrag (2026-09-24):** A1 und A2 sind umgesetzt (`cd492aa`, `f8b055d`) und mit echten
> Daten von B2 nachgemessen: [`PERFORMANCE_PLAN.md`, Stufe 7](PERFORMANCE_PLAN.md). Mobilfunk,
> Baseline → A1 + A2: Legende 5,26 → 2,73 s, erster Punkt 6,08 → 4,18 s, fertig 7,72 → 5,67 s.
> Abweichend vom Labor wirkt A2 nur dort, wo die Latenz bremst (Städtesprung auf schneller
> Leitung −40 %), nicht bei 1,6 Mbit/s über dichten Städten. Offene Punkte: `docs/TODO.md`.

Ergänzt `docs/PERFORMANCE_PLAN.md` und ersetzt ihn nicht. Wo hier eine Zahl steht, ist angegeben, woher
sie kommt: **Labor** (gemessen, synthetische Daten, siehe Anhang A), **Minimaltest** (isoliertes
Experiment), **Code** (aus dem Quelltext abgeleitet) oder **Schätzung**.

---

## 0. Kurzfassung

Der Start ist schon gut optimiert (Vite, schlanke Kacheln, weniger Roundtrips). Die großen Hebel, die
noch übrig sind, liegen **nicht mehr im Bundle**, sondern in der Art, wie die Unfall-Kacheln geladen
werden. Drei Dinge fehlen im bisherigen Plan; alle habe ich im Labor nachgemessen:

1. **Die Unfall-Kacheln warten auf die komplette Basemap.** `accident-points` startet unsichtbar und
   wird erst im `load`-Handler sichtbar geschaltet. MapLibre feuert `load` erst, wenn alle
   Basemap-Kacheln, Glyphen und das Sprite der Startansicht da sind. Unsichtbare Layer fordern keine
   Kacheln an. Die Unfalldaten laden also **nach** der Basemap statt parallel zu ihr. Auch die Legende
   ist bis dahin nicht bedienbar.
   *Fix: eine Zeile (`map.on("load")` → `map.once("style.load")`).*
   **Labor: erster Unfallpunkt −1,7 s, fertige Startansicht −2,1 s, Legende 2,3 s früher bedienbar.**
2. **Chromium lädt Kacheln aus derselben PMTiles-Datei nacheinander statt parallel.** Der HTTP-Cache
   von Chromium lässt je URL nur eine Anfrage gleichzeitig laufen, und das gilt auch für
   Range-Anfragen. Alle Kacheln eines Archivs haben dieselbe URL, also kostet jede Kachel eine volle
   Antwortzeit (TTFB), eine nach der anderen. `pmtiles` umgeht das nur für Chrome/Edge **unter Windows**.
   Betroffen sind Android, macOS, Linux und damit auch die eigene Messumgebung.
   *Fix: ~10 Zeilen (`cache: "no-store"` für alle PMTiles-Anfragen).*
   **Minimaltest: 8 parallele Ranges brauchen 2,45 s statt 0,32 s. Labor: fertige Startansicht −1,6 s.**
3. **Laufzeit (Abschnitt 4): Nach dem Start blockieren zwei Dinge den Hauptthread.** Der Unfallzähler kostet bei 4× CPU-Drossel
   **1,0–1,4 s je Aufruf** in dichten Gegenden und läuft zweimal je Kartenbewegung. Die Cluster-Torten
   erzeugen ein Bild je exakter Zählkombination (synthetischer Extremfall: 872 Bilder, 1,8 s
   Hauptthread). Mit gerundeten Anteilen sind es 68 Bilder und 0,1 s.

**1 + 2 zusammen** bringen die fertige Startansicht im Labor von **9,24 s auf 6,12 s (−3,1 s)** und den
ersten Unfallpunkt von 6,27 s auf 4,6 s. Das sind etwa 15 Zeilen Code.

**Von OpenTrailMap lernen:** Der wertvollste Teil ist nicht die App, sondern **der Tile-Server von OSM US**.
Dort liegt PMTiles in R2, ein Cloudflare Worker liefert daraus einzelne `z/x/y`-Kacheln mit
`Cache-Control` aus, und der Edge-Cache hält sie vor. Im Labor ergibt dieses Muster zusammen mit
Befund 1 den besten ersten Unfallpunkt: **3,67 s**. Die fertige Ansicht ist gleich schnell wie mit
den beiden Mini-Fixes. Es kostet aber neue Infrastruktur und hat ein Anfragelimit (Abschnitt 5, B3).
Kleinere Muster von dort sind Style-Validierung nur in der CI und `fadeDuration: 0`. Einige Muster
aus OpenTrailMap solltest du **nicht** übernehmen: Karte erst bei `window.load` starten,
Feature-IDs in den Kacheln.

**Nicht empfehlenswert (gemessen):** den PMTiles-Kopf früher anstoßen (kein Effekt) und
TileJSON/Glyphen per `preload` vorladen. Das bringt insgesamt nichts, und `style.load` kommt +0,35 s
später, weil die Preloads MapLibre Bandbreite wegnehmen. Zusammen mit A1 ist dadurch auch die Legende
+0,34 s später bedienbar. Details in Abschnitt 7.

### Top-Empfehlungen auf einen Blick

| # | Maßnahme | Nutzen | Aufwand | Risiko | Beleg |
|---|---|---|---|---|---|
| A1 | UI + Permalink bei `style.load` statt `load` verdrahten | **hoch**: −1,7 s erster Punkt, −2,1 s fertig, Legende −2,3 s | S (1 Zeile + Test) | mittel (Init-Reihenfolge; Tests decken ab) | Labor, 3 Serien |
| A2 | PMTiles-Ranges mit `cache: "no-store"` (alle Browser) | **hoch**: −1,6 s fertig; mit A1 zusammen −3,1 s | S (~10–30 Zeilen + Test) | niedrig–mittel (internes Flag bzw. eigene Source) | Minimaltest + Labor |
| D1 | Zähler nur 1× je Bewegung (auf `idle`) | **mittel**: bis −50 % Blockierzeit | S | niedrig | Labor (CPU ×4) |
| D3 | Torten-Bilder quantisieren (5-%-Schritte) | **mittel–hoch** in Cluster-Zooms: −95 % Hauptthread | S | niedrig (Optik) | Labor (synthetisch) |
| B1 | CDN-Cache für `tiles.vizsim.de` (eigene Stufe 1) | **gering beim Start** nach A1+A2 (−0,13 s); **mittel beim Pannen/Zoomen**: jede neue Kachel 170–440 → ~20–90 ms (abgeleitet, nicht gemessen) | S–M | mittel (Purge-Reihenfolge) | Labor + eigene TTFB-Messung |
| C1 | z11-Einzelpunkt-Kacheln begrenzen oder erst ab z12 | **mittel–hoch** in Städten bei z11 | S–M | **inhaltlich** (UX/Zähler) | Labor + Code |
| B3 | ZXY-Kacheln über Worker (Muster OSM US) | **mittel–hoch**: bester erster Punkt (−0,9 s ggü. A1+A2, −0,8 s ggü. A1+A2+B1), Browser-Cache wirkt | M–L | mittel–hoch (neue Infrastruktur, Limits) | Labor |

---

## 1. Ausgangslage

Seit dem Plan vom 20.09. umgesetzt und live: Attribut-Diät (`cadff01`, −40 %/−63 % Dateigröße),
Unfall-Quellen ohne Manifest (`77ec4c9`), `style.json`-Preload (`cacd3f0`), Vite mit ungebündeltem MapLibre
(`12f9e3f`, −0,78 s auf dem Mobilfunkprofil), Lazy-Sources, Perf-Tests in `tests/web/perf.spec.js`.
Offen laut eigenem Plan: CDN-Cache (Stufe 1), Lazy-Chunks, die Größenbremse in `tiles.yaml`.

Wo die Startlast heute liegt (Build `50d7fd5`, gemessen):

| Posten | roh | gzip | Brotli-11 |
|---|---|---|---|
| MapLibre (`maplibre-gl.mjs` + `-shared.mjs`, nicht gebündelt) | 1 073 KB | 288 KB | 240 KB |
| eigenes Bündel `index-*.js` | 109 KB | 36 KB | 32 KB |
| CSS (inkl. MapLibre-CSS) | 100 KB | 15 KB | 12 KB |
| `index.html` | 57 KB | 11 KB | 9 KB |
| Worker + `style.json` | 51 KB | 9 KB | 8 KB |
| **Summe Start** | **1,39 MB** | **357 KB** | **301 KB** |

Im eigenen Bündel (Source-Map-Auswertung, gzip) steckt Folgendes. `pmtiles` + `fflate` kommen auf
7,4 KB, davon ist `fflate` mit 2,2 KB praktisch toter Code. Es ist nur der Fallback ohne
`DecompressionStream`, und unter den Browsern mit Importmaps (für MapLibre ohnehin Pflicht) fehlt die
API nur Firefox 108–112. Die sechs Layer-Definitionsdateien kommen auf ~11 KB, Mapillary, Geocoder und Mobile zusammen
auf ~4,5 KB. **Am Bündel ist kaum noch etwas zu holen:** alle Lazy-Chunk-Ideen zusammen sparen etwa
15 KB gzip, bei 1,6 Mbit/s ≈ 75 ms. Das eigentliche Gewicht sind die Kacheln und die Reihenfolge,
in der sie geladen werden.

---

## 2. Methode

- **Code-Review** des ganzen Startpfads und der Laufzeit-Handler (main.js, js/**, vite.config.js,
  tiles.yaml, tools/perf/*), der `pmtiles`-Quellen (4.5.0) und von OpenTrailMap + `osmus/tileservice`.
- **Bundle-Analyse** per Source-Map über den echten Build.
- **Labor.** Aus meiner Umgebung sind B2, OpenFreeMap und vizsim.de nicht erreichbar. Deshalb habe ich
  die Fremd-Hosts nachgebaut: HTTPS/HTTP2, eigene IPs, Chromium mit `--host-resolver-rules`.
  - Synthetische PMTiles mit **realistischer Struktur**: deutschlandweites Verzeichnis mit
    Blatt-Verzeichnissen, also Kopf → Blatt → Kachel wie im Original.
  - **Kalibrierung**: eine synthetische „Berlin-z12"-Kachel mit 19 148 Punkten und 13 Attributen
    wiegt 195 KB gzip. Die echte wiegt laut PERFORMANCE_PLAN 178 KB.
  - Gedrosselt wie in `tools/perf/measure-start.mjs`: 1,6 Mbit/s, 150 ms RTT, 1400×900.
    B2-Ursprung mit **250 ms TTFB**; selbst gemessen hattet ihr 170–440 ms. Edge-Treffer mit 20 ms.
  - Gemessen wird über **Karten-Ereignisse** (Init-Skript hängt sich an `window.map`), nicht per
    Polling mit `queryRenderedFeatures`.
  - Je Variante 5–7 Läufe, abwechselnde Reihenfolge, Median und Spanne. Die Baseline wurde in drei
    Serien reproduziert: 6,21/6,26/6,27 s bis zum ersten Punkt, 9,25/9,26/9,24 s bis fertig.
- **Was das Labor nicht kann:** echte Kachelgrößen der Startansicht, echte OpenFreeMap-Kacheln,
  Firefox/Safari. Die **absoluten** Zahlen sind Laborzahlen.
  Bei den **Haupteffekten** überlappen sich die Spannen nicht: A1, A2 bis „fertig“, A1+A2 und B3
  beim ersten Punkt. Kleinere Unterschiede unter ~0,3 s liegen im Rauschen und sind im Text so
  markiert. Nachmessen mit echten Daten geht mit eurem `measure-start.mjs` (Abschnitt 9).
- **Einheiten:** KB = 1024 Byte, Werte aus den Werkzeugen gerundet.
- Die „B2“-Attrappe sendet eine `ETag`, echtes B2 nicht. Laut Minimaltest (Befund 2) ändert das an der
  Serialisierung nichts.

---

## 3. Befunde im Detail

### Befund 1 — Die Unfall-Kacheln hängen hinter dem `load`-Event der Basemap

**Code:**
- `js/mapdata/addLayers.js:20` legt `accident-points` mit `visibility: "none"` an. Die Begründung dort:
  keine Kacheln bei leerer Auswahl.
- Sichtbar wird der Layer erst in `updateLayerFilter(false, true)` (`js/utils/permalink.js:54`). Das läuft
  in `setupPermalinkHandling`, und das wiederum im Handler `map.on("load", …)` (`main.js:159`).
- MapLibre feuert `load` erst nach dem ersten vollständigen Rendern. `style.loaded()` verlangt dafür,
  dass jede **benutzte** Quelle alle Kacheln der Ansicht hat, dazu Sprite und Glyphen.
- Unsichtbare Layer machen eine Quelle „unbenutzt“, also fordert MapLibre für sie keine Kacheln an.

**Folge:** Die Kette ist streng seriell:
HTML → JS → `style.load` → **Basemap komplett (TileJSON, Kacheln, Glyphen, Sprite)** → `load` → UI →
Unfall-Layer sichtbar → PMTiles-Blatt → Unfall-Kacheln.
Nebenwirkung: Legende, Popups und Permalink werden erst bei `load` verdrahtet. Bis dahin reagiert die
Karte nicht auf die Legende. Die Suche hängt schon an `style.load` (`main.js:247`).

**Wasserfall im Labor (Baseline, Einzellauf):** `load` kommt bei 5,0 s. Die erste Range-Anfrage für eine
Unfallkachel startet erst bei 5,7 s, obwohl der PMTiles-Kopf seit 2,8 s bereitliegt.

**Fix (A1):**

```js
// main.js:159 — vorher
map.on("load", async () => {
  await ensureModules();
// nachher: dieselbe Verdrahtung, sobald Style + Quellen + Layer stehen
map.once("style.load", async () => {
  await ensureModules();
```

`ensureModules()` wartet bereits auf Quellen und Layer. Nichts in `js/` hängt sonst an `load`, das habe ich
per grep geprüft. `tests/web/helpers.js#openMap` wartet weiter auf `data-app-ready` **und**
`map.loaded()`, bleibt also stabil. Der Golden-Snapshot sollte sich nicht ändern, weil Layer und Filter
dieselben sind.

**Labor (Serie 3, 7 Läufe, Median; Serien 1 und 2 ergeben dieselben Differenzen, siehe Anhang A):**

| | Baseline | A1 | Δ |
|---|---|---|---|
| Legende bedienbar (`data-app-ready`) | 5,07 s | **2,81 s** | −2,3 s |
| erste Unfall-Kachel angefragt | 5,87 s | **3,71 s** | −2,2 s |
| erster Unfallpunkt gerendert | 6,27 s | **4,52 s** | −1,7 s |
| fertige Startansicht (`idle`) | 9,24 s | **7,16 s** | −2,1 s |

Die Spannen überlappen sich in keiner Serie. Beim ersten Punkt liegt die Baseline bei 6,02–6,75 s, A1 bei
4,47–5,10 s. Preis: `load` selbst kommt später, weil es jetzt auch auf die Unfallkacheln wartet, und die
Basemap teilt sich die Bandbreite mit den Unfalldaten. Die Daten kommen zuerst, und das ist gewollt.

**Test (deterministisch, passt zu `perf.spec.js`):** OpenFreeMap-Kacheln per `page.route` 5 s verzögern.
Innerhalb dieser 5 s müssen (a) `data-app-ready` gesetzt sein und (b) mindestens eine
`accidents_single`-Range-Anfrage außer dem Kopf (`Range` ≠ `bytes=0-16383`) laufen. Das Blatt-Verzeichnis
kann innerhalb der ersten 16 KiB liegen (im Labor `bytes=3739-8738`). Die Bedingung darf deshalb nicht
auf Offsets ≥ 16384 prüfen.

### Befund 2 — Chromium serialisiert Range-Anfragen auf dieselbe PMTiles-URL

**Minimaltest** (Chromium 141, HTTPS/HTTP2): 8 gleichzeitige `fetch` mit verschiedenen `Range`-Headern
auf dieselbe URL, Server-TTFB 300 ms. Code in Anhang B.

| Antwort-Header vom Server | `cache` im Request | fertig nach … ms |
|---|---|---|
| keine (wie B2 heute) | default | 332, 627, 931, 1235, 1540, 1845, 2149, 2454 |
| keine | `no-store` | 314 … 325 (alle parallel) |
| `ETag` | default | 309, 613, 917 … 2440 |
| `Cache-Control: public, max-age=3600` + `ETag` | default | 312, 622, 926 … 2448 |
| `Cache-Control: no-store` | default | 309, 615, 918 … 2438 |

Das ist der Cache-Lock von Chromium. Das Design-Dokument dazu sagt: *„a single writer - multiple reader
lock so that only one network request for the same resource is in flight at any given time"*. Für
Ranges gilt er genauso. **Keiner der vier getesteten Antwort-Header hebt ihn auf**, nur
`cache: "no-store"` im Request.

**`pmtiles` setzt `no-store` bereits, aber aus anderem Grund und nur unter Windows:** seit js 3.1.0
(Commit `ce959e5`, „Chrome windows cache workaround“, Verweis auf crbug 40542704). Anlass waren
fehlerhafte Cache-Treffer bei Range-Antworten unter Windows, nicht die Serialisierung.
`FetchSource` schaltet deshalb **nur bei Windows + Chromium** auf `no-store`
(`node_modules/pmtiles/src/index.ts:371`, gesetzt in Zeile 415). Die Serialisierung, die ich gemessen
habe, tritt unabhängig davon auf allen Plattformen auf. Überall außer Windows läuft der Standardpfad:
- Chrome auf Android
- Samsung Internet
- Chrome/Edge auf macOS und Linux
- **eure eigene Playwright-Messung** (Chromium unter Linux)

**Wasserfall im Labor (Baseline, Einzellauf):** Alle 12 Unfallkacheln der Startansicht werden bei
5,73 s angefragt. Fertig werden sie aber nacheinander: 6,09 · 6,33 · 6,61 · … · 8,88 s. Die Abstände
schwanken zwischen 0,07 und 0,38 s und liegen im Mittel bei 0,25 s, also im Takt der Ursprungs-TTFB.
Mit `no-store` sind alle zwischen 6,49 und 7,16 s da.

**Folge im Betrieb:** Die Serialisierung kostet **bis zu** (Kacheln in der Ansicht − 1) × TTFB. Bei B2
ohne Cache (170–440 ms) und 10–12 Kacheln sind das rechnerisch 1,5–4,8 s, und zwar bei jeder neuen
Ansicht, nicht nur beim Start. Real ist es weniger, weil sich die Übertragung teilweise überlappt: Im
Labor sagt die Formel bei 250 ms 2,75 s voraus, gemessen waren 1,6–1,7 s. Das trifft auch die
Kontext-Layer aus der Registry, weil jede davon ebenfalls eine PMTiles-Datei ist.

**Fix (A2)**, schnelle Variante für den A/B-Test:

```js
// js/lib/pmtilesProtocol.js (neu)
import { Protocol, PMTiles, FetchSource } from "pmtiles";

// Chromium hält je URL nur EINE Anfrage im Flug (HTTP-Cache-Lock) — auch für Range-Anfragen.
// Alle Kacheln eines Archivs teilen sich die URL und liefen sonst nacheinander.
// pmtiles umgeht das selbst nur für Chromium unter Windows; hier für alle Browser.
class ParallelFetchSource extends FetchSource {
  constructor(url) { super(url); this.chromeWindowsNoCache = true; }   // internes Flag -> cache:"no-store"
}

export function createPMTilesProtocol() {
  const protocol = new Protocol();
  const get = protocol.tiles.get.bind(protocol.tiles);
  protocol.tiles.get = (url) => {
    if (!protocol.tiles.has(url)) protocol.add(new PMTiles(new ParallelFetchSource(url)));
    return get(url);
  };
  return protocol;   // main.js: addProtocol("pmtiles", createPMTilesProtocol().tile)
}
```

Die haltbare Variante nutzt kein internes Flag. Stattdessen implementierst du das öffentliche
`Source`-Interface selbst (`getKey`, `getBytes(offset, length, signal, etag)`), etwa 30 Zeilen,
abgeschrieben von `FetchSource`. Dazu gehört ein Test, der die Parallelität festhält: Range-Anfragen per
`page.route` 1 s verzögern und prüfen, dass mindestens zwei gleichzeitig in Flug sind. Der Test fängt
auch ein künftiges `pmtiles`-Update, das das Verhalten ändert. Und es lohnt ein Issue bei
protomaps/PMTiles, den Workaround auf alle Chromium-Plattformen auszudehnen oder konfigurierbar zu
machen.

**Preis:** Range-Antworten landen nicht mehr im Browser-Cache. Heute passiert das ohnehin nicht, weil B2
weder `Cache-Control` noch `ETag` noch `Last-Modified` sendet, und für Windows-Chrome war es schon immer
so. Innerhalb einer Sitzung hält MapLibre die Kacheln selbst im Speicher.
Hinweis: Im Labor galt `no-store` nur für die zwei Unfall-Archive. Der Snippet oben wirkt global,
also auch für die Kontext-Layer.

**Labor:**

| | Baseline | A2 | A1 | **A1 + A2** |
|---|---|---|---|---|
| erster Unfallpunkt | 6,27 s | 6,46 s | 4,52 s | **4,63 s** (Serie 4: 4,56) |
| alle Unfall-Kacheln da | 9,23 s | 7,59 s | 7,15 s | **5,69 s** (5,45) |
| fertige Startansicht | 9,24 s | 7,61 s | 7,16 s | **6,12 s** (5,85) |

Beim **ersten** Punkt ändert A2 allein nichts Messbares: 6,46 gegen 6,27 s, die Spannen überlappen.
Tendenziell kommt er eher etwas später, weil sich parallel alle Kacheln die Bandbreite teilen, während
seriell die erste sie allein bekam. Das **Ende** kommt 1,6 s früher, und mit A1 zusammen passt beides.

### Befund 3 — Ursprungs-TTFB, ohne jeden Cache (bekannt, eigene Stufe 1)

Das steht so schon in eurem Plan: `cf-cache-status: DYNAMIC`, keine Cache-Header von B2, TTFB 170–440 ms.
Neu ist Folgendes:

- **Die Bedeutung verschiebt sich.** Solange Befund 2 besteht, multipliziert sich die TTFB mit der Zahl
  der Kacheln. Nach A2 zahlt man sie je Ebene der Kette (Kopf → Blatt → Kachel) nur einmal. Im Labor
  bringt ein Edge-Treffer (20 statt 250 ms) nach A1+A2 beim Start nur noch **−0,13 s** für den ersten
  Punkt. Bei der fertigen Ansicht liegt der Unterschied im Rauschen (6,10 gegen 5,85 s, die Spannen
  überlappen). Ohne A2 sind es −0,5 bis −0,8 s bis zur fertigen Ansicht. Beim Pannen und Zoomen zahlt
  man die TTFB aber für **jede neue Kachel und jedes neue Blatt-Verzeichnis**. Dort bleibt der
  CDN-Cache wertvoll. Das ist aus den TTFB-Zahlen abgeleitet, nicht im Labor gemessen.
- **Die Browser-TTL aus eurer Stufe 1 wirkt für Chrome/Edge unter Windows nicht** (`no-store`, s. o.),
  und nach A2 für niemanden. Der Nutzen liegt im **Edge**-Cache, nicht im Browser-Cache.
- **Neu bei Cloudflare (02.09.2026): „Origin Range Requests“** in Cache Rules. Bei einem kalten Cache
  holt Cloudflare dann nicht mehr die ganze Datei vom Ursprung, sondern 1-MiB-Blöcke. Ohne diese
  Einstellung lässt Cloudflare den `Range`-Header beim ersten Miss weg und zieht die komplette
  92-MB-Datei. Die Plan-Verfügbarkeit ist nicht dokumentiert, also im Dashboard prüfen.
  **Achtung:** Blockweises Caching macht den Purge nach einem Deploy **noch** wichtiger, weil sonst alte
  und neue Blöcke gemischt ausgeliefert werden. Das ist genau die Falle, die euer Plan beschreibt.
- `.pmtiles` steht nicht auf der Liste der Standard-Endungen, die Cloudflare cacht. Eine Cache Rule ist
  also Pflicht. Grenze auf Free/Pro/Business: 512 MB je Datei, `accidents_single.pmtiles` (92 MB) passt.

---

## 4. Laufzeit nach dem Start (Hauptthread)

Gemessen im Labor mit **4× CPU-Drossel**, das entspricht grob einem Mittelklasse-Handy.
Desktop-CPUs sind etwa 4× schneller.

| Situation | Hauptthread-Kosten | Quelle |
|---|---|---|
| Unfallzähler, Startansicht (9 693 Punkte) | 2 × ~160 ms | `featureCounter.js:29` |
| Unfallzähler, dicht, z12 (58 792 Punkte) | 1 048 ms (der `moveend`-Aufruf fand noch 0) | |
| Unfallzähler, dicht, z11.5 (70–76 Tsd.) | **966 + 1 366 ms** je Zoomschritt | `main.js:240–241` |
| Filterwechsel (ein Jahr ab), dicht, z11.5 | 2 560 ms bis `idle` (Worker legt alle Kacheln neu aus) + danach Zähler | |
| Cluster-Torten z10→z9→z8 | 872 Bilder, **1 767 ms** (2,0 ms/Bild) | `generatePieIcon.js` |
| … mit quantisierten Torten (D3) | **68 Bilder, 97 ms**; `idle` je Ansicht −0,9 bis −1,4 s (Einzelläufe, grob) | |

- **D1 — Zähler nur einmal je Bewegung.** Heute läuft `recount()` auf `moveend` **und** auf dem folgenden
  `idle`. Beim Zoomen zählt der `moveend`-Aufruf noch die alten Kacheln, hier für 966 ms, ein reiner
  Verlust. Vorschlag: nur auf `idle` zählen, per `requestIdleCallback` (Fallback `setTimeout`) anstoßen
  und bei `movestart` verwerfen.
  Das spart je nach Situation 0–50 % der Arbeit: in der Startansicht 50 %, dicht bei z11.5 41 %,
  dicht bei z12 0 %, weil der `moveend`-Aufruf dort noch nichts fand. Es **beseitigt aber nicht die
  lange Task** (~1 s @CPU×4).
  `querySourceFeatures` statt `queryRenderedFeatures` habe ich gemessen: nur −30 % und mehr
  Komplexität (Duplikate an Kachelrändern, eigener Viewport-Test). Das lohnt nicht.
- **D2 — Zähler im Web Worker.** Der Protokoll-Handler (Hauptthread) sieht jede Kachel ohnehin. Eine
  Kopie der Bytes geht an einen Zähl-Worker. Der dekodiert das MVT (`@mapbox/vector-tile` + `pbf`, ~10 KB)
  und hält je Kachel kompakte Arrays aus Koordinaten und Attributcodes. Auf `idle` schickt die App
  Ausschnitt und Auswahl, der Worker zählt in wenigen Millisekunden. **Das beseitigt die lange Task
  vollständig.** Es ist aber ein eigenes kleines Projekt, und die Filterlogik existiert dann zweimal
  (Test gegen `queryRenderedFeatures` als Referenz).
- **D3 — Torten quantisieren.** Heute entsteht je exakter Kombination `pie-k1-k2-k3` ein eigenes
  Canvas-Bild, bis 128×128 px bzw. 64 KB RGBA. Jedes davon wird gezeichnet, per `addImage` registriert,
  an die Worker kopiert und in den Icon-Atlas jeder Kachel gepackt. Mit Anteilen in 5-%-Schritten und
  drei Größenklassen gibt es höchstens 3 × 231 = 693 Bilder, die über Kacheln und Zoomstufen hinweg
  wiederverwendet werden. Die Größe skaliert weiter über `icon-size`.
  Ausdruck für `icon-image` (Layer und `hover-pie`). Gerundet wird **kumulativ**, damit a + b + c = 20
  garantiert ist:

  ```js
  const K = (n) => ["to-number", ["get", `UKATEGORIE__${n}`]];
  const T = ["max", ["+", K(1), K(2), K(3)], 1];
  const A = ["round", ["*", 20, ["/", K(1), T]]];                          // Anteil Getötete
  const AB = ["round", ["*", 20, ["/", ["+", K(1), K(2)], T]]];            // + Schwerverletzte
  const PIE_ID = ["concat", "pieq-", ["to-string", A], "-", ["to-string", ["-", AB, A]], "-",
    ["to-string", ["case", [">", T, 100], 2, [">", T, 10], 1, 0]]];
  // Resolver: "pieq-a-b-s" -> k1=a, k2=b, k3=20-a-b, Größe [32,48,64][s]
  ```

  Im Labor lief eine einfachere Variante, bei der beide Anteile getrennt gerundet wurden (dort sind in
  seltenen Fällen a + b = 21 möglich, also bis 753 Bilder). An der Messung ändert das nichts.
  Die synthetischen Clusterzahlen sind der ungünstigste Fall, fast jede Kombination ist einzigartig.
  Mit echten Daten mit einem Zähler im Resolver nachmessen (Abschnitt 9). Im Popup stehen weiter die
  exakten Zahlen.

---

## 5. Maßnahmenkatalog mit Bewertung

**Skalen.** *Nutzen*: hoch (≥ 1 s auf dem Mobilfunkprofil oder eine spürbare Blockade weg) · mittel
(0,2–1 s) · gering (< 0,2 s). *Aufwand*: S ≤ 2 h · M ≤ 1 Tag · L mehrere Tage. *Risiko*: was kaputtgehen
kann und wie man es merkt. *Beleg*: Labor / Minimaltest / Code / Schätzung.

### A — Kritischer Pfad beim Start

| ID | Maßnahme | Nutzen | Aufwand | Risiko | Abhängig von | Beleg |
|---|---|---|---|---|---|---|
| **A1** | UI/Permalink bei `style.load` verdrahten | **hoch** — erster Punkt −1,7 s, fertig −2,1 s, Legende −2,3 s | S | mittel: Init-Reihenfolge; Golden-, Permalink-, Smoke- und Mobile-Tests decken sie ab, dazu ein neuer Test | — | Labor, 3 Serien |
| **A2** | `cache: "no-store"` für alle PMTiles-Ranges | **hoch** — fertig −1,6 s, mit A1 −3,1 s; wirkt bei jeder neuen Ansicht | S | niedrig–mittel: internes `pmtiles`-Flag (besser eigene `Source`); kein Browser-Cache für Ranges (heute ohnehin keiner) | — | Minimaltest + Labor |
| A5 | `validateStyle: false` in Produktion, Style-Validierung in der CI (OTM-Muster) | gering (ms-Bereich, nicht gemessen) | S | niedrig, **nur** zusammen mit CI-Validierung | Golden-Test | Code |
| A6 | `fadeDuration: 0` (OTM-Muster) | gering: im Labor kein Ladezeit-Effekt (9,23 vs. 9,25 s); weniger Frames beim Zoomen | S | niedrig; Torten/Labels „ploppen“ statt einzublenden | — | Labor |
| A7 | Mapillary-TS-Layer mit `visibility: "none"` anlegen (`addLayers.js:252`) | gering: verhindert Mapillary-Anfragen, wenn ein Link direkt auf z ≥ 14 zeigt | S | niedrig | — | Code |

### B — Kachel-Auslieferung

| ID | Maßnahme | Nutzen | Aufwand | Risiko | Abhängig von | Beleg |
|---|---|---|---|---|---|---|
| **B1** | Cache Rule für `tiles.vizsim.de` + Purge in `deploy.py`, optional „Origin Range Requests“ | Start: gering nach A1+A2 (−0,13 s erster Punkt), mittel ohne A2 (−0,5 bis −0,8 s bis fertig); Pannen/Zoomen: **jede** neue Kachel 170–440 → ~20–90 ms (abgeleitet) | S–M | mittel: Purge-Reihenfolge, sonst gemischte Ranges = kaputte Kacheln; mit 1-MiB-Blöcken noch wichtiger | — | Labor + eigene TTFB-Messung |
| B2 | Unveränderliche Dateinamen (Version/Hash im Pfad) statt Purge, `Cache-Control: immutable` | mittel: kein Mischzustand, kein Purge-Token, Edge-Cache darf ewig halten | M | mittel: bricht den „stabile Dateinamen"-Vertrag; die Version muss ins Frontend (zur Bauzeit per Vite oder übers Manifest, das kostet wieder einen Roundtrip) | B1 | Code |
| **B3** | ZXY-Kacheln über Cloudflare Worker (OSM-US-Tileservice) | **mittel–hoch**: erster Punkt 3,67 s (−0,9 s ggü. A1+A2, −0,8 s ggü. A1+A2+B1), Browser-Cache wirkt für alle, Kacheln laufen nicht mehr durch den Hauptthread; `pmtiles` (−7,4 KB) fällt nur weg, wenn **alle** Quellen, also auch die Registry-Layer, auf ZXY umziehen | M–L | mittel–hoch: neue Infrastruktur; **Free: 100 000 Anfragen/Tag, Cache-Treffer zählen mit**; darüber bleiben die Unfallkacheln aus; Paid 5 $/Monat für 10 Mio. | ersetzt A2 für die Unfälle, B1 für ZXY | Labor |
| B4 | Brotli + `immutable` für die App (Cloudflare vor vizsim.de oder Hosting auf Cloudflare) | gering–mittel: −21 KB (Brotli-5) bis −56 KB (Brotli-11), ≈ 0,1–0,3 s; Wiederbesuche ohne Revalidierung | M | mittel: Pages-Zertifikat hinter dem Proxy bzw. Umbau des Deploys | — | Messung (Größen) |

**B3 im Detail**, denn das ist das Muster von OpenTrailMap:

- `osmus/tileservice/cloudflare/src/index.ts` (~440 Zeilen inkl. Glyphen, Feeds und Ratenlimits;
  Hono + `pmtiles`) liest PMTiles aus R2
  und beantwortet `/<tileset>/<z>/<x>/<y>.mvt` und `/<tileset>.json` (TileJSON).
- Kopf und Verzeichnisse hält der Worker im Speicher (`ResolvedValueCache(25)`). Antworten landen mit
  `Cache-Control: public, max-age=86400` im Edge-Cache (`caches.default`).
- Beim Lesen aus R2 prüft der Worker die ETag (`onlyIf: { etagMatches }`). Wird ein Archiv ersetzt,
  merkt er das und lädt den Kopf neu. **Es gibt keine gemischten Ranges**, weil jede Kachel für sich
  konsistent ist; höchstens sieht jemand einen Tag lang teils alte, teils neue Kacheln.
- Außerdem: Ratenlimits je IP und je Origin, 404 werden 5 min gecacht, Glyphen 7 Tage.
- Frontend: `{ type: "vector", tiles: ["https://tiles.vizsim.de/unfall/accidents_single/{z}/{x}/{y}.mvt"],
  minzoom: 11, maxzoom: 13, bounds: […] }`. Die Werte direkt einzutragen spart den TileJSON-Roundtrip.
  Sie sind ohnehin Vertrag, genau wie heute `ACCIDENT_SOURCES`.
- Local-first bleibt: in der Entwicklung weiter `pmtiles://./data/…`.
- Datenquelle: R2 als Binding (schnell; Free: 10 GB, Ausgang kostenlos) mit einer Kopie in `deploy.py`.
  Oder B2 per `fetch` mit `Range` aus dem Worker; der Weg B2 → Cloudflare kostet keinen Ausgang.
- **Ohne Worker** ginge ZXY auch statisch: `tippecanoe -e` bzw. `tile-join -e` schreibt ein
  `z/x/y`-Verzeichnis, das nach B2 kommt, dazu eine Cache Rule. (`pmtiles extract` taugt dafür nicht,
  es schneidet nur ein kleineres Archiv aus.) Das heißt ~50 000 Dateien allein für die Unfälle und
  `Content-Encoding: gzip` als Datei-Metadatum setzen, dafür kein Limit und kein Code. Machbar, aber
  sperrig.

### C — Kachel-Nutzlast (Pipeline)

| ID | Maßnahme | Nutzen | Aufwand | Risiko | Beleg |
|---|---|---|---|---|---|
| **C1** | Einzelpunkt-Kacheln bei z11 begrenzen oder Einzelpunkte erst ab z12 zeigen (Cluster bis z11,99) | mittel–hoch in Städten bei z11: Download, Filterwechsel (2,6 s @CPU×4) und Zähler (1–1,4 s) hängen an der Punktzahl | S–M | **inhaltlich**: z11 zeigt dann Cluster bzw. nicht mehr alle Punkte; die z11-Schwelle steckt in Legende, Zähler und Zoom-Hinweisen | Labor + Code |
| C2 | `Ist*`-Flags als EINE Bitmaske bzw. Nullen weglassen | gering: −5,4 % bzw. −2,9 % gzip (roh −26 % / −23 %) | M | mittel: Filter, Popup, Zähler, Vertragstest | Labor (Kalibrier-Kachel) |
| C3 | Kacheln mit zopfli nachkomprimieren (gzip-kompatibel) | gering: −6,3 % je Kachel | S–M (Nachlauf über das Archiv) | niedrig; Build-Zeit steigt | Labor |
| — | ~~Feature-IDs (`-ai`) für feature-state~~ (OTM-Muster) | **negativ: +24 % Kachelgröße** | — | — | Labor |

Zu C1: `accidents_single` hat `no_feature_limit` und `no_tile_size_limit`, **auch für z11**
(`tiles.yaml:23`). Euer Plan hat die größte Kachel bei **z12** gemessen (178 KB). z11 fasst die Fläche
von vier z12-Kacheln. Im Labor wiegt die größte z11-Kachel (Berlin-Südost, 50 880 Punkte) 511 KB,
bei 1,6 Mbit/s ≈ 2,6 s. Eine z11-Kachel über Berlin-Mitte dürfte deutlich schwerer sein. **Erst
messen** (`pmtiles`/`tippecanoe-decode` auf die größten z11-Kacheln), dann entscheiden. Günstigste
Variante ohne Datenverlust: ein Byte-Budget **nur** für z11 mit eigenem tippecanoe-Lauf und
`tile-join`, und im Zähler bei z11 „≥“ anzeigen.

### D — Laufzeit

| ID | Maßnahme | Nutzen | Aufwand | Risiko | Beleg |
|---|---|---|---|---|---|
| **D1** | Zähler nur auf `idle`, per `requestIdleCallback`, Abbruch bei `movestart` | mittel: bis −50 % Blockierzeit je Bewegung | S | niedrig | Labor |
| D2 | Zähler im Web Worker (Kachel-Kopie aus dem Protokoll-Handler) | **hoch**: lange Task (~1 s @CPU×4) entfällt | L | mittel: Filterlogik doppelt; bei B3 eigener Abruf | Labor + Schätzung |
| **D3** | Torten-Bilder quantisieren | mittel–hoch in Cluster-Zooms: −95 % Hauptthread, `idle` −0,9 bis −1,4 s je Ansicht (Einzelläufe) | S | niedrig (Anteile auf 5 % gerundet) | Labor (synthetisch) |

### E — Bündel und Assets

| ID | Maßnahme | Nutzen | Aufwand | Risiko |
|---|---|---|---|---|
| E1 | Lazy-Chunks für Registry-Definitionen (eigene Stufe 5) | gering: ~11 KB gzip ≈ 55 ms | M | niedrig; Golden bleibt Referenz |
| E2 | `fflate` per Vite-Alias stilllegen | gering: −2,2 KB | S | niedrig: ohne `DecompressionStream` wären nur Firefox 108–112 (hat Importmaps, aber die API nicht) |
| E3 | `chart.js` gezielt registrieren statt `chart.js/auto` | gering: Lazy-Chunk 68 KB gzip, grob halbierbar (Schätzung); nur beim Diagramm | S | niedrig |
| E4 | Thumbnails als WebP in Anzeigegröße (heute 360 KB PNG) | gering–mittel, nur beim Öffnen des Panels (mobil spürbar) | S | niedrig |

---

## 6. OpenTrailMap und der OSM-US-Tileservice: was übertragbar ist

| Muster | Wie OpenTrailMap / OSM US es macht | Stand Unfallkarte | Empfehlung |
|---|---|---|---|
| **Kacheln als ZXY vom Edge** | PMTiles in R2 → Worker → `z/x/y` + TileJSON, `max-age=86400`, `caches.default`, ETag-Prüfung gegen R2 | PMTiles-Ranges direkt aus B2, kein Cache | **B3** als Zielbild; kurzfristig A2 + B1 |
| Cache-Policy je Ressourcentyp | Kacheln/TileJSON 1 Tag, Glyphen 7 Tage, 404 5 min, 429 nie | B2 sendet nichts | bei B1/B3 übernehmen |
| Unbenutzte Attribute raus | tileservice-PR #176 „Remove unused attributes and layers from trails tileset“ | ✓ erledigt (`cadff01`) | — |
| Schwere Overlays erst ab Zoomstufe | Trails erst ab z10, darunter „Zoom in to see trail data“; `min_size: 1` | Cluster < z11, Einzelpunkte ≥ z11 | z11 nachschärfen: **C1** |
| Style als Code, im Bündel | `style/*.js` → `setStyle(…)`; `dist/style.json` wird für Dritte erzeugt | `public/style.json` + Preload (ein Request, parallel) | kein Gewinn mehr; nur für Wartbarkeit |
| Validierung in der CI statt zur Laufzeit | `scripts/validateStyles.js` prüft alle Permutationen; `validate: import.meta.env.DEV` | MapLibre validiert zur Laufzeit; Golden-Snapshot existiert | **A5** (klein) |
| `fadeDuration: 0` | gesetzt | Standard (300 ms) | A6, optional |
| feature-state statt `setData`/`setFilter` für Hover/Auswahl | über Planetiler-Feature-IDs | Hover-Torte per GeoJSON-`setData` (1 Feature, billig) | **nicht** übernehmen: IDs kosten +24 % Kachelgröße; `icon-size` kann kein feature-state |
| Unsichtbarer Hit-Layer | 16 px breite transparente Linie für Klicks auf dünne Trails | Punkte/Flächen, nicht nötig | — |
| SDF-Sprites (`spreet`) | Icons einfarbig, per `icon-color` eingefärbt | `home_blue/green/red…` als eigene Icons | kosmetisch, kein Perf-Hebel |
| Planetiler für OSM-Layer | ein Lauf über die PBF, YAML-Schema | osmium + pyogrio + tippecanoe | nur Bauzeit; kein Nutzen im Browser |
| **Nicht übernehmen** | `initMap()` erst bei `window.load` (wartet auf alles, auch Analytics); Webfonts als OTF statt woff2 (5 Schnitte à ~70 KB) | startet sofort; A1 macht es noch früher | — |

---

## 7. Gemessen und verworfen

| Idee | Ergebnis im Labor | Warum |
|---|---|---|
| PMTiles-Kopf bei t0 anstoßen (`protocol.add(p); p.getHeader()`) | kein Effekt (erster Punkt 4,76 vs. 4,55 s, Spannen überlappen) | `main.js` läuft erst, wenn MapLibre geladen ist, also kurz vor `style.load`. Der Kopf ist mit 2,8 s ohnehin vor dem Bedarf da. |
| TileJSON + Glyphen `0-255` per `<link rel="preload">` | **bringt nichts, verschiebt aber den Start**: allein ohne Gesamtgewinn (erster Punkt 6,17 vs. 6,21 s, fertig 9,15 vs. 9,25 s), aber `style.load` 2,34 → 2,69 s. In der Kombination „A1 + Preloads + fade 0 + Kopf früh" ist die Legende +0,34 s später bedienbar (3,14 vs. 2,80 s). Der erste Punkt (5,38 vs. 4,55 s) liegt im Rauschen, die Spannen überlappen | 70 KB Glyphen konkurrieren bei 1,6 Mbit/s mit MapLibre um Bandbreite |
| nur TileJSON vorladen | kein Effekt (4,99 vs. 4,54 s, Spannen überlappen) | 1 Roundtrip auf einem Pfad, der nicht mehr kritisch ist |
| `fadeDuration: 0` als Ladezeit-Hebel | kein Effekt | beeinflusst nur Einblend-Frames |
| `querySourceFeatures` statt `queryRenderedFeatures` im Zähler | nur −30 % | Duplikate an Kachelrändern, eigener Viewport-Test; D1/D2 sind besser |
| Feature-IDs für feature-state | +24 % Kachelgröße | siehe Abschnitt 6 |

---

## 8. Reihenfolge

| Schritt | Inhalt | Aufwand | Erwartung (Labor, Mobilfunkprofil) |
|---|---|---|---|
| **1 — sofort** | **A1 + A2** + je ein deterministischer Test; mit `measure-start.mjs` gegen die echten Daten A/B messen | ½ Tag | fertige Startansicht −3,1 s, erster Punkt −1,6 s, Legende −2,3 s |
| **2** | **D1 + D3** (Laufzeit), dazu A7 | ½ Tag | Cluster-Zooms −0,9 bis −1,4 s je Ansicht @CPU×4; Zähler-Arbeit bis −50 % |
| **3** | **B1** (eure Stufe 1) mit Purge; Entscheidung, ob B2 (Versionen) statt Purge | ½–1 Tag | Pannen/Zoomen: TTFB je neue Kachel −150 bis −400 ms |
| **4** | **C1** messen und inhaltlich entscheiden (z11) | ½ Tag | Städte bei z11: MB-weise weniger, Filterwechsel und Zähler schneller |
| **5 — Zielbild** | **B3** Worker/ZXY, wenn Kosten und Limits passen | 1–3 Tage | erster Punkt weitere −0,8 s (nach Schritt 1 + 3); Browser-Cache wirkt für alle |
| später | D2 (Zähler im Worker), B4 (Brotli/`immutable`), E1–E4, C3 | je S–L | je gering bis mittel |

Warum diese Reihenfolge: A1 und A2 sind die größten Effekte bei kleinstem Aufwand. Sie ändern weder
Infrastruktur noch Datenvertrag und sind einzeln revertierbar. B1 lohnt danach vor allem fürs Pannen
und Zoomen. B3 ist das sauberste Zielbild, aber das einzige mit Betriebskosten und neuen Ausfallarten.

---

## 9. Nachmessen mit echten Daten

- **A/B mit euren Skripten:** `tools/perf/pages-like-server.mjs` für zwei `dist/`-Stände, dann
  `node tools/perf/measure-start.mjs http://127.0.0.2:4300/ http://127.0.0.2:4301/ 7 mobil`.
  A1 und A2 bitte **einzeln** und zusammen messen. Die Größe des Effekts hängt von der echten Ladezeit
  der Basemap (A1) und der echten B2-TTFB (A2) ab.
- **Zeitachse ohne Polling:** Ein Init-Skript, das `window.map` per `Object.defineProperty`-Setter
  abfängt, sieht `style.load`, `load` und das erste `data`-Ereignis mit `sourceId === "accidents_single"`
  und `e.tile`. Das ist genauer als `queryRenderedFeatures` im 50-ms-Takt und kostet nichts. Vorlage
  auf Wunsch.
- **Torten mit echten Clustern:** In `setMissingStyleImageResolver` einen Zähler für verschiedene IDs
  mitlaufen lassen und z8 → z10 über Berlin, das Ruhrgebiet und München zoomen. Das zeigt, wie viele
  Bilder es real sind.
- **Größte z11-Kacheln:** mit `pmtiles show`/`tippecanoe-decode` oder dem Python-Reader alle z11-Einträge
  nach Länge sortieren.
- **Firefox/Safari:** Die Serialisierung aus Befund 2 ist in Chromium nachgewiesen. Firefox und
  WebKit habe ich nicht getestet; `no-store` schadet dort nicht.

---

## Anhang A — Laboraufbau

- **Daten** (Python, `pmtiles`-Writer, eigener MVT-Encoder):
  - `accidents_single.pmtiles`: z11–13 mit 42 614 Einträgen deutschlandweit, Wurzel 82 B, Blätter 32,8 KB.
  - Echte Dichte nur rund um die Startansicht (128 777 Punkte): Berlin-Gauß plus Orte,
    Attributverteilungen nach Unfallatlas-Größenordnungen.
  - Startansicht: 12 z12-Kacheln, zusammen 184 KB gzip (5–46 KB je Kachel).
  - `combined_cluster.pmtiles`: z6–11, Zufallszählungen (ungünstigster Fall für Torten).
  - Basemap: OpenMapTiles-artige z11–13-Kacheln, im Mittel 20 KB gzip; Glyphen `0-255` 70 KB.
- **Hosts:** Node-HTTP2/TLS auf eigenen Loopback-IPs, dazu Chromium 141 mit
  `--host-resolver-rules` und `--ignore-certificate-errors`.
  - „B2“: Range-Auslieferung mit 250 ms TTFB, ohne `Cache-Control`.
  - `/cdn/…`: dieselben Dateien mit 20 ms TTFB (Edge-Treffer).
  - `/zxy/…`: Kacheln serverseitig aus dem Archiv, 20 ms, `Content-Encoding: gzip`, also wie ein Worker.
- **Drosselung** per CDP `Network.emulateNetworkConditions` (1,6 Mbit/s / 150 ms). Geprüft: Sie gilt auch
  für Anfragen aus Web Workern (500 KB ≈ 2,7 s im Worker wie im Hauptthread).
- **Varianten:** je ein Git-Worktree mit Minimal-Patch, `vite build`, ausgeliefert über euren
  `pages-like-server.mjs` (gzip, `max-age=600`, 127.0.0.2).

**Alle Serien (Median, 7 Läufe; Serie 4: 5 Läufe):**

| Variante | erster Punkt | alle Unfall-Kacheln | fertig (`idle`) | Legende bedienbar |
|---|---|---|---|---|
| Baseline (`50d7fd5`) | 6,21 / 6,26 / 6,27 s | 9,25 / 9,25 / 9,23 s | 9,25 / 9,26 / 9,24 s | 5,05 / 5,08 / 5,07 s |
| A1 | 4,55 / 4,54 / 4,52 s | 7,14 / 7,14 / 7,15 s | 7,16 / 7,16 / 7,16 s | 2,80 / 2,80 / 2,81 s |
| A2 | 6,46 s | 7,59 s | 7,61 s | 5,05 s |
| A1 + A2 | 4,63 / 4,56 s | 5,69 / 5,45 s | 6,12 / 5,85 s | 2,80 / 2,77 s |
| A1 + B1 (Edge, ohne A2) | 4,64 / 4,77 s | 6,35 / 6,48 s | 6,37 / 6,63 s | 2,77 / 2,79 s |
| A1 + A2 + B1 | 4,43 s | 5,53 s | 6,10 s | 2,78 s |
| B3 (ZXY) allein | 5,81 s | 6,47 s | 6,48 s | 4,97 s |
| **A1 + B3** | **3,67 / 3,67 / 3,67 s** | 5,53 / 5,57 / 5,32 s | 6,06 / 6,12 / 5,84 s | 2,77 / 2,78 / 2,78 s |
| A1 + Kopf früh | 4,76 s | 7,13 s | 7,13 s | 2,80 s |
| Preload TileJSON + Glyphen | 6,17 s | 9,14 s | 9,15 s | 4,96 s |
| A1 + nur TileJSON-Preload | 4,99 s | 7,21 s | 7,22 s | 2,81 s |
| `fadeDuration: 0` | 6,29 s | 9,22 s | 9,23 s | 5,14 s |
| A1 + Preloads + fade 0 + Kopf früh | 5,38 s | 7,47 s | 7,47 s | 3,14 s |

**Kodierung** (Kalibrier-Kachel, 19 148 Punkte, gzip-6):

| Variante | roh | gzip | Δ |
|---|---|---|---|
| heute (13 Attribute) | 729 KB | 195,5 KB | — |
| Flags nur wenn 1 | 562 KB | 189,9 KB | −2,9 % |
| Flags als Bitmaske | 542 KB | 184,9 KB | −5,4 % |
| heute + Feature-IDs | 788 KB | 243,3 KB | +24,4 % |
| heute, gzip-9 | — | 191,5 KB | −2,1 % |
| heute, zopfli | — | 183,3 KB | −6,3 % |

**Brotli** (Start-Nutzlast `dist/`): gzip-9 357 KB → Brotli-5 336 KB → Brotli-11 301 KB.

## Anhang B — Minimaltest Cache-Lock (Chromium)

```js
// 8 gleichzeitige Range-Anfragen auf DIESELBE URL; Server antwortet nach 300 ms.
const t0 = performance.now();
const ends = await Promise.all([...Array(8)].map(async (_, i) => {
  const r = await fetch(url, { headers: { range: `bytes=${i * 20000}-${i * 20000 + 5999}` } /* , cache: "no-store" */ });
  await r.arrayBuffer();
  return Math.round(performance.now() - t0);
}));
// Chromium 141, ohne cache-Option: 332, 627, 931, 1235, 1540, 1845, 2149, 2454
// mit cache: "no-store":            314, 315, 317, 318, 321, 322, 324, 325
```

## Quellen

- OpenTrailMap: [github.com/osmus/OpenTrailMap](https://github.com/osmus/OpenTrailMap) — `js/map.js`,
  `js/styleGenerator.js`, `scripts/validateStyles.js`
- OSM-US-Tileservice: [github.com/osmus/tileservice](https://github.com/osmus/tileservice) —
  `cloudflare/src/index.ts`, `renderer/`, [CUSTOM_SERVER.md](https://github.com/osmus/tileservice/blob/main/CUSTOM_SERVER.md);
  [Ankündigung GA](https://openstreetmap.us/news/2025/09/tileservice-general-availability/)
- Chromium: [HTTP Cache design doc](https://www.chromium.org/developers/design-documents/network-stack/http-cache/) (Cache-Lock)
- PMTiles: Commit `ce959e5` „Chrome windows cache workaround“ (js 3.1.0) in
  [protomaps/PMTiles](https://github.com/protomaps/PMTiles); [Deploy auf Cloudflare](https://docs.protomaps.com/deploy/cloudflare)
- Cloudflare: [Range request behavior](https://developers.cloudflare.com/cache/reference/range-requests/),
  [Origin Range Requests (Changelog 02.09.2026)](https://developers.cloudflare.com/changelog/post/2026-09-02-origin-range-requests-rulesets-api/),
  [Default cache behavior](https://developers.cloudflare.com/cache/concepts/default-cache-behavior/),
  [Workers-Preise](https://developers.cloudflare.com/workers/platform/pricing/), [R2-Preise](https://developers.cloudflare.com/r2/pricing)
- Eigene Doku: `docs/PERFORMANCE_PLAN.md`, `docs/VITE_MIGRATION.md`, `docs/MAPLIBRE_6_UPGRADE.md`
