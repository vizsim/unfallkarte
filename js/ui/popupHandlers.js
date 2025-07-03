
// popupHandlers.js


// Beteiligung Popup Handler

const translations = {
    UKATEGORIE: {
        1: "Getötete",
        2: "Schwerverletzte",
        3: "Leichtverletzte"
    },
    UART: {
        1: "Anfahrend/ruhend",
        2: "Vorausfahrend/wartend",
        3: "Seitlich gleiche Richtung",
        4: "Entgegenkommend",
        5: "Einbiegend/kreuzend",
        6: "Fußgänger",
        7: "Fahrbahnhindernis",
        8: "Abkommen rechts",
        9: "Abkommen links",
        0: "Sonstiger Unfall"
    },
    UTYP1: {
        1: "Fahrunfall",
        2: "Abbiegeunfall",
        3: "Einbiegen/Kreuzen",
        4: "Fußgänger (Überschreiten)",
        5: "Ruhender Verkehr",
        6: "Längsverkehr",
        7: "Sonstiger Unfall"
    }
};

const weekdayNames = ["?", "Sonntag", "Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag"];
const monthNames = ["?", "Januar", "Februar", "März", "April", "Mai", "Juni", "Juli", "August", "September", "Oktober", "November", "Dezember"];

export function setupAccidentPopups(map) {
    const popup = new maplibregl.Popup({ closeButton: false, closeOnClick: false });

    // const layers = ["accident-points-11-12", "accident-points-12-13"];
    const layers = ["accident-points"];


    layers.forEach(layerId => {
        map.on("mousemove", layerId, (e) => {
            const feature = e.features[0];
            const props = feature.properties;

            const labels = {
                OBJECTID: "Unfall-ID",
                UKATEGORIE: "Schwere",
                UART: "Unfallart",
                UTYP1: "Unfalltyp",
                UJAHR: "Jahr",
                UMONAT: "Monat",
                UWOCHENTAG: "Wochentag",
                USTUNDE: "Stunde"
            };

            const propsToShow = ["OBJECTID", "UKATEGORIE", "UJAHR", "UMONAT", "UWOCHENTAG", "USTUNDE", "UART", "UTYP1"];

            let rows = propsToShow.map(key => {
                const label = labels[key] || key;
                let value = props[key];
                if (key === "UWOCHENTAG" && value != null) value = `${weekdayNames[value]} (${value})`;
                if (key === "UMONAT" && value != null) value = `${monthNames[value]} (${value})`;
                if (translations[key] && value in translations[key]) {
                    value = `${translations[key][value]} (${value})`;
                } else if (value == null) {
                    value = "?";
                }
                return `<tr><td><strong>${label}</strong></td><td>${value}</td></tr>`;
            }).join("");

            const beteiligungLabels = {
                IstRad: "Fahrrad",
                IstPKW: "Pkw",
                IstFuss: "Fußgänger",
                IstKrad: "Kraftrad",
                IstGkfz: "Güterkraftfahrzeug (GKFZ)",
                IstSonstig: "Sonstige"
            };

            const beteiligte = Object.entries(beteiligungLabels)
                .filter(([key]) => props[key] === 1)
                .map(([, label]) => label);

            if (beteiligte.length > 0) {
                rows += `<tr><td><strong>Beteiligung</strong></td><td>${beteiligte.join(", ")}</td></tr>`;
            }

            const content = `<table style="border-collapse: collapse; font-size: 12px;">${rows}</table>`;
            popup.setLngLat(e.lngLat).setHTML(content).addTo(map);
            map.getCanvas().style.cursor = "pointer";
        });

        map.on("mouseleave", layerId, () => {
            map.getCanvas().style.cursor = "";
            popup.remove();
        });
    });
}


export function setupAccClusterPopups(map) {
    const popup = new maplibregl.Popup({ closeButton: false, closeOnClick: false });
    let hoveredFeatureId = null;

    map.on("mousemove", (e) => {
        const features = map.queryRenderedFeatures(e.point, {
            layers: ["pie-clusters-fine-layer", "pie-clusters-coarse-layer"]
        });

        if (features.length > 0) {
            const f = features[0];
            const id = f.id || JSON.stringify(f.properties);

            if (id !== hoveredFeatureId) {
                hoveredFeatureId = id;

                const k1 = f.properties.UKATEGORIE__1 || 0;
                const k2 = f.properties.UKATEGORIE__2 || 0;
                const k3 = f.properties.UKATEGORIE__3 || 0;
                const total = k1 + k2 + k3;

                const html = `
          <div><strong>Anzahl nach Unfall-Kategorie</strong></div>
          <table style="font-size:12px; border-collapse:collapse;">
            <tr><td style="padding-right:8px;"><strong>Getötete</strong></td><td style="text-align:right;">${k1}</td></tr>
            <tr><td style="padding-right:8px;"><strong>Schwerverletzte</strong></td><td style="text-align:right;">${k2}</td></tr>
            <tr><td style="padding-right:8px;"><strong>Leichtverletzte</strong></td><td style="text-align:right;">${k3}</td></tr>
            <tr><td style="padding-right:8px;"><strong>Gesamt</strong></td><td style="text-align:right;"><strong>${total}</strong></td></tr>
          </table>
        `;

                map.getCanvas().style.cursor = "pointer";
                popup.setLngLat(e.lngLat).setHTML(html).addTo(map);
                map.getSource("hover-point").setData({ type: "FeatureCollection", features: [f] });
            }
        } else {
            if (hoveredFeatureId !== null) {
                hoveredFeatureId = null;
                popup.remove();
                map.getCanvas().style.cursor = "";
                map.getSource("hover-point").setData({ type: "FeatureCollection", features: [] });
            }
        }
    });
}





export function setupMovebisPopups(map) {
    const popup = new maplibregl.Popup({ closeButton: false, closeOnClick: false });

    map.on("mousemove", "movebis", (e) => {
        map.getCanvas().style.cursor = "pointer";
        const props = e.features[0].properties;

        const visits = props.visits ?? "-";
        const speed = props.avg_speed_kmh != null ? parseFloat(props.avg_speed_kmh).toFixed(1) + " km/h" : "-";

        const content = `
    <div style="font-size: 12px;">
        <strong>Stadtradeln</strong><br/>
        <table style="border-collapse: collapse;">
            <tr><td><strong>Anzahl: </strong></td><td>${visits}</td></tr>
            <tr><td><strong>Ø Geschwindigkeit: </strong></td><td>${speed}</td></tr>
        </table>
    </div>`;

        popup.setLngLat(e.lngLat).setHTML(content).addTo(map);
    });

    map.on("mouseleave", "movebis", () => {
        map.getCanvas().style.cursor = "";
        popup.remove();
    });
}


export function setupOBSPopups(map) {
    const popup = new maplibregl.Popup({ closeButton: false, closeOnClick: false });

    map.on("mousemove", "obs", (e) => {
        map.getCanvas().style.cursor = "pointer";
        const props = e.features[0].properties;

        const overtaker = props.distance_overtaker != null ? props.distance_overtaker.toFixed(2) + " m" : "-";
        const speed = props.speed != null ? (props.speed * 3.6).toFixed(1) + " km/h" : "-"; const zone = props.zone ?? "-";

        const content = `
    <div style="font-size: 12px;">
        <strong>Beobachtung</strong><br/>
        <table style="border-collapse: collapse;">
            <tr><td><strong>Überholabstand: </strong></td><td>${overtaker}</td></tr>
            <tr><td><strong>Geschwindigkeit: </strong></td><td>${speed}</td></tr>
            <tr><td><strong>Zone: </strong></td><td>${zone}</td></tr>
 
        </table>
    </div>`;

        popup.setLngLat(e.lngLat).setHTML(content).addTo(map);
    });

    map.on("mouseleave", "obs", () => {
        map.getCanvas().style.cursor = "";
        popup.remove();
    });
}




export function setupHVSPopups(map) {
    const popup = new maplibregl.Popup({ closeButton: false, closeOnClick: false });

    map.on("mousemove", "hvs", (e) => {
        map.getCanvas().style.cursor = "pointer";
        const props = e.features[0].properties;

        const flow = Number(props.annualTrafficFlow);
        const formattedFlow = isNaN(flow)
            ? "?"
            : `${(flow / 1_000_000).toFixed(1).replace(".", ",")} Mio`;

        const dailyFlow = isNaN(flow)
            ? "?"
            : `${(Math.round(flow / 365 / 1000) * 1000).toLocaleString("de-DE")} Fzg`;

        const content = `
        <div style="font-size: 12px;">
            <strong>Verkehrsmengen</strong><br/>
            <table style="border-collapse: collapse;">
            <tr><td><strong>Annual Traffic: </strong></td><td>${formattedFlow}</td></tr>
            <tr><td><strong>Est. daily Traffic: </strong></td><td>~${dailyFlow}</td></tr>
            </table>
        </div>
        `;

        popup.setLngLat(e.lngLat).setHTML(content).addTo(map);
    });

    map.on("mouseleave", "hvs", () => {
        map.getCanvas().style.cursor = "";
        popup.remove();
    });
}

export function setupMaxspeedPopups(map) {
    const popup = new maplibregl.Popup({ closeButton: false, closeOnClick: false });

    ["maxspeed",
        "maxspeed-conditional",
        "maxspeed-forward",
        "maxspeed-backward",
        "maxspeed-conditional-forward",
        "maxspeed-conditional-backward",
        "maxspeed_minor",
        "maxspeed_minor-conditional",
        "maxspeed_minor-forward",
        "maxspeed_minor-backward",
        "maxspeed_minor-conditional-forward",
        "maxspeed_minor-conditional-backward"
    ].forEach((layerId) => {
        map.on("mousemove", layerId, (e) => {
            map.getCanvas().style.cursor = "pointer";
            const props = e.features[0].properties;
            // const speed = Number(props.maxspeed);
            // const formattedSpeed = isNaN(speed) ? "?" : `${speed} km/h`;
            //  <tr><td><strong>maxspeed</strong></td><td>${formattedSpeed}</td></tr> 
            const content = `
            <div style="font-size: 12px;">
            <strong>OSM (insb. maxspeed infos)</strong><br/>
            <table style="border-collapse: collapse;">
                <tr><td><strong>maxspeed</strong></td><td>${props.maxspeed || "-"}</td></tr>
                <tr><td><strong>maxspeed:conditional</strong></td><td>${props.maxspeed_conditional || "-"}</td></tr>
                <tr><td><strong>maxspeed:type</strong></td><td>${props.maxspeed_type || "-"}</td></tr>
                <tr><td><strong>maxspeed:forward</strong></td><td>${props.maxspeed_forward || "-"}</td></tr>
                <tr><td><strong>maxspeed:backward</strong></td><td>${props.maxspeed_backward || "-"}</td></tr>
                <tr><td><strong>ref</strong></td><td>${props.ref || "-"}</td></tr>
                <tr><td><strong>name</strong></td><td>${props.name || "-"}</td></tr>
                <tr><td><strong>highway</strong></td><td>${props.highway || "-"}</td></tr>
                <tr><td><strong>osm_id</strong></td><td>${props.osm_id || "-"}</td></tr>
            </table>
            </div>
        `;

            popup.setLngLat(e.lngLat).setHTML(content).addTo(map);
        });

        map.on("mouseleave", layerId, () => {
            map.getCanvas().style.cursor = "";
            popup.remove();
        });

        map.on("click", layerId, (e) => {
            const osmId = e.features[0].properties.osm_id;
            if (osmId) window.open(`https://www.openstreetmap.org/way/${osmId}`, "_blank");
        });
    });
}



export function setupUspeedPopups(map) {
    const popup = new maplibregl.Popup({ closeButton: false, closeOnClick: false });

    const uspeedLayers = ["uspeed-forward", "uspeed-reverse"];
    //const uspeedLayers = ["uspeed"];


    for (const layer of uspeedLayers) {
        map.on("mousemove", layer, (e) => {
            map.getCanvas().style.cursor = "pointer";
            const p = e.features[0].properties;

            const content = `
        <div style="font-size: 12px;">
            <strong>Segment Details</strong><br/>
            <table style="border-collapse: collapse;">
                <tr><td><strong>OSM Way ID:</strong></td><td>${p.osm_way_id}</td></tr>
                <tr><td><strong>Start Node:</strong></td><td>${p.osm_start_node_id}</td></tr>
                <tr><td><strong>End Node:</strong></td><td>${p.osm_end_node_id}</td></tr>
                <tr><td><strong>Hour:</strong></td><td>${p.hour_of_day}</td></tr>
                <tr><td><strong>Avg. Speed:</strong></td><td>${Number(p.speed_kph_mean).toFixed(1)} km/h</td></tr>
                <tr><td><strong>Direction:</strong></td><td>${p.reconstruction_direction}</td></tr>               
            </table>
        </div>
      `;

            popup.setLngLat(e.lngLat).setHTML(content).addTo(map);
        });

        map.on("mouseleave", layer, () => {
            map.getCanvas().style.cursor = "";
            popup.remove();
        });
    }
    map.on("click", "uspeed-forward", (e) => showUspeedChartPopup(e));
    map.on("click", "uspeed-reverse", (e) => showUspeedChartPopup(e));
}

function showUspeedChartPopup(e) {
    const feature = e.features[0];
    const osmId = feature.properties.osm_way_id;
    const startNode = feature.properties.osm_start_node_id;
    const endNode = feature.properties.osm_end_node_id;

    const allFeatures = map.querySourceFeatures("uspeed", {
        sourceLayer: "uber_movement_osm"
    }).filter(f =>
        f.properties.osm_way_id === osmId &&
        f.properties.osm_start_node_id === startNode &&
        f.properties.osm_end_node_id === endNode
    );

    const hourlySpeeds = Array(24).fill(null);
    for (const f of allFeatures) {
        const hour = parseInt(f.properties.hour_of_day);
        hourlySpeeds[hour] = Number(f.properties.speed_kph_mean);
    }

    const container = document.createElement("div");
    container.innerHTML = `<canvas id="speed-chart" width="320" height="180"></canvas>`;

    const popup = new maplibregl.Popup()
        .setLngLat(e.lngLat)
        .setDOMContent(container)
        .addTo(map);

    setTimeout(() => {
        new Chart(document.getElementById("speed-chart"), {
            type: "line",
            data: {
                labels: [...Array(24).keys()],
                datasets: [{
                    label: "Ø Geschwindigkeit (km/h) je h",
                    data: hourlySpeeds,
                    borderColor: "#0074D9",
                    backgroundColor: "rgba(0, 116, 217, 0.1)",
                    borderWidth: 1.5,
                    pointRadius: 2,
                    tension: 0.3
                }]
            },
            options: {
                layout: {
                    padding: 4
                },
                scales: {
                    x: {
                        title: {
                            display: false // ← Optional: ganz weglassen
                        },
                        ticks: {
                            font: { size: 9 },
                            padding: 2,
                            maxRotation: 0,
                            autoSkipPadding: 2
                        }
                    },
                    y: {
                        title: {
                            display: false // ← Optional: ganz weglassen
                        },
                        ticks: {
                            font: { size: 9 },
                            padding: 2,
                            precision: 0
                        },
                        suggestedMin: 0
                    }
                },
                plugins: {
                    legend: {
                        display: true,
                        labels: {
                            boxWidth: 0,
                            font: { size: 11, weight: "bold" },
                            padding: 4
                        }
                    },
                    tooltip: {
                        callbacks: {
                            title: ctx => `${ctx[0].label} Uhr`,
                            label: ctx => `${ctx.parsed.y.toFixed(1)} km/h`
                        }
                    }
                }
            }
        });
    }, 50);
}




export function setupSchoolsPopups(map) {
    const popup = new maplibregl.Popup({ closeButton: false, closeOnClick: false });

    const handleLayer = (layerId) => {
        map.on("mouseenter", layerId, (e) => {
            map.getCanvas().style.cursor = "pointer";
            const props = e.features[0].properties;

            const content = `
            <table style="font-size:12px; border-collapse:collapse;">
            ${props.name ? `<tr><td><strong>Name</strong></td><td>${props.name}</td></tr>` : ""}
            ${props.amenity ? `<tr><td><strong>Amenity</strong></td><td>${props.amenity}</td></tr>` : ""}
            ${props.isced_level ? `<tr><td><strong>ISCED</strong></td><td>${props.isced_level}</td></tr>` : ""}
            ${props.osm_way_id ? `<tr><td><strong>OSM Way ID</strong></td><td>${props.osm_way_id}</td></tr>` : ""}
            ${props.osm_id ? `<tr><td><strong>OSM ID</strong></td><td>${props.osm_id}</td></tr>` : ""}
            </table>
        `;

            popup.setLngLat(e.lngLat).setHTML(content).addTo(map);
        });

        map.on("mouseleave", layerId, () => {
            map.getCanvas().style.cursor = "";
            popup.remove();
        });
    };

    handleLayer("schools-points");
    handleLayer("schools-polygons");
}

export function setupHealthPopups(map) {
    const popup = new maplibregl.Popup({ closeButton: false, closeOnClick: false });

    const handleLayer = (layerId) => {
        map.on("mouseenter", layerId, (e) => {
            map.getCanvas().style.cursor = "pointer";
            const props = e.features[0].properties;

            const content = `
        <table style="font-size:12px; border-collapse:collapse;">
          ${props.name ? `<tr><td><strong>Name</strong></td><td>${props.name}</td></tr>` : ""}
          ${props.amenity ? `<tr><td><strong>Amenity</strong></td><td>${props.amenity}</td></tr>` : ""}
          ${props.healthcare ? `<tr><td><strong>Healthcare</strong></td><td>${props.healthcare}</td></tr>` : ""}
          ${props["healthcare:speciality"] ? `<tr><td><strong>Fachgebiet</strong></td><td>${props["healthcare:speciality"]}</td></tr>` : ""}
          ${props.social_facility ? `<tr><td><strong>Einrichtung</strong></td><td>${props.social_facility}</td></tr>` : ""}
          ${props["social_facility:for"] ? `<tr><td><strong>Zielgruppe</strong></td><td>${props["social_facility:for"]}</td></tr>` : ""}
          ${props.operator ? `<tr><td><strong>Träger</strong></td><td>${props.operator}</td></tr>` : ""}
          ${props.osm_way_id ? `<tr><td><strong>OSM Way ID</strong></td><td>${props.osm_way_id}</td></tr>` : ""}
          ${props.osm_id ? `<tr><td><strong>OSM ID</strong></td><td>${props.osm_id}</td></tr>` : ""}
        </table>
      `;

            popup.setLngLat(e.lngLat).setHTML(content).addTo(map);
        });

        map.on("mouseleave", layerId, () => {
            map.getCanvas().style.cursor = "";
            popup.remove();
        });
    };

    handleLayer("health-points");
    handleLayer("health-polygons");
}


export function setupPlaygroundsPopups(map) {
    const popup = new maplibregl.Popup({ closeButton: false, closeOnClick: false });

    const handleLayer = (layerId) => {
        map.on("mouseenter", layerId, (e) => {
            map.getCanvas().style.cursor = "pointer";
            const props = e.features[0].properties;

            const content = `
                <table style="font-size:12px; border-collapse:collapse;">
                    ${props.leisure ? `<tr><td><strong>Leisure</strong></td><td>${props.leisure}</td></tr>` : ""}
                    ${props.name ? `<tr><td><strong>Name</strong></td><td>${props.name}</td></tr>` : ""}
                    ${props.amenity ? `<tr><td><strong>Amenity</strong></td><td>${props.amenity}</td></tr>` : ""}
                    ${props.playground ? `<tr><td><strong>Playground Type</strong></td><td>${props.playground}</td></tr>` : ""}
                    ${props.operator ? `<tr><td><strong>Träger</strong></td><td>${props.operator}</td></tr>` : ""}
                    ${props.osm_way_id ? `<tr><td><strong>OSM Way ID</strong></td><td>${props.osm_way_id}</td></tr>` : ""}
                    ${props.osm_id ? `<tr><td><strong>OSM ID</strong></td><td>${props.osm_id}</td></tr>` : ""}
                </table>
            `;

            popup.setLngLat(e.lngLat).setHTML(content).addTo(map);
        });

        map.on("mouseleave", layerId, () => {
            map.getCanvas().style.cursor = "";
            popup.remove();
        });
    };

    handleLayer("playgrounds-points");
    handleLayer("playgrounds-polygons");
}


export function setupLaerm1Popups(map) {
    const popup = new maplibregl.Popup({
        closeButton: false,
        closeOnClick: false
    });

    const laermpegelklasseLabels = {
        Lden5559: "55 – 59 dB(A)",
        Lden6064: "60 – 64 dB(A)",
        Lden6569: "65 – 69 dB(A)",
        Lden7074: "70 – 74 dB(A)",
        LdenGreaterThan75: "> 75 dB(A)"
    };

    const handleLayer = (layerId) => {
        map.on("mousemove", layerId, (e) => {
            map.getCanvas().style.cursor = "pointer";
            const props = e.features[0].properties;
            const readableClass = laermpegelklasseLabels[props.Lärmpegelklasse] || props.Lärmpegelklasse;

            const content = `
                <div style="font-size:12px;">
                    <strong>Lärmbelastung (Tag, HLQ)</strong><br/>
                    <table style="font-size:12px; border-collapse:collapse;">
                        ${props.Lärmpegelklasse ? `<tr><td><strong>Lärmpegelklasse</strong></td><td>${readableClass}</td></tr>` : ""}
                    </table>
                </div>
            `;
            // const content = `
            //     <table style="font-size:12px; border-collapse:collapse;">
            //         ${props.OBJECTID ? `<tr><td><strong>OBJECTID</strong></td><td>${props.OBJECTID}</td></tr>` : ""}
            //         ${props.id ? `<tr><td><strong>ID</strong></td><td>${props.id}</td></tr>` : ""}
            //         ${props.Lärmpegelklasse ? `<tr><td><strong>Lärmpegelklasse</strong></td><td>${readableClass}</td></tr>` : ""}
            //         ${props.source ? `<tr><td><strong>Quelle</strong></td><td>${props.source}</td></tr>` : ""}
            //     </table>
            // `;

            popup.setLngLat(e.lngLat).setHTML(content).addTo(map);
        });

        map.on("mouseleave", layerId, () => {
            map.getCanvas().style.cursor = "";
            popup.remove();
        });
    };

    handleLayer("laerm1");
}

export function setupLaerm2Popups(map) {
    const popup = new maplibregl.Popup({
        closeButton: false,
        closeOnClick: false
    });

    const laermpegelklasseLabels = {
        Lnight5054: "50 – 54 dB(A)",
        Lnight5559: "55 – 59 dB(A)",
        Lnight6064: "60 – 64 dB(A)",
        Lnight6569: "65 – 69 dB(A)",
        LnightGreaterThan70: "> 70 dB(A)"
    };

    const handleLayer = (layerId) => {
        map.on("mousemove", layerId, (e) => {
            map.getCanvas().style.cursor = "pointer";
            const props = e.features[0].properties;
            const readableClass = laermpegelklasseLabels[props.Lärmpegelklasse] || props.Lärmpegelklasse;

            const content = `
                <div style="font-size:12px;">
                    <strong>Lärmbelastung (Nacht, HLQ)</strong><br/>
                    <table style="font-size:12px; border-collapse:collapse;">
                        ${props.Lärmpegelklasse ? `<tr><td><strong>Lärmpegelklasse</strong></td><td>${readableClass}</td></tr>` : ""}
                    </table>
                </div>
            `;
            popup.setLngLat(e.lngLat).setHTML(content).addTo(map);
        });

        map.on("mouseleave", layerId, () => {
            map.getCanvas().style.cursor = "";
            popup.remove();
        });
    };

    handleLayer("laerm2");
}





// export function setupMapillaryPopups(map) {
//   const popup = new maplibregl.Popup({ closeButton: false, closeOnClick: false });

//   map.on("mousemove", "mapillary-images-layer", (e) => {
//     map.getCanvas().style.cursor = "pointer";
//     const props = e.features[0].properties;

//     // Dynamically list all properties
//     const rows = Object.entries(props).map(([key, val]) => {
//       return `<tr><td><strong>${key}</strong></td><td>${val ?? "-"}</td></tr>`;
//     }).join("");

//     const content = `
//       <div style="font-size: 12px;">
//         <strong>Mapillary Punkt</strong>
//         <table style="border-collapse: collapse; margin-top: 4px;">
//           ${rows}
//         </table>
//       </div>
//     `;

//     popup.setLngLat(e.lngLat).setHTML(content).addTo(map);
//   });

//   map.on("mouseleave", "mapillary-images-layer", () => {
//     map.getCanvas().style.cursor = "";
//     popup.remove();
//   });
// }




export function setupScenario1Popups(map) {
    const popup = new maplibregl.Popup({ closeButton: false, closeOnClick: false });

    const renderScenario1Tooltip = (props) => `
    <div style="font-size: 12px;">
      <strong>Szenario 1</strong><br/>
      <table style="border-collapse: collapse;">
        ${props.cluster_size !== undefined ? `<tr><td><strong>Cluster-Größe</strong></td><td>${props.cluster_size}</td></tr>` : ""}
        ${props.UKATEGORIE__1 !== undefined ? `<tr><td><strong># Getötete</strong></td><td>${props.UKATEGORIE__1}</td></tr>` : ""}
        ${props.UKATEGORIE__2 !== undefined ? `<tr><td><strong># Schwerverletzte</strong></td><td>${props.UKATEGORIE__2}</td></tr>` : ""}
        ${props.UKATEGORIE__3 !== undefined ? `<tr><td><strong># Leichtverletzte</strong></td><td>${props.UKATEGORIE__3}</td></tr>` : ""}
      </table>
    </div>
  `;

    ["scenario1-polys", "scenario1-points"].forEach((layerId) => {
        map.on("mousemove", layerId, (e) => {
            const html = renderScenario1Tooltip(e.features[0].properties);
            popup.setLngLat(e.lngLat).setHTML(html).addTo(map);
            map.getCanvas().style.cursor = "pointer";
        });

        map.on("mouseleave", layerId, () => {
            popup.remove();
            map.getCanvas().style.cursor = "";
        });
    });
}


export function setupScenario2Popups(map) {
    const popup = new maplibregl.Popup({ closeButton: false, closeOnClick: false });

    const renderScenario2Tooltip = (props) => `
        <div style="font-size: 12px;">
          <strong>Szenario 2</strong><br/>
          <table style="border-collapse: collapse;">
            ${props.name ? `<tr><td><strong>Name</strong></td><td>${props.name}</td></tr>` : ""}
            ${props.amenity ? `<tr><td><strong>Amenity</strong></td><td>${props.amenity}</td></tr>` : ""}
            ${props.source_layer ? `<tr><td><strong>Source Layer</strong></td><td>${props.source_layer}</td></tr>` : ""}
            ${props.osm_way_id ? `<tr><td><strong>OSM Way ID</strong></td><td>${props.osm_way_id}</td></tr>` : ""}
            ${props.oid ? `<tr><td><strong>OID</strong></td><td>${props.oid}</td></tr>` : ""}
            ${props.total_count !== undefined ? `<tr><td><strong>Total Count</strong></td><td>${props.total_count}</td></tr>` : ""}
            ${props.biped_counts !== undefined ? `<tr><td><strong>Biped Count</strong></td><td>${props.biped_counts}</td></tr>` : ""}
            ${props.bike_count !== undefined ? `<tr><td><strong>Bike Count</strong></td><td>${props.bike_count}</td></tr>` : ""}
            ${props.ped_count !== undefined ? `<tr><td><strong>Ped Count</strong></td><td>${props.ped_count}</td></tr>` : ""}
          </table>
        </div>
      `;

    ["scenario2-polys", "scenario2-points"].forEach((layerId) => {
        map.on("mousemove", layerId, (e) => {
            const html = renderScenario2Tooltip(e.features[0].properties);
            popup.setLngLat(e.lngLat).setHTML(html).addTo(map);
            map.getCanvas().style.cursor = "pointer";
        });

        map.on("mouseleave", layerId, () => {
            popup.remove();
            map.getCanvas().style.cursor = "";
        });
    });
}


// Scenario 3 popups
export function setupScenario3Popups(map) {
    const popup = new maplibregl.Popup({ closeButton: false, closeOnClick: false });

    const renderScenario3Tooltip = (props) => `
        <div style="font-size: 12px;">
          <strong>Szenario 3</strong><br/>
          <table style="border-collapse: collapse;">
            <tr><td><strong>maxspeed</strong></td><td>${props.maxspeed ?? "-"}</td></tr>
            <tr><td><strong>Name</strong></td><td>${props.name ?? "-"}</td></tr>
            <tr><td><strong>Länge (m)</strong></td><td>${props.length_m !== undefined ? Number(props.length_m).toFixed(2) : "-"}</td></tr>
          </table>
        </div>
      `;

    ["scenario3-polys", "scenario3-points"].forEach((layerId) => {
        map.on("mousemove", layerId, (e) => {
            const html = renderScenario3Tooltip(e.features[0].properties);
            popup.setLngLat(e.lngLat).setHTML(html).addTo(map);
            map.getCanvas().style.cursor = "pointer";
        });

        map.on("mouseleave", layerId, () => {
            popup.remove();
            map.getCanvas().style.cursor = "";
        });
    });
}


// Scenario 4 popups
export function setupScenario4Popups(map) {
    const popup = new maplibregl.Popup({ closeButton: false, closeOnClick: false });

    const renderScenario4Tooltip = (props) => `
        <div style="font-size: 12px;">
          <strong>Szenario 4</strong><br/>
          <table style="border-collapse: collapse;">
            <tr><td><strong>Feature_ID</strong></td><td>${props.id ?? "-"}</td></tr>
            <tr><td><strong>Image_ID</strong></td><td>${props.image_id ?? "-"}</td></tr>
            <tr><td><strong>First Seen At</strong></td><td>${props.first_seen_at ?? "-"}</td></tr>
            <tr><td><strong>Last Seen At</strong></td><td>${props.last_seen_at ?? "-"}</td></tr>
            <tr><td><strong>Value</strong></td><td>${props.value ?? "-"}</td></tr>
            <tr><td><strong>Has 30 Intersection</strong></td><td>${props.has_30_intersection === true ? "Ja" : props.has_30_intersection === false ? "Nein" : "-"}</td></tr>
          </table>
        </div>
      `;

    ["scenario4-polys", "scenario4-points"].forEach((layerId) => {
        map.on("mousemove", layerId, (e) => {
            const html = renderScenario4Tooltip(e.features[0].properties);
            popup.setLngLat(e.lngLat).setHTML(html).addTo(map);
            map.getCanvas().style.cursor = "pointer";
        });

        map.on("mouseleave", layerId, () => {
            popup.remove();
            map.getCanvas().style.cursor = "";
        });

        map.on("click", layerId, (e) => {
            const image_id = e.features[0].properties.image_id;
            if (image_id) window.open(`https://www.mapillary.com/app/?pKey=${image_id}&trafficSign[]=regulatory--maximum-speed-limit-30--g1`, "_blank");
        });
    });
}


// Scenario 5 popups
export function setupScenario5Popups(map) {
    const popup = new maplibregl.Popup({ closeButton: false, closeOnClick: false });

    const renderScenario5Tooltip = (props) => `
        <div style="font-size: 12px;">
          <strong>Szenario 4</strong><br/>
          <table style="border-collapse: collapse;">
            <tr><td><strong>Feature_ID</strong></td><td>${props.id ?? "-"}</td></tr>
            <tr><td><strong>Image_ID</strong></td><td>${props.image_id ?? "-"}</td></tr>
            <tr><td><strong>First Seen At</strong></td><td>${props.first_seen_at ?? "-"}</td></tr>
            <tr><td><strong>Last Seen At</strong></td><td>${props.last_seen_at ?? "-"}</td></tr>
            <tr><td><strong>Value</strong></td><td>${props.value ?? "-"}</td></tr>
          </table>
        </div>
      `;

    ["scenario5-polys", "scenario5-points"].forEach((layerId) => {
        map.on("mousemove", layerId, (e) => {
            const html = renderScenario5Tooltip(e.features[0].properties);
            popup.setLngLat(e.lngLat).setHTML(html).addTo(map);
            map.getCanvas().style.cursor = "pointer";
        });

        map.on("mouseleave", layerId, () => {
            popup.remove();
            map.getCanvas().style.cursor = "";
        });

        map.on("click", layerId, (e) => {
            const image_id = e.features[0].properties.image_id;
            if (image_id) window.open(`https://www.mapillary.com/app/?pKey=${image_id}&trafficSign[]=information--pedestrians-crossing--g1`, "_blank");
        });
    });
}



// Scenario 6 popups
export function setupScenario6Popups(map) {
    const popup = new maplibregl.Popup({ closeButton: false, closeOnClick: false });

    const renderScenario6Tooltip = (props) => `
        <div style="font-size: 12px;">
          <strong>Szenario 6</strong><br/>
          <table style="border-collapse: collapse;">
            ${props.oid ? `<tr><td><strong>OID</strong></td><td>${props.oid}</td></tr>` : ""}
            ${props.name ? `<tr><td><strong>Name</strong></td><td>${props.name}</td></tr>` : ""}
            ${props.amenity ? `<tr><td><strong>Amenity</strong></td><td>${props.amenity}</td></tr>` : ""}
          </table>
        </div>
      `;

    ["scenario6-polys", "scenario6-points"].forEach((layerId) => {
        map.on("mousemove", layerId, (e) => {
            const html = renderScenario6Tooltip(e.features[0].properties);
            popup.setLngLat(e.lngLat).setHTML(html).addTo(map);
            map.getCanvas().style.cursor = "pointer";
        });

        map.on("mouseleave", layerId, () => {
            popup.remove();
            map.getCanvas().style.cursor = "";
        });

    });
}



// Scenario 7 popups
export function setupScenario7Popups(map) {
    const popup = new maplibregl.Popup({ closeButton: false, closeOnClick: false });

    const renderScenario7Tooltip = (props) => `
        <div style="font-size: 12px;">
          <strong>Szenario 4</strong><br/>
          <table style="border-collapse: collapse;">
            <tr><td><strong>Feature_ID</strong></td><td>${props.id ?? "-"}</td></tr>
            <tr><td><strong>Image_ID</strong></td><td>${props.image_id ?? "-"}</td></tr>
            <tr><td><strong>First Seen At</strong></td><td>${props.first_seen_at ?? "-"}</td></tr>
            <tr><td><strong>Last Seen At</strong></td><td>${props.last_seen_at ?? "-"}</td></tr>
            <tr><td><strong>Value</strong></td><td>${props.value ?? "-"}</td></tr>
          </table>
        </div>
      `;

    ["scenario7-polys", "scenario7-points"].forEach((layerId) => {
        map.on("mousemove", layerId, (e) => {
            const html = renderScenario7Tooltip(e.features[0].properties);
            popup.setLngLat(e.lngLat).setHTML(html).addTo(map);
            map.getCanvas().style.cursor = "pointer";
        });

        map.on("mouseleave", layerId, () => {
            popup.remove();
            map.getCanvas().style.cursor = "";
        });

        map.on("click", layerId, (e) => {
            const image_id = e.features[0].properties.image_id;
            if (image_id) window.open(`https://www.mapillary.com/app/?pKey=${image_id}&mapFeature[]=marking--discrete--symbol--bicycle`, "_blank");
        });
    });
}



// Scenario 8 popups
export function setupScenario8Popups(map) {
    const popup = new maplibregl.Popup({ closeButton: false, closeOnClick: false });

    const renderScenario8Tooltip = (props) => {
        const laermValue = props.max_laerm_num;
        let laermText = "-";

        if (laermValue === 55) laermText = "55–59 dB(A)";
        else if (laermValue === 60) laermText = "60–64 dB(A)";
        else if (laermValue === 65) laermText = "65–69 dB(A)";
        else if (laermValue === 70) laermText = "70–74 dB(A)";
        else if (laermValue === 75) laermText = "> 75 dB(A)";

        return `
        <div style="font-size: 12px;">
          <strong>${props.name ?? "Unbenannte Schule"}</strong><br/>
          <table style="border-collapse: collapse;">
            <tr><td><strong>Typ</strong></td><td>${props.amenity ?? "-"}</td></tr>
            <tr><td><strong>Lärm</strong></td><td>bis zu ${laermText}</td></tr>
          </table>
        </div>
    `;
    };

    ["scenario8-polys", "scenario8-points"].forEach((layerId) => {
        map.on("mousemove", layerId, (e) => {
            const html = renderScenario8Tooltip(e.features[0].properties);
            popup.setLngLat(e.lngLat).setHTML(html).addTo(map);
            map.getCanvas().style.cursor = "pointer";
        });

        map.on("mouseleave", layerId, () => {
            popup.remove();
            map.getCanvas().style.cursor = "";
        });
    });
}

