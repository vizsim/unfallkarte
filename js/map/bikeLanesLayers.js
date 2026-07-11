// js/map/bikeLanesLayers.js
//
// Kontextlayer "Radinfrastruktur" — live aus dem TILDA/radinfra.de-
// Vektor-Tile-Server (kein Preprocessing, kein B2). Portiert aus
// vizsim/mapillary_coverage_analysis (viz/map/bikeLanesLayers.js); Styling +
// Klassifizierung (Property `category`) 1:1 von dort übernommen — die dortigen
// `category`-Werte entsprechen dem TILDA-Schema (atlas_generalized_bikelanes).

export const BIKE_LANES_SOURCE_ID = "bike-lanes";
export const BIKE_LANES_LAYER_IDS = [
  "bike-lanes-baulich",
  "bike-lanes-eigenstaendig",
  "bike-lanes-fussverkehr",
  "bike-lanes-kfz",
  "bike-lanes-gehweg",
  "bike-lanes-needsClarification",
];

const LINE_WIDTH = ["interpolate", ["linear"], ["zoom"], 8, 1.5, 10, 1.5, 14, 2, 16, 3];
const LINE_OFFSET = ["interpolate", ["linear"], ["zoom"], 12, 0, 15, -1];

// Reihenfolge = Zeichenreihenfolge (erster Eintrag zuunterst). Farben/Dash/Filter
// exakt wie im Referenz-Repo, damit Karte und Legende übereinstimmen.
const CATEGORIES = [
  {
    id: "bike-lanes-needsClarification",
    color: "#a97bea",
    dash: [2.5, 0.5],
    offset: false,
    categories: ["needsClarification"],
  },
  {
    id: "bike-lanes-gehweg",
    color: "#9fb9f9",
    dash: [2, 2],
    offset: true,
    categories: [
      "footwayBicycleYes_isolated",
      "pedestrianAreaBicycleYes",
      "footwayBicycleYes_adjoining",
      "footwayBicycleYes_adjoiningOrIsolated",
    ],
  },
  {
    id: "bike-lanes-kfz",
    color: "#0098f0",
    dash: [3, 1],
    offset: true,
    categories: [
      "sharedMotorVehicleLane",
      "bicycleRoad_vehicleDestination",
      "sharedBusLaneBusWithBike",
      "sharedBusLaneBikeWithBus",
    ],
  },
  {
    id: "bike-lanes-fussverkehr",
    color: "#174ed9",
    dash: [3, 1],
    offset: true,
    categories: [
      "footAndCyclewayShared_isolated",
      "footAndCyclewayShared_adjoining",
      "footAndCyclewayShared_adjoiningOrIsolated",
    ],
  },
  {
    id: "bike-lanes-eigenstaendig",
    color: "#0098f0",
    offset: true,
    categories: [
      "cyclewayOnHighway_exclusive",
      "cyclewayOnHighwayBetweenLanes",
      "cyclewayLink",
      "crossing",
      "cyclewayOnHighway_advisory",
      "cyclewayOnHighway_advisoryOrExclusive",
    ],
  },
  {
    id: "bike-lanes-baulich",
    color: "#174ed9",
    offset: true,
    categories: [
      "footAndCyclewaySegregated_adjoining",
      "footAndCyclewaySegregated_adjoiningOrIsolated",
      "cycleway_isolated",
      "cycleway_adjoining",
      "bicycleRoad",
      "footAndCyclewaySegregated_isolated",
      "cycleway_adjoiningOrIsolated",
      "cyclewayOnHighwayProtected",
    ],
  },
];

export function addBikeLanesSource(map) {
  if (map.getSource(BIKE_LANES_SOURCE_ID)) return;
  map.addSource(BIKE_LANES_SOURCE_ID, {
    type: "vector",
    tiles: ["https://tiles.tilda-geo.de/atlas_generalized_bikelanes/{z}/{x}/{y}"],
    minzoom: 9,
    maxzoom: 22,
    attribution: "Radinfrastruktur: radinfra.de / TILDA",
  });
}

export function addBikeLanesLayers(map, beforeId) {
  if (!map.getSource(BIKE_LANES_SOURCE_ID)) return;
  for (const cat of CATEGORIES) {
    if (map.getLayer(cat.id)) continue;
    const paint = { "line-width": LINE_WIDTH, "line-color": cat.color };
    if (cat.dash) paint["line-dasharray"] = cat.dash;
    if (cat.offset) paint["line-offset"] = LINE_OFFSET;
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
