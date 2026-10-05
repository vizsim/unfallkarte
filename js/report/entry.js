// entry.js — Einstiege aus der Karte in den Analyse-Report (Konzept § 3.4). REIN.
// Aus einem Kartenobjekt (Popup) wird eine Auswahl {kind, lat, lng, oid?}; hoverPopup.js baut
// daraus den Link (absolut, weil es nur http(s)-Links zulässt).
import { formatReportLink } from "./reportLink.js";

const OID = /^(node|way|relation)\/\d+$/;

/** Punkt des Objekts (Punkt-Geometrie) oder die Klickstelle. */
const where = (feature, lngLat) => {
  const g = feature?.geometry;
  if (g?.type === "Point" && Array.isArray(g.coordinates)) return { lng: g.coordinates[0], lat: g.coordinates[1] };
  return lngLat ? { lng: lngLat.lng, lat: lngLat.lat } : null;
};

/** Schule, Kita, Spielplatz, Gesundheit: Einrichtung über die OSM-ID (wie geo.make_osm_oid). */
export function facilitySel(props, feature, lngLat) {
  const at = where(feature, lngLat);
  if (!at) return null;
  let oid = null;
  if (feature?.geometry?.type === "Point") oid = props.osm_id != null && props.osm_id !== "" ? `node/${props.osm_id}` : null;
  else if (props.osm_way_id != null && props.osm_way_id !== "") oid = `way/${props.osm_way_id}`;
  else if (props.osm_id != null && props.osm_id !== "") oid = `relation/${props.osm_id}`;
  return oid ? { kind: "e", oid, ...at } : { kind: "k", ...at };
}

/** Szenario-Flächen mit `oid` (Sc2/Sc6/Sc8). Ohne gültige ID: Kreuzung an der Klickstelle. */
export function oidSel(oid, feature, lngLat) {
  const at = where(feature, lngLat);
  if (!at) return null;
  return OID.test(String(oid ?? "")) ? { kind: "e", oid: String(oid), ...at } : { kind: "k", ...at };
}

/** Unfallpunkt, Unfallhäufung (Sc9): Kreuzung/Stelle am Objekt. */
export function pointSel(props, feature, lngLat) {
  const at = where(feature, lngLat);
  return at ? { kind: "k", ...at } : null;
}

/** Absolute Report-Adresse relativ zur aktuellen Seite. */
export const reportHref = (sel, base) => new URL(`report.html?${formatReportLink({ sel })}`, base).href;
