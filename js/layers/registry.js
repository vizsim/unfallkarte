// Layer-Registry — EIN Eintrag je Zeile, die der Nutzer in der Legende ein-/ausschaltet.
//
// Vorher stand dieselbe Information an ~8 Stellen (addSources MIGRATED, addLayers,
// setupLayerToggles, drei Listen in legendHandlers, permalink kontextKeys, popupHandlers,
// index.html) und lief auseinander — z. B. fehlten Telraam/Radinfra im Permalink. Jetzt
// leiten diese Module ihre Listen hier ab. Umbau in Schritten (docs/TODO.md, Roadmap 2);
// abgesichert durch tests/web/golden.spec.js.
//
// Stand Schritt 4: alle Kontext-Layer + Szenarien inkl. ihrer Layer-Definitionen. addLayers.js
// hängt sie per addEntryLayers() an ihrer Stelle der Zeichenreihenfolge ein; dort bleiben nur
// Unfälle/Cluster und Mapillary.
//
// Layer-Definitionen sind normale MapLibre-Layer OHNE das, was der Eintrag schon sagt:
//   source            = erste Quelle des Eintrags (Layer aus einer weiteren Quelle nennen sie selbst)
//   minzoom           = entry.dataMinZoom   (Daten-Zoomgrenze = Zoom-Hinweis in der Legende)
//   layout.visibility = "none"              (alle Layer starten aus; der Toggle schaltet sie)
// Ein Layer darf jeden dieser Werte selbst setzen und gewinnt dann.
//
// DOM-Vertrag je Eintrag (IDs in index.html, nicht umbenennen — auch Permalinks hängen dran):
//   #toggle-<id>   Checkbox          #<id>-legend   Legenden-Block (mit optionalem .zoom-hint)

/**
 * @typedef {Object} PopupSpec  Karte im Hover-Popup (siehe js/ui/hoverPopup.js)
 * @property {string} [id]            Default: Eintrags-ID (nötig bei mehreren Popups je Eintrag)
 * @property {string[]} [layers]      Default: alle Layer des Eintrags
 * @property {string} [eyebrow]       z. B. Datenquelle ("OSM", "UBA")
 * @property {boolean} [multi]        mehrere verschiedene Features dieses Popups stapeln (Szenarien)
 * @property {(props: Object, feature: Object) => string} render   props sind HTML-escaped
 * @property {(props: Object) => ({href: string, label: string}|null)} [link]
 * @property {boolean} [openOnClick]  Klick öffnet den Link direkt statt zu fixieren
 *
 * @typedef {Object} LayerEntry
 * @property {string} id                     => #toggle-<id>, #<id>-legend
 * @property {"context"|"scenario"|"accidents"} kind
 * @property {{id: string, manifest: string}} [source]    Frontend-Source-ID -> Manifest-ID (sources.yaml)
 * @property {{id: string, manifest: string}[]} [sources] statt `source`, wenn der Eintrag mehrere Quellen hat
 * @property {"custom"} [toggle]             "custom": kein generischer Sichtbarkeits-Toggle — setup() (oder der
 *                                           setup() eines anderen Eintrags) schaltet die Layer selbst
 * @property {(map: Object, ctx: Object) => void} [setup]  zusätzliche Verdrahtung (Modus-Umschalter, Unter-Haken …);
 *                                           ctx = { zoomLock, applyLegendVisibility, updateLegendVisibilityByZoom }
 * @property {Object[]} layers               MapLibre-Layer (siehe Defaults oben); der Toggle schaltet alle
 * @property {string[]} layerIds             abgeleitet: IDs von `layers`
 * @property {string} [permalink]            EIN Zeichen im Kontext-Teil von ?p= (nie neu vergeben!);
 *                                           Szenarien haben keins (eigener ?p=-Teil, Checkbox-value "sc<n>")
 * @property {Object} [controls]             Schwellen-Regler, siehe js/ui/setupEntryControls.js
 * @property {number} [dataMinZoom]          darunter: Zoom-Hinweis in der Legende statt Daten
 * @property {PopupSpec[]} popups
 */

import contextOsm from "./context-osm.js";
import contextNoise from "./context-noise.js";
import contextCycling from "./context-cycling.js";
import contextPopulation from "./context-population.js";
import scenarios from "./scenarios.js";
import trafficSpeed from "./traffic-speed.js";
import trafficVolumes from "./traffic-volumes.js";

const withDefaults = (entry) => {
    const sources = entry.sources ?? [entry.source];
    const layers = entry.layers.map((l) => ({
        source: sources[0].id,
        ...(entry.dataMinZoom != null && { minzoom: entry.dataMinZoom }),
        ...l,
        layout: { visibility: "none", ...l.layout },
    }));
    return { ...entry, sources, layers, layerIds: layers.map((l) => l.id) };
};

/** @type {LayerEntry[]} */
export const LAYER_REGISTRY = [
    ...contextOsm, ...contextNoise, ...contextCycling, ...contextPopulation, ...trafficSpeed, ...trafficVolumes, ...scenarios,
].map(withDefaults);

// Beim Laden prüfen statt später rätseln: doppelte IDs/Permalink-Zeichen wären stille Bugs.
{
    const seen = { id: new Set(), permalink: new Set(), layer: new Set() };
    const once = (kind, value, where) => {
        if (seen[kind].has(value)) throw new Error(`Layer-Registry: ${kind} "${value}" doppelt (${where})`);
        seen[kind].add(value);
    };
    for (const e of LAYER_REGISTRY) {
        once("id", e.id, e.id);
        if (e.permalink) once("permalink", e.permalink, e.id);
        e.layerIds.forEach((l) => once("layer", l, e.id));
    }
}

// ---------------------------------------------------------------------------------------------
// Lazy: Quellen + Layer eines Eintrags entstehen erst beim ERSTEN Einschalten (ensureEntry).
// Beim Start werden nur die Unfall-Quellen registriert: jede registrierte PMTiles-Quelle kostet
// sonst sofort einen Header-Request, auch wenn der Layer nie angeht. Gemessen 2026-09 gegen B2
// (ohne lokale Daten), Zeit bis zum ersten Unfallpunkt: Start-Requests 28 -> 7, 415 -> 79 KB;
// schnelle Leitung ~0,1–0,4 s schneller (Streuung groß, aber Ausreißer 3,0 -> 2,2 s), gedrosselt
// auf Mobilfunk-Niveau (1,6 Mbit/s, 150 ms RTT) stabil 14,4 -> 12,6 s.
//
// Die Zeichenreihenfolge bleibt dieselbe wie beim sofortigen Anlegen: addLayers.js meldet die
// Reihenfolge aller Slots (setDrawOrder); ein nachträglich angelegter Layer wird VOR den
// ersten schon existierenden Layer eines späteren Slots gehängt (beforeId).
// ---------------------------------------------------------------------------------------------
let resolveUrl = null; // (manifestId) => "pmtiles://…" — von addSources.js gesetzt
let drawOrder = [];    // [{ entryId?, layerIds }] in Zeichenreihenfolge (unten zuerst)

export function setSourceResolver(fn) { resolveUrl = fn; }
export function setDrawOrder(slots) { drawOrder = slots; }

const entryById = (entryId) => {
    const entry = LAYER_REGISTRY.find((e) => e.id === entryId);
    if (!entry) throw new Error(`Layer-Registry: kein Eintrag "${entryId}"`);
    return entry;
};
export const entryLayerIds = (entryId) => entryById(entryId).layerIds;

/** Quellen + Layer des Eintrags anlegen, falls noch nicht geschehen. Idempotent. */
export function ensureEntry(map, entryId) {
    const entry = entryById(entryId);
    if (entry.layerIds.every((id) => map.getLayer(id))) return;

    for (const src of entry.sources) {
        if (!map.getSource(src.id)) map.addSource(src.id, { type: "vector", url: resolveUrl(src.manifest) });
    }
    const slot = drawOrder.findIndex((s) => s.entryId === entryId);
    if (slot < 0) throw new Error(`Layer-Registry: "${entryId}" fehlt in der Zeichenreihenfolge (addLayers.js)`);
    const beforeId = drawOrder.slice(slot + 1).flatMap((s) => s.layerIds).find((id) => map.getLayer(id));
    for (const layer of entry.layers) {
        if (!map.getLayer(layer.id)) map.addLayer(layer, beforeId);
    }
}

/** Toggle-ID -> Permalink-Zeichen (für permalink.js). */
export const registryPermalinkKeys = () =>
    Object.fromEntries(LAYER_REGISTRY.filter((e) => e.permalink).map((e) => [e.id, e.permalink]));

/** Einträge fürs gemeinsame Hover-Popup (für popupHandlers.js). */
export const registryPopupEntries = () => LAYER_REGISTRY.flatMap((e) =>
    e.popups.map((p) => ({ id: e.id, kind: e.kind, layers: e.layerIds, ...p })));
