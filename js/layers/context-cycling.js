// Kontext-Layer Radverkehr: OpenBikeSensor-Überholabstände, Stadtradeln (movebis).

// OBS-Zone -> [Label, gesetzlicher Mindestabstand in m]
const zoneMap = { urban: ["innerorts", 1.5], innerorts: ["innerorts", 1.5], rural: ["außerorts", 2.0], "außerorts": ["außerorts", 2.0] };

/** @type {import("./registry.js").LayerEntry[]} */
export default [
    {
        id: "obs", kind: "context",
        source: { id: "obs", manifest: "obs" },
        layers: ["obs"],
        permalink: "o", dataMinZoom: 9,
        popups: [{
            eyebrow: "OpenBikeSensor",
            render: (p) => {
                const speed = p.speed != null ? (p.speed * 3.6).toFixed(1) + " km/h" : null;
                const [zoneLabel, minDist] = zoneMap[String(p.zone).toLowerCase()] || [p.zone, null];
                const dist = p.distance_overtaker != null ? Number(p.distance_overtaker) : null;
                const heroVal = dist != null ? `${dist.toFixed(2).replace(".", ",")} m` : "—";
                const under = (dist != null && minDist != null && dist < minDist) ? ` <span class="pop-note">unter Mindestabstand</span>` : "";
                const zoneMeta = zoneLabel ? `${zoneLabel}${minDist ? ` · Mindestabstand ${String(minDist).replace(".", ",")} m` : ""}` : null;
                const metaBits = [speed, zoneMeta].filter(Boolean).join(" · ");
                return `
                    <div class="pop-title">Überholabstand</div>
                    <div class="pop-hero">${heroVal}${under}</div>
                    ${metaBits ? `<div class="pop-meta">${metaBits}</div>` : ""}`;
            }
        }]
    },
    {
        id: "movebis", kind: "context",
        source: { id: "movebis", manifest: "movebis" },
        layers: ["movebis"],
        permalink: "b", dataMinZoom: 9,
        popups: [{
            eyebrow: "Stadtradeln",
            render: (p) => `
                <div class="pop-title">Stadtradeln 2020</div>
                <table class="pop-table">
                    <tr><td>Anzahl</td><td>${p.visits ?? "-"}</td></tr>
                    <tr><td>Ø Geschwindigkeit</td><td>${p.avg_speed_kmh != null ? parseFloat(p.avg_speed_kmh).toFixed(1) + " km/h" : "-"}</td></tr>
                </table>`
        }]
    },
];
