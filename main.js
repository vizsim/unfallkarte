// main.js — Bootstrap und Verdrahtung. Hier steht, WANN was passiert; das WAS liegt in
// den Modulen (Unfall-Layer, Legende, Permalink, Popups, Karten-Panel).

// 📦 Karte: Bibliothek, Quellen, Layer, Basemap/Terrain
import { Map as MapLibreMap, addProtocol } from './js/lib/maplibre.js';
import { addSources, attachManifest } from "./js/mapdata/addSources.js";
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
import { setupPopups, allPopupEntries } from './js/ui/popupHandlers.js';   // EIN Hover-Popup für alle Layer
import { setupMapillary, setupMapillaryTS } from "./js/utils/useMapillary.js";
import { LAYER_REGISTRY, ensureEntry } from './js/layers/registry.js';

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
import { showErrorBanner } from './js/ui/errorBanner.js';
import { applyDataVintages } from './js/utils/applyDataVintages.js';
import { setupPieChartImageGeneration } from './js/utils/generatePieIcon.js';

let originalMinZoom = 6;
let currentZoomLock = null;

const isInitializingRef = { value: true }; // Permalink-Restore läuft -> nichts zurückschreiben
const isLocalhost = location.hostname === "localhost";

// Zähler + Permalink als Callbacks: die Module dahinter sollen weder den Zoom-Lock noch
// das URL-Format kennen müssen.
const recount = () => updateVisibleFeatureCount(window.map, currentZoomLock, LAYERS, paintStyles);
const writePermalink = () => updatePermalink(window.map, isInitializingRef);

let accidents = null; // { updateLayerFilter, updateColorStyle } — steht ab setupUI()

// Tokens je nach Umgebung: lokal aus der gitignorten config.js, sonst config.public.js.
// Bewusst NICHT abgewartet: der Token wird einzig für die zwei Mapillary-Quellen gebraucht,
// hing aber vor allem anderen — vor dem Style-Fetch, vor dem Kartenkonstruktor, vor der
// ersten Kachel. Jetzt läuft der Import parallel; addSources() wartet ihn erst ab, wenn die
// Unfall-Quellen bereits stehen.
// Der catch gehört dazu: vorher hing initMap() IM try, ein fehlgeschlagener Import ließ also
// eine weiße Seite zurück (traf localhost ohne config.js). Jetzt startet die Karte in jedem
// Fall, und nur Mapillary bleibt leer.
const tokenPromise = import(isLocalhost ? './js/config/config.js' : './js/config/config.public.js')
  .then(({ MAPILLARY_TOKEN }) => MAPILLARY_TOKEN)
  .catch((err) => {
    console.error("❌ Konfig konnte nicht geladen werden — Mapillary-Layer bleiben leer:", err);
    return "";
  });

// Test-Hook (tests/web/): Playwright braucht DIESELBEN Modul-Instanzen wie die App. Früher
// importierten die Tests sie im Browser über ihren Pfad (`import("/js/layers/registry.js")`) —
// im gebündelten Build gibt es diese Pfade nicht mehr. Wie `window.map`: nur lesen, nie
// darauf aufbauen.
window.__app = { LAYER_REGISTRY, ensureEntry, allPopupEntries, PMTiles: pmtiles.PMTiles };

cleanupLegacyPermalink();

// Legenden-Einträge aus der Registry erzeugen, BEVOR irgendetwas #toggle-<id> sucht
// (applyDataVintages läuft schon bei style.load, setupUI erst bei load).
renderLegendEntries();

initMap();

async function initMap() {
  // PMTiles-Protokoll registrieren. Quellen binden volle pmtiles://https://… URLs ein
  // (siehe resolveSources.js/addSources.js) -> kein Basis-URL-Mapping nötig.
  const protocol = new pmtiles.Protocol();
  addProtocol("pmtiles", protocol.tile);

  // Ansicht aus dem Link schon HIER lesen, damit die Karte direkt an der richtigen Stelle
  // startet (sonst lädt sie erst Tiles der Default-Ansicht und springt danach weg).
  const view = parsePermalink(window.location.search)?.view;

  // Manifest + PMTiles-Auflösung sofort anstoßen — parallel zu Style-Fetch und
  // Basemap-Tiles, statt erst im "load"-Handler (spart ~1-2 s bis zu den Unfalldaten).
  const sourcesPromise = resolveSources();

  // Style laden und die relative sprite-URL gegen die Seitenherkunft absolut machen:
  // MapLibre verlangt absolute sprite-URLs, der Host variiert aber (localhost / vizsim.de).
  // Ohne den catch starb die Karte hier STUMM: der Fehler landete in der unbehandelten
  // Promise, initMap brach ab, und die Seite blieb weiß — obwohl es ein Fehlerbanner gibt.
  const styleUrl = new URL("./style.json", document.baseURI).href;
  let style;
  try {
    const res = await fetch(styleUrl);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    style = await res.json();
  } catch (err) {
    console.error("❌ Kartenstil konnte nicht geladen werden:", err);
    showErrorBanner("Der Kartenstil konnte nicht geladen werden — die Karte bleibt leer.");
    return;
  }
  if (style.sprite && !/^https?:\/\//.test(style.sprite)) {
    style.sprite = new URL(style.sprite, styleUrl).href;
  }

  // Seit MapLibre 6 ist WebGL2 Pflicht, und der Konstruktor WIRFT, wenn es fehlt (sehr alte
  // Geräte, Software-Rendering, per Richtlinie gesperrte GPU). Vorher scheiterte das still
  // und hinterließ eine leere Seite — jetzt sagt ein Banner, woran es liegt.
  let map;
  try {
    map = new MapLibreMap({
      container: "map",
      style, // lokaler Positron-Style (keyless); Tiles von OpenFreeMap (gehostet)
      center: view ? [view.lng, view.lat] : [13.634, 52.315],
      zoom: view ? view.zoom : 12,
      minZoom: 6,
      maxZoom: 20
    });
  } catch (err) {
    if (err?.name === "GPUInitializationError" || /webgl/i.test(String(err?.message ?? err))) {
      showErrorBanner(
        "Die Karte braucht WebGL2. Bitte den Browser aktualisieren oder die Hardware-Beschleunigung einschalten.",
        { reload: false },   // Neuladen hilft hier nicht
      );
    }
    throw err;
  }
  window.map = map;
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
  // Die Legende kennt vom Zoom nur das Band (unter/über z11) und die Zoom-Hinweise je Layer.
  // Ein reines Pan ändert daran nichts — und eine Zoom-Geste feuert `moveend` ohnehin mit,
  // der zusätzliche moveend-Listener ließ die Funktion also nur doppelt laufen.
  map.on("zoomend", () => updateLegendVisibilityByZoom(map));

  // Zählen der sichtbaren Unfälle: `moveend` feuert auch bei Zoom-Gesten und deckt damit
  // beide Fälle ab. Der frühere zusätzliche zoomend-Listener ließ das teure
  // queryRenderedFeatures pro Zoom DREImal statt zweimal laufen (gemessen).
  //
  // Der zweite Durchgang auf `idle` bleibt: beim Überschreiten der z11-Grenze
  // (Cluster <-> Einzelpunkte) sind die neuen Tiles auf moveend oft noch nicht gerendert,
  // queryRenderedFeatures liefert dann 0. Bewusst nicht bei JEDEM idle — sonst liefe es
  // auch bei Hover-/Popup-Redraws.
  let recountOnIdle = false;
  map.on("moveend", () => { recount(); recountOnIdle = true; });
  map.on("idle", () => { if (recountOnIdle) { recountOnIdle = false; recount(); } });

  applyLegendVisibility();
}

async function initializeMapModules(map, sourcesPromise) {
  setupPhotonGeocoder(map);
  setupPieChartImageGeneration(map);
  addNavigationControl(map);

  // Unfall-Quellen + Layer zuerst und OHNE das Manifest: ihre Dateinamen sind ein stabiler
  // Vertrag, die URL steht damit fest (siehe ACCIDENT_SOURCES in resolveSources.js). Vorher
  // lagen hier zwei Fetches auf dem kritischen Pfad, bevor eine einzige Kachel angefragt
  // werden konnte — die lokale Manifest-Probe (deployt immer ein 404) und das B2-Manifest.
  await addSources(map, { tokenPromise });
  addLayers(map);

  // Keyless Basemaps/Terrain (OpenFreeMap/OSM/Esri + Mapterhorn) + 3D-Gebäude, NACH
  // addSources/addLayers, damit Host-Layer und Symbol-Reihenfolge stehen.
  addBasemapTerrain(map);
  addBikeLanesSource(map);
  addBikeLanesLayers(map);

  // Ab hier das Manifest (läuft seit initMap parallel): es versorgt die Layer-Registry mit
  // URLs für das lazy Einschalten und die OSM-Quellen-Tooltips mit dem Datenstand.
  // Reihenfolge ist sicher: map.on("load") wartet auf initializeMapModules, der
  // Permalink-Restore (der Kontextlayer einschalten kann) läuft erst danach.
  const sources = await attachManifest(sourcesPromise);
  applyDataVintages(sources.manifest);
}
