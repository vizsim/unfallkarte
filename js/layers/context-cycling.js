// Kontext-Layer Radverkehr: OpenBikeSensor-Überholabstände, Stadtradeln (movebis).

// OBS-Zone -> [Label, gesetzlicher Mindestabstand in m]
const zoneMap = { urban: ["innerorts", 1.5], innerorts: ["innerorts", 1.5], rural: ["außerorts", 2.0], "außerorts": ["außerorts", 2.0] };

/** @type {import("./registry.js").LayerEntry[]} */
export default [
    {
        id: "obs", kind: "context",
        source: { id: "obs", manifest: "obs" },
        layers: [
            {
              id: "obs",
              type: "circle",
              "source-layer": "obs_data-points",
              layout: { visibility: "none" },
              filter: [">=", ["to-number", ["get", "distance_overtaker"]], 0.2],
              paint: {
                "circle-color": [
                  "case",

                  // --- Urban color ramp ---
                  ["==", ["get", "zone"], "urban"],
                  [
                    "interpolate",
                    ["linear"],
                    ["to-number", ["get", "distance_overtaker"]],
                    1.1, "#67000d",   // very dark red
                    1.3, "#ef3b2c",   // red
                    1.5, "#fdbf6f",   // yellow
                    1.7, "#a1d99b",   // light green
                    1.9, "#31a354"    // green
                  ],

                  // --- Rural color ramp ---
                  ["==", ["get", "zone"], "rural"],
                  [
                    "interpolate",
                    ["linear"],
                    ["to-number", ["get", "distance_overtaker"]],
                    1.6, "#67000d",   // very dark red
                    1.8, "#ef3b2c",   // red
                    2.0, "#fdbf6f",   // yellow
                    2.2, "#a1d99b",   // light green
                    2.4, "#31a354"    // green
                  ],

                  // --- Fallback color ---
                  "#cccccc"
                ],
                "circle-radius": 4
              }
            }
        ],
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
        layers: [
            {
              id: "movebis",
              type: "line",
              "source-layer": "links",
              layout: { visibility: "none" },
              paint: {
                "line-color": [
                  "interpolate",
                  ["linear"],
                  ["get", "avg_speed_kmh"],
                  12, "#e31a1c",
                  18, "#fdcc8a",
                  24, "#31a354"
                ],
                // Breite = visits-basiert, zusätzlich bei niedrigem Zoom global schmaler
                // (z9 ~35 % → z14 volle Breite). Zoom MUSS die äußerste Interpolate sein
                // (MapLibre erlaubt ["zoom"] nur top-level) → visits-Rampe je Zoom-Stop skaliert.
                "line-width": [
                  "interpolate", ["linear"], ["zoom"],
                  9, ["interpolate", ["linear"], ["get", "visits"], 0, 0.13, 10, 0.5, 50, 1.0, 100, 2.0, 1000, 3.0],
                  11, ["interpolate", ["linear"], ["get", "visits"], 0, 0.2, 10, 0.8, 50, 1.6, 100, 3.2, 1000, 4.8],
                  14, ["interpolate", ["linear"], ["get", "visits"], 0, 0.5, 10, 2, 50, 4, 100, 8, 1000, 12]
                ]
              }
            }
        ],
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
