//featureCounter.js

export function updateVisibleFeatureCount(map, currentZoomLock, LAYERS, paintStyles) {
  const zoom = map.getZoom();
  let features = [];

  const zoomLockText = currentZoomLock
    ? `<span class="zoom-lock">🔒 ${currentZoomLock}</span>`
    : "";

  const zoomText = `Zoomlevel: ${zoom.toFixed(2)}${zoomLockText ? ` [${zoomLockText}]` : ""}`;

  if (zoom < 11) {
    features = map.queryRenderedFeatures({ layers: LAYERS.clusters });
    const total = features.reduce((sum, f) => sum + (f.properties.point_count || 0), 0);

    document.getElementById("feature-count").innerHTML =
      `<div>Sichtbare Unfälle: ${total.toLocaleString()}</div>
       <div>${zoomText}</div>`;
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

  document.getElementById("feature-count").innerHTML =
    `<div>Sichtbare Unfälle: ${features.length.toLocaleString()}</div>
     <div>${zoomText}</div>`;
}
