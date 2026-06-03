

// 📦 Geocoder & Styles
import { setupPhotonGeocoder } from './js/utils/geocoder.js';
import { paintStyles, getCircleColorPaint } from './js/styleConfig.js';

// 📦 Kartenfunktionen
import { addSources } from "./js/mapdata/addSources.js";
// import { loadAllIcons } from "./loadAllIcons.js";
import { addLayers } from "./js/mapdata/addLayers.js";

// 📦 Basemap/Terrain (keyless, ersetzt MapTiler) + Radinfrastruktur (TILDA)
import { addBasemapTerrain, setBasemap, setRelief, setBuildings } from './js/map/basemapTerrain.js';
import { addBikeLanesSource, addBikeLanesLayers, setBikeLanesVisible } from './js/map/bikeLanesLayers.js';

// 📦 UI & Interaktion
import { setupBaseLayerControls } from './js/ui/setupBaseLayerControls.js';
import { setupLayerToggles } from './js/ui/setupLayerToggles.js';
import { setupScenarioControls } from './js/ui/setupScenarioControls.js';
import { updateVisibleFeatureCount } from './js/ui/featureCounter.js';

// import { applyZoomLock } from './js/utils/zoomLock.js';

// 📦 Popups
import {
  setupAccidentPopups,
  setupAccClusterPopups,
  setupMovebisPopups,
  setupHVSPopups,
  setupMaxspeedPopups,
  setupUspeedPopups,
  setupOBSPopups,
  setupLaerm1Popups,
  setupLaerm2Popups,
  setupSchoolsPopups,
  setupHealthPopups,
  setupPlaygroundsPopups,
  // setupMapillaryPopups,
  setupMapillaryTrafficsignPopups,
  setupScenario1Popups,
  setupScenario2Popups,
  setupScenario3Popups,
  setupScenario6Popups,
  setupScenario8Popups
} from './js/ui/popupHandlers.js';

// 📦 Legende
import {
  updateLegendVisibilityByZoom,
  applyLegendVisibility,
  updateScenarioLegendVisibility,
  updateLegendColors,
  setupLegendClusterCheckboxSync,
  setupLegendToggleHandlers,
  setupLegendSectionCheckboxes
} from './js/ui/legendHandlers.js';

// 📦 Permalink
import {
  Permalink,
  // applyPermalink,
  updatePermalink,
  cleanupLegacyPermalink,
  // encodeList, beteiligungMap, yearMap,
  setupPermalinkHandling
} from './js/utils/permalink.js';

// import { setupPermalinkHandling } from './js/utils/permalink.js';


// 📦 Sonstiges
import { setupPieChartImageGeneration } from './js/utils/generatePieIcon.js';
import { setupMapillary, setupMapillaryTS } from "./js/utils/useMapillary.js";

// import { setupRectangleIconGeneration } from "./generateRectangleIcon.js";



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

// (Alte Basemap-Thumb-Hintergründe entfernt — Vorschau-Thumbnails kommen jetzt
//  über das Karten-Panel/panel.css.)







(async () => {
  try {
    // handle the config import based on the environment  for the api keys
    const config = await import(isLocalhost ? './js/config/config.js' : './js/config/config.public.js');
    ({ MAPILLARY_TOKEN } = config);
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



  const { lat, lng, zoom } = Permalink.parse();

  const hasPermalink = !isNaN(lat) && !isNaN(lng) && !isNaN(zoom);




  window.map = new maplibregl.Map({
    container: "map",
    style: "./style.json", // lokaler, keyless Positron-Style (eigene planetiler-Tiles)
    center: hasPermalink ? [lng, lat] : [13.634, 52.315],
    zoom: hasPermalink ? zoom : 12,
    minZoom: 6,
    maxZoom: 20
  });

  originalMinZoom = map.getMinZoom();
  originalMaxZoom = map.getMaxZoom();

  // const map = await createBaseMap();                // 1. Karte erzeugen


  /// load MAP
  map.on("load", async () => {

    // addSources ist async (Local-first-Auflösung) -> erst Module/Layer, dann UI.
    await initializeMapModules(map);         // 2. Module initialisieren
    setupUI(map);                                     // 3. UI & Layer-Toggles
    setupScenarioControls(map);
    setupLegend(map);                          // 4. Legende initialisieren 
    setupMapillary(map, { originalMinZoom, setCurrentZoomLock: z => currentZoomLock = z, applyLegendVisibility });


    setupMapillaryTS(map, { originalMinZoom, setCurrentZoomLock: z => currentZoomLock = z, applyLegendVisibility });

    setupPopups(map);                          // 5. Popups initialisieren

    map.once("load", updateLegendVisibilityByZoom);
    updateLegendVisibilityByZoom();

    // setupPermalinkHandling(map); // 6. Permalink-Handling initialisieren
    setupPermalinkHandling(map, {
      paintStyles,
      updateLayerFilter,
      updateVisibleFeatureCount: () => updateVisibleFeatureCount(map, currentZoomLock, LAYERS, paintStyles),
      isInitializingRef
    });


    setupEventHandlers(map);                          // 8. moveend / zoomend etc.

  });

}





//////////////////////// some funcions ////////////////



// (Alte Hillshade/Terrain-Toggles entfernt — Relief/3D-Gelände läuft jetzt über das
//  Karten-Panel via setRelief() aus js/map/basemapTerrain.js, siehe setupMapPanel.)




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

  // map.once("idle", updateVisibleFeatureCount);
  map.once("idle", () => updateVisibleFeatureCount(map, currentZoomLock, LAYERS, paintStyles));

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
  setupUspeedPopups(map);
  setupOBSPopups(map);
  setupLaerm1Popups(map);
  setupLaerm2Popups(map);

  setupSchoolsPopups(map);
  setupHealthPopups(map);
  setupPlaygroundsPopups(map);
  // setupMapillaryPopups(map);
  setupMapillaryTrafficsignPopups(map);
  setupScenario1Popups(map);
  setupScenario2Popups(map);
  setupScenario3Popups(map);
  setupScenario6Popups(map);
  setupScenario8Popups(map);
}

function setupLegend(map) {
  setupLegendClusterCheckboxSync(map);
  setupLegendToggleHandlers();
  setupLegendSectionCheckboxes(updateLayerFilter);

  updateColorStyle();
  // updateVisibleFeatureCount();
  updateVisibleFeatureCount(map, currentZoomLock, LAYERS, paintStyles);
}


function setupUI(map) {
  setupBaseLayerControls(map, isInitializingRef);
  setupMapPanel(map);
  // setupLayerToggles(map, applyZoomLock, applyLegendVisibility);
  setupLayerToggles(
    map,
    originalMinZoom,
    z => currentZoomLock = z,
    applyLegendVisibility
  );

  // Radinfrastruktur (TILDA) — Kontext-Layer im rechten Panel unter "Straßen & Verkehr".
  // Layer-Sichtbarkeit + Legende (applyLegendVisibility schaltet #bikelanes-legend).
  const bikelanesToggle = document.getElementById('toggle-bikelanes');
  if (bikelanesToggle) {
    bikelanesToggle.addEventListener('change', (e) => {
      setBikeLanesVisible(map, e.target.checked);
      applyLegendVisibility();
      updateLegendVisibilityByZoom(map);  // Radinfra-Legende/Hinweis sofort an Zoom anpassen
    });
  }

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

  // Hide both pie cluster layers initially
  const layersToHide = ["pie-clusters-fine-layer", "pie-clusters-coarse-layer"];

  layersToHide.forEach((layerId) => {
    if (map.getLayer(layerId)) {
      map.setLayoutProperty(layerId, "visibility", "none");
    }
  });
}


// Karten-Panel unten links: Basemaps (Positron/OSM/Esri), Relief, 3D-Gebäude, Radinfra.
function setupMapPanel(map) {
  const panel = document.getElementById('map-settings-panel');
  const panelToggle = document.getElementById('map-settings-toggle');
  if (panelToggle && panel) {
    panelToggle.addEventListener('click', () => {
      const collapsed = panel.classList.toggle('is-collapsed');
      panelToggle.setAttribute('aria-expanded', String(!collapsed));
    });
  }

  document.querySelectorAll('.basemap-btn[data-basemap]').forEach((btn) => {
    btn.addEventListener('click', () => {
      setBasemap(map, btn.dataset.basemap);
      document.querySelectorAll('.basemap-btn').forEach((b) => b.classList.remove('selected'));
      btn.classList.add('selected');
    });
  });

  const reliefToggle = document.getElementById('toggle-relief');
  if (reliefToggle) reliefToggle.addEventListener('change', (e) => setRelief(map, e.target.checked));

  const buildingsToggle = document.getElementById('toggle-buildings');
  if (buildingsToggle) buildingsToggle.addEventListener('change', (e) => setBuildings(map, e.target.checked));
}


function setupEventHandlers(map) {
  map.on("zoomend", () => updateLegendVisibilityByZoom(map));
  map.on("moveend", () => updateLegendVisibilityByZoom(map));
  map.on("zoom", updateScenarioLegendVisibility);
  map.on("load", updateScenarioLegendVisibility);

  // map.on("moveend", updateVisibleFeatureCount);
  // map.on("zoomend", updateVisibleFeatureCount);
  map.on("moveend", () => updateVisibleFeatureCount(map, currentZoomLock, LAYERS, paintStyles));
  map.on("zoomend", () => updateVisibleFeatureCount(map, currentZoomLock, LAYERS, paintStyles));

  applyLegendVisibility();
}



async function initializeMapModules(map) {
  setupPhotonGeocoder(map);
  setupPieChartImageGeneration(map);
  addNavigationControl(map);
  await addSources(map, { MAPILLARY_TOKEN });  // async: Local-first-Auflösung (manifest)
  // await loadAllIcons(map); // falls wieder benötigt

  addLayers(map);

  // Keyless Basemaps/Terrain (OpenFreeMap/OSM/Esri + Mapterhorn) + 3D-Gebäude,
  // nach addSources/addLayers, damit Host-Layer & Symbol-Reihenfolge stehen.
  addBasemapTerrain(map);
  addBikeLanesSource(map);
  addBikeLanesLayers(map);
}



//////////////////


// function loadTrafficSignIcons(map) {

//   console.log("🚧 loadTrafficSignIcons() aufgerufen");


//   const iconNames = [
//     "regulatory--bicycles-only--g1",
//     "regulatory--dual-path-pedestrians-and-bicycles--g1"
//     // ... weitere nach Bedarf
//   ];

//   let loaded = 0;

//   iconNames.forEach((name) => {
//     map.loadImage(`/icons/${name}.png`, (err, image) => {
//       if (err) {
//         console.warn(`❌ Icon konnte nicht geladen werden: ${name}`, err);
//       } else if (!map.hasImage(name)) {
//         map.addImage(name, image, { sdf: false });
//       }

//       loaded++;

//       if (loaded === iconNames.length) {
//         console.log("✅ Alle Icons geladen → setupMapillaryTS()");
//         setupMapillaryTS(map, {
//           originalMinZoom,
//           setCurrentZoomLock: z => currentZoomLock = z,
//           applyLegendVisibility
//         });
//       }
//     });
//   });
// }
