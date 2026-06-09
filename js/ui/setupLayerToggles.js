
// setupLayerToggles.js

// export function setupLayerToggles(map, applyZoomLock, applyLegendVisibility) {



import { applyZoomLock } from "../utils/zoomLock.js";
import { updateLegendVisibilityByZoom } from "./legendHandlers.js";
import { telraamColorExpr } from "../mapdata/addLayers.js";



export function setupToggle(map, checkboxId, layerIds, applyZoomLock, applyLegendVisibility) {
  const checkbox = document.getElementById(checkboxId);
  if (!checkbox) return;

  checkbox.addEventListener("change", (e) => {
    const visibility = e.target.checked ? "visible" : "none";

    layerIds.forEach(layerId => {
      if (map.getLayer(layerId)) {
        map.setLayoutProperty(layerId, "visibility", visibility);
      }
    });

    applyZoomLock();
    applyLegendVisibility();
    updateLegendVisibilityByZoom(map);  // Legende/Hinweis sofort an Zoom anpassen (z. B. Tempolimit < z11)
  });
}



export function setupLayerToggles(map, originalMinZoom, setCurrentZoomLock, applyLegendVisibility) {
  const zoomLock = () => applyZoomLock(map, originalMinZoom, setCurrentZoomLock);


  // Einfachere Handhabung der Layer
  setupToggle(map, "toggle-movebis", ["movebis"], zoomLock, applyLegendVisibility);
  setupToggle(map, "toggle-hvs", ["hvs"], zoomLock, applyLegendVisibility);
  setupToggle(map, "toggle-obs", ["obs"], zoomLock, applyLegendVisibility);
  setupToggle(map, "toggle-laerm1", ["laerm1"], zoomLock, applyLegendVisibility);
  setupToggle(map, "toggle-laerm2", ["laerm2"], zoomLock, applyLegendVisibility);
  setupToggle(map, "toggle-telraam", ["telraam"], zoomLock, applyLegendVisibility);
  setupTelraamMode(map);

  // Für "maxspeed" Layer mit mehreren Layern
  setupToggle(map, "toggle-maxspeed", [
    "maxspeed", "maxspeed-conditional", "maxspeed-forward", "maxspeed-backward",
    "maxspeed-conditional-forward", "maxspeed-conditional-backward",
    "maxspeed_minor", "maxspeed_minor-conditional", "maxspeed_minor-forward",
    "maxspeed_minor-backward", "maxspeed_minor-conditional-forward", "maxspeed_minor-conditional-backward"
  ], zoomLock, applyLegendVisibility);

  // Für "uspeed" mit zusätzlicher Filterlogik
  document.getElementById("toggle-uspeed").addEventListener("change", (e) => {
    const visible = e.target.checked ? "visible" : "none";
    const hour = parseInt(document.getElementById("uspeed-slider").value);

    const filters = {
      "uspeed-forward": [
        "all",
        ["==", ["to-number", ["get", "hour_of_day"]], hour],
        ["==", ["get", "reconstruction_direction"], "forward"]
      ],
      "uspeed-reverse": [
        "all",
        ["==", ["to-number", ["get", "hour_of_day"]], hour],
        ["==", ["get", "reconstruction_direction"], "reverse"]
      ]
    };

    for (const layer of ["uspeed-forward", "uspeed-reverse"]) {
      if (map.getLayer(layer)) {
        map.setLayoutProperty(layer, "visibility", visible);
        map.setFilter(layer, filters[layer]);
      }
    }

    document.getElementById("uspeed-legend").style.display = visible === "visible" ? "block" : "none";
    document.getElementById("uspeed-slider-container").style.display = visible === "visible" ? "block" : "none";

    zoomLock();
    applyLegendVisibility();
  });

  // Weitere Layer-Toggles nach ähnlichem Muster
  setupToggle(map, "toggle-schools", ["schools-points", "schools-polygons"], zoomLock, applyLegendVisibility);
  setupToggle(map, "toggle-health", ["health-points", "health-polygons"], zoomLock, applyLegendVisibility);
  setupToggle(map, "toggle-playgrounds", ["playgrounds-points", "playgrounds-polygons"], zoomLock, applyLegendVisibility);
}


// Telraam-Umschalter Auto/Rad: setzt die Linienfarbe auf den gewählten Modus und
// zeigt die passende Farb-Rampe. Wird einmal beim Setup initialisiert.
function setupTelraamMode(map) {
  const radios = document.querySelectorAll('input[name="telraam-mode"]');
  if (!radios.length) return;

  const apply = (mode) => {
    if (map.getLayer("telraam")) {
      map.setPaintProperty("telraam", "line-color", telraamColorExpr(mode));
    }
    document.querySelectorAll(".telraam-ramp").forEach(el => {
      el.style.display = el.dataset.mode === mode ? "block" : "none";
    });
  };

  radios.forEach(r => r.addEventListener("change", () => {
    const sel = document.querySelector('input[name="telraam-mode"]:checked');
    apply(sel ? sel.value : "bike");
  }));

  const init = document.querySelector('input[name="telraam-mode"]:checked');
  apply(init ? init.value : "bike");
}
