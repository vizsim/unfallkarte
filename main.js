import { setupPhotonGeocoder } from './geocoder.js';

let MAPTILER_API_KEY = '';
let MAPILLARY_TOKEN = '';

let originalMinZoom = 6;
let originalMaxZoom = 20;

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

document.querySelector('[data-map="satellite"]').style.backgroundImage =
  "url('./thumbs/thumb-satellite.png')";
const paintStyles = {
  UKATEGORIE: {
    field: "UKATEGORIE",
    colors: {
      1: "#e41a1c",
      2: "#377eb8",
      3: "#4daf4a",
    }
  },
  UJAHR: {
    field: "UJAHR",
    colors: {
      2017: "#f7fbff",
      2018: "#deebf7",
      2019: "#c6dbef",
      2020: "#9ecae1",
      2021: "#6baed6",
      2022: "#4292c6",
      2023: "#2171b5",
    }
  },
  UART: {
    field: "UART",
    colors: {
      1: "#1b9e77",
      2: "#d95f02",
      3: "#7570b3",
      4: "#e7298a",
      5: "#66a61e",
      6: "#e6ab02",
      7: "#a6761d",
      8: "#666666",
      9: "#1f78b4",
      0: "#bbbbbb"
    }
  },
  UTYP1: {
    field: "UTYP1",
    colors: {
      1: "#8dd3c7",
      2: "#ffffb3",
      3: "#bebada",
      4: "#fb8072",
      5: "#80b1d3",
      6: "#fdb462",
      7: "#b3de69"
    }
  },
  BETEILIGUNG: {
    field: null,
    colors: {
      IstRad: "#1f78b4",
      IstPKW: "#33a02c",
      IstFuss: "#e31a1c",
      IstKrad: "#ff7f00",
      IstGkfz: "#a65628",
      IstSonstig: "#6a3d9a"
    }
  }
};



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


// 3. Funktion zur Generierung der "match"-Expression
function getCircleColorPaint(styleKey) {
  const style = paintStyles[styleKey];
  const matchExpr = ["case"];

  if (styleKey === "BETEILIGUNG") {
    for (const [field, color] of Object.entries(style.colors)) {
      matchExpr.push(["==", ["get", field], 1], color);
    }
    matchExpr.push("#aaaaaa"); // default
    return matchExpr;
  }

  // sonst normal match
  const match = ["match", ["get", style.field]];
  for (const [val, color] of Object.entries(style.colors)) {
    match.push(parseInt(val), color);
  }
  match.push("#aaaaaa");
  return match;
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



  map.on("load", () => {

    setupPhotonGeocoder(map); //

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
      url: "pmtiles://https://f003.backblazeb2.com/file/unfallkarte-data/combined.pmtiles"
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


    // Feinere Cluster (Zoom 9–11)
    map.addLayer({
      id: "clusters-fine-layer",
      type: "circle", // oder symbol/fill, je nach Stil
      source: "accidents-cluster",
      "source-layer": "clusters_9_11", // <- Layername aus Tippecanoe
      minzoom: 9,
      maxzoom: 11,
      paint: {
        "circle-radius": [
          "interpolate", ["linear"], ["get", "point_count"],
          1, 2,
          10, 4,
          50, 6,
          100, 8,
          200, 10,
          500, 12,
          1000, 14,
          2000, 18,
          4000, 22
        ],
        "circle-color": "#0044cc",
        "circle-opacity": 0.6
      },
      layout: {
        "circle-sort-key": ["get", "point_count"] // optional – oder auch entfernen
      }
    });


    // Gröbere Cluster (Zoom 6–9)
    map.addLayer({
      id: "clusters-coarse-layer",
      type: "circle",
      source: "accidents-cluster",
      "source-layer": "clusters_6_8",
      minzoom: 6,
      maxzoom: 9,
      paint: {
        "circle-radius": [
          "interpolate", ["linear"], ["get", "point_count"],
          1, 2,
          10, 4,
          50, 6,
          100, 8,
          200, 10,
          500, 12,
          1000, 14,
          2000, 18,
          4000, 22,
          8000, 24,
          16000, 26
        ],
        "circle-color": "#0044cc",
        "circle-opacity": 0.6
      },
      layout: {
        "circle-sort-key": ["get", "point_count"] // optional – oder auch entfernen
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



    const clusterPopup = new maplibregl.Popup({
      closeButton: false,
      closeOnClick: false
    });

    function setupClusterTooltip(layerId) {
      map.on("mouseenter", layerId, (e) => {
        map.getCanvas().style.cursor = "pointer";
        const count = e.features?.[0]?.properties?.point_count;
        if (count) {
          clusterPopup
            .setLngLat(e.lngLat)
            .setHTML(`<strong>${count} Unfälle</strong>`)
            .addTo(map);
        }
      });

      map.on("mouseleave", layerId, () => {
        map.getCanvas().style.cursor = "";
        clusterPopup.remove();
      });
    }

    // Beide Cluster-Layer einbinden:
    setupClusterTooltip("clusters-fine-layer");
    setupClusterTooltip("clusters-coarse-layer");


    const popup = new maplibregl.Popup({
      closeButton: false,
      closeOnClick: false
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
          UJAHR: "Jahr"
        };

        const propsToShow = ["OBJECTID", "UKATEGORIE", "UJAHR", "UART", "UTYP1"];

        let rows = propsToShow.map(key => {
          const label = labels[key] || key;
          let value = props[key];
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




    function updateLayerFilter() {
      const checkboxes = document.querySelectorAll(".legend input[type=checkbox]");

      const beteiligungCheckboxes = Array.from(
        document.querySelectorAll('input[data-field]')
      );
      const aktiveBeteiligungen = beteiligungCheckboxes
        .filter(cb => cb.checked)
        .map(cb => cb.dataset.field);

      const uk_vals = Array.from(checkboxes)
        .filter(cb => cb.checked && cb.dataset.group === "UKATEGORIE")
        .map(cb => parseInt(cb.value));

      const uart_vals = Array.from(checkboxes)
        .filter(cb => cb.checked && cb.dataset.group === "UART")
        .map(cb => parseInt(cb.value));

      const utyp_vals = Array.from(checkboxes)
        .filter(cb => cb.checked && cb.dataset.group === "UTYP1")
        .map(cb => parseInt(cb.value));

      // ⬇️ Beginne mit Filter-Array
      let filter = ["all"];

      // if (uk_vals.length > 0) {
      //   filter.push(["in", "UKATEGORIE", ...uk_vals]);
      // }
      filter.push(["in", "UKATEGORIE", ...uk_vals]);


      // if (uart_vals.length > 0) {
      //   filter.push(["in", "UART", ...uart_vals]);
      // }
      filter.push(["in", "UART", ...uart_vals]);


      // if (utyp_vals.length > 0) {
      //   filter.push(["in", "UTYP1", ...utyp_vals]);
      // }
      filter.push(["in", "UTYP1", ...utyp_vals]);


      const ujahr_vals = Array.from(checkboxes)
        .filter(cb => cb.checked && cb.dataset.group === "UJAHR")
        .map(cb => parseInt(cb.value));

      // if (ujahr_vals.length > 0) {
      //   filter.push(["in", "UJAHR", ...ujahr_vals]);
      // }
      filter.push(["in", "UJAHR", ...ujahr_vals]);



      // if (aktiveBeteiligungen.length > 0) {
      //   const beteiligungExpr = ["any", ...aktiveBeteiligungen.map(f => ["==", f, 1])];
      //   filter.push(beteiligungExpr);
      // }
      const beteiligungExpr =
        aktiveBeteiligungen.length > 0
          ? ["any", ...aktiveBeteiligungen.map(f => ["==", f, 1])]
          : ["==", "UKATEGORIE", -1]; // oder ein anderer safe-fail Filter

      filter.push(beteiligungExpr);


      // ❗️Wenn alles leer: komplett ausblenden
      if (
        uk_vals.length === 0 &&
        uart_vals.length === 0 &&
        utyp_vals.length === 0 &&
        aktiveBeteiligungen.length === 0
      ) {
        filter = ["==", "UKATEGORIE", -1];
      }


      ACCIDENT_LAYERS.forEach(id => {
        if (map.getLayer(id)) map.setFilter(id, filter);
      });
      SYMBOL_LAYERS.forEach(id => {
        if (map.getLayer(id)) map.setFilter(id, filter);
      });

      map.once("idle", updateVisibleFeatureCount);
    }

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

    // Funktion zur Aktualisierung der Anzahl sichtbarer Features
    function updateVisibleFeatureCount() {
      const zoom = map.getZoom();
      let features = [];

      if (zoom < 11) {
        // Nutze Cluster-Layer
        features = map.queryRenderedFeatures({ layers: ["clusters-fine-layer", "clusters-coarse-layer"] });

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

        





        document.getElementById("feature-count").innerHTML =
          `Sichtbare Punkte: ${features.length.toLocaleString()}<br/>Zoomlevel: ${zoom.toFixed(2)}`;
      }
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
    updateLayerFilter();
    applyLegendVisibility();
  });
}




function applyZoomLock() {
  const movebisVisible = map.getLayoutProperty("movebis", "visibility") === "visible";
  const hvsVisible = map.getLayoutProperty("hvs", "visibility") === "visible";
  const mapillaryVisible = map.getLayoutProperty("mapillary-images-layer", "visibility") === "visible";
  const schoolsPointsVisible = map.getLayoutProperty("schools-points", "visibility") === "visible";
  const schoolsPolygonsVisible = map.getLayoutProperty("schools-polygons", "visibility") === "visible";

  const schoolsVisible = schoolsPointsVisible || schoolsPolygonsVisible;

  // Determine the strictest minZoom
  const minZooms = [];
  if (movebisVisible) minZooms.push(13);
  if (schoolsVisible) minZooms.push(13);
  if (hvsVisible) minZooms.push(11);
  if (mapillaryVisible) minZooms.push(14);

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
  ["schools", "hvs", "mapillary", "movebis"].forEach(key => {
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


// document.getElementById("toggle-mapillary").addEventListener("change", function (e) {
//   const checked = e.target.checked;
//   map.setLayoutProperty("mapillary-images-layer", "visibility", checked ? "visible" : "none");

//   const mapillaryLegend = document.getElementById("mapillary-legend");
//   if (mapillaryLegend) mapillaryLegend.style.display = checked ? "block" : "none";

//   applyZoomLock();
//   // requestAnimationFrame(updateLegendVisibilityByZoom);
// });

document.getElementById("toggle-mapillary").addEventListener("change", function (e) {
  const checked = e.target.checked;
  map.setLayoutProperty("mapillary-images-layer", "visibility", checked ? "visible" : "none");
  applyZoomLock();
  applyLegendVisibility(); // 🧼 handles the legend!
});

document.getElementById("toggle-movebis").addEventListener("change", function (e) {
  const checked = e.target.checked;
  map.setLayoutProperty("movebis", "visibility", checked ? "visible" : "none");

  // const movebisLegend = document.getElementById("movebis-legend");
  // if (movebisLegend) movebisLegend.style.display = checked ? "block" : "none";

  applyZoomLock();
  applyLegendVisibility();
  // requestAnimationFrame(updateLegendVisibilityByZoom);
});

document.getElementById("toggle-hvs").addEventListener("change", function (e) {
  const checked = e.target.checked;
  map.setLayoutProperty("hvs", "visibility", checked ? "visible" : "none");

  // const hvsLegend = document.getElementById("hvs-legend");
  // if (hvsLegend) hvsLegend.style.display = checked ? "block" : "none";

  applyZoomLock();
  applyLegendVisibility();
  // requestAnimationFrame(updateLegendVisibilityByZoom);
});

document.getElementById("toggle-schools").addEventListener("change", function (e) {
  const checked = e.target.checked;
  map.setLayoutProperty("schools-points", "visibility", checked ? "visible" : "none");
  map.setLayoutProperty("schools-polygons", "visibility", checked ? "visible" : "none");

  // // Optional: adjust legend
  // const legend = document.getElementById("schools-legend");
  // if (legend) legend.style.display = checked ? "block" : "none";

  applyZoomLock();
  applyLegendVisibility();
});




