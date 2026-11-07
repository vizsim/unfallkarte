
// popupHandlers.js — Karten-Registry für das gemeinsame Hover-Popup (js/ui/hoverPopup.js).
//
// Jeder Eintrag beschreibt EINE Karte: welche Layer dazugehören, wie ihr Body aus den
// Feature-Properties gerendert wird und was bei Klick passiert (Link / eigene Aktion /
// sonst Fenster fixieren). Die Engine fragt alle Einträge in EINEM queryRenderedFeatures
// ab und stapelt die Treffer untereinander — keine sich überdeckenden Einzel-Popups mehr.
//
// Klick-Hinweise ("→ Klick öffnet …") gehören NICHT in render(): die Engine zeigt den
// Hinweis nur für den obersten Treffer (nur dessen Aktion läuft bei Klick).

import { formatDateDE } from "../utils/formatDate.js";
import { setupHoverPopup } from "./hoverPopup.js";
import { row } from "./popupHelpers.js";
import { clusterTotal, renderAccident, renderCluster } from "./accidentPopup.js";
import { readClusterFocus } from "../map/accidentLayers.js";
import { CIRCLE_LAYERS, PIE_LAYERS } from "../map/clusterView.js";
import { circleCount, radiusFor } from "../map/clusterModes.js";
import { registryPopupEntries } from "../layers/registry.js";
import { pointSel } from "../report/entry.js";


// ---------------------------------------------------------------------------
// Unfälle (Einzelpunkte ab Zoom 11) + Cluster (Zoom 6–11); Karten: accidentPopup.js
// ---------------------------------------------------------------------------

function accidentEntries(map) {
    return [
        {
            id: "accidents", kind: "accidents", layers: ["accident-points"],
            render: renderAccident,
            report: pointSel
        },
        {
            // Torten (Schwere) ODER Kreise (Anteil einer Beteiligung) — js/map/clusterView.js
            id: "clusters", kind: "accidents", eyebrow: "Cluster", layers: [...PIE_LAYERS, ...CIRCLE_LAYERS],
            render: (p) => renderCluster(p, readClusterFocus()),
            // Popup am Cluster-Zentrum (nicht am Cursor). Abstand: Torte = Radius des vergrößerten
            // Hover-Pies (icon-size 1; Bildgröße wie in generatePieIcon: 32/48/64 px); Kreis =
            // sein Radius + Hover-Ring.
            anchor: (f) => {
                if (f.layer?.type === "circle") {
                    const n = circleCount(f.properties, readClusterFocus());
                    return { lngLat: f.geometry.coordinates, offset: radiusFor(n) + 6 };
                }
                const total = clusterTotal(f.properties);
                const pieSize = total > 100 ? 64 : total > 10 ? 48 : 32;
                return { lngLat: f.geometry.coordinates, offset: pieSize / 2 + 4 };
            },
            // Vergrößertes Pie über dem gehoverten Cluster (Layer "hover-pie"). Nur ein PLAIN
            // GeoJSON-Feature übergeben — zweimal dieselbe Falle, je ein MapLibre-Upgrade:
            //   5.24: setData geht per Structured-Clone an den Worker; das MapGeoJSONFeature
            //         aus queryRenderedFeatures ist nicht klonbar -> Feature neu aufbauen.
            //   6.x:  `f.properties` ist ein Objekt mit NULL-Prototyp (Object.create(null)).
            //         MapLibres eigener Serializer liest `value.constructor._classRegistryKey`
            //         und wirft daran; die Daten erreichen den Worker nie, das Hover-Pie bleibt
            //         leer. Der Spread macht daraus ein gewöhnliches Objekt.
            // Beide Male scheiterte es STUMM (nur ein console.error) — gefangen hat es jeweils
            // der Smoke-Test „Cluster-Hover".
            onEnter: (f) => map.getSource("hover-point")?.setData({
                type: "FeatureCollection",
                features: [{ type: "Feature", geometry: f.geometry, properties: { ...f.properties } }]
            }),
            onLeave: () => map.getSource("hover-point")?.setData({ type: "FeatureCollection", features: [] })
        }
    ];
}


// ---------------------------------------------------------------------------
// Kontext-Layer, die noch NICHT in der Layer-Registry stehen (js/layers/registry.js).
// Alle Kontext-Layer und Szenarien kommen von dort; hier bleibt nur Mapillary (eigenes Modul
// mit Token + dynamisch angelegten Layern).
// ---------------------------------------------------------------------------

function contextEntries() {
    return [
        {
            id: "mapillary-ts", kind: "context", eyebrow: "Mapillary", layers: ["mapillary-ts"],
            render: (p) => `
                <div class="pop-title">Verkehrszeichen</div>
                <table class="pop-table">
                    ${row("Zeichen", p.value)}
                    ${row("Zuerst gesehen", p.first_seen_at ? formatDateDE(new Date(+p.first_seen_at).toISOString().slice(0, 10)) : null)}
                    ${row("Zuletzt gesehen", p.last_seen_at ? formatDateDE(new Date(+p.last_seen_at).toISOString().slice(0, 10)) : null)}
                </table>`
        }
    ];
}


// Alle Karten-Einträge an die gemeinsame Hover-Engine hängen. Die Reihenfolge hier
// ist egal — gestapelt wird in Render-Reihenfolge der getroffenen Layer.
export function allPopupEntries(map) {
    return [
        ...accidentEntries(map),
        ...contextEntries(),
        ...registryPopupEntries(),
    ];
}

export function setupPopups(map) {
    setupHoverPopup(map, allPopupEntries(map));
}
