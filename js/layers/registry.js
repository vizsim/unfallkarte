// Layer-Registry — EIN Eintrag je Zeile, die der Nutzer in der Legende ein-/ausschaltet.
//
// Vorher stand dieselbe Information an ~8 Stellen (addSources MIGRATED, addLayers,
// setupLayerToggles, drei Listen in legendHandlers, permalink kontextKeys, popupHandlers,
// index.html) und lief auseinander — z. B. fehlten Telraam/Radinfra im Permalink. Jetzt
// leiten diese Module ihre Listen hier ab. Umbau in Schritten (docs/TODO.md, Roadmap 2);
// abgesichert durch tests/web/golden.spec.js.
//
// Stand Schritt 1: die 8 einfachen Kontext-Layer. Die Layer-DEFINITIONEN (Paint/Filter)
// leben noch in addLayers.js — `layers` nennt vorerst nur deren IDs (Schritt 2 zieht sie um).
//
// DOM-Vertrag je Eintrag (IDs in index.html, nicht umbenennen — auch Permalinks hängen dran):
//   #toggle-<id>   Checkbox          #<id>-legend   Legenden-Block (mit optionalem .zoom-hint)

/**
 * @typedef {Object} PopupSpec  Karte im Hover-Popup (siehe js/ui/hoverPopup.js)
 * @property {string} [id]            Default: Eintrags-ID (nötig bei mehreren Popups je Eintrag)
 * @property {string[]} [layers]      Default: alle Layer des Eintrags
 * @property {string} [eyebrow]       z. B. Datenquelle ("OSM", "UBA")
 * @property {(props: Object, feature: Object) => string} render   props sind HTML-escaped
 * @property {(props: Object) => ({href: string, label: string}|null)} [link]
 * @property {boolean} [openOnClick]  Klick öffnet den Link direkt statt zu fixieren
 *
 * @typedef {Object} LayerEntry
 * @property {string} id                     => #toggle-<id>, #<id>-legend
 * @property {"context"|"scenario"|"accidents"} kind
 * @property {{id: string, manifest: string}} source   Frontend-Source-ID -> Manifest-ID (sources.yaml)
 * @property {string[]} layers               Style-Layer-IDs, die der Toggle schaltet
 * @property {string} permalink              EIN Zeichen im Kontext-Teil von ?p= (nie neu vergeben!)
 * @property {number} [dataMinZoom]          darunter: Zoom-Hinweis in der Legende statt Daten
 * @property {PopupSpec[]} popups
 */

import contextOsm from "./context-osm.js";
import contextNoise from "./context-noise.js";
import contextCycling from "./context-cycling.js";

/** @type {LayerEntry[]} */
export const LAYER_REGISTRY = [...contextOsm, ...contextNoise, ...contextCycling];

// Beim Laden prüfen statt später rätseln: doppelte IDs/Permalink-Zeichen wären stille Bugs.
{
    const seen = { id: new Set(), permalink: new Set(), layer: new Set() };
    const once = (kind, value, where) => {
        if (seen[kind].has(value)) throw new Error(`Layer-Registry: ${kind} "${value}" doppelt (${where})`);
        seen[kind].add(value);
    };
    for (const e of LAYER_REGISTRY) {
        once("id", e.id, e.id);
        once("permalink", e.permalink, e.id);
        e.layers.forEach((l) => once("layer", l, e.id));
    }
}

/** Frontend-Source-ID -> Manifest-ID (für addSources.js). */
export const registrySources = () => Object.fromEntries(LAYER_REGISTRY.map((e) => [e.source.id, e.source.manifest]));

/** Toggle-ID -> Permalink-Zeichen (für permalink.js). */
export const registryPermalinkKeys = () => Object.fromEntries(LAYER_REGISTRY.map((e) => [e.id, e.permalink]));

/** Einträge fürs gemeinsame Hover-Popup (für popupHandlers.js). */
export const registryPopupEntries = () => LAYER_REGISTRY.flatMap((e) =>
    e.popups.map((p) => ({ id: e.id, kind: e.kind, layers: e.layers, ...p })));
