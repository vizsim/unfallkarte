// js/map/bikeLanesLayers.js
//
// Kontextlayer "Radinfrastruktur" — live aus dem TILDA/radverkehrsatlas-
// Vektor-Tile-Server (kein Preprocessing, kein B2). Portiert aus
// vizsim/mapillary_coverage_analysis (viz/map/bikeLanesLayers.js); Styling nach
// der Property `category`. Paint-Details ggf. am Original verfeinern.

export const BIKE_LANES_SOURCE_ID = "bike-lanes";
export const BIKE_LANES_LAYER_IDS = [
  "bike-lanes-baulich",
  "bike-lanes-eigenstaendig",
  "bike-lanes-gehweg",
  "bike-lanes-kfz",
  "bike-lanes-needsClarification",
];

const LINE_WIDTH = ["interpolate", ["linear"], ["zoom"], 8, 1.5, 12, 2, 16, 3];

// category-Werte -> Paint. Reihenfolge = Zeichenreihenfolge.
const CATEGORIES = [
  {
    id: "bike-lanes-baulich",
    color: "#1d4ed8",
    categories: ["cyclewayOnHighwayBothSides", "cyclewayOnHighway", "cycleway", "cyclewayLink"],
  },
  { id: "bike-lanes-eigenstaendig", color: "#0098f0", categories: ["cyclewaySeparated", "footAndCyclewaySegregated"] },
  {
    id: "bike-lanes-gehweg",
    color: "#9fb9f9",
    dash: [2, 2],
    categories: [
      "footwayBicycleYes_isolated",
      "footwayBicycleYes_adjoining",
      "footwayBicycleYes_adjoiningOrIsolated",
      "pedestrianAreaBicycleYes",
    ],
  },
  { id: "bike-lanes-kfz", color: "#f59e0b", dash: [1.5, 1], categories: ["sharedBusLane", "sharedMotorVehicleLane"] },
  { id: "bike-lanes-needsClarification", color: "#a97bea", dash: [2.5, 0.5], categories: ["needsClarification"] },
];

export function addBikeLanesSource(map) {
  if (map.getSource(BIKE_LANES_SOURCE_ID)) return;
  map.addSource(BIKE_LANES_SOURCE_ID, {
    type: "vector",
    tiles: ["https://tiles.tilda-geo.de/atlas_generalized_bikelanes/{z}/{x}/{y}"],
    minzoom: 9,
    maxzoom: 22,
    attribution: 'Radinfrastruktur: radverkehrsatlas / TILDA',
  });
}

export function addBikeLanesLayers(map, beforeId) {
  if (!map.getSource(BIKE_LANES_SOURCE_ID)) return;
  for (const cat of CATEGORIES) {
    if (map.getLayer(cat.id)) continue;
    const paint = { "line-width": LINE_WIDTH, "line-color": cat.color };
    if (cat.dash) paint["line-dasharray"] = cat.dash;
    map.addLayer(
      {
        id: cat.id,
        type: "line",
        source: BIKE_LANES_SOURCE_ID,
        "source-layer": "bikelanes",
        minzoom: 9,
        maxzoom: 22,
        layout: { visibility: "none", "line-cap": "round", "line-join": "round" },
        paint,
        filter: ["match", ["get", "category"], cat.categories, true, false],
      },
      beforeId
    );
  }
}

export function setBikeLanesVisible(map, visible) {
  const v = visible ? "visible" : "none";
  for (const id of BIKE_LANES_LAYER_IDS) {
    if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", v);
  }
}
