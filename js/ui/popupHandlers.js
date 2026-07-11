
// popupHandlers.js

import { formatDateDE } from "../utils/formatDate.js";

// chart.js (vendored, ~200 KB) erst beim ersten Uspeed-Chart-Popup nachladen —
// einziger Nutzer ist showUspeedChartPopup, darum raus aus dem kritischen
// Startpfad (kein <script>-Tag mehr in index.html).
let chartJsReady = null;
function loadChartJs() {
    chartJsReady ??= new Promise((resolve, reject) => {
        if (window.Chart) return resolve();
        const s = document.createElement("script");
        s.src = "./vendor/chart.umd.min.js";
        s.onload = () => resolve();
        s.onerror = () => {
            chartJsReady = null; // nächster Klick versucht es erneut
            reject(new Error("vendor/chart.umd.min.js nicht ladbar"));
        };
        document.head.appendChild(s);
    });
    return chartJsReady;
}


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

            const propsToShow = ["UKATEGORIE", "UJAHR", "UMONAT", "UWOCHENTAG", "USTUNDE", "UART", "UTYP1"];

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
                return `<tr><td>${label}</td><td>${value}</td></tr>`;
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
                rows += `<tr><td>Beteiligung</td><td>${beteiligte.join(", ")}</td></tr>`;
            }

            const content = `<div class="pop-title">Unfall</div><table class="pop-table">${rows}</table>`;
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
          <div class="pop-title">Cluster · Unfälle nach Schwere</div>
          <table class="pop-table">
            <tr><td>Getötete</td><td>${k1}</td></tr>
            <tr><td>Schwerverletzte</td><td>${k2}</td></tr>
            <tr><td>Leichtverletzte</td><td>${k3}</td></tr>
            <tr><td>Gesamt</td><td><strong>${total}</strong></td></tr>
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
            <div class="pop-title">Stadtradeln 2020</div>
            <table class="pop-table">
                <tr><td>Anzahl</td><td>${visits}</td></tr>
                <tr><td>Ø Geschwindigkeit</td><td>${speed}</td></tr>
            </table>`;

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

        const speed = props.speed != null ? (props.speed * 3.6).toFixed(1) + " km/h" : null;
        const zoneMap = { urban: ["innerorts", 1.5], innerorts: ["innerorts", 1.5], rural: ["außerorts", 2.0], "außerorts": ["außerorts", 2.0] };
        const [zoneLabel, minDist] = zoneMap[String(props.zone).toLowerCase()] || [props.zone, null];
        const dist = props.distance_overtaker != null ? Number(props.distance_overtaker) : null;
        const heroVal = dist != null ? `${dist.toFixed(2).replace(".", ",")} m` : "—";
        const under = (dist != null && minDist != null && dist < minDist) ? ` <span class="pop-note">unter Mindestabstand</span>` : "";
        const zoneMeta = zoneLabel ? `${zoneLabel}${minDist ? ` · Mindestabstand ${String(minDist).replace(".", ",")} m` : ""}` : null;
        const metaBits = [speed, zoneMeta].filter(Boolean).join(" · ");
        const content = `
            <div class="pop-title">Überholabstand</div>
            <div class="pop-hero">${heroVal}${under}</div>
            ${metaBits ? `<div class="pop-meta">${metaBits}</div>` : ""}`;

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
        const annual = isNaN(flow) ? "?" : `${(flow / 1_000_000).toFixed(1).replace(".", ",")} Mio`;
        const daily = isNaN(flow) ? "?" : (Math.round(flow / 365 / 1000) * 1000).toLocaleString("de-DE");

        const content = `
            <div class="pop-title">Hauptverkehrsstraße</div>
            <div class="pop-hero">~${daily} <span class="pop-unit">Kfz/Tag</span></div>
            <div class="pop-meta">${annual} Kfz/Jahr · © UBA</div>`;

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
    const metricBadge = (m) => (m ? `<span class="pop-note pop-hint" data-tip="${METRIC_TITLE[m] || ""}">${m}</span>` : "");
    const svLabel = (t) => `<span class="pop-hint" data-tip="Schwerverkehr: Lkw, Lastzüge, Busse (Kfz > 3,5 t)">${t}</span>`;
    const dtvHero = (val, metric) =>
        `<div class="pop-hero">${fmt(val)} <span class="pop-unit">Kfz/24h</span> ${metricBadge(metric)}</div>`;

    const onClick = (e) => {
        const p = e.features[0].properties;
        // UBA-Hauptverkehrsstraßen (Layer hvs): annualTrafficFlow (Kfz/Jahr) -> Tages-DTV≈.
        if (p.annualTrafficFlow != null && p.annualTrafficFlow !== "") {
            const flow = Number(p.annualTrafficFlow);
            new maplibregl.Popup({ closeButton: false, maxWidth: "270px" })
                .setLngLat(e.lngLat)
                .setHTML(
                    `<div class="pop-title">Hauptverkehrsstraße</div>` +
                    dtvHero(Math.round(flow / 365), "DTV≈") +
                    `<div class="pop-meta">${fmt(flow)} Kfz/Jahr · © UBA · END 2021</div>` +
                    `<div class="pop-foot"><a href="https://vizsim.de/svz" target="_blank" rel="noopener">Details &amp; Quellen → vizsim.de/svz</a></div>`
                )
                .addTo(map);
            return;
        }
        const road = p.road_no || (p.road_class ? `${p.road_class}-Straße` : "Zählstelle");
        const klass = ROAD_CLASS[p.road_class] || (p.road_class ? `Klasse ${p.road_class}` : "");

        let sv = "";
        if (p.dtv_sv != null && p.dtv_sv !== "") {
            const share = pct(p.dtv_sv, p.dtv_kfz);
            sv = `<div class="pop-meta">${svLabel("SV")} ${fmt(p.dtv_sv)}${share ? ` · ${share} %` : ""}</div>`;
        } else if (p.sv_anteil != null && p.sv_anteil !== "") {
            sv = `<div class="pop-meta">${svLabel("SV-Anteil")} ${p.sv_anteil} %</div>`;
        }

        const dtvLine =
            (p.dtv_kfz != null && p.dtv_kfz !== "")
                ? dtvHero(p.dtv_kfz, p.metric)
                : `<div class="pop-meta">keine DTV-Angabe ${metricBadge(p.metric)}</div>`;

        const meta = [klass, p.year, providerLabel(p.state)].filter(Boolean).join(" · ");

        new maplibregl.Popup({ closeButton: false, maxWidth: "270px" })
            .setLngLat(e.lngLat)
            .setHTML(
                `<div class="pop-title">${road}</div>` +
                dtvLine +
                sv +
                `<div class="pop-meta">${meta}</div>` +
                `<div class="pop-foot"><a href="https://vizsim.de/svz" target="_blank" rel="noopener">Details &amp; Quellen → vizsim.de/svz</a></div>`
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
            const kmh = (v) => (v && /^\d+$/.test(String(v).trim())) ? `${v} km/h` : v;
            const einordnung = props.maxspeed_type || props.highway;
            const rows = [
                props.maxspeed ? `<tr><td>Erlaubt</td><td>${kmh(props.maxspeed)}</td></tr>` : "",
                props.maxspeed_conditional ? `<tr><td>Bedingt</td><td>${props.maxspeed_conditional}</td></tr>` : "",
                props.name ? `<tr><td>Straße</td><td>${props.name}</td></tr>` : "",
                einordnung ? `<tr><td>Einordnung</td><td>${einordnung}</td></tr>` : "",
            ].join("") || `<tr><td>Tempolimit</td><td>keine Angabe in OSM</td></tr>`;
            const content = `<div class="pop-title">Tempolimit</div><table class="pop-table">${rows}</table><div class="pop-foot">→ Klick öffnet OpenStreetMap</div>`;

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

            const speedNum = (speed !== undefined && speed !== null) ? Number(speed).toFixed(0) : null;
            const dirMap = { forward: "in Fahrtrichtung", backward: "Gegenrichtung" };
            const dir = dirMap[p.reconstruction_direction] || p.reconstruction_direction;
            const content = `
                <div class="pop-title">Ø Geschwindigkeit</div>
                <div class="pop-hero">${speedNum != null ? `${speedNum} <span class="pop-unit">km/h</span>` : "—"}</div>
                <div class="pop-meta">um ${hour}:00 Uhr${dir ? ` · ${dir}` : ""}</div>
                <div class="pop-foot">→ Klick zeigt den Tagesverlauf</div>`;

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
    container.innerHTML = `
        <div class="pop-title">Ø Geschwindigkeit je Stunde</div>
        <div class="pop-meta" style="margin:-2px 0 6px;">OSM-Segment · Berlin, Q2 2019</div>
        <canvas id="speed-chart" width="320" height="180"></canvas>`;

    const popup = new maplibregl.Popup()
        .setLngLat(e.lngLat)
        .setDOMContent(container)
        .addTo(map);

    setTimeout(() => {
        loadChartJs().then(() => {
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
        }).catch(err => console.error("❌ Chart.js konnte nicht geladen werden:", err));
    }, 50);
}




export function setupSchoolsPopups(map) {
    const popup = new maplibregl.Popup({ closeButton: false, closeOnClick: false });

    const handleLayer = (layerId) => {
        map.on("mouseenter", layerId, (e) => {
            map.getCanvas().style.cursor = "pointer";
            const props = e.features[0].properties;

            const titleMap = { school: "Schule", kindergarten: "Kindergarten" };
            const content = `
                <div class="pop-title">${titleMap[props.amenity] || "Schule / Kindergarten"}</div>
                <table class="pop-table">
                    ${props.name ? `<tr><td>Name</td><td>${props.name}</td></tr>` : ""}
                    ${props.amenity ? `<tr><td>Art</td><td>${props.amenity}</td></tr>` : ""}
                    ${props.isced_level ? `<tr><td>Bildungsstufe</td><td>ISCED ${props.isced_level}</td></tr>` : ""}
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
                <div class="pop-title">Übergang</div>
                <table class="pop-table">
                    <tr><td>Typ</td><td>${typ}</td></tr>
                    ${props.crossing_markings ? `<tr><td>Markierung</td><td>${props.crossing_markings}</td></tr>` : ""}
                    ${props.tactile_paving ? `<tr><td>Blindenleitsystem</td><td>${props.tactile_paving}</td></tr>` : ""}
                    ${props.kerb ? `<tr><td>Bordstein</td><td>${props.kerb}</td></tr>` : ""}
                </table>
                <div class="pop-foot">→ Klick öffnet OpenStreetMap</div>
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
                <div class="pop-title">Gesundheitseinrichtung</div>
                <table class="pop-table">
                    ${props.name ? `<tr><td>Name</td><td>${props.name}</td></tr>` : ""}
                    ${props.amenity ? `<tr><td>Art</td><td>${props.amenity}</td></tr>` : ""}
                    ${props.healthcare ? `<tr><td>Versorgung</td><td>${props.healthcare}</td></tr>` : ""}
                    ${props["healthcare:speciality"] ? `<tr><td>Fachgebiet</td><td>${props["healthcare:speciality"]}</td></tr>` : ""}
                    ${props.social_facility ? `<tr><td>Einrichtung</td><td>${props.social_facility}</td></tr>` : ""}
                    ${props["social_facility:for"] ? `<tr><td>Zielgruppe</td><td>${props["social_facility:for"]}</td></tr>` : ""}
                    ${props.operator ? `<tr><td>Träger</td><td>${props.operator}</td></tr>` : ""}
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
                <div class="pop-title">Spielplatz</div>
                <table class="pop-table">
                    ${props.name ? `<tr><td>Name</td><td>${props.name}</td></tr>` : ""}
                    ${props.leisure ? `<tr><td>Art</td><td>${props.leisure}</td></tr>` : ""}
                    ${props.playground ? `<tr><td>Ausstattung</td><td>${props.playground}</td></tr>` : ""}
                    ${props.amenity ? `<tr><td>Kategorie</td><td>${props.amenity}</td></tr>` : ""}
                    ${props.operator ? `<tr><td>Träger</td><td>${props.operator}</td></tr>` : ""}
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
                <div class="pop-title">Lärm · Tag-Abend-Nacht</div>
                <div class="pop-hero">${readableClass || "—"}</div>
                <div class="pop-meta">L<sub>DEN</sub> · Hauptlärmquelle · © UBA</div>`;
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
                <div class="pop-title">Lärm · Nacht</div>
                <div class="pop-hero">${readableClass || "—"}</div>
                <div class="pop-meta">L<sub>night</sub> · Hauptlärmquelle · © UBA</div>`;
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
                <div class="pop-title">Verkehrszeichen</div>
                <table class="pop-table">
                    ${props.value ? `<tr><td>Zeichen</td><td>${props.value}</td></tr>` : ""}
                    ${props.first_seen_at ? `<tr><td>Zuerst gesehen</td><td>${formatDateDE(new Date(+props.first_seen_at).toISOString().slice(0, 10))}</td></tr>` : ""}
                    ${props.last_seen_at ? `<tr><td>Zuletzt gesehen</td><td>${formatDateDE(new Date(+props.last_seen_at).toISOString().slice(0, 10))}</td></tr>` : ""}
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
            <div class="pop-title">Telraam-Zählstelle</div>
            <div class="pop-hero">${fmt(p.bike_per_day)} <span class="pop-unit">Ø Rad/Tag</span></div>
            <div class="pop-meta">${fmt(p.car_per_day)} Ø Auto/Tag · Ø letzte 2 Wochen</div>
            <div class="pop-foot">→ Klick öffnet Telraam</div>`).addTo(map);
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




// Alle Szenarien in EINEM Popup: liegen mehrere Szenario-Polygone übereinander,
// werden ihre Karten UNTEREINANDER gestapelt (statt sich als separate Popups zu
// überdecken). Ein map-weiter mousemove fragt alle Szenario-Layer am Cursor ab;
// nur sichtbare zählen (queryRenderedFeatures) -> deaktivierte Szenarien tauchen
// automatisch nicht auf. Ersetzt die früheren 6 Einzel-Handler.
export function setupScenarioPopups(map) {
    // Hover = transiente Vorschau (folgt dem Cursor); Klick = fixiertes Fenster
    // (bleibt stehen, mit Schließen-Button) -> darin sind Info-Icon/Links anklickbar.
    const hoverPopup = new maplibregl.Popup({ closeButton: false, closeOnClick: false, maxWidth: "340px" });
    let pinPopup = null;

    const ruleCriteria = {
        up5_3y: "≥ 5 Unfälle mit Personenschaden in 3 Jahren (M-Uko-3-Jahres-Kriterium).",
        usp3_3y: "≥ 3 Unfälle mit schwerem Personenschaden in 3 Jahren (M-Uko-3-Jahres-Kriterium).",
        utyp5_3y: "≥ 5 gleichartige Unfälle (gleicher Unfalltyp) in 3 Jahren (angelehnt an die M-Uko-Typenkarte)."
    };

    const laermText = (v) => {
        const n = Number(v);
        if (n === 55) return "55–59 dB(A)";
        if (n === 60) return "60–64 dB(A)";
        if (n === 65) return "65–69 dB(A)";
        if (n === 70) return "70–74 dB(A)";
        if (n === 75) return "> 75 dB(A)";
        return "–";
    };

    // Registry (feste Reihenfolge = feste Stapel-Reihenfolge). render() liefert nur
    // den Karten-Body; die Eyebrow + Trenner setzt der Sammel-Handler.
    const scenarios = [
        {
            layers: ["scenario1-polys", "scenario1-points"], eyebrow: "Unfall-Häufung · Tempo 100",
            render: (p) => `
                <table class="pop-table">
                    ${p.cluster_size !== undefined ? `<tr><td>Unfälle im Cluster</td><td>${p.cluster_size}</td></tr>` : ""}
                    ${p.UKATEGORIE__1 !== undefined ? `<tr><td>Getötete</td><td>${p.UKATEGORIE__1}</td></tr>` : ""}
                    ${p.UKATEGORIE__2 !== undefined ? `<tr><td>Schwerverletzte</td><td>${p.UKATEGORIE__2}</td></tr>` : ""}
                    ${p.UKATEGORIE__3 !== undefined ? `<tr><td>Leichtverletzte</td><td>${p.UKATEGORIE__3}</td></tr>` : ""}
                </table>`
        },
        {
            layers: ["scenario2-polys", "scenario2-points"], eyebrow: "Schulumfeld · Unfälle",
            render: (p) => `
                <div class="pop-title">${p.name ?? "Schule / Kindergarten"} <span class="info-icon" data-tip="Gezählt: Unfälle ab 2020 (seit 2020 bundesweit einheitlich erfasst, inkl. 2025) im 50-m-Umfeld. Die Karte zeigt dagegen alle Jahre 2017–2025 — ältere Unfälle erscheinen als Punkte, ohne mitgezählt zu werden.">i</span></div>
                <table class="pop-table">
                    ${p.amenity ? `<tr><td>Art</td><td>${p.amenity}</td></tr>` : ""}
                    ${p.total_count !== undefined ? `<tr><td>Unfälle gesamt</td><td>${p.total_count}</td></tr>` : ""}
                    ${p.bike_count !== undefined ? `<tr><td>… mit Radbeteiligung</td><td>${p.bike_count}</td></tr>` : ""}
                    ${p.ped_count !== undefined ? `<tr><td>… mit Fußgängerbeteiligung</td><td>${p.ped_count}</td></tr>` : ""}
                </table>
                <div class="pop-meta" style="margin-top:8px;">Im 50-m-Umfeld der Einrichtung. Ausgewählt: Schulen mit mehr als 2 Unfällen mit Rad-/Fußbeteiligung.</div>`
        },
        {
            layers: ["scenario3-polys", "scenario3-points"], eyebrow: "Kurzes Tempo-50-Segment",
            render: (p) => `
                <table class="pop-table">
                    <tr><td>Tempolimit</td><td>${p.maxspeed ? `${p.maxspeed} km/h` : "–"}</td></tr>
                    <tr><td>Straße</td><td>${p.name ?? "–"}</td></tr>
                    <tr><td>Länge</td><td>${p.length_m !== undefined ? `${Number(p.length_m).toFixed(0)} m` : "–"}</td></tr>
                </table>`
        },
        {
            layers: ["scenario6-polys", "scenario6-points"], eyebrow: "Schule · Tempo 50 nah",
            render: (p) => `
                <div class="pop-title">${p.name ?? "Schule / Kindergarten"}</div>
                ${p.amenity ? `<table class="pop-table"><tr><td>Art</td><td>${p.amenity}</td></tr></table>` : ""}
                <div class="pop-meta" style="margin-top:6px;">Im direkten Umfeld (30-m-Buffer) gibt es Straßenabschnitte, auf denen noch Tempo 50 gilt — rot umrandet auf der Karte.</div>`
        },
        {
            layers: ["scenario8-polys", "scenario8-points"], eyebrow: "Schule · Lärm",
            render: (p) => `
                <div class="pop-title">${p.name ?? "Unbenannte Schule"}</div>
                <div class="pop-hero pop-hero--sm">bis ${laermText(p.max_laerm_num)}</div>
                <div class="pop-meta">Lärm am Gebäude · Orientierungswert ~57 dB(A)</div>
                <div class="pop-foot"><a href="https://www.umweltbundesamt.de/themen/laerm/verkehrslaerm/strassenverkehrslaerm" target="_blank" rel="noopener">Umweltbundesamt · Straßenverkehrslärm →</a></div>`
        },
        {
            layers: ["scenario9-polys", "scenario9-points"], eyebrow: "Unfall-Häufung · M-Uko",
            render: (p) => {
                const utyp = Number(p.utyp);
                const utypText = utyp > 0 ? `${translations.UTYP1[utyp] ?? "-"} (${utyp})` : null;
                const crit = ruleCriteria[p.rule];
                return `
                    <div><span class="pop-flag">Auffällig</span></div>
                    ${crit ? `<div class="pop-meta" style="margin-top:0;">${crit}</div>` : ""}
                    <table class="pop-table" style="margin-top:7px;">
                        ${utypText ? `<tr><td>Unfalltyp</td><td>${utypText}</td></tr>` : ""}
                        ${p.n_max !== undefined ? `<tr><td>Unfälle (max.)</td><td>${p.n_max}</td></tr>` : ""}
                        ${p.window_best !== undefined ? `<tr><td>Zeitfenster</td><td>${p.window_best}</td></tr>` : ""}
                        ${p.n_windows !== undefined ? `<tr><td>auffällige Fenster</td><td>${p.n_windows}</td></tr>` : ""}
                        ${p.UKATEGORIE__1 !== undefined ? `<tr><td>Getötete</td><td>${p.UKATEGORIE__1}</td></tr>` : ""}
                        ${p.UKATEGORIE__2 !== undefined ? `<tr><td>Schwerverletzte</td><td>${p.UKATEGORIE__2}</td></tr>` : ""}
                        ${p.UKATEGORIE__3 !== undefined ? `<tr><td>Leichtverletzte</td><td>${p.UKATEGORIE__3}</td></tr>` : ""}
                    </table>
                    <div class="pop-meta" style="margin-top:8px;">
                        Vereinfachte Analyse auf Unfallatlas-Basis (nur Unfälle mit Personenschaden) —
                        keine amtliche Feststellung einer Unfallhäufungsstelle durch die Unfallkommission.
                    </div>`;
            }
        }
    ];

    const layerToScenario = {};
    for (const s of scenarios) for (const l of s.layers) layerToScenario[l] = s;
    const allLayers = scenarios.flatMap((s) => s.layers);

    // Karten aller Szenarien am Punkt einsammeln (gestapelt, feste Reihenfolge) -> HTML oder "".
    const collectHTML = (point) => {
        const layers = allLayers.filter((l) => map.getLayer(l)); // sonst wirft queryRenderedFeatures
        const feats = layers.length ? map.queryRenderedFeatures(point, { layers }) : [];
        if (!feats.length) return "";
        const cards = [];
        for (const s of scenarios) {
            const f = feats.find((ft) => layerToScenario[ft.layer.id] === s);
            if (f) cards.push(`<div class="pop-card"><div class="pop-eyebrow">${s.eyebrow}</div>${s.render(f.properties)}</div>`);
        }
        if (!cards.length) return "";
        const header = cards.length > 1
            ? `<div class="pop-multi">${cards.length} Szenarien an diesem Punkt</div>`
            : "";
        return header + cards.join("");
    };

    map.on("mousemove", (e) => {
        if (pinPopup) return; // fixiertes Fenster hat Vorrang, keine Hover-Vorschau
        const html = collectHTML(e.point);
        if (!html) {
            hoverPopup.remove();
            map.getCanvas().style.cursor = "";
            return;
        }
        map.getCanvas().style.cursor = "pointer";
        hoverPopup.setLngLat(e.lngLat)
            .setHTML(html + `<div class="pop-pinhint">→ Klick fixiert das Fenster</div>`)
            .addTo(map);
    });

    map.on("mouseout", () => {
        if (!pinPopup) hoverPopup.remove();
    });

    // Klick auf eine Szenario-Fläche: Vorschau wird zum fixierten Popup (bleibt stehen,
    // ist hover-/anklickbar). Klick ins Leere: fixiertes Fenster schließen.
    map.on("click", (e) => {
        const html = collectHTML(e.point);
        if (!html) {
            if (pinPopup) pinPopup.remove();
            return;
        }
        hoverPopup.remove();
        if (pinPopup) pinPopup.remove();
        pinPopup = new maplibregl.Popup({ closeButton: true, closeOnClick: false, maxWidth: "340px" })
            .setLngLat(e.lngLat).setHTML(html).addTo(map);
        pinPopup.on("close", () => { pinPopup = null; });
    });
}









