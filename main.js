// main.js — Bootstrap und Verdrahtung. Hier steht, WANN was passiert; das WAS liegt in
// den Modulen (Unfall-Layer, Legende, Permalink, Popups, Karten-Panel).

// 📦 Karte: Quellen, Layer, Basemap/Terrain
import { addSources } from "./js/mapdata/addSources.js";
import { addLayers } from "./js/mapdata/addLayers.js";
import { resolveSources } from "./js/mapdata/resolveSources.js";
import { addBasemapTerrain } from './js/map/basemapTerrain.js';
import { addBikeLanesSource, addBikeLanesLayers, setBikeLanesVisible } from './js/map/bikeLanesLayers.js';
import { LAYERS, setupAccidentLayers } from './js/map/accidentLayers.js';

// 📦 UI & Interaktion
import { setupPhotonGeocoder } from './js/utils/geocoder.js';
import { setupBaseLayerControls } from './js/ui/setupBaseLayerControls.js';
import { setupLayerToggles } from './js/ui/setupLayerToggles.js';
import { addNavigationControl, setupMapPanel } from './js/ui/setupMapPanel.js';
import { updateVisibleFeatureCount } from './js/ui/featureCounter.js';
import { setupTooltips } from './js/ui/tooltip.js';
import { setupMobileLayout } from './js/ui/mobileLayout.js';
import { renderLegendEntries } from './js/ui/legendMarkup.js';
import { setupPopups } from './js/ui/popupHandlers.js';   // EIN Hover-Popup für alle Layer
import { setupMapillary, setupMapillaryTS } from "./js/utils/useMapillary.js";

// 📦 Legende
import {
  updateLegendVisibilityByZoom,
  applyLegendVisibility,
  setupLegendClusterCheckboxSync,
  setupLegendToggleHandlers,
  setupLegendSectionCheckboxes,
  setupZoomHintLinks
} from './js/ui/legendHandlers.js';

// 📦 Permalink
import {
  parsePermalink,
  updatePermalink,
  cleanupLegacyPermalink,
  setupPermalinkHandling
} from './js/utils/permalink.js';

// 📦 Sonstiges
import { paintStyles } from './js/styleConfig.js';
import { applyDataVintages } from './js/utils/applyDataVintages.js';
import { setupPieChartImageGeneration } from './js/utils/generatePieIcon.js';

let MAPILLARY_TOKEN = '';
let originalMinZoom = 6;
let currentZoomLock = null;

const isInitializingRef = { value: true }; // Permalink-Restore läuft -> nichts zurückschreiben
const isLocalhost = location.hostname === "localhost";

// Zähler + Permalink als Callbacks: die Module dahinter sollen weder den Zoom-Lock noch
// das URL-Format kennen müssen.
const recount = () => updateVisibleFeatureCount(window.map, currentZoomLock, LAYERS, paintStyles);
const writePermalink = () => updatePermalink(window.map, isInitializingRef);

let accidents = null; // { updateLayerFilter, updateColorStyle } — steht ab setupUI()

(async () => {
  try {
    // Tokens je nach Umgebung: lokal aus der gitignorten config.js, sonst config.public.js.
    const config = await import(isLocalhost ? './js/config/config.js' : './js/config/config.public.js');
    ({ MAPILLARY_TOKEN } = config);
    console.log(`🔑 ${isLocalhost ? "Lokale config.js" : "config.public.js"} geladen`);

    cleanupLegacyPermalink();

    // Legenden-Einträge aus der Registry erzeugen, BEVOR irgendetwas #toggle-<id> sucht
    // (applyDataVintages läuft schon bei style.load, setupUI erst bei load).
    renderLegendEntries();

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

  // Ansicht aus dem Link schon HIER lesen, damit die Karte direkt an der richtigen Stelle
  // startet (sonst lädt sie erst Tiles der Default-Ansicht und springt danach weg).
  const view = parsePermalink(window.location.search)?.view;

  // Manifest + PMTiles-Auflösung sofort anstoßen — parallel zu Style-Fetch und
  // Basemap-Tiles, statt erst im "load"-Handler (spart ~1-2 s bis zu den Unfalldaten).
  const sourcesPromise = resolveSources();

  // Style laden und die relative sprite-URL gegen die Seitenherkunft absolut machen:
  // MapLibre verlangt absolute sprite-URLs, der Host variiert aber (localhost / vizsim.de).
  const styleUrl = new URL("./style.json", document.baseURI).href;
  const style = await fetch(styleUrl).then(r => r.json());
  if (style.sprite && !/^https?:\/\//.test(style.sprite)) {
    style.sprite = new URL(style.sprite, styleUrl).href;
  }

  window.map = new maplibregl.Map({
    container: "map",
    style, // lokaler Positron-Style (keyless); Tiles von OpenFreeMap (gehostet)
    center: view ? [view.lng, view.lat] : [13.634, 52.315],
    zoom: view ? view.zoom : 12,
    minZoom: 6,
    maxZoom: 20
  });
  const map = window.map;
  originalMinZoom = map.getMinZoom();

  // Quellen/Layer schon bei "style.load" registrieren (feuert, sobald der Style geparst ist —
  // VOR "load", das erst nach dem ersten vollständigen Basemap-Render kommt). So laufen die
  // PMTiles-Metadaten-Fetches parallel zu den Basemap-Tiles.
  // ??=-Guard: falls "style.load" je erneut feuert, nur einmal laufen.
  let modulesReady = null;
  const ensureModules = () => (modulesReady ??= initializeMapModules(map, sourcesPromise));
  map.on("style.load", ensureModules);

  map.on("load", async () => {
    await ensureModules();   // async (Local-first-Auflösung) -> erst Layer, dann UI

    setupUI(map);
    setupLegend(map);
    setupTooltips();

    // Reihenfolge wie gehabt: Mapillary legt eigene Layer an, erst danach registriert
    // setupPopups seine Hover-Handler.
    const mapillaryCtx = { originalMinZoom, setCurrentZoomLock: z => currentZoomLock = z, applyLegendVisibility };
    setupMapillary(map, mapillaryCtx);
    setupMapillaryTS(map, mapillaryCtx);

    setupPopups(map);

    // Handy-Layout: Legende als Bottom-Sheet, beim Start zugeklappt.
    setupMobileLayout();

    // WICHTIG: mit `map` aufrufen — ohne Argument returnt die Funktion sofort, dann wird die
    // Cluster-Legende erst spät (per zoomend/idle) korrigiert -> Flackern.
    updateLegendVisibilityByZoom(map);

    setupPermalinkHandling(map, {
      updateLayerFilter: accidents.updateLayerFilter,
      updateVisibleFeatureCount: recount,
      isInitializingRef
    });

    setupEventHandlers(map);
  });
}

function setupUI(map) {
  accidents = setupAccidentLayers(map, { isInitializingRef, recount, writePermalink });

  setupBaseLayerControls(map, isInitializingRef);
  setupMapPanel(map);
  setupLayerToggles(
    map,
    originalMinZoom,
    z => currentZoomLock = z,
    applyLegendVisibility,
    // Toggle -> URL sofort aktualisieren (nicht erst bei der nächsten Kartenbewegung);
    // während des Permalink-Restores ist das ein No-op (isInitializingRef).
    writePermalink
  );

  // Radinfrastruktur (TILDA) — externer Live-Layer, läuft nicht über die Layer-Registry.
  document.getElementById('toggle-bikelanes')?.addEventListener('change', (e) => {
    setBikeLanesVisible(map, e.target.checked);
    applyLegendVisibility();
    updateLegendVisibilityByZoom(map);   // Legende/Zoom-Hinweis sofort nachziehen
    writePermalink();
  });
}

function setupLegend(map) {
  setupLegendClusterCheckboxSync(map);
  setupLegendToggleHandlers();
  setupLegendSectionCheckboxes(accidents.updateLayerFilter);
  setupZoomHintLinks(map);

  accidents.updateColorStyle();
  recount();
}

function setupEventHandlers(map) {
  map.on("zoomend", () => updateLegendVisibilityByZoom(map));
  map.on("moveend", () => updateLegendVisibilityByZoom(map));

  // Beim Überschreiten der Zoom-11-Grenze (Cluster <-> Einzelpunkte) sind die neuen Tiles
  // auf moveend/zoomend oft noch nicht gerendert -> queryRenderedFeatures = 0. Darum
  // zusätzlich einmal auf das nächste "idle" nach einem Move nachzählen (nicht bei JEDEM
  // idle, sonst läuft es auch bei Hover-/Popup-Redraws).
  let recountOnIdle = false;
  const recountAndArm = () => { recount(); recountOnIdle = true; };
  map.on("moveend", recountAndArm);
  map.on("zoomend", recountAndArm);
  map.on("idle", () => { if (recountOnIdle) { recountOnIdle = false; recount(); } });

  applyLegendVisibility();
}

async function initializeMapModules(map, sourcesPromise) {
  setupPhotonGeocoder(map);
  setupPieChartImageGeneration(map);
  addNavigationControl(map);

  // async: Local-first-Auflösung (Manifest) — die Promise läuft seit initMap.
  const sources = await addSources(map, { MAPILLARY_TOKEN, sourcesPromise });
  addLayers(map);

  // Keyless Basemaps/Terrain (OpenFreeMap/OSM/Esri + Mapterhorn) + 3D-Gebäude, NACH
  // addSources/addLayers, damit Host-Layer und Symbol-Reihenfolge stehen.
  addBasemapTerrain(map);
  addBikeLanesSource(map);
  addBikeLanesLayers(map);

  // OSM-Quellen-Tooltips mit dem Datenstand aus dem Manifest füllen — Manifest durchreichen,
  // sonst lädt loadManifest() es ein zweites Mal.
  applyDataVintages(sources.manifest);
}
