
import { setupPhotonGeocoder } from './geocoder.js';

let MAPTILER_API_KEY = '';
let MAPILLARY_TOKEN = '';

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

const beteiligungEmojis = {
  IstRad: "🚲",
  IstPKW: "🚗",
  IstFuss: "🚶",
  IstKrad: "🏍",
  IstSonstig: "❓"
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

  const originalMinZoom = map.getMinZoom();
  const originalMaxZoom = map.getMaxZoom();

  map.on("load", () => {
    setupPhotonGeocoder(map); //
    const protocol = new pmtiles.Protocol();
    maplibregl.addProtocol("pmtiles", protocol.tile);



    // map.addSource("accidents", {
    //   type: "vector",
    //   url: "pmtiles://accidents.pmtiles"
    // });

    map.addSource("accidents_11-12", {
      type: "vector",
      url: "pmtiles://accidents_11-12.pmtiles"
    });

    map.addSource("accidents_12-13", {
      type: "vector",
      url: "pmtiles://accidents_12-13.pmtiles"
    });

    // map.addSource("accidents-cluster", {
    //   type: "vector",
    //   url: "pmtiles://clustered.pmtiles"
    // });

    map.addSource("accidents-cluster", {
      type: "vector",
      url: "pmtiles://combined.pmtiles"
    });

    map.addSource("satellite", {
      type: "raster",
      tiles: [
        `https://api.maptiler.com/tiles/satellite-v2/{z}/{x}/{y}.jpg?key=${MAPTILER_API_KEY}`
      ],
      tileSize: 256,
      attribution: "© MapTiler"
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
      id: "satellite-layer",
      type: "raster",
      source: "satellite",
      layout: { visibility: "none" }
    }, ACCIDENT_LAYERS[0]); // oder erster Layer

    map.addSource("mapillary-images", {
      type: "vector",
      tiles: [
        `https://tiles.mapillary.com/maps/vtp/mly1_public/2/{z}/{x}/{y}?access_token=${MAPILLARY_TOKEN}`
      ],
      minzoom: 14,
      maxzoom: 14.99
    });

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

    // map.on("zoom", () => {
    //   const currentZoom = map.getZoom();
    //   const legendSections = document.querySelectorAll(".legend-section");

    //   legendSections.forEach(section => {
    //     if (currentZoom < 14) {
    //       section.style.display = "none";
    //     } else {
    //       section.style.display = "";
    //     }
    //   });
    // });

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

    // map.on("mouseenter", "accident-clusters", (e) => {
    //   map.getCanvas().style.cursor = "pointer";
    //   const count = e.features[0].properties.point_count;
    //   clusterPopup
    //     .setLngLat(e.lngLat)
    //     .setHTML(`<strong>${count} Unfälle</strong>`)
    //     .addTo(map);
    // });

    // map.on("mouseleave", "accident-clusters", () => {
    //   map.getCanvas().style.cursor = "";
    //   clusterPopup.remove();
    // });

    const popup = new maplibregl.Popup({
      closeButton: false,
      closeOnClick: false
    });

    // map.on("mousemove", "accident-points", (e) => {
    //   map.getCanvas().style.cursor = "pointer";
    //   const feature = e.features[0];
    //   const props = feature.properties;
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

    // map.on("mouseleave", "accident-points", () => {
    //   map.getCanvas().style.cursor = "";
    //   popup.remove();
    // });
    ACCIDENT_LAYERS.forEach(layerId => {
      map.on("mouseleave", layerId, () => {
        map.getCanvas().style.cursor = "";
        popup.remove();
      });
    });

    //     // Details-Toggle: Layer mit Buchstaben anzeigen/ausblenden
    // document.getElementById("toggle-details").addEventListener("change", function (e) {
    //   const visible = e.target.checked ? "visible" : "none";
    //   map.setLayoutProperty("beteiligung-symbols", "visibility", visible);
    // });
    document.getElementById("toggle-details").addEventListener("change", function (e) {
      const visible = e.target.checked ? "visible" : "none";
      SYMBOL_LAYERS.forEach(layerId => {
        if (map.getLayer(layerId)) {
          map.setLayoutProperty(layerId, "visibility", visible);
        }
      });
    });

    function updateLegendVisibilityByZoom() {
      const zoom = map.getZoom();
      const legend = document.querySelector(".legend");

      if (!legend) return;

      // Hol dir alle legend-Abschnitte außer Titel und Feature Count
      const allSections = Array.from(legend.children).filter(child =>
        !child.classList.contains("legend-title") &&
        child.id !== "feature-count"
      );

      allSections.forEach(el => {
        el.style.display = zoom < 11 ? "none" : "";
      });
    }

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

      if (uk_vals.length > 0) {
        filter.push(["in", "UKATEGORIE", ...uk_vals]);
      }

      if (uart_vals.length > 0) {
        filter.push(["in", "UART", ...uart_vals]);
      }

      if (utyp_vals.length > 0) {
        filter.push(["in", "UTYP1", ...utyp_vals]);
      }

      const ujahr_vals = Array.from(checkboxes)
        .filter(cb => cb.checked && cb.dataset.group === "UJAHR")
        .map(cb => parseInt(cb.value));

      if (ujahr_vals.length > 0) {
        filter.push(["in", "UJAHR", ...ujahr_vals]);
      }


      //   console.log("Aktive Beteiligung-Checkboxen:");
      // console.log(aktiveBeteiligungen);
      // Beteiligungsfilter hinzufügen
      if (aktiveBeteiligungen.length > 0) {
        const beteiligungExpr = ["any", ...aktiveBeteiligungen.map(f => ["==", f, 1])];
        filter.push(beteiligungExpr);
      }

      // ❗️Wenn alles leer: komplett ausblenden
      if (
        uk_vals.length === 0 &&
        uart_vals.length === 0 &&
        utyp_vals.length === 0 &&
        aktiveBeteiligungen.length === 0
      ) {
        filter = ["==", "UKATEGORIE", -1];
      }

      // //   console.log("Aktiver Filter:", JSON.stringify(filter, null, 2));
      // map.setFilter("accident-points", filter);
      // map.setFilter("beteiligung-symbols", filter); // 👈 diese Zeile ergänzt die Emojis

      ACCIDENT_LAYERS.forEach(id => {
        if (map.getLayer(id)) map.setFilter(id, filter);
      });
      SYMBOL_LAYERS.forEach(id => {
        if (map.getLayer(id)) map.setFilter(id, filter);
      });

      map.once("idle", updateVisibleFeatureCount);
    }

    function updateLegendVisibilityByZoom() {
      const zoom = map.getZoom();
      const legend = document.querySelector(".legend");

      if (!legend) return;

      const clusterLegendEl = document.getElementById("cluster-legend");

      // Nur behalten: .legend-title, #feature-count, #cluster-legend
      Array.from(legend.children).forEach(el => {
        const isTitle = el.classList.contains("legend-title");
        const isFeatureCount = el.id === "feature-count";
        const isClusterLegend = el.id === "cluster-legend";

        if (zoom < 11) {
          if (isTitle || isFeatureCount || isClusterLegend) {
            el.style.display = "";
          } else {
            el.style.display = "none";
          }
        } else {
          if (isClusterLegend) {
            el.style.display = "none";
          } else {
            el.style.display = "";
          }
        }
      });
    }

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

        document.getElementById("feature-count").innerHTML =
          `Sichtbare Punkte: ${features.length.toLocaleString()}<br/>Zoomlevel: ${zoom.toFixed(2)}`;
      }
    }



    // function updateVisibleFeatureCount() {
    //   // const features = map.queryRenderedFeatures({ layers: ["accident-points"] });
    //   const features = map.queryRenderedFeatures({ layers: ACCIDENT_LAYERS });
    //   const count = features.length;
    //   const zoom = map.getZoom().toFixed(2);

    //   document.getElementById("feature-count").innerHTML =
    //     `Sichtbare Punkte: ${count.toLocaleString()}<br/>Zoomlevel: ${zoom}`;
    // }

    // Einklappbare Legende mit Pfeil
    document.querySelectorAll(".legend-header").forEach(header => {
      header.addEventListener("click", (e) => {
        // Wenn das Ziel ein <input> ist (z. B. der Radiobutton), abbrechen:
        if (e.target.tagName === "INPUT") return;

        const key = header.dataset.toggle;
        const section = document.querySelector(`.legend-items[data-section="${key}"]`);
        const arrow = document.querySelector(`.toggle-arrow[data-arrow="${key}"]`);
        if (section) section.classList.toggle("collapsed");
        if (arrow) arrow.classList.toggle("open");
      });
    });

    document.querySelectorAll(".legend input[type=checkbox]").forEach(cb => {
      cb.addEventListener("change", () => {
        updateLayerFilter();
        // requestAnimationFrame(updateVisibleFeatureCount); // 🧠 jetzt korrekt!
      });
    });

    map.on("moveend", updateVisibleFeatureCount);
    map.on("zoomend", updateVisibleFeatureCount);

    updateLayerFilter();
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
//   const visible = e.target.checked ? "visible" : "none";
//   map.setLayoutProperty("mapillary-images-layer", "visibility", visible);
// });

document.getElementById("toggle-mapillary").addEventListener("change", function (e) {
  const checked = e.target.checked;

  // Sichtbarkeit des Layers ändern
  map.setLayoutProperty("mapillary-images-layer", "visibility", checked ? "visible" : "none");

  if (checked) {
    // Zoom einschränken
    map.setMinZoom(14);
    map.setMaxZoom(14.99);

    // Falls außerhalb des gültigen Zooms, zurücksetzen
    const z = map.getZoom();
    if (z < 14) map.setZoom(14);
    else if (z > 14.99) map.setZoom(14.99);
  } else {
    // Ursprüngliche Zoomwerte wiederherstellen
    map.setMinZoom(originalMinZoom);
    map.setMaxZoom(originalMaxZoom);
  }
});
