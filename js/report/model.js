// model.js — aus den gelesenen Kachel-Features das Datenmodell eines Reports bauen. REIN:
// kein DOM, kein fetch; Eingabe sind die Features je Datensatz (sources.js/readAll), Ausgabe
// ein einfaches Objekt, das Regelwerk (rules/) und Darstellung (render/) lesen.
//
// Alle Längen in Metern der lokalen Projektion um den Auswahlpunkt (geometry.js). Werte aus
// den Kacheln können Strings sein (tippecanoe, FGB) → überall Number(...).
import {
  localProjection, dist, distPointGeom, distGeomLine, centroidOf, pointInPolygon, areaInCircle,
  nearestOnLine, sliceLine, lineLength, polygonArea,
} from "./geometry.js";
import { groupRoads, nearestWay, buildChain, speedProfile, findJunctions, MAJOR, refClass, nameNear, wayAt } from "./roads.js";
import { collectFacilities } from "./facilities.js";

export const BET = { IstFuss: "Fuß", IstRad: "Rad", IstPKW: "Pkw", IstKrad: "Kraftrad", IstGkfz: "Güterkraftfahrzeug", IstSonstig: "Sonstige" };
export const KAT = { 1: "Getötete", 2: "Schwerverletzte", 3: "Leichtverletzte" };
export const TYP = { 1: "Fahrunfall", 2: "Abbiegeunfall", 3: "Einbiegen/Kreuzen", 4: "Fußgänger (Überschreiten)", 5: "Ruhender Verkehr", 6: "Längsverkehr", 7: "Sonstiger Unfall" };
export const ART = { 1: "Anfahrend/ruhend", 2: "Vorausfahrend/wartend", 3: "Seitlich gleiche Richtung", 4: "Entgegenkommend", 5: "Einbiegend/kreuzend", 6: "Fußgänger", 7: "Fahrbahnhindernis", 8: "Abkommen rechts", 9: "Abkommen links", 0: "Sonstiger Unfall" };
export const WT = { 1: "So", 2: "Mo", 3: "Di", 4: "Mi", 5: "Do", 6: "Fr", 7: "Sa" };
export const LDEN = { Lden5559: [55, "55–59"], Lden6064: [60, "60–64"], Lden6569: [65, "65–69"], Lden7074: [70, "70–74"], LdenGreaterThan75: [75, "> 75"] };
export const LNIGHT = { Lnight5054: [50, "50–54"], Lnight5559: [55, "55–59"], Lnight6064: [60, "60–64"], Lnight6569: [65, "65–69"], LnightGreaterThan70: [70, "> 70"] };
export const REGIOSTAR7 = { 71: "Stadtregion – Metropole", 72: "Stadtregion – Regiopole und Großstadt", 73: "Stadtregion – Mittelstadt, städtischer Raum", 74: "Stadtregion – kleinstädtischer, dörflicher Raum", 75: "ländliche Region – zentrale Stadt", 76: "ländliche Region – Mittelstadt, städtischer Raum", 77: "ländliche Region – kleinstädtischer, dörflicher Raum" };

const n = (v) => (v == null || v === "" ? NaN : Number(v));
const range = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => a + i);

/** Stücke eines Features (Punkt/Linie/Fläche in WGS84) → lokaler repräsentativer Punkt. */
function anchorOf(f, xy) {
  if (f.type === "Point") return xy(f.coordinates);
  if (f.type === "LineString") {
    const l = f.coordinates.map(xy);
    return sliceLine(l, lineLength(l) / 2, lineLength(l) / 2)[0];
  }
  const ring = f.coordinates[0].map(xy);
  return [ring.reduce((s, p) => s + p[0], 0) / ring.length, ring.reduce((s, p) => s + p[1], 0) / ring.length];
}

// ------------------------------------------------------------------ Umrechnen
export function projectRaw(raw, proj) {
  const xy = proj.xy;
  const feats = (id) => (raw[id]?.status === "ok" ? raw[id].features : []);
  const accidents = feats("accidents").filter((f) => f.type === "Point").map((f) => {
    const p = f.properties;
    return {
      p: xy(f.coordinates), kat: n(p.UKATEGORIE), j: n(p.UJAHR), m: n(p.UMONAT), wt: n(p.UWOCHENTAG), h: n(p.USTUNDE),
      art: n(p.UART), typ: n(p.UTYP1), bet: Object.keys(BET).filter((k) => n(p[k]) === 1),
    };
  }).filter((a) => a.kat >= 1 && a.kat <= 3 && Number.isFinite(a.j));
  const ways = [
    ...feats("roads").filter((f) => f.type === "LineString").map((f) => ({ line: f.coordinates.map(xy), props: f.properties, minor: false })),
    ...feats("roadsMinor").filter((f) => f.type === "LineString").map((f) => ({ line: f.coordinates.map(xy), props: f.properties, minor: true })),
  ];
  const crossings = feats("crossings").map((f) => ({ p: anchorOf(f, xy), props: f.properties, kind: crossingKind(f.properties) }));
  const stops = feats("platforms").map((f) => ({ p: anchorOf(f, xy), props: f.properties, mode: stopMode(f.properties) }));
  const cells = feats("census").filter((f) => f.type === "Polygon").map((f) => ({ ring: f.coordinates[0].map(xy), props: f.properties }));
  const noise = (id) => feats(id).filter((f) => f.type === "Polygon").map((f) => ({ poly: f.coordinates.map((r) => r.map(xy)), cls: f.properties["Lärmpegelklasse"] }));
  const lines = (id) => feats(id).filter((f) => f.type === "LineString").map((f) => ({ line: f.coordinates.map(xy), props: f.properties }));
  return {
    accidents, ways, crossings, stops, cells,
    noiseDen: noise("noiseDen"), noiseNight: noise("noiseNight"),
    svz: lines("svz"), hvs: lines("hvs"), telraam: lines("telraam"),
    obs: feats("obs").filter((f) => f.type === "Point").map((f) => ({ p: xy(f.coordinates), props: f.properties })),
    sc9: feats("sc9").filter((f) => f.type === "Polygon").map((f) => ({ poly: f.coordinates.map((r) => r.map(xy)), props: f.properties })),
  };
}

/** Querung einordnen: lsa | zebra | markiert | unmarkiert | sonst. */
export function crossingKind(p) {
  if (p.crossing === "traffic_signals") return "lsa";
  if (p.crossing === "zebra" || p.crossing_markings === "zebra") return "zebra";
  if (["marked", "uncontrolled"].includes(p.crossing) || (p.crossing_markings && p.crossing_markings !== "no")) return "markiert";
  if (p.crossing === "unmarked" || p.crossing_markings === "no") return "unmarkiert";
  return "sonst";
}
export const CROSSING_LABEL = { lsa: "Ampel", zebra: "Fußgängerüberweg (Zebra)", markiert: "markierte Querung (FGÜ?)", unmarkiert: "unmarkierte Querung", sonst: "Querung" };

/** Verkehrsmittel einer Haltestelle (Vorrang wie in der Karte: Tram vor Bahn vor Bus). */
export function stopMode(p) {
  if (p.tram === "yes" || p.railway === "tram_stop") return "tram";
  if (p.train === "yes" || ["platform", "halt", "station"].includes(p.railway)) return "bahn";
  if (p.bus === "yes" || p.highway === "bus_stop") return "bus";
  return "sonst";
}
export const STOP_LABEL = { tram: "Straßenbahn", bahn: "Bahn", bus: "Bus", sonst: "Haltestelle" };

// ------------------------------------------------------------------ Hilfen für die Auswahl
/**
 * Klick in die Auswahlkarte auf den nächsten Knoten einrasten (≤ maxD m).
 * @returns {{ lat: number, lng: number, snapped: boolean, roads: string[] }}
 */
export function snapToJunction(raw, lat, lng, maxD = 30) {
  const proj = localProjection(lat, lng);
  const X = projectRaw(raw, proj);
  const roads = groupRoads(X.ways);
  const j = findJunctions(roads, [0, 0], maxD + 15).find((x) => x.d <= maxD);
  if (!j) {
    const near = roads.map((r) => ({ r, d: nearestWay([0, 0], r).d })).filter((x) => x.d <= 25).sort((a, b) => a.d - b.d);
    return { lat, lng, snapped: false, roads: near.slice(0, 2).map((x) => x.r.label) };
  }
  const [lng2, lat2] = proj.lngLat(j.pt);
  return { lat: lat2, lng: lng2, snapped: true, roads: j.roads.slice(0, 3).map((r) => r.label) };
}

/**
 * Einrichtung am Klickpunkt (innerhalb oder ≤ maxD m).
 * @returns {null | { oid: string, lat: number, lng: number, name: string|null, typ: string, status: string, d: number }}
 */
export function facilityAt(raw, lat, lng, maxD = 40) {
  const proj = localProjection(lat, lng);
  const facs = collectFacilities({ schools: raw.schools?.features, health: raw.health?.features, playgrounds: raw.playgrounds?.features }, proj.xy);
  // Liegt der Klick in mehreren Flächen (Kita auf dem Schulgelände), gewinnt die kleinste.
  const size = (f) => f.geom.polygons.reduce((s, p) => s + Math.abs(polygonArea(p)), 0);
  const hits = facs.map((f) => ({ f, d: distPointGeom([0, 0], f.geom), a: size(f) })).filter((x) => x.d <= maxD).sort((a, b) => Math.round(a.d) - Math.round(b.d) || a.a - b.a);
  if (!hits.length) return null;
  const { f, d } = hits[0];
  const [lng2, lat2] = proj.lngLat(centroidOf(f.geom));
  return { oid: f.oid, lat: lat2, lng: lng2, name: f.name, typ: f.typ, status: f.status, d };
}

// ------------------------------------------------------------------ Modell
/**
 * @param {object} a
 * @param {Record<string, {status: string, features: object[]}>} a.raw  gelesene Datensätze
 * @param {{kind: "k"|"e", lat: number, lng: number, oid?: string}} a.sel
 * @param {number} a.r                         Radius (Kreuzung) bzw. Umfeld (Einrichtung) in m
 * @param {{from: number, to: number}} a.years Zeitfenster
 * @param {number[]} a.dataYears               alle Datenjahre (für Diagramme/Abdeckung)
 * @param {string|null} [a.roadKey]            Nutzerwahl der Hauptstraße
 */
export function buildModel({ raw, sel, r, years, dataYears, roadKey = null }) {
  const proj = localProjection(sel.lat, sel.lng);
  const X = projectRaw(raw, proj);
  const status = Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, v.status]));
  const facilitiesAll = collectFacilities({ schools: raw.schools?.features, health: raw.health?.features, playgrounds: raw.playgrounds?.features }, proj.xy);
  const roads = groupRoads(X.ways);

  // --- Auswahl ------------------------------------------------------------------------------
  let fac = null;
  let facMissing = false;
  if (sel.kind === "e") {
    // geo.make_osm_oid schreibt Relations-Multipolygone als node/<Relations-ID> (TODO R13) —
    // Sc2/6/8-Links tragen das weiter. Darum ersatzweise relation/<ID> suchen.
    const alt = sel.oid.startsWith("node/") ? `relation/${sel.oid.slice(5)}` : null;
    fac = facilitiesAll.find((f) => f.oid === sel.oid) ?? (alt && facilitiesAll.find((f) => f.oid === alt)) ?? null;
    facMissing = !fac;
  }
  const center = fac ? centroidOf(fac.geom) ?? [0, 0] : [0, 0];
  const contains = fac ? (p) => distPointGeom(p, fac.geom) <= r : (p) => dist(p, [0, 0]) <= r;
  const selection = { kind: sel.kind, r, center, fac, facMissing, contains };

  // --- Hauptstraße ----------------------------------------------------------------------------
  const cand = roads.map((road) => {
    const d = fac ? Math.min(...road.ways.map((w) => distGeomLine(fac.geom, w.line))) : nearestWay(center, road).d;
    const nr6 = !!road.refClass || MAJOR.has(road.highway);
    return { road, d, nr6 };
  });
  const lim = fac ? 60 : Math.max(r, 25);
  let candidates = cand.filter((c) => c.d <= lim);
  if (!candidates.length) candidates = cand.filter((c) => c.d <= (fac ? 150 : 80)).sort((a, b) => a.d - b.d).slice(0, 1);
  candidates.sort((a, b) => (b.nr6 - a.nr6) || (b.road.rank - a.road.rank) || (a.d - b.d));
  const chosen = (roadKey && candidates.find((c) => c.road.key === roadKey)) || candidates[0] || null;
  const road = chosen?.road ?? null;

  // Frontpunkt: Lot vom Auswahlpunkt bzw. vom Schwerpunkt der Einrichtung auf die Hauptstraße.
  let front = null;
  let chain = null;
  if (road) {
    // Bei Einrichtungen: Lot vom Schwerpunkt auf die Straße = Mitte der Straßenfront.
    front = nearestWay(center, road).hit.q;
    chain = buildChain(road, front);
  }
  const frontWay = chain ? wayAt(chain, chain.s) : null;
  const speed = frontWay?.speed ?? null;
  const profile = chain ? speedProfile(chain) : [];

  // --- Unfälle --------------------------------------------------------------------------------
  const acc = X.accidents;
  const inSel = acc.filter((a) => contains(a.p));
  const win = inSel.filter((a) => a.j >= years.from && a.j <= years.to);
  const count = (f) => win.filter(f).length;
  const byYear = Object.fromEntries(dataYears.map((y) => [y, { 1: 0, 2: 0, 3: 0 }]));
  for (const a of inSel) if (byYear[a.j]) byYear[a.j][a.kat]++;
  const bet = Object.fromEntries(Object.keys(BET).map((k) => [k, count((a) => a.bet.includes(k))]));
  const byTyp = Object.fromEntries(Object.keys(TYP).map((k) => [k, count((a) => a.typ === Number(k))]));
  const byArt = Object.fromEntries(Object.keys(ART).map((k) => [k, count((a) => a.art === Number(k))]));
  const hours = range(0, 23).map((h) => count((a) => a.h === h));
  const weekdays = Object.fromEntries(range(1, 7).map((d) => [d, count((a) => a.wt === d)]));
  // Abdeckung (bis report/coverage.json kommt): ein Jahr ganz ohne Unfall im gelesenen Umfeld,
  // obwohl die übrigen Jahre im Schnitt ≥ 8 haben, fehlt vermutlich im Unfallatlas.
  const perYearArea = Object.fromEntries(dataYears.map((y) => [y, acc.filter((a) => a.j === y).length]));
  const suspicious = dataYears.filter((y) => {
    const others = dataYears.filter((x) => x !== y).map((x) => perYearArea[x]);
    return perYearArea[y] === 0 && others.length && others.reduce((s, v) => s + v, 0) / others.length >= 8;
  });
  const accidents = {
    all: acc, inSel, win, n: win.length, nSP: count((a) => a.kat <= 2), nT: count((a) => a.kat === 1),
    fr: count((a) => a.bet.includes("IstFuss") || a.bet.includes("IstRad")), bet, byTyp, byArt, byYear, hours, weekdays,
    nYears: years.to - years.from + 1, perYearArea, suspicious,
  };

  // --- Einrichtungen, Querungen, Haltestellen -----------------------------------------------
  const facReach = fac ? r : r + 150;
  const facilities = facilitiesAll
    .map((f) => ({ ...f, dSel: fac && f.oid === fac.oid ? 0 : distPointGeom(center, f.geom), dRoad: road ? Math.min(...road.ways.map((w) => distGeomLine(f.geom, w.line))) : null, centroid: centroidOf(f.geom) }))
    .filter((f) => f.dSel <= facReach || (fac && f.oid === fac.oid))
    .sort((a, b) => a.dSel - b.dSel);
  // Die gewählte Einrichtung bekommt dieselben Kennzahlen (Abstände, Schwerpunkt) wie die Liste.
  if (fac) selection.fac = facilities.find((f) => f.oid === fac.oid) ?? selection.fac;
  const onChain = (p) => (chain ? { ...nearestOnLine(p, chain.line) } : { d: Infinity, s: null });
  const crossings = X.crossings.map((c) => ({ ...c, d: dist(c.p, center), chain: onChain(c.p) })).sort((a, b) => a.d - b.d);
  const stops = X.stops.map((s) => ({ ...s, d: dist(s.p, center), chain: onChain(s.p), name: s.props.name || null })).sort((a, b) => a.d - b.d);

  // --- Abschnitt für Lärm/Verkehr: ±150 m entlang der Hauptstraße um den Frontpunkt ----------
  let section = null;
  if (chain) {
    const s0 = Math.max(0, chain.s - 150);
    const s1 = Math.min(chain.length, chain.s + 150);
    section = { s0, s1, line: sliceLine(chain.line, s0, s1), length: s1 - s0 };
  }

  // --- Bevölkerung (Zensus 2022, 100-m-Zellen): 300 m um den Mittelpunkt, Zellen anteilig -----
  let census = null;
  if (status.census === "ok") {
    let ew = 0;
    let u18 = 0;
    let a65 = 0;
    let secret = 0;
    let here = null;
    for (const c of X.cells) {
      const e = n(c.props.Einwohner);
      const share = areaInCircle(c.ring, center, 300) / 10000;
      if (share > 0) {
        if (!(e >= 0)) secret++;
        else {
          ew += e * share;
          u18 += (n(c.props.Unter18) || 0) * share;
          a65 += (n(c.props.a65undaelter) || 0) * share;
        }
      }
      if (!here && pointInPolygon(center, [c.ring])) here = c.props;
    }
    if (!here && X.cells.length) {
      here = X.cells.map((c) => ({ c, d: dist(center, c.ring[0]) })).sort((a, b) => a.d - b.d)[0].c.props;
    }
    let band = null;
    if (section) band = bandPopulation(X.cells, section.line, 50);
    census = {
      ew: Math.round(ew), u18: Math.round(u18), a65: Math.round(a65), secret, r: 300,
      gemeinde: here?.name_23 ?? null, plz: here?.plz ?? null, regiostar: here ? n(here.RegioStaR7) : null, band,
    };
  }

  // --- Lärm (UBA, nur Hauptverkehrsstraßen kartiert) ------------------------------------------
  const noise = {};
  for (const [key, table, id] of [["den", LDEN, "noiseDen"], ["night", LNIGHT, "noiseNight"]]) {
    if (status[id] !== "ok") { noise[key] = { status: status[id] ?? "missing" }; continue; }
    const probes = section ? samplesAlong(section.line, 10, [0, -12, 12, -24, 24]) : [center];
    let best = null;
    for (const z of X[id]) {
      const v = table[z.cls]?.[0];
      if (v == null || (best && v <= best.v)) continue;
      if (probes.some((q) => pointInPolygon(q, z.poly))) best = { v, txt: table[z.cls][1], cls: z.cls };
    }
    let atFac = null;
    if (fac) {
      for (const z of X[id]) {
        const v = table[z.cls]?.[0];
        if (v == null || (atFac && v <= atFac.v)) continue;
        const pts = [...fac.geom.points, ...fac.geom.polygons.flatMap((p) => p[0]), center];
        if (pts.some((q) => pointInPolygon(q, z.poly))) atFac = { v, txt: table[z.cls][1], cls: z.cls };
      }
    }
    noise[key] = { status: "ok", ...(best ?? { v: null }), atFac };
  }

  // --- Verkehrsmengen, Telraam, OpenBikeSensor -----------------------------------------------
  const nearestLine = (list, maxD) => {
    if (!front) return null;
    const hit = list.map((x) => ({ x, d: nearestOnLine(front, x.line).d })).filter((h) => h.d <= maxD).sort((a, b) => a.d - b.d)[0];
    return hit?.x.props ?? null;
  };
  const svz = status.svz === "ok" ? nearestLine(X.svz, 30) : undefined;
  const hvs = status.hvs === "ok" ? nearestLine(X.hvs, 30) : undefined;
  const telraam = status.telraam === "ok" ? nearestLine(X.telraam, 40) : undefined;
  const traffic = {
    svz: svz === undefined ? { status: status.svz ?? "missing" } : svz && Number.isFinite(n(svz.dtv_kfz))
      ? { status: "ok", kfz: n(svz.dtv_kfz), sv: Number.isFinite(n(svz.sv_anteil)) ? n(svz.sv_anteil) : (n(svz.dtv_sv) / n(svz.dtv_kfz)) * 100, year: svz.year ?? null, metric: svz.metric ?? null, road: svz.road_no ?? null }
      : { status: "none" },
    hvs: hvs === undefined ? { status: status.hvs ?? "missing" } : hvs && Number.isFinite(n(hvs.annualTrafficFlow)) ? { status: "ok", kfz: Math.round(n(hvs.annualTrafficFlow) / 365) } : { status: "none" },
    telraam: telraam === undefined ? { status: status.telraam ?? "missing" } : telraam ? { status: "ok", car: n(telraam.car_per_day), bike: n(telraam.bike_per_day) } : { status: "none" },
  };
  let obs = { status: status.obs ?? "missing" };
  if (status.obs === "ok") {
    const pts = section ? X.obs.filter((o) => nearestOnLine(o.p, section.line).d <= 25) : [];
    const valid = pts.filter((o) => n(o.props.distance_overtaker) >= 0.2);
    const under = valid.filter((o) => n(o.props.distance_overtaker) < (String(o.props.zone).toLowerCase().startsWith("r") ? 2.0 : 1.5));
    obs = { status: "ok", n: valid.length, k: under.length };
  }

  // --- Sc9-Flächen (Unfallhäufung nach M-Uko-Kriterien, vorberechnet) ------------------------
  // Flächen an Kachelkanten liegen in Stücken vor: je Merkmalssatz nur einmal zählen.
  const sc9 = status.sc9 === "ok"
    ? [...new Map(X.sc9.filter((z) => pointInPolygon(center, z.poly) || z.poly[0].some((q) => contains(q))).map((z) => [JSON.stringify(z.props), { ...z.props }])).values()]
    : null;

  return {
    proj, status, selection, roads, road, roadCandidates: candidates.map((c) => ({ key: c.road.key, label: c.road.label, d: c.d, nr6: c.nr6 })),
    front, chain, frontWay, speed, profile, section, streetName: road && front ? nameNear(front, road) : null,
    accidents, facilities, facilitiesAll, crossings, stops, census, noise, traffic, obs, sc9, X,
    refClass: road ? refClass(road.ref) : null,
  };
}

/** Punkte entlang einer Linie alle `step` m, quer versetzt um `offsets` m. */
export function samplesAlong(line, step, offsets) {
  const out = [];
  let acc = 0;
  for (let i = 1; i < line.length; i++) {
    const a = line[i - 1];
    const b = line[i];
    const len = dist(a, b);
    if (len === 0) continue;
    const nx = -(b[1] - a[1]) / len;
    const ny = (b[0] - a[0]) / len;
    for (let t = (step - (acc % step)) % step; t <= len; t += step) {
      const p = [a[0] + ((b[0] - a[0]) * t) / len, a[1] + ((b[1] - a[1]) * t) / len];
      for (const o of offsets) out.push([p[0] + nx * o, p[1] + ny * o]);
    }
    acc += len;
  }
  return out;
}

/**
 * Einwohner in einem Band beidseits einer Linie (Zellen anteilig über ein 10-m-Raster).
 * Zelle ≠ Fassade: Größenordnung (MOD), keine Betroffenenzahl.
 */
export function bandPopulation(cells, line, width) {
  const xs = line.map((p) => p[0]);
  const ys = line.map((p) => p[1]);
  const [x0, x1, y0, y1] = [Math.min(...xs) - width, Math.max(...xs) + width, Math.min(...ys) - width, Math.max(...ys) + width];
  const boxes = cells.map((c) => {
    const cx = c.ring.map((p) => p[0]);
    const cy = c.ring.map((p) => p[1]);
    return { c, b: [Math.min(...cx), Math.min(...cy), Math.max(...cx), Math.max(...cy)] };
  }).filter(({ b }) => b[2] >= x0 && b[0] <= x1 && b[3] >= y0 && b[1] <= y1);
  let ew = 0;
  let secret = false;
  for (let x = x0 + 5; x < x1; x += 10) {
    for (let y = y0 + 5; y < y1; y += 10) {
      const p = [x, y];
      if (nearestOnLine(p, line).d > width) continue;
      const hit = boxes.find(({ b, c }) => p[0] >= b[0] && p[0] <= b[2] && p[1] >= b[1] && p[1] <= b[3] && pointInPolygon(p, [c.ring]));
      if (!hit) continue;
      const e = n(hit.c.props.Einwohner);
      if (e >= 0) ew += e * 0.01;
      else secret = true;
    }
  }
  return { ew: Math.round(ew), width, secret };
}
