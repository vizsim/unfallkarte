// accidentLayers.js — die Unfall-Layer: Filter, Einfärbung, Sichtbarkeit.
//
// Das ist die Kern-App (Unfälle/Cluster laufen bewusst NICHT über die Layer-Registry,
// siehe js/layers/registry.js). Vorher lag die Logik verstreut in main.js zwischen
// Bootstrap und UI-Verdrahtung; hier steht sie beieinander und hat genau eine Aufgabe:
// aus den Legenden-Häkchen einen MapLibre-Filter machen und die Layer entsprechend
// einfärben bzw. ein-/ausblenden.
//
// Die Karte selbst und der Permalink kommen als Callbacks herein — dieses Modul kennt
// weder Zoom-Lock noch URL-Format.

import { getCircleColorPaint, paintStyles } from "../styleConfig.js";
import { updateLegendColors } from "../ui/legendHandlers.js";

/** Layer-IDs der Kern-App. Auch der Feature-Zähler rechnet damit (js/ui/featureCounter.js). */
export const LAYERS = {
  accidents: ["accident-points"],
  symbols: ["beteiligung-symbols"],
  clusters: ["pie-clusters-fine-layer", "pie-clusters-coarse-layer"],
};

/** Die fünf Filter-Dimensionen des Datensatzes. Reihenfolge = Reihenfolge im Filter. */
const GROUPS = ["UKATEGORIE", "UART", "UTYP1", "UJAHR"];

const selectedValues = (group) =>
  [...document.querySelectorAll(`input[data-group="${group}"]:checked`)].map((cb) => parseInt(cb.value));

const selectedBeteiligungen = () =>
  [...document.querySelectorAll("input[data-field]:checked")].map((cb) => cb.dataset.field);

/** Aktuelle Auswahl je Dimension — einmal lesen, mehrfach verwenden. */
function readSelection() {
  const byGroup = Object.fromEntries(GROUPS.map((g) => [g, selectedValues(g)]));
  const beteiligungen = selectedBeteiligungen();
  return {
    byGroup,
    beteiligungen,
    // Zeigt die Auswahl überhaupt Unfälle? Der Filter verknüpft alle Dimensionen mit UND —
    // ist EINE leer, matcht nichts. Dann den Layer ausblenden statt nur filtern: MapLibre
    // lädt die accidents_single-Tiles sonst trotzdem (unnötiger Download + Aufblitzen).
    // (Diese Prüfung stand früher doppelt da: einmal als accidentsWillShow(), einmal wortgleich
    //  ausgeschrieben in updateLayerFilter.)
    willShow: GROUPS.every((g) => byGroup[g].length > 0) && beteiligungen.length > 0,
  };
}

const detailsOn = () => !!document.getElementById("toggle-details")?.checked;

const setVisible = (map, ids, visible) => {
  for (const id of ids) {
    if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", visible ? "visible" : "none");
  }
};

/**
 * Verdrahtet die Unfall-Layer und liefert die beiden Funktionen, die auch andere Module
 * brauchen.
 *
 * @param {Object} map
 * @param {Object} deps
 * @param {{value: boolean}} deps.isInitializingRef  während des Permalink-Restores kein Rückschreiben
 * @param {() => void} deps.recount                  sichtbare Unfälle neu zählen
 * @param {() => void} deps.writePermalink           URL nachziehen
 * @returns {{updateLayerFilter: Function, updateColorStyle: Function}}
 */
export function setupAccidentLayers(map, { isInitializingRef, recount, writePermalink }) {
  function updateLayerFilter(shouldUpdatePermalink = true, force = false) {
    if (isInitializingRef.value && !force) return;

    const { byGroup, beteiligungen, willShow } = readSelection();

    const filter = ["all",
      // Leere Dimension -> -1 matcht nichts (der Layer wird ohnehin ausgeblendet).
      ...GROUPS.map((g) => ["in", g, ...(byGroup[g].length ? byGroup[g] : [-1])]),
      beteiligungen.length
        ? ["any", ...beteiligungen.map((f) => ["==", f, 1])]
        : ["==", "UKATEGORIE", -1],
    ];

    for (const id of [...LAYERS.accidents, ...LAYERS.symbols]) {
      if (map.getLayer(id)) map.setFilter(id, filter);
    }

    setVisible(map, LAYERS.accidents, willShow);
    setVisible(map, LAYERS.symbols, willShow && detailsOn());

    map.once("idle", recount);
    if (shouldUpdatePermalink && !isInitializingRef.value) writePermalink();
  }

  function updateColorStyle() {
    const selected = document.querySelector('input[name="color-style"]:checked')?.value;
    if (!selected) return;

    const colorExpr = getCircleColorPaint(selected);
    for (const id of LAYERS.accidents) {
      if (!map.getLayer(id)) continue;
      map.setPaintProperty(id, "circle-color", colorExpr);
      map.setPaintProperty(id, "circle-opacity", 0.6);
      // Sichtbarkeit hier NICHT anfassen — die bestimmt updateLayerFilter (auswahlabhängig),
      // sonst würden die accidents_single-Tiles schon vor dem Auflösen der Auswahl geladen.
    }

    // Beteiligungs-Buchstaben nur, wenn Details an sind UND die Auswahl etwas zeigt.
    setVisible(map, LAYERS.symbols, detailsOn() && readSelection().willShow);
    updateLegendColors(selected, paintStyles);
  }

  document.querySelectorAll('input[name="color-style"]').forEach((rb) =>
    rb.addEventListener("change", updateColorStyle));

  document.getElementById("toggle-details")?.addEventListener("change", (e) =>
    setVisible(map, LAYERS.symbols, e.target.checked && readSelection().willShow));

  // Cluster starten versteckt; ab hier steuert sie die Cluster-Checkbox der Legende.
  setVisible(map, LAYERS.clusters, false);

  return { updateLayerFilter, updateColorStyle };
}
