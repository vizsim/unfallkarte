// Verkehrsmengen: UBA-Hauptverkehrsstraßen (hvs), SVZ der Länder + BASt (svz), Telraam-Zählstellen.
//
// hvs + svz teilen EINEN Master-Toggle (#toggle-svz) mit Unter-Haken je Quelle (Länder / BASt /
// UBA) und einem DTV|SV-Modus, der Farbe + Größe umschreibt — darum `toggle: "custom"` und die
// Verdrahtung in setup(). hvs ist ein eigener Eintrag (eigene Quelle, eigenes Permalink-Zeichen,
// wird UNTER svz gezeichnet), sein Haken #toggle-hvs ist einer der Unter-Haken.

// Telraam: Linienfarbe nach Modus (Auto/Rad), Skala = Ø/Tag (letzte 2 Wochen).
// Segmente ohne aggregierte Daten (Attribut fehlt) -> grau. Breakpoints aus den
// Daten-Perzentilen (siehe pipeline). Wird von addLayers (initial) und
// setupTelraamMode (Umschalter) genutzt -> eine Quelle.
export function telraamColorExpr(mode) {
  // Breakpoints ≈ Perzentile der 452 aktiven DE-Segmente (Auto-Median ~1040, Rad ~350).
  const scales = {
    car: {
      attr: "car_per_day",
      stops: [0, 300, 1000, 3500, 9000],
      colors: ["#ffffb2", "#fecc5c", "#fd8d3c", "#f03b20", "#bd0026"]
    },
    bike: {
      attr: "bike_per_day",
      stops: [0, 100, 350, 750, 1500],
      colors: ["#ffffcc", "#c2e699", "#78c679", "#31a354", "#006837"]
    }
  };
  const c = scales[mode] || scales.bike;
  const interp = ["interpolate", ["linear"], ["to-number", ["get", c.attr]]];
  for (let i = 0; i < c.stops.length; i++) interp.push(c.stops[i], c.colors[i]);
  return ["case", ["has", c.attr], interp, "#bbbbbb"];
}

// --- SVZ-Verkehrsmengen: Größen-Expressions (Modus "dtv" | "sv") --------------------
// MONOCHROM: alle Features schwarz — die MENGE steckt ALLEIN in der Größe
// (Linienbreite bzw. Kreisradius), damit stark befahrene Straßen/Stellen dick
// herausstechen. Der Modus (DTV bzw. SV-Anteil %) steuert, WELCHE Größe die Dicke
// kodiert. Genutzt von addLayers (initial) und setupSvzMode (Umschalter) -> eine
// Quelle. dtv_kfz/dtv_sv/sv_anteil landen z.T. als String im Tile -> immer to-number.
const SVZ_NODATA = "#b4b4b4";

// SV-Anteil je Feature: direkt sv_anteil (%), sonst aus dtv_sv/dtv_kfz berechnet.
const svzSvShare = [
  "case",
  ["has", "sv_anteil"], ["to-number", ["get", "sv_anteil"]],
  ["*", ["/", ["to-number", ["get", "dtv_sv"]], ["to-number", ["get", "dtv_kfz"]]], 100]
];
const svzHasSv = [
  "any",
  ["has", "sv_anteil"],
  ["all", ["has", "dtv_sv"], ["has", "dtv_kfz"], [">", ["to-number", ["get", "dtv_kfz"]], 0]]
];
const svzValue = (mode) => (mode === "sv" ? svzSvShare : ["to-number", ["get", "dtv_kfz"]]);
const svzHas = (mode) => (mode === "sv" ? svzHasSv : ["has", "dtv_kfz"]);

// Schwarz für alle Features mit Wert; no-data bleibt grau (unterscheidbar von klein).
const SVZ_INK = "#222";
// 5 Klassen-Schwellen je Modus (Reihenfolge = Legendenzeilen).
export const SVZ_BREAKS = { dtv: [0, 5000, 15000, 30000, 50000], sv: [0, 5, 10, 20, 30] };
// Größen-Rampen (px, vor Zoom-Faktor): Linienbreite bzw. Kreisradius je Klasse.
const SVZ_WIDTHS = [0.8, 1.5, 2.5, 4, 6];
const SVZ_RADII = [2.5, 3.5, 5, 7, 10];
export function svzColorExpr(mode) {
  // Monochrom: schwarz bei vorhandenem Wert, grau bei „keine Angabe". Keine Farbrampe.
  return ["case", svzHas(mode), SVZ_INK, SVZ_NODATA];
}

// Größe = Menge UND Zoom. MapLibre erlaubt "zoom" NUR ganz außen in interpolate/step;
// deshalb Zoom-Kurve außen, je Zoom-Stufe eine (skalierte) Daten-Größenrampe (value->px)
// als Output — die inneren Ausdrücke dürfen KEIN zoom enthalten. no-data -> kleinste
// Klasse. Generisch über valueExpr/hasExpr/breaks, damit SVZ (dtv_kfz / SV-Anteil) UND
// UBA (annualTrafficFlow ÷ 365) DIESELBE schwarze Größenkodierung + Legende teilen.
const SVZ_ZOOM_STOPS = [[6, 0.55], [11, 0.8], [14, 1.0], [16, 1.4], [18, 1.8]];
function sizeExpr(valueExpr, hasExpr, breaks, baseValues) {
  const zi = ["interpolate", ["linear"], ["zoom"]];
  for (const [z, f] of SVZ_ZOOM_STOPS) {
    const scaled = baseValues.map((v) => Math.round(v * f * 100) / 100);
    const ramp = ["interpolate", ["linear"], valueExpr];
    for (let i = 0; i < breaks.length; i++) ramp.push(breaks[i], scaled[i]);
    zi.push(z, ["case", hasExpr, ramp, scaled[0]]);
  }
  return zi;
}
const svzBreaks = (mode) => SVZ_BREAKS[mode === "sv" ? "sv" : "dtv"];

export function svzWidthExpr(mode) {
  return sizeExpr(svzValue(mode), svzHas(mode), svzBreaks(mode), SVZ_WIDTHS);
}
export function svzRadiusExpr(mode) {
  return sizeExpr(svzValue(mode), svzHas(mode), svzBreaks(mode), SVZ_RADII);
}

// UBA-Hauptverkehrsstraßen: annualTrafficFlow (Kfz/Jahr) -> Tages-DTV≈ (÷365), gleiche
// schwarze Größenkodierung + DTV-Schwellen wie SVZ -> passt in DIESELBE Legende.
const HVS_DAILY = ["/", ["to-number", ["get", "annualTrafficFlow"]], 365];
const HVS_HAS = ["has", "annualTrafficFlow"];
export function hvsColorExpr() {
  return ["case", HVS_HAS, SVZ_INK, SVZ_NODATA];
}
export function hvsWidthExpr() {
  return sizeExpr(HVS_DAILY, HVS_HAS, SVZ_BREAKS.dtv, SVZ_WIDTHS);
}

// Unterhalb z9 gestaffelt filtern, sonst wird die Übersicht ein Teppich: z6-7 nur DTV >= 15000,
// z8 >= 5000, ab z9 alles. no-data fällt darunter mit raus (to-number(fehlend) = 0). Bewusst
// DTV-basiert, unabhängig vom Anzeige-Modus dtv|sv. ["zoom"] in Filtern wird an ganzzahligen
// Zoomstufen ausgewertet.
const lowZoomFilter = (dailyExpr) => ["any",
    [">=", ["zoom"], 9],
    ["all", [">=", ["zoom"], 8], [">=", dailyExpr, 5000]],
    [">=", dailyExpr, 15000],
];
const svzLowZoomFilter = lowZoomFilter(["to-number", ["get", "dtv_kfz"]]);
const ROUND = { "line-cap": "round", "line-join": "round" };
const svzCircle = () => ({
    "circle-color": svzColorExpr("dtv"),
    "circle-opacity": 0.9,
    "circle-stroke-color": "#ffffff",
    "circle-stroke-width": 0.7,
    "circle-radius": svzRadiusExpr("dtv")
});

// ---------------------------------------------------------------------------------------------
// Popups
// ---------------------------------------------------------------------------------------------
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

const fmtInt = (v) => (v === undefined || v === null || v === "") ? "—" : Math.round(Number(v)).toLocaleString("de-DE");

// ---------------------------------------------------------------------------------------------
// Toggle-Logik
// ---------------------------------------------------------------------------------------------

// Verkehrsmengen: 1 Master-Toggle + 3 Quellen-Unterhaken (Länder/BASt/UBA) + DTV/SV-Modus.
function setupVerkehrsmengen(map, { zoomLock, applyLegendVisibility, updateLegendVisibilityByZoom, ensure }) {
  const master = document.getElementById("toggle-svz");
  if (!master) return;
  const kids = document.getElementById("svz-children");
  const ubaCb = document.getElementById("toggle-hvs");
  const groups = [
    { cb: document.getElementById("toggle-svz-laender"), layers: ["svz-lines", "svz-points"], dtvOnly: false },
    { cb: document.getElementById("toggle-svz-bast"), layers: ["bast-points"], dtvOnly: false },
    { cb: ubaCb, layers: ["hvs"], dtvOnly: true },
  ];
  let mode = "dtv";

  // Farbe + Größe aller SVZ-Layer nach dem aktuellen Modus (nur Layer, die schon existieren)
  const paintMode = () => {
    if (map.getLayer("svz-lines")) {
      map.setPaintProperty("svz-lines", "line-color", svzColorExpr(mode));
      map.setPaintProperty("svz-lines", "line-width", svzWidthExpr(mode));
    }
    for (const id of ["svz-points", "bast-points"]) {
      if (!map.getLayer(id)) continue;
      map.setPaintProperty(id, "circle-color", svzColorExpr(mode));
      map.setPaintProperty(id, "circle-radius", svzRadiusExpr(mode));
    }
  };

  const applyLayers = () => {
    const on = master.checked;
    if (on && !map.getLayer("svz-lines")) {
      // Lazy: beim ersten Einschalten anlegen (hvs gehört als Unter-Haken dazu) — die Layer
      // entstehen im DTV-Default, darum direkt auf den gewählten Modus bringen.
      ensure("hvs");
      ensure("svz");
      paintMode();
    }
    for (const g of groups) {
      const modeOk = !g.dtvOnly || mode === "dtv";
      const vis = (on && g.cb && g.cb.checked && modeOk) ? "visible" : "none";
      for (const id of g.layers) {
        if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", vis);
      }
    }
    if (kids) kids.style.display = on ? "block" : "none";
    // UBA hat keinen SV-Anteil -> im SV-Modus Unterhaken deaktivieren (+ Hinweis).
    if (ubaCb) {
      const off = mode !== "dtv";
      ubaCb.disabled = off;
      const lab = ubaCb.closest("label");
      if (lab) {
        lab.style.opacity = off ? "0.45" : "";
        lab.title = off ? "UBA-Hauptverkehrsstraßen haben keinen SV-Anteil — nur im DTV-Modus." : "";
      }
    }
    zoomLock();
    applyLegendVisibility();
    updateLegendVisibilityByZoom(map);
  };

  const applyMode = (m) => {
    mode = m;
    paintMode();
    document.querySelectorAll(".svz-ramp").forEach(el => {
      el.style.display = el.dataset.mode === mode ? "block" : "none";
    });
    applyLayers(); // UBA-Sichtbarkeit + disabled-Status an den Modus anpassen
  };

  master.addEventListener("change", applyLayers);
  for (const g of groups) if (g.cb) g.cb.addEventListener("change", applyLayers);
  document.querySelectorAll('input[name="svz-mode"]').forEach(r =>
    r.addEventListener("change", () => {
      const sel = document.querySelector('input[name="svz-mode"]:checked');
      applyMode(sel ? sel.value : "dtv");
    })
  );

  const initMode = document.querySelector('input[name="svz-mode"]:checked');
  applyMode(initMode ? initMode.value : "dtv"); // ruft applyLayers()
}

// Telraam-Umschalter Auto/Rad: setzt die Linienfarbe auf den gewählten Modus und zeigt die
// passende Farb-Rampe.
function setupTelraamMode(map) {
  const radios = document.querySelectorAll('input[name="telraam-mode"]');
  if (!radios.length) return;

  const apply = (mode) => {
    if (map.getLayer("telraam")) {
      map.setPaintProperty("telraam", "line-color", telraamColorExpr(mode));
    }
    document.querySelectorAll(".telraam-ramp").forEach(el => {
      el.style.display = el.dataset.mode === mode ? "block" : "none";
    });
  };

  const current = () => document.querySelector('input[name="telraam-mode"]:checked')?.value ?? "bike";
  radios.forEach(r => r.addEventListener("change", () => apply(current())));
  // Lazy: der Layer entsteht erst beim Einschalten (im Rad-Default) -> gewählten Modus nachziehen.
  // (Dieser Listener läuft NACH dem generischen Toggle, der den Layer anlegt.)
  document.getElementById("toggle-telraam")?.addEventListener("change", (e) => {
    if (e.target.checked) apply(current());
  });

  const init = document.querySelector('input[name="telraam-mode"]:checked');
  apply(init ? init.value : "bike");
}

/** @type {import("./registry.js").LayerEntry[]} */
export default [
    {
        id: "hvs", kind: "context",
        source: { id: "hvs", manifest: "hvs" },
        permalink: "h",
        toggle: "custom", // Unter-Haken von svz (siehe setupVerkehrsmengen)
        layers: [{
            // Ab z6 (Tiles seit Rebuild ab z6), unterhalb z9 gestaffelt wie SVZ — auf Basis des
            // Tages-DTV≈ (annualTrafficFlow ÷ 365).
            id: "hvs", type: "line", "source-layer": "lines",
            minzoom: 6,
            filter: lowZoomFilter(HVS_DAILY),
            layout: ROUND,
            paint: { "line-color": hvsColorExpr(), "line-opacity": 0.9, "line-width": hvsWidthExpr() }
        }],
        popups: [{ eyebrow: "Verkehrsmengen (UBA)", render: renderHvs, link: svzLink }]
    },
    {
        id: "svz", kind: "context",
        sources: [{ id: "svz", manifest: "svz" }, { id: "svz_bast", manifest: "svz_bast" }],
        permalink: "v", dataMinZoom: 9,
        toggle: "custom",
        setup: setupVerkehrsmengen,
        layers: [
            {   // Länder-Segmente (Zählstellenbereiche, Linien)
                id: "svz-lines", type: "line", "source-layer": "svz",
                minzoom: 6,
                filter: svzLowZoomFilter,
                layout: ROUND,
                paint: { "line-color": svzColorExpr("dtv"), "line-opacity": 0.9, "line-width": svzWidthExpr("dtv") }
            },
            {   // Zählstellen-Punkte der Länder (BW/SL als Punkte)
                id: "svz-points", type: "circle", "source-layer": "svz_points",
                minzoom: 6,
                filter: svzLowZoomFilter,
                paint: svzCircle()
            },
            {   // BASt-Backbone (Bundesfernstraßen A+B, Punkte) — eigene Quelle
                id: "bast-points", type: "circle", source: "svz_bast", "source-layer": "bast",
                minzoom: 6,
                filter: svzLowZoomFilter,
                paint: svzCircle()
            },
        ],
        popups: [{ layers: ["svz-points", "bast-points", "svz-lines"], eyebrow: "Verkehrsmengen (SVZ)", render: renderSvz, link: svzLink }]
    },
    {
        id: "telraam", kind: "context",
        source: { id: "telraam_segments", manifest: "telraam_segments" },
        permalink: "z", dataMinZoom: 9,
        setup: setupTelraamMode,
        layers: [{
            // Telraam-Zählstellen (kurze Straßensegmente, CC BY-NC). source-layer + oidn =
            // Frontend-Vertrag (siehe pipeline telraam.py / tiles.yaml).
            id: "telraam", type: "line", "source-layer": "telraam_segments",
            layout: ROUND,
            paint: {
                "line-color": telraamColorExpr("bike"), // Default-Modus; setupTelraamMode schaltet um
                "line-opacity": 0.9,
                "line-width": ["interpolate", ["linear"], ["zoom"], 9, 2, 13, 4, 16, 7]
            }
        }],
        popups: [{
            eyebrow: "Telraam",
            render: (p) => `
                <div class="pop-title">Telraam-Zählstelle</div>
                <div class="pop-hero">${fmtInt(p.bike_per_day)} <span class="pop-unit">Ø Rad/Tag</span></div>
                <div class="pop-meta">${fmtInt(p.car_per_day)} Ø Auto/Tag · Ø letzte 2 Wochen</div>`,
            link: (p) => (p.oidn != null ? { href: `https://telraam.net/en/location/${p.oidn}`, label: "Telraam" } : null),
            openOnClick: true
        }]
    },
];
