
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
import { translations } from "./accidentLabels.js";
import { registryPopupEntries } from "../layers/registry.js";

const weekdayNames = ["?", "Sonntag", "Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag"];
const monthNames = ["?", "Januar", "Februar", "März", "April", "Mai", "Juni", "Juli", "August", "September", "Oktober", "November", "Dezember"];



// ---------------------------------------------------------------------------
// Unfälle (Einzelpunkte ab Zoom 11) + Cluster (Zoom 6–11)
// ---------------------------------------------------------------------------

function renderAccident(props) {
    const labels = {
        UKATEGORIE: "Schwere",
        UART: "Unfallart",
        UTYP1: "Unfalltyp",
        UJAHR: "Jahr",
        UMONAT: "Monat",
        UWOCHENTAG: "Wochentag",
        USTUNDE: "Stunde"
    };
    const propsToShow = ["UKATEGORIE", "UJAHR", "UMONAT", "UWOCHENTAG", "USTUNDE", "UART", "UTYP1"];

    let rows = propsToShow.map(key => {
        let value = props[key];
        if (key === "UWOCHENTAG" && value != null) value = `${weekdayNames[value]} (${value})`;
        if (key === "UMONAT" && value != null) value = `${monthNames[value]} (${value})`;
        if (translations[key] && value in translations[key]) {
            value = `${translations[key][value]} (${value})`;
        } else if (value == null) {
            value = "?";
        }
        return `<tr><td>${labels[key]}</td><td>${value}</td></tr>`;
    }).join("");

    const beteiligungLabels = {
        IstRad: "Fahrrad",
        IstPKW: "Pkw",
        IstFuss: "Fußgänger",
        IstKrad: "Kraftrad",
        IstGkfz: "Güterkraftfahrzeug (GKFZ)",
        IstSonstig: "Sonstige"
    };
    const beteiligte = Object.entries(beteiligungLabels)
        .filter(([key]) => props[key] === 1)
        .map(([, label]) => label);
    if (beteiligte.length > 0) rows += `<tr><td>Beteiligung</td><td>${beteiligte.join(", ")}</td></tr>`;

    return `<div class="pop-title">Unfall</div><table class="pop-table">${rows}</table>`;
}

const clusterTotal = (p) => (p.UKATEGORIE__1 || 0) + (p.UKATEGORIE__2 || 0) + (p.UKATEGORIE__3 || 0);

function accidentEntries(map) {
    return [
        {
            id: "accidents", kind: "accidents", layers: ["accident-points"],
            render: renderAccident
        },
        {
            id: "clusters", kind: "accidents", eyebrow: "Cluster", layers: ["pie-clusters-fine-layer", "pie-clusters-coarse-layer"],
            render: (p) => `
                <div class="pop-title">Unfälle nach Schwere</div>
                <table class="pop-table">
                    <tr><td>Getötete</td><td>${p.UKATEGORIE__1 || 0}</td></tr>
                    <tr><td>Schwerverletzte</td><td>${p.UKATEGORIE__2 || 0}</td></tr>
                    <tr><td>Leichtverletzte</td><td>${p.UKATEGORIE__3 || 0}</td></tr>
                    <tr><td>Gesamt</td><td><strong>${clusterTotal(p)}</strong></td></tr>
                </table>`,
            // Popup am Cluster-Zentrum (nicht am Cursor), Abstand = Radius des vergrößerten
            // Hover-Pies (icon-size 1; Bildgröße wie in generatePieIcon: 32/48/64 px).
            anchor: (f) => {
                const total = clusterTotal(f.properties);
                const pieSize = total > 100 ? 64 : total > 10 ? 48 : 32;
                return { lngLat: f.geometry.coordinates, offset: pieSize / 2 + 4 };
            },
            // Vergrößertes Pie über dem gehoverten Cluster (Layer "hover-pie"). Nur ein PLAIN
            // GeoJSON-Feature übergeben: seit MapLibre 5.24 geht setData per Structured-Clone
            // an den Worker; das MapGeoJSONFeature aus queryRenderedFeatures ist nicht klonbar.
            onEnter: (f) => map.getSource("hover-point")?.setData({
                type: "FeatureCollection",
                features: [{ type: "Feature", geometry: f.geometry, properties: f.properties }]
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
