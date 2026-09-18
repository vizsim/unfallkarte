// setupScenarioControls.js
//
// Szenario-Toggles + Schwellen-Regler laufen über die Layer-Registry (js/layers/scenarios.js,
// js/ui/setupEntryControls.js). Hier bleibt nur der Uber-Stunden-Regler, bis uspeed in
// Registry-Schritt 4 umzieht.

import { applyUspeedHour } from "../mapdata/addLayers.js";

export function setupScenarioControls(map) {
  let uspeedDebounceTimer = null;

  document.getElementById("uspeed-slider").addEventListener("input", (e) => {
    const hour = parseInt(e.target.value, 10);
    document.getElementById("uspeed-slider-value").textContent = hour;

    if (uspeedDebounceTimer) {
      clearTimeout(uspeedDebounceTimer);
    }

    uspeedDebounceTimer = setTimeout(() => {
      for (const layer of ["uspeed-forward", "uspeed-reverse"]) {
        if (map.getLayer(layer)) {
          map.setLayoutProperty(layer, "visibility", "visible");
        } else {
          console.warn(`⚠️ Layer '${layer}' not found.`);
        }
      }
      // Wide-Format: Stunde wechselt Filter (has speed_<h>) + Farbe (get speed_<h>)
      applyUspeedHour(map, hour);
    }, 200);
  });
}
