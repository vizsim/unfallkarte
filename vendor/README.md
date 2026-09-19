# vendor/ — eingefrorene Frontend-Libs

Vendored statt CDN (unpkg war Single Point of Failure).

| Datei | Paket | Version | Quelle |
|---|---|---|---|
| `maplibre-gl.mjs` + `maplibre-gl-shared.mjs` + `maplibre-gl-worker.mjs` + `maplibre-gl.css` | maplibre-gl | **6.10.0** | `https://unpkg.com/maplibre-gl@6.10.0/dist/` |
| `pmtiles.js` | pmtiles | **4.5.0** | `https://unpkg.com/pmtiles@4.5.0/dist/` |
| `chart.umd.min.js` | chart.js | **4.5.1** | `https://unpkg.com/chart.js@4.5.1/dist/` |

Lizenzen (BSD-3/MIT) stehen in den Datei-Headern.

## MapLibre ist seit v6 ESM-only

Es gibt kein UMD-Bundle und kein globales `maplibregl` mehr. Die Module importieren die
Bibliothek über **`js/lib/maplibre.js`** — der Vendor-Pfad steht nur dort. Die drei
`.mjs`-Dateien gehören zusammen und **müssen dieselbe Version haben**: `maplibre-gl.mjs`
importiert `-shared.mjs`, der Worker (`-worker.mjs`) wird same-origin automatisch über
`import.meta.url` gefunden und lädt `-shared.mjs` ebenfalls (mit HTTP-Cache ein Treffer).

In `index.html` stehen zwei `<link rel="modulepreload">` — ohne sie entdeckt der Browser
die Bibliothek erst nach dem Parsen von `main.js` (zwei Roundtrips extra, gemessen ~0,3 s
auf Mobilfunk-Profil).

## pmtiles bleibt ein klassisches `<script>`

Der ESM-Build von pmtiles (`dist/esm/index.js`) importiert `"fflate"` als nackten Bezeichner
und lässt sich ohne Bundler nicht im Browser laden; nur das IIFE-Bundle bringt fflate mit.
Darum weiter `<script src="./vendor/pmtiles.js">` mit globalem `pmtiles` (genutzt in `main.js`
und `tests/web/contract.spec.js`). Erledigt sich mit dem Vite-Schritt von selbst.

## Übergangsdatei

`maplibre-gl.js` (5.24.0, UMD) wird von nichts mehr eingebunden, bleibt aber **einen
Deploy-Zyklus** liegen: GitHub Pages cacht 10 Minuten, und eine noch gecachte alte
`index.html` verweist darauf — fehlte die Datei, wäre die Seite für diese Besucher kaputt.
Danach löschen (siehe `docs/TODO.md`).

## Update

Neue Dist-Dateien herunterladen und hier ablegen (gleiche Dateinamen), Versionen in dieser
Tabelle **und** im Kommentar am Ende von `index.html` anpassen. Dann **`npm run test:web`**
— nicht nur ein Browser-Check: beide letzten MapLibre-Upgrades haben den Cluster-Hover
stumm gebrochen (5.24: Structured-Clone bei `setData`; 6.x: Properties mit Null-Prototyp),
gefangen hat es jeweils nur der Smoke-Test.
