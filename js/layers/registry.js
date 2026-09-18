// Layer-Registry — EIN Eintrag je Zeile, die der Nutzer in der Legende ein-/ausschaltet.
//
// Vorher stand dieselbe Information an ~8 Stellen (addSources MIGRATED, addLayers,
// setupLayerToggles, drei Listen in legendHandlers, permalink kontextKeys, popupHandlers,
// index.html) und lief auseinander — z. B. fehlten Telraam/Radinfra im Permalink. Jetzt
// leiten diese Module ihre Listen hier ab. Umbau in Schritten (docs/TODO.md, Roadmap 2);
// abgesichert durch tests/web/golden.spec.js.
//
// Stand Schritt 3: die 8 einfachen Kontext-Layer + die 6 Szenarien, jeweils inkl. ihrer Layer-
// Definitionen. addLayers.js hängt sie per addEntryLayers() an ihrer Stelle der Zeichenreihenfolge ein.
//
// Layer-Definitionen sind normale MapLibre-Layer OHNE das, was der Eintrag schon sagt:
//   source            = entry.source.id
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
 * @property {{id: string, manifest: string}} source   Frontend-Source-ID -> Manifest-ID (sources.yaml)
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
import scenarios from "./scenarios.js";

const withDefaults = (entry) => {
    const layers = entry.layers.map((l) => ({
        source: entry.source.id,
        ...(entry.dataMinZoom != null && { minzoom: entry.dataMinZoom }),
        ...l,
        layout: { visibility: "none", ...l.layout },
    }));
    return { ...entry, layers, layerIds: layers.map((l) => l.id) };
};

/** @type {LayerEntry[]} */
export const LAYER_REGISTRY = [...contextOsm, ...contextNoise, ...contextCycling, ...scenarios].map(withDefaults);

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

/** Layer eines Eintrags in den Style hängen — Aufrufreihenfolge in addLayers.js = Zeichenreihenfolge. */
export function addEntryLayers(map, entryId) {
    const entry = LAYER_REGISTRY.find((e) => e.id === entryId);
    if (!entry) throw new Error(`Layer-Registry: kein Eintrag "${entryId}"`);
    for (const layer of entry.layers) map.addLayer(layer);
}

/** Frontend-Source-ID -> Manifest-ID (für addSources.js). */
export const registrySources = () => Object.fromEntries(LAYER_REGISTRY.map((e) => [e.source.id, e.source.manifest]));

/** Toggle-ID -> Permalink-Zeichen (für permalink.js). */
export const registryPermalinkKeys = () =>
    Object.fromEntries(LAYER_REGISTRY.filter((e) => e.permalink).map((e) => [e.id, e.permalink]));

/** Einträge fürs gemeinsame Hover-Popup (für popupHandlers.js). */
export const registryPopupEntries = () => LAYER_REGISTRY.flatMap((e) =>
    e.popups.map((p) => ({ id: e.id, kind: e.kind, layers: e.layerIds, ...p })));
