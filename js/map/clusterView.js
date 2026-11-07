// clusterView.js — EIN Zuständiger für die Cluster-Darstellung (Zoom 6–11).
//
// Was gezeigt wird, folgt „Färben nach …" in der Legende und den Häkchen DIESES Merkmals:
//   Schweregrad          → Torten (combined_cluster.pmtiles), nach den angehakten Stufen;
//   Beteiligung, Jahr,   → Kreise aus cluster_modes.pmtiles: Größe = Zahl der angehakten,
//   Unfalltyp, Unfallart   Farbe = deren Anteil (js/map/clusterModes.js).
// Quelle + Kreis-Layer entstehen erst beim ersten Wechsel auf ein solches Merkmal (der
// Kartenstart lädt nicht einmal den Kopf der Datei). Sichtbarkeit setzt NUR dieses Modul;
// das Legenden-Häkchen „Unfälle-Cluster" fragt es über isOn() ab.

import { CLUSTER_MODES, clusterModeStyle } from "./clusterModes.js";
import { pieFilter, pieImageExpression, pieSizeExpression, pieSortKey } from "../utils/generatePieIcon.js";
import { ensureLazyAccidentSource } from "../mapdata/addSources.js";

export const PIE_LAYERS = ["pie-clusters-fine-layer", "pie-clusters-coarse-layer"];
export const CIRCLE_LAYERS = ["cluster-modes-fine", "cluster-modes-coarse"];
const HOVER_PIE = "hover-pie";
const HOVER_RING = "hover-ring";
const SOURCE = "accidents-cluster-modes";

const setVisible = (map, ids, visible) => {
  for (const id of ids) {
    if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", visible ? "visible" : "none");
  }
};

function addCircleLayers(map) {
  if (map.getLayer(CIRCLE_LAYERS[0])) return;
  // unter die Hover-Torte, damit Hover-Markierungen obenauf liegen
  const before = map.getLayer(HOVER_PIE) ? HOVER_PIE : undefined;
  const layers = [
    [CIRCLE_LAYERS[1], "clusters_6_8", 6, 9],
    [CIRCLE_LAYERS[0], "clusters_9_11", 9, 11],
  ];
  for (const [id, sourceLayer, minzoom, maxzoom] of layers) {
    map.addLayer({
      id, type: "circle", source: SOURCE, "source-layer": sourceLayer, minzoom, maxzoom,
      layout: { visibility: "none" },
      paint: { "circle-opacity": 0.88, "circle-stroke-color": "#ffffff", "circle-stroke-width": 1 },
    }, before);
  }
  // Hover-Markierung der Kreise: Ring um den gehoverten Cluster (Quelle wie die Hover-Torte)
  map.addLayer({
    id: HOVER_RING, type: "circle", source: "hover-point",
    layout: { visibility: "none" },
    paint: { "circle-color": "rgba(0,0,0,0)", "circle-stroke-color": "#111827", "circle-stroke-width": 2 },
  }, before);
}

function applyPies(map, severities) {
  for (const id of PIE_LAYERS) {
    if (!map.getLayer(id)) continue;
    map.setLayoutProperty(id, "icon-image", pieImageExpression(severities));
    map.setLayoutProperty(id, "icon-size", pieSizeExpression(severities));
    map.setLayoutProperty(id, "symbol-sort-key", pieSortKey(severities));
    map.setFilter(id, pieFilter(severities));
  }
  if (map.getLayer(HOVER_PIE)) map.setLayoutProperty(HOVER_PIE, "icon-image", pieImageExpression(severities));
}

/**
 * @param {Object} map
 * @param {Object} deps
 * @param {() => {mode: string, selected: Array, available: number}} deps.readView
 * @param {() => boolean} deps.isOn       Legenden-Häkchen „Unfälle-Cluster"
 * @param {(view: Object) => void} [deps.onView]  z. B. Cluster-Legende nachziehen
 * @returns {{update: () => Promise<void>}}
 */
export function createClusterView(map, { readView, isOn, onView = () => {} }) {
  let generation = 0;

  async function update() {
    const gen = ++generation;
    const view = readView();
    const on = isOn();
    const circles = CLUSTER_MODES.includes(view.mode);
    onView(view);

    if (!circles) applyPies(map, view.selected);
    setVisible(map, [...PIE_LAYERS, HOVER_PIE], on && !circles);
    if (!on || !circles) {
      setVisible(map, [...CIRCLE_LAYERS, HOVER_RING], false);
      return;
    }

    await ensureLazyAccidentSource(map, SOURCE);
    if (gen !== generation) return; // inzwischen neuer Zustand — der zieht selbst nach
    addCircleLayers(map);
    const style = clusterModeStyle(view.mode, view.selected, view.available);
    for (const id of CIRCLE_LAYERS) {
      map.setFilter(id, style.filter);
      map.setPaintProperty(id, "circle-radius", style.radius);
      map.setPaintProperty(id, "circle-color", style.color);
      map.setLayoutProperty(id, "circle-sort-key", style.sortKey);
    }
    map.setPaintProperty(HOVER_RING, "circle-radius", ["+", style.radius, 3]);
    setVisible(map, [...CIRCLE_LAYERS, HOVER_RING], true);
  }

  return { update };
}
