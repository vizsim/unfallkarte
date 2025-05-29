import { setupPhotonGeocoder } from './geocoder.js';

import { paintStyles, getCircleColorPaint } from './styleConfig.js';

import { generatePieIcon } from './generatePieIcon.js';



let MAPTILER_API_KEY = '';
let MAPILLARY_TOKEN = '';

let originalMinZoom = 6;
let originalMaxZoom = 20;

let isInitializing = true;  // oben im Skript definieren

const isLocalhost = location.hostname === "localhost";

(async () => {
  try {
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



const ACCIDENT_LAYERS = ["accident-points-11-12", "accident-points-12-13"];
const SYMBOL_LAYERS = ["beteiligung-symbols-11-12", "beteiligung-symbols-12-13"];

// 4. Farbwechsel anwenden
function updateColorStyle() {
  const selected = document.querySelector('input[name="color-style"]:checked').value;

  const colorExpr = getCircleColorPaint(selected);

  ACCIDENT_LAYERS.forEach(layerId => {
    if (map.getLayer(layerId)) {
      map.setPaintProperty(layerId, "circle-color", colorExpr);
      map.setPaintProperty(layerId, "circle-opacity", 0.6);
      map.setLayoutProperty(layerId, "visibility", "visible");
    }
  });

  // Beteiligungsbuchstaben-Layer bleibt unabhängig
  const detailsChecked = document.getElementById("toggle-details").checked;
  // map.setLayoutProperty("beteiligung-symbols", "visibility", detailsChecked ? "visible" : "none");

  SYMBOL_LAYERS.forEach(layerId => {
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
  if (isInitializing && !force) return;

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
  [...ACCIDENT_LAYERS, ...SYMBOL_LAYERS].forEach(layerId => {
    if (map.getLayer(layerId)) map.setFilter(layerId, filter);
  });

  map.once("idle", updateVisibleFeatureCount);

  if (shouldUpdatePermalink && !isInitializing) {
    updatePermalink();
  }
}



// Funktion zur Aktualisierung der Anzahl sichtbarer Features
function updateVisibleFeatureCount() {
  const zoom = map.getZoom();
  let features = [];

  if (zoom < 11) {
    // Nutze Cluster-Layer
    features = map.queryRenderedFeatures({ layers: ["pie-clusters-fine-layer", "pie-clusters-coarse-layer"] });

    // Summe der cluster point_counts
    const total = features.reduce((sum, feat) => sum + (feat.properties.point_count || 0), 0);

    document.getElementById("feature-count").innerHTML =
      `Sichtbare Punkte (Cluster): ${total.toLocaleString()}<br/>Zoomlevel: ${zoom.toFixed(2)}`;
  } else {
    // Nutze Einzelpunkt-Layer
    features = map.queryRenderedFeatures({ layers: ACCIDENT_LAYERS });

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

//   const selectedBaseStyle = localStorage.getItem("selectedBasemap") || "dataviz"; // Default
// const styleUrl = `https://api.maptiler.com/maps/${selectedBaseStyle}/style.json?key=${MAPTILER_API_KEY}`;

// window.map = new maplibregl.Map({
//   container: "map",
//   style: styleUrl,
//   center: [13.634, 52.315],
//   zoom: 11,
//   minZoom: 6,
//   maxZoom: 20
// });


  originalMinZoom = map.getMinZoom();
  originalMaxZoom = map.getMaxZoom();



  map.on("load", () => {

    setupPhotonGeocoder(map); //



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

    // map.addSource("accidents-cluster", {
    //   type: "vector",
    //   url: "pmtiles://https://f003.backblazeb2.com/file/unfallkarte-data/combined.pmtiles"
    // });

        map.addSource("accidents-cluster", {
      type: "vector",
      url: "pmtiles://https://f003.backblazeb2.com/file/unfallkarte-data/combined_may25_group.pmtiles"
    });

    map.addSource("satellite", {
      type: "raster",
      tiles: [
        `https://api.maptiler.com/tiles/satellite-v2/{z}/{x}/{y}.jpg?key=${MAPTILER_API_KEY}`
      ],
      tileSize: 256,
      attribution: "© MapTiler"
    });

    map.addSource("mapillary-images", {
      type: "vector",
      tiles: [
        `https://tiles.mapillary.com/maps/vtp/mly1_public/2/{z}/{x}/{y}?access_token=${MAPILLARY_TOKEN}`
      ],
      minzoom: 14,
      maxzoom: 14.99
    });

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

  // 🗂 Add cluster layers
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





    // satellite
    map.addLayer({
      id: "satellite-layer",
      type: "raster",
      source: "satellite",
      layout: { visibility: "none" }
    }, ACCIDENT_LAYERS[0]); // oder erster Layer


    // Hillshade layer
    map.addSource('hillshade', {
      type: 'raster',
      url: `https://api.maptiler.com/tiles/hillshades/tiles.json?key=${MAPTILER_API_KEY}`,
      tileSize: 256
    });

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

    // Terrain source
    map.addSource('terrain', {
      type: 'raster-dem',
      url: `https://api.maptiler.com/tiles/terrain-rgb-v2/tiles.json?key=${MAPTILER_API_KEY}`,
      tileSize: 256,
      encoding: 'mapbox'
    });

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





    ACCIDENT_LAYERS.forEach(layerId => {
      map.on("mousemove", layerId, (e) => {
        map.getCanvas().style.cursor = "pointer";
        const feature = e.features[0];
        const props = feature.properties;


        const translations = {
          UKATEGORIE: {
            1: "Getötete",
            2: "Schwerverletzte",
            3: "Leichtverletzte"
          },
          UART: {
            1: "Anfahrend/ruhend",
            2: "Vorausfahrend/wartend",
            3: "Seitlich gleiche Richtung",
            4: "Entgegenkommend",
            5: "Einbiegend/kreuzend",
            6: "Fußgänger",
            7: "Fahrbahnhindernis",
            8: "Abkommen rechts",
            9: "Abkommen links",
            0: "Sonstiger Unfall"
          },
          UTYP1: {
            1: "Fahrunfall",
            2: "Abbiegeunfall",
            3: "Einbiegen/Kreuzen",
            4: "Fußgänger (Überschreiten)",
            5: "Ruhender Verkehr",
            6: "Längsverkehr",
            7: "Sonstiger Unfall"
          }
        };

        const labels = {
          OBJECTID: "Unfall-ID",
          UKATEGORIE: "Schwere",
          UART: "Unfallart",
          UTYP1: "Unfalltyp",
          UJAHR: "Jahr",

          UMONAT: "Monat",
          UWOCHENTAG: "Wochentag",
          USTUNDE: "Stunde"
        };

        const weekdayNames = ["?", "Sonntag", "Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag"];
        const monthNames = ["?", "Januar", "Februar", "März", "April", "Mai", "Juni", "Juli", "August", "September", "Oktober", "November", "Dezember"];

        // const propsToShow = ["OBJECTID", "UKATEGORIE", "UJAHR", "UART", "UTYP1"];
        const propsToShow = ["OBJECTID", "UKATEGORIE", "UJAHR", "UMONAT", "UWOCHENTAG", "USTUNDE", "UART", "UTYP1"];

        let rows = propsToShow.map(key => {
          const label = labels[key] || key;
          let value = props[key];
          if (key === "UWOCHENTAG" && value != null) value = `${weekdayNames[value]} (${value})`;
          if (key === "UMONAT" && value != null) value = `${monthNames[value]} (${value})`;
          if (translations[key] && value in translations[key]) {
            value = `${translations[key][value]} (${value})`;
          } else if (value == null) {
            value = "?";
          }
          return `<tr><td><strong>${label}</strong></td><td>${value}</td></tr>`;
        }).join("");

        const beteiligungLabels = {
          IstRad: "Fahrrad",
          IstPKW: "Pkw",
          IstFuss: "Fußgänger",
          IstKrad: "Kraftrad",
          IstGkfz: "Güterkraftfahrzeug (GKFZ)",
          IstSonstig: "Sonstige"
        };

        const beteiligte = Object.entries(beteiligungLabels)
          .filter(([key]) => props[key] === 1)
          .map(([, label]) => label);

        if (beteiligte.length > 0) {
          rows += `<tr><td><strong>Beteiligung</strong></td><td>${beteiligte.join(", ")}</td></tr>`;
        }

        const content = `<table style="border-collapse: collapse; font-size: 12px;">${rows}</table>`;
        popup.setLngLat(e.lngLat).setHTML(content).addTo(map);
      });
    });


    ACCIDENT_LAYERS.forEach(layerId => {
      map.on("mouseleave", layerId, () => {
        map.getCanvas().style.cursor = "";
        popup.remove();
      });
    });



    const movebisPopup = new maplibregl.Popup({
      closeButton: false,
      closeOnClick: false
    });

    map.on("mousemove", "movebis", (e) => {
      map.getCanvas().style.cursor = "pointer";

      const feature = e.features[0];
      const props = feature.properties;

      // Option 1: Just show all properties
      const content = Object.entries(props)
        .map(([key, val]) => {
          if (typeof val === "number" && !Number.isInteger(val)) {
            val = val.toFixed(1);
          }
          return `<strong>${key}</strong>: ${val}`;
        })
        .join("<br/>");

      movebisPopup
        .setLngLat(e.lngLat)
        .setHTML(`<div style="font-size: 12px;">${content}</div>`)
        .addTo(map);
    });

    map.on("mouseleave", "movebis", () => {
      map.getCanvas().style.cursor = "";
      movebisPopup.remove();
    });


    // HVS Popup

    const hvsPopup = new maplibregl.Popup({
      closeButton: false,
      closeOnClick: false
    });

    map.on("mousemove", "hvs", (e) => {
      map.getCanvas().style.cursor = "pointer";

      const feature = e.features[0];
      const props = feature.properties;

      // console.log("annualTrafficFlow:", props.annualTrafficFlow, "→ type:", typeof props.annualTrafficFlow);


      const flow = Number(props.annualTrafficFlow);
      const formattedFlow = isNaN(flow)
        ? "?"
        : `${(flow / 1_000_000).toFixed(1).replace(".", ",")} Mio`;

      const content = `
        <div style="font-size: 12px;">
          <strong>HVS</strong><br/>
          <strong>Annual Traffic:</strong> ${formattedFlow}
        </div>
      `;

      hvsPopup.setLngLat(e.lngLat).setHTML(content).addTo(map);
    });

    map.on("mouseleave", "hvs", () => {
      map.getCanvas().style.cursor = "";
      hvsPopup.remove();
    });


// maxspeed Popup

const maxspeedPopup = new maplibregl.Popup({
  closeButton: false,
  closeOnClick: false
});

// Apply to both layers
["maxspeed", "maxspeed-conditional"].forEach((layerId) => {
  map.on("mousemove", layerId, (e) => {
    map.getCanvas().style.cursor = "pointer";

    const feature = e.features[0];
    const props = feature.properties;

    const speed = Number(props.maxspeed);
    const formattedSpeed = isNaN(speed) ? "?" : `${speed} km/h`;

    const content = `
      <div style="font-size: 12px;">
        <strong>Maxspeed</strong><br/>
        <table style="border-collapse: collapse;">
          <tr><td><strong>maxspeed</strong></td><td>${formattedSpeed}</td></tr>
          <tr><td><strong>maxspeed_orig</strong></td><td>${props.maxspeed || "-"}</td></tr>

          <tr><td><strong>maxspeed_conditional</strong></td><td>${props.maxspeed_conditional || "-"}</td></tr>

          <tr><td><strong>maxspeed:type</strong></td><td>${props.maxspeed_type || "-"}</td></tr>
          <tr><td><strong>maxspeed:forward</strong></td><td>${props.maxspeed_forward || "-"}</td></tr>
          <tr><td><strong>maxspeed:backward</strong></td><td>${props.maxspeed_backward || "-"}</td></tr>

          <tr><td><strong>ref</strong></td><td>${props.ref || "-"}</td></tr>
          <tr><td><strong>name</strong></td><td>${props.name || "-"}</td></tr>
          <tr><td><strong>highway</strong></td><td>${props.highway || "-"}</td></tr>
          <tr><td><strong>osm_id</strong></td><td>${props.osm_id || "-"}</td></tr>
        </table>
      </div>
    `;

    maxspeedPopup.setLngLat(e.lngLat).setHTML(content).addTo(map);
  });

  map.on("mouseleave", layerId, () => {
    map.getCanvas().style.cursor = "";
    maxspeedPopup.remove();
  });
});


["maxspeed", "maxspeed-conditional"].forEach((layerId) => {
  map.on("click", layerId, (e) => {
    const feature = e.features[0];
    const osmId = feature.properties.osm_id;

    if (osmId) {
      const url = `https://www.openstreetmap.org/way/${osmId}`;
      window.open(url, "_blank");
    }
  });
});




    // Schulen Popup


    const schoolsPopup = new maplibregl.Popup({
      closeButton: false,
      closeOnClick: false
    });

    function setupSchoolsPopup(layerId) {
      map.on("mouseenter", layerId, (e) => {
        map.getCanvas().style.cursor = "pointer";
        const props = e.features[0].properties;

        const content = `
      <table style="font-size:12px; border-collapse:collapse;">
        ${props.name ? `<tr><td><strong>Name</strong></td><td>${props.name}</td></tr>` : ""}
        ${props.amenity ? `<tr><td><strong>Amenity</strong></td><td>${props.amenity}</td></tr>` : ""}
        ${props.isced_level ? `<tr><td><strong>ISCED</strong></td><td>${props.isced_level}</td></tr>` : ""}
        ${props.osm_way_id ? `<tr><td><strong>OSM Way ID</strong></td><td>${props.osm_way_id}</td></tr>` : ""}
        ${props.osm_id ? `<tr><td><strong>OSM ID</strong></td><td>${props.osm_id}</td></tr>` : ""}
      </table>
    `;

        schoolsPopup.setLngLat(e.lngLat).setHTML(content).addTo(map);
      });

      map.on("mouseleave", layerId, () => {
        map.getCanvas().style.cursor = "";
        schoolsPopup.remove();
      });
    }

    // Enable popups for both points and polygons
    setupSchoolsPopup("schools-points");
    setupSchoolsPopup("schools-polygons");



    document.getElementById("toggle-details").addEventListener("change", function (e) {
      const visible = e.target.checked ? "visible" : "none";
      SYMBOL_LAYERS.forEach(layerId => {
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

      const clusterLegendEl = document.getElementById("cluster-legend");
      const movebisLegend = document.getElementById("movebis-legend");
      const hvsLegend = document.getElementById("hvs-legend");
      const mapillaryLegend = document.getElementById("mapillary-legend");

      // Check visibility of layers
      const movebisVisible = map.getLayoutProperty("movebis", "visibility") === "visible";
      const hvsVisible = map.getLayoutProperty("hvs", "visibility") === "visible";
      const mapillaryVisible = map.getLayoutProperty("mapillary-images-layer", "visibility") === "visible";

      // Update visibility for special legends
      if (clusterLegendEl) clusterLegendEl.style.display = zoom < 11 ? "" : "none";
      if (movebisLegend) movebisLegend.style.display = (movebisVisible && zoom >= 13) ? "block" : "none";
      if (hvsLegend) hvsLegend.style.display = (hvsVisible && zoom >= 11) ? "block" : "none";
      if (mapillaryLegend) mapillaryLegend.style.display = (mapillaryVisible && zoom >= 14) ? "block" : "none";

      // Hide/show regular groups depending on zoom
      Array.from(legend.children).forEach(el => {
        const isTitle = el.classList.contains("legend-title");
        const isFeatureCount = el.id === "feature-count";
        const isSpecial = [clusterLegendEl, movebisLegend, hvsLegend, mapillaryLegend].includes(el);

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

map.on("idle", () => {
  if (!isInitializing) return;

  console.log("🟢 Map ist idle – Permalink wird angewendet");
  requestAnimationFrame(() => {
    applyPermalink(); // Checkboxen setzen
    map.on("moveend", updatePermalink);
    map.on("zoomend", updatePermalink);
    isInitializing = false;
  });
});

}



const Permalink = {
  parse() {
    const params = new URLSearchParams(window.location.search);
    return {
      lat: parseFloat(params.get("lat")),
      lng: parseFloat(params.get("lng")),
      zoom: parseFloat(params.get("zoom")),
      style: params.get("style"),
      filters: params.get("filters")?.split("|") || []
    };
  },
  stringify({ lat, lng, zoom, style, filters }) {
    const params = new URLSearchParams({
      lat: lat.toFixed(5),
      lng: lng.toFixed(5),
      zoom: zoom.toFixed(2),
      style,
      filters: filters.join("|")
    });
    history.replaceState(null, "", `?${params.toString()}`);
  }
};

function applyPermalink() {
  const { lat, lng, zoom, style, filters } = Permalink.parse();

  // ⬇️ Wenn URL komplett leer ist → Redirect auf Default-URL mit allen aktiven Filtern
  if (!lat && !lng && !zoom && !style && filters.length === 0) {
const defaultFilters = [
  Object.keys(paintStyles.UKATEGORIE.colors).join("_"),
  Object.keys(paintStyles.BETEILIGUNG.colors).join("_"),
  Object.keys(paintStyles.UJAHR.colors).join("_"),
  Object.keys(paintStyles.UTYP1.colors).join("_"),
  Object.keys(paintStyles.UART.colors).join("_")
];

    Permalink.stringify({
      lat: 52.40709,
      lng: 12.54972,
      zoom: 12.00,
      style: "UKATEGORIE",
      filters: defaultFilters
    });

    return; // Nach Redirect abbrechen – applyPermalink wird erneut aufgerufen
  }

  isInitializing = true;

  // const [ukat, ujahr, uart, utyp, beteiligung] = filters;
  const [ukat, beteiligung, ujahr, utyp, uart] = filters;

  if (!isNaN(lat) && !isNaN(lng)) map.setCenter([lng, lat]);
  if (!isNaN(zoom)) map.setZoom(zoom);
  if (style) {
    document.querySelector(`input[name="color-style"][value="${style}"]`)?.click();
  }

  // Reset
  document.querySelectorAll('.legend input[type=checkbox], .legend input[data-field]').forEach(cb => {
    cb.checked = false;
  });

  ukat?.split("_").forEach(val => {
    document.querySelector(`input[data-group="UKATEGORIE"][value="${val}"]`)?.click();
  });
  ujahr?.split("_").forEach(val => {
    document.querySelector(`input[data-group="UJAHR"][value="${val}"]`)?.click();
  });
  uart?.split("_").forEach(val => {
    document.querySelector(`input[data-group="UART"][value="${val}"]`)?.click();
  });
  utyp?.split("_").forEach(val => {
    document.querySelector(`input[data-group="UTYP1"][value="${val}"]`)?.click();
  });
  beteiligung?.split("_").forEach(field => {
    document.querySelector(`input[data-field="${field}"]`)?.click();
  });

  updateLayerFilter(false, true);
  updateVisibleFeatureCount();

  setTimeout(() => (isInitializing = false), 0);
}



function updatePermalink() {
if (isInitializing) return;

  const center = map.getCenter();
  const zoom = map.getZoom().toFixed(2);
  const style = document.querySelector('input[name="color-style"]:checked')?.value;

  const getCheckedValues = selector =>
    Array.from(document.querySelectorAll(selector))
      .filter(cb => cb.checked)
      .map(cb => cb.value)
      .join("_");

  const ukat = getCheckedValues('input[type=checkbox][data-group="UKATEGORIE"]');
  const ujahr = getCheckedValues('input[type=checkbox][data-group="UJAHR"]');
  const utyp = getCheckedValues('input[type=checkbox][data-group="UTYP1"]');
  const uart = getCheckedValues('input[type=checkbox][data-group="UART"]');
  const beteiligung = Array.from(document.querySelectorAll('input[data-field]'))
    .filter(cb => cb.checked)
    .map(cb => cb.dataset.field)
    .join("_");

const filterParam = [
  ukat,
  beteiligung,
  ujahr,
  utyp,
  uart
].join("|");

  const params = new URLSearchParams({
    lat: center.lat.toFixed(5),
    lng: center.lng.toFixed(5),
    zoom,
    style,
    filters: filterParam
  });

  history.replaceState(null, "", `?${params.toString()}`);
}





function applyZoomLock() {
  const movebisVisible = map.getLayoutProperty("movebis", "visibility") === "visible";
  const hvsVisible = map.getLayoutProperty("hvs", "visibility") === "visible";
  const mapillaryVisible = map.getLayoutProperty("mapillary-images-layer", "visibility") === "visible";
  const schoolsPointsVisible = map.getLayoutProperty("schools-points", "visibility") === "visible";
  const schoolsPolygonsVisible = map.getLayoutProperty("schools-polygons", "visibility") === "visible";
  const maxspeedVisible = map.getLayoutProperty("maxspeed", "visibility") === "visible";

  const schoolsVisible = schoolsPointsVisible || schoolsPolygonsVisible;

  // Determine the strictest minZoom
  const minZooms = [];
  if (movebisVisible) minZooms.push(13);
  if (schoolsVisible) minZooms.push(13); // TODO: should be 11 but need to fix pmtiles
  if (hvsVisible) minZooms.push(11);
  if (mapillaryVisible) minZooms.push(14);
  if (maxspeedVisible) minZooms.push(11); // ✅ NEW ZOOM LOCK

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
  ["schools", "hvs", "mapillary", "movebis", "maxspeed"].forEach(key => {
    const toggle = document.getElementById(`toggle-${key}`);
    const legend = document.getElementById(`${key}-legend`);
    if (toggle && legend) {
      legend.style.display = toggle.checked ? "block" : "none";
    }
  });
}


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
  applyLegendVisibility(); // 🧼 handles the legend!
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




    // Toggle logic
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

