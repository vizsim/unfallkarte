import { resolveSources } from "./resolveSources.js";

// Layer aus der neuen Python-Pipeline: Frontend-Source-ID -> Manifest-ID.
// URL kommt aus resolveSources() (Local-first ./data/, Fallback B2 unfallkarte-data-v2).
// Interne Layer-Namen bleiben gleich -> addLayers.js unverändert.
const MIGRATED = {
  accidents_single: "accidents_single",
  "accidents-cluster": "accidents_cluster",
  schools: "osm_schools",
  health: "osm_health",
  playgrounds: "osm_playgrounds",
  maxspeed: "maxspeed_major",
  maxspeed_minor: "maxspeed_minor",
  scenario1: "scenario1",
  scenario2: "scenario2",
  scenario3: "scenario3",
  scenario6: "scenario6",
  scenario8: "scenario8",
};

// Noch NICHT in die Pipeline migriert -> altes Bucket + alte Dateinamen.
// (statische Kontextdaten + scenario8/Lärm; scenario4/5/7 = Mapillary wurden entfernt.)
const OLD_BASE = "https://f003.backblazeb2.com/file/unfallkarte-data/";
const LEGACY = {
  movebis: "movebis_speed_germany_2020_min10cnt.pmtiles",
  hvs: "Hauptverkehrstraßennetz.pmtiles",
  uspeed: "uber_movement_osm_q2_2019_allHoures_osm200101.pmtiles",
  obs: "OBS_data_2025-06-11.pmtiles",
  laerm1: "laerm/laerm_hlq_den.pmtiles",
  laerm2: "laerm/laerm_4120_hlq_night.pmtiles",
};

export async function addSources(map, { MAPILLARY_TOKEN }) {
  const addVector = (id, url) => {
    if (!map.getSource(id)) map.addSource(id, { type: "vector", url });
  };

  // Pipeline-Layer: Local-first + B2-v2-Fallback über data/manifest.json.
  const sources = await resolveSources();
  for (const [id, manifestId] of Object.entries(MIGRATED)) {
    addVector(id, sources.url(manifestId));
  }

  // Noch nicht migrierte Layer: altes Bucket.
  for (const [id, filename] of Object.entries(LEGACY)) {
    addVector(id, `pmtiles://${OLD_BASE}${filename}`);
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
