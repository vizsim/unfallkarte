// Kontext-Layer Bevölkerung: Zensus 2022 im 100-m-Gitter (ab z11) und, als Übersicht, im
// 1-km-Gitter (z8–10). Gebaut von pipeline/src/unfallkarte/census.py; Kachel-Felder = die
// `include`-Listen in pipeline/config/tiles.yaml (Vertrag: Layer `rasters-polys` bzw.
// `rasters-1km-polys`). Alle Zahlen sind seit 2026-09 echte Zahlen in den Kacheln; to-number
// bleibt als Schutz (die Kopie davor legte sie als Text ab).
import { row } from "../ui/popupHelpers.js";

// Einfärbung wählbar (Chips in der Legende, Permalink `pm`). EINE Einheit über alle Zoomstufen:
// je Hektar. Eine 100-m-Zelle IST ein Hektar; die 1-km-Zelle (100 ha) wird durch 100 geteilt
// (Mittel je Hektar). Klassen nach der Verteilung:
// - Einwohner: 100-m-Zellen Median 15, nur 4 % ab 100, Minimum 3. Im 1-km-Mittel liegen 76 %
//   der bewohnten Zellen unter 3/ha (Median 0,64) -> die Skala reicht darum bis „unter 1";
//   die 100-m-Zellen nutzen die beiden unteren Klassen nie.
// - unter 18 / ab 65: ABSOLUT je Hektar, nicht als Anteil — in den vielen kleinen Zellen
//   springt der Anteil zwischen 0 und 33/100 % (45 % aller Zellen: „0 % unter 18"). Die
//   Werte 1–2 gibt es je 100-m-Zelle nicht (Geheimhaltung), 0 heißt dort „0 bis 2" -> ohne Farbe.
// - Durchschnittsalter: zweipolig mit neutraler Mitte 42–49 (einwohnergewichteter Schnitt
//   44,2), fünf Klassen. Die graue Mitte verschwand auf der hellen Grundkarte; dunkler geht
//   nicht (ab #d3cfc7 fällt sie bei Rot-Grün-Schwäche mit dem Hellrot zusammen) — darum
//   bekommt NUR sie eine dunkle Kontur (`outline` -> fill-outline-color).
// Mengen: eine Orange-Skala hell -> dunkel (die hellste Stufe darf fast verschwinden: „fast
// leer"); Alter: blau (jünger) <-> rot (älter). Mit dem Palette-Validator geprüft.
const NONE = "rgba(0, 0, 0, 0)";
const ANY = 0.000001; // „größer als 0" — erste Klasse; 0 und fehlende Werte (-1) bleiben leer
const RAMP = ["#fbe0c6", "#f8be8a", "#f59a4f", "#ec7a26", "#d8600e", "#b44a06", "#8a3804", "#5f2602"];
const COUNT_RAMP = [...RAMP.slice(0, 6), RAMP[7]]; // 7 Klassen, dunkelste bleibt die dunkelste
const COUNT_CLASSES = [
    { min: ANY, text: "unter 1" }, { min: 1, text: "1 – 3" }, { min: 3, text: "3 – 5" },
    { min: 5, text: "5 – 10" }, { min: 10, text: "10 – 20" }, { min: 20, text: "20 – 50" },
    { min: 50, text: "ab 50" },
].map((c, i) => ({ ...c, color: COUNT_RAMP[i] }));

const populationModes = [
    {
        value: "ew", label: "Einwohner", attr: "Einwohner", perHa: true,
        heading: "Einwohner je Hektar",
        classes: [
            { min: ANY, text: "unter 1" }, { min: 1, text: "1 – 3" }, { min: 3, text: "3 – 10" },
            { min: 10, text: "10 – 25" }, { min: 25, text: "25 – 50" }, { min: 50, text: "50 – 100" },
            { min: 100, text: "100 – 250" }, { min: 250, text: "ab 250" },
        ].map((c, i) => ({ ...c, color: RAMP[i] })),
    },
    {
        value: "u18", label: "unter 18", attr: "Unter18", perHa: true,
        heading: "unter 18-Jährige je Hektar",
        note: "0–2 je 100-m-Zelle (geheimgehalten): ohne Farbe",
        classes: COUNT_CLASSES,
    },
    {
        value: "a65", label: "ab 65", attr: "a65undaelter", perHa: true,
        heading: "ab 65-Jährige je Hektar",
        note: "0–2 je 100-m-Zelle (geheimgehalten): ohne Farbe",
        classes: COUNT_CLASSES,
    },
    {
        value: "alter", label: "Ø Alter", attr: "Durchschnittsalter", perHa: false,
        heading: "Durchschnittsalter (Jahre)",
        note: "Mitte (grau umrandet) ≈ Schnitt in Deutschland (44 Jahre)",
        classes: [
            { min: 0, color: "#256abf", text: "unter 35" },
            { min: 35, color: "#86b6ef", text: "35 – 42" },
            { min: 42, color: "#dcd9d2", outline: "#8a8478", text: "42 – 49" },
            { min: 49, color: "#ee9a90", text: "49 – 56" },
            { min: 56, color: "#c43c3c", text: "ab 56" },
        ],
    },
];
const DEFAULT_MODE = populationModes[0].value;

// Map-Layer -> Hektar je Zelle (Teiler für die je-Hektar-Modi)
const CELL_LAYERS = [
    { id: "population-cells-1km", hectares: 100 },
    { id: "population-cells", hectares: 1 },
];

/**
 * fill-color je Modus und Zellgröße. Unter der ersten Klasse (0 bzw. fehlender Wert = -1)
 * bleibt die Zelle leer.
 */
export function populationColorExpr(mode, hectares = 1) {
    const { attr, classes, perHa } = populationModes.find((m) => m.value === mode) ?? populationModes[0];
    const raw = ["to-number", ["get", attr], -1];
    const value = perHa && hectares !== 1 ? ["/", raw, hectares] : raw;
    return ["step", value, NONE, ...classes.flatMap((c) => [c.min, c.color])];
}

/** fill-outline-color: wie die Füllung, außer Klassen mit eigener Kontur (neutrale Alters-Mitte). */
export function populationOutlineExpr(mode, hectares = 1) {
    const expr = populationColorExpr(mode, hectares);
    const { classes } = populationModes.find((m) => m.value === mode) ?? populationModes[0];
    classes.forEach((c, i) => { if (c.outline) expr[4 + 2 * i] = c.outline; });
    return expr;
}

// Klick auf einen Chip -> beide Layer umfärben + Link nachziehen. Die Legende schaltet ihre
// Skala selbst (legendMarkup.js). Lazy: die Layer entstehen erst beim Einschalten, im
// Default-Modus -> dann den gewählten nachziehen (der Listener läuft NACH dem generischen Toggle).
function setupPopulationMode(map, { onChange }) {
    const current = () => document.querySelector('input[name="population-mode"]:checked')?.value ?? DEFAULT_MODE;
    const apply = () => {
        for (const { id, hectares } of CELL_LAYERS) {
            if (!map.getLayer(id)) continue;
            map.setPaintProperty(id, "fill-color", populationColorExpr(current(), hectares));
            map.setPaintProperty(id, "fill-outline-color", populationOutlineExpr(current(), hectares));
        }
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

// Regionalstatistische Raumtypologie (BMV), zusammengefasst in 7 Typen
const regioStar7 = {
    71: "Metropole", 72: "Regiopole und Großstadt", 73: "Mittelstadt, städtischer Raum",
    74: "kleinstädtischer, dörflicher Raum (Stadtregion)", 75: "zentrale Stadt (ländlich)",
    76: "städtischer Raum (ländlich)", 77: "kleinstädtischer, dörflicher Raum (ländlich)",
};

const ageRows = (p) => {
    const age = fmt(p.Durchschnittsalter, 1);
    return `
        ${row("unter 18 Jahre", withShare(p.Unter18, p.AnteilUnter18))}
        ${row("65 Jahre und älter", withShare(p.a65undaelter, p.AnteilUeber65))}
        ${row("Durchschnittsalter", age && `${age} Jahre`)}`;
};
const META = `<div class="pop-meta">Kleine Werte geheimhaltungsbedingt leicht verändert · © Destatis</div>`;

/** @type {import("./registry.js").LayerEntry[]} */
export default [
    {
        id: "population", kind: "context",
        sources: [
            { id: "population", manifest: "census_population" },
            { id: "population_1km", manifest: "census_population_1km" },
        ],
        legend: {
            label: "Bevölkerung (Zensus 2022) anzeigen",
            tip: "Quelle: © Statistisches Bundesamt (Destatis), Zensus 2022 – Lizenz: dl-de/by-2-0",
            vintage: "census_population",
            modes: {
                name: "population-mode", // Permalink-Ziel `pm` (permalinkFormat.js CONTROLS)
                options: populationModes.map(({ value, label, heading, note, classes }) => ({
                    value, label, heading, note,
                    stops: classes.map(({ color, text, outline }) => ({ color, text, outline })),
                })),
            },
            note: "Ab Zoomstufe 11 je 100-m-Zelle (= 1 Hektar), darunter Mittel der 1-km-Zelle",
        },
        layers: [
            {
              id: "population-cells-1km",
              source: "population_1km",
              type: "fill",
              "source-layer": "rasters-1km-polys",
              maxzoom: 11,
              paint: {
                "fill-color": populationColorExpr(DEFAULT_MODE, 100),
                "fill-outline-color": populationOutlineExpr(DEFAULT_MODE, 100),
                "fill-opacity": 0.6
              }
            },
            {
              id: "population-cells",
              type: "fill",
              "source-layer": "rasters-polys",
              minzoom: 11,
              paint: {
                "fill-color": populationColorExpr(DEFAULT_MODE, 1),
                "fill-outline-color": populationOutlineExpr(DEFAULT_MODE, 1),
                "fill-opacity": 0.6
              }
            }
        ],
        permalink: "w", dataMinZoom: 8,
        setup: setupPopulationMode,
        popups: [
            {
                id: "population-cells", layers: ["population-cells"], eyebrow: "Zensus 2022",
                render: (p) => {
                    const rs = Number(p.RegioStaR7);
                    return `
                    <div class="pop-title">Bevölkerung · 100-m-Zelle</div>
                    <div class="pop-hero">${fmt(p.Einwohner) ?? "—"} Einwohner</div>
                    <table class="pop-table">
                        ${ageRows(p)}
                        ${row("Gemeinde", p.name_23)}
                        ${row("PLZ", p.plz)}
                        ${row("Raumtyp", regioStar7[rs] && `${regioStar7[rs]} (RegioStaR ${rs})`)}
                    </table>
                    ${META}`;
                }
            },
            {
                id: "population-cells-1km", layers: ["population-cells-1km"], eyebrow: "Zensus 2022",
                render: (p) => {
                    const perHa = fmt(Number(p.Einwohner) / 100, 1);
                    return `
                    <div class="pop-title">Bevölkerung · 1-km-Zelle</div>
                    <div class="pop-hero">${fmt(p.Einwohner) ?? "—"} Einwohner</div>
                    <table class="pop-table">
                        ${row("je Hektar (Mittel)", perHa)}
                        ${ageRows(p)}
                    </table>
                    ${META}`;
                }
            },
        ]
    },
];
