# Vite-Umstellung — Skizze und Umsetzungsplan

Stand: **2026-09-23** · Schritte 0–3, 5 und 6 (lokal) umgesetzt auf `temp/vite`; offen: Cutover (4)
und die Live-Messung danach. Konkretisiert `docs/TODO.md` Roadmap 3 und `docs/PERFORMANCE_PLAN.md` Stufe 4.
Gemessene Zahlen tragen ihre Quelle; Schätzungen sind als solche markiert.

## Warum — und warum nicht

**Dafür:**

1. **Deploy-Konsistenz.** Pages cacht jede Datei einzeln 10 min. Nach einem Push kann ein Besucher
   ein neues `main.js` mit einem alten `addSources.js` bekommen → Importfehler → keine Karte. Das ist
   bei einer Messung real passiert (PERFORMANCE_PLAN, Fund 1). Mit gehashten Dateinamen verweist eine
   neue `index.html` nur auf neue Dateien, eine Mischung ist nicht mehr möglich.
2. **Deploy erst nach grünen Tests.** Heute ist ein Push auf `main` sofort live, die CI läuft erst
   danach. Mit einem Actions-Deploy hängt der Deploy-Job an den Tests — und ausgeliefert wird genau
   das `dist/`, gegen das die Tests liefen.
3. **Libs über `package.json` gepinnt** statt Handkopie in `vendor/` (Download-, `sed`- und
   Versionspflege-Prozedur aus `vendor/README.md` entfällt). pmtiles kann endlich als ESM geladen
   werden (heute globales `<script>`, weil der ESM-Build `fflate` nackt importiert).
4. **Voraussetzung für Lazy-Chunks** (PERFORMANCE_PLAN Stufe 5) und TypeScript (TODO Roadmap 4).

**Nicht der Grund: Ladezeit.** Gemessen am 2026-09-19: Start-Nutzlast ≈ 377 KB gzip, davon MapLibre
275 KB (schon minifiziert — Vite spart dort nichts). Unsere 33 eigenen Module = 64 KB gzip in
5 Wasserfall-Stufen; ein esbuild-Probe-Bündel davon wog 25 KB gzip. **Schätzung:** auf dem
Mobilfunk-Profil (1,6 Mbit/s / 150 ms) höchstens ~0,5 s, auf schneller Leitung ≈ 0. Der Gewinn läuft
parallel zum MapLibre-Download und verschwindet teilweise darin.
**Gemessen (Schritt 6): −0,78 s auf dem Mobilfunk-Profil** — mehr als geschätzt, auf schneller
Leitung ≈ 0 wie erwartet. Die Schätzung lag daneben, weil der Modul-Wasserfall eben NICHT parallel
zu MapLibre lief, sondern vor dem Kartenkonstruktor auf dem kritischen Pfad lag.

## Was sich ändert

| | heute | mit Vite |
|---|---|---|
| Auslieferung | Pages serviert das Repo-Root von `main` | Action baut `dist/`, `actions/deploy-pages` |
| eigener Code | 33 Module einzeln, 5 Wasserfall-Stufen | ein Entry-Chunk + gehashte Assets |
| MapLibre | 3 `.mjs` in `vendor/`, 2 handgeschriebene `modulepreload` | npm, **siehe Kernfrage** |
| pmtiles | `<script src="./vendor/pmtiles.js">`, globales `pmtiles` | `import { Protocol } from "pmtiles"` |
| chart.js | Script-Injektion aus `vendor/` (`uspeedChart.js:14`) | `import("chart.js")` → eigener Lazy-Chunk |
| Mapillary-Token | Laufzeit-Import `config.js` (localhost) / `config.public.js` (`main.js:70`) | `import.meta.env.VITE_MAPILLARY_TOKEN`, zur Bauzeit eingesetzt: `.env.development.local` (gitignored, wie `config.js`) bzw. `.env.production` (committet, wie `config.public.js`) |
| Dev-Server | `http-server` (`npm run serve`) | `vite` mit HMR (`npm run dev`) |
| Playwright | gegen das Repo-Root | gegen `vite preview` = das gebaute Artefakt |
| Push auf `main` | sofort live | live nach grüner CI (heute 3,6–5,8 min, letzte 8 Läufe) |

## Kernfrage: der MapLibre-Worker

`maplibre-gl.mjs` findet seinen Worker **zur Laufzeit**: ``new URL(`./${name}`, e)`` mit
`e = import.meta.url` (im minifizierten `maplibre-gl.mjs`, Funktion `Ki`). Diesen Ausdruck erkennt Vite
nicht, weil die Basis eine Variable ist und nicht `import.meta.url` selbst. Gebündelt zeigt
`import.meta.url` auf einen Chunk in `assets/`. Die Folge: `assets/maplibre-gl-worker.mjs` → 404,
und die Karte bekommt keine Tiles. Selbst mit korrektem Pfad importiert der Worker
`./maplibre-gl-shared.mjs` beim Namen, eine Datei, die es gebündelt nicht mehr gibt.
*(Aus dem Code abgeleitet.)*

**Option A — mitbündeln, Worker per `setWorkerUrl` auf eine kopierte Worker-Datei.** Das ist die
einfachste Konfiguration, hat aber einen Haken: heute laden Hauptthread und Worker **dieselbe**
`-shared.mjs`, beim zweiten Mal ein Cache-Treffer. Ist der Hauptthread gebündelt, lädt der Worker
seine eigene Kopie. **Schätzung:** +~148 KB gzip beim Start (so viel wiegt `-shared.mjs` gzip,
PERFORMANCE_PLAN Stufe 0). Das ist ein Mehrfaches dessen, was die Bündelung spart.

**Option B — MapLibre nicht bündeln, versionierte Kopie ausliefern (Empfehlung).** Ein kleines
Vite-Plugin (~30 Zeilen) übernimmt drei Aufgaben:
- es kopiert die drei `.mjs` aus `node_modules` nach `dist/lib/maplibre-gl@<version>/`,
- es lässt `maplibre-gl` im Build `external` und löst den nackten Import per **Importmap** in
  `index.html` auf,
- und es schreibt die zwei `modulepreload`.

Damit lädt MapLibre genauso wie heute (gemessen, siehe `MAPLIBRE_6_UPGRADE.md`). Die Version im
Pfad sorgt für Cache-Busting und kommt aus `package.json`. Die Importmap ist unabhängig von den
Optionsnamen des Bundlers, die sich mit Vite 8 (Rolldown) verschoben haben; alle Browser mit WebGL2
können Importmaps. Im Dev: `optimizeDeps.exclude: ["maplibre-gl"]`, dann liegt der Worker in
`node_modules` direkt neben der Hauptdatei und wird wie heute gefunden.

**Option C — `vendor/` bleibt Handkopie.** Das gibt Grund 3 auf und ist nur die Rückfallposition,
falls B scheitert.

**Spike-Ergebnis (2026-09-23): B.** Mini-Seite mit einer GeoJSON-Quelle (die braucht den Worker),
maplibre-gl 6.10.0 aus npm (byte-identisch mit `vendor/`, bis auf die entfernten
`sourceMappingURL`-Zeilen), Vite 8.3, headless Chromium, alle Anfragen des Kontexts mitgeschnitten:

| Variante | Worker | übertragen (gzip) |
|---|---|---|
| A ohne `setWorkerUrl` | fragt `assets/maplibre-gl-worker.mjs` an → **Karte bleibt leer, ohne jeden Fehler** | — |
| A mit `setWorkerUrl` | läuft | Bündel 269 KB + `-shared` 146 KB + Worker 6 KB = **421 KB** |
| B (extern + Importmap) | läuft | `maplibre-gl.mjs` 148 KB + `-shared` 146 KB + Worker 6 KB = **300 KB** |

- A ohne `setWorkerUrl` ist tückischer als vermutet: kein 404, denn der Vite-Server liefert für
  unbekannte Pfade per SPA-Fallback die `index.html` mit Status 200 aus (siehe Stolperstein 10).
  Der Worker scheitert, die Konsole bleibt leer.
- A mit `setWorkerUrl` kostet **+121 KB gzip** gegenüber B (geschätzt waren ~148): der Worker lädt
  `-shared` unter eigener URL, obwohl derselbe Code schon im Bündel steckt. Bei B holt der Worker
  dieselbe URL wie der Hauptthread; beim Start ist das ein Cache-Treffer, wie heute.
- `build.rollupOptions` funktioniert in Vite 8 noch, ist aber als veraltet markiert
  (→ `build.rolldownOptions`). Die Importmap hängt an keinem der beiden Namen.
- Range-Requests: `vite` und `vite preview` antworten mit 206. PMTiles funktioniert ohne eigenen
  Server.

Skizze für B (vom Spike bestätigt; die endgültige Fassung steht in `vite.config.js`):

```js
// vite.config.js
import { defineConfig } from "vite";
import { cpSync } from "node:fs";
import ml from "maplibre-gl/package.json" with { type: "json" };

const ML_DIR = `lib/maplibre-gl@${ml.version}`;
const ML_FILES = ["maplibre-gl.mjs", "maplibre-gl-shared.mjs", "maplibre-gl-worker.mjs"];

/** MapLibre ungebündelt: Worker + Hauptthread teilen sich -shared.mjs wie bisher. */
function maplibreExternal() {
  return {
    name: "maplibre-external",
    apply: "build",
    config: () => ({ build: { rolldownOptions: { external: ["maplibre-gl"] } } }),
    transformIndexHtml: () => [
      { tag: "script", attrs: { type: "importmap" }, injectTo: "head-prepend",
        children: JSON.stringify({ imports: { "maplibre-gl": `./${ML_DIR}/maplibre-gl.mjs` } }) },
      ...ML_FILES.slice(0, 2).map((f) => ({ tag: "link", injectTo: "head",
        attrs: { rel: "modulepreload", href: `./${ML_DIR}/${f}` } })),
    ],
    writeBundle: ({ dir }) => ML_FILES.forEach((f) =>
      cpSync(`node_modules/maplibre-gl/dist/${f}`, `${dir}/${ML_DIR}/${f}`)),   // + sourceMappingURL strippen
  };
}

export default defineConfig({
  base: "./",                                   // Pages liefert unter /unfallkarte/ aus
  appType: "mpa",                               // kein SPA-Fallback → echte 404 (Stolperstein 10)
  server: { watch: { ignored: ["**/data/**", "**/pipeline/**"] } },
  optimizeDeps: { exclude: ["maplibre-gl"] },
  plugins: [maplibreExternal() /* , previewData() — siehe Stolperstein 3 */],
});
```

## Weitere Stolpersteine (aus dem Code)

1. **Tests importieren App-Module über ihren URL-Pfad** im Browser: `await import("/js/layers/registry.js")`
   (`tests/web/helpers.js:150`, `lazy.spec.js:32`, `legend.spec.js:10`) bzw. `/js/ui/popupHandlers.js`
   (`contract.spec.js:119`). Sie verlassen sich darauf, dieselbe Modul-Instanz wie die App zu treffen.
   Im Bündel gibt es diese Pfade nicht. → **Test-Hook:** `main.js` setzt, analog zu `window.map`,
   `window.__app = { LAYER_REGISTRY, ensureEntry, allPopupEntries, PMTiles }`. `contract.spec.js`
   (Z. 47/127) nutzte das globale `pmtiles` und geht jetzt ebenfalls über den Hook.
2. **Unit-Tests (`node --test`) importieren `js/`-Module direkt.** `import.meta.env` darf darum nur
   in EINEM Modul stehen (z. B. `js/config/env.js`), das kein Unit-Test lädt — in Node ist
   `import.meta.env` `undefined`, und `.VITE_…` darauf wirft. `permalinkFormat.js` und
   `resolveSources.js` bleiben unberührt.
3. **`data/` (Symlink, 18 GB) darf nie nach `public/`**, denn Vite kopiert `public/` komplett nach
   `dist/`. Im Dev liefert Vite `data/` aus dem Root aus; der Watcher muss `data/**` und
   `pipeline/**` ignorieren, sonst beobachtet er den ganzen Datenbaum. `vite preview` liefert nur
   `dist/` aus. Ein kleines `configurePreviewServer`-Plugin serviert darum `/data/*` aus `./data`,
   damit Local-first auch gegen den Build greift. `contract.spec.js` prüft lokal die frisch gebauten
   Tiles VOR dem B2-Deploy, und das muss so bleiben. Range-Requests (206) beherrschen Dev und
   Preview (Spike).
4. **Local-first-Erkennung bleibt am Hostnamen** (`mayHaveLocalTree()`, `resolveSources.js:29`) und
   wandert NICHT auf `import.meta.env.DEV`. Sonst probte der gebaute Stand nie lokal, und der
   Vertragstest liefe still gegen B2 statt gegen die neuen Tiles.
5. **`.gitignore` schluckt JSON in `public/`:** `*.json` ist ignoriert, freigegeben sind nur
   `/*.json` und `/icons/*.json`. Ein nach `public/` verschobenes `style.json` oder die Sprite-JSONs
   fehlten dann still im Commit, und die CI zeigte nur das Fehlerbanner. → `!/public/**/*.json`.
6. **Was Pages heute nebenbei ausliefert und in `dist/` fehlen würde:** `docs/screenshot.png` ist das
   `og:image` (`index.html:19`, absolute URL). → nach `public/`, `og:image` und README-Link
   anpassen. Der Rest (README, `vendor/maplibre-gl.js`) braucht niemand.
7. **Lazy-Chunks nach einem Deploy:** Wer die Seite vor dem Deploy geöffnet hat und danach zum ersten
   Mal das Uspeed-Chart öffnet, fragt einen alten Chunk-Namen an → 404. Vite meldet das als
   `vite:preloadError`. Ein Handler ruft einmal pro Sitzung `location.reload()` auf.
8. **Veralteter Preview-Server:** Mit `reuseExistingServer` liefert ein noch laufender `vite preview`
   einen ALTEN Build aus, und die Tests werden gegen den alten Stand grün. → `reuseExistingServer:
   false`, der Build läuft im `webServer`-Kommando. Die Port-Regel (`PW_PORT`) bleibt.
9. **`perf.spec.js`:** Der Test „Karte startet, ohne auf die Token-Konfig zu warten" wird
   gegenstandslos, weil es keinen Request mehr gibt → löschen, samt Kommentar in `main.js`.
   „style.json genau einmal" bleibt gültig und fängt auch, falls Vite den Preload-Link beim
   Umschreiben auf `public/` bricht.
10. **SPA-Fallback bricht Local-first still** *(Spike-Fund)*. Vites Default `appType: "spa"`
    beantwortet jeden unbekannten Pfad mit der `index.html` und Status 200, auch einen `HEAD` auf
    `./data/…`. `existsLocally()` (`resolveSources.js`) hielte dann jede fehlende Datei für lokal
    vorhanden, und MapLibre bekäme HTML statt Tiles. Das träfe die CI (dort gibt es kein `data/`).
    → `appType: "mpa"`: Dev und Preview antworten mit echten 404 (gegengeprüft, GET wie HEAD).

## Zielbild

```
index.html             kein pmtiles-<script>, keine vendor-Links; Importmap + modulepreload kommen vom Plugin
main.js, js/**         unverändert bis auf: maplibre.js (1 Zeile), pmtiles-/chart-Import, env.js, Test-Hook
style.css              url(./thumbs/…) → Vite hasht die Thumbnails
public/
  style.json           Laufzeit-fetch + Preload, Pfad bleibt ./style.json
  icons/               Sprite wird über style.json per URL geholt → muss ungehasht bleiben
  screenshot.png       og:image
vite.config.js         base "./", maplibre-Plugin, preview-/data-Middleware, watch.ignored
.env.production        VITE_MAPILLARY_TOKEN, öffentlicher Token (committet — ersetzt config.public.js)
.env.development.local VITE_MAPILLARY_TOKEN, lokaler Token (gitignored — ersetzt config.js)
.github/workflows/ci.yml   build → test gegen dist → deploy (nur main)
vendor/                entfällt
```

Das Frontend wandert **nicht** in einen Unterordner `web/`. Vite braucht das nicht, und jeder Pfad in
Doku, Tests und Memory würde sich ändern. Wenn überhaupt, ist das ein eigener Schritt.

## Umsetzungsplan

Alles auf **`temp/vite`**. Sobald `main.js` nackte Imports (`"maplibre-gl"`, `"pmtiles"`) enthält,
läuft das Repo-Root nicht mehr ungebaut. Der Merge nach `main` ist darum zugleich der Cutover
(Schritt 4). Jeder Schritt ist ein eigener Commit; `npm run test:unit` und `npm run test:web` sind
danach grün.

### Schritt 0 — Spike ✓ (2026-09-23)

Erledigt, Ergebnis unter „Kernfrage": **Option B**, dazu `appType: "mpa"` (Stolperstein 10).
Offen geblieben und in Schritt 1/2 zu prüfen: Worker-Laden im Dev-Server innerhalb des Repos (im
Spike lag `node_modules` als Symlink außerhalb der Vite-Root → 403, ein Artefakt des Aufbaus) und
der Preload-Link auf `public/style.json` (fängt `perf.spec.js`).

### Schritt 1 — Vite + npm-Libs ✓ (`12f9e3f`)

- `npm i -D vite`; `npm i -E maplibre-gl@6.10.0 pmtiles@4.5.0 chart.js@4.5.1` (exakt gepinnt,
  dieselben Versionen wie heute → das Verhalten darf sich nicht ändern).
- `vite.config.js` nach Skizze; Scripts `dev`, `build`, `preview`.
- `js/lib/maplibre.js` → `export * from "maplibre-gl"` (die dort vorgesehene eine Zeile);
  MapLibre-CSS per `@import` am Anfang von `style.css` (Reihenfolge: MapLibre zuerst, eigene
  Regeln überschreiben).
- `main.js`: `import { Protocol } from "pmtiles"`, den `<script>` aus `index.html` entfernen.
- `uspeedChart.js`: `loadChartJs()` → `import("chart.js/auto")`. Optional nur die gebrauchten
  Komponenten registrieren, das ergibt einen kleineren Chunk.
- Token: `js/config/env.js` liest `import.meta.env.VITE_MAPILLARY_TOKEN`; `tokenPromise` samt
  `catch` in `main.js` entfällt. `config.public.js` → `.env.production` (committet, derselbe
  öffentliche Token wie heute), `config.js` → `.env.development.local` (gitignored). So braucht die
  CI keine Repo-Variable, und am Stand „öffentlicher Token liegt im Repo" ändert sich nichts.
- `style.json`, `icons/`, `docs/screenshot.png` → `public/`; `.gitignore` (Stolperstein 5);
  handgeschriebene `modulepreload`/Vendor-Links aus `index.html` entfernen.
- `vite:preloadError`-Handler (Stolperstein 7).

### Schritt 2 — Tests gegen den Build ✓ (`635bf97`, `12f9e3f`)

- `playwright.config.js`: `webServer.command = npm run build && vite preview --port $PORT --strictPort`,
  `reuseExistingServer: false`.
- Preview-Middleware für `/data/*` (Stolperstein 3).
- Test-Hook `window.__app` ✓ (vorgezogen, läuft schon ungebündelt): die 4 `import("/js/…")`-Stellen
  und das globale `pmtiles` gehen darüber.
- `perf.spec.js`: Token-Test raus. Neu, zählbar und deterministisch wie der Rest der Datei:
  - „keine eigene Anfrage ≥ 400 beim Start" fängt vergessene `public/`-Assets (Sprite, Thumbs,
    Favicon);
  - „`-shared.mjs` kommt genau einmal über die Leitung" hält Option B fest. Vorher prüfen, ob
    Playwright die Anfragen des Workers sieht.
- **Abnahme:** `npx playwright test golden` **unverändert** grün (die Umstellung darf am Style
  nichts ändern), alle übrigen Tests grün, Unit-Tests grün. **Erreicht:** 52/52 Playwright
  gegen den Build, Golden unverändert, 19/19 Unit-Tests; Dev-Server separat geprüft (Worker aus
  `node_modules`, `data/` lokal, keine Fehler).
- Von Hand, weil die Suite es nicht abdeckt (siehe `MAPLIBRE_6_UPGRADE.md`): Terrain, Hillshade,
  3D-Gebäude, Basemap-Wechsel, Uspeed-Chart. **Erledigt** per Skript gegen den Build mit
  Screenshots: Relief (Terrain + Hillshade, Harz), 345 Gebäude gerendert (Berlin-Mitte), OSM
  und Esri schalten um, alle Fremd-Kacheln 200, keine Konsolenfehler. Das Uspeed-Chart prüft
  `traffic.spec.js` jetzt über gezeichnete Pixel.

### Schritt 3 — CI baut, testet und deployt ✓ (`416d5b7`, actionlint grün)

- Job `web`: `npm ci` → `test:unit` → `npm run build` → Playwright gegen genau dieses `dist/` →
  `actions/upload-pages-artifact`.
- Neuer Job `deploy`: `needs: web`, nur bei `push` auf `main`; `permissions: pages: write,
  id-token: write`; `environment: github-pages`; `actions/deploy-pages`. Eigene Concurrency-Gruppe
  `pages` mit `cancel-in-progress: false`: ein laufender Deploy wird nicht abgebrochen. Die
  bestehende `ci-${ref}`-Gruppe bricht dagegen ab.
- Der Deploy hängt bewusst nur an `web`: ein roter Pipeline-Test soll die Website nicht blockieren.
- Action-Versionen wie bei den übrigen auf der Node-24-Laufzeit; Runner bleibt `ubuntu-24.04`.

### Schritt 4 — Cutover (ein Zug, du schaltest um)

1. Tag `pre-vite` auf den letzten `main`-Stand setzen.
2. **Repo-Settings → Pages → Source: „GitHub Actions"** (manuell). Laut GitHub bleibt die letzte
   Bereitstellung bis zum ersten Actions-Deploy aktiv — **vor dem Umschalten nachlesen**.
3. `temp/vite` → `main` mergen und pushen. CI (~4–6 min) → Deploy.
4. **10 min warten** (Pages-Cache), dann live prüfen:
   - MapLibre-Version und Worker lädt (keine 404 in der Konsole);
   - Hover-Pie, Uspeed-Chart (Lazy-Chunk), Terrain, Basemap-Wechsel;
   - alter v1-Permalink;
   - `og:image`-URL.
5. **Rückweg:** Pages-Source zurück auf „Deploy from branch `main` /" und `git revert` des Merges.
   Der Stand `pre-vite` ist eine gültige statische Seite; der Revert allein reicht nicht, weil ohne
   Build-Job niemand mehr deployt.

### Schritt 5 — Aufräumen + Doku ✓

- `vendor/` löschen. Die offene TODO „`vendor/maplibre-gl.js` löschen" erledigt sich mit, dazu
  `http-server` aus den devDependencies.
- `README.md`: Dev (`npm run dev`), Build, Deploy-Ablauf; Lib-Update = `npm i -E maplibre-gl@x` +
  `npm run test:web`. Den Abschnitt aus `vendor/README.md` zur Worker-Besonderheit dorthin retten.
- `CLAUDE.md`:
  - `npm run dev` statt `serve`;
  - „Push = Deploy nach grüner CI";
  - Frontend-Token: `.env.development.local` (lokal) / `.env.production` (öffentlich);
  - Test-Hook statt Modul-URLs in Tests;
  - `import.meta.env` nur in `env.js`;
  - Messregel: gegen `dist/` mit Pages-ähnlichem Server, nie gegen `vite` dev.
- `docs/TODO.md` Roadmap 3 abhaken, `PERFORMANCE_PLAN.md` Stufe 4 nachziehen.

### Schritt 6 — Messen ✓ lokal (2026-09-23) · live offen

Mess-Skripte liegen jetzt im Repo: `tools/perf/pages-like-server.mjs` (gzip, `max-age=600`, Range,
~9-KB-404 wie Pages) und `tools/perf/measure-start.mjs` (A/B abwechselnd, frischer Browser-Kontext
je Lauf, ein Aufwärmlauf je Arm). A = `main` wie heute live (`git archive main`), B = `dist/` von
`temp/vite`; beide über `127.0.0.2` (Produktionspfad, keine Local-first-Proben), ruhige Maschine
(loadavg < 0,5 vor dem Lauf). Median (Spanne):

| | vorher (`main`) | Vite (`dist/`) | Δ |
|---|---|---|---|
| **Mobilfunk, Reihe 1** (7 Läufe) — erster Unfallpunkt | 6,77 s (6,58–7,05) | **5,98 s** (5,93–6,09) | −0,79 s |
| Mobilfunk, Reihe 1 — fertige Startansicht | 8,37 s (8,34–8,69) | **7,60 s** (7,58–7,71) | −0,77 s |
| **Mobilfunk, Reihe 2** (5 Läufe) — erster Unfallpunkt | 6,52 s (6,44–6,57) | **5,74 s** (5,66–5,80) | −0,78 s |
| Mobilfunk, Reihe 2 — fertige Startansicht | 8,14 s (8,10–8,15) | **7,35 s** (7,31–7,42) | −0,79 s |
| schnelle Leitung (5 Läufe) — erster Unfallpunkt | 1,55 s (1,51–1,73) | 1,48 s (1,39–1,49) | ≈ 0 |
| schnelle Leitung — fertige Startansicht | 2,15 s (1,94–2,57) | 2,09 s (1,85–2,31) | ≈ 0 |
| eigene Herkunft (HTML/JS/CSS/Style) | 453 KB in 59 Anfragen | **379 KB in 17 Anfragen** | −74 KB, −42 |

Auf dem Mobilfunk-Profil überlappen sich die Spannen in keiner Reihe — der Gewinn ist echt und
stabil (−0,78 s in beiden Reihen). Auf schneller Leitung liegt der Unterschied im Rauschen.
Erklärung (plausibel, nicht einzeln belegt): der Modul-Wasserfall (5 Stufen à 150 ms RTT ≈ 0,75 s)
lag vor dem Kartenkonstruktor; gebündelt ist es EINE Anfrage, parallel zu MapLibre.

Nebenfund beim Messen (Bildaufzeichnung + Seite ohne JS): auf dem Handy stand vor dem App-JS die
komplett ausgeklappte Legende über der Karte, bis zum `load` der Karte — 4,0 s (vorher) bzw. 3,2 s
(Vite) auf dem Mobilfunk-Profil. Nicht durch Vite verursacht, sondern alt; behoben in `6da6a57`
(Inline-Einzeiler setzt `collapsed` beim Parsen). Ebenso behoben: beim Ziehen des Sheets wurde die
ganze Seite scrollbar (`167dea5`).

**Offen:** live nach dem Cutover gegen vizsim.de nachmessen (Baseline 5,76 s bis zum ersten
Unfallpunkt, 2026-09-21) — erst 10 min nach dem Deploy (Pages-Cache).

## Danach (nicht Teil dieses Plans)

- **MapLibre 6.11** über npm — der erste Durchlauf des neuen Update-Wegs, einzeln.
- **Lazy-Chunks** (PERFORMANCE_PLAN Stufe 5): Mapillary, Uspeed + chart.js, Registry-Gruppen per
  `import()` beim ersten Einschalten.
- **TypeScript** (Roadmap 4): Vite transpiliert TS, **prüft aber keine Typen** → `tsc --noEmit` als
  eigener CI-Schritt. `checkJs` + JSDoc geht schon vorher.

## Zu entscheiden

| Frage | Empfehlung |
|---|---|
| MapLibre bündeln (A) oder versioniert extern (B)? | **B** — entschieden nach Spike |
| Deploy-Gate nur `web` oder auch `pipeline`? | nur `web` |
| Token-Quelle im Build | `.env.production` committet wie heute `config.public.js` (statt Repo-Variable: keine Settings-Änderung nötig; der Token ist öffentlich und steht ohnehin im ausgelieferten JS) |
| Tests gegen Dev-Server oder Build? | Build — getestet = ausgeliefert |
| Frontend nach `web/` verschieben? | nein, nicht in diesem Schritt |
