// permalink.js — Verdrahtung: URL lesen, Zustand anwenden, URL schreiben.
// Das Format liegt in permalinkFormat.js (rein, testbar), die DOM-Bindung in permalinkState.js.

import { mergeState, parse, serialize } from "./permalinkFormat.js";
import { applyState, readState } from "./permalinkState.js";

export { parse as parsePermalink } from "./permalinkFormat.js";

// Der Zustand, mit dem die App startet (HTML-Defaults + Start-Ansicht). Wird EINMAL beim
// Hochfahren festgehalten und dient danach zwei Zwecken:
//   1. Auffüllen: ein Link nennt nur, was vom Default abweicht — der Rest kommt von hier.
//   2. Kürzen: serialize() lässt alles weg, was dem Default entspricht.
let defaultState = null;

const writeUrl = (map) => {
    const query = serialize(readState(map), defaultState ?? {});
    history.replaceState(null, "", `?${query}`);
};

export function updatePermalink(map, isInitializingRef) {
    if (isInitializingRef.value) return;
    writeUrl(map);
}

/**
 * Sehr alte Links trugen die Ansicht in Einzelparametern (?lat=&lng=&zoom=&…). Die sind seit
 * v1 tot — wenn kein kompakter Parameter danebensteht, aus der URL räumen.
 */
export function cleanupLegacyPermalink() {
    const url = new URL(window.location.href);
    const legacy = ["lat", "lng", "zoom", "style", "filters", "scenarios"];

    if (url.searchParams.has("p") || url.searchParams.has("v") || url.searchParams.has("map")) return;
    if (!legacy.some((param) => url.searchParams.has(param))) return;

    legacy.forEach((param) => url.searchParams.delete(param));
    url.search = url.searchParams.toString();
    history.replaceState(null, "", url.toString());
}

export function setupPermalinkHandling(map, { updateLayerFilter, updateVisibleFeatureCount, isInitializingRef }) {
    // Defaults JETZT festhalten — vor dem ersten Anwenden, solange DOM und Karte noch
    // unberührt im Auslieferungszustand sind.
    defaultState = readState(map);

    const fromUrl = parse(window.location.search);
    if (fromUrl) applyState(map, mergeState(defaultState, fromUrl));

    // IMMER, auch ohne Link: die Unfall-Layer starten ohne Filter und unsichtbar (addLayers)
    // und werden erst hier an die Auswahl gebracht. Hängt das am Link, bleiben sie bei einem
    // Aufruf ohne Parameter blind — sie poppten dann erst auf, wenn irgendein anderer Toggle
    // updateLayerFilter nachzog (vom Golden-Snapshot als "accident-points leakedAfterOff"
    // gefangen). force: läuft absichtlich, während isInitializing noch gesetzt ist.
    updateLayerFilter(false, true);
    updateVisibleFeatureCount();

    // URL immer neu schreiben: ohne Parameter entsteht so der Link auf die Startansicht, ein
    // alter ?p=-Link wird dabei auf v2 hochgeschrieben. Quelle ist IMMER der gelesene Zustand.
    // (v1 hatte die Startansicht zusätzlich als Literal hier stehen — sie wich von main.js ab,
    // wurde geschrieben, per rAF wieder eingelesen und setzte dabei Karte + Haken zurück. Genau
    // das war das Rennen, das die Smoke-Tests auf langsamen CI-Runnern gerissen hat.)
    writeUrl(map);

    map.on("moveend", () => updatePermalink(map, isInitializingRef));
    map.on("zoomend", () => updatePermalink(map, isInitializingRef));
    isInitializingRef.value = false;

    // Bereit-Signal für die Smoke-Tests (tests/web/helpers.js): ab hier steht der Zustand aus
    // dem Link. map.loaded() allein reicht nicht — das kann schon vorher wahr sein.
    document.documentElement.dataset.appReady = "true";
}
