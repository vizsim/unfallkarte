// charts.js — Diagramme als Inline-SVG (gestochen scharf im PDF, ohne Abhängigkeit).
import { esc } from "./common.js";
import { KAT } from "../model.js";

const roundTop = (x, y, w, h, r) => {
  r = Math.min(r, h, w / 2);
  return `M${x},${y + h} V${y + r} Q${x},${y} ${x + r},${y} H${x + w - r} Q${x + w},${y} ${x + w},${y + r} V${y + h} Z`;
};
const roundRight = (x, y, w, h, r) => {
  r = Math.min(r, w / 2, h / 2);
  return `M${x},${y} H${x + w - r} Q${x + w},${y} ${x + w},${y + r} V${y + h - r} Q${x + w},${y + h} ${x + w - r},${y + h} H${x} Z`;
};

/** Unfälle je Jahr, gestapelt nach Schwere; Jahre außerhalb des Fensters blass. */
export function chartYears(byYear, years, win) {
  const W = 520;
  const H = 190;
  const padL = 30;
  const padR = 8;
  const padT = 12;
  const padB = 28;
  const tot = (y) => byYear[y][1] + byYear[y][2] + byYear[y][3];
  const max = Math.max(3, ...years.map(tot));
  const step = max <= 6 ? 1 : max <= 12 ? 2 : Math.ceil(max / 6);
  const top = Math.ceil(max / step) * step;
  const bw = Math.min(26, ((W - padL - padR) / years.length) * 0.56);
  const x = (i) => padL + ((i + 0.5) * (W - padL - padR)) / years.length;
  const y = (v) => padT + (H - padT - padB) * (1 - v / top);
  const out = [];
  for (let t = 0; t <= top; t += step) out.push(`<line x1="${padL}" x2="${W - padR}" y1="${y(t)}" y2="${y(t)}" stroke="var(--rule)"/><text x="${padL - 6}" y="${y(t) + 4}" text-anchor="end" font-size="11" fill="var(--muted)">${t}</text>`);
  years.forEach((yr, i) => {
    const inW = yr >= win.from && yr <= win.to;
    let base = 0;
    const segs = [];
    for (const kat of [3, 2, 1]) {
      const v = byYear[yr][kat];
      if (!v) continue;
      segs.push({ kat, v, b: base });
      base += v;
    }
    segs.forEach((sg, j) => {
      const isTop = j === segs.length - 1;
      const y1 = y(sg.b + sg.v);
      const h = Math.max(0, y(sg.b) - y1 - (j > 0 ? 2 : 0));
      const d = isTop ? roundTop(x(i) - bw / 2, y1, bw, h, 4) : `M${x(i) - bw / 2},${y1} h${bw} v${h} h${-bw} Z`;
      out.push(`<path d="${d}" fill="var(--sev${sg.kat})" fill-opacity="${inW ? 1 : 0.28}" data-tip="${esc(`${yr}: ${sg.v} × ${KAT[sg.kat]}${inW ? "" : " (außerhalb des Zeitfensters)"}`)}"/>`);
    });
    out.push(`<text x="${x(i)}" y="${H - 9}" text-anchor="middle" font-size="11" fill="${inW ? "var(--ink)" : "var(--muted)"}" font-weight="${inW ? 650 : 400}">${yr}</text>`);
    if (base) out.push(`<text x="${x(i)}" y="${y(base) - 5}" text-anchor="middle" font-size="11" fill="${inW ? "var(--ink-2)" : "var(--muted)"}">${base}</text>`);
  });
  out.push(`<line x1="${padL}" x2="${W - padR}" y1="${y(0)}" y2="${y(0)}" stroke="var(--rule-strong)"/>`);
  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Unfälle mit Personenschaden je Jahr nach Schwere">${out.join("")}</svg>`;
}

/** Waagerechte Balken (Beteiligung, Unfalltypen). */
export function chartHBars(items, n, fmtV) {
  const W = 400;
  const rowH = 26;
  const padL = 158;
  const H = items.length * rowH + 6;
  const max = Math.max(1, ...items.map((i) => i.v));
  const out = [];
  items.forEach((it, i) => {
    const yy = 4 + i * rowH;
    const w = ((W - padL - 60) * it.v) / max;
    out.push(`<text x="${padL - 8}" y="${yy + 15}" text-anchor="end" font-size="12" fill="var(--ink-2)">${esc(it.l)}</text>`);
    out.push(`<rect x="${padL}" y="${yy + 5}" width="${W - padL - 60}" height="14" rx="3" fill="var(--surface-2)"/>`);
    if (it.v) out.push(`<path d="${roundRight(padL, yy + 5, Math.max(4, w), 14, 4)}" fill="var(--accent)" data-tip="${esc(`${it.l}: ${it.v} von ${n}`)}"/>`);
    out.push(`<text x="${padL + Math.max(4, w) + 6}" y="${yy + 16}" font-size="12" fill="var(--ink)">${fmtV(it.v)}</text>`);
  });
  return `<svg viewBox="0 0 ${W} ${H}" role="img">${out.join("")}</svg>`;
}

/** Unfälle nach Stunde (erst ab 10 Fällen, Konzept § 2.3). */
export function chartHours(hours) {
  const W = 520;
  const H = 120;
  const padL = 24;
  const padB = 22;
  const padT = 8;
  const max = Math.max(2, ...hours);
  const bw = Math.min(14, ((W - padL) / 24) * 0.6);
  const x = (h) => padL + ((h + 0.5) * (W - padL)) / 24;
  const y = (v) => padT + (H - padT - padB) * (1 - v / max);
  const out = [];
  for (const t of [0, max]) out.push(`<line x1="${padL}" x2="${W}" y1="${y(t)}" y2="${y(t)}" stroke="var(--rule)"/><text x="${padL - 5}" y="${y(t) + 4}" text-anchor="end" font-size="11" fill="var(--muted)">${t}</text>`);
  hours.forEach((v, h) => {
    if (v) out.push(`<path d="${roundTop(x(h) - bw / 2, y(v), bw, y(0) - y(v), 3)}" fill="var(--accent)" data-tip="${esc(`${h}–${h + 1} Uhr: ${v}`)}"/>`);
    if (h % 3 === 0) out.push(`<text x="${x(h)}" y="${H - 6}" text-anchor="middle" font-size="11" fill="var(--muted)">${h}</text>`);
  });
  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Unfälle nach Stunde">${out.join("")}</svg>`;
}
