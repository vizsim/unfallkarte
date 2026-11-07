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

// ---------------------------------------------------------------------------------------------
// Trend: nehmen die Unfälle zu oder ab? Verglichen wird 2024/25 mit 2022/23 — nicht früher:
// erst ab 2020 sind alle Länder im Unfallatlas (NRW/Thüringen ab 2019, Berlin ab 2018, MV ab
// 2020; ein Vergleich ab 2017 zeigte dort vor allem den Datenbeginn), und 2020/21 waren
// Corona-Jahre mit deutlich weniger Unfällen. Felder: „UJAHR__<jahr>" aus cluster_modes.pmtiles.
//
// Zwei Jahre gegen zwei sind bei kleinen Clustern meist Zufall (gemessen: bei 95 % Sicherheit
// blieben 87–97 % der Cluster ohne deutlichen Trend). Darum zeigt die FARBE die Tendenz und die
// DECKKRAFT, wie belastbar sie ist: kräftig = deutlich (|z| ≥ 2, Poisson), blass = eher Zufall.
// ---------------------------------------------------------------------------------------------

export const TREND_FOCUS = "TREND";

export const TREND = {
  early: [2022, 2023],
  late: [2024, 2025],
  /** Weniger Unfälle im Zeitraum → grau, ohne Tendenz. */
  minCount: 10,
  /** |z| ab dem eine Veränderung als deutlich gilt (≈ 95 %). */
  significance: 2,
  /** Veränderungs-Stufen: stark ↓ | ↓ | stabil | ↑ | stark ↑ */
  breaks: [-0.2, -0.05, 0.05, 0.2],
  colors: ["#17559b", "#609fd2", "#9e9e9e", "#d87a6b", "#9b1f1d"],
  labels: ["stark rückläufig", "rückläufig", "stabil", "steigend", "stark steigend"],
  /** bundesweit 2022/23 → 2024/25: 525.540 → 541.526 Unfälle (coverage.csv). */
  national: 0.03,
  opacity: { certain: 0.9, uncertain: 0.3 },
};

const yearFields = (years) => years.map((y) => `UJAHR__${y}`);
const EARLY = sum(yearFields(TREND.early));
const LATE = sum(yearFields(TREND.late));
const WINDOW = ["+", EARLY, LATE];
const DIFF = ["-", LATE, EARLY];

/** Trend eines Clusters in JS (Popup, Tests) — dieselbe Rechnung wie die Ausdrücke. */
export function trendOf(props) {
  const get = (years) => yearFields(years).reduce((n, f) => n + (Number(props[f]) || 0), 0);
  const early = get(TREND.early);
  const late = get(TREND.late);
  const window = early + late;
  const change = (late - early) / Math.max(early, 1);
  const z = (late - early) / Math.sqrt(Math.max(window, 1));
  const small = window < TREND.minCount;
  const cls = small ? 2 : TREND.breaks.filter((b) => change >= b).length;
  return { early, late, window, change, z, small, cls, certain: !small && Math.abs(z) >= TREND.significance };
}

function trendStyle() {
  const change = ["/", DIFF, ["max", EARLY, 1]];
  const z = ["/", DIFF, ["sqrt", ["max", WINDOW, 1]]];
  const { colors, breaks, minCount, significance, opacity } = TREND;
  return {
    filter: [">", WINDOW, 0],
    radius: ["interpolate", ["linear"], WINDOW, ...RADIUS_STOPS.flat()],
    color: ["case", ["<", WINDOW, minCount], colors[2],
      ["step", change, colors[0], ...breaks.flatMap((b, i) => [b, colors[i + 1]])]],
    opacity: ["case", ["all", [">=", WINDOW, minCount], [">=", ["abs", z], significance]],
      opacity.certain, opacity.uncertain],
    sortKey: ["-", 0, WINDOW],
  };
}

/** Kreise statt Torten? (eine Beteiligung oder der Trend) */
export const isCircleFocus = (focus) => focus === TREND_FOCUS || Boolean(FOCUS[focus]);

/** Stil der Kreis-Layer je Ansicht (Trend mit eigener Deckkraft je Kreis). */
export function circleStyle(focus) {
  return focus === TREND_FOCUS ? trendStyle() : { ...clusterFocusStyle(focus), opacity: 0.88 };
}

/** Zahl der Unfälle, die der Kreis zeigt — Trend: die im Vergleichszeitraum. */
export const circleCount = (props, focus) => (focus === TREND_FOCUS ? trendOf(props).window : countSelected(props, focus));

/** „+3 %", „−18 %" (mit echtem Minus). */
export const signedPct = (x) => `${x >= 0 ? "+" : "−"}${Math.round(Math.abs(x) * 100)} %`;

/** Legende der Trend-Stufen: „stark rückläufig (≤ −20 %)" … „stark steigend (≥ +20 %)". */
export function trendClassLabels() {
  const [a, b, c, d] = TREND.breaks.map((x) => Math.round(Math.abs(x) * 100));
  const ranges = [`≤ −${a} %`, `−${a} bis −${b} %`, `±${c} %`, `+${c} bis +${d} %`, `≥ +${d} %`];
  return TREND.labels.map((label, i) => `${label} (${ranges[i].replaceAll(" %", "\u00a0%")})`);
}

/** Erklärtext der Cluster-Legende (HTML ohne Fremddaten). */
export function clusterHintHtml(focus) {
  if (focus === TREND_FOCUS) {
    return "Jeder Kreis bündelt mehrere Unfälle. <b>Farbe</b> = Veränderung 2024/25 gegenüber 2022/23, "
      + "<b>kräftig</b> = deutlich, <b>blass</b> = eher Zufall. Frühere Jahre fehlen in einigen Ländern, "
      + "2020/21 waren Corona-Jahre.";
  }
  if (!FOCUS[focus]) {
    return "Jeder Kreis bündelt mehrere Unfälle. <b>Größe</b> = Anzahl, <b>Farbanteile</b> = Schweregrad. "
      + "Alle Jahre, ohne Filter.";
  }
  return `Jeder Kreis bündelt mehrere Unfälle. <b>Größe</b> = Zahl der Unfälle mit ${FOCUS[focus].noun}, `
    + "<b>Farbe</b> = ihr Anteil im Kreis. Alle Jahre, ohne Filter.";
}
