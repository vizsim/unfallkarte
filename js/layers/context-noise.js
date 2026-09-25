// Kontext-Layer UBA-Umgebungslärm (Hauptlärmquelle Straße, END-Kartierung).
//
// EIN Eintrag mit zwei Indizes, umschaltbar per Chip in der Legende (Permalink `lm`):
// Tag-Abend-Nacht (LDEN, Layer laerm1) oder Nacht (LNIGHT, Layer laerm2). Bis 2026-09 waren
// das zwei eigene Haken (#toggle-laerm1 / #toggle-laerm2, Permalink-Zeichen l / r). Der
// Eintrag behält ID, DOM-IDs und Zeichen von laerm1; alte Links mit `r` liest
// permalinkFormat.js als „laerm1 im Modus Nacht" (LEGACY_LAYER_CHARS) — `r` bleibt reserviert.

const ldenLabels = {
    Lden5559: "55 – 59 dB(A)",
    Lden6064: "60 – 64 dB(A)",
    Lden6569: "65 – 69 dB(A)",
    Lden7074: "70 – 74 dB(A)",
    LdenGreaterThan75: "> 75 dB(A)"
};
const lnightLabels = {
    Lnight5054: "50 – 54 dB(A)",
    Lnight5559: "55 – 59 dB(A)",
    Lnight6064: "60 – 64 dB(A)",
    Lnight6569: "65 – 69 dB(A)",
    LnightGreaterThan70: "> 70 dB(A)"
};

// Modus -> Layer. Reihenfolge = Chips; der erste ist der Default.
const noiseModes = [
    {
        value: "den", label: "Tag-Abend-Nacht", layer: "laerm1",
        heading: "Tag-Abend-Nacht-Lärmindex", note: "LDEN",
        stops: [
            { color: "#A6AD88", text: "55 – 59 dB(A)" },
            { color: "#B89C63", text: "60 – 64 dB(A)" },
            { color: "#994848", text: "65 – 69 dB(A)" },
            { color: "#4B244A", text: "70 – 74 dB(A)" },
            { color: "#2F0037", text: "> 75 dB(A)" },
        ],
    },
    {
        value: "night", label: "Nacht", layer: "laerm2",
        heading: "Nacht-Lärmindex", note: "LNIGHT",
        stops: [
            { color: "#A6AD88", text: "50 – 54 dB(A)" },
            { color: "#B89C63", text: "55 – 59 dB(A)" },
            { color: "#994848", text: "60 – 64 dB(A)" },
            { color: "#4B244A", text: "65 – 69 dB(A)" },
            { color: "#2F0037", text: "> 70 dB(A)" },
        ],
    },
];

// Der generische Toggle schaltet ALLE Layer des Eintrags; dieser Listener läuft danach (im
// selben Event, also ohne Zwischenbild) und lässt nur den Layer des gewählten Modus an.
function setupNoiseMode(map, { onChange }) {
    const toggle = document.getElementById("toggle-laerm1");
    const current = () => document.querySelector('input[name="laerm-mode"]:checked')?.value ?? noiseModes[0].value;
    const apply = () => {
        for (const { value, layer } of noiseModes) {
            if (map.getLayer(layer)) map.setLayoutProperty(layer, "visibility", toggle?.checked && current() === value ? "visible" : "none");
        }
    };
    document.querySelectorAll('input[name="laerm-mode"]').forEach((r) => r.addEventListener("change", () => {
        apply();
        onChange?.();
    }));
    toggle?.addEventListener("change", apply);
}

const noiseLayer = (id, sourceLayer, classes) => ({
    id,
    type: "fill",
    "source-layer": sourceLayer,
    filter: ["==", ["geometry-type"], "Polygon"],
    paint: {
        "fill-color": ["match", ["get", "Lärmpegelklasse"], ...classes, /* default */ "#999999"],
        "fill-opacity": 0.6,
        "fill-outline-color": "#1B4D3E"
    }
});

/** @type {import("./registry.js").LayerEntry[]} */
export default [
    {
        id: "laerm1", kind: "context",
        sources: [
            { id: "laerm1", manifest: "laerm_den" },
            { id: "laerm2", manifest: "laerm_night" },
        ],
        legend: {
            label: "Straßenlärm anzeigen",
            tip: "Quelle: Umweltbundesamt-DE – Lizenz: dl-by-de/2.0",
            vintageAttr: "laerm-vintage",
            modes: {
                name: "laerm-mode", // Permalink-Ziel `lm` (permalinkFormat.js CONTROLS)
                options: noiseModes.map(({ value, label, heading, note, stops }) => ({ value, label, heading, note, stops })),
            },
        },
        layers: [
            noiseLayer("laerm1", "laerm_hlq_den-polys", [
                "Lden5559", "#A6AD88",
                "Lden6064", "#B89C63",
                "Lden6569", "#994848",
                "Lden7074", "#4B244A",
                "LdenGreaterThan75", "#2F0037",
            ]),
            {
                ...noiseLayer("laerm2", "laerm_4120_hlq_night-polys", [
                    "Lnight5054", "#A6AD88",
                    "Lnight5559", "#B89C63",
                    "Lnight6064", "#994848",
                    "Lnight6569", "#4B244A",
                    "LnightGreaterThan70", "#2F0037",
                ]),
                source: "laerm2",
            },
        ],
        permalink: "l", dataMinZoom: 9,
        setup: setupNoiseMode,
        popups: [
            {
                id: "laerm1", layers: ["laerm1"], eyebrow: "UBA",
                render: (p) => `
                <div class="pop-title">Lärm · Tag-Abend-Nacht</div>
                <div class="pop-hero">${ldenLabels[p.Lärmpegelklasse] || p.Lärmpegelklasse || "—"}</div>
                <div class="pop-meta">L<sub>DEN</sub> · Hauptlärmquelle · © UBA</div>`
            },
            {
                id: "laerm2", layers: ["laerm2"], eyebrow: "UBA",
                render: (p) => `
                <div class="pop-title">Lärm · Nacht</div>
                <div class="pop-hero">${lnightLabels[p.Lärmpegelklasse] || p.Lärmpegelklasse || "—"}</div>
                <div class="pop-meta">L<sub>night</sub> · Hauptlärmquelle · © UBA</div>`
            },
        ]
    },
];
