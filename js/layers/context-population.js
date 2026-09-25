// Kontext-Layer Bevölkerung: Zensus 2022, 100-m-Gitter (Einwohner je Zelle = je Hektar).
//
// Übergangslösung: die Kacheln sind eine 1:1-Kopie aus routing_bulk (siehe sources.yaml,
// census_population). Daher der fremde Layer-Name `rasters-polys` und nur z9–10 — darüber
// überzoomt MapLibre die z10-Kacheln. Die Attribute sind teils als String abgelegt
// ("Mixed"), darum überall to-number.
import { row } from "../ui/popupHelpers.js";

// Klassen nach der Verteilung aller 3,1 Mio. bewohnten Zellen: Median 15, 90 % unter 60,
// nur 4 % ab 100. Einfarbige Skala hell -> dunkel (geprüft: monoton, sichtbare Stufen,
// hellste Stufe hebt sich vom Untergrund ab).
const populationClasses = [
    { min: 3, color: "#f59a4f", text: "3 – 9" },
    { min: 10, color: "#ec7a26", text: "10 – 24" },
    { min: 25, color: "#d8600e", text: "25 – 49" },
    { min: 50, color: "#b44a06", text: "50 – 99" },
    { min: 100, color: "#8a3804", text: "100 – 249" },
    { min: 250, color: "#5f2602", text: "≥ 250" },
];

const populationColor = [
    "step", ["to-number", ["get", "Einwohner"], 0],
    populationClasses[0].color,
    ...populationClasses.slice(1).flatMap((c) => [c.min, c.color]),
];

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
            label: "Einwohner (Zensus 2022) anzeigen",
            tip: "Quelle: © Statistisches Bundesamt (Destatis), Zensus 2022 – Lizenz: dl-de/by-2-0",
            vintage: "census_population",
            heading: "Einwohner je Hektar",
            note: "100 × 100 m-Gitterzelle",
            stops: populationClasses.map(({ color, text }) => ({ color, text })),
        },
        layers: [
            {
              id: "population-cells",
              type: "fill",
              "source-layer": "rasters-polys",
              paint: {
                "fill-color": populationColor,
                "fill-opacity": 0.6
              }
            }
        ],
        permalink: "w", dataMinZoom: 11,
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
