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
        layers: ["laerm1"],
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
        layers: ["laerm2"],
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
