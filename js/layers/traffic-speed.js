// Geschwindigkeiten: Tempolimits aus OSM (maxspeed, 12 Layer aus einer Fabrik) und
// gefahrene Geschwindigkeiten aus Uber Movement (uspeed, mit Stunden-Regler).
import { row, osmLink } from "../ui/popupHelpers.js";
import { showUspeedChartPopup } from "../ui/uspeedChart.js";

// ---------------------------------------------------------------------------------------------
// Tempolimit: 2 Netze (Hauptstraßen / Nebenstraßen) × Richtung (beide / forward / backward)
// × bedingt (maxspeed:conditional -> gestrichelt). Gleiche Farblogik für alle, nur das
// ausgewertete Feld wechselt; Richtungs-Layer werden seitlich versetzt gezeichnet.
// ---------------------------------------------------------------------------------------------

// Farbe nach Tempolimit. "None" = unbegrenzt (schwarz); ohne Wert hilft maxspeed:type
// (DE:urban ≈ 50, DE:rural ≈ 100); sonst pink = keine Angabe in OSM.
const speedColor = (field) => ["case",
    ["==", ["get", field], "None"], "#000000",
    ["all", ["!", ["has", field]], ["==", ["get", "maxspeed_type"], "DE:urban"]], "#fdcc8a",
    ["all", ["!", ["has", field]], ["==", ["get", "maxspeed_type"], "DE:rural"]], "#e31a1c",
    ["!", ["has", field]], "#ff69b4",
    ["==", ["get", field], null], "#ff69b4",
    ["interpolate", ["linear"], ["to-number", ["get", field]],
        10, "#006400", 30, "#31a354", 50, "#fdcc8a", 100, "#e31a1c", 140, "#8B0000"]];

const NETWORKS = [
    {   // Hauptstraßen: Breite + Versatz wachsen mit dem Zoom
        prefix: "maxspeed", source: "maxspeed", sourceLayer: "highways",
        width: ["interpolate", ["linear"], ["zoom"], 10, 2.5, 17, 3, 18, 6, 20, 10],
        offset: (sign) => ["interpolate", ["linear"], ["zoom"], 10, sign * 1, 14, sign * 2, 18, sign * 5, 20, sign * 8],
    },
    {   // Nebenstraßen: dünn, fester Versatz
        prefix: "maxspeed_minor", source: "maxspeed_minor", sourceLayer: "highways_minor",
        width: 1.8,
        offset: (sign) => sign * 2.5,
    },
];

// Reihenfolge = Zeichenreihenfolge innerhalb eines Netzes (vom Golden-Snapshot festgehalten).
const VARIANTS = [
    { suffix: "-forward", dir: "forward", conditional: false },
    { suffix: "-backward", dir: "backward", conditional: false },
    { suffix: "", dir: null, conditional: false },
    { suffix: "-conditional", dir: null, conditional: true },
    { suffix: "-conditional-forward", dir: "forward", conditional: true },
    { suffix: "-conditional-backward", dir: "backward", conditional: true },
];

const hasTag = (tag, yes) => (yes ? ["has", tag] : ["!", ["has", tag]]);

function maxspeedLayers() {
    return NETWORKS.flatMap((net) => VARIANTS.map(({ suffix, dir, conditional }) => {
        const field = dir ? `maxspeed_${dir}` : "maxspeed";
        return {
            id: `${net.prefix}${suffix}`, type: "line", source: net.source, "source-layer": net.sourceLayer,
            // Richtungs-Layer: nur Wege MIT dem Richtungs-Tag; der Basis-Layer nur die OHNE beide
            filter: ["all",
                ...(dir ? [["has", field]] : [hasTag("maxspeed_forward", false), hasTag("maxspeed_backward", false)]),
                hasTag("maxspeed_conditional", conditional)],
            paint: {
                "line-color": speedColor(field),
                "line-width": net.width,
                ...(dir && { "line-offset": net.offset(dir === "forward" ? 1 : -1) }),
                ...(conditional && { "line-dasharray": [2, 2] }),
            }
        };
    }));
}

const kmh = (v) => ((v && /^\d+$/.test(String(v).trim())) ? `${v} km/h` : v);

// ---------------------------------------------------------------------------------------------
// uspeed (Uber Movement, Wide-Format): 1 Feature je Segment mit speed_0..speed_23.
// Der Stunden-Slider wechselt Attribut statt Feature: Filter prüft ["has", "speed_<h>"]
// (Stunden ohne Messwert fehlen als Attribut — sonst würde null->0 dunkelgrün rendern),
// line-color liest ["get", "speed_<h>"]. Genutzt von addLayers (initial, h=14) und
// applyUspeedHour (Toggle + Slider) -> eine Quelle.
export function uspeedFilterExpr(hour, direction) {
  return [
    "all",
    ["has", `speed_${hour}`],
    ["==", ["get", "reconstruction_direction"], direction]
  ];
}

export function uspeedColorExpr(hour) {
  return [
    "interpolate", ["linear"],
    ["to-number", ["get", `speed_${hour}`]],
    10, "#006400",
    30, "#31a354",
    50, "#fdcc8a",
    100, "#e31a1c"
  ];
}

export function applyUspeedHour(map, hour) {
  const directions = { "uspeed-forward": "forward", "uspeed-reverse": "reverse" };
  for (const [layer, direction] of Object.entries(directions)) {
    if (map.getLayer(layer)) {
      map.setFilter(layer, uspeedFilterExpr(hour, direction));
      map.setPaintProperty(layer, "line-color", uspeedColorExpr(hour));
    }
  }
}

const uspeedWidth = ["interpolate", ["linear"], ["zoom"], 10, 0.5, 12, 1.5, 13, 2.5, 16, 3.5, 20, 5];
const USPEED_DEFAULT_HOUR = 14;
const uspeedLayer = (direction, offset) => ({
    id: `uspeed-${direction}`, type: "line", "source-layer": "uber_movement_osm",
    filter: uspeedFilterExpr(USPEED_DEFAULT_HOUR, direction),
    paint: { "line-color": uspeedColorExpr(USPEED_DEFAULT_HOUR), "line-width": uspeedWidth, "line-offset": offset }
});

/** @type {import("./registry.js").LayerEntry[]} */
export default [
    {
        id: "maxspeed", kind: "context",
        sources: [{ id: "maxspeed", manifest: "maxspeed_major" }, { id: "maxspeed_minor", manifest: "maxspeed_minor" }],
        permalink: "s", dataMinZoom: 11,
        layers: maxspeedLayers(),
        popups: [{
            eyebrow: "OSM",
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
        }]
    },
    {
        id: "uspeed", kind: "context",
        source: { id: "uspeed", manifest: "uber_speed" },
        permalink: "u", dataMinZoom: 11,
        // forward ohne Versatz, reverse seitlich versetzt (wie bei maxspeed)
        layers: [
            uspeedLayer("forward", 0),
            uspeedLayer("reverse", ["interpolate", ["linear"], ["zoom"], 10, 0.5, 14, 4, 18, 8, 20, 12]),
        ],
        // Stunden-Regler: wechselt Filter + Farbe (kein reiner Filter -> apply statt filter)
        controls: {
            container: "uspeed-slider-container", slider: "uspeed-slider", sliderLabel: "uspeed-slider-value",
            debounceMs: 200,
            apply: (map, { value }) => applyUspeedHour(map, value),
        },
        popups: [{
            eyebrow: "Uber Movement",
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
            onClick: (f, e) => showUspeedChartPopup(e.target, f.properties, e.lngLat),
            clickHint: "→ Klick zeigt den Tagesverlauf"
        }]
    },
];
