//featureCounter.js

import { readClusterView } from "../map/accidentLayers.js";
import { countSelected } from "../map/clusterModes.js";

export function updateVisibleFeatureCount(map, currentZoomLock, LAYERS, paintStyles) {
  const zoom = map.getZoom();
  let features = [];

  // Nur noch die Zahlen-Spans aktualisieren (Symbole/Layout stehen statisch im HTML).
  const setCount = n => {
    const el = document.getElementById("fc-count");
    if (el) el.textContent = n.toLocaleString();
  };
  const el = document.getElementById("fc-zoom");
  if (el) el.textContent = zoom.toFixed(1);
  const lockEl = document.getElementById("fc-lock");
  if (lockEl) lockEl.textContent = currentZoomLock ? `🔒 ${currentZoomLock}` : "";

  if (zoom < 11) {
    // Gezählt wird, was die Cluster zeigen: die angehakten Werte des gewählten Merkmals
    // (Torten: Schwere-Stufen; Kreise: Summen je Merkmalswert) — dieselbe Regel wie die Karte.
    // Die Kreis-Layer entstehen lazy, darum nur vorhandene abfragen (sonst wirft MapLibre).
    features = map.queryRenderedFeatures({ layers: LAYERS.clusters.filter((id) => map.getLayer(id)) });
    // Torten und Kreise sind nie gleichzeitig sichtbar: bei „Schweregrad" ist mode UKATEGORIE.
    const { mode, selected } = readClusterView();
    setCount(features.reduce((sum, f) => sum + countSelected(f.properties, mode, selected), 0));
    return;
  }

  features = map.queryRenderedFeatures({ layers: LAYERS.accidents });

  function updateBadges(features, property, selectorFn = v => v) {
    const counts = features.reduce((acc, f) => {
      const val = selectorFn(f.properties[property]);
      if (val !== undefined) acc[val] = (acc[val] || 0) + 1;
      return acc;
    }, {});
    document.querySelectorAll(`.legend-item[data-group="${property}"]`).forEach(item => {
      const val = item.getAttribute("data-value") ?? item.dataset.field;
      const count = counts[val] || 0;
      const badge = item.querySelector(".count-badge");
      if (badge) badge.textContent = count > 0 ? `${count}` : "";
    });
  }

  updateBadges(features, "UKATEGORIE", v => parseInt(v));
  updateBadges(features, "UJAHR", v => parseInt(v));
  updateBadges(features, "UTYP1", v => parseInt(v));
  updateBadges(features, "UART", v => parseInt(v));

  const beteiligungFields = Object.keys(paintStyles.BETEILIGUNG.colors);
  const beteiligungCounts = {};
  for (const field of beteiligungFields) {
    beteiligungCounts[field] = features.filter(f => f.properties?.[field] === 1).length;
  }
  document.querySelectorAll('.legend-item[data-group="BETEILIGUNG"]').forEach(item => {
    const field = item.dataset.field;
    const count = beteiligungCounts[field] || 0;
    const badge = item.querySelector(".count-badge");
    if (badge) badge.textContent = count > 0 ? `${count}` : "";
  });

  setCount(features.length);
}
