
// popupHandlers.js

import { formatDateDE } from "../utils/formatDate.js";


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

// SVZ-Verkehrsmengen-Popup (Klick): echte DTV (Kfz/24h) + Straße/Klasse/Jahr/Quelle,
// optional Schwerverkehr (absolut + Anteil). Ein Handler für alle drei Layer
// (Länder-Linien/-Punkte + BASt). Portiert aus vizsim/svz (main.js onClick).
// dtv_kfz/dtv_sv/sv_anteil landen z.T. als String im Tile -> Number(...) beim Formatieren.
export function setupSvzPopups(map) {
    const fmt = (n) => (n == null || n === "" ? "–" : Number(n).toLocaleString("de-DE"));
    const pct = (num, den) =>
        den ? ((Number(num) / Number(den)) * 100).toLocaleString("de-DE", { maximumFractionDigits: 1 }) : null;

    const ROAD_CLASS = { A: "Autobahn", B: "Bundesstraße", L: "Landesstraße", K: "Kreisstraße", G: "Gemeindestraße" };
    const providerLabel = (state) => (state === "DE" ? "BASt" : state);
    const METRIC_TITLE = {
        DTV: "Durchschnittliche tägliche Verkehrsstärke (Kfz/24h, alle Tage)",
        DTVw: "Durchschnittliche tägliche Verkehrsstärke werktags (Mo–Fr)",
        "DTV≈": "Näherung aus der Jahresmenge: Kfz/Jahr ÷ 365"
    };
    const metricBadge = (m) => (m ? `<span class="popup-metric" title="${METRIC_TITLE[m] || ""}">${m}</span>` : "");
    const svLabel = (t) => `<span class="popup-hint" title="Schwerverkehr: Lkw, Lastzüge, Busse (Kfz > 3,5 t)">${t}</span>`;
    const dtvHero = (val, metric) =>
        `<div class="popup-dtv">${fmt(val)} <span class="popup-unit">Kfz/24h</span> ${metricBadge(metric)}</div>`;

    const onClick = (e) => {
        const p = e.features[0].properties;
        // UBA-Hauptverkehrsstraßen (Layer hvs): annualTrafficFlow (Kfz/Jahr) -> Tages-DTV≈.
        if (p.annualTrafficFlow != null && p.annualTrafficFlow !== "") {
            const flow = Number(p.annualTrafficFlow);
            new maplibregl.Popup({ closeButton: false, maxWidth: "270px" })
                .setLngLat(e.lngLat)
                .setHTML(
                    `<div class="popup-road">Hauptverkehrsstraße</div>` +
                    dtvHero(Math.round(flow / 365), "DTV≈") +
                    `<div class="popup-meta">${fmt(flow)} Kfz/Jahr · © UBA · END 2021</div>` +
                    `<div class="popup-meta"><a href="https://vizsim.de/svz" target="_blank" rel="noopener">Details &amp; Quellen → vizsim.de/svz</a></div>`
                )
                .addTo(map);
            return;
        }
        const road = p.road_no || (p.road_class ? `${p.road_class}-Straße` : "Zählstelle");
        const klass = ROAD_CLASS[p.road_class] || (p.road_class ? `Klasse ${p.road_class}` : "");

        let sv = "";
        if (p.dtv_sv != null && p.dtv_sv !== "") {
            const share = pct(p.dtv_sv, p.dtv_kfz);
            sv = `<div class="popup-sv">${svLabel("SV")} ${fmt(p.dtv_sv)}${share ? ` · ${share} %` : ""}</div>`;
        } else if (p.sv_anteil != null && p.sv_anteil !== "") {
            sv = `<div class="popup-sv">${svLabel("SV-Anteil")} ${p.sv_anteil} %</div>`;
        }

        const dtvLine =
            (p.dtv_kfz != null && p.dtv_kfz !== "")
                ? dtvHero(p.dtv_kfz, p.metric)
                : `<div class="popup-meta">keine DTV-Angabe ${metricBadge(p.metric)}</div>`;

        const meta = [klass, p.year, providerLabel(p.state)].filter(Boolean).join(" · ");

        new maplibregl.Popup({ closeButton: false, maxWidth: "270px" })
            .setLngLat(e.lngLat)
            .setHTML(
                `<div class="popup-road">${road}</div>` +
                dtvLine +
                sv +
                `<div class="popup-meta">${meta}</div>` +
                `<div class="popup-meta"><a href="https://vizsim.de/svz" target="_blank" rel="noopener">Details &amp; Quellen → vizsim.de/svz</a></div>`
            )
            .addTo(map);
    };

    for (const id of ["svz-lines", "svz-points", "bast-points", "hvs"]) {
        map.on("click", id, onClick);
        map.on("mouseenter", id, () => (map.getCanvas().style.cursor = "pointer"));
        map.on("mouseleave", id, () => (map.getCanvas().style.cursor = ""));
    }
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
            // Wide-Format: Speed der aktuell im Slider gewählten Stunde aus speed_<h>
            const hour = parseInt(document.getElementById("uspeed-slider").value, 10);
            const speed = p[`speed_${hour}`];

            const content = `
        <div style="font-size: 12px;">
            <strong>Segment Details</strong><br/>
            <table style="border-collapse: collapse;">
                <tr><td><strong>OSM Way ID:</strong></td><td>${p.osm_way_id}</td></tr>
                <tr><td><strong>Start Node:</strong></td><td>${p.osm_start_node_id}</td></tr>
                <tr><td><strong>End Node:</strong></td><td>${p.osm_end_node_id}</td></tr>
                <tr><td><strong>Hour:</strong></td><td>${hour}</td></tr>
                <tr><td><strong>Avg. Speed:</strong></td><td>${speed !== undefined ? Number(speed).toFixed(1) + " km/h" : "—"}</td></tr>
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
    // Wide-Format: das Feature trägt alle 24 Stunden-Werte selbst (speed_0..speed_23)
    // -> kein querySourceFeatures-Sammeln mehr (das fand nur geladene Tiles und
    // konnte Stunden im Chart unterschlagen). Fehlende Stunde = Attribut fehlt = null.
    const p = e.features[0].properties;
    const hourlySpeeds = [...Array(24).keys()].map(h =>
        p[`speed_${h}`] !== undefined ? Number(p[`speed_${h}`]) : null
    );

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

export function setupCrossingsPopups(map) {
    const popup = new maplibregl.Popup({ closeButton: false, closeOnClick: false });

    const crossingLabels = {
        traffic_signals: "Ampel (Lichtzeichen)",
        marked: "Markiert (Zebra/Markierung)",
        uncontrolled: "Markiert (Zebra/Markierung)",
        zebra: "Zebrastreifen",
        unmarked: "Unmarkiert",
    };

    const handleLayer = (layerId, osmType) => {
        map.on("mouseenter", layerId, (e) => {
            map.getCanvas().style.cursor = "pointer";
            const props = e.features[0].properties;
            const typ = crossingLabels[props.crossing] || props.crossing || "unbekannt";

            const content = `
            <table style="font-size:12px; border-collapse:collapse;">
            <tr><td><strong>Übergang</strong></td><td>${typ}</td></tr>
            ${props.crossing_markings ? `<tr><td><strong>Markierung</strong></td><td>${props.crossing_markings}</td></tr>` : ""}
            ${props.tactile_paving ? `<tr><td><strong>Blindenleitsystem</strong></td><td>${props.tactile_paving}</td></tr>` : ""}
            ${props.kerb ? `<tr><td><strong>Bordstein</strong></td><td>${props.kerb}</td></tr>` : ""}
            <tr><td colspan="2" style="color:#666;padding-top:4px;">Klick → OSM (${osmType}/${props.osm_id})</td></tr>
            </table>
        `;

            popup.setLngLat(e.lngLat).setHTML(content).addTo(map);
        });

        map.on("mouseleave", layerId, () => {
            map.getCanvas().style.cursor = "";
            popup.remove();
        });

        // Klick auf einen Übergang -> zugehörige OSM-Objektseite (Node bzw. Way)
        map.on("click", layerId, (e) => {
            const id = e.features[0].properties.osm_id;
            if (id) window.open(`https://www.openstreetmap.org/${osmType}/${id}`, "_blank", "noopener");
        });
    };

    handleLayer("crossings-points", "node");
    handleLayer("crossings-lines", "way");
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


export function setupMapillaryTrafficsignPopups(map) {
    const popup = new maplibregl.Popup({ closeButton: false, closeOnClick: false });

    const handleLayer = (layerId) => {
        map.on("mouseenter", layerId, (e) => {
            map.getCanvas().style.cursor = "pointer";
            const props = e.features[0].properties;

            const content = `
            <table style="font-size:12px; border-collapse:collapse;">
            ${props.first_seen_at ? `<tr><td><strong>first_seen_at</strong></td><td>${formatDateDE(new Date(+props.first_seen_at).toISOString().slice(0, 10))}</td></tr>` : ""}
            ${props.last_seen_at ? `<tr><td><strong>last_seen_at</strong></td><td>${formatDateDE(new Date(+props.last_seen_at).toISOString().slice(0, 10))}</td></tr>` : ""}
            ${props.value ? `<tr><td><strong>value</strong></td><td>${props.value}</td></tr>` : ""}

            </table>
        `;

            popup.setLngLat(e.lngLat).setHTML(content).addTo(map);
        });

        map.on("mouseleave", layerId, () => {
            map.getCanvas().style.cursor = "";
            popup.remove();
        });
    };

    handleLayer("mapillary-ts");
}


// Telraam-Zählstellen: Hover zeigt Ø Auto/Rad pro Tag (letzte 2 Wochen),
// Klick öffnet die Telraam-Location-Seite mit dem vollen Verlauf.
export function setupTelraamInteractivity(map) {
    const popup = new maplibregl.Popup({ closeButton: false, closeOnClick: false });
    const fmt = (v) =>
        (v === undefined || v === null || v === "") ? "—" : Math.round(Number(v)).toLocaleString("de-DE");

    map.on("mouseenter", "telraam", (e) => {
        map.getCanvas().style.cursor = "pointer";
        const p = e.features?.[0]?.properties ?? {};
        popup.setLngLat(e.lngLat).setHTML(`
            <div style="font-size:12px;">
              <div><strong>Ø Rad/Tag:</strong> ${fmt(p.bike_per_day)}</div>
              <div><strong>Ø Auto/Tag:</strong> ${fmt(p.car_per_day)}</div>
              <div style="color:#666; margin-top:4px;">Ø letzte 2 Wochen · Klick öffnet Telraam</div>
            </div>`).addTo(map);
    });
    map.on("mousemove", "telraam", (e) => {
        popup.setLngLat(e.lngLat);
    });
    map.on("mouseleave", "telraam", () => {
        map.getCanvas().style.cursor = "";
        popup.remove();
    });
    map.on("click", "telraam", (e) => {
        const oidn = e.features?.[0]?.properties?.oidn;
        if (oidn != null) {
            window.open(`https://telraam.net/en/location/${oidn}`, "_blank", "noopener");
        }
    });
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






// Scenario 8 popups
export function setupScenario8Popups(map) {
    const popup = new maplibregl.Popup({ closeButton: false, closeOnClick: false });

    const renderScenario8Tooltip = (props) => {
        const laermValue = Number(props.max_laerm_num);  // pmtiles liefert ggf. String
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


// Scenario 9 popups (Unfallhäufungen, Kriterien nach M Uko)
export function setupScenario9Popups(map) {
    const popup = new maplibregl.Popup({ closeButton: false, closeOnClick: false, maxWidth: "340px" });

    // Bewusste Wortwahl: "erfüllt das Kriterium" ist eine überprüfbare Tatsachenaussage —
    // NICHT "ist eine Unfallhäufungsstelle" (deren Feststellung ist Sache der Unfall-
    // kommission). up5/usp3 entsprechen der 3-Jahres-Karte der M Uko; utyp5 ist nur
    // angelehnt (die amtliche Typenkarte ist die 1-Jahres-Karte inkl. Sachschaden).
    const ruleCriteria = {
        up5_3y: "Erfüllt das 3-Jahres-Kriterium der M Uko: ≥ 5 Unfälle mit Personenschaden in 3 Jahren.",
        usp3_3y: "Erfüllt das 3-Jahres-Kriterium der M Uko: ≥ 3 Unfälle mit schwerem Personenschaden in 3 Jahren.",
        utyp5_3y: "≥ 5 gleichartige Unfälle (gleicher Unfalltyp) in 3 Jahren — angelehnt an die M-Uko-Typenkarte."
    };

    const renderScenario9Tooltip = (props) => {
        // pmtiles liefert Integer-Attribute ggf. als String -> Number(...)
        const utyp = Number(props.utyp);
        const utypText = utyp > 0
            ? `${translations.UTYP1[utyp] ?? "-"} (${utyp})`
            : null;
        const crit = ruleCriteria[props.rule];

        return `
        <div class="sc9-popup" style="font-size: 12px;">
          <style>
            .sc9-popup table { border-collapse: collapse; margin-top: 4px; }
            .sc9-popup td { vertical-align: top; padding: 1px 0; }
            .sc9-popup td.k { padding-right: 12px; white-space: nowrap; color: #555; font-weight: 600; }
          </style>
          <strong>Unfallhäufung</strong>
          ${crit ? `<div style="margin-top: 4px; color: #2e7d32; font-weight: 600;">✔ ${crit}</div>` : ""}
          <table>
            ${utypText ? `<tr><td class="k">Unfalltyp</td><td>${utypText}</td></tr>` : ""}
            ${props.n_max !== undefined ? `<tr><td class="k">Unfälle (max.)</td><td>${props.n_max}</td></tr>` : ""}
            ${props.window_best !== undefined ? `<tr><td class="k">Zeitfenster</td><td>${props.window_best}</td></tr>` : ""}
            ${props.n_windows !== undefined ? `<tr><td class="k">auffällige Fenster</td><td>${props.n_windows}</td></tr>` : ""}
            ${props.UKATEGORIE__1 !== undefined ? `<tr><td class="k"># Getötete</td><td>${props.UKATEGORIE__1}</td></tr>` : ""}
            ${props.UKATEGORIE__2 !== undefined ? `<tr><td class="k"># Schwerverletzte</td><td>${props.UKATEGORIE__2}</td></tr>` : ""}
            ${props.UKATEGORIE__3 !== undefined ? `<tr><td class="k"># Leichtverletzte</td><td>${props.UKATEGORIE__3}</td></tr>` : ""}
          </table>
          <div style="margin-top: 6px; color: #777; font-size: 10px;">
            Vereinfachte Analyse auf Unfallatlas-Basis (nur Unfälle mit Personenschaden) —
            keine amtliche Feststellung einer Unfallhäufungsstelle durch die Unfallkommission.
          </div>
        </div>
      `;
    };

    ["scenario9-polys", "scenario9-points"].forEach((layerId) => {
        map.on("mousemove", layerId, (e) => {
            const html = renderScenario9Tooltip(e.features[0].properties);
            popup.setLngLat(e.lngLat).setHTML(html).addTo(map);
            map.getCanvas().style.cursor = "pointer";
        });

        map.on("mouseleave", layerId, () => {
            popup.remove();
            map.getCanvas().style.cursor = "";
        });
    });
}

