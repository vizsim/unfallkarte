// Analyse-Szenarien (1/2/3/6/8/9). Alle folgen demselben Bau: Flächen ab z14 + Punkte z6–14
// aus EINER PMTiles-Datei mit den Layern "scenarioN-polys"/"scenarioN-points" — darum eine
// Fabrik statt sechs fast gleicher Blöcke. Optional: Schwellen-Regler (controls), der beide
// Layer filtert. Popups: multi -> überlappende Flächen desselben Szenarios werden alle gezeigt.
import { row } from "../ui/popupHelpers.js";
import { translations } from "../ui/accidentLabels.js";

const OUTLINE = "#1B4D3E";
const ALL = ["all"];

/**
 * @param {Object} o
 * @param {number} o.n                 Szenario-Nummer => id "scenario<n>", #toggle-scenario<n>, Permalink "sc<n>"
 * @param {string} [o.color]           Füll-/Punktfarbe
 * @param {number} [o.fillOpacity]     Deckkraft der Flächen
 * @param {Array}  [o.polysFilter]     Grundfilter Flächen (ein Regler ersetzt ihn beim Einschalten)
 * @param {Array}  [o.pointsFilter]    Grundfilter Punkte
 * @param {Object[]} [o.extraLayers]   zusätzliche Layer (über Flächen + Punkten gezeichnet)
 * @param {Object} [o.controls]        Schwellen-Regler, siehe js/ui/setupEntryControls.js
 * @param {Object} o.popup             PopupSpec (eyebrow, render, link?)
 * @returns {import("./registry.js").LayerEntry}
 */
function scenario({ n, color = "orange", fillOpacity = 0.8, polysFilter = ALL, pointsFilter = ALL, extraLayers = [], controls, popup }) {
    const id = `scenario${n}`;
    return {
        id, kind: "scenario",
        source: { id, manifest: id },
        // kein `permalink`-Zeichen: Szenarien stehen im eigenen Teil von ?p= (Checkbox-value "sc<n>")
        layers: [
            {
                id: `${id}-polys`, type: "fill", "source-layer": `${id}-polys`,
                minzoom: 14,
                filter: polysFilter,
                paint: { "fill-color": color, "fill-opacity": fillOpacity, "fill-outline-color": OUTLINE }
            },
            {
                id: `${id}-points`, type: "circle", "source-layer": `${id}-points`,
                minzoom: 6, maxzoom: 14,
                filter: pointsFilter,
                paint: {
                    "circle-color": color,
                    "circle-radius": ["interpolate", ["linear"], ["zoom"], 6, 4, 10, 8],
                    "circle-opacity": 0.8,
                    "circle-stroke-color": OUTLINE,
                    "circle-stroke-width": 1
                }
            },
            ...extraLayers,
        ],
        // Regler filtert nur Flächen + Punkte (nicht extraLayers)
        controls: controls && { filterLayers: [`${id}-polys`, `${id}-points`], ...controls },
        popups: [{ multi: true, layers: [`${id}-polys`, `${id}-points`], ...popup }],
    };
}

const minValue = (field) => ({ value }) => [">=", ["to-number", ["get", field]], value];

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

const severityRows = (p) => `
    ${row("Getötete", p.UKATEGORIE__1)}
    ${row("Schwerverletzte", p.UKATEGORIE__2)}
    ${row("Leichtverletzte", p.UKATEGORIE__3)}`;

// Sc2: die Pipeline liefert nur Einrichtungen mit > 2 Rad-/Fuß-Unfällen; der Grundfilter hält
// das zusätzlich im Frontend fest (Werte liegen als String im Tile).
const sc2Base = (geometry) => ["all",
    ["!", ["in", ["get", "biped_count"], ["literal", ["0", "1", "2"]]]],
    ["==", ["geometry-type"], geometry]];

/** @type {import("./registry.js").LayerEntry[]} */
export default [
    scenario({
        n: 1,
        polysFilter: ["==", ["geometry-type"], "Polygon"],
        controls: { container: "scenario1-slider-container", slider: "scenario1-slider", sliderLabel: "scenario1-slider-value", filter: minValue("cluster_size") },
        popup: {
            eyebrow: "Unfall-Häufung · Tempo 100",
            render: (p) => `
                <table class="pop-table">
                    ${row("Unfälle im Cluster", p.cluster_size)}
                    ${severityRows(p)}
                </table>`
        }
    }),
    scenario({
        n: 2,
        polysFilter: sc2Base("Polygon"), pointsFilter: sc2Base("Point"),
        controls: { container: "scenario2-slider-container", slider: "scenario2-slider", sliderLabel: "scenario2-slider-value", filter: minValue("biped_count") },
        popup: {
            eyebrow: "Schulumfeld · Unfälle",
            render: (p) => `
                <div class="pop-title">${p.name ?? "Schule / Kindergarten"} <span class="info-icon" data-tip="Gezählt: Unfälle ab 2020 (seit 2020 bundesweit einheitlich erfasst, inkl. 2025) im 50-m-Umfeld. Die Karte zeigt dagegen alle Jahre 2017–2025 — ältere Unfälle erscheinen als Punkte, ohne mitgezählt zu werden.">i</span></div>
                <table class="pop-table">
                    ${row("Art", p.amenity)}
                    ${row("Unfälle gesamt", p.total_count)}
                    ${row("… mit Radbeteiligung", p.bike_count)}
                    ${row("… mit Fußgängerbeteiligung", p.ped_count)}
                </table>
                <div class="pop-meta" style="margin-top:8px;">Im 50-m-Umfeld der Einrichtung. Ausgewählt: Schulen mit mehr als 2 Unfällen mit Rad-/Fußbeteiligung.</div>`
        }
    }),
    scenario({
        n: 3,
        popup: {
            eyebrow: "Kurzes Tempo-50-Segment",
            render: (p) => `
                <table class="pop-table">
                    <tr><td>Tempolimit</td><td>${p.maxspeed ? `${p.maxspeed} km/h` : "–"}</td></tr>
                    <tr><td>Straße</td><td>${p.name ?? "–"}</td></tr>
                    <tr><td>Länge</td><td>${p.length_m !== undefined ? `${Number(p.length_m).toFixed(0)} m` : "–"}</td></tr>
                </table>`
        }
    }),
    scenario({
        n: 6,
        // Flächen bewusst halbtransparent: darüber liegen die rot umrandeten Tempo-50-Abschnitte
        fillOpacity: 0.4,
        extraLayers: [{
            id: "scenario6-polys2", type: "line", "source-layer": "scenario6-polys2",
            minzoom: 14,
            filter: ALL,
            paint: { "line-color": "red", "line-width": 2 }
        }],
        popup: {
            eyebrow: "Schule · Tempo 50 nah",
            // Tiles tragen nur oid + Tempo-50-Länge (kein Name) -> beides zeigen, sonst sind
            // überlappende Buffer (Schulgelände + Kita-Node) im Stapel nicht unterscheidbar.
            render: (p) => `
                <div class="pop-title">${p.name ?? "Schule / Kindergarten"}</div>
                <table class="pop-table">
                    ${row("Art", p.amenity)}
                    ${row("Tempo 50 im Umfeld", p.total_tempo50_highway_length_m != null ? `${Math.round(Number(p.total_tempo50_highway_length_m))} m Straße` : null)}
                    ${row("OSM-Objekt", p.oid)}
                </table>
                <div class="pop-meta" style="margin-top:6px;">Im direkten Umfeld (30-m-Buffer) gibt es Straßenabschnitte, auf denen noch Tempo 50 gilt — rot umrandet auf der Karte.</div>`,
            link: (p) => (p.oid ? { href: `https://www.openstreetmap.org/${p.oid}`, label: "OpenStreetMap" } : null)
        }
    }),
    scenario({
        n: 8,
        controls: { container: "scenario8-slider-container", slider: "scenario8-slider", sliderLabel: "scenario8-slider-value", filter: minValue("max_laerm_num") },
        popup: {
            eyebrow: "Schule · Lärm",
            render: (p) => `
                <div class="pop-title">${p.name ?? "Unbenannte Schule"}</div>
                <div class="pop-hero pop-hero--sm">bis ${laermText(p.max_laerm_num)}</div>
                <div class="pop-meta">Lärm am Gebäude · Orientierungswert ~57 dB(A)</div>`,
            link: () => ({ href: "https://www.umweltbundesamt.de/themen/laerm/verkehrslaerm/strassenverkehrslaerm", label: "Umweltbundesamt · Straßenverkehrslärm" })
        }
    }),
    scenario({
        n: 9,
        color: "#c0392b",
        // Kombinierter Filter aus Min-Anzahl (n_max) und Kriterium (rule)
        controls: {
            container: "scenario9-controls", slider: "scenario9-slider", sliderLabel: "scenario9-slider-value", select: "scenario9-rule",
            filter: ({ value, select }) => ["all",
                [">=", ["to-number", ["get", "n_max"]], value],
                ...(select && select !== "all" ? [["==", ["get", "rule"], select]] : [])]
        },
        popup: {
            eyebrow: "Unfall-Häufung · M-Uko",
            render: (p) => {
                const utyp = Number(p.utyp);
                const utypText = utyp > 0 ? `${translations.UTYP1[utyp] ?? "-"} (${utyp})` : null;
                const crit = ruleCriteria[p.rule];
                return `
                    <div><span class="pop-flag">Auffällig</span></div>
                    ${crit ? `<div class="pop-meta" style="margin-top:0;">${crit}</div>` : ""}
                    <table class="pop-table" style="margin-top:7px;">
                        ${row("Unfalltyp", utypText)}
                        ${row("Unfälle (max.)", p.n_max)}
                        ${row("Zeitfenster", p.window_best)}
                        ${row("auffällige Fenster", p.n_windows)}
                        ${severityRows(p)}
                    </table>
                    <div class="pop-meta" style="margin-top:8px;">
                        Vereinfachte Analyse auf Unfallatlas-Basis (nur Unfälle mit Personenschaden) —
                        keine amtliche Feststellung einer Unfallhäufungsstelle durch die Unfallkommission.
                    </div>`;
            }
        }
    }),
];
