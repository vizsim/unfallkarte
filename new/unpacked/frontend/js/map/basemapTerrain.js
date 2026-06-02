// js/map/basemapTerrain.js
//
// Basemap-/Terrain-Handling OHNE MapTiler (kein API-Key). Übernimmt das Muster
// aus vizsim/gradients2osm, angepasst an unfallkarte:
//   - Basis bleibt das lokale Positron-`style.json` (Vektorquelle "openmaptiles").
//   - Raster-Basemaps OSM Carto + Esri werden als Layer ein-/ausgeblendet.
//   - Terrain/Hillshade via Mapterhorn (raster-dem, terrarium), 3D-Gebäude via
//     OpenFreeMap-Planet.
//
// Beim Wechsel auf eine Raster-Basemap werden NUR die Host-Style-Layer
// (source === "openmaptiles" + Hintergrund) versteckt. Alle Daten-Layer
// (Unfälle/Szenarien/OSM …) nutzen andere Sources und bleiben dadurch sichtbar.
//
// Ersetzt: die MapTiler-`hillshade`/`terrain`-Sources in addSources.js und die
// alten #toggleHillshade/#toggleTerrain-Handler in main.js.

const OSM_CARTO_SOURCE = "osm-carto-src";
const OSM_CARTO_LAYER = "osm-carto-layer";
const ESRI_SOURCE = "esri-imagery-src";
const ESRI_LAYER = "esri-imagery-layer";
const TERRAIN_DEM_SOURCE = "terrain-dem";
const HILLSHADE_LAYER = "hillshade-layer";
const BUILDINGS_SOURCE = "ofm-buildings-src";
const BUILDINGS_LAYER = "ofm-3d-buildings";

const TERRAIN_TILEJSON = "https://tiles.mapterhorn.com/tilejson.json";
const BUILDINGS_VECTOR_URL = "https://tiles.openfreemap.org/planet";

const SKY = {
  "sky-color": "#199EF3",
  "sky-horizon-blend": 0.7,
  "horizon-color": "#f0f8ff",
  "horizon-fog-blend": 0.8,
  "fog-color": "#2c7fb8",
  "fog-ground-blend": 0.9,
  "atmosphere-blend": ["interpolate", ["linear"], ["zoom"], 0, 1, 12, 0],
};

function firstSymbolLayer(map) {
  for (const layer of map.getStyle().layers || []) {
    if (layer.type === "symbol") return layer.id;
  }
  return undefined;
}

// Ist `layer` Teil der Positron-Basis (wird beim Raster-Basemap-Wechsel versteckt)?
function isHostLayer(layer) {
  return layer.type === "background" || layer.source === "openmaptiles";
}

// Einmalig nach style 'load' + nach addSources/addLayers aufrufen.
export function addBasemapTerrain(map) {
  const beforeId = firstSymbolLayer(map);

  if (!map.getSource(OSM_CARTO_SOURCE)) {
    map.addSource(OSM_CARTO_SOURCE, {
      type: "raster",
      tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
      tileSize: 256,
      attribution: "© OpenStreetMap contributors",
    });
    map.addLayer(
      { id: OSM_CARTO_LAYER, type: "raster", source: OSM_CARTO_SOURCE, layout: { visibility: "none" } },
      beforeId
    );
  }

  if (!map.getSource(ESRI_SOURCE)) {
    map.addSource(ESRI_SOURCE, {
      type: "raster",
      tiles: ["https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"],
      tileSize: 256,
      attribution: "Tiles © Esri",
    });
    map.addLayer(
      { id: ESRI_LAYER, type: "raster", source: ESRI_SOURCE, layout: { visibility: "none" } },
      beforeId
    );
  }
}

// Mapterhorn-DEM + Hillshade erst beim ersten Relief-Toggle laden (spart einen
// tilejson-Request beim Seitenladen).
function ensureTerrain(map) {
  if (map.getSource(TERRAIN_DEM_SOURCE)) return;
  map.addSource(TERRAIN_DEM_SOURCE, {
    type: "raster-dem",
    url: TERRAIN_TILEJSON,
    tileSize: 512,
    encoding: "terrarium",
    attribution: '© <a href="https://mapterhorn.com" target="_blank" rel="noreferrer">Mapterhorn</a>',
  });
  map.addLayer(
    {
      id: HILLSHADE_LAYER,
      type: "hillshade",
      source: TERRAIN_DEM_SOURCE,
      layout: { visibility: "none" },
      paint: { "hillshade-exaggeration": 0.35, "hillshade-illumination-anchor": "map" },
    },
    firstSymbolLayer(map)
  );
}

function ensureBuildings(map) {
  if (map.getSource(BUILDINGS_SOURCE)) return;
  map.addSource(BUILDINGS_SOURCE, { type: "vector", url: BUILDINGS_VECTOR_URL });
  map.addLayer({
    id: BUILDINGS_LAYER,
    type: "fill-extrusion",
    source: BUILDINGS_SOURCE,
    "source-layer": "building",
    minzoom: 14,
    layout: { visibility: "none" },
    paint: {
      "fill-extrusion-color": "hsl(35, 8%, 85%)",
      "fill-extrusion-height": ["coalesce", ["to-number", ["get", "render_height"]], 12],
      "fill-extrusion-base": ["coalesce", ["to-number", ["get", "render_min_height"]], 0],
      "fill-extrusion-opacity": 0.8,
    },
  });
}

// kind: 'positron' (Vektor-Basis) | 'osm' (OSM Carto) | 'satellite' (Esri)
export function setBasemap(map, kind) {
  const showOsm = kind === "osm";
  const showEsri = kind === "satellite";
  const rasterActive = showOsm || showEsri;

  if (map.getLayer(OSM_CARTO_LAYER)) {
    map.setLayoutProperty(OSM_CARTO_LAYER, "visibility", showOsm ? "visible" : "none");
  }
  if (map.getLayer(ESRI_LAYER)) {
    map.setLayoutProperty(ESRI_LAYER, "visibility", showEsri ? "visible" : "none");
  }
  // Positron-Host-Layer ausblenden, wenn eine Raster-Basemap aktiv ist
  for (const layer of map.getStyle().layers || []) {
    if (isHostLayer(layer)) {
      map.setLayoutProperty(layer.id, "visibility", rasterActive ? "none" : "visible");
    }
  }
}

export function setRelief(map, enabled) {
  if (enabled) ensureTerrain(map);
  if (map.getLayer(HILLSHADE_LAYER)) {
    map.setLayoutProperty(HILLSHADE_LAYER, "visibility", enabled ? "visible" : "none");
  }
  if (map.getSource(TERRAIN_DEM_SOURCE)) {
    map.setTerrain(enabled ? { source: TERRAIN_DEM_SOURCE, exaggeration: 1 } : null);
  }
  if (typeof map.setSky === "function") {
    map.setSky(enabled ? SKY : undefined);
  }
  if (!map.isMoving()) {
    if (enabled && map.getPitch() < 45) map.easeTo({ pitch: 55, duration: 700 });
    else if (!enabled && map.getPitch() > 5) map.easeTo({ pitch: 0, duration: 500 });
  }
}

export function setBuildings(map, enabled) {
  if (enabled) ensureBuildings(map);
  if (map.getLayer(BUILDINGS_LAYER)) {
    map.setLayoutProperty(BUILDINGS_LAYER, "visibility", enabled ? "visible" : "none");
  }
}
