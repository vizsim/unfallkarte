// clusterModes.js — Cluster-Ansicht „Anteil EINER Beteiligung" (Kreise statt Torten).
//
// Gewählt wird im Cluster-Block der Legende genau ein Wert (Chips): Schwere (Torten, Standard)
// oder eine Beteiligung. Bei einer Beteiligung zeichnet die Grafikkarte Kreise:
//   Größe = Zahl der Unfälle mit dieser Beteiligung im Cluster,
//   Farbe = ihr Anteil an allen Unfällen des Clusters — im Farbton der Einzelpunkte
//           (Fahrrad blau …), hell = deutlich unter, kräftig = deutlich über dem Bundesschnitt.
// Die Stufen hängen am Bundesschnitt der Kategorie, weil die Anteile sehr verschieden liegen
// (Fuß um 9 %, Rad um 31 %): feste Prozentstufen machten die eine Karte fast weiß, die andere
// fast einfarbig dunkel. Gemessen und begründet in docs/DONE.md (Cluster nach Beteiligung).
//
// Daten: cluster_modes.pmtiles (pipeline/config/tiles.yaml, `cluster_modes_*`) — Beteiligung als
// Bitmaske „BET__<maske>" (Bits wie BET_BITS), dazu „UKATEGORIE__1..3" für die Gesamtzahl. Ein
// Cluster trägt nur, was in ihm vorkommt (fehlend = 0).
//
// REIN (kein DOM) → tests/unit/clusterModes.test.js wertet die Ausdrücke mit MapLibres Style-Spec
// aus; tests/web/cluster-modes.spec.js prüft den Bundesschnitt gegen die Kacheln.

/** Bits der Beteiligungsmaske — Vertrag mit tiles.yaml `beteiligung_bits` (gleiche Reihenfolge). */
export const BET_BITS = ["IstRad", "IstPKW", "IstFuss", "IstKrad", "IstGkfz", "IstSonstig"];

/** Beschriftung aller Beteiligungen (Popup listet sie als Kontext). */
export const BET_LABELS = {
  IstRad: "Fahrrad", IstPKW: "Pkw", IstFuss: "Fußgänger", IstKrad: "Kraftrad", IstGkfz: "Güter-Kfz", IstSonstig: "Sonstige",
};

/** Default: Torten nach Schwere. */
export const PIE_FOCUS = "UKATEGORIE";

/**
 * Wählbare Beteiligungen. `avg` = Bundesschnitt (Anteil aller Unfälle mit dieser Beteiligung,
 * Unfallatlas 2017–2025, berechnet 2026-11-07); `colors` = 5 Stufen hell → kräftig im Farbton der
 * Punktfarbe (js/styleConfig.js), mit dem dataviz-Validator geprüft (monoton, hellste ≥ 2:1 auf der
 * Grundkarte). Pkw und Sonstige fehlen bewusst: Pkw ist fast überall beteiligt (Ø 76 %), das zeigt
 * nichts; „Sonstige" ist zu unbestimmt.
 */
export const FOCUS = {
  IstRad: { noun: "Radbeteiligung", avg: 0.307, colors: ["#71b0e3", "#4195d3", "#2079b5", "#005e98", "#004574"] },
  IstFuss: { noun: "Fußgängerbeteiligung", avg: 0.088, colors: ["#f38578", "#e25c50", "#c33f35", "#a31d1a", "#7c0c0c"] },
  IstKrad: { noun: "Kraftradbeteiligung", avg: 0.137, colors: ["#eb8f52", "#da6900", "#bb4d00", "#9d2f00", "#771d00"] },
  IstGkfz: { noun: "Güter-Kfz-Beteiligung", avg: 0.046, colors: ["#dc9773", "#c87548", "#aa5a2c", "#8d400b", "#6b2c00"] },
};

/** Stufengrenzen als Vielfache des Bundesschnitts: mittlere Stufe = „um den Schnitt" (±25 %). */
export const BREAK_FACTORS = [0.5, 0.8, 1.25, 1.6];

/** Glatt runden: ab 10 % auf ganze Prozent, darunter auf halbe. */
const nice = (share) => {
  const pct = share * 100;
  return (pct >= 10 ? Math.round(pct) : Math.round(pct * 2) / 2) / 100;
};

/** Stufengrenzen (Anteile 0–1) einer Beteiligung. */
export const focusBreaks = (focus) => BREAK_FACTORS.map((f) => nice(FOCUS[focus].avg * f));

const pct = (share) => `${String(Math.round(share * 1000) / 10).replace(".", ",")} %`;
/** Beschriftung der 5 Stufen: „< 15 %", „15–25 %" … „≥ 49 %". */
export function focusClassLabels(focus) {
  const b = focusBreaks(focus);
  const num = (x) => String(Math.round(x * 1000) / 10).replace(".", ",");
  return [`< ${pct(b[0])}`, ...b.slice(1).map((x, i) => `${num(b[i])}–${pct(x)}`), `≥ ${pct(b.at(-1))}`];
}

/** Bundesschnitt als Text („31 %"). */
export const focusAverage = (focus) => `${Math.round(FOCUS[focus].avg * 100)} %`;

const num = (field) => ["to-number", ["get", field], 0];
const sum = (fields) => (fields.length === 0 ? 0 : fields.length === 1 ? num(fields[0]) : ["+", ...fields.map(num)]);

const SEVERITY_FIELDS = ["UKATEGORIE__1", "UKATEGORIE__2", "UKATEGORIE__3"];
/** Alle Unfälle des Clusters: jeder hat genau eine Schwere. */
export const TOTAL = sum(SEVERITY_FIELDS);

/** Summenfelder einer Beteiligung: jede Maske, die ihr Bit trägt (Rad allein, Rad + Pkw, …). */
export function focusFields(focus) {
  const bit = 1 << BET_BITS.indexOf(focus);
  const masks = [];
  for (let m = 1; m < 1 << BET_BITS.length; m++) if (m & bit) masks.push(`BET__${m}`);
  return masks;
}

/** Zahl der Unfälle im Cluster, die die Ansicht zeigt (Torten: alle). JS — für Popup und Zähler. */
export function countSelected(props, focus) {
  const fields = focus === PIE_FOCUS ? SEVERITY_FIELDS : focusFields(focus);
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

/** Stufe (0–4) eines Anteils — wie der step-Ausdruck. */
export const shareClass = (focus, share) => focusBreaks(focus).filter((b) => share >= b).length;

/** Filter, Radius, Farbe und Sortierung der Kreis-Layer für eine Beteiligung. */
export function clusterFocusStyle(focus) {
  const count = sum(focusFields(focus));
  const share = ["/", count, ["max", TOTAL, 1]];
  const { colors } = FOCUS[focus];
  return {
    filter: [">", count, 0],
    radius: ["interpolate", ["linear"], count, ...RADIUS_STOPS.flat()],
    color: ["step", share, colors[0], ...focusBreaks(focus).flatMap((b, i) => [b, colors[i + 1]])],
    sortKey: ["-", 0, count], // große Kreise zuerst zeichnen, kleine obenauf
  };
}

/** Erklärtext der Cluster-Legende (HTML ohne Fremddaten). */
export function clusterHintHtml(focus) {
  if (!FOCUS[focus]) {
    return "Jeder Kreis bündelt mehrere Unfälle. <b>Größe</b> = Anzahl, <b>Farbanteile</b> = Schweregrad. "
      + "Alle Jahre, ohne Filter.";
  }
  return `Jeder Kreis bündelt mehrere Unfälle. <b>Größe</b> = Zahl der Unfälle mit ${FOCUS[focus].noun}, `
    + "<b>Farbe</b> = ihr Anteil im Kreis. Alle Jahre, ohne Filter.";
}
