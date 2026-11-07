// Unfall-Popups (Karten im gemeinsamen Hover-Popup) — REIN, ohne DOM (tests/unit).
//
// Einzelunfall: Unfalltyp als Titel, darunter die Unfallart; Schwere als Pill in der
// Punktfarbe der Karte; Beteiligte als Chips mit Icon; Zeit als Fußzeile.
// Cluster: Gesamtzahl groß, Anteile je Schwere als Balken (Farben der Torte) + Zeilen.
// Alle Werte sind Zahlen und gehen nur über Nachschlagetabellen oder Zahlformat ins HTML —
// Rohtext aus den Kacheln landet hier nie im Markup.

import { translations } from "./accidentLabels.js";
import {
    BET_BITS, BET_LABELS, FOCUS, PIE_FOCUS, TREND, TREND_FOCUS, countSelected, focusAverage, shareClass, signedPct, trendOf,
} from "../map/clusterModes.js";

const WEEKDAY_SHORT = ["?", "So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"]; // UWOCHENTAG 1 = Sonntag
const MONTH = ["?", "Januar", "Februar", "März", "April", "Mai", "Juni", "Juli", "August", "September", "Oktober", "November", "Dezember"];

// Icon-Pfade im 24er-Raster, als Strich gezeichnet (.pop-icon). Nach Lucide (lucide.dev,
// ISC-Lizenz); Kraftrad eigen, Lucide hat keins.
const ICON = {
    IstRad: "M2 17.5a3.5 3.5 0 1 0 7 0a3.5 3.5 0 1 0-7 0M15 17.5a3.5 3.5 0 1 0 7 0a3.5 3.5 0 1 0-7 0M14 5a1 1 0 1 0 2 0a1 1 0 1 0-2 0M12 17.5V14l-3-3 4-3 2 3h2",
    IstPKW: "M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9C18.7 10.6 16 10 16 10s-1.3-1.4-2.2-2.3c-.5-.4-1.1-.7-1.8-.7H5c-.6 0-1.1.4-1.4.9l-1.4 2.9A3.7 3.7 0 0 0 2 12v4c0 .6.4 1 1 1h2M5 17a2 2 0 1 0 4 0a2 2 0 1 0-4 0M9 17h6M15 17a2 2 0 1 0 4 0a2 2 0 1 0-4 0",
    IstFuss: "M11 5a1 1 0 1 0 2 0a1 1 0 1 0-2 0M9 20l3-6 3 6M6 8l6 2 6-2M12 10v4",
    IstKrad: "M2 17a3 3 0 1 0 6 0a3 3 0 1 0-6 0M16 17a3 3 0 1 0 6 0a3 3 0 1 0-6 0M5 17l4-6h6l4 6M15 11l-2-4h-2",
    IstGkfz: "M14 18V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v11a1 1 0 0 0 1 1h2M15 18H9M19 18h2a1 1 0 0 0 1-1v-3.65a1 1 0 0 0-.22-.624l-3.48-4.35A1 1 0 0 0 17.52 8H14M15 18a2 2 0 1 0 4 0a2 2 0 1 0-4 0M5 18a2 2 0 1 0 4 0a2 2 0 1 0-4 0",
    IstSonstig: "M5 12h.01M12 12h.01M19 12h.01",
    clock: "M2 12a10 10 0 1 0 20 0a10 10 0 1 0-20 0M12 6v6l4 2"
};

const INVOLVED = [
    ["IstRad", "Fahrrad"], ["IstPKW", "Pkw"], ["IstFuss", "Fußgänger"],
    ["IstKrad", "Kraftrad"], ["IstGkfz", "Güter-Kfz"], ["IstSonstig", "Sonstige"]
];

const icon = (d) => `<svg class="pop-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="${d}"/></svg>`;

// Kachelwerte kommen als Zahl (MLT) — Number() hält es auch bei Strings (MVT) stabil.
const num = (v) => (v === null || v === undefined || v === "" ? null : Number(v));
const inRange = (v, lo, hi) => Number.isInteger(v) && v >= lo && v <= hi;

/** „Fr · Juni 2025 · 18–19 Uhr"; fehlende Teile fallen weg. */
export function accidentWhen(props) {
    const wt = num(props.UWOCHENTAG), m = num(props.UMONAT), y = num(props.UJAHR), h = num(props.USTUNDE);
    return [
        inRange(wt, 1, 7) ? WEEKDAY_SHORT[wt] : null,
        [inRange(m, 1, 12) ? MONTH[m] : null, y].filter((x) => x != null).join(" ") || null,
        inRange(h, 0, 23) ? `${h}–${h + 1} Uhr` : null
    ].filter(Boolean).join(" · ");
}

// ---------------------------------------------------------------------------
// Cluster (Zoom 6–11): nur die drei Summen je Unfallkategorie (tiles.yaml, accumulate).
// Gezählt werden UNFÄLLE je Kategorie, nicht Personen → „mit Getöteten" statt „Getötete".
// ---------------------------------------------------------------------------

const SEVERITY = [[1, "mit Getöteten"], [2, "mit Schwerverletzten"], [3, "mit Leichtverletzten"]];

export const clusterCounts = (props) => SEVERITY.map(([k]) => num(props[`UKATEGORIE__${k}`]) || 0);
export const clusterTotal = (props) => clusterCounts(props).reduce((a, b) => a + b, 0);

const fmtInt = (n) => n.toLocaleString("de-DE");
const share = (n, total) => {
    if (!n || !total) return "";
    const p = (n / total) * 100;
    return p < 1 ? "&lt;1 %" : `${Math.round(p)} %`;
};

const hero = (n, unit) => `<div class="pop-hero">${fmtInt(n)} <span class="pop-unit">${unit}</span></div>`;

/**
 * Cluster-Karte, passend zur Ansicht (js/map/clusterView.js):
 *   focus "UKATEGORIE" (Standard) → Schwere wie die Torte;
 *   focus = Beteiligung ("IstRad" …) → Zahl + Anteil der Unfälle mit ihr, dazu alle Beteiligungen
 *   als Kontext (Mehrfachnennung: ein Unfall kann mehrere Beteiligte haben).
 */
export function renderCluster(props, focus = PIE_FOCUS) {
    if (focus === TREND_FOCUS) return renderTrendCluster(props);
    return FOCUS[focus] ? renderFocusCluster(props, focus) : renderSeverityCluster(props);
}

/** Jahre im Balkendiagramm des Trends: alle Kartenjahre (die Felder stehen in cluster_modes). */
export const TREND_CHART_YEARS = [2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025];

/**
 * Trend: Veränderung 2024/25 gegenüber 2022/23 groß, darunter das Urteil (deutlich / eher Zufall)
 * und alle Jahre als Balken — verglichen werden nur die farbigen; die grauen davor sind Kontext
 * (nicht alle Länder erfasst, 2020/21 Corona).
 */
function renderTrendCluster(props) {
    const t = trendOf(props);
    const color = TREND.colors[t.cls];
    const label = TREND.labels[t.cls];
    const verdict = t.small
        ? "Zu wenige Unfälle für einen Trend"
        : t.certain ? `${label[0].toUpperCase()}${label.slice(1)} – deutlich` : `Eher ${label} – kann Zufall sein`;
    const counts = TREND_CHART_YEARS.map((y) => Number(props[`UJAHR__${y}`]) || 0);
    const max = Math.max(...counts, 1);
    const compared = new Set([...TREND.early, ...TREND.late]);
    const bars = TREND_CHART_YEARS.map((y, i) => {
        const height = counts[i] ? Math.max(4, Math.round((counts[i] / max) * 100)) : 0;
        return `<div class="pop-trend-col" data-tip="${y}: ${fmtInt(counts[i])} ${counts[i] === 1 ? "Unfall" : "Unfälle"}">`
            + `<div class="pop-trend-plot"><span class="pop-trend-bar" style="height:${height}%;--sev:${compared.has(y) ? color : "#d1d5db"}"></span></div>`
            + `<span class="pop-trend-year">${String(y).slice(2)}</span></div>`;
    }).join("");
    return `<div class="pop-hero">${signedPct(t.change)} <span class="pop-unit">2024/25 ggü. 2022/23</span></div>`
        + `<div class="pop-meta">${verdict}</div>`
        + `<div class="pop-trend" role="img" aria-label="Unfälle je Jahr">${bars}</div>`
        + `<div class="pop-meta">${fmtInt(t.early)} → ${fmtInt(t.late)} Unfälle · Ø Deutschland ${signedPct(TREND.national)}</div>`
        + `<div class="pop-meta pop-sev-meta">Grau: nicht verglichen — nicht alle Länder erfasst, 2020/21 Corona</div>`;
}

function renderSeverityCluster(props) {
    const counts = clusterCounts(props);
    const total = counts.reduce((a, b) => a + b, 0);
    // Balken wie die Torte: Anteil = flex-grow, winzige Anteile behalten per CSS ein paar Pixel
    const bar = total
        ? `<div class="pop-sev-bar" aria-hidden="true">${counts.map((n, i) =>
            (n ? `<span class="pop-sev--k${i + 1}" style="flex-grow:${n}"></span>` : "")).join("")}</div>`
        : "";
    const rows = SEVERITY.map(([k, label], i) => {
        const n = counts[i];
        return `<tr class="pop-sev--k${k}${n ? "" : " is-zero"}">`
            + `<td><span class="pop-sev-dot"></span>${label}</td><td>${fmtInt(n)}</td><td>${share(n, total)}</td></tr>`;
    }).join("");
    return hero(total, total === 1 ? "Unfall" : "Unfälle")
        + bar
        + `<table class="pop-sev-table">${rows}</table>`
        + `<div class="pop-meta pop-sev-meta">Alle Jahre, ungefiltert</div>`;
}

function renderFocusCluster(props, focus) {
    const total = clusterTotal(props);
    const n = countSelected(props, focus);
    const { noun, colors } = FOCUS[focus];
    // die Farbe, die der Kreis auf der Karte hat
    const color = colors[shareClass(focus, total ? n / total : 0)];
    const bar = total
        ? `<div class="pop-sev-bar" aria-hidden="true">`
            + (n ? `<span style="flex-grow:${n};--sev:${color}"></span>` : "")
            + (total - n ? `<span style="flex-grow:${total - n};--sev:#d1d5db"></span>` : "")
            + `</div>`
        : "";
    const rows = BET_BITS
        .map((key) => ({ key, count: countSelected(props, key) }))
        .filter((r) => r.count > 0)
        .map(({ key, count }) => (key === focus
            ? `<tr style="--sev:${color}">`
            : `<tr class="is-zero">`)
            + `<td><span class="pop-sev-dot"></span>${BET_LABELS[key]}</td><td>${fmtInt(count)}</td><td>${share(count, total)}</td></tr>`)
        .join("");
    return hero(n, `${n === 1 ? "Unfall" : "Unfälle"} mit ${noun}`)
        + `<div class="pop-meta">${share(n, total) || "0\u00a0%"} von ${fmtInt(total)} Unfällen im Kreis · Ø Deutschland ${focusAverage(focus)}</div>`
        + bar
        + `<table class="pop-sev-table">${rows}</table>`
        + `<div class="pop-meta pop-sev-meta">Alle Jahre, ohne Filter · Mehrfachnennung möglich</div>`;
}

// ---------------------------------------------------------------------------
// Einzelner Unfall (ab Zoom 11)
// ---------------------------------------------------------------------------

export function renderAccident(props) {
    const kat = num(props.UKATEGORIE);
    const typText = translations.UTYP1[num(props.UTYP1)];
    const artText = translations.UART[num(props.UART)];
    const katText = translations.UKATEGORIE[kat];

    const head = `<div class="pop-acc-head">`
        + `<div class="pop-title">${typText ?? "Unfall"}</div>`
        + (artText ? `<div class="pop-meta">Unfallart: ${artText}</div>` : "")
        + `</div>`;

    const pill = katText ? `<span class="pop-pill pop-pill--k${kat}">${katText}</span>` : "";
    const chips = INVOLVED
        .filter(([key]) => num(props[key]) === 1)
        .map(([key, label]) => `<span class="pop-chip">${icon(ICON[key])}${label}</span>`)
        .join("");
    const when = accidentWhen(props);

    return head
        + (pill || chips ? `<div class="pop-chips">${pill}${chips}</div>` : "")
        + (when ? `<div class="pop-when">${icon(ICON.clock)}${when}</div>` : "");
}
