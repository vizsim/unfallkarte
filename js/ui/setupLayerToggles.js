// setupLayerToggles.js — verdrahtet die Legenden-Toggles aller Einträge der Layer-Registry.

import { applyZoomLock } from "../utils/zoomLock.js";
import { updateLegendVisibilityByZoom } from "./legendHandlers.js";
import { LAYER_REGISTRY, ensureEntry } from "../layers/registry.js";
import { setupEntryControls } from "./setupEntryControls.js";

export function setupToggle(map, checkboxId, layerIds, applyZoomLock, applyLegendVisibility, ensure, onChange) {
  const checkbox = document.getElementById(checkboxId);
  if (!checkbox) return;

  checkbox.addEventListener("change", (e) => {
    const visibility = e.target.checked ? "visible" : "none";
    if (e.target.checked) ensure?.(); // Lazy: Quellen + Layer beim ersten Einschalten anlegen

    layerIds.forEach(layerId => {
      if (map.getLayer(layerId)) {
        map.setLayoutProperty(layerId, "visibility", visibility);
      }
    });

    applyZoomLock();
    applyLegendVisibility();
    updateLegendVisibilityByZoom(map);  // Legende/Hinweis sofort an Zoom anpassen (z. B. Tempolimit < z11)
    onChange?.();
  });
}

export function setupLayerToggles(map, originalMinZoom, setCurrentZoomLock, applyLegendVisibility, onChange) {
  const zoomLock = () => applyZoomLock(map, originalMinZoom, setCurrentZoomLock);
  const ctx = { zoomLock, applyLegendVisibility, updateLegendVisibilityByZoom, ensure: (id) => ensureEntry(map, id), onChange };

  // Toggle #toggle-<id> schaltet die Layer des Eintrags; Schwellen-/Stunden-Regler und
  // Sonderlogik (Modus-Umschalter, Unter-Haken) bringt der Eintrag als controls/setup mit.
  for (const entry of LAYER_REGISTRY) {
    if (entry.toggle !== "custom") {
      setupToggle(map, `toggle-${entry.id}`, entry.layerIds, zoomLock, applyLegendVisibility,
        () => ensureEntry(map, entry.id), onChange);
    }
    setupEntryControls(map, entry);
    entry.setup?.(map, ctx);
  }
}
