# Frontend-Makeover — Einbau in unfallkarte

Dateien (in die bestehende js/-Struktur):
- `js/map/basemapTerrain.js`     → OpenFreeMap-Basemaps + Mapterhorn-Terrain (kein MapTiler)
- `js/map/bikeLanesLayers.js`    → Radinfrastruktur-Kontextlayer (TILDA)
- `js/mapdata/resolveSources.js` → Local-first + B2-Fallback über data/manifest.json
- `partials/panel.html`          → Panel-Markup in index.html einfügen
- `partials/panel.css`           → an style.css anhängen

## 1. MapTiler entfernen
- In `js/mapdata/addSources.js`: die Sources `hillshade` und `terrain` (beide MapTiler)
  sowie die `satellite`-Raster-Source löschen (Esri kommt jetzt aus basemapTerrain.js).
- In `main.js`: `MAPTILER_API_KEY` entfernen; die alten Handler `#toggleHillshade`
  und `#toggleTerrain` löschen. `config.public.js`: Key raus.

## 2. main.js verdrahten (im map 'load'-Handler, NACH addSources/addLayers)
```js
import { addBasemapTerrain, setBasemap, setRelief, setBuildings } from './js/map/basemapTerrain.js';
import { addBikeLanesSource, addBikeLanesLayers, setBikeLanesVisible } from './js/map/bikeLanesLayers.js';

addBasemapTerrain(map);
addBikeLanesSource(map);
addBikeLanesLayers(map);

const panel = document.getElementById('map-settings-panel');
const panelToggle = document.getElementById('map-settings-toggle');
panelToggle.addEventListener('click', () => panel.classList.toggle('is-collapsed'));

document.querySelectorAll('.basemap-btn[data-basemap]').forEach((btn) => {
  btn.addEventListener('click', () => {
    setBasemap(map, btn.dataset.basemap);
    document.querySelectorAll('.basemap-btn').forEach((b) => b.classList.remove('selected'));
    btn.classList.add('selected');
  });
});
document.getElementById('toggle-relief').addEventListener('change', (e) => setRelief(map, e.target.checked));
document.getElementById('toggle-buildings').addEventListener('change', (e) => setBuildings(map, e.target.checked));
document.getElementById('toggle-bikelanes').addEventListener('change', (e) => setBikeLanesVisible(map, e.target.checked));
```

## 3. (optional, später) Local-first-Loader
addSources.js auf `resolveSources()` umstellen:
```js
import { resolveSources } from './resolveSources.js';
const sources = await resolveSources();        // liest data/manifest.json
map.addSource('accidents_single', { type: 'vector', url: sources.url('accidents_single') });
// external (mapillary_trafficsigns): sources.externalUrl('mapillary_trafficsigns')
```
Voraussetzung: `unfallkarte manifest` wurde gelaufen (erzeugt data/manifest.json).

## Hinweise
- Basemap-Wechsel auf OSM/Esri blendet nur die Positron-Host-Layer aus
  (source === "openmaptiles"); alle Daten-Layer bleiben sichtbar.
- thumb-osm.png ggf. aus gradients2osm/viz/assets/basemaps/ übernehmen.
- Attribution (OpenFreeMap/Positron, OSM, Esri, Mapterhorn, TILDA) im Attribution-
  Control prüfen.
- Browser-Test steht noch aus (hier nur Syntax-geprüft).
