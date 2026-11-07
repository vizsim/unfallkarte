// clusterModes.js — Cluster für die Merkmals-Ansichten (Unfalltyp, Unfallart, Jahr, Beteiligung).
//
// Torten mit 7–10 Stücken gehen nicht: fast jeder Cluster wäre ein eigenes Bild (gemessen, siehe
// docs/DONE.md). Stattdessen zeichnet die Grafikkarte Kreise:
//   Größe = Zahl der angehakten Unfälle im Cluster,
//   Farbe = deren Anteil an allen Unfällen des Clusters (6 Klassen, ein Farbton hell → dunkel).
// Sind alle Werte angehakt, ist der Anteil überall 100 % — dann neutrales Grau.
//
// Daten: cluster_modes.pmtiles (pipeline/config/tiles.yaml, `cluster_modes_*`). Je Merkmalswert
// eine Summe „<SPALTE>__<wert>", die Beteiligung als Bitmaske „BET__<maske>"; ein Cluster trägt
// nur, was in ihm vorkommt (fehlend = 0). So zählt „Rad ODER Fuß" exakt wie der Punktfilter.
//
// REIN (kein DOM, kein window) → tests/unit/clusterModes.test.js wertet die Ausdrücke mit
// MapLibres Style-Spec aus.

/** Merkmale mit Kreis-Ansicht; Schwere (UKATEGORIE) bleibt bei den Torten. */
export const CLUSTER_MODES = ["UTYP1", "UART", "UJAHR", "BETEILIGUNG"];

/** Bits der Beteiligungsmaske — Vertrag mit tiles.yaml `beteiligung_bits` (gleiche Reihenfolge). */
export const BET_BITS = ["IstRad", "IstPKW", "IstFuss", "IstKrad", "IstGkfz", "IstSonstig"];

/** Klassengrenzen des Anteils und eine Farbe je Klasse (Orange, hell → dunkel; geprüft mit
 *  dem dataviz-Validator: monoton, Abstände ≥ 0,06 L, hellste Stufe 2,06:1 auf der Grundkarte). */
export const SHARE_BREAKS = [0.05, 0.1, 0.2, 0.35, 0.5];
export const SHARE_COLORS = ["#ee9748", "#e4762c", "#d75402", "#bc3e13", "#9a2b19", "#752019"];
/** Alles angehakt → kein Anteil zu zeigen. */
export const ALL_SELECTED_COLOR = "#8a8f96";

const num = (field) => ["to-number", ["get", field], 0];
const sum = (fields) => (fields.length === 0 ? 0 : fields.length === 1 ? num(fields[0]) : ["+", ...fields.map(num)]);

/** Alle Unfälle des Clusters: jeder hat genau eine Schwere. */
export const TOTAL = sum(["UKATEGORIE__1", "UKATEGORIE__2", "UKATEGORIE__3"]);

/** Bitmaske der angehakten Beteiligungen (Feldnamen wie in der Legende, z. B. "IstRad"). */
export const betMask = (fields) => fields.reduce((m, f) => (BET_BITS.includes(f) ? m | (1 << BET_BITS.indexOf(f)) : m), 0);

/** Summenfelder der angehakten Werte. Beteiligung: jede Maske mit mindestens einem angehakten Bit. */
export function selectedFields(mode, selected) {
  if (mode === "BETEILIGUNG") {
    const bits = betMask(selected);
    const masks = [];
    for (let m = 1; m < 1 << BET_BITS.length; m++) if (m & bits) masks.push(`BET__${m}`);
    return masks;
  }
  return selected.map((v) => `${mode}__${v}`);
}

/** Zahl der angehakten Unfälle im Cluster (MapLibre-Ausdruck). */
export const countExpression = (mode, selected) => sum(selectedFields(mode, selected));

/** Dieselbe Zählung in JS (Popup, Zähler). Schwere (UKATEGORIE) zählt die angehakten Stufen. */
export function countSelected(props, mode, selected) {
  const fields = mode === "UKATEGORIE" ? selected.map((k) => `UKATEGORIE__${k}`) : selectedFields(mode, selected);
  return fields.reduce((n, f) => n + (Number(props[f]) || 0), 0);
}

/** Kreisradius (px) je Anzahl — Ausdruck und JS (Popup-Verankerung) aus denselben Stützstellen. */
export const RADIUS_STOPS = [[1, 2.5], [10, 5.5], [100, 12], [1000, 19], [10000, 24], [40000, 29]];
export function radiusFor(n) {
  if (n <= RADIUS_STOPS[0][0]) return RADIUS_STOPS[0][1];
  for (let i = 1; i < RADIUS_STOPS.length; i++) {
    const [x1, y1] = RADIUS_STOPS[i];
    if (n <= x1) {
      const [x0, y0] = RADIUS_STOPS[i - 1];
      return y0 + ((n - x0) / (x1 - x0)) * (y1 - y0);
    }
  }
  return RADIUS_STOPS.at(-1)[1];
}

/** Klasse (0–5) eines Anteils — wie der step-Ausdruck. */
export const shareClass = (share) => SHARE_BREAKS.filter((b) => share >= b).length;

/**
 * Filter, Radius und Farbe der Kreis-Layer für ein Merkmal.
 * @param {string} mode       eins aus CLUSTER_MODES
 * @param {Array} selected    angehakte Werte (Zahlen) bzw. Beteiligungs-Felder ("IstRad", …)
 * @param {number} available  wie viele Werte das Merkmal in der Legende hat
 */
export function clusterModeStyle(mode, selected, available) {
  const count = countExpression(mode, selected);
  const share = ["/", count, ["max", TOTAL, 1]];
  const steps = SHARE_BREAKS.flatMap((b, i) => [b, SHARE_COLORS[i + 1]]);
  return {
    filter: [">", count, 0],
    radius: ["interpolate", ["linear"], count, ...RADIUS_STOPS.flat()],
    color: selected.length >= available ? ALL_SELECTED_COLOR : ["step", share, SHARE_COLORS[0], ...steps],
    // große Kreise zuerst zeichnen, kleine obenauf
    sortKey: ["-", 0, count],
  };
}
