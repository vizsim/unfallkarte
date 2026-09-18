import { resolveSources } from "./resolveSources.js";
import { showErrorBanner } from "../ui/errorBanner.js";
import { setSourceResolver } from "../layers/registry.js";

// Beim Start registrierte Quellen: nur die Unfälle (Frontend-Source-ID -> Manifest-ID). Alle
// anderen legt die Layer-Registry lazy beim ersten Einschalten an (ensureEntry) — sie bekommt
// dafür unten den URL-Resolver (Local-first ./data/, Fallback B2 unfallkarte-data-v2).
const MIGRATED = {
  accidents_single: "accidents_single",
  "accidents-cluster": "accidents_cluster",
};

// Alle Layer sind in die Pipeline migriert — das alte Bucket `unfallkarte-data`
// (LEGACY) wird nicht mehr gebraucht. (scenario4/5/7 = Mapillary wurden entfernt.)

export async function addSources(map, { MAPILLARY_TOKEN, sourcesPromise }) {
  const addVector = (id, url) => {
    if (!map.getSource(id)) map.addSource(id, { type: "vector", url });
  };

  // Pipeline-Layer: Local-first + B2-v2-Fallback über data/manifest.json.
  // sourcesPromise wird in main.js schon beim Kartenstart angestoßen (parallel zum
  // Style-/Basemap-Laden); ohne sie hier als Fallback selbst auflösen.
  const sources = await (sourcesPromise ?? resolveSources());
  if (!sources.manifestOk) {
    showErrorBanner(
      "Die Kartendaten sind gerade nicht erreichbar (Manifest weder lokal noch " +
      "vom Datenserver ladbar) — Unfall- und Kontextlayer bleiben leer."
    );
  }
  setSourceResolver((manifestId) => sources.url(manifestId));
  for (const [id, manifestId] of Object.entries(MIGRATED)) {
    addVector(id, sources.url(manifestId));
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

  // Manifest weiterverwenden (z. B. applyDataVintages) statt es erneut zu laden.
  return sources;
}
