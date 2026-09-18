
// popupHandlers.js — Karten-Registry für das gemeinsame Hover-Popup (js/ui/hoverPopup.js).
//
// Jeder Eintrag beschreibt EINE Karte: welche Layer dazugehören, wie ihr Body aus den
// Feature-Properties gerendert wird und was bei Klick passiert (Link / eigene Aktion /
// sonst Fenster fixieren). Die Engine fragt alle Einträge in EINEM queryRenderedFeatures
// ab und stapelt die Treffer untereinander — keine sich überdeckenden Einzel-Popups mehr.
//
// Klick-Hinweise ("→ Klick öffnet …") gehören NICHT in render(): die Engine zeigt den
// Hinweis nur für den obersten Treffer (nur dessen Aktion läuft bei Klick).

import { formatDateDE } from "../utils/formatDate.js";
import { setupHoverPopup } from "./hoverPopup.js";
import { row, osmLink } from "./popupHelpers.js";
import { translations } from "./accidentLabels.js";
import { registryPopupEntries } from "../layers/registry.js";

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


const weekdayNames = ["?", "Sonntag", "Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag"];
const monthNames = ["?", "Januar", "Februar", "März", "April", "Mai", "Juni", "Juli", "August", "September", "Oktober", "November", "Dezember"];



// ---------------------------------------------------------------------------
// Unfälle (Einzelpunkte ab Zoom 11) + Cluster (Zoom 6–11)
// ---------------------------------------------------------------------------

function renderAccident(props) {
    const labels = {
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
        let value = props[key];
        if (key === "UWOCHENTAG" && value != null) value = `${weekdayNames[value]} (${value})`;
        if (key === "UMONAT" && value != null) value = `${monthNames[value]} (${value})`;
        if (translations[key] && value in translations[key]) {
            value = `${translations[key][value]} (${value})`;
        } else if (value == null) {
            value = "?";
        }
        return `<tr><td>${labels[key]}</td><td>${value}</td></tr>`;
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
    if (beteiligte.length > 0) rows += `<tr><td>Beteiligung</td><td>${beteiligte.join(", ")}</td></tr>`;

    return `<div class="pop-title">Unfall</div><table class="pop-table">${rows}</table>`;
}

const clusterTotal = (p) => (p.UKATEGORIE__1 || 0) + (p.UKATEGORIE__2 || 0) + (p.UKATEGORIE__3 || 0);

function accidentEntries(map) {
    return [
        {
            id: "accidents", kind: "accidents", layers: ["accident-points"],
            render: renderAccident
        },
        {
            id: "clusters", kind: "accidents", eyebrow: "Cluster", layers: ["pie-clusters-fine-layer", "pie-clusters-coarse-layer"],
            render: (p) => `
                <div class="pop-title">Unfälle nach Schwere</div>
                <table class="pop-table">
                    <tr><td>Getötete</td><td>${p.UKATEGORIE__1 || 0}</td></tr>
                    <tr><td>Schwerverletzte</td><td>${p.UKATEGORIE__2 || 0}</td></tr>
                    <tr><td>Leichtverletzte</td><td>${p.UKATEGORIE__3 || 0}</td></tr>
                    <tr><td>Gesamt</td><td><strong>${clusterTotal(p)}</strong></td></tr>
                </table>`,
            // Popup am Cluster-Zentrum (nicht am Cursor), Abstand = Radius des vergrößerten
            // Hover-Pies (icon-size 1; Bildgröße wie in generatePieIcon: 32/48/64 px).
            anchor: (f) => {
                const total = clusterTotal(f.properties);
                const pieSize = total > 100 ? 64 : total > 10 ? 48 : 32;
                return { lngLat: f.geometry.coordinates, offset: pieSize / 2 + 4 };
            },
            // Vergrößertes Pie über dem gehoverten Cluster (Layer "hover-pie"). Nur ein PLAIN
            // GeoJSON-Feature übergeben: seit MapLibre 5.24 geht setData per Structured-Clone
            // an den Worker; das MapGeoJSONFeature aus queryRenderedFeatures ist nicht klonbar.
            onEnter: (f) => map.getSource("hover-point")?.setData({
                type: "FeatureCollection",
                features: [{ type: "Feature", geometry: f.geometry, properties: f.properties }]
            }),
            onLeave: () => map.getSource("hover-point")?.setData({ type: "FeatureCollection", features: [] })
        }
    ];
}


// ---------------------------------------------------------------------------
// Verkehr: SVZ/HVS, Tempolimit, Uber-Speed, Telraam (OBS + Stadtradeln: js/layers/context-cycling.js)
// ---------------------------------------------------------------------------

function trafficEntries() {
    // SVZ-Verkehrsmengen: echte DTV (Kfz/24h) + Straße/Klasse/Jahr/Quelle, optional
    // Schwerverkehr (absolut + Anteil). Portiert aus vizsim/svz (main.js onClick).
    // dtv_kfz/dtv_sv/sv_anteil landen z.T. als String im Tile -> Number(...) beim Formatieren.
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
    const svzLink = () => ({ href: "https://vizsim.de/svz", label: "Details & Quellen (vizsim.de/svz)" });

    const renderSvz = (p) => {
        const road = p.road_no || (p.road_class ? `${p.road_class}-Straße` : "Zählstelle");
        const klass = ROAD_CLASS[p.road_class] || (p.road_class ? `Klasse ${p.road_class}` : "");
        let sv = "";
        if (p.dtv_sv != null && p.dtv_sv !== "") {
            const share = pct(p.dtv_sv, p.dtv_kfz);
            sv = `<div class="pop-meta">${svLabel("SV")} ${fmt(p.dtv_sv)}${share ? ` · ${share} %` : ""}</div>`;
        } else if (p.sv_anteil != null && p.sv_anteil !== "") {
            sv = `<div class="pop-meta">${svLabel("SV-Anteil")} ${p.sv_anteil} %</div>`;
        }
        const dtvLine = (p.dtv_kfz != null && p.dtv_kfz !== "")
            ? dtvHero(p.dtv_kfz, p.metric)
            : `<div class="pop-meta">keine DTV-Angabe ${metricBadge(p.metric)}</div>`;
        const meta = [klass, p.year, providerLabel(p.state)].filter(Boolean).join(" · ");
        return `<div class="pop-title">${road}</div>${dtvLine}${sv}<div class="pop-meta">${meta}</div>`;
    };

    // UBA-Hauptverkehrsstraßen: annualTrafficFlow (Kfz/Jahr) -> Tages-DTV≈.
    const renderHvs = (p) => {
        const flow = Number(p.annualTrafficFlow);
        if (isNaN(flow)) return `<div class="pop-title">Hauptverkehrsstraße</div><div class="pop-meta">keine Verkehrsmenge · © UBA</div>`;
        return `<div class="pop-title">Hauptverkehrsstraße</div>`
            + dtvHero(Math.round(flow / 365), "DTV≈")
            + `<div class="pop-meta">${fmt(flow)} Kfz/Jahr · © UBA · END 2021</div>`;
    };

    const kmh = (v) => (v && /^\d+$/.test(String(v).trim())) ? `${v} km/h` : v;

    const fmtInt = (v) => (v === undefined || v === null || v === "") ? "—" : Math.round(Number(v)).toLocaleString("de-DE");

    return [
        {
            id: "telraam", kind: "context", eyebrow: "Telraam", layers: ["telraam"],
            render: (p) => `
                <div class="pop-title">Telraam-Zählstelle</div>
                <div class="pop-hero">${fmtInt(p.bike_per_day)} <span class="pop-unit">Ø Rad/Tag</span></div>
                <div class="pop-meta">${fmtInt(p.car_per_day)} Ø Auto/Tag · Ø letzte 2 Wochen</div>`,
            link: (p) => (p.oidn != null ? { href: `https://telraam.net/en/location/${p.oidn}`, label: "Telraam" } : null),
            openOnClick: true
        },
        {
            id: "svz", kind: "context", eyebrow: "Verkehrsmengen (SVZ)", layers: ["svz-points", "bast-points", "svz-lines"],
            render: renderSvz, link: svzLink
        },
        {
            id: "hvs", kind: "context", eyebrow: "Verkehrsmengen (UBA)", layers: ["hvs"],
            render: renderHvs, link: svzLink
        },
        {
            id: "uspeed", kind: "context", eyebrow: "Uber Movement", layers: ["uspeed-forward", "uspeed-reverse"],
            render: (p) => {
                // Wide-Format: Speed der aktuell im Slider gewählten Stunde aus speed_<h>
                const hour = parseInt(document.getElementById("uspeed-slider").value, 10);
                const speed = p[`speed_${hour}`];
                const speedNum = (speed !== undefined && speed !== null) ? Number(speed).toFixed(0) : null;
                const dirMap = { forward: "in Fahrtrichtung", backward: "Gegenrichtung" };
                const dir = dirMap[p.reconstruction_direction] || p.reconstruction_direction;
                return `
                    <div class="pop-title">Ø Geschwindigkeit</div>
                    <div class="pop-hero">${speedNum != null ? `${speedNum} <span class="pop-unit">km/h</span>` : "—"}</div>
                    <div class="pop-meta">um ${hour}:00 Uhr${dir ? ` · ${dir}` : ""}</div>`;
            },
            onClick: (f, e) => showUspeedChartPopup(f.properties, e.lngLat),
            clickHint: "→ Klick zeigt den Tagesverlauf"
        },
        {
            id: "maxspeed", kind: "context", eyebrow: "OSM",
            layers: [
                "maxspeed", "maxspeed-conditional", "maxspeed-forward", "maxspeed-backward",
                "maxspeed-conditional-forward", "maxspeed-conditional-backward",
                "maxspeed_minor", "maxspeed_minor-conditional", "maxspeed_minor-forward",
                "maxspeed_minor-backward", "maxspeed_minor-conditional-forward", "maxspeed_minor-conditional-backward"
            ],
            render: (p) => {
                const rows = [
                    row("Erlaubt", p.maxspeed ? kmh(p.maxspeed) : null),
                    row("Bedingt", p.maxspeed_conditional),
                    row("Straße", p.name),
                    row("Einordnung", p.maxspeed_type || p.highway),
                ].join("") || `<tr><td>Tempolimit</td><td>keine Angabe in OSM</td></tr>`;
                return `<div class="pop-title">Tempolimit</div><table class="pop-table">${rows}</table>`;
            },
            link: osmLink("way"), openOnClick: true
        }
    ];
}

function showUspeedChartPopup(p, lngLat) {
    // Wide-Format: das Feature trägt alle 24 Stunden-Werte selbst (speed_0..speed_23)
    // -> kein querySourceFeatures-Sammeln mehr (das fand nur geladene Tiles und
    // konnte Stunden im Chart unterschlagen). Fehlende Stunde = Attribut fehlt = null.
    const hourlySpeeds = [...Array(24).keys()].map(h =>
        p[`speed_${h}`] !== undefined ? Number(p[`speed_${h}`]) : null
    );

    const container = document.createElement("div");
    container.innerHTML = `
        <div class="pop-title">Ø Geschwindigkeit je Stunde</div>
        <div class="pop-meta" style="margin:-2px 0 6px;">OSM-Segment · Berlin, Q2 2019</div>
        <canvas id="speed-chart" width="320" height="180"></canvas>`;

    new maplibregl.Popup()
        .setLngLat(lngLat)
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


// ---------------------------------------------------------------------------
// Kontext-Layer, die noch NICHT in der Layer-Registry stehen (js/layers/registry.js).
// Schulen, Gesundheit, Spielplätze, Übergänge, Lärm, OBS, Stadtradeln und die Szenarien
// kommen von dort.
// ---------------------------------------------------------------------------

function contextEntries() {
    return [
        {
            id: "mapillary-ts", kind: "context", eyebrow: "Mapillary", layers: ["mapillary-ts"],
            render: (p) => `
                <div class="pop-title">Verkehrszeichen</div>
                <table class="pop-table">
                    ${row("Zeichen", p.value)}
                    ${row("Zuerst gesehen", p.first_seen_at ? formatDateDE(new Date(+p.first_seen_at).toISOString().slice(0, 10)) : null)}
                    ${row("Zuletzt gesehen", p.last_seen_at ? formatDateDE(new Date(+p.last_seen_at).toISOString().slice(0, 10)) : null)}
                </table>`
        }
    ];
}


// Alle Karten-Einträge an die gemeinsame Hover-Engine hängen. Die Reihenfolge hier
// ist egal — gestapelt wird in Render-Reihenfolge der getroffenen Layer.
export function allPopupEntries(map) {
    return [
        ...accidentEntries(map),
        ...trafficEntries(),
        ...contextEntries(),
        ...registryPopupEntries(),
    ];
}

export function setupPopups(map) {
    setupHoverPopup(map, allPopupEntries(map));
}
