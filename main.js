

// 📦 Geocoder & Styles
import { setupPhotonGeocoder } from './geocoder.js';
import { paintStyles, getCircleColorPaint } from './styleConfig.js';

// 📦 Kartenfunktionen
import { addSources } from "./addSources.js";
import { loadAllIcons } from "./loadAllIcons.js";
import { addLayers } from "./addLayers.js";

// 📦 UI & Interaktion
import { setupBaseLayerControls } from './ui/setupBaseLayerControls.js';
import { setupLayerToggles } from './ui/setupLayerToggles.js';
// import { setupScenarioControls } from './ui/setupScenarioControls.js';
// import { updateVisibleFeatureCount } from './ui/featureCounter.js';

// 📦 Popups
import {
  setupAccidentPopups,
  setupAccClusterPopups,
  setupMovebisPopups,
  setupHVSPopups,
  setupMaxspeedPopups,
  setupSchoolsPopups,
  setupHealthPopups,
  setupPlaygroundsPopups,
  // setupMapillaryPopups,
  setupScenario1Popups,
  setupScenario2Popups,
  setupScenario3Popups,
  setupScenario4Popups,
  setupScenario6Popups
} from './popupHandlers.js';

// 📦 Legende
import {
  updateLegendVisibilityByZoom,
  applyLegendVisibility,
  updateScenarioLegendVisibility,
  updateLegendColors,
  setupLegendClusterCheckboxSync,
  setupLegendToggleHandlers,
  setupLegendSectionCheckboxes
} from './legendHandlers.js';

// 📦 Permalink
import {
  Permalink,
  applyPermalink,
  updatePermalink,
  cleanupLegacyPermalink
} from './permalink.js';

// 📦 Sonstiges
import { setupPieChartImageGeneration } from './generatePieIcon.js';
import { setupMapillary } from "./useMapillary.js";

import { setupRectangleIconGeneration } from "./generateRectangleIcon.js";



let MAPTILER_API_KEY = '';
let MAPILLARY_TOKEN = '';

let originalMinZoom = 6;
let originalMaxZoom = 20;

let currentZoomLock = null;

const isInitializingRef = { value: true }; // für Permalink-Module etc.

const isLocalhost = location.hostname === "localhost";

export const LAYERS = {
  accidents: ["accident-points"],
  symbols: ["beteiligung-symbols"],
  clusters: ["pie-clusters-fine-layer", "pie-clusters-coarse-layer"]
};

document.querySelector('[data-map="standard"]').style.backgroundImage =
  "url('./thumbs/thumb-standard.png')";

document.querySelector('[data-map="satellite"]').style.backgroundImage =
  "url('./thumbs/thumb-satellite.png')";







(async () => {
  try {
    // handle the config import based on the environment  for the api keys
    const config = await import(isLocalhost ? './config.js' : './config.public.js');
    ({ MAPTILER_API_KEY, MAPILLARY_TOKEN } = config);
    console.log(`🔑 ${isLocalhost ? "Lokale config.js" : "config.public.js"} geladen`);

    cleanupLegacyPermalink();

    initMap();

  } catch (err) {
    console.error("❌ Konfig konnte nicht geladen werden:", err);
  }
})();



async function initMap() {
  /// somehow this is needed to load the pmtiles protocol
  const pmtilesBaseURL = "https://f003.backblazeb2.com/file/unfallkarte-data/";
  const protocol = new pmtiles.Protocol(name => `${pmtilesBaseURL}${name}`);
  maplibregl.addProtocol("pmtiles", protocol.tile);


  window.map = new maplibregl.Map({
    container: "map",
    // style: `https://api.maptiler.com/maps/dataviz/style.json?key=${MAPTILER_API_KEY}`,
    style: "./style_test_neu_fixed_maputnik.json", // <-- your local Positron style
    center: [13.634, 52.315],
    zoom: 12,
    minZoom: 6,
    maxZoom: 20
  });

  originalMinZoom = map.getMinZoom();
  originalMaxZoom = map.getMaxZoom();

  // const map = await createBaseMap();                // 1. Karte erzeugen


  /// load MAP
  map.on("load", () => {

// map.on('styleimagemissing', function (e) {
//   if (e.id === 'rect-icon') {
//     map.loadImage('icons/png/home.png', (error, image) => {
//       if (error) {
//         console.error('Error loading image:', error);
//         return;
//       }
//       if (!map.hasImage('rect-icon')) {
//         map.addImage('rect-icon', image);
//       }
//     });
//   }
// });

setupRectangleIconGeneration(map); // add this line

    initializeMapModules(map) ;               // 2. Module initialisieren

    setupUI(map);                                     // 3. UI & Layer-Toggles
    
    setupLegend(map);                          // 4. Legende initialisieren 

    setupMapillary(map, {applyZoomLock,applyLegendVisibility});

    setupPopups(map);                          // 5. Popups initialisieren

    map.once("load", updateLegendVisibilityByZoom);
    updateLegendVisibilityByZoom();

    setupPermalinkHandling(map); // 6. Permalink-Handling initialisieren

    setupEventHandlers(map);                          // 8. moveend / zoomend etc.

  });

}





//////////////////////// some funcions ////////////////



/// Zoom Lock stuff

function applyZoomLock() {

  // currentZoomLock = strictestMinZoom;

  const movebisVisible = map.getLayoutProperty("movebis", "visibility") === "visible";
  const hvsVisible = map.getLayoutProperty("hvs", "visibility") === "visible";
  const mapillaryVisible = map.getLayoutProperty("mapillary-images-layer", "visibility") === "visible";
  const schoolsPointsVisible = map.getLayoutProperty("schools-points", "visibility") === "visible";
  const schoolsPolygonsVisible = map.getLayoutProperty("schools-polygons", "visibility") === "visible";
  const healthPointsVisible = map.getLayoutProperty("health-points", "visibility") === "visible";
  const healthPolygonsVisible = map.getLayoutProperty("health-polygons", "visibility") === "visible";
  const playgroundsPointsVisible = map.getLayoutProperty("health-points", "visibility") === "visible";
  const playgroundsPolygonsVisible = map.getLayoutProperty("health-polygons", "visibility") === "visible";

  const maxspeedVisible = map.getLayoutProperty("maxspeed", "visibility") === "visible";
  //const scenario1Visible = map.getLayoutProperty("scenario1-polys", "visibility") === "visible";



  const schoolsVisible = schoolsPointsVisible || schoolsPolygonsVisible;
  const healthVisible = healthPointsVisible || healthPolygonsVisible;
  const playgroundsVisible = playgroundsPointsVisible || playgroundsPolygonsVisible;

  // Determine the strictest minZoom
  const minZooms = [];
  if (movebisVisible) minZooms.push(13);
  if (schoolsVisible) minZooms.push(12); // TODO: should be 11 but need to fix pmtiles
  if (healthVisible) minZooms.push(12); // TODO: should be 11 but need to fix pmtiles
  if (playgroundsVisible) minZooms.push(12); // TODO: should be 11 but need to fix pmtiles
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







// setupBaseLayerControls(map, isInitializingRef);
//setupLayerToggles(map);
// setupScenarioControls(map);



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
});


// Checkbox shows/hides the layers AND the slider
document.getElementById("toggle-scenario4").addEventListener("change", function (e) {
  const checked = e.target.checked;

  map.setLayoutProperty("scenario4-points", "visibility", checked ? "visible" : "none");
  map.setLayoutProperty("scenario4-polys", "visibility", checked ? "visible" : "none");
});


// Checkbox shows/hides the layers AND the slider
document.getElementById("toggle-scenario6").addEventListener("change", function (e) {
  const checked = e.target.checked;

  map.setLayoutProperty("scenario6-points", "visibility", checked ? "visible" : "none");
  map.setLayoutProperty("scenario6-polys", "visibility", checked ? "visible" : "none");
  map.setLayoutProperty("scenario6-polys2", "visibility", checked ? "visible" : "none");
});




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

  updateLegendColors(selected, paintStyles); /// hier angepasst!!!
}






function addNavigationControl(map) {
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
}



function setupPopups(map) {
  setupAccidentPopups(map);
  setupAccClusterPopups(map);
  setupMovebisPopups(map);
  setupHVSPopups(map);
  setupMaxspeedPopups(map);
  setupSchoolsPopups(map);
  setupHealthPopups(map);
  setupPlaygroundsPopups(map);
  // setupMapillaryPopups(map);
  setupScenario1Popups(map);
  setupScenario2Popups(map);
  setupScenario3Popups(map);
  setupScenario4Popups(map);
  setupScenario6Popups(map);
}

function setupLegend(map) {
  setupLegendClusterCheckboxSync(map);
  setupLegendToggleHandlers();
  setupLegendSectionCheckboxes(updateLayerFilter);

  updateColorStyle();
  updateVisibleFeatureCount();
}


function setupUI(map) {
  setupBaseLayerControls(map, isInitializingRef);
  setupLayerToggles(map, applyZoomLock, applyLegendVisibility);

  document.querySelectorAll('input[name="color-style"]').forEach(rb => {
    rb.addEventListener("change", updateColorStyle);
  });

  document.getElementById("toggle-details").addEventListener("change", e => {
    const visible = e.target.checked ? "visible" : "none";
    LAYERS.symbols.forEach(id => {
      if (map.getLayer(id)) {
        map.setLayoutProperty(id, "visibility", visible);
      }
    });
  });

  document.querySelectorAll('.section-arrow').forEach(arrow => {
    arrow.addEventListener('click', () => {
      const section = document.querySelector(`.legend-section[data-section="${arrow.dataset.arrow}"]`);
      if (!section) return;
      const content = section.querySelector('.legend-section-content');
      const isOpen = arrow.classList.contains('open');
      arrow.classList.toggle('open', !isOpen);
      section.classList.toggle('collapsed', isOpen);
    });
  });
}


function setupEventHandlers(map) {
  map.on("zoomend", () => updateLegendVisibilityByZoom(map));
  map.on("moveend", () => updateLegendVisibilityByZoom(map));
  map.on("zoom", updateScenarioLegendVisibility);
  map.on("load", updateScenarioLegendVisibility);

  map.on("moveend", updateVisibleFeatureCount);
  map.on("zoomend", updateVisibleFeatureCount);

  applyLegendVisibility();
}


function setupPermalinkHandling(map) {
  map.on("idle", () => {
    if (!isInitializingRef.value) return;

    requestAnimationFrame(() => {
      applyPermalink(map, paintStyles, updateLayerFilter, updateVisibleFeatureCount, isInitializingRef);
      map.on("moveend", () => updatePermalink(map, isInitializingRef));
      map.on("zoomend", () => updatePermalink(map, isInitializingRef));
      isInitializingRef.value = false;
    });
  });
}

 function initializeMapModules(map) {
  setupPhotonGeocoder(map);
  setupPieChartImageGeneration(map);
  addNavigationControl(map);
  addSources(map, { MAPILLARY_TOKEN, MAPTILER_API_KEY });
  // await loadAllIcons(map); // falls wieder benötigt

  addLayers(map);
}