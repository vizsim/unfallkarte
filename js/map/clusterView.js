// clusterView.js — EIN Zuständiger für die Cluster-Darstellung (Zoom 6–11).
//
// Gewählt wird im Cluster-Block der Legende genau ein Wert (Chips, name="cluster-focus"):
//   Schwere (Standard)  → Torten aus combined_cluster.pmtiles, alle Unfälle;
//   eine Beteiligung    → Kreise aus cluster_modes.pmtiles: Größe = Zahl der Unfälle mit
//                         dieser Beteiligung, Farbe = ihr Anteil (js/map/clusterModes.js).
// Unabhängig von den Filtern der Einzelpunkte — die gelten erst ab Zoom 11.
// Quelle + Kreis-Layer entstehen erst beim ersten Wechsel auf eine Beteiligung (der
// Kartenstart lädt nicht einmal den Kopf der Datei). Sichtbarkeit setzt NUR dieses Modul;
// das Legenden-Häkchen „Unfälle-Cluster" fragt es über isOn() ab.

import { FOCUS, clusterFocusStyle } from "./clusterModes.js";
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

/**
 * @param {Object} map
 * @param {Object} deps
 * @param {() => string} deps.readFocus   "UKATEGORIE" (Torten) oder eine Beteiligung ("IstRad" …)
 * @param {() => boolean} deps.isOn       Legenden-Häkchen „Unfälle-Cluster"
 * @param {(focus: string) => void} [deps.onView]  z. B. Cluster-Legende nachziehen
 * @returns {{update: () => Promise<void>}}
 */
export function createClusterView(map, { readFocus, isOn, onView = () => {} }) {
  let generation = 0;

  async function update() {
    const gen = ++generation;
    const focus = readFocus();
    const on = isOn();
    const circles = Boolean(FOCUS[focus]);
    onView(focus);

    setVisible(map, [...PIE_LAYERS, HOVER_PIE], on && !circles);
    if (!on || !circles) {
      setVisible(map, [...CIRCLE_LAYERS, HOVER_RING], false);
      return;
    }

    await ensureLazyAccidentSource(map, SOURCE);
    if (gen !== generation) return; // inzwischen neuer Zustand — der zieht selbst nach
    addCircleLayers(map);
    const style = clusterFocusStyle(focus);
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
