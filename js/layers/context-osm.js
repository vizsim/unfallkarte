// Kontext-Layer aus OpenStreetMap: Orte & Einrichtungen, Querungen.
import { row, osmLink } from "../ui/popupHelpers.js";

const schoolTitle = { school: "Schule", kindergarten: "Kindergarten" };

const crossingLabels = {
    traffic_signals: "Ampel (Lichtzeichen)",
    marked: "Markiert (Zebra/Markierung)",
    uncontrolled: "Markiert (Zebra/Markierung)",
    zebra: "Zebrastreifen",
    unmarked: "Unmarkiert",
};
const renderCrossing = (p) => `
    <div class="pop-title">Übergang</div>
    <table class="pop-table">
        <tr><td>Typ</td><td>${crossingLabels[p.crossing] || p.crossing || "unbekannt"}</td></tr>
        ${row("Markierung", p.crossing_markings)}
        ${row("Blindenleitsystem", p.tactile_paving)}
        ${row("Bordstein", p.kerb)}
    </table>`;

/** @type {import("./registry.js").LayerEntry[]} */
export default [
    {
        id: "schools", kind: "context",
        source: { id: "schools", manifest: "osm_schools" },
        layers: ["schools-points", "schools-polygons"],
        permalink: "k", dataMinZoom: 9,
        popups: [{
            eyebrow: "OSM",
            render: (p) => `
                <div class="pop-title">${schoolTitle[p.amenity] || "Schule / Kindergarten"}</div>
                <table class="pop-table">
                    ${row("Name", p.name)}
                    ${row("Art", p.amenity)}
                    ${row("Bildungsstufe", p.isced_level ? `ISCED ${p.isced_level}` : null)}
                </table>`
        }]
    },
    {
        id: "health", kind: "context",
        source: { id: "health", manifest: "osm_health" },
        layers: ["health-points", "health-polygons"],
        permalink: "e", dataMinZoom: 9,
        popups: [{
            eyebrow: "OSM",
            // OSM-Tags mit Doppelpunkt heißen in den Tiles mit Unterstrich (GDAL-osmconf).
            render: (p) => `
                <div class="pop-title">Gesundheitseinrichtung</div>
                <table class="pop-table">
                    ${row("Name", p.name)}
                    ${row("Art", p.amenity)}
                    ${row("Versorgung", p.healthcare)}
                    ${row("Fachgebiet", p.healthcare_speciality)}
                    ${row("Einrichtung", p.social_facility)}
                    ${row("Zielgruppe", p.social_facility_for)}
                    ${row("Träger", p.operator)}
                </table>`
        }]
    },
    {
        id: "playgrounds", kind: "context",
        source: { id: "playgrounds", manifest: "osm_playgrounds" },
        layers: ["playgrounds-points", "playgrounds-polygons"],
        permalink: "p", dataMinZoom: 9,
        popups: [{
            eyebrow: "OSM",
            render: (p) => `
                <div class="pop-title">Spielplatz</div>
                <table class="pop-table">
                    ${row("Name", p.name)}
                    ${row("Art", p.leisure)}
                    ${row("Ausstattung", p.playground)}
                    ${row("Kategorie", p.amenity)}
                    ${row("Träger", p.operator)}
                </table>`
        }]
    },
    {
        id: "crossings", kind: "context",
        source: { id: "crossings", manifest: "osm_crossings" },
        layers: ["crossings-points", "crossings-lines"],
        permalink: "c", dataMinZoom: 9,
        // Node (Punkt) bzw. Way (Linie) -> getrennte OSM-Objektseiten
        popups: [
            { id: "crossings-points", layers: ["crossings-points"], eyebrow: "OSM", render: renderCrossing, link: osmLink("node"), openOnClick: true },
            { id: "crossings-lines", layers: ["crossings-lines"], eyebrow: "OSM", render: renderCrossing, link: osmLink("way"), openOnClick: true },
        ]
    },
];
