// generatePieIcon.js — Torten-Bilder für die Unfall-Cluster.
//
// MapLibre kann keine Torten zeichnen; jede Torte ist ein Bild, das wir auf Zuruf malen (der
// Style fragt nach einem Namen, der Resolver unten liefert das Bild). Früher hieß das Bild nach
// den exakten Zahlen ("pie-1-23-161"). Fast jeder Cluster hat aber eine eigene Kombination, und
// MapLibre gibt hinzugefügte Bilder nie wieder frei — gemessen 413 Bilder / 26 MB beim Start,
// 2.718 Bilder / 164 MB nach drei Ansichten (z6 → z7 → Ruhrgebiet z8).
//
// Jetzt heißt ein Bild nach Größenstufe + Anteilen in ganzen Prozent ("pie-64-1-12", der Rest
// ist Leichtverletzte). Das ist eine endliche Menge, die sich ständig wiederholt. 1 % = 3,6°,
// am Rand der größten Torte rund 4 Bildpunkte — optisch kein Unterschied. Ein vorhandener, aber
// winziger Anteil (1 Unfall mit Getöteten unter 185) bleibt mindestens 1 %, damit er nicht
// verschwindet. Die genauen Zahlen zeigt das Popup. 2-%-Schritte wären noch schneller
// (gemessen: docs/TODO.md, D3b).
//
// pieImageExpression() und parsePieId() sind REIN (tests/unit/pieIcon.test.js).

const pixelRatio = 2;

/** Bildgrößen-Stufen in CSS-Pixeln; die Anzeige skaliert darüber hinaus per icon-size. */
export const PIE_SIZES = [32, 48, 64];

// Getötete, Schwerverletzte, Leichtverletzte — auch Cluster-Legende (index.html) + Popup (style.css)
const COLORS = ["rgba(228,26,28,1)", "rgba(55,126,184,0.9)", "rgba(77,175,74,0.5)"];

const FIELDS = ["UKATEGORIE__1", "UKATEGORIE__2", "UKATEGORIE__3"];
const count = (field) => ["to-number", ["get", field], 0];
const TOTAL = ["+", ...FIELDS.map(count)];

/** Anteil in ganzen Prozent; ein vorhandener Anteil bleibt mindestens 1 %. */
const percent = (field) => ["max",
  ["round", ["/", ["*", 100, count(field)], ["max", TOTAL, 1]]],
  ["case", [">", count(field), 0], 1, 0]];

/** MapLibre-Ausdruck für den Bildnamen eines Clusters: "pie-<px>-<% Getötete>-<% Schwerverletzte>". */
export function pieImageExpression() {
  return ["concat", "pie-",
    ["case", [">", TOTAL, 100], "64", [">", TOTAL, 10], "48", "32"], "-",
    ["to-string", percent(FIELDS[0])], "-",
    ["to-string", percent(FIELDS[1])]];
}

/** Summe aus den Rohfeldern (combined_cluster trägt alle drei, auch 0). */
const RAW_TOTAL = ["+", ...FIELDS.map((f) => ["get", f])];

/** icon-size: wächst mit der Zahl der Unfälle im Cluster. */
export function pieSizeExpression() {
  return ["interpolate", ["linear"], RAW_TOTAL,
    1, 0.1, 4, 0.2, 10, 0.35, 50, 0.4, 100, 0.5, 500, 0.55, 1000, 0.6,
    5000, 0.7, 10000, 0.75, 20000, 0.8, 40000, 0.9];
}

/** symbol-sort-key: Torten mit viel Leichtverletzten nach unten. */
export function pieSortKey() {
  return ["-", ["/", ["get", FIELDS[2]], RAW_TOTAL]];
}

/** "pie-64-1-12" → { size: 64, shares: [1, 12, 87] }; null für alles andere. */
export function parsePieId(id) {
  const m = /^pie-(\d+)-(\d{1,3})-(\d{1,3})$/.exec(id);
  if (!m || !PIE_SIZES.includes(Number(m[1]))) return null;
  const p1 = Number(m[2]), p2 = Number(m[3]);
  if (p1 > 100 || p2 > 100) return null;
  return { size: Number(m[1]), shares: [p1, p2, Math.max(0, 100 - p1 - p2)] };
}

/** Malt eine Torte (Anteile in Prozent, Summe darf durch Rundung um 1 abweichen). */
export function generatePieIcon({ size, shares }) {
  const total = shares[0] + shares[1] + shares[2];
  if (total === 0) return null;

  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size * pixelRatio;
  const ctx = canvas.getContext("2d");
  const center = (size * pixelRatio) / 2;

  let start = 0;
  for (let i = 0; i < 3; i++) {
    const angle = (shares[i] / total) * 2 * Math.PI;
    ctx.beginPath();
    ctx.moveTo(center, center);
    ctx.arc(center, center, center, start, start + angle);
    ctx.closePath();
    ctx.fillStyle = COLORS[i];
    ctx.fill();
    start += angle;
  }

  // Rand
  ctx.beginPath();
  ctx.arc(center, center, center - 0.5 * pixelRatio, 0, 2 * Math.PI);
  ctx.lineWidth = 0.8 * pixelRatio;
  ctx.strokeStyle = "#e6e6e6";
  ctx.stroke();

  return ctx.getImageData(0, 0, size * pixelRatio, size * pixelRatio);
}

export function setupPieChartImageGeneration(map) {
  // Die Torten entstehen auf Zuruf: der Style fragt nach "pie-…", und wir zeichnen genau dieses
  // Bild. Seit MapLibre 6 läuft das über einen Resolver — das Event `styleimagemissing` ist dort
  // nur noch eine Benachrichtigung NACH dem Scheitern; wer erst dann addImage ruft, kommt zu
  // spät und die Cluster bleiben leer.
  map.setMissingStyleImageResolver((id) => {
    const pie = parsePieId(id);
    if (!pie) return;
    const data = generatePieIcon(pie);
    if (data) map.addImage(id, data, { pixelRatio });
  });
}
