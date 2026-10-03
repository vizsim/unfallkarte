// areaSelection.js — das gezeichnete Gebiet (genau eins), unabhängig davon, wer es nutzt: heute
// der Export, später ein Report. Hält die Geometrie, zeigt sie als schlichte Fläche und meldet
// Änderungen (→ Permalink `sel=g:`, main.js).
//
// Gezeichnet und bearbeitet wird mit Terra Draw in drawArea.js — das lädt erst beim Zeichnen.
// Ein Gebiet aus einem geteilten Link braucht es nicht: die Anzeige hier ist ein einfacher
// GeoJSON-Layer. Quelle und Layer entstehen erst, wenn es ein Gebiet gibt.

const SOURCE = "selection-area";
export const AREA_LAYERS = ["selection-area-fill", "selection-area-line"];
export const AREA_COLOR = "#4338ca";

let area = null;   // GeoJSON Polygon in Länge/Breite, oder null
const listeners = new Set();

export const getArea = () => area;
export const onAreaChange = (cb) => listeners.add(cb);

/** Gebiet setzen (null = löschen). `silent`: ohne Meldung, z. B. beim Anwenden eines Links. */
export function setArea(map, geometry, { silent = false } = {}) {
  area = geometry ?? null;
  render(map);
  if (!silent) for (const cb of listeners) cb(area);
}

/** Während des Bearbeitens zeigt Terra Draw das Gebiet — die eigene Fläche tritt solange zurück. */
export function setAreaVisible(map, visible) {
  for (const id of AREA_LAYERS) {
    if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", visible ? "visible" : "none");
  }
}

function render(map) {
  // Eigene, schlichte Objekte — nie Features aus queryRenderedFeatures (Null-Prototyp, CLAUDE.md).
  const data = {
    type: "FeatureCollection",
    features: area ? [{ type: "Feature", geometry: area, properties: {} }] : [],
  };
  const source = map.getSource(SOURCE);
  if (source) {
    source.setData(data);
    return;
  }
  if (!area) return;
  map.addSource(SOURCE, { type: "geojson", data });
  map.addLayer({
    id: AREA_LAYERS[0], type: "fill", source: SOURCE,
    paint: { "fill-color": AREA_COLOR, "fill-opacity": 0.06 },
  });
  map.addLayer({
    id: AREA_LAYERS[1], type: "line", source: SOURCE,
    paint: { "line-color": AREA_COLOR, "line-width": 2.5, "line-dasharray": [2, 1.5] },
  });
}
