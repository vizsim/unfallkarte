// geometry.js — Metrik für den Report. REIN (kein DOM), browserlos getestet.
//
// Der Report rechnet in einer lokalen Tangentialebene um den Mittelpunkt der Auswahl (Meter,
// x nach Osten, y nach Norden). Für Flächen bis ~10 km² weicht das weniger als 0,1 % von
// EPSG:25832 ab (Konzept § 8.2). Die CRS-Regel aus CLAUDE.md (25832 für Metrik) gilt weiter
// für die Pipeline; Referenzwerte rechnet ausschließlich sie.
//
// Geometrien: Punkt [x, y]; Linie [[x, y], …]; Polygon [Außenring, …Löcher]; Ringe offen
// oder geschlossen (der letzte Punkt darf den ersten wiederholen).

const RAD = Math.PI / 180;

/** Lokale Projektion um (lat0, lng0): Meter je Grad nach den WGS84-Reihenentwicklungen. */
export function localProjection(lat0, lng0) {
  const phi = lat0 * RAD;
  const mLat = 111132.954 - 559.822 * Math.cos(2 * phi) + 1.175 * Math.cos(4 * phi);
  const mLng = 111412.84 * Math.cos(phi) - 93.5 * Math.cos(3 * phi) + 0.118 * Math.cos(5 * phi);
  return {
    lat0,
    lng0,
    mLat,
    mLng,
    xy: ([lng, lat]) => [(lng - lng0) * mLng, (lat - lat0) * mLat],
    lngLat: ([x, y]) => [lng0 + x / mLng, lat0 + y / mLat],
    /** Umrandung [west, süd, ost, nord] eines Quadrats mit halber Kantenlänge `m` Metern. */
    bbox: (m) => [lng0 - m / mLng, lat0 - m / mLat, lng0 + m / mLng, lat0 + m / mLat],
  };
}

export const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);

/** Lot von p auf die Strecke a–b: Abstand d, Parameter t ∈ [0, 1], Fußpunkt q. */
export function projectOnSegment(p, a, b) {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len2 = dx * dx + dy * dy;
  let t = len2 > 0 ? ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len2 : 0;
  t = Math.max(0, Math.min(1, t));
  const q = [a[0] + t * dx, a[1] + t * dy];
  return { d: dist(p, q), t, q };
}

export function lineLength(line) {
  let s = 0;
  for (let i = 1; i < line.length; i++) s += dist(line[i - 1], line[i]);
  return s;
}

/** Nächster Punkt auf einer Linie: Abstand d, Segment i, Fußpunkt q, Bogenlänge s bis q. */
export function nearestOnLine(p, line) {
  let best = { d: Infinity, i: -1, t: 0, q: line[0], s: 0 };
  let acc = 0;
  for (let i = 1; i < line.length; i++) {
    const r = projectOnSegment(p, line[i - 1], line[i]);
    const seg = dist(line[i - 1], line[i]);
    if (r.d < best.d) best = { d: r.d, i: i - 1, t: r.t, q: r.q, s: acc + r.t * seg };
    acc += seg;
  }
  if (line.length === 1) best = { d: dist(p, line[0]), i: 0, t: 0, q: line[0], s: 0 };
  return best;
}

/** Punkt bei Bogenlänge s auf der Linie (auf die Enden begrenzt). */
export function pointAt(line, s) {
  if (s <= 0) return line[0];
  let acc = 0;
  for (let i = 1; i < line.length; i++) {
    const seg = dist(line[i - 1], line[i]);
    if (acc + seg >= s) {
      const t = seg > 0 ? (s - acc) / seg : 0;
      return [line[i - 1][0] + t * (line[i][0] - line[i - 1][0]), line[i - 1][1] + t * (line[i][1] - line[i - 1][1])];
    }
    acc += seg;
  }
  return line[line.length - 1];
}

/** Teilstück der Linie zwischen den Bogenlängen s0 und s1. */
export function sliceLine(line, s0, s1) {
  const a = Math.max(0, Math.min(s0, s1));
  const b = Math.max(s0, s1);
  const out = [pointAt(line, a)];
  let acc = 0;
  for (let i = 1; i < line.length; i++) {
    acc += dist(line[i - 1], line[i]);
    if (acc > a && acc < b) out.push(line[i]);
  }
  out.push(pointAt(line, b));
  return out;
}

const openRing = (ring) => (ring.length > 1 && ring[0][0] === ring[ring.length - 1][0] && ring[0][1] === ring[ring.length - 1][1] ? ring.slice(0, -1) : ring);

/** Vorzeichenbehaftete Fläche (gegen den Uhrzeigersinn positiv, y nach oben). */
export function ringArea(ring) {
  const r = openRing(ring);
  let s = 0;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) s += (r[j][0] - r[i][0]) * (r[j][1] + r[i][1]);
  return s / 2;
}

export const polygonArea = (poly) => poly.reduce((s, ring, i) => s + (i === 0 ? 1 : -1) * Math.abs(ringArea(ring)), 0);

export function pointInRing(p, ring) {
  const r = openRing(ring);
  let inside = false;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    const [xi, yi] = r[i];
    const [xj, yj] = r[j];
    if ((yi > p[1]) !== (yj > p[1]) && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

export const pointInPolygon = (p, poly) => pointInRing(p, poly[0]) && !poly.slice(1).some((h) => pointInRing(p, h));

function ringEdges(ring) {
  const r = openRing(ring);
  return r.map((a, i) => [a, r[(i + 1) % r.length]]);
}

/** Abstand Punkt–Polygon (0, wenn innen). */
export function distToPolygon(p, poly) {
  if (pointInPolygon(p, poly)) return 0;
  let best = Infinity;
  for (const ring of poly) for (const [a, b] of ringEdges(ring)) best = Math.min(best, projectOnSegment(p, a, b).d);
  return best;
}

function segmentsIntersect(a, b, c, d) {
  const o = (p, q, r) => Math.sign((q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]));
  const o1 = o(a, b, c);
  const o2 = o(a, b, d);
  const o3 = o(c, d, a);
  const o4 = o(c, d, b);
  return o1 !== o2 && o3 !== o4 && o1 !== 0 && o2 !== 0 && o3 !== 0 && o4 !== 0;
}

export function segSegDist(a, b, c, d) {
  if (segmentsIntersect(a, b, c, d)) return 0;
  return Math.min(projectOnSegment(a, c, d).d, projectOnSegment(b, c, d).d, projectOnSegment(c, a, b).d, projectOnSegment(d, a, b).d);
}

const segmentsOfLine = (line) => line.slice(1).map((b, i) => [line[i], b]);

/**
 * Geometrie in einheitlicher Form: { points: [[x,y]…], lines: [[[x,y]…]…], polygons: [poly…] }.
 * Einzelstücke eines Objekts (an Kachelkanten zerschnitten) landen im selben Objekt.
 */
export const emptyGeom = () => ({ points: [], lines: [], polygons: [] });

/** Kleinster Abstand zwischen einem Punkt und einer zusammengesetzten Geometrie. */
export function distPointGeom(p, g) {
  let best = Infinity;
  for (const q of g.points) best = Math.min(best, dist(p, q));
  for (const l of g.lines) best = Math.min(best, nearestOnLine(p, l).d);
  for (const poly of g.polygons) best = Math.min(best, distToPolygon(p, poly));
  return best;
}

/** Kleinster Abstand zwischen einer Geometrie und einer Linie (0 bei Schnitt/Überdeckung). */
export function distGeomLine(g, line) {
  let best = Infinity;
  const segs = segmentsOfLine(line);
  for (const q of g.points) best = Math.min(best, nearestOnLine(q, line).d);
  for (const l of g.lines) for (const [a, b] of segmentsOfLine(l)) for (const [c, d] of segs) best = Math.min(best, segSegDist(a, b, c, d));
  for (const poly of g.polygons) {
    if (line.some((p) => pointInPolygon(p, poly))) return 0;
    for (const ring of poly) for (const [a, b] of ringEdges(ring)) for (const [c, d] of segs) best = Math.min(best, segSegDist(a, b, c, d));
  }
  return best;
}

/** Repräsentativer Punkt: flächengewichteter Schwerpunkt, sonst Mittel der Linien/Punkte. */
export function centroidOf(g) {
  let ax = 0;
  let ay = 0;
  let aw = 0;
  for (const poly of g.polygons) {
    const r = openRing(poly[0]);
    let a = 0;
    let cx = 0;
    let cy = 0;
    for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
      const f = r[j][0] * r[i][1] - r[i][0] * r[j][1];
      a += f;
      cx += (r[j][0] + r[i][0]) * f;
      cy += (r[j][1] + r[i][1]) * f;
    }
    if (Math.abs(a) > 1e-9) {
      const w = Math.abs(a / 2);
      ax += (cx / (3 * a)) * w;
      ay += (cy / (3 * a)) * w;
      aw += w;
    }
  }
  if (aw > 0) return [ax / aw, ay / aw];
  const pts = [...g.points, ...g.lines.flat(), ...g.polygons.flatMap((p) => p[0])];
  if (!pts.length) return null;
  return [pts.reduce((s, p) => s + p[0], 0) / pts.length, pts.reduce((s, p) => s + p[1], 0) / pts.length];
}

/** Kreis als Polygonring (gegen den Uhrzeigersinn). */
export function circleRing(c, r, n = 64) {
  return Array.from({ length: n }, (_, i) => {
    const a = (2 * Math.PI * i) / n;
    return [c[0] + r * Math.cos(a), c[1] + r * Math.sin(a)];
  });
}

/** Sutherland–Hodgman: Ring an einem KONVEXEN Ring (gegen den Uhrzeigersinn) schneiden. */
export function clipRingConvex(ring, clip) {
  let out = openRing(ring);
  const c = openRing(clip);
  for (let i = 0; i < c.length && out.length; i++) {
    const a = c[i];
    const b = c[(i + 1) % c.length];
    const inside = (p) => (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]) >= 0;
    const cut = (p, q) => {
      const x1 = p[0]; const y1 = p[1]; const x2 = q[0]; const y2 = q[1];
      const x3 = a[0]; const y3 = a[1]; const x4 = b[0]; const y4 = b[1];
      const den = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4);
      if (den === 0) return q;
      const t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / den;
      return [x1 + t * (x2 - x1), y1 + t * (y2 - y1)];
    };
    const input = out;
    out = [];
    for (let k = 0; k < input.length; k++) {
      const cur = input[k];
      const prev = input[(k + input.length - 1) % input.length];
      if (inside(cur)) {
        if (!inside(prev)) out.push(cut(prev, cur));
        out.push(cur);
      } else if (inside(prev)) out.push(cut(prev, cur));
    }
  }
  return out;
}

/** Ring an einem achsparallelen Rechteck [x0, y0, x1, y1] schneiden. */
export function clipRingBox(ring, [x0, y0, x1, y1]) {
  return clipRingConvex(ring, [[x0, y0], [x1, y0], [x1, y1], [x0, y1]]);
}

/** Linie an einem achsparallelen Rechteck schneiden (Liang–Barsky je Segment) → Teillinien. */
export function clipLineBox(line, [x0, y0, x1, y1]) {
  const out = [];
  let cur = null;
  const close = () => { if (cur && cur.length > 1) out.push(cur); cur = null; };
  for (let i = 1; i < line.length; i++) {
    const [ax, ay] = line[i - 1];
    const [bx, by] = line[i];
    const dx = bx - ax;
    const dy = by - ay;
    let t0 = 0;
    let t1 = 1;
    let ok = true;
    for (const [p, q] of [[-dx, ax - x0], [dx, x1 - ax], [-dy, ay - y0], [dy, y1 - ay]]) {
      if (p === 0) { if (q < 0) { ok = false; break; } continue; }
      const t = q / p;
      if (p < 0) { if (t > t1) { ok = false; break; } if (t > t0) t0 = t; }
      else { if (t < t0) { ok = false; break; } if (t < t1) t1 = t; }
    }
    if (!ok) { close(); continue; }
    const pa = [ax + t0 * dx, ay + t0 * dy];
    const pb = [ax + t1 * dx, ay + t1 * dy];
    if (!cur) cur = [pa];
    else if (t0 > 0) { close(); cur = [pa]; }
    cur.push(pb);
    if (t1 < 1) close();
  }
  close();
  return out;
}

/** Fläche des Schnitts eines konvexen Polygons (z. B. Zensuszelle) mit einem Kreis. */
export function areaInCircle(ring, center, r) {
  return Math.abs(ringArea(clipRingConvex(ring, circleRing(center, r, 72))));
}

/** Konvexe Hülle (Andrew), gegen den Uhrzeigersinn. */
export function convexHull(points) {
  const pts = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (pts.length < 3) return pts;
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower = [];
  for (const p of pts) { while (lower.length >= 2 && cross(lower.at(-2), lower.at(-1), p) <= 0) lower.pop(); lower.push(p); }
  const upper = [];
  for (const p of pts.reverse()) { while (upper.length >= 2 && cross(upper.at(-2), upper.at(-1), p) <= 0) upper.pop(); upper.push(p); }
  return lower.slice(0, -1).concat(upper.slice(0, -1));
}

/**
 * Umriss „alles im Abstand r um eine Geometrie" für die Darstellung: Hülle aus Kreisen um
 * die Stützpunkte. Für konvexe Flächen exakt (bis auf die Kreisannäherung), sonst etwas größer.
 */
export function bufferOutline(g, r, n = 24) {
  const verts = [...g.points, ...g.lines.flat(), ...g.polygons.flatMap((p) => p[0])];
  return convexHull(verts.flatMap((v) => circleRing(v, r, n)));
}
