// place.js — Wo liegt die Stelle? Land (für Landesregeln und Zuständigkeit), Stadt/Kreis.
//
// - Land: Punkt-in-Polygon auf public/report/laender.json (Natural Earth, gemeinfrei, ~1 km
//   genau; erzeugt mit tools/report/make-laender.mjs). Kein Server, kein Schlüssel.
// - Stadt/Kreis: Photon (komoot, keyless — derselbe Dienst wie die Adresssuche der Karte).
//   Dabei geht die Koordinate an komoot; fällt der Dienst aus, bleibt es beim Land.
// - Gemeinde: aus den Zensus-Kacheln (`name_23`), siehe model.js.
// `landAt` und `placeFrom` sind rein und browserlos getestet.

export const STATE_CODE = {
  "Baden-Württemberg": "bw", Bayern: "by", Berlin: "be", Brandenburg: "bb", Bremen: "hb", Hamburg: "hh", Hessen: "he",
  "Mecklenburg-Vorpommern": "mv", Niedersachsen: "ni", "Nordrhein-Westfalen": "nw", "Rheinland-Pfalz": "rp",
  Saarland: "sl", Sachsen: "sn", "Sachsen-Anhalt": "st", "Schleswig-Holstein": "sh", "Thüringen": "th",
};

function inRing([x, y], ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** Länderkürzel für [lng, lat] oder null (außerhalb). */
export function landAt(data, lng, lat) {
  for (const [code, polys] of Object.entries(data?.laender ?? {})) {
    for (const poly of polys) {
      if (inRing([lng, lat], poly[0]) && !poly.slice(1).some((h) => inRing([lng, lat], h))) return code;
    }
  }
  return null;
}

let laenderPromise = null;
export function loadLaender(url = new URL("./report/laender.json", document.baseURI).href) {
  laenderPromise ??= fetch(url).then((r) => (r.ok ? r.json() : null)).catch(() => null);
  return laenderPromise;
}

/** Photon-Rückwärtssuche: nächstes Objekt mit Adressteilen, oder null. */
export async function reverseGeocode(lat, lng, { timeoutMs = 5000 } = {}) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(`https://photon.komoot.io/reverse?lon=${lng.toFixed(6)}&lat=${lat.toFixed(6)}&lang=de&limit=1`, { signal: ctrl.signal });
    if (!res.ok) return null;
    const p = (await res.json())?.features?.[0]?.properties;
    return p && p.countrycode === "DE" ? p : null;
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

/**
 * Ortsangaben zusammenführen.
 * @param {{ landGeo?: string|null, photon?: object|null, gemeinde?: string|null }} src
 * @returns {{ land: string|null, landQuelle: string, city: string|null, county: string|null, district: string|null, kreisfrei: boolean|null, gemeinde: string|null }}
 */
export function placeFrom({ landGeo = null, photon = null, gemeinde = null }) {
  const landPhoton = photon?.state ? STATE_CODE[photon.state] ?? null : null;
  const land = landPhoton ?? landGeo;
  const city = photon?.city || photon?.town || photon?.village || null;
  const county = photon?.county || null;
  let kreisfrei = null;
  if (["be", "hh", "hb"].includes(land)) kreisfrei = true;
  else if (photon && city) kreisfrei = !county || county === city || county === `Stadt ${city}`;
  return {
    land,
    landQuelle: landPhoton ? "aus den Adressdaten (Photon/OSM)" : landGeo ? "aus der Lage, Landesgrenzen ~1 km genau" : "unbekannt",
    city: city ?? gemeinde ?? null,
    county: kreisfrei ? null : county,
    district: photon?.district || photon?.locality || null,
    kreisfrei,
    gemeinde,
  };
}
