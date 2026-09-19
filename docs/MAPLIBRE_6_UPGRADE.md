# MapLibre GL JS 5.24 → 6.10: Lohnt sich das Upgrade?

Stand: 2026-09-19 · Repo: `vizsim/unfallkarte` (Branch `main`) · aktuell vendored: maplibre-gl **5.24.0** · npm `latest`: **6.10.0**

## Ergebnis (2026-09-19): umgesetzt

Upgrade durchgeführt auf Branch `temp/maplibre-6`. Die Analyse unten hat sich im Kern bestätigt —
Versionen, Dateiliste, Größen und die Resolver-Signatur wurden gegen npm, unpkg und die
ausgelieferte `maplibre-gl.d.ts` geprüft, bevor etwas geändert wurde. **Zwei Punkte fehlten ihr:**

**1. Ein zweiter echter Bruch: Feature-Properties mit Null-Prototyp.** In v6 ist `f.properties`
aus `queryRenderedFeatures` ein `Object.create(null)`. Reicht man es in `setData(...)` weiter,
wirft MapLibres eigener Serializer (`Cannot read properties of undefined (reading
'_classRegistryKey')`), die Daten erreichen den Worker nie — das vergrößerte Hover-Pie blieb leer.
Fix: `properties: { ...f.properties }` in `js/ui/popupHandlers.js`. Stumm gescheitert (nur ein
`console.error`), gefangen vom Smoke-Test „Cluster-Hover". §2.6 („`setData` … → ok") stimmte
also nicht ganz.

**2. Der Lade-Wasserfall.** Als ESM hängt MapLibre in einer Kette (`main.js` → `maplibre-gl.mjs`
→ `-shared.mjs`); als klassisches `<script>` fand es der Preload-Scanner sofort. Zwei
`<link rel="modulepreload">` in `index.html` beheben das (gemessen ~0,3 s).

**Ladezeit gemessen** (Zeit bis zum ersten Unfallpunkt, Mobilfunk-Profil 1,6 Mbit/s / 150 ms RTT,
5 Läufe, Server mit gzip + `max-age=600` wie GitHub Pages):

| | Median | Spanne |
|---|---|---|
| 5.24 | 7,66 s | 7,57–7,72 |
| 6.10 | **7,30 s** | 7,24–7,32 |

Also leicht **schneller**, nicht nur „praktisch unverändert". Vorsicht beim Nachmessen: der
Dev-Server (`npm run serve`) liefert ohne gzip und mit `-c-1` — dort lädt der Worker
`-shared.mjs` ein zweites Mal voll (514 KB) und 6.10 wirkt ~2,5 s LANGSAMER. Das ist ein
Artefakt des Testservers, kein Befund über MapLibre.

Abweichungen vom Plan: statt Variante A/B ein Re-Export-Modul `js/lib/maplibre.js` (Vendor-Pfad
an genau einer Stelle, beim Vite-Schritt ändert sich eine Zeile). `maplibre-gl.js` (5.24)
bleibt einen Deploy-Zyklus liegen — Pages cacht 10 min, eine gecachte alte `index.html`
verweist noch darauf. Golden-Snapshot **unverändert** (`zoomLevelsToOverscale` hat nichts
verschoben), 17 Unit- + 41 Playwright-Tests grün.

---

## TL;DR

**Ja, lohnt sich – Aufwand klein (ca. 1–2 h inkl. Testlauf).** Im Projektcode gibt es genau **einen echten Bruch** (`styleimagemissing` in `generatePieIcon.js`), der Rest ist Mechanik (ESM-Import statt globalem `maplibregl`, drei Vendor-Dateien statt einer). Die Playwright-Suite (`npm run test:web`) ist genau für solche Vendor-Upgrades gebaut und fängt den Bruch.

**Warum überhaupt:** 5.24 (23.04.2026) ist der letzte 5er-Release. Seit 6.0 (22.07.2026) sind zehn 6.x-Releases erschienen; alle Fixes landen nur noch dort. Wer auf 5.24 bleibt, friert den Stand ein.

---

## 1. Was sich in v6 grundsätzlich geändert hat

| Änderung | Bedeutung für uns |
|---|---|
| **ESM-only.** Kein UMD-Bundle (`maplibre-gl.js`) mehr, keine globale Variable `maplibregl`. Dateien: `maplibre-gl.mjs`, `maplibre-gl-shared.mjs`, `maplibre-gl-worker.mjs` | Script-Tag → `import`; 7 Stellen im Code anpassen |
| **WebGL2 Pflicht**, WebGL1 entfernt | ~97 % Browser-Abdeckung; `new Map()` wirft jetzt `GPUInitializationError` (seit 6.7) statt still zu scheitern |
| **`styleimagemissing` ist nur noch Benachrichtigung** – Bilder liefert man über `map.setMissingStyleImageResolver()` (darf async sein) | **Einziger echter Bruch**: Cluster-Pies |
| Worker wird bei same-origin automatisch über `import.meta.url` gefunden | Kein `setWorkerUrl()`, keine CSP-Änderung nötig (GitHub Pages = same-origin) |
| Style-Spec 25: Legacy-Ausdrücke erzeugen Warnungen statt still zu scheitern | Positron-`style.json` hat ~70 Legacy-Filter (`["==", "class", …]`) – bleiben gültig, evtl. Console-Warnungen (Tests zählen nur `console.error`) |
| `zoomLevelsToOverscale` Default 4 (vorher undefined) | `queryRenderedFeatures` kann bei hohem Zoom minimal andere Treffer liefern → ggf. Golden-Snapshots neu baselinen oder Option auf `undefined` setzen |
| `Map` erbt nicht mehr von `Camera`; `map.transform` entfernt | nicht genutzt |
| `hash:`-Option intern auf `URLSearchParams` umgebaut | nicht genutzt (eigener Permalink) |
| `GeoJSONSource.setData` ohne zweiten Parameter / ohne Rückgabewert | wir rufen `setData(geojson)` mit einem Parameter → ok |
| Icon-Skalierung mit `icon-offset` deaktiviert | `icon-offset` nicht genutzt |
| `#pragma mapbox` → `#pragma maplibre` in Custom-Shadern | keine Custom-Shader |
| TypeScript-Target ES2022 | nur relevant für sehr alte Browser |

---

## 2. Was konkret in diesem Projekt zu tun ist

### 2.1 Vendor-Dateien tauschen (aus 1 mach 3)

Von `https://unpkg.com/maplibre-gl@6.10.0/dist/` nach `vendor/`:

| Datei | Größe |
|---|---|
| `maplibre-gl.mjs` | 584 KB |
| `maplibre-gl-shared.mjs` | 514 KB |
| `maplibre-gl-worker.mjs` | 19 KB |
| `maplibre-gl.css` | 83 KB |

`maplibre-gl.js` (5.24, 1.056 KB) löschen. Gesamtgröße Main-Thread praktisch unverändert (1,06 → 1,10 MB). Der Worker lädt zusätzlich `maplibre-gl-shared.mjs`, das der Browser aber aus dem Cache bedient.

Tabelle in `vendor/README.md` und den Kommentar am Ende von `index.html` (Zeile ~1153) anpassen.

### 2.2 `index.html`

```html
<!-- vorher -->
<script src="./vendor/maplibre-gl.js"></script>
<script src="./vendor/pmtiles.js"></script>
<script type="module" src="./main.js"></script>

<!-- nachher -->
<script src="./vendor/pmtiles.js"></script>
<script type="module" src="./main.js"></script>
```

`pmtiles.js` kann als UMD bleiben (globales `pmtiles`), `maplibregl.addProtocol` gibt es in v6 weiterhin.

### 2.3 Globales `maplibregl` ersetzen (7 Stellen, 5 Dateien)

| Datei | Zeile | Verwendung |
|---|---|---|
| `main.js` | 84 | `maplibregl.addProtocol("pmtiles", protocol.tile)` |
| `main.js` | 102 | `new maplibregl.Map({...})` |
| `js/ui/hoverPopup.js` | 59, 215 | `new maplibregl.Popup(...)` |
| `js/ui/uspeedChart.js` | 36 | `new maplibregl.Popup()` |
| `js/ui/setupMapPanel.js` | 44 | `new maplibregl.NavigationControl()` |
| `js/utils/geocoder.js` | 83 | `new maplibregl.Marker(...)` |

**Variante A (minimal):** in `main.js` ganz oben

```js
import * as maplibregl from "./vendor/maplibre-gl.mjs";
window.maplibregl = maplibregl; // für die vier UI-Module, die das Global erwarten
```

**Variante B (sauber):** in jeder der fünf Dateien den Import selbst setzen, z. B. in `js/ui/hoverPopup.js`

```js
import { Popup } from "../../vendor/maplibre-gl.mjs";
```

und `new maplibregl.Popup(...)` → `new Popup(...)`. Analog `NavigationControl`, `Marker`, `Map`, `addProtocol`.

### 2.4 Cluster-Pies: `styleimagemissing` → `setMissingStyleImageResolver` (der echte Bruch)

`js/utils/generatePieIcon.js`, Funktion `setupPieChartImageGeneration`:

```js
// vorher
export function setupPieChartImageGeneration(map) {
  map.on("styleimagemissing", (e) => {
    const id = e.id;
    if (!id.startsWith("pie-")) return;
    const parts = id.split("-");
    if (parts.length !== 4) return;
    const image = generatePieIcon({ k1: +parts[1], k2: +parts[2], k3: +parts[3] });
    if (image) map.addImage(id, image.data, { pixelRatio: 2 });
  });
}

// nachher
export function setupPieChartImageGeneration(map) {
  map.setMissingStyleImageResolver((id) => {
    if (!id.startsWith("pie-")) return;
    const parts = id.split("-");
    if (parts.length !== 4) return;
    const image = generatePieIcon({ k1: +parts[1], k2: +parts[2], k3: +parts[3] });
    if (image) map.addImage(id, image.data, { pixelRatio: 2 });
  });
}
```

Ohne diesen Umbau fehlen die Pies – der Smoke-Test „Cluster-Hover: vergrößertes Pie + genau ein Popup" schlägt dann an. Der Kommentar in `tests/web/helpers.js` (`settle`), der `styleimagemissing -> addImage -> Re-Layout` erwähnt, sollte mit angepasst werden.

### 2.5 WebGL2-Fehler abfangen (kleine Verbesserung nebenbei)

Aktuell gibt es keinen WebGL-Check. In v6 wirft der Konstruktor bei fehlendem WebGL2:

```js
import { showErrorBanner } from "./js/ui/errorBanner.js";

let map;
try {
  map = new maplibregl.Map({ container: "map", style, /* … */ });
} catch (err) {
  if (err?.name === "GPUInitializationError" || /WebGL/i.test(String(err))) {
    showErrorBanner("Die Karte braucht WebGL2. Bitte Browser aktualisieren oder Hardware-Beschleunigung aktivieren.");
    throw err;
  }
  throw err;
}
window.map = map;
```

(Signatur von `showErrorBanner` an die vorhandene in `js/ui/errorBanner.js` anpassen.)

### 2.6 Nicht betroffen (geprüft)

- keine `hash:`-Option (eigener Permalink in `js/utils/permalink*.js`)
- kein `map.transform`, kein `icon-offset`, keine Custom-Layer/Shader
- `setData(...)` nur mit einem Parameter (`js/ui/popupHandlers.js`)
- keine Feature-State-Nutzung
- Event-Klassen-Umbau (`MapDataEvent` etc.) ist nur ein TypeScript-Typ-Thema

---

## 3. Was das Projekt durch 6.0–6.10 gewinnt

### Terrain / Hillshade (Mapterhorn)
- Kamerasprung am Ende einer Pan/Zoom-Geste auf Terrain behoben (6.7)
- Sichtbare Nähte zwischen Hillshade-Tiles bei linearer Interpolation weg (6.8)
- Hillshade-Artefakte auf Mobil-GPUs bei hohem Zoom weg (6.10)
- Terrain-Drape-Texturen werden nach dem Pan wieder freigegeben statt für die Lebensdauer der Karte belegt zu bleiben (6.10)
- Leere DEM-Tiles (HTTP 204) laden ohne `dem dimension mismatch`-Fehler (6.8)
- Terrain-Gesten verlieren den gegriffenen Punkt nicht mehr (6.3)
- Mehrere Performance-Verbesserungen für Terrain-Rendering (6.0, 6.2, 6.9)

### Cluster-Pies / Symbole
- Icons mit zoomabhängiger `icon-size` erschienen beim schnellen Rauszoomen (Scroll-Fling, Pinch) kurz zu groß – genau unser Cluster-Fall (6.6)
- Sprite-/Bild-Pixel werden über `OffscreenCanvas` gelesen: kein Main-Thread-Stall von Dutzenden ms beim Sprite-Laden (6.9)
- Image-Resolver darf async sein (6.0)
- Symbol-Neuplatzierung wird übersprungen, wenn sich nichts geändert hat (6.7)

### Raster-Basemaps (OSM Carto, Esri Imagery)
- Raster-Tiles blieben am Anfang des Fade-in hängen, bis die Karte bewegt wurde (6.9.1)
- Kein erneutes Einblenden beim Tile-Reload (6.4)
- Mipmaps für Non-Power-of-Two-Raster-Tiles gegen Aliasing bei Pitch (6.0)

### Safari / Robustheit
- Teilweise leere Karten in älteren Safari-Versionen behoben (6.10)
- Kein unbehandelter `Framebuffer is not complete`-Fehler mehr, wenn ein Tab aus dem Schlaf kommt (6.0)
- Karte in verstecktem Container bleibt nicht mehr auf 400×300 hängen (6.9) – potenziell relevant fürs Mobile-Layout
- Kein Einfrieren, wenn ein Render-Task wirft (6.8)
- `DOM.sanitize`-Sicherheitsfix (6.4.1)

### Performance allgemein
- ES2022-Target, weniger Transpilation
- Vertex-Shader-Opacity-Culling für Linien/Flächen, Integer-Vertex-Attribute (6.0, 6.3)
- Redundante WebGL-Calls pro Frame entfernt (6.9)
- Schnellere Fill-Triangulation (6.10)

### Optional nutzbar
- `line-layer-opacity` / `fill-layer-opacity`: Opacity auf den gesamten Layer statt pro Feature → keine Überlappungsartefakte bei transparenten Linien (Verkehrsmengen-/Tempolimit-Layer)
- `terrainSkirtLength` gegen vertikale Artefakte bei Terrain mit transparentem Hintergrund

---

## 4. Risiken / Beobachten

| Risiko | Einschätzung |
|---|---|
| Nutzer ohne WebGL2 (sehr alte Geräte, Software-Rendering, GPU per Policy gesperrt) | Karte bleibt leer → Fehlerbanner (2.5) |
| `zoomLevelsToOverscale = 4` verändert `queryRenderedFeatures` leicht | Golden-Tests prüfen; ggf. `zoomLevelsToOverscale: undefined` in den Map-Optionen |
| Style-Spec-25-Warnungen zu Legacy-Filtern in `style.json` | Nur Console-Warnings, kein Abbruch; Tests werten nur `console.error` |
| Vendor-Update-Workflow wird etwas aufwendiger (3 Dateien) | README anpassen; Versionen müssen zusammenpassen |

---

## 5. Checkliste

- [x] Branch anlegen (`temp/maplibre-6`)
- [x] `vendor/`: `maplibre-gl.mjs`, `maplibre-gl-shared.mjs`, `maplibre-gl-worker.mjs`, `maplibre-gl.css` (6.10.0) rein; `maplibre-gl.js` bleibt EINEN Deploy-Zyklus (Pages-Cache), dann raus
- [x] `vendor/README.md` + Kommentar in `index.html` aktualisieren
- [x] `index.html`: Script-Tag `maplibre-gl.js` entfernen
- [x] `main.js`: Import über `js/lib/maplibre.js` — ursprünglich: `import * as maplibregl from "./vendor/maplibre-gl.mjs"` (+ `window.maplibregl` oder Einzel-Imports in den 4 UI-Modulen)
- [x] `generatePieIcon.js`: `setMissingStyleImageResolver`
- [x] `try/catch` um `new Map()` mit Fehlerbanner
- [x] Browser-Check: Karte lädt, Pies da, Terrain (Garmisch, 1097 m, Punkte liegen auf dem Gelände), 3D-Gebäude, alle drei Basemaps, keine Console-Errors
- [x] `npm run test:unit && npm run test:web`
- [x] Golden-Snapshots prüfen — unverändert, kein Neu-Baselinen nötig
- [x] `CLAUDE.md` / Doku, falls dort die Vendor-Struktur beschrieben ist

---

## Quellen

- [MapLibre CHANGELOG.md](https://github.com/maplibre/maplibre-gl-js/blob/main/CHANGELOG.md)
- [v5 → v6 Migration Guide](https://maplibre.org/maplibre-gl-js/docs/guides/v5-to-v6-migration-guide/)
- [Release v6.0.0](https://github.com/maplibre/maplibre-gl-js/releases/tag/v6.0.0)
- [maplibre-gl auf npm](https://www.npmjs.com/package/maplibre-gl)
- [vizsim/unfallkarte](https://github.com/vizsim/unfallkarte)
