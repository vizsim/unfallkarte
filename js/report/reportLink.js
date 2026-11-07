// reportLink.js — Report-Link <-> Auswahl. REIN: kein DOM, kein window (wie permalinkFormat.js),
// damit `npm run test:unit` es browserlos prüfen kann.
//
//   report.html?rv=1&sel=<art>:<daten>[&r=<m>][&b=<m>][&jahr=<jj-jj>][&land=<xx>][&rw=<version>][&map=<z/lat/lng>]
//
// Vertrag mit geteilten Links (Konzept § 3.2): benannte Parameter, Kürzel werden NIE neu
// vergeben, nur ergänzt. Eigene Eingaben (Rolle, Beobachtung, Name) stehen nie im Link.
// Anders als der Karten-Permalink schreibt der Report `jahr` IMMER aus: ein Link, den jemand
// einer Behörde schickt, soll auch nach dem nächsten Datenjahr dieselben Zahlen zeigen.
//
// Jahre kodiert wie der Karten-Permalink (17-19_25). Bewusst NICHT aus permalinkFormat.js
// importiert: das hängt an der Layer-Registry, und die Registry-Popups importieren diesen
// Link (Einstiege aus der Karte) — der Kreis ließ im Bündel `registryPermalinkKeys` undefiniert.
// tests/unit/report-link.test.js hält beide Kodierungen gleich.

export const REPORT_LINK_VERSION = "1";

/** Auswahlarten. `k` und `e` sind umgesetzt, `s`/`g`/`ags` sind reserviert (Stufe 2/3). */
export const SEL_KINDS = { k: "kreuzung", e: "einrichtung", s: "strassenzug", g: "gebiet", ags: "gemeinde" };
export const SUPPORTED_KINDS = ["k", "e"];

/** Radius je Art (Konzept § 3.3): Kreuzung 15–100 m, Einrichtung 50–300 m. */
export const RADIUS = { k: { def: 25, min: 15, max: 100 }, e: { def: 150, min: 50, max: 300 } };
export const BUFFER = { def: 20, min: 15, max: 50 };

export const LAND_CODES = ["bw", "by", "be", "bb", "hb", "hh", "he", "mv", "ni", "nw", "rp", "sl", "sn", "st", "sh", "th"];

const OID = /^(node|way|relation)\/\d{1,15}$/;
const NUM = /^-?\d{1,3}(\.\d+)?$/;
// Grober Rahmen um Deutschland: außerhalb gibt es keine Daten, der Link ist aber nicht kaputt.
const DE_BBOX = { minLat: 47.2, maxLat: 55.1, minLng: 5.8, maxLng: 15.1 };

const round5 = (v) => Number(v).toFixed(5);

/** Zweistellige Jahrescodes packen: ab 3 aufeinanderfolgenden als Bereich (wie permalinkFormat). */
export function packYears(codes) {
  const nums = codes.map(Number).sort((a, b) => a - b);
  const out = [];
  for (let i = 0; i < nums.length;) {
    let j = i;
    while (j + 1 < nums.length && nums[j + 1] === nums[j] + 1) j++;
    const pad = (n) => String(n).padStart(2, "0");
    out.push(j - i >= 2 ? `${pad(nums[i])}-${pad(nums[j])}` : nums.slice(i, j + 1).map(pad).join("_"));
    i = j + 1;
  }
  return out.join("_");
}

export function unpackYears(raw) {
  return String(raw ?? "").split("_").filter(Boolean).flatMap((part) => {
    const [from, to] = part.split("-");
    if (!/^\d{2}$/.test(from) || (to != null && !/^\d{2}$/.test(to))) return []; // kaputt/böswillig
    if (to == null) return [from];
    const out = [];
    for (let v = Number(from); v <= Number(to); v++) out.push(String(v).padStart(2, "0"));
    return out;
  });
}
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

/** Encoded Polyline (Google-Format, Präzision 5), Punkte als [lat, lng]. */
export function encodePolyline(points, precision = 5) {
  const f = 10 ** precision;
  let out = "";
  let pLat = 0;
  let pLng = 0;
  const enc = (value) => {
    let v = value < 0 ? ~(value << 1) : value << 1;
    let s = "";
    while (v >= 0x20) { s += String.fromCharCode((0x20 | (v & 0x1f)) + 63); v >>= 5; }
    return s + String.fromCharCode(v + 63);
  };
  for (const [lat, lng] of points) {
    const a = Math.round(lat * f);
    const b = Math.round(lng * f);
    out += enc(a - pLat) + enc(b - pLng);
    pLat = a;
    pLng = b;
  }
  return out;
}

export function decodePolyline(str, precision = 5) {
  const f = 10 ** precision;
  const out = [];
  let i = 0;
  let lat = 0;
  let lng = 0;
  const next = () => {
    let shift = 0;
    let result = 0;
    let byte;
    do {
      if (i >= str.length) throw new Error("Polyline abgeschnitten");
      byte = str.charCodeAt(i++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    return result & 1 ? ~(result >> 1) : result >> 1;
  };
  while (i < str.length) {
    lat += next();
    lng += next();
    out.push([lat / f, lng / f]);
  }
  return out;
}

function parseLatLng(raw, warnings) {
  const [a, b, ...rest] = String(raw).split(",");
  if (rest.length || !NUM.test(a ?? "") || !NUM.test(b ?? "")) return null;
  const lat = Number(a);
  const lng = Number(b);
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  if (lat < DE_BBOX.minLat || lat > DE_BBOX.maxLat || lng < DE_BBOX.minLng || lng > DE_BBOX.maxLng) {
    warnings.push("Die Koordinate liegt außerhalb Deutschlands – dort gibt es keine Daten.");
  }
  return { lat, lng };
}

function parseSel(raw, warnings) {
  if (!raw) return null;
  const idx = raw.indexOf(":");
  if (idx < 1) return null;
  const kind = raw.slice(0, idx);
  const data = raw.slice(idx + 1);
  if (kind === "k") {
    const p = parseLatLng(data, warnings);
    return p && { kind, ...p };
  }
  if (kind === "e") {
    const [oid, at] = data.split("@");
    const p = at != null ? parseLatLng(at, warnings) : null;
    if (!OID.test(oid ?? "") || !p) return null;
    return { kind, oid, ...p };
  }
  if (kind === "s" || kind === "g") {
    try {
      const pts = decodePolyline(data);
      if (pts.length < (kind === "g" ? 3 : 2)) return null;
      return { kind, points: pts };
    } catch {
      return null;
    }
  }
  if (kind === "ags") return /^\d{8}$/.test(data) ? { kind, ags: data } : null;
  return null;
}

/**
 * Link lesen. Liefert immer ein Objekt; `sel` ist null, wenn der Link keine (gültige) Auswahl
 * trägt — dann zeigt die Seite die Auswahlkarte. `warnings` sind für die Nutzerin gedacht.
 * @param {string} search  location.search (mit oder ohne "?")
 * @param {{ years?: number[] }} [opts]  verfügbare Datenjahre (für Voreinstellung und Grenzen)
 */
export function parseReportLink(search, { years = [] } = {}) {
  const params = new URLSearchParams(String(search ?? "").replace(/^\?/, ""));
  const warnings = [];
  const version = params.get("rv");
  if (version != null && version !== REPORT_LINK_VERSION) {
    warnings.push(`Unbekannte Link-Version rv=${version} – gelesen wird, was bekannt ist.`);
  }

  const rawSel = params.get("sel");
  const sel = parseSel(rawSel, warnings);
  if (rawSel && !sel) warnings.push("Die Auswahl im Link ist unvollständig oder beschädigt.");
  if (sel && !SUPPORTED_KINDS.includes(sel.kind)) {
    warnings.push(`Auswahlart „${SEL_KINDS[sel.kind]}“ kommt erst in einer späteren Stufe.`);
  }

  let r = null;
  if (sel && RADIUS[sel.kind]) {
    const lim = RADIUS[sel.kind];
    const raw = params.get("r");
    r = lim.def;
    if (raw != null) {
      const v = Number(raw);
      if (Number.isFinite(v)) {
        r = clamp(Math.round(v), lim.min, lim.max);
        if (r !== Math.round(v)) warnings.push(`Radius auf ${r} m begrenzt (${lim.min}–${lim.max} m).`);
      }
    }
  }
  let b = null;
  if (sel?.kind === "s") {
    const v = Number(params.get("b") ?? BUFFER.def);
    b = clamp(Number.isFinite(v) ? Math.round(v) : BUFFER.def, BUFFER.min, BUFFER.max);
  }

  // Jahre: wie der Karten-Permalink kodiert; der Report braucht einen zusammenhängenden Bereich.
  let yearRange = null;
  const rawJahr = params.get("jahr");
  if (rawJahr && rawJahr !== "-") {
    const ys = unpackYears(rawJahr).map((c) => (/^\d{2}$/.test(c) ? 2000 + Number(c) : NaN)).filter(Number.isFinite);
    if (ys.length) {
      let from = Math.min(...ys);
      let to = Math.max(...ys);
      if (ys.length !== to - from + 1) warnings.push(`Der Report wertet Jahre zusammenhängend aus: ${from}–${to}.`);
      if (years.length) {
        const lo = Math.min(...years);
        const hi = Math.max(...years);
        if (from < lo || to > hi) {
          from = clamp(from, lo, hi);
          to = clamp(to, lo, hi);
          warnings.push(`Jahre auf den vorhandenen Datenbereich ${lo}–${hi} begrenzt.`);
        }
      }
      yearRange = { from, to };
    }
  }
  if (!yearRange && years.length) {
    const hi = Math.max(...years);
    yearRange = { from: Math.max(Math.min(...years), hi - 2), to: hi };
  }

  const landRaw = (params.get("land") ?? "").toLowerCase();
  const land = LAND_CODES.includes(landRaw) || landRaw === "bund" ? landRaw : null;
  if (landRaw && !land) warnings.push(`Unbekanntes Land „${landRaw}“ – ermittelt wird es aus der Lage.`);

  const rw = params.get("rw");
  let map = null;
  const rawMap = params.get("map");
  if (rawMap) {
    const [z, la, lo] = rawMap.split("/").map(Number);
    if ([z, la, lo].every(Number.isFinite)) map = { zoom: z, lat: la, lng: lo };
  }

  return { version: version ?? null, sel, r, b, years: yearRange, land, rw: rw || null, map, warnings };
}

/** Jahresbereich wie der Karten-Permalink: ab 3 Jahren am Stück als Bereich (23-25), sonst 24_25. */
export function packYearRange(from, to) {
  const codes = [];
  for (let y = from; y <= to; y++) codes.push(String(y).slice(-2));
  return packYears(codes);
}

/**
 * Link schreiben (Query ohne "?"). Radius nur, wenn er von der Voreinstellung abweicht;
 * Jahre immer (siehe Kopf).
 */
export function formatReportLink({ sel, r, b, years, land, rw, map }) {
  const pairs = [["rv", REPORT_LINK_VERSION]];
  if (sel) {
    if (sel.kind === "k") pairs.push(["sel", `k:${round5(sel.lat)},${round5(sel.lng)}`]);
    else if (sel.kind === "e") pairs.push(["sel", `e:${sel.oid}@${round5(sel.lat)},${round5(sel.lng)}`]);
    else if (sel.kind === "s" || sel.kind === "g") pairs.push(["sel", `${sel.kind}:${encodeURIComponent(encodePolyline(sel.points))}`]);
    else if (sel.kind === "ags") pairs.push(["sel", `ags:${sel.ags}`]);
    const lim = RADIUS[sel.kind];
    if (lim && r != null && r !== lim.def) pairs.push(["r", String(Math.round(r))]);
    if (sel.kind === "s" && b != null && b !== BUFFER.def) pairs.push(["b", String(Math.round(b))]);
  }
  if (years) pairs.push(["jahr", packYearRange(years.from, years.to)]);
  if (land) pairs.push(["land", land]);
  if (rw) pairs.push(["rw", rw]);
  if (map) pairs.push(["map", [map.zoom.toFixed(2), round5(map.lat), round5(map.lng)].join("/")]);
  return pairs.map(([k, v]) => `${k}=${v}`).join("&");
}

/** Link in die Karte (Permalink v2) an die Stelle der Auswahl, mit denselben Jahren. */
export function mapLinkFor({ lat, lng, zoom = 17, years }) {
  const pairs = [["v", "2"], ["map", [zoom.toFixed(2), round5(lat), round5(lng)].join("/")]];
  if (years) pairs.push(["jahr", packYearRange(years.from, years.to)]);
  return pairs.map(([k, v]) => `${k}=${v}`).join("&");
}
