// analysisData.js — die Daten hinter der Analyse in der Karte: Kreuzung einrasten, Einrichtung
// finden, Vorschau rechnen. Lädt erst bei der ersten Auswahl (dynamischer Import in
// analysisPanel.js → eigener Chunk mit TileReader, Datenmodell und MLT-Decoder); der Start der
// Karte bezahlt nichts dafür.
//
// Gelesen wird wie im Report direkt aus den PMTiles (js/report/), nicht über
// queryRenderedFeatures: das hinge an Zoom und gerade sichtbaren Layern. Zahlen in der Vorschau
// und im Report kommen so aus derselben Rechnung (buildModel).

import { createTileReader } from "../report/tileReader.js";
import { DATASETS, extentOf, readAll, resolveReportSources } from "../report/sources.js";
import { buildModel, facilityAt, snapToJunction } from "../report/model.js";
import { bufferOutline, circleRing, localProjection } from "../report/geometry.js";

const CORE = ["accidents", "roads", "roadsMinor", "schools", "health", "playgrounds"];
const FACILITIES = ["schools", "health", "playgrounds"];
const SNAP_M = 30;       // Klick rastet auf einen Knoten in diesem Umkreis ein
const FACILITY_M = 40;   // so weit darf der Klick neben einer Einrichtung liegen

const reader = createTileReader();
let sourcesPromise = null;
const sources = () => (sourcesPromise ??= resolveReportSources().catch((err) => {
  sourcesPromise = null;   // nach einem Fehler beim nächsten Mal neu versuchen
  throw err;
}));

const round5 = (v) => Math.round(v * 1e5) / 1e5;

/** Wenige Datensätze in einem kleinen Quadrat um den Klick (Einrasten, Einrichtung finden). */
async function readNear(ids, lat, lng, halfM) {
  const { urls } = await sources();
  const box = localProjection(lat, lng).bbox(halfM);
  const entries = await Promise.all(ids.map(async (id) => {
    const d = DATASETS.find((x) => x.id === id);
    if (!urls[id]) return [id, { status: "missing", features: [] }];
    try {
      const { layers } = await reader.read(urls[id], [d.layer], box);
      return [id, { status: "ok", features: layers[d.layer] ?? [] }];
    } catch {
      return [id, { status: "error", features: [] }];
    }
  }));
  return Object.fromEntries(entries);
}

/** Klick → Kreuzung: auf den nächsten Knoten einrasten (≤ 30 m), sonst die Klickstelle. */
export async function snapPlace(lat, lng) {
  const s = snapToJunction(await readNear(["roads", "roadsMinor"], lat, lng, 80), lat, lng, SNAP_M);
  const note = s.snapped
    ? `Eingerastet auf den Knoten ${s.roads.slice(0, 2).join(" / ")}.`
    : s.roads.length ? `Kein Knoten in ${SNAP_M} m – Mittelpunkt an ${s.roads[0]}.` : "Keine Straße in der Nähe.";
  return { sel: { kind: "k", lat: round5(s.lat), lng: round5(s.lng) }, note };
}

/** Klick → Einrichtung (Schule, Kita, Spielplatz, Gesundheit/Pflege) oder null. */
export async function facilityPlace(lat, lng) {
  const hit = facilityAt(await readNear(FACILITIES, lat, lng, 80), lat, lng, FACILITY_M);
  if (!hit) return null;
  return { sel: { kind: "e", oid: hit.oid, lat: round5(hit.lat), lng: round5(hit.lng) }, note: null };
}

/**
 * Vorschau einer Auswahl: Unfälle im Zeitfenster, Straße, Einrichtung — und der Umriss für die
 * Karte. `outlineFor(r)` zeichnet ihn für einen anderen Radius neu, ohne nachzuladen.
 */
export async function preview(sel, r, years, dataYears) {
  const { urls } = await sources();
  const proj = localProjection(sel.lat, sel.lng);
  const raw = await readAll(reader, urls, proj, extentOf(sel, r), { only: CORE });
  const M = buildModel({ raw, sel, r, years, dataYears });
  const fac = M.selection.fac;
  const toLngLat = (ring) => [...ring, ring[0]].map((p) => proj.lngLat(p));
  const outlineFor = (radius) => toLngLat(fac ? bufferOutline(fac.geom, radius) : circleRing([0, 0], radius, 72));
  const sp = M.speed;
  return {
    n: M.accidents.n,
    nSP: M.accidents.nSP,
    fr: M.accidents.fr,
    road: M.road ? (M.streetName && M.road.ref && M.streetName !== M.road.ref ? `${M.streetName} (${M.road.ref})` : M.streetName ?? M.road.label) : null,
    speed: sp?.v != null ? `${sp.v} km/h${sp.derived ? " (abgeleitet)" : ""}` : null,
    facility: fac ? fac.name ?? "Einrichtung ohne Namen" : null,
    facilityMissing: M.selection.facMissing,
    accidentsOk: M.status.accidents === "ok",
    outlineFor,
    facilityRings: fac ? fac.geom.polygons.map((poly) => toLngLat(poly[0])) : [],
  };
}
