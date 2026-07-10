//zoomLock.js

export function applyZoomLock(map, originalMinZoom, setCurrentZoomLock) {
  const getVis = id => map.getLayoutProperty(id, "visibility") === "visible";

  const movebisVisible = getVis("movebis");
  const uspeedVisible = getVis("uspeed-reverse") || getVis("uspeed-forward");
  // Schwung 1: maxspeed, svz(hvs), obs, laerm, mapillary — kein harter Zoom-Lock mehr.
  // Schwung 2: Orte & Einrichtungen (schools/health/playgrounds) ab z9 getilt + kleinere Symbole.
  // Schwung 3a: crossings ab z9 getilt (osm_features) + kleinere Symbole → nur noch Zoom-Hinweis.
  // Verbleibend mit hartem Lock: movebis (z13), uspeed (z11) — Legacy, Rebuild in Schwung 3b/c.

  const minZooms = [];
  if (movebisVisible) minZooms.push(13);
  if (uspeedVisible) minZooms.push(11);

  const strictestMinZoom = minZooms.length > 0 ? Math.max(...minZooms) : originalMinZoom;
  setCurrentZoomLock(strictestMinZoom);
  map.setMinZoom(strictestMinZoom);

  if (map.getZoom() < strictestMinZoom) {
    map.setZoom(strictestMinZoom);
  }
}
