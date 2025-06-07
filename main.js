import { setupPhotonGeocoder } from './geocoder.js';

import { paintStyles, getCircleColorPaint } from './styleConfig.js';

import { generatePieIcon } from './generatePieIcon.js';

import {
  setupAccidentPopups,
  setupAccClusterPopups,
  setupMovebisPopups,
  setupHVSPopups,
  setupMaxspeedPopups,
  setupSchoolsPopups,
  // setupMapillaryPopups,
  setupScenario1Popups,
  setupScenario2Popups,
  setupScenario3Popups,
  setupScenario4Popups

} from './popupHandlers.js';

import { addSourcesAndLayers } from "./addSourcesAndLayers.js";



let MAPTILER_API_KEY = '';
let MAPILLARY_TOKEN = '';

let originalMinZoom = 6;
let originalMaxZoom = 20;

let currentZoomLock = null;

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
  // accidents: ["accident-points-11-12", "accident-points-12-13"],
  // symbols: ["beteiligung-symbols-11-12", "beteiligung-symbols-12-13"],
  accidents: ["accident-points"],
  symbols: ["beteiligung-symbols"],
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
    updatePermalink(map, isInitializingRef);
  }
}



function updateVisibleFeatureCount() {
  const zoom = map.getZoom();
  let features = [];

  const zoomLockText = currentZoomLock
    ? `<span class="zoom-lock">🔒 ${currentZoomLock}</span>`
    : "";

  const zoomText = `Zoomlevel: ${zoom.toFixed(2)}${zoomLockText ? ` [${zoomLockText}]` : ""}`;

  if (zoom < 11) {
    features = map.queryRenderedFeatures({ layers: LAYERS.clusters });
    const total = features.reduce((sum, f) => sum + (f.properties.point_count || 0), 0);

    // document.getElementById("feature-count").innerHTML =
    //   `Sichtbare Punkte (Cluster): ${total.toLocaleString()}<br/>${zoomText}`;

    document.getElementById("feature-count").innerHTML =
      `<div>Sichtbare Unfälle: ${total.toLocaleString()}</div>
   <div>${zoomText}</div>`;
    return;
  }

  features = map.queryRenderedFeatures({ layers: LAYERS.accidents });

  // Zähle nach beliebigem Property
  function updateBadges(features, property, selectorFn = v => v) {
    const counts = features.reduce((acc, f) => {
      const val = selectorFn(f.properties[property]);
      if (val !== undefined) acc[val] = (acc[val] || 0) + 1;
      return acc;
    }, {});
    document.querySelectorAll(`.legend-item[data-group="${property}"]`).forEach(item => {
      const val = item.getAttribute("data-value") ?? item.dataset.field;
      const count = counts[val] || 0;
      const badge = item.querySelector(".count-badge");
      if (badge) badge.textContent = count > 0 ? `${count}` : "";
    });
  }

  updateBadges(features, "UKATEGORIE", v => parseInt(v));
  updateBadges(features, "UJAHR", v => parseInt(v));
  updateBadges(features, "UTYP1", v => parseInt(v));
  updateBadges(features, "UART", v => parseInt(v));

  // Beteiligung ist ein Sonderfall
  const beteiligungFields = Object.keys(paintStyles.BETEILIGUNG.colors);
  const beteiligungCounts = {};
  for (const field of beteiligungFields) {
    beteiligungCounts[field] = features.filter(f => f.properties?.[field] === 1).length;
  }
  document.querySelectorAll('.legend-item[data-group="BETEILIGUNG"]').forEach(item => {
    const field = item.dataset.field;
    const count = beteiligungCounts[field] || 0;
    const badge = item.querySelector(".count-badge");
    if (badge) badge.textContent = count > 0 ? `${count}` : "";
  });

  // document.getElementById("feature-count").innerHTML =
  //   `Sichtbare Punkte: ${features.length.toLocaleString()}<br/>${zoomText}`;

  document.getElementById("feature-count").innerHTML =
    `<div>Sichtbare Unfälle: ${features.length.toLocaleString()}</div>
   <div>${zoomText}</div>`;

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

    // add NavigationControl
    const nav = new maplibregl.NavigationControl();

    // ⚠️ Nicht über addControl platzieren:
    const customNavContainer = document.getElementById("custom-nav-control");
    customNavContainer.appendChild(nav.onAdd(map)); // ← MapLibre API-konform

    // Kompass-Reset aktivieren:
    setTimeout(() => {
      const compass = customNavContainer.querySelector('.maplibregl-ctrl-compass');
      if (compass) {
        compass.addEventListener('click', () => {
          map.setPitch(0);
          map.easeTo({ bearing: 0 });
        });
      }
    }, 100);


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


    // load sources and layers
    addSourcesAndLayers(map, {
      MAPILLARY_TOKEN,
      MAPTILER_API_KEY
    });


    // Cluster-Checkbox auf korrekten Zustand setzen
    const clusterCheckbox = document.querySelector('.section-checkbox[data-section="cluster"]');
    if (clusterCheckbox) {
      const layerId = "pie-clusters-fine-layer";
      map.once("idle", () => {
        if (map.getLayer(layerId)) {
          const isVisible = map.getLayoutProperty(layerId, "visibility") !== "none";
          clusterCheckbox.checked = isVisible;
        }
      });
    }


    updateColorStyle();
    updateVisibleFeatureCount();

    addMapillaryInteractivity(map);

    map.once("load", updateLegendVisibilityByZoom);
    map.on("zoomend", updateLegendVisibilityByZoom); // Danach bei jedem Zoom


    function updateScenarioLegendVisibility() {
      const legendBox = document.querySelector(".legend");
      const isCollapsed = legendBox.classList.contains("collapsed");

      document.querySelectorAll(".scenario-legend-section").forEach(section => {
        section.style.display = isCollapsed ? "none" : "block";
      });
    }


    map.on("zoom", updateScenarioLegendVisibility);
    map.on("load", updateScenarioLegendVisibility);

    // map.on('click', function(e) {
    //   const features = map.queryRenderedFeatures(e.point, {
    //     layers: ["scenario2-points"]
    //   });
    //   console.log("Clicked features:", features);
    // });


    function addMapillaryInteractivity(map) {
      map.on("click", "mapillary-images-layer", (e) => {
        const feature = e.features?.[0];
        const imageId = feature?.properties?.id;
        if (imageId) {
          window.open(`https://www.mapillary.com/app/?pKey=${imageId}&focus=photo`, "_blank");
        }
      });

      map.on("mouseenter", "mapillary-images-layer", () => {
        map.getCanvas().style.cursor = "pointer";
      });
      map.on("mouseleave", "mapillary-images-layer", () => {
        map.getCanvas().style.cursor = "";
      });
    }


    /// // Mapillary Filter-Checkboxen
    const toggleMapillary = document.getElementById("toggle-mapillary");
    const mapillaryFilterOptions = document.getElementById("mapillary-filter-options");
    const cbPano = document.getElementById("mapillary-pano");
    const cbNonPano = document.getElementById("mapillary-nonpano");

    toggleMapillary.addEventListener("change", () => {
      const checked = toggleMapillary.checked;
      mapillaryFilterOptions.style.display = checked ? "block" : "none";
      cbPano.checked = checked;
      cbNonPano.checked = checked;
      toggleMapillary.indeterminate = false;
      updateMapillaryFilter();
    });



    [cbPano, cbNonPano].forEach(cb => {
      cb.addEventListener("change", () => {
        const both = cbPano.checked && cbNonPano.checked;
        const none = !cbPano.checked && !cbNonPano.checked;

        toggleMapillary.checked = both;
        toggleMapillary.indeterminate = !both && !none;

        updateMapillaryFilter();
      });
    });




    // popups / tooltips
    setupAccidentPopups(map);
    setupAccClusterPopups(map);
    setupMovebisPopups(map);
    setupHVSPopups(map);
    setupMaxspeedPopups(map);
    setupSchoolsPopups(map);
    // setupMapillaryPopups(map);
    setupScenario1Popups(map);
    setupScenario2Popups(map);
    setupScenario3Popups(map);
    setupScenario4Popups(map);



    document.getElementById("toggle-details").addEventListener("change", function (e) {
      const visible = e.target.checked ? "visible" : "none";
      LAYERS.symbols.forEach(layerId => {
        if (map.getLayer(layerId)) {
          map.setLayoutProperty(layerId, "visibility", visible);
        }
      });
    });


    // // Direkt beim Laden
    // map.on("load", updateLegendVisibilityByZoom);

    // // Und bei jedem Zoomwechsel
    // map.on("zoomend", updateLegendVisibilityByZoom);




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
      // const scenarioLegendEl = document.getElementById("scenario-legend-section");

      // Check visibility of layers
      const movebisVisible = map.getLayoutProperty("movebis", "visibility") === "visible";
      const hvsVisible = map.getLayoutProperty("hvs", "visibility") === "visible";
      // const mapillaryVisible = map.getLayoutProperty("mapillary-images-layer", "visibility") === "visible";
      const mapillaryVisible =
        map.getLayoutProperty("mapillary-images-layer", "visibility") === "visible" ||
        map.getLayoutProperty("mapillary-images-halo", "visibility") === "visible";
      const maxspeedVisible = map.getLayoutProperty("maxspeed", "visibility") === "visible";

      // Update visibility for special legends
      // if (clusterLegendEl) clusterLegendEl.style.display = zoom < 11 ? "" : "none";
      if (clusterLegendEl) { clusterLegendEl.style.display = zoom < 11 ? "block" : "none"; }
      if (movebisLegend) movebisLegend.style.display = (movebisVisible && zoom >= 11) ? "block" : "none";
      if (hvsLegend) hvsLegend.style.display = (hvsVisible && zoom >= 11) ? "block" : "none";
      if (maxspeedLegend) maxspeedLegend.style.display = (maxspeedVisible && zoom >= 11) ? "block" : "none";
      if (mapillaryLegend) mapillaryLegend.style.display = (mapillaryVisible && zoom >= 14) ? "block" : "none";
      // if (scenarioLegendEl) {
      //   scenarioLegendEl.style.display = "block"; // ← explizit sichtbar machen
      // }

      // // Hide/show regular groups depending on zoom
      Array.from(legend.children).forEach(el => {
        const isTitle = el.classList.contains("legend-title");
        const isFeatureCount = el.id === "feature-count-wrapper";
        const scenarioSections = Array.from(document.querySelectorAll(".scenario-legend-section"));
        const isSpecial = [
          clusterLegendEl,
          movebisLegend,
          hvsLegend,
          mapillaryLegend,
          maxspeedLegend,
          ...scenarioSections
        ].includes(el);

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
            const isFeatureCount = child.id === "feature-count-wrapper";
            // if (!isTitle && !isFeatureCount) {
            //   child.style.display = collapsed ? "none" : "";
            // }
            const alwaysVisible = isTitle || isFeatureCount;
            child.style.display = collapsed && !alwaysVisible ? "none" : "";

          });

          if (!collapsed) {
            updateLegendVisibilityByZoom();
            updateScenarioLegendVisibility();
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





    document.querySelectorAll('.section-arrow').forEach(arrow => {
      arrow.addEventListener('click', () => {
        const sectionId = arrow.dataset.arrow;
        const section = document.querySelector(`.legend-section[data-section="${sectionId}"]`);
        if (!section) return;

        const content = section.querySelector('.legend-section-content');
        const isOpen = arrow.classList.contains('open');

        arrow.classList.toggle('open', !isOpen);
        section.classList.toggle('collapsed', isOpen);
      });
    });


    document.querySelectorAll('.section-checkbox').forEach(sectionCb => {
      const sectionId = sectionCb.dataset.section;
      const section = document.querySelector(`.legend-section[data-section="${sectionId}"]`);
      if (!section) return;

      // const itemCheckboxes = section.querySelectorAll('input[type="checkbox"]:not(.section-checkbox)');
      const itemCheckboxes = section.querySelectorAll('input[type="checkbox"]:not(.section-checkbox):not(#toggle-details)');

      // ⬅ Abschnitts-Checkbox klickt alle enthaltenen Checkboxen an/aus
      sectionCb.addEventListener('change', () => {
        const checked = sectionCb.checked;

        // Custom logic for cluster section
        if (sectionId === "cluster") {
          const visibility = checked ? "visible" : "none";
          LAYERS.clusters.forEach(layerId => {
            if (map.getLayer(layerId)) {
              map.setLayoutProperty(layerId, "visibility", visibility);
            }
          });
          return; // skip checkbox syncing for clusters
        }

        // ✅ Scenario block logic
        if (sectionId === "scenario") {
          itemCheckboxes.forEach(cb => {
            cb.checked = checked;
            cb.dispatchEvent(new Event("change")); // trigger updates (layer + slider)
          });
          return;
        }

        // regular behavior
        itemCheckboxes.forEach(cb => cb.checked = checked);
        sectionCb.indeterminate = false;
        updateLayerFilter(); // ← wichtig!
      });

      // ⬅ Reagiere auf Änderungen in enthaltenen Checkboxen
      itemCheckboxes.forEach(cb => {
        cb.addEventListener('change', () => {
          const checkedCount = Array.from(itemCheckboxes).filter(c => c.checked).length;

          if (checkedCount === 0) {
            sectionCb.checked = false;
            sectionCb.indeterminate = false;
          } else if (checkedCount === itemCheckboxes.length) {
            sectionCb.checked = true;
            sectionCb.indeterminate = false;
          } else {
            sectionCb.checked = false;
            sectionCb.indeterminate = true;
          }

          updateLayerFilter(); // ← wichtig!
        });
      });

      // ⬅ Initial synchronisieren
      const checkedCount = Array.from(itemCheckboxes).filter(c => c.checked).length;
      if (checkedCount === 0) {
        sectionCb.checked = false;
        sectionCb.indeterminate = false;
      } else if (checkedCount === itemCheckboxes.length) {
        sectionCb.checked = true;
        sectionCb.indeterminate = false;
      } else {
        sectionCb.checked = false;
        sectionCb.indeterminate = true;
      }
    });








    map.on("moveend", updateVisibleFeatureCount);
    map.on("zoomend", updateVisibleFeatureCount);
    updateLegendVisibilityByZoom();
    applyLegendVisibility();

  });

  /// idle MAP
  map.on("idle", () => {
    if (!isInitializingRef.value) return;

    // console.log("🟢 Map ist idle – Permalink wird angewendet");
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

  // currentZoomLock = strictestMinZoom;

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
  if (schoolsVisible) minZooms.push(12); // TODO: should be 11 but need to fix pmtiles
  if (hvsVisible) minZooms.push(11);
  if (mapillaryVisible) minZooms.push(14);
  if (maxspeedVisible) minZooms.push(11); // ✅ NEW ZOOM LOCK
  // if (scenario1Visible) minZooms.push(11); // ✅ NEW ZOOM LOCK

  // const strictestMinZoom = minZooms.length > 0 ? Math.max(...minZooms) : originalMinZoom;
  const strictestMinZoom = minZooms.length > 0 ? Math.max(...minZooms) : originalMinZoom;
  currentZoomLock = minZooms.length > 0 ? strictestMinZoom : null;


  map.setMinZoom(strictestMinZoom);
  // map.setMaxZoom(mapillaryVisible ? 14.99 : originalMaxZoom);

  // Adjust current zoom if it's below the required minimum
  const z = map.getZoom();
  if (z < strictestMinZoom) {
    map.setZoom(strictestMinZoom);
  } //else if (mapillaryVisible && z > 14.99) {
  //   map.setZoom(14.99);
  // }
}

function applyLegendVisibility() {
  ["schools", "hvs", "mapillary", "movebis", "maxspeed", "scenario1", "scenario2", "scenario3", "scenario4"].forEach(key => {
    const toggle = document.getElementById(`toggle-${key}`);
    const legend = document.getElementById(`${key}-legend`);
    if (toggle && legend) {
      legend.style.display = toggle.checked ? "block" : "none";
    }
  });
}





function updateMapillaryFilter() {
  const cbPano = document.getElementById("mapillary-pano");
  const cbNonPano = document.getElementById("mapillary-nonpano");
  const filterOptions = document.getElementById("mapillary-filter-options");

  const showPano = cbPano.checked;
  const showNonPano = cbNonPano.checked;

  let baseFilter = ["any"];
  if (showPano) baseFilter.push(["==", ["to-string", ["get", "is_pano"]], "true"]);
  if (showNonPano) baseFilter.push(["==", ["to-string", ["get", "is_pano"]], "false"]);

  if (baseFilter.length === 1) baseFilter = ["==", "id", "__never__"];

  if (map.getLayer("mapillary-images-layer")) {
    map.setFilter("mapillary-images-layer", baseFilter);
  }

  if (map.getLayer("mapillary-images-halo")) {
    const haloFilter = showPano
      ? ["==", ["to-string", ["get", "is_pano"]], "true"]
      : ["==", "id", "__never__"];
    map.setFilter("mapillary-images-halo", haloFilter);
    map.setLayoutProperty("mapillary-images-halo", "visibility", showPano ? "visible" : "none");
  }

  const anyChecked = showPano || showNonPano;
  map.setLayoutProperty("mapillary-images-layer", "visibility", anyChecked ? "visible" : "none");

  filterOptions.style.display = anyChecked ? "block" : "none";

  applyZoomLock();
  applyLegendVisibility();
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

  const layerIds = [
    "maxspeed",
    "maxspeed-conditional",
    "maxspeed-forward",
    "maxspeed-backward",
    "maxspeed-conditional-forward",
    "maxspeed-conditional-backward"
  ];

  layerIds.forEach(id => {
    if (map.getLayer(id)) {
      map.setLayoutProperty(id, "visibility", visibility);
    }
  });

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



/// SLIDER !! SCENARIO 1

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


// Scenario 2 slider logic

const slider2 = document.getElementById("scenario2-slider");
const sliderValue2 = document.getElementById("scenario2-slider-value");
const sliderContainer2 = document.getElementById("scenario2-slider-container");

function applyScenario2ClusterSizeFilter(minSize) {
  const value = parseInt(minSize, 10);
  const filter = [">=", ["to-number", ["get", "biped_counts"]], value];

  if (map.getLayer("scenario2-points")) {
    map.setFilter("scenario2-points", filter);
  }
  if (map.getLayer("scenario2-polys")) {
    map.setFilter("scenario2-polys", filter);
  }
}

slider2.addEventListener("input", () => {
  const value = parseInt(slider2.value, 10);
  sliderValue2.textContent = value;
  applyScenario2ClusterSizeFilter(value);

  const percent = ((value - slider2.min) / (slider2.max - slider2.min)) * 100;
  slider2.style.setProperty("--progress", `${percent}%`);
});

// Checkbox shows/hides the layers AND the slider
document.getElementById("toggle-scenario2").addEventListener("change", function (e) {
  const checked = e.target.checked;

  map.setLayoutProperty("scenario2-points", "visibility", checked ? "visible" : "none");
  map.setLayoutProperty("scenario2-polys", "visibility", checked ? "visible" : "none");

  // Show or hide the slider
  sliderContainer2.style.display = checked ? "block" : "none";

  // Apply filter initially
  if (checked) {
    applyScenario2ClusterSizeFilter(0);
  }
});


// Checkbox shows/hides the layers AND the slider
document.getElementById("toggle-scenario3").addEventListener("change", function (e) {
  const checked = e.target.checked;

  map.setLayoutProperty("scenario3-points", "visibility", checked ? "visible" : "none");
  map.setLayoutProperty("scenario3-polys", "visibility", checked ? "visible" : "none");

  // Show or hide the slider
  //sliderContainer3.style.display = checked ? "block" : "none";

  // // Apply filter initially
  // if (checked) {
  //   applyScenario3ClusterSizeFilter(0);
  // }
});


// Checkbox shows/hides the layers AND the slider
document.getElementById("toggle-scenario4").addEventListener("change", function (e) {
  const checked = e.target.checked;

  map.setLayoutProperty("scenario4-points", "visibility", checked ? "visible" : "none");
  map.setLayoutProperty("scenario4-polys", "visibility", checked ? "visible" : "none");

  // Show or hide the slider
  //sliderContainer3.style.display = checked ? "block" : "none";

  // // Apply filter initially
  // if (checked) {
  //   applyScenario3ClusterSizeFilter(0);
  // }
});



