//zoomLock.js

export function applyZoomLock(map, originalMinZoom, setCurrentZoomLock) {
  const getVis = id => map.getLayoutProperty(id, "visibility") === "visible";

  const uspeedVisible = getVis("uspeed-reverse") || getVis("uspeed-forward");
  // Schwung 1: maxspeed, svz(hvs), obs, laerm, mapillary — kein harter Zoom-Lock mehr.
  // Schwung 2: Orte & Einrichtungen (schools/health/playgrounds) ab z9 getilt + kleinere Symbole.
  // Schwung 3a: crossings ab z9 getilt (osm_features) + kleinere Symbole → nur noch Zoom-Hinweis.
  // Schwung 3c: movebis in die Pipeline migriert, ab z9 (gestufter visits-Filter) → nur Hinweis.
  // Verbleibend mit hartem Lock: uspeed (z11) — Legacy (Berlin), Rebuild in Schwung 3b.

  const minZooms = [];
  if (uspeedVisible) minZooms.push(11);

  const strictestMinZoom = minZooms.length > 0 ? Math.max(...minZooms) : originalMinZoom;
  setCurrentZoomLock(strictestMinZoom);
  map.setMinZoom(strictestMinZoom);

  if (map.getZoom() < strictestMinZoom) {
    map.setZoom(strictestMinZoom);
  }
}
