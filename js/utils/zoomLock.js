//zoomLock.js

export function applyZoomLock(map, originalMinZoom, setCurrentZoomLock) {
  const getVis = id => map.getLayoutProperty(id, "visibility") === "visible";

  const movebisVisible = getVis("movebis");
  const crossingsVisible = getVis("crossings-points") || getVis("crossings-lines");
  const uspeedVisible = getVis("uspeed-reverse") || getVis("uspeed-forward");
  // Schwung 1: maxspeed, svz(hvs), obs, laerm, mapillary — kein harter Zoom-Lock mehr.
  // Schwung 2: Orte & Einrichtungen (schools/health/playgrounds) ab z9 getilt + kleinere
  // Symbole → ebenfalls nur noch Zoom-Hinweis (siehe EARLY_CONTEXT in legendHandlers.js).
  // Verbleibend mit hartem Lock: movebis (z13), crossings/uspeed (z11) → Schwung 3.

  const minZooms = [];
  if (movebisVisible) minZooms.push(13);
  if (crossingsVisible || uspeedVisible) minZooms.push(11);

  const strictestMinZoom = minZooms.length > 0 ? Math.max(...minZooms) : originalMinZoom;
  setCurrentZoomLock(strictestMinZoom);
  map.setMinZoom(strictestMinZoom);

  if (map.getZoom() < strictestMinZoom) {
    map.setZoom(strictestMinZoom);
  }
}
