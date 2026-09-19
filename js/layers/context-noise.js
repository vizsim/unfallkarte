// Kontext-Layer UBA-Umgebungslärm (Hauptlärmquelle Straße, END-Kartierung).

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

/** @type {import("./registry.js").LayerEntry[]} */
export default [
    {
        id: "laerm1", kind: "context",
        source: { id: "laerm1", manifest: "laerm_den" },
        legend: {
            label: "Lärm (Tag-Abend-Nacht) anzeigen",
            tip: "Quelle: Umweltbundesamt-DE – Lizenz: dl-by-de/2.0",
            vintageAttr: "laerm-vintage",
            heading: "Tag-Abend-Nacht-Lärmindex",
            note: "LDEN",
            stops: [
                { color: "#A6AD88", text: "55 – 59 dB(A)" },
                { color: "#B89C63", text: "60 – 64 dB(A)" },
                { color: "#994848", text: "65 – 69 dB(A)" },
                { color: "#4B244A", text: "70 – 74 dB(A)" },
                { color: "#2F0037", text: "> 75 dB(A)" },
            ],
        },
        layers: [
            {
              id: "laerm1",
              type: "fill",
              "source-layer": "laerm_hlq_den-polys",
              filter: ["==", ["geometry-type"], "Polygon"],
              paint: {
                "fill-color": [
                  "match",
                  ["get", "Lärmpegelklasse"],
                  "Lden5559", "#A6AD88",
                  "Lden6064", "#B89C63",
                  "Lden6569", "#994848",
                  "Lden7074", "#4B244A",
                  "LdenGreaterThan75", "#2F0037",
                /* default */ "#999999"
                ],
                "fill-opacity": 0.6,
                "fill-outline-color": "#1B4D3E"
              }
            }
        ],
        permalink: "l", dataMinZoom: 9,
        popups: [{
            eyebrow: "UBA",
            render: (p) => `
                <div class="pop-title">Lärm · Tag-Abend-Nacht</div>
                <div class="pop-hero">${ldenLabels[p.Lärmpegelklasse] || p.Lärmpegelklasse || "—"}</div>
                <div class="pop-meta">L<sub>DEN</sub> · Hauptlärmquelle · © UBA</div>`
        }]
    },
    {
        id: "laerm2", kind: "context",
        source: { id: "laerm2", manifest: "laerm_night" },
        legend: {
            label: "Lärm (Nacht) anzeigen",
            tip: "Quelle: Umweltbundesamt-DE – Lizenz: dl-by-de/2.0",
            vintageAttr: "laerm-vintage",
            heading: "Nacht-Lärmindex",
            note: "LNIGHT",
            stops: [
                { color: "#A6AD88", text: "50 – 54 dB(A)" },
                { color: "#B89C63", text: "55 – 59 dB(A)" },
                { color: "#994848", text: "60 – 64 dB(A)" },
                { color: "#4B244A", text: "65 – 69 dB(A)" },
                { color: "#2F0037", text: "> 70 dB(A)" },
            ],
        },
        layers: [
            {
              id: "laerm2",
              type: "fill",
              "source-layer": "laerm_4120_hlq_night-polys",
              filter: ["==", ["geometry-type"], "Polygon"],
              paint: {
                "fill-color": [
                  "match",
                  ["get", "Lärmpegelklasse"],
                  "Lnight5054", "#A6AD88",
                  "Lnight5559", "#B89C63",
                  "Lnight6064", "#994848",
                  "Lnight6569", "#4B244A",
                  "LnightGreaterThan70", "#2F0037",
                /* default */ "#999999"
                ],
                "fill-opacity": 0.6,
                "fill-outline-color": "#1B4D3E"
              }
            }
        ],
        permalink: "r", dataMinZoom: 9,
        popups: [{
            eyebrow: "UBA",
            render: (p) => `
                <div class="pop-title">Lärm · Nacht</div>
                <div class="pop-hero">${lnightLabels[p.Lärmpegelklasse] || p.Lärmpegelklasse || "—"}</div>
                <div class="pop-meta">L<sub>night</sub> · Hauptlärmquelle · © UBA</div>`
        }]
    },
];
