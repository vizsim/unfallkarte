import { setupPhotonGeocoder } from './geocoder.js';

import { paintStyles, getCircleColorPaint } from './styleConfig.js';

import { generatePieIcon } from './generatePieIcon.js';

import {
  setupAccidentPopups,
  setupMovebisPopups,
  setupHVSPopups,
  setupMaxspeedPopups,
  setupSchoolsPopups,
  setupScenario1Popups
} from './popupHandlers.js';



let MAPTILER_API_KEY = '';
let MAPILLARY_TOKEN = '';

let originalMinZoom = 6;
let originalMaxZoom = 20;

//let isInitializing = true;  // oben im Skript definieren
const isInitializingRef = { value: true }; // für Permalink-Module etc.

const isLocalhost = location.hostname === "localhost";

(async () => {
  try {
    // handle the config import based on the environment  for the api keys
    const config = await import(isLocalhost ? './config.js' : './config.public.js');
    ({ MAPTILER_API_KEY, MAPILLARY_TOKEN } = config);
    console.log(`🔑 ${isLocalhost ? "Lokale config.js" : "config.public.js"} geladen`);
    initMap();
  } catch (err) {
    console.error("❌ Konfig konnte nicht geladen werden:", err);
  }
})();


document.querySelector('[data-map="standard"]').style.backgroundImage =
  "url('./thumbs/thumb-standard.png')";

// document.querySelector('[data-map="standard"]').style.backgroundImage =
// "url('./thumbs/thumb-standard.png')";

document.querySelector('[data-map="satellite"]').style.backgroundImage =
  "url('./thumbs/thumb-satellite.png')";




function updateLegendColors(activeKey) {
  document.querySelectorAll(".legend-item").forEach(item => {
    const group = item.getAttribute("data-group");
    const value = item.getAttribute("data-value");
    const span = item.querySelector("span");
    if (!span) return;

    // Für Beteiligung: nutze `data-field`
    if (activeKey === "BETEILIGUNG" && group === "BETEILIGUNG") {
      const field = item.dataset.field;
      const color = paintStyles.BETEILIGUNG.colors[field] || "#aaaaaa";
      span.style.backgroundColor = color;
    }

    // Für andere Gruppen
    else if (group === activeKey) {
      const color = paintStyles[group]?.colors?.[value] || "#aaaaaa";
      span.style.backgroundColor = color;
    }

    // Ausgrauen alle nicht aktiven Gruppen
    else {
      span.style.backgroundColor = "#ffffff";
    }
  });
}




const LAYERS = {
  accidents: ["accident-points-11-12", "accident-points-12-13"],
  symbols: ["beteiligung-symbols-11-12", "beteiligung-symbols-12-13"],
  clusters: ["pie-clusters-fine-layer", "pie-clusters-coarse-layer"]
};


// 4. Farbwechsel anwenden
function updateColorStyle() {
  const selected = document.querySelector('input[name="color-style"]:checked').value;

  const colorExpr = getCircleColorPaint(selected);

  LAYERS.accidents.forEach(layerId => {
    if (map.getLayer(layerId)) {
      map.setPaintProperty(layerId, "circle-color", colorExpr);
      map.setPaintProperty(layerId, "circle-opacity", 0.6);
      map.setLayoutProperty(layerId, "visibility", "visible");
    }
  });

  // Beteiligungsbuchstaben-Layer bleibt unabhängig
  const detailsChecked = document.getElementById("toggle-details").checked;
  // map.setLayoutProperty("beteiligung-symbols", "visibility", detailsChecked ? "visible" : "none");

  LAYERS.symbols.forEach(layerId => {
    if (map.getLayer(layerId)) {
      map.setLayoutProperty(layerId, "visibility", detailsChecked ? "visible" : "none");
    }
  });

  updateLegendColors(selected);
}


// 5. Event-Listener für Radiobuttons
document.querySelectorAll('input[name="color-style"]').forEach(rb => {
  rb.addEventListener("change", updateColorStyle);
});


function getSelectedCheckboxValues(group) {
  return Array.from(document.querySelectorAll(`input[data-group="${group}"]:checked`))
    .map(cb => parseInt(cb.value));
}

function getSelectedBeteiligungen() {
  return Array.from(document.querySelectorAll('input[data-field]:checked'))
    .map(cb => cb.dataset.field);
}

function updateLayerFilter(shouldUpdatePermalink = true, force = false) {
  if (isInitializingRef.value && !force) return;

  const uk_vals = getSelectedCheckboxValues("UKATEGORIE");
  const uart_vals = getSelectedCheckboxValues("UART");
  const utyp_vals = getSelectedCheckboxValues("UTYP1");
  const ujahr_vals = getSelectedCheckboxValues("UJAHR");
  const beteiligungen = getSelectedBeteiligungen();

  // Hauptfilterlogik
  let filter = ["all"];

  filter.push(["in", "UKATEGORIE", ...(uk_vals.length > 0 ? uk_vals : [-1])]);
  filter.push(["in", "UART", ...(uart_vals.length > 0 ? uart_vals : [-1])]);
  filter.push(["in", "UTYP1", ...(utyp_vals.length > 0 ? utyp_vals : [-1])]);
  filter.push(["in", "UJAHR", ...(ujahr_vals.length > 0 ? ujahr_vals : [-1])]);

  const beteiligungExpr = beteiligungen.length > 0
    ? ["any", ...beteiligungen.map(f => ["==", f, 1])]
    : ["==", "UKATEGORIE", -1]; // "unschädlicher" Filter
  filter.push(beteiligungExpr);



  // Filter anwenden
  [...LAYERS.accidents, ...LAYERS.symbols].forEach(layerId => {
    if (map.getLayer(layerId)) map.setFilter(layerId, filter);
  });

  map.once("idle", updateVisibleFeatureCount);

  if (shouldUpdatePermalink && !isInitializingRef.value) {
    //updatePermalink();
    updatePermalink(map, isInitializingRef);
  }
}



// Funktion zur Aktualisierung der Anzahl sichtbarer Features
function updateVisibleFeatureCount() {
  const zoom = map.getZoom();
  let features = [];

  if (zoom < 11) {
    // Nutze Cluster-Layer
    features = map.queryRenderedFeatures({ layers: LAYERS.clusters });

    // Summe der cluster point_counts
    const total = features.reduce((sum, feat) => sum + (feat.properties.point_count || 0), 0);

    document.getElementById("feature-count").innerHTML =
      `Sichtbare Punkte (Cluster): ${total.toLocaleString()}<br/>Zoomlevel: ${zoom.toFixed(2)}`;
  } else {
    // Nutze Einzelpunkt-Layer
    features = map.queryRenderedFeatures({ layers: LAYERS.accidents });

    // counts for each cat
    // Count per UKATEGORIE value
    const countsByUKat = features.reduce((acc, feat) => {
      const val = feat.properties.UKATEGORIE;
      acc[val] = (acc[val] || 0) + 1;
      return acc;
    }, {});
    document.querySelectorAll('.legend-item[data-group="UKATEGORIE"]').forEach(item => {
      const val = parseInt(item.getAttribute('data-value'));
      const count = countsByUKat[val] || 0;

      const badge = item.querySelector(".count-badge");
      if (badge) {
        badge.textContent = count > 0 ? `${count}` : "";
      }
    });

    // UJAHR badge update
    const countsByYear = features.reduce((acc, feat) => {
      const val = feat.properties.UJAHR;
      acc[val] = (acc[val] || 0) + 1;
      return acc;
    }, {});
    document.querySelectorAll('.legend-item[data-group="UJAHR"]').forEach(item => {
      const val = parseInt(item.getAttribute('data-value'));
      const count = countsByYear[val] || 0;
      const badge = item.querySelector(".count-badge");
      if (badge) badge.textContent = count > 0 ? `${count}` : "";
    });

    // UTYP1 badge update
    const countsByUTYP1 = features.reduce((acc, feat) => {
      const val = feat.properties.UTYP1;
      acc[val] = (acc[val] || 0) + 1;
      return acc;
    }, {});
    document.querySelectorAll('.legend-item[data-group="UTYP1"]').forEach(item => {
      const val = parseInt(item.getAttribute('data-value'));
      const count = countsByUTYP1[val] || 0;
      const badge = item.querySelector(".count-badge");
      if (badge) badge.textContent = count > 0 ? `${count}` : "";
    });


    // UART badge update
    const countsByUART = features.reduce((acc, feat) => {
      const val = feat.properties.UART;
      acc[val] = (acc[val] || 0) + 1;
      return acc;
    }, {});
    document.querySelectorAll('.legend-item[data-group="UART"]').forEach(item => {
      const val = parseInt(item.getAttribute('data-value'));
      const count = countsByUART[val] || 0;
      const badge = item.querySelector(".count-badge");
      if (badge) badge.textContent = count > 0 ? `${count}` : "";
    });

    // BETEILIGUNG badge update
    const beteiligungFields = Object.keys(paintStyles.BETEILIGUNG.colors);
    const countsByBeteiligung = {};

    for (const field of beteiligungFields) {
      countsByBeteiligung[field] = features.filter(f => f.properties?.[field] === 1).length;
    }

    document.querySelectorAll('.legend-item[data-group="BETEILIGUNG"]').forEach(item => {
      const field = item.dataset.field;
      const count = countsByBeteiligung[field] || 0;
      const badge = item.querySelector(".count-badge");
      if (badge) badge.textContent = count > 0 ? `${count}` : "";
    });



    document.getElementById("feature-count").innerHTML =
      `Sichtbare Punkte: ${features.length.toLocaleString()}<br/>Zoomlevel: ${zoom.toFixed(2)}`;
  }
}


async function initMap() {

  window.map = new maplibregl.Map({
    container: "map",
    style: `https://api.maptiler.com/maps/dataviz/style.json?key=${MAPTILER_API_KEY}`,
    center: [13.634, 52.315],
    zoom: 11,
    minZoom: 6,
    maxZoom: 20
  });


  originalMinZoom = map.getMinZoom();
  originalMaxZoom = map.getMaxZoom();



  /// load MAP
  map.on("load", () => {

    // load geocoder
    setupPhotonGeocoder(map);

    // load piecharts
    map.on("styleimagemissing", (e) => {
      const id = e.id;
      if (!id.startsWith("pie-")) return;

      const parts = id.split("-");
      if (parts.length !== 4) return;

      const k1 = parseInt(parts[1], 10);
      const k2 = parseInt(parts[2], 10);
      const k3 = parseInt(parts[3], 10);

      const image = generatePieIcon({ k1, k2, k3 });
      if (image) {
        map.addImage(id, image.data, { pixelRatio: 2 });
      }
    });

    // // local / github setup
    //  const protocol = new pmtiles.Protocol();  

    // //  setup backblaze
    //// this does not really work as i give the full url later, however, it is needed for the protocol to work
    const pmtilesBaseURL = "https://f003.backblazeb2.com/file/unfallkarte-data/";
    const protocol = new pmtiles.Protocol(name => {
      const fullUrl = `${pmtilesBaseURL}${name}`;
      console.log("📡 Protocol resolved:", name, "→", fullUrl);
      return fullUrl;
    });
    maplibregl.addProtocol("pmtiles", protocol.tile);


    // load sources
    map.addSource("movebis", {
      type: "vector",
      url: "pmtiles://https://f003.backblazeb2.com/file/unfallkarte-data/movebis_speed_germany_2020_min10cnt.pmtiles"
    });

    map.addSource("hvs", {
      type: "vector",
      url: "pmtiles://https://f003.backblazeb2.com/file/unfallkarte-data/Hauptverkehrstraßennetz.pmtiles"
    });

    map.addSource("maxspeed", {
      type: "vector",
      url: "pmtiles://https://f003.backblazeb2.com/file/unfallkarte-data/processed_major_highways_germany_250528.pmtiles"
    });

    map.addSource("schools", {
      type: "vector",
      url: "pmtiles://https://f003.backblazeb2.com/file/unfallkarte-data/germany_osm_schools-25-05-09.pmtiles"
    });

    map.addSource("accidents_11-12", {
      type: "vector",
      url: "pmtiles://https://f003.backblazeb2.com/file/unfallkarte-data/accidents_11-12.pmtiles"
    });

    map.addSource("accidents_12-13", {
      type: "vector",
      url: "pmtiles://https://f003.backblazeb2.com/file/unfallkarte-data/accidents_12-13.pmtiles"
    });


    map.addSource("accidents-cluster", {
      type: "vector",
      url: "pmtiles://https://f003.backblazeb2.com/file/unfallkarte-data/combined_may25_group.pmtiles"
    });

    map.addSource("scenario1", {
      type: "vector",
      url: "pmtiles://https://f003.backblazeb2.com/file/unfallkarte-data/scenario1_cluster_accidents_ms100.pmtiles"
    });

    map.addSource("mapillary-images", {
      type: "vector",
      tiles: [
        `https://tiles.mapillary.com/maps/vtp/mly1_public/2/{z}/{x}/{y}?access_token=${MAPILLARY_TOKEN}`
      ],
      minzoom: 14,
      maxzoom: 14.99
    });

    map.addSource("satellite", {
      type: "raster",
      tiles: [
        `https://api.maptiler.com/tiles/satellite-v2/{z}/{x}/{y}.jpg?key=${MAPTILER_API_KEY}`
      ],
      tileSize: 256,
      attribution: "© MapTiler"
    });


    map.addSource('hillshade', {
      type: 'raster',
      url: `https://api.maptiler.com/tiles/hillshades/tiles.json?key=${MAPTILER_API_KEY}`,
      tileSize: 256
    });

    // Terrain source
    map.addSource('terrain', {
      type: 'raster-dem',
      url: `https://api.maptiler.com/tiles/terrain-rgb-v2/tiles.json?key=${MAPTILER_API_KEY}`,
      tileSize: 256,
      encoding: 'mapbox'
    });


    // add layers

    function addAccidentLayers({ idSuffix, sourceId, minzoom, maxzoom }) {
      // Punkte-Layer
      map.addLayer({
        id: `accident-points-${idSuffix}`,
        type: "circle",
        source: sourceId,
        "source-layer": "accidents",
        minzoom,
        maxzoom,
        paint: {
          "circle-radius": 6,
          "circle-color": [
            "match",
            ["get", "UKATEGORIE"],
            1, "#e41a1c",
            2, "#377eb8",
            3, "#4daf4a",
            "#aaaaaa"
          ],
          "circle-opacity": 0.6,
          "circle-stroke-color": "#000",
          "circle-stroke-width": 0.5
        }
      });

      // Beteiligungs-Labels
      map.addLayer({
        id: `beteiligung-symbols-${idSuffix}`,
        type: "symbol",
        source: sourceId,
        "source-layer": "accidents",
        minzoom,
        maxzoom,
        layout: {
          "text-field": ["concat",
            ["case", ["==", ["get", "IstRad"], 1], "R", ""],
            ["case", ["all", ["==", ["get", "IstRad"], 1], ["==", ["get", "IstPKW"], 1]], ", ", ""],
            ["case", ["==", ["get", "IstPKW"], 1], "P", ""],
            ["case", ["any", ["all", ["==", ["get", "IstFuss"], 1], ["any", ["==", ["get", "IstRad"], 1], ["==", ["get", "IstPKW"], 1]]]], ", ", ""],
            ["case", ["==", ["get", "IstFuss"], 1], "F", ""],
            ["case", ["any", ["all", ["==", ["get", "IstKrad"], 1], ["any", ["==", ["get", "IstRad"], 1], ["==", ["get", "IstPKW"], 1], ["==", ["get", "IstFuss"], 1]]]], ", ", ""],
            ["case", ["==", ["get", "IstKrad"], 1], "K", ""],
            ["case", ["any", ["all", ["==", ["get", "IstGkfz"], 1], ["any", ["==", ["get", "IstRad"], 1], ["==", ["get", "IstPKW"], 1], ["==", ["get", "IstFuss"], 1], ["==", ["get", "IstKrad"], 1]]]], ", ", ""],
            ["case", ["==", ["get", "IstGkfz"], 1], "G", ""],
            ["case", ["any", ["all", ["==", ["get", "IstSonstig"], 1], ["any", ["==", ["get", "IstRad"], 1], ["==", ["get", "IstPKW"], 1], ["==", ["get", "IstFuss"], 1], ["==", ["get", "IstKrad"], 1], ["==", ["get", "IstGkfz"], 1]]]], ", ", ""],
            ["case", ["==", ["get", "IstSonstig"], 1], "S", ""]
          ],
          "text-size": 14,
          "text-offset": [0, 0],
          "text-anchor": "top",
          "text-allow-overlap": true,
          "text-ignore-placement": true,
          "visibility": "visible"
        },
        paint: {
          "text-color": "#000"
        }
      });
    }

    addAccidentLayers({
      idSuffix: "11-12",
      sourceId: "accidents_11-12",
      minzoom: 11,
      maxzoom: 12
    });

    addAccidentLayers({
      idSuffix: "12-13",
      sourceId: "accidents_12-13",
      minzoom: 12,
      maxzoom: 20.1
    });


    updateColorStyle();

    const sharedIconSizeExpression = [
      "interpolate", ["linear"], [
        "+",
        ["get", "UKATEGORIE__1"],
        ["get", "UKATEGORIE__2"],
        ["get", "UKATEGORIE__3"]
      ],
      1, 0.1,
      4, 0.2,
      10, 0.35,
      50, 0.4,
      100, 0.5,
      500, 0.55,
      1000, 0.6,
      5000, 0.7,
      10000, 0.75,
      20000, 0.8,
      40000, 0.9
    ];

    // Add cluster layers (pie charts)
    const layers = [
      { id: "pie-clusters-fine-layer", sourceLayer: "clusters_9_11", minzoom: 9, maxzoom: 11 },
      { id: "pie-clusters-coarse-layer", sourceLayer: "clusters_6_8", minzoom: 6, maxzoom: 9 }
    ];

    for (const { id, sourceLayer, minzoom, maxzoom } of layers) {
      map.addLayer({
        id,
        type: "symbol",
        source: "accidents-cluster",
        "source-layer": sourceLayer,
        minzoom,
        maxzoom,
        layout: {
          "icon-image": [
            "concat",
            "pie-",
            ["to-string", ["get", "UKATEGORIE__1"]], "-",
            ["to-string", ["get", "UKATEGORIE__2"]], "-",
            ["to-string", ["get", "UKATEGORIE__3"]]
          ],
          "icon-size": sharedIconSizeExpression,
          "icon-allow-overlap": true,
          "symbol-sort-key": [
            "-",
            ["/", ["get", "UKATEGORIE__3"],
              ["+", ["get", "UKATEGORIE__1"],
                ["get", "UKATEGORIE__2"],
                ["get", "UKATEGORIE__3"]]]
          ]
        }
      });
    }

    // 🟡 Hover layer
    map.addSource("hover-point", {
      type: "geojson",
      data: { type: "FeatureCollection", features: [] }
    });

    map.addLayer({
      id: "hover-pie",
      type: "symbol",
      source: "hover-point",
      layout: {
        "icon-image": [
          "concat",
          "pie-",
          ["to-string", ["get", "UKATEGORIE__1"]], "-",
          ["to-string", ["get", "UKATEGORIE__2"]], "-",
          ["to-string", ["get", "UKATEGORIE__3"]]
        ],
        "icon-size": 1,
        "icon-allow-overlap": true
      }
    });



    // Movebis and HVS layers
    map.addLayer({
      id: "movebis",
      type: "line",
      source: "movebis",
      "source-layer": "links",
      layout: {
        visibility: "none" // ⬅️ Start hidden
      },
      paint: {
        "line-color": [
          "interpolate",
          ["linear"],
          ["get", "avg_speed_kmh"],
          12, "#e31a1c",    // red
          18, "#fdcc8a",    // yellow
          24, "#31a354"     // green
        ],
        "line-width": [
          "interpolate",
          ["linear"],
          ["get", "visits"],
          0, 0.5,
          10, 2,
          50, 4,
          100, 8,
          1000, 12
        ]
      }
    });

    map.addLayer({
      id: "hvs",
      type: "line",
      source: "hvs",
      "source-layer": "lines",
      layout: {
        visibility: "none"
      },
      paint: {
        "line-width": [
          "interpolate",
          ["linear"],
          ["to-number", ["get", "annualTrafficFlow"]],
          3000000, 2,
          10000000, 4,
          20000000, 8,
          30000000, 16
        ],
        "line-color": "#222" // add a visible color if needed
      }
    });


    // Maxspeed layers

    const commonLineColor = [
      "case",
      // Explicit "None"
      ["==", ["get", "maxspeed"], "None"], "#000000",

      // DE:urban fallback → treat as 50
      ["all", ["!", ["has", "maxspeed"]], ["==", ["get", "maxspeed_type"], "DE:urban"]],
      "#fdcc8a",

      // DE:rural fallback → treat as 100
      ["all", ["!", ["has", "maxspeed"]], ["==", ["get", "maxspeed_type"], "DE:rural"]],
      "#e31a1c",

      // Null/missing maxspeed
      ["!", ["has", "maxspeed"]], "#ff69b4",
      ["==", ["get", "maxspeed"], null], "#ff69b4",

      // Normal numeric range
      [
        "interpolate", ["linear"],
        ["to-number", ["get", "maxspeed"]],
        30, "#31a354",
        50, "#fdcc8a",
        100, "#e31a1c"
      ]
    ];

    const commonPaint = {
      "line-width": 2.5,
      "line-color": commonLineColor
    };

    map.addLayer({
      id: "maxspeed-conditional",
      type: "line",
      source: "maxspeed",
      "source-layer": "highways",
      layout: { visibility: "none" },
      filter: ["has", "maxspeed_conditional"],
      paint: {
        ...commonPaint,
        "line-dasharray": [2, 2] // ⬅️ add dashed style for conditionals
      }
    });

    map.addLayer({
      id: "maxspeed",
      type: "line",
      source: "maxspeed",
      "source-layer": "highways",
      layout: { visibility: "none" },
      filter: ["!", ["has", "maxspeed_conditional"]],
      paint: commonPaint // ⬅️ solid lines, no dash
    });




    map.moveLayer("maxspeed-conditional");





    // Schulen POINTS
    map.addLayer({
      id: "schools-points",
      type: "circle",
      source: "schools",
      "source-layer": "germany_osm_schools", // must match tippecanoe `-l` name
      filter: ["==", ["geometry-type"], "Point"],
      layout: {
        visibility: "none"
      },
      paint: {
        "circle-radius": 6,
        "circle-color": [
          "match",
          ["get", "amenity"],
          "school", "#0074D9",       // blue
          "kindergarten", "#2ECC40", // green
          "#aaaaaa"                  // default/fallback
        ],
        "circle-stroke-color": "#ffffff",
        "circle-stroke-width": 1
      }
    });

    // Schulen POLYGONS
    map.addLayer({
      id: "schools-polygons",
      type: "fill",
      source: "schools",
      "source-layer": "germany_osm_schools", // again: tippecanoe `-l` name
      filter: ["==", ["geometry-type"], "Polygon"],
      layout: {
        visibility: "none"
      },
      paint: {
        "fill-color": [
          "match",
          ["get", "amenity"],
          "school", "#0074D9",       // blue
          "kindergarten", "#2ECC40", // green
          "#aaaaaa"                  // default/fallback
        ],
        "fill-opacity": 0.5,
        "fill-outline-color": "#1B4D3E"
      }
    });


    // Scenario1

    // Polygon Layer: for zoom 11–14
    map.addLayer({
      id: "scenario1-polys",
      type: "fill",
      source: "scenario1",
      "source-layer": "scenario1-polys",  // ✅ correct name!
      filter: ["==", ["geometry-type"], "Polygon"],
      minzoom: 14,
      layout: {
        visibility: "none"
      },
      paint: {
        "fill-color": "orange",
        "fill-opacity": 0.8,
        "fill-outline-color": "#1B4D3E"
      }
    });

    // Points Layer: for zoom 6–10
    map.addLayer({
      id: "scenario1-points",
      type: "circle",
      source: "scenario1",
      "source-layer": "scenario1-points",  // ✅ correct name!
      //filter: ["has", "cluster_id"],       // ✅ optional but valid
      filter: ["all"],
      minzoom: 6,
      maxzoom: 14,
      layout: {
        visibility: "none"
      },
      paint: {
        "circle-color": "orange",
        "circle-radius": [
          "interpolate", ["linear"], ["zoom"],
          6, 4,
          10, 8
        ],
        "circle-opacity": 0.8,
        "circle-stroke-color": "#1B4D3E",
        "circle-stroke-width": 1
      }
    });





    // add satellite layer
    map.addLayer({
      id: "satellite-layer",
      type: "raster",
      source: "satellite",
      layout: { visibility: "none" }
    }, LAYERS.accidents[0]); // oder erster Layer


    // add Hillshade layer
    map.addLayer({
      id: 'hillshade-layer',
      type: 'raster',
      source: 'hillshade',
      layout: { visibility: 'visible' },
      paint: {
        'raster-opacity': 0.3
      }
    });

    map.setLayoutProperty('hillshade-layer', 'visibility', 'none'); // Hillshade initial verstecken

    // map.setTerrain({ source: 'terrain', exaggeration: 1.5 });
    map.setTerrain(null); // Terrain initial deaktivieren




    // mapillary 
    map.addLayer({
      id: "mapillary-images-layer",
      type: "circle",
      source: "mapillary-images",
      "source-layer": "image",
      paint: {
        "circle-radius": 3,
        "circle-color": "#00b955"
      },
      layout: {
        visibility: "none"
      }
    });


    map.on("click", "mapillary-images-layer", function (e) {
      const feature = e.features[0];
      const imageId = feature.properties.id;

      if (imageId) {
        const url = `https://www.mapillary.com/app/?pKey=${imageId}&focus=photo`;
        window.open(url, "_blank");
      }
    });

    map.on("mouseenter", "mapillary-images-layer", () => {
      map.getCanvas().style.cursor = "pointer";
    });
    map.on("mouseleave", "mapillary-images-layer", () => {
      map.getCanvas().style.cursor = "";
    });



    map.on("zoom", () => {
      const section = document.getElementById("scenario-legend-section");
      if (section) section.style.display = "block";
    });

    map.on('load', () => {
      const legend = document.getElementById("scenario-legend-section");
      if (legend) {
        legend.style.display = "block";
      }

      map.on("zoom", () => {
        legend.style.display = "block"; // force keep visible
      });
    });



    // /// Cluster-Tooltip NEW
    const popup = new maplibregl.Popup({ closeButton: false, closeOnClick: false });
    let hoveredFeatureId = null;

    map.on("mousemove", (e) => {
      const features = map.queryRenderedFeatures(e.point, {
        layers: ["pie-clusters-fine-layer", "pie-clusters-coarse-layer"]
      });

      if (features.length > 0) {
        const f = features[0];
        const id = f.id || JSON.stringify(f.properties);

        if (id !== hoveredFeatureId) {
          hoveredFeatureId = id;

          const k1 = f.properties.UKATEGORIE__1 || 0;
          const k2 = f.properties.UKATEGORIE__2 || 0;
          const k3 = f.properties.UKATEGORIE__3 || 0;
          const total = k1 + k2 + k3;

          const html = `
          <div><strong>Anzahl nach Unfall-Kategorie</strong></div>
          <table style="font-size:12px; border-collapse:collapse;">
            <tr><td style="padding-right:8px;"><strong>Getötete</strong></td><td style="text-align:right;">${k1}</td></tr>
            <tr><td style="padding-right:8px;"><strong>Schwerverletzte</strong></td><td style="text-align:right;">${k2}</td></tr>
            <tr><td style="padding-right:8px;"><strong>Leichtverletzte</strong></td><td style="text-align:right;">${k3}</td></tr>
            <tr><td style="padding-right:8px;"><strong>Gesamt</strong></td><td style="text-align:right;"><strong>${total}</strong></td></tr>
          </table>
        `;

          map.getCanvas().style.cursor = "pointer";
          popup.setLngLat(e.lngLat).setHTML(html).addTo(map);
          map.getSource("hover-point").setData({ type: "FeatureCollection", features: [f] });
        }
      } else {
        if (hoveredFeatureId !== null) {
          hoveredFeatureId = null;
          popup.remove();
          map.getCanvas().style.cursor = "";
          map.getSource("hover-point").setData({ type: "FeatureCollection", features: [] });
        }
      }
    });



    // popups / tooltips
    setupAccidentPopups(map);
    setupMovebisPopups(map);
    setupHVSPopups(map);
    setupMaxspeedPopups(map);
    setupSchoolsPopups(map);
    setupScenario1Popups(map);



    document.getElementById("toggle-details").addEventListener("change", function (e) {
      const visible = e.target.checked ? "visible" : "none";
      LAYERS.symbols.forEach(layerId => {
        if (map.getLayer(layerId)) {
          map.setLayoutProperty(layerId, "visibility", visible);
        }
      });
    });


    // Direkt beim Laden
    map.on("load", updateLegendVisibilityByZoom);

    // Und bei jedem Zoomwechsel
    map.on("zoomend", updateLegendVisibilityByZoom);




    // Funktion zur Aktualisierung der Sichtbarkeit der Legende
    function updateLegendVisibilityByZoom() {
      const zoom = map.getZoom();
      const legend = document.querySelector(".legend");
      if (!legend || legend.classList.contains("collapsed")) return;

      //const clusterLegendEl = document.getElementById("cluster-legend");
      const clusterLegendEl = document.getElementById("cluster-legend-section");
      const movebisLegend = document.getElementById("movebis-legend");
      const hvsLegend = document.getElementById("hvs-legend");
      const mapillaryLegend = document.getElementById("mapillary-legend");
      const maxspeedLegend = document.getElementById("maxspeed-legend");
      const scenarioLegendEl = document.getElementById("scenario-legend-section");

      // Check visibility of layers
      const movebisVisible = map.getLayoutProperty("movebis", "visibility") === "visible";
      const hvsVisible = map.getLayoutProperty("hvs", "visibility") === "visible";
      const mapillaryVisible = map.getLayoutProperty("mapillary-images-layer", "visibility") === "visible";
      const maxspeedVisible = map.getLayoutProperty("maxspeed", "visibility") === "visible";

      // Update visibility for special legends
      if (clusterLegendEl) clusterLegendEl.style.display = zoom < 11 ? "" : "none";
      if (movebisLegend) movebisLegend.style.display = (movebisVisible && zoom >= 11) ? "block" : "none";
      if (hvsLegend) hvsLegend.style.display = (hvsVisible && zoom >= 11) ? "block" : "none";
      if (maxspeedLegend) maxspeedLegend.style.display = (maxspeedVisible && zoom >= 11) ? "block" : "none";
      if (mapillaryLegend) mapillaryLegend.style.display = (mapillaryVisible && zoom >= 14) ? "block" : "none";

      // Hide/show regular groups depending on zoom
      Array.from(legend.children).forEach(el => {
        const isTitle = el.classList.contains("legend-title");
        const isFeatureCount = el.id === "feature-count";
        const isSpecial = [clusterLegendEl, movebisLegend, hvsLegend, mapillaryLegend, maxspeedLegend, scenarioLegendEl].includes(el);

        if (zoom < 11) {
          el.style.display = (isTitle || isFeatureCount || isSpecial) ? "" : "none";
        } else {
          if (!isSpecial) el.style.display = "";
        }
      });
    }


    // // Einklappbare Legende mit Pfeil
    document.querySelectorAll(".legend-header").forEach(header => {
      header.addEventListener("click", (e) => {
        // Klick auf ⓘ oder <input> ignorieren
        if (e.target.tagName === "INPUT" || e.target.classList.contains("info-icon")) return;

        const key = header.dataset.toggle;
        const arrow = header.querySelector(`.toggle-arrow[data-arrow="${key}"]`);

        if (key === "legend-root") {
          const legend = document.querySelector(".legend");
          const collapsed = legend.classList.toggle("collapsed");

          // Zeige/Verstecke alle anderen Elemente außer dem Titel & Feature-Count
          Array.from(legend.children).forEach(child => {
            const isTitle = child.classList.contains("legend-title");
            const isFeatureCount = child.id === "feature-count";
            if (!isTitle && !isFeatureCount) {
              child.style.display = collapsed ? "none" : "";
            }
          });

          if (!collapsed) {
            updateLegendVisibilityByZoom();
          }
        } else {
          const section = document.querySelector(`.legend-items[data-section="${key}"]`);
          if (section) section.classList.toggle("collapsed");
        }

        if (arrow) arrow.classList.toggle("open");
      });
    });



    document.querySelectorAll(".legend input[type=checkbox]").forEach(cb => {
      cb.addEventListener("change", () => {
        updateLayerFilter();
      });
    });

    map.on("moveend", updateVisibleFeatureCount);
    map.on("zoomend", updateVisibleFeatureCount);
    updateLegendVisibilityByZoom();
    applyLegendVisibility();

  });

  /// idle MAP
  map.on("idle", () => {
    if (!isInitializingRef.value) return;

    console.log("🟢 Map ist idle – Permalink wird angewendet");
    requestAnimationFrame(() => {
      applyPermalink(map, paintStyles, updateLayerFilter, updateVisibleFeatureCount, isInitializingRef);
      map.on("moveend", () => updatePermalink(map, isInitializingRef));
      map.on("zoomend", () => updatePermalink(map, isInitializingRef));
      isInitializingRef.value = false;
    });
  });

}

// /// Permalink-stuff
import { Permalink, applyPermalink, updatePermalink } from './permalink.js';



/// Zoom Lock stuff

function applyZoomLock() {
  const movebisVisible = map.getLayoutProperty("movebis", "visibility") === "visible";
  const hvsVisible = map.getLayoutProperty("hvs", "visibility") === "visible";
  const mapillaryVisible = map.getLayoutProperty("mapillary-images-layer", "visibility") === "visible";
  const schoolsPointsVisible = map.getLayoutProperty("schools-points", "visibility") === "visible";
  const schoolsPolygonsVisible = map.getLayoutProperty("schools-polygons", "visibility") === "visible";
  const maxspeedVisible = map.getLayoutProperty("maxspeed", "visibility") === "visible";
  //const scenario1Visible = map.getLayoutProperty("scenario1-polys", "visibility") === "visible";



  const schoolsVisible = schoolsPointsVisible || schoolsPolygonsVisible;

  // Determine the strictest minZoom
  const minZooms = [];
  if (movebisVisible) minZooms.push(13);
  if (schoolsVisible) minZooms.push(13); // TODO: should be 11 but need to fix pmtiles
  if (hvsVisible) minZooms.push(11);
  if (mapillaryVisible) minZooms.push(14);
  if (maxspeedVisible) minZooms.push(11); // ✅ NEW ZOOM LOCK
  // if (scenario1Visible) minZooms.push(11); // ✅ NEW ZOOM LOCK

  const strictestMinZoom = minZooms.length > 0 ? Math.max(...minZooms) : originalMinZoom;

  map.setMinZoom(strictestMinZoom);
  map.setMaxZoom(mapillaryVisible ? 14.99 : originalMaxZoom);

  // Adjust current zoom if it's below the required minimum
  const z = map.getZoom();
  if (z < strictestMinZoom) {
    map.setZoom(strictestMinZoom);
  } else if (mapillaryVisible && z > 14.99) {
    map.setZoom(14.99);
  }
}

function applyLegendVisibility() {
  ["schools", "hvs", "mapillary", "movebis", "maxspeed", "scenario1"].forEach(key => {
    const toggle = document.getElementById(`toggle-${key}`);
    const legend = document.getElementById(`${key}-legend`);
    if (toggle && legend) {
      legend.style.display = toggle.checked ? "block" : "none";
    }
  });
}



// Event-Listeners

document.querySelectorAll(".basemap-thumb").forEach(thumb => {
  thumb.addEventListener("click", () => {
    const selectedMap = thumb.dataset.map;

    // Sichtbarkeit ändern
    const isSatellite = selectedMap === "satellite";
    map.setLayoutProperty("satellite-layer", "visibility", isSatellite ? "visible" : "none");

    // Visuelles Feedback
    document.querySelectorAll(".basemap-thumb").forEach(t => t.classList.remove("selected"));
    thumb.classList.add("selected");
  });
});



document.getElementById("toggle-mapillary").addEventListener("change", function (e) {
  const checked = e.target.checked;
  map.setLayoutProperty("mapillary-images-layer", "visibility", checked ? "visible" : "none");
  applyZoomLock();
  applyLegendVisibility(); //  handles the legend!
});

document.getElementById("toggle-movebis").addEventListener("change", function (e) {
  const checked = e.target.checked;
  map.setLayoutProperty("movebis", "visibility", checked ? "visible" : "none");

  applyZoomLock();
  applyLegendVisibility();
});

document.getElementById("toggle-hvs").addEventListener("change", function (e) {
  const checked = e.target.checked;
  map.setLayoutProperty("hvs", "visibility", checked ? "visible" : "none");

  applyZoomLock();
  applyLegendVisibility();
});

document.getElementById("toggle-maxspeed").addEventListener("change", function (e) {
  const checked = e.target.checked;
  const visibility = checked ? "visible" : "none";

  if (map.getLayer("maxspeed")) {
    map.setLayoutProperty("maxspeed", "visibility", visibility);
  }

  if (map.getLayer("maxspeed-conditional")) {
    map.setLayoutProperty("maxspeed-conditional", "visibility", visibility);
  }

  applyZoomLock();
  applyLegendVisibility();
});

document.getElementById("toggle-schools").addEventListener("change", function (e) {
  const checked = e.target.checked;
  map.setLayoutProperty("schools-points", "visibility", checked ? "visible" : "none");
  map.setLayoutProperty("schools-polygons", "visibility", checked ? "visible" : "none");

  applyZoomLock();
  applyLegendVisibility();
});




// Toggle logic for Hillshade and Terrain
document.getElementById('toggleHillshade').addEventListener('change', (e) => {
  const visibility = e.target.checked ? 'visible' : 'none';
  map.setLayoutProperty('hillshade-layer', 'visibility', visibility);
});

document.getElementById('toggleTerrain').addEventListener('change', (e) => {
  if (e.target.checked) {
    map.setTerrain({ source: 'terrain', exaggeration: 1.5 });
  } else {
    map.setTerrain(null);
  }
});



/// SLIDER !!

const slider = document.getElementById("scenario1-slider");
const sliderValue = document.getElementById("scenario1-slider-value");
const sliderContainer = document.getElementById("scenario1-slider-container");

function applyClusterSizeFilter(minSize) {
  const value = parseInt(minSize, 10); // <<< Umwandlung nötig!
  const filter = [">=", ["to-number", ["get", "cluster_size"]], value];

  if (map.getLayer("scenario1-points")) {
    map.setFilter("scenario1-points", filter);
  }
  if (map.getLayer("scenario1-polys")) {
    map.setFilter("scenario1-polys", filter);
  }
}


slider.addEventListener("input", () => {
  const value = parseInt(slider.value, 10);
  sliderValue.textContent = value;
  applyClusterSizeFilter(value);

  const percent = ((value - slider.min) / (slider.max - slider.min)) * 100;
  slider.style.setProperty("--progress", `${percent}%`);
});

// Checkbox zeigt/verbirgt die Layer UND den Slider
document.getElementById("toggle-scenario1").addEventListener("change", function (e) {
  const checked = e.target.checked;

  map.setLayoutProperty("scenario1-points", "visibility", checked ? "visible" : "none");
  map.setLayoutProperty("scenario1-polys", "visibility", checked ? "visible" : "none");

  // Zeige oder verstecke den Slider
  sliderContainer.style.display = checked ? "block" : "none";

  // Filter initial anwenden
  if (checked) {
    //applyClusterSizeFilter(parseInt(slider.value, 10));
    applyClusterSizeFilter(0);
  }
});

