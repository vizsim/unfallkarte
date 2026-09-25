// Kontext-Layer Bevölkerung: Zensus 2022, 100-m-Gitter (Werte je Zelle = je Hektar).
//
// Übergangslösung: die Kacheln sind eine 1:1-Kopie aus routing_bulk (siehe sources.yaml,
// census_population). Daher der fremde Layer-Name `rasters-polys` und nur z9–10 — darüber
// überzoomt MapLibre die z10-Kacheln. Die Attribute sind teils als String abgelegt
// ("Mixed"), darum überall to-number.
import { row } from "../ui/popupHelpers.js";

// Einfärbung wählbar (Radios in der Legende, Permalink `pm`). Klassen nach der Verteilung
// aller 3,1 Mio. bewohnten Zellen:
// - Einwohner: Median 15, 90 % unter 60, nur 4 % ab 100.
// - unter 18 / ab 65: ABSOLUT je Hektar, nicht als Anteil — in den vielen kleinen Zellen
//   springt der Anteil zwischen 0 und 33/100 % (45 % aller Zellen: „0 % unter 18"). Die
//   Werte 1–2 gibt es nicht (Geheimhaltung), 0 heißt also „0 bis 2" -> ohne Farbe.
// - Durchschnittsalter: zweipolig um die Mitte 42–49 (einwohnergewichteter Schnitt 44,2).
// Mengen: eine Orange-Skala hell -> dunkel; Alter: blau (jünger) <-> rot (älter), graue Mitte.
const NONE = "rgba(0, 0, 0, 0)";
const COUNT_COLORS = ["#f59a4f", "#e2701c", "#bf540a", "#8f3c05", "#5f2602"];
const COUNT_STOPS = [
    { min: 3, text: "3 – 4" }, { min: 5, text: "5 – 9" }, { min: 10, text: "10 – 19" },
    { min: 20, text: "20 – 49" }, { min: 50, text: "≥ 50" },
];
const countClasses = COUNT_STOPS.map((s, i) => ({ ...s, color: COUNT_COLORS[i] }));

const populationModes = [
    {
        value: "ew", label: "Einwohner", attr: "Einwohner",
        heading: "Einwohner je Hektar",
        classes: [
            { min: 3, color: "#f59a4f", text: "3 – 9" },
            { min: 10, color: "#ec7a26", text: "10 – 24" },
            { min: 25, color: "#d8600e", text: "25 – 49" },
            { min: 50, color: "#b44a06", text: "50 – 99" },
            { min: 100, color: "#8a3804", text: "100 – 249" },
            { min: 250, color: "#5f2602", text: "≥ 250" },
        ],
    },
    {
        value: "u18", label: "unter 18", attr: "Unter18",
        heading: "unter 18-Jährige je Hektar",
        note: "0–2 (geheimgehalten): ohne Farbe",
        classes: countClasses,
    },
    {
        value: "a65", label: "ab 65", attr: "a65undaelter",
        heading: "ab 65-Jährige je Hektar",
        note: "0–2 (geheimgehalten): ohne Farbe",
        classes: countClasses,
    },
    {
        value: "alter", label: "Ø Alter", attr: "Durchschnittsalter",
        heading: "Durchschnittsalter (Jahre)",
        note: "Mitte ≈ Schnitt in Deutschland (44 Jahre)",
        classes: [
            { min: 0, color: "#256abf", text: "unter 35" },
            { min: 35, color: "#86b6ef", text: "35 – 42" },
            { min: 42, color: "#dcd9d2", text: "42 – 49" },
            { min: 49, color: "#ee9a90", text: "49 – 56" },
            { min: 56, color: "#c43c3c", text: "≥ 56" },
        ],
    },
];
const DEFAULT_MODE = populationModes[0].value;

/** fill-color je Modus. Unter der ersten Klasse (0 bzw. fehlender Wert = -1) bleibt die Zelle leer. */
export function populationColorExpr(mode) {
    const { attr, classes } = populationModes.find((m) => m.value === mode) ?? populationModes[0];
    return ["step", ["to-number", ["get", attr], -1], NONE, ...classes.flatMap((c) => [c.min, c.color])];
}

// Klick auf ein Radio -> Karte umfärben + Link nachziehen. Die Legende schaltet ihre Skala
// selbst (legendMarkup.js). Lazy: der Layer entsteht erst beim Einschalten, im Default-Modus
// -> dann den gewählten nachziehen (der Listener läuft NACH dem generischen Toggle).
function setupPopulationMode(map, { onChange }) {
    const current = () => document.querySelector('input[name="population-mode"]:checked')?.value ?? DEFAULT_MODE;
    const apply = () => {
        if (map.getLayer("population-cells")) map.setPaintProperty("population-cells", "fill-color", populationColorExpr(current()));
    };
    document.querySelectorAll('input[name="population-mode"]').forEach((r) => r.addEventListener("change", () => {
        apply();
        onChange?.();
    }));
    document.getElementById("toggle-population")?.addEventListener("change", (e) => e.target.checked && apply());
}

const fmt = (value, digits = 0) => {
    const n = Number(value);
    return value === undefined || value === null || value === "" || !Number.isFinite(n)
        ? null : n.toLocaleString("de-DE", { maximumFractionDigits: digits });
};
const withShare = (count, share) => {
    const c = fmt(count);
    const s = fmt(share, 1);
    return c && s ? `${c} (${s} %)` : c;
};

/** @type {import("./registry.js").LayerEntry[]} */
export default [
    {
        id: "population", kind: "context",
        source: { id: "population", manifest: "census_population" },
        legend: {
            label: "Bevölkerung (Zensus 2022) anzeigen",
            tip: "Quelle: © Statistisches Bundesamt (Destatis), Zensus 2022 – Lizenz: dl-de/by-2-0",
            vintage: "census_population",
            modes: {
                name: "population-mode", // Permalink-Ziel `pm` (permalinkFormat.js CONTROLS)
                options: populationModes.map(({ value, label, heading, note, classes }) => ({
                    value, label, heading, note, stops: classes.map(({ color, text }) => ({ color, text })),
                })),
            },
            note: "1 Hektar = eine 100 × 100 m-Gitterzelle",
        },
        layers: [
            {
              id: "population-cells",
              type: "fill",
              "source-layer": "rasters-polys",
              paint: {
                "fill-color": populationColorExpr(DEFAULT_MODE),
                "fill-opacity": 0.6
              }
            }
        ],
        permalink: "w", dataMinZoom: 11,
        setup: setupPopulationMode,
        popups: [{
            eyebrow: "Zensus 2022",
            render: (p) => {
                const age = fmt(p.Durchschnittsalter, 1);
                return `
                <div class="pop-title">Bevölkerung · 100-m-Zelle</div>
                <div class="pop-hero">${fmt(p.Einwohner) ?? "—"} Einwohner</div>
                <table class="pop-table">
                    ${row("unter 18 Jahre", withShare(p.Unter18, p.AnteilUnter18))}
                    ${row("65 Jahre und älter", withShare(p.a65undaelter, p.AnteilUeber65))}
                    ${row("Durchschnittsalter", age && `${age} Jahre`)}
                    ${row("Gemeinde", p.name_23)}
                </table>
                <div class="pop-meta">Kleine Werte geheimhaltungsbedingt leicht verändert · © Destatis</div>`;
            }
        }]
    },
];
