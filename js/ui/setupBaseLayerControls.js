import { updatePermalink } from '../utils/permalink.js';

export function setupBaseLayerControls(map, isInitializingRef) {
  document.querySelectorAll('input[name="color-style"]').forEach(rb => {
    rb.addEventListener("change", () => {
      updatePermalink(map, isInitializingRef);
    });
  });

  // Basemap-Auswahl (Positron/OSM/Esri) läuft jetzt über das Karten-Panel
  // (js/map/basemapTerrain.js, verdrahtet in main.js) — kein .basemap-thumb mehr.
}
