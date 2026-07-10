//zoomLock.js

export function applyZoomLock(map, originalMinZoom, setCurrentZoomLock) {
  const getVis = id => map.getLayoutProperty(id, "visibility") === "visible";

  const movebisVisible = getVis("movebis");
  const schoolsVisible = getVis("schools-points") || getVis("schools-polygons");
  const healthVisible = getVis("health-points") || getVis("health-polygons");
  const playgroundsVisible = getVis("playgrounds-points") || getVis("playgrounds-polygons");
  const crossingsVisible = getVis("crossings-points") || getVis("crossings-lines");
  const uspeedVisible = getVis("uspeed-reverse") || getVis("uspeed-forward");
  // Schwung 1: maxspeed, svz(hvs), obs, laerm, mapillary haben KEINEN harten Zoom-Lock
  // mehr — stattdessen per-Layer minzoom + Zoom-Hinweis (siehe EARLY_CONTEXT in
  // legendHandlers.js). movebis/uspeed/POIs folgen in Schwung 2/3.

  const minZooms = [];
  if (movebisVisible) minZooms.push(13);
  if (schoolsVisible || healthVisible || playgroundsVisible || crossingsVisible || uspeedVisible) minZooms.push(11);

  const strictestMinZoom = minZooms.length > 0 ? Math.max(...minZooms) : originalMinZoom;
  setCurrentZoomLock(strictestMinZoom);
  map.setMinZoom(strictestMinZoom);

  if (map.getZoom() < strictestMinZoom) {
    map.setZoom(strictestMinZoom);
  }
}
