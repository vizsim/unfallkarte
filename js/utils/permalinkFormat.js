// permalinkFormat.js — Karten-Zustand <-> URL-Query. REIN: kein DOM, keine Karte, kein window.
// Darum ohne Browser testbar (`npm run test:unit`, tests/unit/permalinkFormat.test.js).
//
// Format v2 — benannt, versioniert, und es schreibt nur, was vom Default abweicht:
//
//   ?v=2&map=<zoom>/<lat>/<lng>&uk=…&bet=…&jahr=…&typ=…&art=…&s=…&d=1&l=…&n=…&o=…&sel=g:…
//
// Startansicht = `?v=2&map=12.00/52.31500/13.63400` — mehr nicht. Jeder weitere Parameter ist
// optional, benannt und unabhängig: neuer Zustand = NEUER Parameter, ohne die Bedeutung der
// bestehenden zu verschieben.
//
// Das war der Kernfehler von v1:  ?p=<lat>,<lng>,<zoom>,<Stil>,<Filter>,<Szenarien>,<Kontext>
// rein positionsbasiert und ohne Version — jedes neue Feld hing hinten dran, ein fehlendes
// Komma verschob alles, und Regler/Modi passten nirgends hinein (sie fehlten komplett; ein
// geteilter Link zeigte Szenario-Flächen ungefiltert und die Uber-Stunde immer auf 14 Uhr).
// v1 wird weiter GELESEN (parseLegacy) und beim ersten Laden auf v2 hochgeschrieben — alte
// geteilte Links bleiben gültig.
//
// Bewusst NICHT kodiert/„gehasht": Kontext-Layer und Szenarien stehen schon bei EINEM Zeichen
// je Layer (`l=cdz`), da gewinnt keine Kodierung etwas. Und eine Bitmaske über die Unfall-
// Filter spart gegenüber „Defaults weglassen" im schlechtesten Fall ein einziges Zeichen,
// kostet aber die Lesbarkeit und macht die Bit-Reihenfolge zum harten Vertrag (ein neues
// Unfalljahr würde alle alten Links verschieben).
//
// VERTRAG: Alle Kürzel hier stecken in geteilten Links — nie neu vergeben, nur ergänzen.

import { registryPermalinkKeys } from "../layers/registry.js";

export const PERMALINK_VERSION = "2";

/**
 * @typedef {Object} MapState  Der vollständige teilbare Zustand.
 * @property {{lat: number, lng: number, zoom: number}} [view]
 * @property {string} [style]                      Einfärbung: UKATEGORIE | BETEILIGUNG | …
 * @property {Record<string, string[]>} [filters]  FILTER_GROUPS -> ausgewählte Werte
 * @property {boolean} [details]                   Beteiligungs-Buchstaben (#toggle-details)
 * @property {string} [cluster]                    Cluster-Ansicht: UKATEGORIE (Torten) | IstRad | …
 * @property {string[]} [layers]                   Kontext-Layer: Toggle-IDs
 * @property {string[]} [scenarios]                Checkbox-Werte: "sc1" …
 * @property {Record<string, string>} [controls]   CONTROLS-Kürzel -> Wert
 * @property {Object|null} [area]                  gezeichnetes Gebiet (GeoJSON-Polygon) — ?sel=g:
 */

// --- Kontext-Layer (?l=): Toggle-ID -> EIN Zeichen --------------------------------------
// Reserviert (früher Terrain/Hillshade): t, i.
export const kontextKeys = {
    // noch nicht in der Layer-Registry (eigene Module): Mapillary, Radinfrastruktur
    mapillary: "m",
    mapillary_ts: "y",
    bikelanes: "f",
    ...registryPermalinkKeys(),
};

// Zeichen früherer Layer, die heute ein MODUS eines anderen Eintrags sind. Sie stecken in
// geteilten Links, bleiben also reserviert und werden beim Lesen auf Layer + Modus abgebildet.
export const LEGACY_LAYER_CHARS = {
    r: { layer: "laerm1", controls: { lm: "night" } }, // „Lärm (Nacht)" bis 2026-09, jetzt Chip
};
export const RESERVED_LAYER_CHARS = ["t", "i", ...Object.keys(LEGACY_LAYER_CHARS)];
for (const [id, ch] of Object.entries(kontextKeys)) {
    if (RESERVED_LAYER_CHARS.includes(ch)) throw new Error(`Permalink: Zeichen "${ch}" (${id}) ist reserviert`);
}

// --- Unfall-Filter: je Dimension EIN benannter Parameter ---------------------------------
// Benannt statt positionsbasiert, damit eine Dimension wegfallen kann, wenn sie auf Default
// steht — das ist der eigentliche Längen-Hebel (Startansicht: 112 -> 32 Zeichen).
export const FILTER_PARAMS = {
    UKATEGORIE: "uk",
    BETEILIGUNG: "bet",
    UJAHR: "jahr",
    UTYP1: "typ",
    UART: "art",
};
export const FILTER_GROUPS = Object.keys(FILTER_PARAMS);

export const beteiligungMap = {
    IstRad: "1", IstPKW: "2", IstFuss: "3", IstKrad: "4", IstGkfz: "5", IstSonstig: "6",
};

// Jahre brauchen keine Tabelle: 2017 <-> "17". (v1 pflegte dafür eine Liste, die bei jedem
// neuen Datenjahr nachgezogen werden musste — 2026 hätte darin gefehlt und wäre still aus
// jedem geteilten Link gefallen.)
const encodeYear = (year) => String(year).slice(-2);
const decodeYear = (code) => (/^\d{2}$/.test(code) ? String(2000 + Number(code)) : null);

// Cluster-Ansicht (?cl=): Beteiligungen mit ihren ?bet=-Ziffern, dazu der Trend.
export const clusterCodes = { ...beteiligungMap, TREND: "t" };

export const styleShortMap = {
    UKATEGORIE: "U", BETEILIGUNG: "B", UJAHR: "J", UTYP1: "T", UART: "A",
};

// --- Regler & Modi (?o=) ----------------------------------------------------------------
// `kind` beschreibt die DOM-Bindung (nur js/utils/permalinkState.js wertet sie aus) — bewusst
// in DERSELBEN Tabelle, damit Kürzel und Ziel nicht auseinanderlaufen können.
export const CONTROLS = [
    { key: "c1", target: "scenario1-slider", kind: "slider" },
    { key: "c2", target: "scenario2-slider", kind: "slider" },
    { key: "c8", target: "scenario8-slider", kind: "slider" },
    { key: "c9", target: "scenario9-slider", kind: "slider" },
    { key: "c9r", target: "scenario9-rule", kind: "select" },
    { key: "uh", target: "uspeed-slider", kind: "slider" },   // Uber: Stunde 0–23
    { key: "vm", target: "svz-mode", kind: "radio" },         // Verkehrsmengen: dtv | sv
    { key: "vl", target: "toggle-svz-laender", kind: "check" },
    { key: "vb", target: "toggle-svz-bast", kind: "check" },
    { key: "tm", target: "telraam-mode", kind: "radio" },     // Telraam: bike | car
    { key: "pm", target: "population-mode", kind: "radio" },  // Einwohner: ew | u18 | a65 | alter
    { key: "lm", target: "laerm-mode", kind: "radio" },       // Lärm: den | night
];

const reverse = (obj) => Object.fromEntries(Object.entries(obj).map(([k, v]) => [v, k]));
const split = (str, sep) => (str ?? "").split(sep).filter(Boolean);
const sameSet = (a = [], b = []) => a.length === b.length && [...a].sort().join("\u0000") === [...b].sort().join("\u0000");

// --- Jahres-Bereiche: 17_18_19_20 -> 17-20 -----------------------------------------------
// Nur für Jahre: dort ist „ein zusammenhängender Zeitraum" der normale Fall. Bei UART wäre es
// eine Falle — dessen Werte laufen 1…9 und dann 0, eine Sortierung würde die Null verschieben.
function packYears(codes) {
    const nums = codes.map(Number).sort((a, b) => a - b);
    const out = [];
    for (let i = 0; i < nums.length;) {
        let j = i;
        while (j + 1 < nums.length && nums[j + 1] === nums[j] + 1) j++;
        const pad = (n) => String(n).padStart(2, "0");
        out.push(j - i >= 2 ? `${pad(nums[i])}-${pad(nums[j])}` : nums.slice(i, j + 1).map(pad).join("_"));
        i = j + 1;
    }
    return out.join("_");
}

function unpackYears(raw) {
    return split(raw, "_").flatMap((part) => {
        const [from, to] = part.split("-");
        if (to == null) return [from];
        const out = [];
        for (let n = Number(from); n <= Number(to); n++) out.push(String(n).padStart(2, "0"));
        return out;
    });
}

// --- Gebiet (?sel=g:<Polyline>) ------------------------------------------------------------
// Encoded Polyline (Google), 5 Nachkommastellen ≈ 1 m, Punkte als [Breite, Länge] — jeder
// Polyline-Dekodierer liest das. Der Ring steht OHNE den schließenden Punkt im Link. `g:` lässt
// Platz für weitere Auswahlarten (z. B. ein Kreis um eine Kreuzung).

function encodeSigned(value) {
    let v = value < 0 ? ~(value << 1) : value << 1;
    let out = "";
    while (v >= 0x20) {
        out += String.fromCharCode((0x20 | (v & 0x1f)) + 63);
        v >>= 5;
    }
    return out + String.fromCharCode(v + 63);
}

/** [[lat, lng], …] -> Polyline-String. */
export function encodePolyline(points, precision = 5) {
    const f = 10 ** precision;
    let prevLat = 0;
    let prevLng = 0;
    let out = "";
    for (const [lat, lng] of points) {
        const a = Math.round(lat * f);
        const b = Math.round(lng * f);
        out += encodeSigned(a - prevLat) + encodeSigned(b - prevLng);
        prevLat = a;
        prevLng = b;
    }
    return out;
}

/** Polyline-String -> [[lat, lng], …]; wirft bei kaputtem Text. */
export function decodePolyline(str, precision = 5) {
    const f = 10 ** precision;
    const points = [];
    let i = 0;
    const next = () => {
        let result = 0;
        let shift = 0;
        let b;
        do {
            if (i >= str.length) throw new Error("Polyline bricht ab");
            b = str.charCodeAt(i++) - 63;
            if (b < 0 || b > 63) throw new Error("Polyline: ungültiges Zeichen");
            result |= (b & 0x1f) << shift;
            shift += 5;
        } while (b >= 0x20);
        return result & 1 ? ~(result >> 1) : result >> 1;
    };
    let lat = 0;
    let lng = 0;
    while (i < str.length) {
        lat += next();
        lng += next();
        points.push([lat / f, lng / f]);
    }
    return points;
}

const encodeArea = (polygon) => {
    const ring = polygon.coordinates[0];
    const open = ring.length > 1 && ring[0][0] === ring.at(-1)[0] && ring[0][1] === ring.at(-1)[1] ? ring.slice(0, -1) : ring;
    // Das Polyline-Alphabet (? @ [ \ ] ^ ` { | }) übersteht Messenger nur prozentkodiert.
    return `g:${encodeURIComponent(encodePolyline(open.map(([lng, lat]) => [lat, lng])))}`;
};

function decodeArea(raw) {
    if (!raw.startsWith("g:")) return undefined;
    try {
        const ring = decodePolyline(raw.slice(2)).map(([lat, lng]) => [lng, lat]);
        return ring.length >= 3 ? { type: "Polygon", coordinates: [[...ring, ring[0]]] } : undefined;
    } catch {
        return undefined;   // kaputter Link: Gebiet weglassen, Rest der Ansicht trotzdem zeigen
    }
}

// --- Serialisieren -----------------------------------------------------------------------

const encodeFilterGroup = (group, values = []) => {
    if (group === "BETEILIGUNG") return values.map((v) => beteiligungMap[v] ?? v).join("_");
    if (group === "UJAHR") return packYears(values.map(encodeYear));
    return values.join("_");
};

/**
 * Zustand -> Query-String OHNE führendes "?".
 *
 * `defaults` ist der Zustand, mit dem die App startet (aus dem HTML gelesen, siehe
 * permalinkState.readState) — alles, was damit übereinstimmt, fällt aus der URL. Dadurch
 * bleibt das Modul rein: es kennt die HTML-Defaults nicht, es bekommt sie gesagt.
 *
 * Bewusst von Hand gebaut statt via URLSearchParams: das hielte den Link lesbar-frei von
 * %2C/%2F-Kaskaden. Alle verwendeten Trennzeichen (`/` `_` `-` `:` `,`) sind in einer Query erlaubt.
 */
export function serialize(state, defaults = {}) {
    const { view, style, filters, details, cluster, layers, scenarios, controls, area } = state;
    const pairs = [["v", PERMALINK_VERSION]];

    // Ansicht steht immer drin — sie ist der Zweck des Links (Konvention wie bei OSM: z/lat/lng).
    if (view) pairs.push(["map", [view.zoom.toFixed(2), view.lat.toFixed(5), view.lng.toFixed(5)].join("/")]);

    if (filters) {
        for (const group of FILTER_GROUPS) {
            if (sameSet(filters[group], defaults.filters?.[group])) continue;
            // Leere Auswahl ist ein echter Zustand ("nichts ausgewählt" -> Layer blendet aus)
            // und muss sich von "Parameter fehlt" unterscheiden: dafür der Bindestrich.
            pairs.push([FILTER_PARAMS[group], encodeFilterGroup(group, filters[group]) || "-"]);
        }
    }
    if (style && style !== defaults.style) pairs.push(["s", styleShortMap[style] ?? style]);
    if (details != null && details !== defaults.details) pairs.push(["d", details ? "1" : "0"]);
    // Cluster-Ansicht (?cl=): Anteil EINER Beteiligung, gleiche Ziffern wie ?bet= (1 = Rad …),
    // oder t = Trend; Default (Torten nach Schwere) fällt weg.
    if (cluster && cluster !== defaults.cluster && clusterCodes[cluster]) pairs.push(["cl", clusterCodes[cluster]]);
    if (layers && !sameSet(layers, defaults.layers)) {
        pairs.push(["l", layers.map((id) => kontextKeys[id]).filter(Boolean).sort().join("") || "-"]);
    }
    if (scenarios && !sameSet(scenarios, defaults.scenarios)) {
        pairs.push(["n", scenarios.map((s) => String(s).replace(/^sc/, "")).sort().join("_") || "-"]);
    }
    if (controls) {
        const changed = CONTROLS
            .filter((c) => controls[c.key] != null && controls[c.key] !== defaults.controls?.[c.key])
            .map((c) => `${c.key}:${controls[c.key]}`);
        if (changed.length) pairs.push(["o", changed.join(",")]);
    }
    if (area) pairs.push(["sel", encodeArea(area)]);

    return pairs.map(([key, value]) => `${key}=${value}`).join("&");
}

// --- Parsen ------------------------------------------------------------------------------

const reverseBeteiligung = reverse(beteiligungMap);
const reverseStyle = reverse(styleShortMap);
const reverseCluster = reverse(clusterCodes);
const reverseKontext = reverse(kontextKeys);
const controlByKey = Object.fromEntries(CONTROLS.map((c) => [c.key, c]));

const decodeFilterGroup = (group, raw) => {
    if (raw === "-") return [];
    if (group === "BETEILIGUNG") return split(raw, "_").map((c) => reverseBeteiligung[c]).filter(Boolean);
    if (group === "UJAHR") return unpackYears(raw).map(decodeYear).filter(Boolean);
    return split(raw, "_");
};

const decodeLayers = (raw) => (raw === "-" ? [] : (raw ?? "").split("").map((ch) => reverseKontext[ch]).filter(Boolean));

/**
 * Frühere Layer-Zeichen (LEGACY_LAYER_CHARS) auf Layer + Modus abbilden. Ist der Ziel-Layer
 * schon über sein eigenes Zeichen an (alter Link mit beiden Lärm-Haken), bleibt dessen
 * Default-Modus — gezeigt wird ohnehin nur einer. Ein Modus, der ausdrücklich im Link steht,
 * gewinnt immer.
 */
function applyLegacyLayerChars(state, raw) {
    for (const [ch, { layer, controls }] of Object.entries(LEGACY_LAYER_CHARS)) {
        if (raw === "-" || !(raw ?? "").includes(ch)) continue;
        const layers = state.layers ?? [];
        if (layers.includes(layer)) continue;
        state.layers = [...layers, layer];
        state.controls = { ...controls, ...state.controls };
    }
    return state;
}

const decodeControls = (raw) => Object.fromEntries(split(raw, ",").flatMap((pair) => {
    const at = pair.indexOf(":");
    if (at < 0) return [];
    const key = pair.slice(0, at);
    // Unbekannte Kürzel still verwerfen: ein Link aus einer neueren Version darf eine ältere
    // Version nicht in die Konsole schreiben lassen.
    return controlByKey[key] ? [[key, pair.slice(at + 1)]] : [];
}));

const decodeView = (raw, order) => {
    const parts = split(raw, order === "map" ? "/" : ",").map(Number);
    const [zoom, lat, lng] = order === "map" ? parts : [parts[2], parts[0], parts[1]];
    return [lat, lng, zoom].every(Number.isFinite) ? { lat, lng, zoom } : undefined;
};

function parseV2(params) {
    /** @type {MapState} */
    const state = {};
    const set = (key, raw, decode) => {
        if (raw == null) return;
        const value = decode(raw);
        if (value !== undefined) state[key] = value;
    };

    set("view", params.get("map"), (raw) => decodeView(raw, "map"));
    set("style", params.get("s"), (raw) => reverseStyle[raw]);
    set("details", params.get("d"), (raw) => raw === "1");
    set("cluster", params.get("cl"), (raw) => reverseCluster[raw]);
    set("layers", params.get("l"), decodeLayers);
    set("scenarios", params.get("n"), (raw) => (raw === "-" ? [] : split(raw, "_").map((n) => `sc${n}`)));
    set("controls", params.get("o"), decodeControls);
    set("area", params.get("sel"), decodeArea);

    // Filter: nur die Dimensionen, die wirklich in der URL stehen — der Rest bleibt Default.
    const filters = {};
    for (const group of FILTER_GROUPS) {
        const raw = params.get(FILTER_PARAMS[group]);
        if (raw != null) filters[group] = decodeFilterGroup(group, raw);
    }
    if (Object.keys(filters).length) state.filters = filters;
    return applyLegacyLayerChars(state, params.get("l"));
}

/** v1: ?p=<lat>,<lng>,<zoom>,<Stil>,<Filter>,<Szenarien>,<Kontext> — nur noch lesen. */
export function parseLegacy(p) {
    const [lat, lng, zoom, styleShort, filtersRaw = "", scenariosRaw = "", kontextRaw = ""] = (p ?? "").split(",");
    const groups = filtersRaw.split("|");

    /** @type {MapState} */
    const state = {
        style: reverseStyle[styleShort] ?? "UKATEGORIE",
        // v1 schrieb IMMER alle fünf Gruppen — ein leerer Teil heißt dort "nichts ausgewählt".
        filters: Object.fromEntries(FILTER_GROUPS.map((g, i) => [g, decodeFilterGroup(g, groups[i] ?? "")])),
        scenarios: split(scenariosRaw, "_"),
        layers: decodeLayers(kontextRaw),
    };
    const view = decodeView([lat, lng, zoom].join(","), "p");
    if (view) state.view = view;
    return applyLegacyLayerChars(state, kontextRaw);
}

/**
 * Query-String -> Zustand, oder `null`, wenn die URL keinen Permalink trägt.
 * Ein unbekanntes ?v= wird als v2 gelesen: die Parameter sind benannt, unbekannte fallen
 * einfach weg — genau dafür ist das Format da.
 */
export function parse(search) {
    const params = new URLSearchParams(search);
    if (params.has("v") || params.has("map")) return parseV2(params);
    if (params.has("p")) return parseLegacy(params.get("p"));
    return null;
}

/** Zustände zusammenführen: `over` gewinnt, verschachtelte Teile werden gemischt statt ersetzt. */
export const mergeState = (base, over = {}) => ({
    ...base,
    ...over,
    filters: { ...base.filters, ...over.filters },
    controls: { ...base.controls, ...over.controls },
});
