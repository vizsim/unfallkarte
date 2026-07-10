//zoomLock.js

export function applyZoomLock(map, originalMinZoom, setCurrentZoomLock) {
  // Alle Kontext-Layer sind auf per-Layer minzoom + Zoom-Hinweis migriert (siehe
  // EARLY_CONTEXT in js/ui/legendHandlers.js) — es gibt keinen harten Zoom-Lock mehr.
  // Funktion bleibt als No-op erhalten (viele Aufrufer) und hält nur den Basis-minZoom;
  // kein 🔒-Indikator mehr.
  setCurrentZoomLock(null);
  map.setMinZoom(originalMinZoom);
}
