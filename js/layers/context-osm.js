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
// Farbe nach Sicherung der Querung (Ampel / markiert / unmarkiert) — Punkte + Linien
const crossingColor = [
  "match",
  ["get", "crossing"],
  "traffic_signals", "#2ECC40",
  ["marked", "uncontrolled", "zebra"], "#FF851B",
  "unmarked", "#FF4136",
  /* default */ "#9aa0a6"
];

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
        layers: [
            {
              id: "schools-points",
              type: "symbol",
              "source-layer": "germany_osm_schools",
              filter: ["==", ["geometry-type"], "Point"],
              layout: {
                // 👇 switch icon based on amenity value
                "icon-image": [
                  "match",
                  ["get", "amenity"],
                  "school", "home_blue",         // matches to `home_blue.png`
                  "kindergarten", "home_green",  // matches to `home_green.png`
                  "home"                    // default fallback icon
                ],

                "icon-size": [
                  "interpolate",
                  ["linear"],
                  ["zoom"],
                  9, 0.3,
                  10, 0.5,
                  14, 1,
                  16, 1.8
                ],
                "icon-allow-overlap": true
              },
              paint: {
                "icon-opacity": 0.5,
              }
            },
            {
              id: "schools-polygons",
              type: "fill",
              "source-layer": "germany_osm_schools",
              filter: ["==", ["geometry-type"], "Polygon"],
              paint: {
                "fill-color": [
                  "match",
                  ["get", "amenity"],
                  "school", "#0074D9",
                  "kindergarten", "#2ECC40",
                  "#aaaaaa"
                ],
                "fill-opacity": 0.5,
                "fill-outline-color": "#1B4D3E"
              }
            }
        ],
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
        layers: [
            {
              id: "health-points",
              type: "symbol",
              "source-layer": "germany_osm_health", // must match tippecanoe `-l` name
              filter: ["==", ["geometry-type"], "Point"],
              layout: {
                "icon-image": [
                  "case",

                  // Gruppe 1: Medizinisch → 🔴 red
                  ["any",
                    ["==", ["get", "amenity"], "hospital"],
                    ["==", ["get", "amenity"], "clinic"],
                    ["==", ["get", "healthcare"], "rehabilitation"],
                    ["==", ["get", "healthcare_speciality"], "psychiatry"]
                  ], "home_red",

                  // Gruppe 3: Pflege / Senioren → 🟦 türkis
                  ["any",
                    ["==", ["get", "social_facility"], "nursing_home"],
                    ["==", ["get", "social_facility"], "assisted_living"],
                    ["==", ["get", "social_facility_for"], "senior"]
                  ], "home_turkis",

                  // Gruppe 4: Behindertenhilfe → 🟨 yellow
                  ["==", ["get", "social_facility_for"], "disabled"], "home_yellow",

                  // Fallback
                  // "home"
                  "__none__" // default fallback icon
                ],
                "icon-size": [
                  "interpolate",
                  ["linear"],
                  ["zoom"],
                  9, 0.35,
                  10, 0.6,
                  14, 1,
                  16, 1.7
                ],
                "icon-allow-overlap": true //,
                // "icon-ignore-placement": true,
                // "icon-optional": true
              },
              paint: {
                "icon-opacity": 0.5
              }
            },
            {
              id: "health-polygons",
              type: "fill",
              "source-layer": "germany_osm_health",
              filter: ["==", ["geometry-type"], "Polygon"],
              paint: {
                "fill-color": [
                  "case",
                  // Gruppe 1: Medizinisch
                  ["==", ["get", "amenity"], "hospital"], "#D62728",
                  ["==", ["get", "amenity"], "clinic"], "#D62728",
                  ["==", ["get", "healthcare"], "rehabilitation"], "#D62728",
                  ["==", ["get", "healthcare_speciality"], "psychiatry"], "#D62728",

                  // Gruppe 3: Pflege / Senioren
                  ["==", ["get", "social_facility"], "nursing_home"], "#17BECF",
                  ["==", ["get", "social_facility"], "assisted_living"], "#17BECF",  // NEU
                  ["==", ["get", "social_facility_for"], "senior"], "#17BECF",

                  // Gruppe 4: Behindertenhilfe
                  ["==", ["get", "social_facility_for"], "disabled"], "#BCBD22",

                  "#aaaaaa"
                ],
                "fill-opacity": 0.5,
                "fill-outline-color": "#1B4D3E"
              }
            }
        ],
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
        layers: [
            {
              id: "playgrounds-points",
              type: "symbol",
              "source-layer": "germany_osm_playgrounds", // must match tippecanoe `-l` name
              filter: ["==", ["geometry-type"], "Point"],
              layout: {
                // "icon-image": "playground_darkgreen",  // Maki-Icon

                "icon-image": [
                  "case",

                  ["any",
                    ["==", ["get", "amenity"], "playground"],
                    ["==", ["get", "leisure"], "playground"],

                  ], "playground_darkgreen",

                  // Fallback
                  "__none__" // default fallback icon
                ],


                "icon-size": [
                  "interpolate",
                  ["linear"],
                  ["zoom"],
                  9, 0.35,
                  10, 0.6,
                  14, 1,
                  16, 1.7
                ],
                "icon-allow-overlap": true //,
                // "icon-ignore-placement": true,
                // "icon-optional": true
              },
              paint: {
                "icon-opacity": 0.5
              }
            },
            {
              id: "playgrounds-polygons",
              type: "fill",
              "source-layer": "germany_osm_playgrounds",
              filter: ["==", ["geometry-type"], "Polygon"],
              paint: {
                "fill-color": [
                  "case",
                  // playgrounds
                  ["==", ["get", "amenity"], "playground"], "#008000",
                  ["==", ["get", "leisure"], "playground"], "#008000",
                  "#aaaaaa"
                ],
                "fill-opacity": 0.5,
                "fill-outline-color": "#1B4D3E"
              }
            }
        ],
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
        layers: [
            {
              id: "crossings-lines",
              type: "line",
              "source-layer": "germany_osm_crossings",
              filter: ["==", ["geometry-type"], "LineString"],
              layout: { visibility: "none", "line-cap": "round" },
              paint: {
                "line-color": crossingColor,
                "line-width": ["interpolate", ["linear"], ["zoom"], 9, 0.5, 12, 2, 16, 5],
                "line-opacity": 0.85
              }
            },
            {
              id: "crossings-points",
              type: "circle",
              "source-layer": "germany_osm_crossings",
              filter: ["==", ["geometry-type"], "Point"],
              layout: { visibility: "none" },
              paint: {
                "circle-color": crossingColor,
                // Bei niedrigem Zoom klein und randlos (sonst wirken die Punkte wie ein Teppich);
                // Rand blendet erst ab z12 ein, wenn die Punkte groß genug dafür sind.
                "circle-radius": ["interpolate", ["linear"], ["zoom"], 9, 0.7, 11, 2, 14, 5, 16, 8],
                "circle-stroke-color": "#1B4D3E",
                "circle-stroke-width": ["interpolate", ["linear"], ["zoom"], 11.5, 0, 12.5, 1],
                "circle-opacity": 0.85
              }
            }
        ],
        permalink: "c", dataMinZoom: 9,
        // Node (Punkt) bzw. Way (Linie) -> getrennte OSM-Objektseiten
        popups: [
            { id: "crossings-points", layers: ["crossings-points"], eyebrow: "OSM", render: renderCrossing, link: osmLink("node"), openOnClick: true },
            { id: "crossings-lines", layers: ["crossings-lines"], eyebrow: "OSM", render: renderCrossing, link: osmLink("way"), openOnClick: true },
        ]
    },
];
