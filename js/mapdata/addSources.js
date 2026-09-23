import { resolveSources, resolveAccidentSources } from "./resolveSources.js";
import { showErrorBanner } from "../ui/errorBanner.js";
import { setSourceResolver } from "../layers/registry.js";
import { MAPILLARY_TOKEN } from "../config/env.js";

// Beim Start registrierte Quellen: nur die Unfälle. Alle anderen legt die Layer-Registry lazy
// beim ersten Einschalten an (ensureEntry) — sie bekommt dafür in attachManifest() den
// URL-Resolver (Local-first ./data/, Fallback B2 unfallkarte-data-v2).
// Die Zuordnung Frontend-Source-ID -> Manifest-ID + Dateiname steht in ACCIDENT_SOURCES
// (resolveSources.js), weil die Unfall-Quellen ohne Manifest auskommen.

// Alle Layer sind in die Pipeline migriert — das alte Bucket `unfallkarte-data`
// (LEGACY) wird nicht mehr gebraucht. (scenario4/5/7 = Mapillary wurden entfernt.)

// Quellenvermerk der Unfalldaten (dl-de/by-2-0 verlangt ihn). Er hing bisher nur am ⓘ der
// Legende — auf dem Handy unerreichbar, weil der Streifen die Attribution verdeckte und
// Tooltips auf Touch nicht aufgehen. MapLibre sammelt Quellen-Attributionen selbst ein und
// zeigt gleiche Zeichenketten nur einmal.
const ACCIDENT_ATTRIBUTION =
  'Unfalldaten: © <a href="https://unfallatlas.statistikportal.de/" target="_blank" rel="noopener">Statistisches Bundesamt</a> (dl-de/by-2-0)';

/**
 * Quellen, die kein Manifest brauchen — laufen sofort, damit die Unfall-Tiles nicht hinter
 * zwei Manifest-Fetches warten. Den Rest erledigt attachManifest().
 */
export async function addSources(map) {
  const addVector = (id, url) => {
    if (!map.getSource(id)) map.addSource(id, { type: "vector", url, attribution: ACCIDENT_ATTRIBUTION });
  };

  for (const [id, url] of Object.entries(await resolveAccidentSources())) {
    addVector(id, url);
  }

  // Mapillary (Vektor-Tiles direkt von Mapillary)
  map.addSource("mapillary-images", {
    type: "vector",
    tiles: [
      `https://tiles.mapillary.com/maps/vtp/mly1_public/2/{z}/{x}/{y}?access_token=${MAPILLARY_TOKEN}`,
    ],
    minzoom: 14,
    maxzoom: 14,
  });
  map.addSource("mapillary-traffic_signs", {
    type: "vector",
    tiles: [
      `https://tiles.mapillary.com/maps/vtp/mly_map_feature_traffic_sign/2/{z}/{x}/{y}?access_token=${MAPILLARY_TOKEN}`,
    ],
    minzoom: 14,
    maxzoom: 14,
  });

  // Basemaps (OSM Carto + Esri) + Terrain/Hillshade (Mapterhorn) + 3D-Gebäude
  // werden keyless von js/map/basemapTerrain.js verwaltet (kein MapTiler mehr).

  // on-the-fly-GeoJSON: Hover point
  map.addSource("hover-point", {
    type: "geojson",
    data: { type: "FeatureCollection", features: [] },
  });
}

/**
 * Das Manifest anhängen: es versorgt die Layer-Registry mit URLs (lazy, beim ersten
 * Einschalten) und die Tooltips mit Datenständen. Läuft NACH den Unfall-Quellen und
 * blockiert sie damit nicht mehr.
 *
 * sourcesPromise wird in main.js schon beim Kartenstart angestoßen (parallel zum Style-
 * und Basemap-Laden); ohne sie hier als Fallback selbst auflösen.
 */
export async function attachManifest(sourcesPromise) {
  const sources = await (sourcesPromise ?? resolveSources());
  if (!sources.manifestOk) {
    showErrorBanner(
      "Die Kartendaten sind gerade nicht erreichbar (Manifest weder lokal noch " +
      "vom Datenserver ladbar) — Unfall- und Kontextlayer bleiben leer."
    );
  }
  setSourceResolver((manifestId) => sources.url(manifestId));
  // Manifest weiterverwenden (z. B. applyDataVintages) statt es erneut zu laden.
  return sources;
}
