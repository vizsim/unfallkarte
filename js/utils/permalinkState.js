// permalinkState.js — die Brücke zwischen DOM/Karte und dem reinen Zustandsobjekt
// (js/utils/permalinkFormat.js). Hier lebt alles, was `document` oder `map` anfasst.
//
// Warum getrennt: so bleibt das Format ohne Browser testbar, und der Zustand hat EINE Quelle
// (readState) statt wie früher verteilte Ad-hoc-Abfragen in updatePermalink/applyPermalink.
//
// Der wichtigste Unterschied zu v1: v1 stellte den Zustand mit simulierten Klicks her
// (`cb.click()`). Ein Klick TOGGELT — das Ergebnis hing davon ab, was vorher angehakt war,
// weshalb v1 vorher alles abräumen musste und die Reihenfolge kritisch wurde. Hier wird
// `checked`/`value` direkt GESETZT und nur dann ein Event gefeuert, wenn sich wirklich etwas
// ändert. Das ist idempotent und reihenfolge-unabhängig.

import { CONTROLS, FILTER_GROUPS, kontextKeys } from "./permalinkFormat.js";

const byId = (id) => document.getElementById(id);
const checkedValues = (selector) => [...document.querySelectorAll(selector)].filter((el) => el.checked).map((el) => el.value);

// --- Lesen -------------------------------------------------------------------------------

const readFilters = () => ({
    UKATEGORIE: checkedValues('input[data-group="UKATEGORIE"]'),
    // Beteiligung hängt nicht an `value`, sondern am Spaltennamen (data-field).
    BETEILIGUNG: [...document.querySelectorAll("input[data-field]")].filter((el) => el.checked).map((el) => el.dataset.field),
    UJAHR: checkedValues('input[data-group="UJAHR"]'),
    UTYP1: checkedValues('input[data-group="UTYP1"]'),
    UART: checkedValues('input[data-group="UART"]'),
});

function readControl(control) {
    if (control.kind === "radio") return document.querySelector(`input[name="${control.target}"]:checked`)?.value ?? null;
    const el = byId(control.target);
    if (!el) return null;
    return control.kind === "check" ? (el.checked ? "1" : "0") : el.value;
}

const readControls = () => Object.fromEntries(
    CONTROLS.map((c) => [c.key, readControl(c)]).filter(([, value]) => value != null),
);

/** Aktueller Zustand aus Karte + DOM. @returns {import("./permalinkFormat.js").MapState} */
export function readState(map) {
    const center = map.getCenter();
    return {
        view: { lat: center.lat, lng: center.lng, zoom: map.getZoom() },
        style: document.querySelector('input[name="color-style"]:checked')?.value,
        filters: readFilters(),
        details: !!byId("toggle-details")?.checked,
        layers: Object.keys(kontextKeys).filter((id) => byId(`toggle-${id}`)?.checked),
        scenarios: checkedValues('input[name="scenario"]'),
        controls: readControls(),
    };
}

// --- Anwenden ----------------------------------------------------------------------------

const fire = (el, type) => el.dispatchEvent(new Event(type, { bubbles: true }));

/** Checkbox setzen; Event nur bei echter Änderung (sonst liefe die halbe App unnötig mit). */
function setChecked(el, on, { silent = false } = {}) {
    if (!el || el.checked === on) return;
    el.checked = on;
    if (!silent) fire(el, "change");
}

function setRadio(name, value) {
    const el = document.querySelector(`input[name="${name}"][value="${value}"]`);
    if (!el || el.checked) return;
    el.checked = true; // Geschwister werden dabei vom Browser abgewählt
    fire(el, "change");
}

function applyControl(control, value) {
    if (value == null) return;
    if (control.kind === "radio") return setRadio(control.target, value);

    const el = byId(control.target);
    if (!el) return;
    if (control.kind === "check") return setChecked(el, value === "1");
    if (el.value === String(value)) return;
    el.value = String(value);
    // "input" (nicht "change"): daran hängen die Regler — Beschriftung, Fortschrittsbalken
    // und der Filter (js/ui/setupEntryControls.js). Selects hören auf "change".
    fire(el, control.kind === "select" ? "change" : "input");
}

function applyFilters(filters) {
    for (const group of FILTER_GROUPS) {
        const wanted = filters[group];
        if (!wanted) continue;
        const selector = group === "BETEILIGUNG" ? "input[data-field]" : `input[data-group="${group}"]`;
        for (const el of document.querySelectorAll(selector)) {
            const key = group === "BETEILIGUNG" ? el.dataset.field : el.value;
            // silent: der gemeinsame Neuaufbau läuft EINMAL über updateLayerFilter, statt
            // je Häkchen einen kompletten Filter-Rebuild auszulösen (v1: bis zu 35×).
            setChecked(el, wanted.includes(key), { silent: true });
        }
    }
}

/**
 * Zustand auf DOM + Karte anwenden. Der Zustand muss VOLLSTÄNDIG sein (fehlende Felder werden
 * nicht angefasst) — die App füllt ihn vorher mit ihren Defaults auf (mergeState).
 */
export function applyState(map, state) {
    if (state.view) map.jumpTo({ center: [state.view.lng, state.view.lat], zoom: state.view.zoom });

    if (state.style) setRadio("color-style", state.style);

    // Nur die Häkchen setzen — den Filter-Neuaufbau stößt der Aufrufer EINMAL an
    // (setupPermalinkHandling), damit er auch ohne Link im Spiel läuft.
    if (state.filters) applyFilters(state.filters);
    if (state.details != null) setChecked(byId("toggle-details"), state.details);

    // Regler VOR den Layern: schaltet ein Toggle seinen Layer ein, wendet setupEntryControls
    // den AKTUELL angezeigten Reglerwert an — der muss dann schon der aus dem Link sein.
    if (state.controls) for (const control of CONTROLS) applyControl(control, state.controls[control.key]);

    if (state.scenarios) {
        for (const el of document.querySelectorAll('input[name="scenario"]')) {
            setChecked(el, state.scenarios.includes(el.value));
        }
    }
    if (state.layers) {
        for (const id of Object.keys(kontextKeys)) setChecked(byId(`toggle-${id}`), state.layers.includes(id));
    }
}
