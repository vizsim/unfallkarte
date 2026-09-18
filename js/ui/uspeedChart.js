// Uber-Speed: Klick auf ein Segment zeigt den Tagesverlauf (24 Stundenwerte) als Chart-Popup.

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

export function showUspeedChartPopup(map, p, lngLat) {
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
