// 📦 Geocoder & Styles
import { setupPhotonGeocoder } from './js/utils/geocoder.js';
import { paintStyles, getCircleColorPaint } from './js/styleConfig.js';

// 📦 Kartenfunktionen
import { addSources } from "./js/mapdata/addSources.js";
import { addLayers } from "./js/mapdata/addLayers.js";
import { resolveSources } from "./js/mapdata/resolveSources.js";

// 📦 Basemap/Terrain (keyless, ersetzt MapTiler) + Radinfrastruktur (TILDA)
import { addBasemapTerrain, setBasemap, setRelief, setBuildings } from './js/map/basemapTerrain.js';
import { addBikeLanesSource, addBikeLanesLayers, setBikeLanesVisible } from './js/map/bikeLanesLayers.js';
import { applyDataVintages } from './js/utils/applyDataVintages.js';

// 📦 UI & Interaktion
import { setupBaseLayerControls } from './js/ui/setupBaseLayerControls.js';
import { setupLayerToggles } from './js/ui/setupLayerToggles.js';
import { setupScenarioControls } from './js/ui/setupScenarioControls.js';
import { updateVisibleFeatureCount } from './js/ui/featureCounter.js';

// 📦 Popups
import {
  setupAccidentPopups,
  setupAccClusterPopups,
  setupMovebisPopups,
  setupHVSPopups,
  setupSvzPopups,
  setupMaxspeedPopups,
  setupUspeedPopups,
  setupOBSPopups,
  setupLaerm1Popups,
  setupLaerm2Popups,
  setupSchoolsPopups,
  setupHealthPopups,
  setupPlaygroundsPopups,
  setupCrossingsPopups,
  setupMapillaryTrafficsignPopups,
  setupTelraamInteractivity,
  setupScenario1Popups,
  setupScenario2Popups,
  setupScenario3Popups,
  setupScenario6Popups,
  setupScenario8Popups,
  setupScenario9Popups
} from './js/ui/popupHandlers.js';

// 📦 Legende
import {
  updateLegendVisibilityByZoom,
  applyLegendVisibility,
  updateScenarioLegendVisibility,
  updateLegendColors,
  setupLegendClusterCheckboxSync,
  setupLegendToggleHandlers,
  setupLegendSectionCheckboxes,
  setupZoomHintLinks
} from './js/ui/legendHandlers.js';

// 📦 Permalink
import {
  Permalink,
  updatePermalink,
  cleanupLegacyPermalink,
  setupPermalinkHandling
} from './js/utils/permalink.js';

// 📦 Sonstiges
import { setupPieChartImageGeneration } from './js/utils/generatePieIcon.js';
import { setupMapillary, setupMapillaryTS } from "./js/utils/useMapillary.js";

let MAPILLARY_TOKEN = '';

let originalMinZoom = 6;

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
  // PMTiles-Protokoll registrieren. Quellen binden volle pmtiles://https://… URLs ein
  // (siehe resolveSources.js/addSources.js) -> kein Basis-URL-Mapping nötig.
  const protocol = new pmtiles.Protocol();
  maplibregl.addProtocol("pmtiles", protocol.tile);

  const { lat, lng, zoom } = Permalink.parse();

  const hasPermalink = !isNaN(lat) && !isNaN(lng) && !isNaN(zoom);

  // Manifest + PMTiles-Auflösung sofort anstoßen — parallel zu Style-Fetch und
  // Basemap-Tiles, statt erst im "load"-Handler (spart ~1-2 s bis zu den Unfalldaten).
  const sourcesPromise = resolveSources();

  // Style laden und relative sprite-URL gegen die Seitenherkunft absolut machen.
  // MapLibre verlangt absolute sprite-URLs; der Host variiert (localhost / vizsim.de /
  // github.io), darum aus document.baseURI ableiten statt im style.json zu hardcoden.
  const styleUrl = new URL("./style.json", document.baseURI).href;
  const style = await fetch(styleUrl).then(r => r.json());
  if (style.sprite && !/^https?:\/\//.test(style.sprite)) {
    style.sprite = new URL(style.sprite, styleUrl).href;
  }

  window.map = new maplibregl.Map({
    container: "map",
    style, // lokaler Positron-Style (keyless); Tiles von OpenFreeMap (gehostet)
    center: hasPermalink ? [lng, lat] : [13.634, 52.315],
    zoom: hasPermalink ? zoom : 12,
    minZoom: 6,
    maxZoom: 20
  });

  originalMinZoom = map.getMinZoom();

  // Daten-Quellen/-Layer schon bei "style.load" registrieren (feuert, sobald der
  // Style geparst ist — VOR "load", das erst nach dem ersten vollständigen
  // Basemap-Render kommt). So laufen die PMTiles-Metadaten-Fetches parallel zu den
  // Basemap-Tiles. ??=-Guard: falls "style.load" je erneut feuert, nur einmal laufen.
  let modulesReady = null;
  const ensureModules = () => (modulesReady ??= initializeMapModules(map, sourcesPromise));
  map.on("style.load", ensureModules);

  map.on("load", async () => {

    // addSources ist async (Local-first-Auflösung) -> erst Module/Layer, dann UI.
    await ensureModules();
    setupUI(map);
    setupScenarioControls(map);
    setupLegend(map);
    setupMapillary(map, { originalMinZoom, setCurrentZoomLock: z => currentZoomLock = z, applyLegendVisibility });

    setupMapillaryTS(map, { originalMinZoom, setCurrentZoomLock: z => currentZoomLock = z, applyLegendVisibility });

    setupPopups(map);

    // WICHTIG: mit `map` aufrufen — ohne Argument returnt die Funktion sofort, dann
    // wird die Cluster-Legende erst spät (per zoomend/idle) korrigiert -> Flackern.
    updateLegendVisibilityByZoom(map);

    setupPermalinkHandling(map, {
      paintStyles,
      updateLayerFilter,
      updateVisibleFeatureCount: () => updateVisibleFeatureCount(map, currentZoomLock, LAYERS, paintStyles),
      isInitializingRef
    });

    setupEventHandlers(map);

  });

}

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

// Zeigt die aktuelle Auswahl überhaupt Unfälle? Der Filter verknüpft alle Dimensionen
// mit UND — ist eine Dimension leer, matcht nichts. Dann Layer ausblenden statt nur
// filtern (spart das Laden der accidents_single-Tiles).
function accidentsWillShow() {
  return getSelectedCheckboxValues("UKATEGORIE").length > 0
    && getSelectedCheckboxValues("UART").length > 0
    && getSelectedCheckboxValues("UTYP1").length > 0
    && getSelectedCheckboxValues("UJAHR").length > 0
    && getSelectedBeteiligungen().length > 0;
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

  // Perf: bei leerer Auswahl (Filter matcht nichts) die Unfall-Layer ausblenden statt nur
  // filtern -> MapLibre lädt die accidents_single-Tiles gar nicht erst (kein unnötiger
  // pmtiles-Download + kein Aufblitzen). Symbole zusätzlich nur, wenn Details-Toggle an.
  const willShow = uk_vals.length > 0 && uart_vals.length > 0 && utyp_vals.length > 0
    && ujahr_vals.length > 0 && beteiligungen.length > 0;
  const detailsChecked = !!document.getElementById("toggle-details")?.checked;
  LAYERS.accidents.forEach(id => {
    if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", willShow ? "visible" : "none");
  });
  LAYERS.symbols.forEach(id => {
    if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", (willShow && detailsChecked) ? "visible" : "none");
  });

  map.once("idle", () => updateVisibleFeatureCount(map, currentZoomLock, LAYERS, paintStyles));

  if (shouldUpdatePermalink && !isInitializingRef.value) {
    updatePermalink(map, isInitializingRef);
  }
}

function updateColorStyle() {
  const selected = document.querySelector('input[name="color-style"]:checked').value;

  const colorExpr = getCircleColorPaint(selected);

  LAYERS.accidents.forEach(layerId => {
    if (map.getLayer(layerId)) {
      map.setPaintProperty(layerId, "circle-color", colorExpr);
      map.setPaintProperty(layerId, "circle-opacity", 0.6);
      // Sichtbarkeit NICHT hier setzen — die bestimmt updateLayerFilter (Auswahl-abhängig),
      // sonst würden die accidents_single-Tiles schon vor dem Auflösen der Auswahl geladen.
    }
  });

  // Beteiligungsbuchstaben-Layer: nur wenn Details an UND eine Auswahl Unfälle zeigt.
  const detailsChecked = document.getElementById("toggle-details").checked;
  LAYERS.symbols.forEach(layerId => {
    if (map.getLayer(layerId)) {
      map.setLayoutProperty(layerId, "visibility", (detailsChecked && accidentsWillShow()) ? "visible" : "none");
    }
  });

  updateLegendColors(selected, paintStyles);
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
  setupSvzPopups(map);   // deckt SVZ (Länder/BASt) UND UBA-Hauptverkehrsstraßen (hvs) ab
  setupMaxspeedPopups(map);
  setupUspeedPopups(map);
  setupOBSPopups(map);
  setupLaerm1Popups(map);
  setupLaerm2Popups(map);

  setupSchoolsPopups(map);
  setupHealthPopups(map);
  setupPlaygroundsPopups(map);
  setupCrossingsPopups(map);
  setupMapillaryTrafficsignPopups(map);
  setupTelraamInteractivity(map);
  setupScenario1Popups(map);
  setupScenario2Popups(map);
  setupScenario3Popups(map);
  setupScenario6Popups(map);
  setupScenario8Popups(map);
  setupScenario9Popups(map);
}

function setupLegend(map) {
  setupLegendClusterCheckboxSync(map);
  setupLegendToggleHandlers();
  setupLegendSectionCheckboxes(updateLayerFilter);
  setupZoomHintLinks(map);

  updateColorStyle();
  updateVisibleFeatureCount(map, currentZoomLock, LAYERS, paintStyles);
}

function setupUI(map) {
  setupBaseLayerControls(map, isInitializingRef);
  setupMapPanel(map);
  setupLayerToggles(
    map,
    originalMinZoom,
    z => currentZoomLock = z,
    applyLegendVisibility
  );

  // Radinfrastruktur (TILDA) — Kontext-Layer im rechten Panel unter "Infrastruktur".
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
    const visible = (e.target.checked && accidentsWillShow()) ? "visible" : "none";
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
      arrow.setAttribute('aria-expanded', String(!isOpen));
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

  // Beim Überschreiten der Zoom-11-Grenze (Cluster <-> Einzelpunkte) sind die neuen
  // Tiles auf moveend/zoomend oft noch nicht gerendert -> queryRenderedFeatures = 0.
  // Darum zusätzlich einmal auf das nächste "idle" nach einem Move nachzählen (nicht
  // bei jedem idle, sonst läuft es auch bei Hover/Popup-Redraws).
  let recountOnIdle = false;
  const recount = () => updateVisibleFeatureCount(map, currentZoomLock, LAYERS, paintStyles);
  map.on("moveend", () => { recount(); recountOnIdle = true; });
  map.on("zoomend", () => { recount(); recountOnIdle = true; });
  map.on("idle", () => { if (recountOnIdle) { recountOnIdle = false; recount(); } });

  applyLegendVisibility();
}

async function initializeMapModules(map, sourcesPromise) {
  setupPhotonGeocoder(map);
  setupPieChartImageGeneration(map);
  addNavigationControl(map);
  // async: Local-first-Auflösung (manifest) — Promise wurde in initMap schon gestartet.
  const sources = await addSources(map, { MAPILLARY_TOKEN, sourcesPromise });

  addLayers(map);

  // Tempolimit: kein Zoom-Lock mehr (siehe zoomLock.js) — dafür rendern die Layer
  // erst ab Zoom 11 (vorher Z6-Daten, die nur der Lock verdeckte). Darunter greift
  // der Zoom-Hinweis in der Legende (analog Radinfra).
  const MAXSPEED_LAYERS = [
    "maxspeed", "maxspeed-conditional", "maxspeed-forward", "maxspeed-backward",
    "maxspeed-conditional-forward", "maxspeed-conditional-backward",
    "maxspeed_minor", "maxspeed_minor-conditional", "maxspeed_minor-forward",
    "maxspeed_minor-backward", "maxspeed_minor-conditional-forward", "maxspeed_minor-conditional-backward",
  ];
  for (const id of MAXSPEED_LAYERS) {
    if (map.getLayer(id)) map.setLayerZoomRange(id, 11, 24);
  }

  // Keyless Basemaps/Terrain (OpenFreeMap/OSM/Esri + Mapterhorn) + 3D-Gebäude,
  // nach addSources/addLayers, damit Host-Layer & Symbol-Reihenfolge stehen.
  addBasemapTerrain(map);
  addBikeLanesSource(map);
  addBikeLanesLayers(map);

  // OSM-Quellen-Tooltips dynamisch mit dem Datenstand (vintage) aus dem Manifest
  // füllen — Manifest durchreichen, sonst lädt loadManifest() es ein zweites Mal.
  applyDataVintages(sources.manifest);
}
