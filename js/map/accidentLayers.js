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
import { isClusterSectionOn, updateClusterLegend, updateLegendColors } from "../ui/legendHandlers.js";
import { CIRCLE_LAYERS, PIE_LAYERS, createClusterView } from "./clusterView.js";

/** Layer-IDs der Kern-App. Auch der Feature-Zähler rechnet damit (js/ui/featureCounter.js).
 *  Die Kreis-Cluster entstehen lazy — wer sie abfragt, prüft vorher map.getLayer(). */
export const LAYERS = {
  accidents: ["accident-points"],
  symbols: ["beteiligung-symbols"],
  clusters: [...PIE_LAYERS, ...CIRCLE_LAYERS],
};

/** Die fünf Filter-Dimensionen des Datensatzes. Reihenfolge = Reihenfolge im Filter. */
export const GROUPS = ["UKATEGORIE", "UART", "UTYP1", "UJAHR"];

const selectedValues = (group) =>
  [...document.querySelectorAll(`input[data-group="${group}"]:checked`)].map((cb) => parseInt(cb.value));

const selectedBeteiligungen = () =>
  [...document.querySelectorAll("input[data-field]:checked")].map((cb) => cb.dataset.field);

/** Aktuelle Auswahl je Dimension — einmal lesen, mehrfach verwenden. Auch der Export
 *  filtert damit („wie in der Karte", js/export/accidentExport.js → matchesSelection). */
export function readSelection() {
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

/** Was die Cluster zeigen: Merkmal aus „Färben nach …", dessen angehakte Werte und wie viele
 *  es gibt (Beteiligung: Feldnamen wie „IstRad"). Nur DIESES Merkmal wirkt auf die Cluster. */
export function readClusterView() {
  const mode = document.querySelector('input[name="color-style"]:checked')?.value ?? "UKATEGORIE";
  const { byGroup, beteiligungen } = readSelection();
  if (mode === "BETEILIGUNG") {
    return { mode, selected: beteiligungen, available: document.querySelectorAll("input[data-field]").length };
  }
  return {
    mode,
    selected: byGroup[mode] ?? [],
    available: document.querySelectorAll(`input[data-group="${mode}"]`).length,
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
 * @returns {{updateLayerFilter: Function, updateColorStyle: Function, updateClusterView: Function}}
 */
export function setupAccidentLayers(map, { isInitializingRef, recount, writePermalink }) {
  const clusterView = createClusterView(map, {
    readView: readClusterView,
    isOn: isClusterSectionOn,
    onView: updateClusterLegend,
  });
  // Nach dem Umstellen neu zählen: die Cluster zeigen jetzt andere Zahlen. (Im Filter-Pfad
  // nicht — der zählt ohnehin auf `idle`, und ein Zähldurchgang kostet in dichten Gegenden ~1 s.)
  const updateClusterView = () => clusterView.update().then(() => map.once("idle", recount));

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
    clusterView.update();

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
    updateClusterView();
  }

  document.querySelectorAll('input[name="color-style"]').forEach((rb) =>
    rb.addEventListener("change", updateColorStyle));

  document.getElementById("toggle-details")?.addEventListener("change", (e) =>
    setVisible(map, LAYERS.symbols, e.target.checked && readSelection().willShow));

  // Cluster starten versteckt; ab hier entscheidet clusterView (Merkmal, Häkchen, Legenden-
  // Häkchen „Unfälle-Cluster").
  setVisible(map, LAYERS.clusters, false);

  return { updateLayerFilter, updateColorStyle, updateClusterView };
}
