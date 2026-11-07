// roads.js — Straßen aus den OSM-Kacheln (highways / highways_minor) für den Report. REIN.
//
// - Gruppierung: Wege mit derselben Nummer (ref) oder demselben Namen bilden eine „Straße".
// - Tempo je Weg aus maxspeed (+ Richtung, Bedingung, Typ); fehlt es, wird es aus
//   maxspeed:type abgeleitet (DE:urban → 50, wie Sc3/Sc6) und als „abgeleitet" markiert.
// - Kette: für die Hauptstraße eine durchgehende Linie ab dem Frontpunkt, damit sich Längen
//   ENTLANG der Straße messen lassen (±150 m Vorschlag, Abstand zur nächsten Tempo-30-Strecke).
//   An Verzweigungen geht es geradeaus weiter; von zwei Richtungsfahrbahnen folgt sie einer.
// - Knoten: Stellen, an denen sich zwei verschiedene Straßen treffen (für das Einrasten).
// Alle Koordinaten in Metern der lokalen Projektion (geometry.js).
import { dist, nearestOnLine, lineLength, pointAt, sliceLine, projectOnSegment } from "./geometry.js";

export const CLASS_RANK = {
  motorway: 9, trunk: 8, primary: 7, secondary: 6, tertiary: 5,
  motorway_link: 4, trunk_link: 4, primary_link: 4, secondary_link: 3, tertiary_link: 3,
  unclassified: 2, road: 1, residential: 1, living_street: 0,
};
export const MAJOR = new Set(["motorway", "trunk", "primary", "secondary", "tertiary", "motorway_link", "trunk_link", "primary_link", "secondary_link", "tertiary_link"]);

/** Straßennummer des überörtlichen Netzes (B, L, K; St in Bayern, S in Sachsen). */
export const REF_CLASS = /(^|;)\s*(B|L|K|St|S)\s?\d/;
// Bayern: Kreisstraßen tragen das Kfz-Kürzel des Kreises (FS 12, EBE 7). Nicht „A" (Autobahn).
const REF_KREIS_BY = /(^|;)\s*(?!A\s)[A-ZÄÖÜ]{2,3}\s?\d/;
export const refClass = (ref) => {
  const m = REF_CLASS.exec(ref ?? "");
  if (m) return m[2];
  return REF_KREIS_BY.test(ref ?? "") ? "K" : null;
};
export const REF_LABEL = { B: "Bundesstraße", L: "Landesstraße", K: "Kreisstraße", St: "Staatsstraße", S: "Staatsstraße" };

const num = (v) => {
  const m = /^\s*(\d{1,3})(\s*km\/h)?\s*$/.exec(String(v ?? ""));
  return m ? Number(m[1]) : null;
};
const ZONE = /^DE:zone:?(\d{2})$/;

/**
 * Tempo eines Wegs aus den OSM-Feldern.
 * @returns {{ v: number|null, derived: boolean, zone: boolean, dir: string|null, cond: {v: number, when: string}|null,
 *            urban: boolean|null, type: string|null, raw: string|null, note: string|null }}
 */
export function parseSpeed(p) {
  const raw = p.maxspeed != null && p.maxspeed !== "" ? String(p.maxspeed) : null;
  const type = p.maxspeed_type || null;
  const zoneTraffic = p.zone_traffic || null;
  let v = null;
  let derived = false;
  let zone = false;
  let dir = null;
  let note = null;
  if (raw != null) {
    if (num(raw) != null) v = num(raw);
    else if (raw === "DE:urban") { v = 50; derived = true; }
    else if (raw === "DE:rural") { v = 100; derived = true; }
    else if (ZONE.test(raw)) { v = Number(ZONE.exec(raw)[1]); zone = true; }
    else if (/^(walk|DE:living_street)$/.test(raw)) { v = 7; note = "Schrittgeschwindigkeit"; }
    else if (raw === "none") note = "ohne Tempolimit";
    else note = `maxspeed=${raw}`;
  } else {
    const f = num(p.maxspeed_forward);
    const b = num(p.maxspeed_backward);
    if (f != null || b != null) {
      v = Math.max(f ?? 0, b ?? 0);
      dir = f != null && b != null && f !== b ? `je Richtung ${f}/${b} km/h` : "nur je Richtung angegeben";
    } else if (type && ZONE.test(type)) { v = Number(ZONE.exec(type)[1]); zone = true; derived = true; }
    else if (type === "DE:urban" || zoneTraffic === "DE:urban") { v = 50; derived = true; }
    else if (type === "DE:rural" || zoneTraffic === "DE:rural") { v = 100; derived = true; }
    else if (p.highway === "living_street") { v = 7; derived = true; note = "verkehrsberuhigter Bereich"; }
  }
  if (type && ZONE.test(type)) zone = true;
  let cond = null;
  const c = /(\d{1,3})\s*@\s*\(?([^)]*)\)?/.exec(String(p.maxspeed_conditional ?? ""));
  if (c) cond = { v: Number(c[1]), when: c[2].trim() };
  let urban = null;
  if ([type, zoneTraffic, raw].includes("DE:urban") || zone) urban = true;
  else if ([type, zoneTraffic, raw].includes("DE:rural")) urban = false;
  return { v, derived, zone, dir, cond, urban, type: type || zoneTraffic, raw, note };
}

// Ohne Nummer und Namen bleibt jeder Weg für sich (Schlüssel über OSM-ID bzw. Position).
const keyOf = (p, i) => (p.ref ? `ref:${p.ref}` : p.name ? `name:${p.name}` : `osm:${p.osm_id ?? `#${i}`}`);

/**
 * Wege (lokale Linien) zu Straßen gruppieren.
 * @param {{ line: number[][], props: object, minor: boolean }[]} ways
 */
export function groupRoads(ways) {
  const byKey = new Map();
  ways.forEach((w, i) => {
    if (w.line.length < 2) return;
    const k = keyOf(w.props, i);
    if (!byKey.has(k)) byKey.set(k, { key: k, ref: w.props.ref || null, names: new Map(), highway: null, rank: -1, minor: true, ways: [] });
    const r = byKey.get(k);
    const rank = CLASS_RANK[w.props.highway] ?? 0;
    if (rank > r.rank) { r.rank = rank; r.highway = w.props.highway; }
    if (!w.minor) r.minor = false;
    if (w.props.name) r.names.set(w.props.name, (r.names.get(w.props.name) ?? 0) + lineLength(w.line));
    r.ways.push({ id: w.props.osm_id != null ? String(w.props.osm_id) : null, line: w.line, props: w.props, speed: parseSpeed(w.props) });
  });
  for (const r of byKey.values()) {
    // Name = der längste Name der Gruppe (eine B-Straße wechselt unterwegs den Namen).
    r.name = [...r.names.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
    r.refClass = refClass(r.ref);
    r.label = r.name && r.ref ? `${r.name} (${r.ref})` : r.name || r.ref || "unbenannte Straße";
  }
  return [...byKey.values()];
}

/** Abstand Punkt–Straße und der nächste Weg. */
export function nearestWay(p, road) {
  let best = { d: Infinity, way: null, hit: null };
  for (const w of road.ways) {
    const hit = nearestOnLine(p, w.line);
    if (hit.d < best.d) best = { d: hit.d, way: w, hit };
  }
  return best;
}

/** Name eines Straßenabschnitts in der Nähe von p (bei Gruppen über die ref). */
export function nameNear(p, road) {
  const { way } = nearestWay(p, road);
  return way?.props.name || road.name || road.ref || "unbenannte Straße";
}

// ------------------------------------------------------------------ Kette entlang der Straße
const angle = (a, b) => Math.atan2(b[1] - a[1], b[0] - a[0]);
const turn = (a1, a2) => {
  let d = Math.abs(a1 - a2) % (2 * Math.PI);
  if (d > Math.PI) d = 2 * Math.PI - d;
  return d;
};

/**
 * Durchgehende Linie der Straße durch den Punkt p, je Richtung bis `maxLen` Meter.
 * Liefert { line, segs: [{s0, s1, way}], s: Bogenlänge von p' auf der Linie } oder null.
 */
export function buildChain(road, p, { maxLen = 1200, joinTol = 1.5, maxTurnDeg = 60 } = {}) {
  const start = nearestWay(p, road);
  if (!start.way) return null;
  const pieces = road.ways.map((w, i) => ({ i, w, a: w.line[0], b: w.line[w.line.length - 1] }));
  const used = new Set([start.way]);
  const maxTurn = (maxTurnDeg * Math.PI) / 180;

  // Von einem Endpunkt aus weitergehen: nächstes Stück, das dort beginnt/endet, möglichst gerade.
  const walk = (endPt, heading, budget) => {
    const out = [];
    let pt = endPt;
    let h = heading;
    let len = 0;
    while (len < budget) {
      let best = null;
      for (const pc of pieces) {
        if (used.has(pc.w)) continue;
        let line = null;
        if (dist(pc.a, pt) <= joinTol) line = pc.w.line;
        else if (dist(pc.b, pt) <= joinTol) line = [...pc.w.line].reverse();
        if (!line) continue;
        const t = turn(h, angle(line[0], line[1]));
        if (t <= maxTurn && (!best || t < best.t)) best = { t, line, w: pc.w };
      }
      if (!best) break;
      used.add(best.w);
      out.push({ line: best.line, way: best.w });
      len += lineLength(best.line);
      pt = best.line[best.line.length - 1];
      h = angle(best.line[best.line.length - 2], best.line[best.line.length - 1]);
    }
    return out;
  };

  const base = start.way.line;
  const fwd = walk(base[base.length - 1], angle(base[base.length - 2], base[base.length - 1]), maxLen);
  const bwd = walk(base[0], angle(base[1], base[0]), maxLen);

  // Rückwärts-Stücke umdrehen und vor das Startstück setzen.
  const ordered = [
    ...bwd.reverse().map((x) => ({ line: [...x.line].reverse(), way: x.way })),
    { line: base, way: start.way },
    ...fwd,
  ];
  const line = [];
  const segs = [];
  let s = 0;
  for (const { line: l, way } of ordered) {
    const s0 = s;
    l.forEach((pt, k) => { if (!(k === 0 && line.length)) line.push(pt); });
    s += lineLength(l);
    segs.push({ s0, s1: s, way });
  }
  const at = nearestOnLine(p, line);
  return { line, segs, s: at.s, q: at.q, length: s, road };
}

/** Weg an Bogenlänge s der Kette. */
export const wayAt = (chain, s) => chain.segs.find((x) => s >= x.s0 && s <= x.s1)?.way ?? chain.segs[0]?.way ?? null;

/** Tempo-Abschnitte der Kette: [{s0, s1, v, zone, derived, cond}] (benachbarte gleiche zusammengelegt). */
export function speedProfile(chain) {
  const out = [];
  for (const { s0, s1, way } of chain.segs) {
    const sp = way.speed;
    const last = out[out.length - 1];
    if (last && last.v === sp.v && last.zone === sp.zone && !!last.cond === !!sp.cond) last.s1 = s1;
    else out.push({ s0, s1, v: sp.v, zone: sp.zone, derived: sp.derived, cond: sp.cond });
  }
  return out;
}

export { pointAt, sliceLine };

// ------------------------------------------------------------------ Knoten
/**
 * Stellen, an denen sich verschiedene Straßen treffen, im Umkreis `radius` um p.
 * Ein Knoten = Stützpunkt einer Straße, der auf einer ANDEREN Straße liegt (≤ tol), oder ein
 * Schnittpunkt zweier Segmente. Nahe Treffer (Richtungsfahrbahnen) werden zusammengefasst.
 */
export function findJunctions(roads, p, radius = 60, tol = 1.5) {
  const near = roads.filter((r) => nearestWay(p, r).d <= radius);
  const hits = [];
  for (let i = 0; i < near.length; i++) {
    for (let j = 0; j < near.length; j++) {
      if (i === j) continue;
      for (const wa of near[i].ways) {
        for (const v of wa.line) {
          if (dist(v, p) > radius) continue;
          const other = nearestWay(v, near[j]);
          if (other.d <= tol) hits.push({ pt: v, roads: [near[i], near[j]] });
        }
      }
      if (j > i) {
        for (const wa of near[i].ways) {
          for (const wb of near[j].ways) {
            for (let a = 1; a < wa.line.length; a++) {
              for (let b = 1; b < wb.line.length; b++) {
                const x = intersect(wa.line[a - 1], wa.line[a], wb.line[b - 1], wb.line[b]);
                if (x && dist(x, p) <= radius) hits.push({ pt: x, roads: [near[i], near[j]] });
              }
            }
          }
        }
      }
    }
  }
  // Zusammenfassen (12 m): Mittelpunkt, beteiligte Straßen.
  const clusters = [];
  for (const h of hits) {
    const c = clusters.find((k) => dist(k.pt, h.pt) <= 12);
    if (c) {
      c.members.push(h.pt);
      c.pt = [c.members.reduce((s, q) => s + q[0], 0) / c.members.length, c.members.reduce((s, q) => s + q[1], 0) / c.members.length];
      h.roads.forEach((r) => c.roads.add(r));
    } else clusters.push({ pt: h.pt, members: [h.pt], roads: new Set(h.roads) });
  }
  return clusters
    .map((c) => ({ pt: c.pt, roads: [...c.roads].sort((a, b) => b.rank - a.rank), d: dist(c.pt, p) }))
    .sort((a, b) => a.d - b.d);
}

function intersect(a, b, c, d) {
  const den = (b[0] - a[0]) * (d[1] - c[1]) - (b[1] - a[1]) * (d[0] - c[0]);
  if (Math.abs(den) < 1e-12) return null;
  const t = ((c[0] - a[0]) * (d[1] - c[1]) - (c[1] - a[1]) * (d[0] - c[0])) / den;
  const u = ((c[0] - a[0]) * (b[1] - a[1]) - (c[1] - a[1]) * (b[0] - a[0])) / den;
  if (t < 0 || t > 1 || u < 0 || u > 1) return null;
  return [a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])];
}

/** Abstand eines Punkts zur Kette samt Bogenlänge (für Haltestellen/Ampeln entlang der Strecke). */
export function onChain(chain, pt) {
  const r = nearestOnLine(pt, chain.line);
  return { d: r.d, s: r.s };
}

export { projectOnSegment };
