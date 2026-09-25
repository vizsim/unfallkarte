// Kontext-Layer aus OpenStreetMap: Orte & Einrichtungen, Querungen, ÖPNV-Haltestellen.
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

// ÖPNV-Haltestellen: Verkehrsmittel aus den OSM-Tags. EINE Regelliste speist Kartenfarbe,
// Legende und Popup. Reihenfolge = Vorrang: ein Halt für Bus + Tram gilt als Tram, und
// Tram-Bahnsteige tragen meist auch railway=platform, darum steht Tram vor Bahn.
const platformModes = [
    { label: "Straßenbahn", color: "#C2185B", tags: { tram: ["yes"], railway: ["tram_stop"] } },
    { label: "Bahn (Zug, S-/U-Bahn)", color: "#1F5AA6", tags: { train: ["yes"], railway: ["platform", "halt", "station"] } },
    { label: "Bus", color: "#8E44AD", tags: { bus: ["yes"], highway: ["bus_stop"] } },
];
const platformOther = { label: "Ohne Angabe", color: "#9aa0a6" };

const platformModeOf = (p) =>
    platformModes.find((m) => Object.entries(m.tags).some(([key, values]) => values.includes(p[key]))) ?? platformOther;

const platformColor = [
    "case",
    ...platformModes.flatMap((m) => [
        ["any", ...Object.entries(m.tags).map(([key, values]) => ["match", ["get", key], values, true, false])],
        m.color,
    ]),
    platformOther.color,
];

const renderPlatform = (p) => `
    <div class="pop-title">Haltestelle</div>
    <table class="pop-table">
        ${row("Name", p.name)}
        ${row("Verkehrsmittel", platformModeOf(p).label)}
        ${row("Netz", p.network)}
        ${row("Betreiber", p.operator)}
    </table>`;

// Flächen aus GDAL-multipolygons: geschlossener Way -> osm_way_id, Relation -> osm_id
const platformAreaLink = (p) =>
    (p.osm_way_id ? { href: `https://www.openstreetmap.org/way/${p.osm_way_id}`, label: "OpenStreetMap" } : osmLink("relation")(p));

/** @type {import("./registry.js").LayerEntry[]} */
export default [
    {
        id: "schools", kind: "context",
        source: { id: "schools", manifest: "osm_schools" },
        legend: {
            label: "Schulen/Kindergärten anzeigen",
            tip: "Quelle: © OpenStreetMap – Lizenz: ODbL",
            vintage: "osm_schools",
            swatches: [
                { color: "#0074D9", text: "Schule" },
                { color: "#2ECC40", text: "Kindergarten" },
            ],
        },
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
        legend: {
            label: "Gesundheitseinrichtungen anzeigen",
            tip: "Quelle: © OpenStreetMap – Lizenz: ODbL",
            vintage: "osm_health",
            swatches: [
                { color: "#D62728", text: "Medizinische Einrichtungen (Krankenhaus, Klinik, Reha)" },
                { color: "#17BECF", text: "Pflege & Senioren (Pflegeheim, Betreutes Wohnen)" },
                { color: "#BCBD22", text: "Einrichtungen für Menschen mit Behinderung" },
            ],
        },
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
        legend: {
            label: "Spielplätze anzeigen",
            tip: "Quelle: © OpenStreetMap – Lizenz: ODbL",
            vintage: "osm_playgrounds",
            swatches: [{ color: "green", text: "Spielplätze" }],
        },
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
        legend: {
            label: "Fußgänger-/Radüberwege anzeigen",
            tip: "Quelle: © OpenStreetMap – Lizenz: ODbL",
            vintage: "osm_crossings",
            swatches: [
                { color: "#2ECC40", text: "Ampel (Lichtzeichen)" },
                { color: "#FF851B", text: "Markiert (Zebra/Markierung)" },
                { color: "#FF4136", text: "Unmarkiert" },
                { color: "#9aa0a6", text: "Ohne Typangabe" },
            ],
        },
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
    {
        // Haltestellen als Node (meist Bus), Bahnsteige als Way (Linie oder Fläche, meist Bahn).
        // Ist ein Halt als bus_stop-Node UND als platform-Way gemappt, erscheint er doppelt;
        // für die Anzeige egal (siehe osm.yaml).
        id: "platforms", kind: "context",
        source: { id: "platforms", manifest: "osm_platforms" },
        legend: {
            label: "ÖPNV-Haltestellen anzeigen",
            tip: "Quelle: © OpenStreetMap – Lizenz: ODbL",
            vintage: "osm_platforms",
            swatches: [...platformModes, platformOther].map(({ color, label }) => ({ color, text: label })),
        },
        layers: [
            {
              id: "platforms-polygons",
              type: "fill",
              "source-layer": "germany_osm_platforms",
              filter: ["==", ["geometry-type"], "Polygon"],
              paint: {
                "fill-color": platformColor,
                "fill-opacity": 0.35,
                "fill-outline-color": platformColor
              }
            },
            {
              id: "platforms-lines",
              type: "line",
              "source-layer": "germany_osm_platforms",
              filter: ["==", ["geometry-type"], "LineString"],
              layout: { "line-cap": "round" },
              paint: {
                "line-color": platformColor,
                "line-width": ["interpolate", ["linear"], ["zoom"], 12, 1, 16, 4],
                "line-opacity": 0.85
              }
            },
            {
              id: "platforms-points",
              type: "circle",
              "source-layer": "germany_osm_platforms",
              filter: ["==", ["geometry-type"], "Point"],
              paint: {
                "circle-color": platformColor,
                "circle-radius": ["interpolate", ["linear"], ["zoom"], 12, 2, 14, 5, 16, 7],
                // weißer Rand: unterscheidet Haltestellen von den dunkel umrandeten Übergängen
                "circle-stroke-color": "#ffffff",
                "circle-stroke-width": ["interpolate", ["linear"], ["zoom"], 12.5, 0, 13.5, 1.5],
                "circle-opacity": 0.9
              }
            }
        ],
        permalink: "n", dataMinZoom: 12,
        popups: [
            { id: "platforms-points", layers: ["platforms-points"], eyebrow: "OSM", render: renderPlatform, link: osmLink("node"), openOnClick: true },
            { id: "platforms-lines", layers: ["platforms-lines"], eyebrow: "OSM", render: renderPlatform, link: osmLink("way"), openOnClick: true },
            { id: "platforms-polygons", layers: ["platforms-polygons"], eyebrow: "OSM", render: renderPlatform, link: platformAreaLink, openOnClick: true },
        ]
    },
];
