// svgMap.js — schematische Karte der Auswahl als SVG, direkt aus den Vektordaten (Straßen mit
// Tempo, Einrichtungen, Querungen, Haltestellen, Unfälle, Vorschlag). Kein Kartenbild vom
// Server: druckt gestochen scharf und braucht keine CORS-sauberen Grundkarten-Kacheln.
import { esc, fmt } from "./common.js";
import { bufferOutline, sliceLine, circleRing, centroidOf, dist } from "../geometry.js";
import { KAT, TYP, WT, BET, CROSSING_LABEL, STOP_LABEL } from "../model.js";
import { FAC, facLabel } from "../facilities.js";

const WIDTH_M = { motorway: 16, trunk: 14, primary: 12, secondary: 10.5, tertiary: 9, unclassified: 7, residential: 6, living_street: 5, road: 6 };
const FAC_COLOR = { schule: "#2a78d6", foerderschule: "#2a78d6", schule_art: "#2a78d6", kita: "#1baf7a", spielplatz: "#008300", pflegeheim: "#6a4fc4", senioren: "#6a4fc4", krankenhaus: "#d03b3b", klinik: "#d03b3b", behinderung: "#b0851c", berufsschule: "#8a8f8c" };
const MAJOR_HW = new Set(["motorway", "trunk", "primary", "secondary", "tertiary"]);
const speedColor = (v) => (v == null ? null : v <= 30 ? "var(--t30)" : v <= 50 ? "var(--t50)" : "var(--t70)");

const pathOf = (line, Y) => `M${line.map(([x, y]) => `${x.toFixed(1)},${Y(y).toFixed(1)}`).join(" L")}`;
const ringPts = (ring, Y) => ring.map(([x, y]) => `${x.toFixed(1)},${Y(y).toFixed(1)}`).join(" ");

function sign30(x, y, r) {
  return `<g transform="translate(${x},${y})"><circle r="${r}" fill="#fff" stroke="#c1121f" stroke-width="${r * 0.28}"/><text y="${r * 0.36}" text-anchor="middle" font-size="${r}" font-weight="700" font-family="var(--font-sans)" fill="#111">30</text></g>`;
}

/**
 * @param {object} M  Datenmodell
 * @param {object} R  Regelergebnis (für den Vorschlag)
 * @param {{ width?: number, years: {from: number, to: number}, print?: boolean, aspect?: number }} o
 */
export function mapSVG(M, R, { width = 760, years, print = false, aspect = 1.6 } = {}) {
  const sel = M.selection;
  const c = sel.center;
  // Ausschnitt: Auswahl + Rand; Einrichtungen über ihren Pufferumriss.
  const outline = sel.fac ? bufferOutline(sel.fac.geom, sel.r) : circleRing(c, sel.r, 72);
  const xs = outline.map((p) => p[0]);
  const ys = outline.map((p) => p[1]);
  let W = Math.max(xs.reduce((a, b) => Math.max(a, b)) - xs.reduce((a, b) => Math.min(a, b)) + 80, 240);
  let H = Math.max(ys.reduce((a, b) => Math.max(a, b)) - ys.reduce((a, b) => Math.min(a, b)) + 80, 160);
  if (W / H < aspect) W = H * aspect;
  else H = W / aspect;
  const x0 = c[0] - W / 2;
  const x1 = c[0] + W / 2;
  const y0 = c[1] - H / 2;
  const y1 = c[1] + H / 2;
  const k = width / W;
  const px = (v) => v / k;
  const Y = (y) => -y;
  const fs = px(print ? 10 : 11.5);
  const inView = (p, m = 0) => p[0] >= x0 - m && p[0] <= x1 + m && p[1] >= y0 - m && p[1] <= y1 + m;
  const lineInView = (l) => l.some((p) => inView(p, 60));
  const parts = [];
  parts.push(`<rect x="${x0}" y="${Y(y1)}" width="${W}" height="${H}" fill="var(--map-bg)"/>`);

  // Auswahl (unter den Straßen)
  parts.push(`<polygon points="${ringPts(outline, Y)}" fill="var(--accent)" fill-opacity=".08" stroke="var(--accent)" stroke-width="${px(1.6)}" stroke-dasharray="${px(6)} ${px(4)}"/>`);

  // Straßen: Hülle, Fläche, Tempo-Band
  const ways = M.roads.flatMap((r) => r.ways.map((w) => ({ w, r }))).filter(({ w }) => lineInView(w.line));
  // Breite in Metern, aber nie dünner als gut lesbar (bei großen Ausschnitten).
  const wOf = (w) => Math.max(WIDTH_M[w.props.highway] ?? 6, px(MAJOR_HW.has(w.props.highway) ? 8 : 5.5));
  for (const { w } of ways) parts.push(`<path d="${pathOf(w.line, Y)}" stroke="var(--road-casing)" stroke-width="${wOf(w) + px(2.5)}" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`);
  for (const { w } of ways) parts.push(`<path d="${pathOf(w.line, Y)}" stroke="var(--road)" stroke-width="${wOf(w)}" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`);
  for (const { w } of ways) {
    const col = speedColor(w.speed.v);
    if (col) parts.push(`<path d="${pathOf(w.line, Y)}" stroke="${col}" stroke-width="${Math.max(px(2.6), wOf(w) * 0.3)}" stroke-opacity=".9" fill="none" stroke-linecap="round"${w.speed.derived ? ` stroke-dasharray="${px(5)} ${px(3)}"` : ""}/>`);
  }

  // Vorschlag Tempo 30 (Weg A) + Lückenschluss
  const A = R?.A;
  if (A?.candidate && A.seg && M.chain) {
    const seg = sliceLine(M.chain.line, A.seg.a, A.seg.b);
    parts.push(`<path d="${pathOf(seg, Y)}" stroke="var(--t30)" stroke-width="${px(10)}" stroke-opacity=".35" fill="none" stroke-linecap="round"/>`);
    parts.push(`<path d="${pathOf(seg, Y)}" stroke="var(--t30)" stroke-width="${px(2.2)}" stroke-dasharray="${px(7)} ${px(4)}" fill="none"/>`);
    if (A.gap && A.steps.find((s) => s.id === "A9")?.status === "erfuellt") {
      parts.push(`<path d="${pathOf(sliceLine(M.chain.line, A.gap.s0, A.gap.s1), Y)}" stroke="var(--t30)" stroke-width="${px(2.2)}" stroke-dasharray="${px(2)} ${px(4)}" fill="none"/>`);
    }
    for (const end of [seg[0], seg[seg.length - 1]]) if (inView(end)) parts.push(sign30(end[0], Y(end[1]) - px(16), px(10)));
  }

  // Einrichtungen
  const facs = M.facilitiesAll.filter((f) => [...f.geom.points, ...f.geom.polygons.flatMap((p) => p[0])].some((p) => inView(p, 20)));
  const labels = [];
  for (const f of facs) {
    const on = sel.fac && sel.fac.oid === f.oid;
    const col = FAC_COLOR[f.typ] ?? "#777";
    for (const poly of f.geom.polygons) {
      parts.push(`<path d="${poly.map((r) => `M${ringPts(r, Y).replace(/ /g, " L")} Z`).join(" ")}" fill="${col}" fill-opacity="${on ? 0.42 : 0.2}" stroke="${col}" stroke-width="${px(on ? 2.4 : 1.1)}" fill-rule="evenodd"><title>${esc(facLabel(f))}</title></path>`);
    }
    for (const p of f.geom.points) parts.push(`<rect x="${p[0] - px(5)}" y="${Y(p[1]) - px(5)}" width="${px(10)}" height="${px(10)}" rx="${px(2)}" fill="${col}" fill-opacity="${on ? 0.9 : 0.7}" stroke="#fff" stroke-width="${px(1.2)}"><title>${esc(facLabel(f))}</title></rect>`);
    const cen = centroidOf(f.geom);
    if (f.name && cen && inView(cen, -px(20))) labels.push({ x: cen[0], y: cen[1] + (f.geom.polygons.length ? 0 : px(14)), t: f.name, strong: on });
  }

  // Querungen, Haltestellen
  for (const x of M.crossings.filter((q) => inView(q.p))) {
    const [cx, cy] = [x.p[0], Y(x.p[1])];
    if (x.kind === "zebra") parts.push(`<g transform="translate(${cx},${cy})"><rect x="${-px(6)}" y="${-px(6)}" width="${px(12)}" height="${px(12)}" fill="#fff" stroke="#555" stroke-width="${px(0.8)}"/>${[-3.5, 0, 3.5].map((d) => `<rect x="${px(d - 1)}" y="${-px(5)}" width="${px(2)}" height="${px(10)}" fill="#222"/>`).join("")}<title>${CROSSING_LABEL.zebra}</title></g>`);
    else if (x.kind === "lsa") parts.push(`<g transform="translate(${cx},${cy})"><rect x="${-px(4)}" y="${-px(9)}" width="${px(8)}" height="${px(18)}" rx="${px(2)}" fill="#222"/><circle cy="${-px(5)}" r="${px(2)}" fill="#e34948"/><circle r="${px(2)}" fill="#fab219"/><circle cy="${px(5)}" r="${px(2)}" fill="#0ca30c"/><title>${CROSSING_LABEL.lsa}</title></g>`);
    else parts.push(`<circle cx="${cx}" cy="${cy}" r="${px(3)}" fill="#fff" stroke="#555" stroke-width="${px(1)}"><title>${CROSSING_LABEL[x.kind]}</title></circle>`);
  }
  for (const s of M.stops.filter((q) => inView(q.p))) {
    parts.push(`<g transform="translate(${s.p[0]},${Y(s.p[1])})"><circle r="${px(7)}" fill="#f7d000" stroke="#0a7d32" stroke-width="${px(1.8)}"/><text y="${px(3.6)}" text-anchor="middle" font-size="${px(9.5)}" font-weight="700" fill="#0a7d32" font-family="var(--font-sans)">H</text><title>${esc(`${STOP_LABEL[s.mode]}${s.name ? `: ${s.name}` : ""}`)}</title></g>`);
  }

  // Straßennamen: Stelle auf einem langen Segment, möglichst weit weg von der Auswahlmitte
  // (dort liegen Unfälle und Symbole), aber mit Abstand zum Kartenrand.
  const named = new Map();
  for (const { w, r } of ways) {
    const nm = w.props.name || r.ref;
    if (!nm) continue;
    for (let i = 1; i < w.line.length; i++) {
      const a = w.line[i - 1];
      const b = w.line[i];
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (len < px(90)) continue;
      const n = Math.max(1, Math.floor(len / px(40)));
      for (let k = 0; k <= n; k++) {
        const t = k / n;
        const mid = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
        if (!inView(mid, -px(70))) continue;
        const score = Math.min(dist(mid, c), W * 0.45) + Math.min(len, px(200)) * 0.2;
        const cur = named.get(nm);
        if (!cur || score > cur.score) named.set(nm, { a, b, mid, len, score, ref: r.ref, major: !r.minor });
      }
    }
  }
  for (const [nm, s] of named) {
    let ang = (Math.atan2(-(s.b[1] - s.a[1]), s.b[0] - s.a[0]) * 180) / Math.PI;
    if (ang > 90) ang -= 180;
    if (ang < -90) ang += 180;
    const text = s.ref && s.ref !== nm ? `${nm} · ${s.ref}` : nm;
    parts.push(`<text transform="translate(${s.mid[0]},${Y(s.mid[1])}) rotate(${ang.toFixed(1)})" dy="${fs * 0.35}" text-anchor="middle" font-size="${fs}" font-family="var(--font-sans)" font-weight="${s.major ? 650 : 500}" fill="var(--map-label)" paint-order="stroke" stroke="var(--map-bg)" stroke-width="${fs * 0.3}" stroke-linejoin="round">${esc(text)}</text>`);
  }
  for (const l of labels) {
    parts.push(`<text x="${l.x}" y="${Y(l.y)}" text-anchor="middle" font-size="${fs * 0.95}" font-family="var(--font-sans)" font-weight="${l.strong ? 650 : 500}" fill="var(--map-label)" paint-order="stroke" stroke="var(--map-bg)" stroke-width="${fs * 0.3}" stroke-linejoin="round">${esc(l.t)}</text>`);
  }

  // Unfälle: gefüllt = in Auswahl und Zeitfenster, hohl = außerhalb
  const acc = M.accidents.all.filter((a) => inView(a.p));
  acc.sort((a, b) => b.kat - a.kat);
  for (const a of acc) {
    const on = sel.contains(a.p) && a.j >= years.from && a.j <= years.to;
    const tip = `${KAT[a.kat]} · ${a.j}-${String(a.m).padStart(2, "0")}\n${WT[a.wt] ?? ""}, ${a.h} Uhr · ${TYP[a.typ] ?? ""}\nBeteiligt: ${a.bet.map((b) => BET[b]).join(", ") || "–"}${on ? "" : "\n(außerhalb der Auswahl oder des Zeitfensters)"}`;
    parts.push(`<circle cx="${a.p[0].toFixed(1)}" cy="${Y(a.p[1]).toFixed(1)}" r="${px(on ? 5.5 : 4)}" fill="${on ? `var(--sev${a.kat})` : "var(--surface)"}" stroke="${on ? "var(--surface)" : `var(--sev${a.kat})`}" stroke-width="${px(on ? 1.6 : 1.4)}"${on ? "" : ' stroke-opacity=".75"'} data-tip="${esc(tip)}"/>`);
  }

  // Mittelpunkt, Maßstab, Norden, Quelle
  parts.push(`<circle cx="${c[0]}" cy="${Y(c[1])}" r="${px(3)}" fill="var(--accent)"/>`);
  const sb = W > 700 ? 200 : W > 350 ? 100 : 50;
  const sx = x1 - px(22) - sb;
  const sy = Y(y0) - px(20);
  parts.push(`<g font-family="var(--font-sans)" font-size="${fs * 0.9}" fill="var(--map-label)"><rect x="${sx - px(6)}" y="${sy - px(17)}" width="${sb + px(12)}" height="${px(27)}" rx="${px(4)}" fill="var(--surface)" fill-opacity=".88"/><path d="M${sx},${sy} h${sb}" stroke="var(--map-label)" stroke-width="${px(2)}"/><path d="M${sx},${sy - px(4)} v${px(8)} M${sx + sb},${sy - px(4)} v${px(8)}" stroke="var(--map-label)" stroke-width="${px(1.5)}"/><text x="${sx + sb / 2}" y="${sy - px(5)}" text-anchor="middle">${fmt(sb)} m</text></g>`);
  parts.push(`<g transform="translate(${x1 - px(22)},${Y(y1) + px(26)})" font-family="var(--font-sans)"><path d="M0,${-px(12)} L${px(6)},${px(6)} L0,${px(2)} L${-px(6)},${px(6)} Z" fill="var(--map-label)"/><text y="${px(18)}" text-anchor="middle" font-size="${fs * 0.85}" fill="var(--map-label)">N</text></g>`);
  parts.push(`<text x="${x0 + px(8)}" y="${Y(y0) - px(8)}" font-size="${fs * 0.78}" font-family="var(--font-sans)" fill="var(--map-label)" fill-opacity=".85" paint-order="stroke" stroke="var(--map-bg)" stroke-width="${fs * 0.25}">© OpenStreetMap-Mitwirkende (ODbL) · Unfallatlas (dl-de/by-2-0)</text>`);

  const hPx = Math.round(H * k);
  return `<svg viewBox="${x0.toFixed(1)} ${Y(y1).toFixed(1)} ${W.toFixed(1)} ${H.toFixed(1)}" width="${width}" height="${hPx}" role="img" aria-label="Schematische Karte der Auswahl" preserveAspectRatio="xMidYMid meet">${parts.join("")}</svg>`;
}

/** Legende zur Karte (HTML). */
export function mapLegend() {
  return `<div class="maplegend"><span><i class="sw" style="background:var(--sev1)"></i>Getötete</span><span><i class="sw" style="background:var(--sev2)"></i>Schwerverletzte</span><span><i class="sw" style="background:var(--sev3)"></i>Leichtverletzte</span><span><i class="sw" style="border:1.5px solid var(--sev2);background:var(--surface)"></i>außerhalb Auswahl/Zeitfenster</span><span><i class="sw bar" style="background:var(--t30)"></i>≤ 30 km/h</span><span><i class="sw bar" style="background:var(--t50)"></i>50 km/h</span><span><i class="sw bar" style="background:var(--t70)"></i>&gt; 50 km/h</span><span><span class="sign30">30</span>Vorschlag</span><span class="muted">gestrichelt = Tempo abgeleitet</span></div>`;
}

export { FAC };
