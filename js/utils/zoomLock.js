//zoomLock.js

export function applyZoomLock(map, originalMinZoom, setCurrentZoomLock) {
  const getVis = id => map.getLayoutProperty(id, "visibility") === "visible";

  const movebisVisible = getVis("movebis");
  const hvsVisible = getVis("hvs");
  const mapillaryVisible = getVis("mapillary-images-layer");
  const schoolsVisible = getVis("schools-points") || getVis("schools-polygons");
  const healthVisible = getVis("health-points") || getVis("health-polygons");
  const playgroundsVisible = getVis("playgrounds-points") || getVis("playgrounds-polygons");
  // maxspeed: KEIN Zoom-Lock mehr — stattdessen Zoom-Hinweis unter z11 (wie Radinfra).
  const uspeedVisible = getVis("uspeed-reverse") || getVis("uspeed-forward");
  const obsVisible = getVis("obs");
  const laermVisible = getVis("laerm1") || getVis("laerm2");

  const minZooms = [];
  if (movebisVisible) minZooms.push(13);
  if (schoolsVisible || healthVisible || playgroundsVisible || hvsVisible || uspeedVisible || obsVisible || laermVisible) minZooms.push(11);
  if (mapillaryVisible) minZooms.push(14);

  const strictestMinZoom = minZooms.length > 0 ? Math.max(...minZooms) : originalMinZoom;
  setCurrentZoomLock(strictestMinZoom);
  map.setMinZoom(strictestMinZoom);

  if (map.getZoom() < strictestMinZoom) {
    map.setZoom(strictestMinZoom);
  }
}
