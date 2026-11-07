// facilities.js — Einrichtungen aus den OSM-Kacheln und ihre Zuordnung zu § 45 Abs. 9 S. 4
// Nr. 6 StVO (Konzept § 4.2, Tabelle „Zuordnung OSM → Einrichtung"). REIN.
//
// Status je Einrichtung: erfuellt = eindeutig erfasst, unklar = Art aus den Daten nicht sicher
// (Nutzerin kann bestätigen), nicht_erfuellt = nicht erfasst (z. B. Berufsschule).
// Abweichung vom Konzept, bewusst: Schulen OHNE isced:level gelten als allgemeinbildend, wenn
// der Name eine allgemeinbildende Schulform nennt („Grundschule …", „Gymnasium …") — sonst wäre
// fast jede Schule „unklar", weil isced:level in OSM oft fehlt. Der Report sagt „laut Name".
// Umgekehrt macht ein Name („Berufsschule …") nur „unklar", nie „nicht erfüllt".
import { emptyGeom } from "./geometry.js";

export const FAC = {
  schule: { art: "der", noun: "Schule", nr6: "allgemeinbildende Schule", plural: "allgemeinbildenden Schulen", zf: "schule" },
  foerderschule: { art: "der", noun: "Förderschule", nr6: "Förderschule", plural: "Förderschulen", zf: "schule" },
  kita: { art: "der", noun: "Kita", nr6: "Kindertagesstätte", plural: "Kindergärten und Kindertagesstätten", zf: "kita" },
  spielplatz: { art: "dem", noun: "Spielplatz", nr6: "Spielplatz", plural: "Spielplätzen", zf: "spielplatz" },
  pflegeheim: { art: "dem", noun: "Pflegeheim", nr6: "Alten- und Pflegeheim", plural: "Alten- und Pflegeheimen", zf: "altenheim" },
  krankenhaus: { art: "dem", noun: "Krankenhaus", nr6: "Krankenhaus", plural: "Krankenhäusern", zf: "krankenhaus" },
  behinderung: { art: "der", noun: "Einrichtung", nr6: "Einrichtung für Menschen mit Behinderungen", plural: "Einrichtungen für Menschen mit Behinderungen", zf: "wohnheim_behinderung" },
  schule_art: { art: "der", noun: "Schule", nr6: null, plural: "Schulen" },
  senioren: { art: "der", noun: "Senioreneinrichtung", nr6: null, plural: "Senioreneinrichtungen" },
  klinik: { art: "der", noun: "Klinik", nr6: null, plural: "Kliniken" },
  berufsschule: { art: "der", noun: "berufsbildenden Schule", nr6: null, plural: "" },
};

// Frage an die Nutzerin, wenn die Art unklar ist (löst „unklar" auf, nie „nicht erfüllt").
export const ASK_TYPE = {
  schule_art: { q: "Ist es eine allgemeinbildende Schule oder Förderschule (keine Berufs- oder Erwachsenenschule)?", yes: "schule" },
  foerderschule: { q: "Ist es eine Förderschule?", yes: "foerderschule" },
  senioren: { q: "Ist es ein Alten- oder Pflegeheim (nicht nur betreutes Wohnen)?", yes: "pflegeheim" },
  klinik: { q: "Ist es ein Krankenhaus (mit stationärer Behandlung)?", yes: "krankenhaus" },
};

const ALLGEMEIN = /grundschule|gymnasium|realschule|hauptschule|gesamtschule|oberschule|stadtteilschule|gemeinschaftsschule|mittelschule|sekundarschule|regelschule|werkrealschule|volksschule|regionale schule|primarschule|waldorfschule|montessori|lyzeum|schulzentrum/i;
const FOERDER = /förder|sonderpäd|sbbz|schule für (geistig|körper|lern|blinde|gehörlose)/i;
const BERUF = /berufs|\bbbs\b|berufskolleg|berufliche|fachschule|fachoberschule|akademie|hochschule|volkshochschule|fahrschule|musikschule|tanzschule|sprachschule|kunstschule|abendschule/i;

/** ISCED-Stufen aus "1", "1;2", "2-3", "0;1" … */
export function iscedLevels(raw) {
  const out = new Set();
  for (const part of String(raw ?? "").split(/[;,]/)) {
    const m = /^\s*(\d)\s*(?:-\s*(\d))?\s*$/.exec(part);
    if (!m) continue;
    const a = Number(m[1]);
    const b = m[2] != null ? Number(m[2]) : a;
    for (let i = Math.min(a, b); i <= Math.max(a, b); i++) out.add(i);
  }
  return [...out];
}

/**
 * Einrichtung einordnen.
 * @param {"schools"|"health"|"playgrounds"} src  Datensatz
 * @returns {{ typ: string, status: "erfuellt"|"unklar"|"nicht_erfuellt", why: string, osm: string }}
 */
export function classifyFacility(src, p) {
  const name = String(p.name ?? "");
  if (src === "playgrounds") return { typ: "spielplatz", status: "erfuellt", why: "Spielplatz", osm: "leisure=playground" };
  if (src === "schools") {
    if (p.amenity === "kindergarten") return { typ: "kita", status: "erfuellt", why: "Kindergarten/Kita", osm: "amenity=kindergarten" };
    const lv = iscedLevels(p.isced_level);
    const osm = `amenity=school${p.isced_level ? `, isced:level=${p.isced_level}` : ""}`;
    if (lv.some((l) => l >= 1 && l <= 3)) return { typ: FOERDER.test(name) ? "foerderschule" : "schule", status: "erfuellt", why: "allgemeinbildend (ISCED 1–3)", osm };
    if (lv.length && lv.every((l) => l >= 4)) return { typ: "berufsschule", status: "nicht_erfuellt", why: "berufsbildend oder tertiär (ISCED ≥ 4)", osm };
    // Nur der Name spricht dagegen: „unklar" mit Frage, kein hartes Nein (Namen täuschen).
    if (BERUF.test(name)) return { typ: "schule_art", status: "unklar", why: "laut Name vermutlich keine allgemeinbildende Schule – bitte prüfen", osm };
    if (FOERDER.test(name)) return { typ: "foerderschule", status: "unklar", why: "laut Name Förderschule – bitte bestätigen", osm };
    if (ALLGEMEIN.test(name)) return { typ: "schule", status: "erfuellt", why: "laut Name allgemeinbildend", osm };
    return { typ: "schule_art", status: "unklar", why: "Schulart nicht in den Daten", osm };
  }
  // health
  // Kachelfelder heißen mit "_" statt ":" (GDAL/tippecanoe) — für die Anzeige zurück auf OSM.
  const OSM_KEY = { amenity: "amenity", healthcare: "healthcare", healthcare_speciality: "healthcare:speciality", social_facility: "social_facility", social_facility_for: "social_facility:for" };
  const osm = Object.entries(OSM_KEY).filter(([k]) => p[k] != null && p[k] !== "").map(([k, key]) => `${key}=${p[k]}`).join(", ");
  if (p.amenity === "hospital") return { typ: "krankenhaus", status: "erfuellt", why: "Krankenhaus", osm };
  if (p.social_facility === "nursing_home") return { typ: "pflegeheim", status: "erfuellt", why: "Pflegeheim", osm };
  if (p.social_facility_for === "disabled") return { typ: "behinderung", status: "erfuellt", why: "Einrichtung für Menschen mit Behinderungen", osm };
  if (p.social_facility === "assisted_living" || p.social_facility_for === "senior") return { typ: "senioren", status: "unklar", why: "betreutes Wohnen oder Senioreneinrichtung – nicht gleich Pflegeheim", osm };
  return { typ: "klinik", status: "unklar", why: "Klinik/Reha/Fachzentrum – Krankenhaus im Sinne von Nr. 6?", osm };
}

/** OSM-Objekt-ID wie `geo.make_osm_oid`: node/…, way/…, relation/… */
export function oidOf(feature) {
  const p = feature.properties;
  if (feature.type === "Point") return p.osm_id != null ? `node/${p.osm_id}` : null;
  if (p.osm_way_id != null && p.osm_way_id !== "") return `way/${p.osm_way_id}`;
  if (p.osm_id != null && p.osm_id !== "") return `relation/${p.osm_id}`;
  return null;
}

/**
 * Features dreier Datensätze zu Einrichtungen zusammenführen (Stücke an Kachelkanten = ein
 * Objekt). `toXY` projiziert [lng, lat] in lokale Meter.
 */
export function collectFacilities(raw, toXY) {
  const byOid = new Map();
  let anon = 0;
  for (const src of ["schools", "health", "playgrounds"]) {
    for (const f of raw[src] ?? []) {
      const oid = oidOf(f) ?? `anon/${src}/${anon++}`;
      if (!byOid.has(oid)) {
        const cls = classifyFacility(src, f.properties);
        byOid.set(oid, { oid, src, name: f.properties.name || null, props: { ...f.properties }, geom: emptyGeom(), lngLat: [], ...cls });
      }
      const fac = byOid.get(oid);
      if (f.type === "Point") fac.geom.points.push(toXY(f.coordinates));
      else if (f.type === "Polygon") fac.geom.polygons.push(f.coordinates.map((ring) => ring.map(toXY)));
    }
  }
  return [...byOid.values()];
}

/** Anzeigename: „Grundschule am Lindenhof" bzw. „Spielplatz (ohne Namen)". */
export const facLabel = (fac) => fac.name || `${FAC[fac.typ]?.noun ?? "Einrichtung"} (ohne Namen)`;

// Wörter, an denen man erkennt, dass der Name die Art schon trägt („vor der Grundschule X").
const TYPE_WORD = /schule|gymnasium|kita|kinderg|krippe|hort|tagesst|spielplatz|heim|stift|krankenhaus|klinik|hospital|werkstatt|zentrum|wohnen|haus/i;

/** „der Grundschule am Lindenhof" / „dem Spielplatz „Lindenpark"" / „der Schule an der Hauptstraße". */
export function facPhrase(fac, roadName) {
  const t = FAC[fac.typ] ?? { art: "der", noun: "Einrichtung" };
  if (fac.name && TYPE_WORD.test(fac.name)) return `${t.art} ${fac.name}`;
  if (fac.name) return `${t.art} ${t.noun} „${fac.name}“`;
  return `${t.art} ${t.noun}${roadName ? ` an der ${roadName}` : ""}`;
}
