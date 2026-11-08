// Tagesverlauf der gemessenen Pkw-Geschwindigkeit (uspeed) als kleines SVG fürs Popup.
// REIN (kein DOM, kein window) → browserlos getestet in tests/unit/speedProfile.test.js.
//
// Entwurf B „Linie in Tempozonen": dunkle Linie ohne Glättung, dahinter die Legendenfarben
// als Zonen (≤ 30 / 30–50 / > 50 km/h), die Stunde des Reglers als Lot mit Punkt. Fehlende
// Stunden bleiben Lücken (graue Spalte) — nur 38 % der Segmente haben alle 24 Werte, und eine
// geglättete Linie würde dazwischen Werte erfinden. Farben stehen in style.css (.pop-speed-*).

export const HOURS = 24;

// Geometrie im viewBox-Raum: 24 Spalten auf PLOT_W, rechts Platz für die Zonen-Zahlen.
const W = 252;
const PLOT_W = 232;
const GAP = 2;
const COL = (PLOT_W - (HOURS - 1) * GAP) / HOURS;
const TOP = 6;
const PLOT_H = 56;
const BASE = TOP + PLOT_H;
const H = BASE + 16;
const ZONES = [30, 50];          // Grenzen der Legende (js/layers/traffic-speed.js, uspeedColorExpr)
const TICKS = [0, 6, 12, 18, 23];

const r2 = (n) => Math.round(n * 100) / 100;
const colX = (h) => r2(h * (COL + GAP));
const colC = (h) => r2(h * (COL + GAP) + COL / 2);

/** speed_0..speed_23 → 24 Zahlen bzw. null (Stunde ohne Messung = Attribut fehlt). Tiles liefern Strings. */
export function hourlySpeeds(props) {
    return Array.from({ length: HOURS }, (_, h) => {
        const raw = props[`speed_${h}`];
        if (raw === undefined || raw === null || raw === "") return null;
        const v = Number(raw);
        return Number.isFinite(v) ? v : null;
    });
}

/** Gemessene Stunden + langsamste/schnellste Stunde; null, wenn keine Stunde gemessen ist. */
export function profileStats(speeds) {
    const pts = speeds.flatMap((v, h) => (v == null ? [] : [{ h, v }]));
    if (!pts.length) return null;
    const min = pts.reduce((a, b) => (b.v < a.v ? b : a));
    const max = pts.reduce((a, b) => (b.v > a.v ? b : a));
    return { n: pts.length, min, max };
}

const tip = (speeds, h) => (speeds[h] == null ? `${h} Uhr: keine Messung` : `${h} Uhr: ${Math.round(speeds[h])} km/h`);

/**
 * SVG-String für 24 Stundenwerte; `hour` = Stunde des Reglers (wird markiert).
 * Leer, wenn keine Stunde gemessen ist. Jede Stunde trägt ein data-tip (gemeinsamer Tooltip,
 * im fixierten Fenster per Zeiger/Tipp erreichbar).
 */
export function speedProfileSVG(speeds, hour) {
    const stats = profileStats(speeds);
    if (!stats) return "";
    // Achse ab 0, mindestens bis 60 (beide Zonen-Grenzen sichtbar), sonst auf 10 aufgerundet
    const yMax = Math.max(60, Math.ceil(stats.max.v / 10) * 10);
    const y = (v) => r2(TOP + PLOT_H * (1 - v / yMax));

    const zones = `<rect class="pop-speed-z30" x="0" y="${y(30)}" width="${PLOT_W}" height="${r2(BASE - y(30))}"/>`
        + `<rect class="pop-speed-z50" x="0" y="${y(50)}" width="${PLOT_W}" height="${r2(y(30) - y(50))}"/>`
        + `<rect class="pop-speed-zhi" x="0" y="${TOP}" width="${PLOT_W}" height="${r2(y(50) - TOP)}"/>`;
    const zoneLabels = ZONES.map((z) => `<text class="pop-speed-tick" x="${W}" y="${r2(y(z) + 3)}" text-anchor="end">${z}</text>`).join("");
    const gaps = speeds.map((v, h) => (v == null
        ? `<rect class="pop-speed-gap" x="${Math.max(0, r2(colX(h) - GAP / 2))}" y="${TOP}" width="${r2(COL + GAP)}" height="${PLOT_H}"/>`
        : "")).join("");

    // Zusammenhängende Stunden als Linie, einzelne Stunden als Punkt
    let marks = "";
    let run = [];
    const flush = () => {
        if (run.length === 1) marks += `<circle class="pop-speed-pt" cx="${colC(run[0])}" cy="${y(speeds[run[0]])}" r="2.5"/>`;
        else if (run.length > 1) marks += `<path class="pop-speed-line" d="${run.map((h, i) => `${i ? "L" : "M"}${colC(h)},${y(speeds[h])}`).join("")}"/>`;
        run = [];
    };
    speeds.forEach((v, h) => { if (v == null) flush(); else run.push(h); });
    flush();

    const sel = Number.isInteger(hour) && hour >= 0 && hour < HOURS ? hour : null;
    const selMark = sel == null ? "" : `<line class="pop-speed-sel" x1="${colC(sel)}" x2="${colC(sel)}" y1="${TOP}" y2="${BASE}"/>`
        + (speeds[sel] == null ? "" : `<circle class="pop-speed-dot" cx="${colC(sel)}" cy="${y(speeds[sel])}" r="4"/>`);

    // Stunden-Beschriftung: feste Ticks, die Regler-Stunde hervorgehoben (Nachbarn weichen)
    const ticks = TICKS.filter((h) => sel == null || Math.abs(h - sel) >= 2)
        .map((h) => `<text class="pop-speed-tick" x="${colC(h)}" y="${BASE + 13}" text-anchor="middle">${h}</text>`).join("")
        + (sel == null ? "" : `<text class="pop-speed-tick pop-speed-tick--sel" x="${colC(sel)}" y="${BASE + 13}" text-anchor="middle">${sel}</text>`);

    const hits = speeds.map((_, h) => `<rect class="pop-speed-hit" x="${r2(colX(h) - GAP / 2)}" y="0" width="${r2(COL + GAP)}" height="${H}" data-tip="${tip(speeds, h)}"/>`).join("");

    const label = `Ø Geschwindigkeit je Stunde, ${Math.round(stats.min.v)} bis ${Math.round(stats.max.v)} km/h`;
    return `<svg class="pop-speed" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="${label}">`
        + zones + gaps + zoneLabels + marks
        + `<line class="pop-speed-base" x1="0" x2="${PLOT_W}" y1="${BASE + 0.5}" y2="${BASE + 0.5}"/>`
        + selMark + ticks + hits
        + `</svg>`;
}
