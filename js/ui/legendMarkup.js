// legendMarkup.js — erzeugt die repetitiven Legenden-Einträge aus der Layer-Registry.
//
// Warum: dieselbe Information stand doppelt da — Farbe und Zoomgrenze im Registry-Eintrag
// (js/layers/), Beschriftung und Farbfleck nochmal von Hand in index.html. Genau daraus
// entsteht Drift: der Vertragstest fand so schon tote Popup-Zeilen, und die Swatch-Farben
// konnten still von den Layer-Farben abweichen.
//
// Umfang bewusst begrenzt: generiert wird das GERÜST (Toggle-Zeile, Beschriftung,
// Quellen-Icon, Legenden-Container, Zoom-Hinweis) plus einfache Farbflecken-Listen, Stufen-
// Skalen und ein Modus-Umschalter mit je einer Skala (population). Blöcke mit eigenen
// Widgets — die älteren Modus-Radios mit Verlaufsbalken (svz, telraam), Farbverläufe
// (maxspeed), eigenes Markup (bikelanes) — bleiben handgeschrieben im HTML stehen.
//
// Platzhalter im HTML: <div data-legend-entry="<id>"></div> an genau der Stelle, an der der
// Eintrag erscheinen soll. Die Reihenfolge bleibt damit im Markup ablesbar (die Registry ist
// nach Modulen gruppiert, nicht nach Legendenposition).

import { LAYER_REGISTRY } from "../layers/registry.js";

/**
 * @typedef {Object} LegendSpec  Feld `legend` eines Registry-Eintrags
 * @property {string} label                    Text neben der Checkbox
 * @property {string} [tip]                    Quellen-/Lizenz-Hinweis am ⓘ-Icon
 * @property {string} [vintage]                Manifest-ID für Quelle + Datenstand -> data-vintage="<id>"
 * @property {string} [vintageAttr]            stattdessen ein wertloser Haken, z. B. "laerm-vintage"
 *                                             -> data-laerm-vintage. Beides füllt
 *                                             js/utils/applyDataVintages.js zur Laufzeit in `tip`.
 * @property {{color: string, text: string, shape?: string}[]} [swatches]  einfache Farbfleck-Liste
 * @property {string} [heading]                fette Zwischenüberschrift über der Stufen-Skala
 * @property {string} [note]                   Zeile darunter (z. B. der Index-Kurzname "LDEN")
 * @property {{color: string, text: string, outline?: string}[]} [stops]  Stufen-Skala (Rechtecke,
 *                                             untereinander); `outline` = Rand wie auf der Karte
 * @property {{name: string, options: LegendMode[]}} [modes]  Modus-Umschalter: Radios + je Modus
 *                                             eine eigene Skala. `name` = Radio-Gruppe, zugleich
 *                                             Ziel im Permalink (CONTROLS). Erste Option = Default.
 *                                             Die Karte schaltet der Eintrag selbst um (setup()).
 *
 * @typedef {Object} LegendMode
 * @property {string} value                    Radio-Wert (steht in geteilten Links — nie umbenennen)
 * @property {string} label                    Text am Radio
 * @property {string} [heading]                wie oben, aber je Modus
 * @property {string} [note]
 * @property {{color: string, text: string, outline?: string}[]} [stops]
 */

function buildToggleRow(entry) {
  const { label, tip, vintage, vintageAttr } = entry.legend;

  const row = document.createElement("div");
  row.className = "mt-6";
  const labelEl = document.createElement("label");
  labelEl.className = "ml-10";

  const checkbox = document.createElement("input");
  checkbox.type = "checkbox";
  checkbox.id = `toggle-${entry.id}`;
  labelEl.append(checkbox, ` ${label} `);

  if (tip || vintage || vintageAttr) {
    const icon = document.createElement("span");
    icon.className = "info-icon";
    if (vintage) icon.dataset.vintage = vintage;
    if (vintageAttr) icon.setAttribute(`data-${vintageAttr}`, "");
    if (tip) icon.dataset.tip = tip;
    icon.textContent = "i";
    labelEl.append(icon);
  }

  row.append(labelEl);
  return row;
}

/** Überschrift, Notiz und Stufen-Skala — für den Eintrag selbst und für jeden Modus. */
function buildScale({ heading, note, stops }) {
  const out = [];
  if (heading) {
    const h = document.createElement("div");
    h.append(Object.assign(document.createElement("strong"), { textContent: heading }));
    out.push(h);
  }
  if (note) {
    const n = document.createElement("div");
    n.className = "mt-4";
    n.textContent = note;
    out.push(n);
  }
  if (stops?.length) {
    const ramp = document.createElement("div");
    ramp.className = "legend-ramp";
    for (const { color, text, outline } of stops) {
      const row = document.createElement("div");
      row.className = "row";
      const rect = document.createElement("div");
      rect.className = "swatch-rect";
      rect.style.background = color;
      if (outline) rect.style.boxShadow = `inset 0 0 0 1px ${outline}`;
      const span = document.createElement("span");
      span.textContent = text;
      row.append(rect, span);
      ramp.append(row);
    }
    out.push(ramp);
  }
  return out;
}

/**
 * Chip-Reihe + je Modus ein Skalen-Block. Die Chips sind echte Radios (Tastatur, Permalink
 * `kind: "radio"`), nur als Pille gestylt. Welcher Block zu sehen ist, entscheidet style.css
 * über die Zustandsklasse `.is-active` — hier wird nur sie umgeschaltet, nie `display`.
 */
function buildModes({ name, options }) {
  const radios = document.createElement("div");
  radios.className = "legend-modes";
  radios.setAttribute("role", "radiogroup");
  radios.setAttribute("aria-label", "Einfärbung");
  const blocks = options.map((mode) => {
    const block = document.createElement("div");
    block.className = "legend-mode";
    block.dataset.mode = mode.value;
    block.append(...buildScale(mode));
    return block;
  });
  const show = (value) => blocks.forEach((b) => b.classList.toggle("is-active", b.dataset.mode === value));

  options.forEach((mode, i) => {
    const label = document.createElement("label");
    label.className = "legend-chip";
    const input = Object.assign(document.createElement("input"), { type: "radio", name, value: mode.value, checked: i === 0 });
    input.addEventListener("change", () => input.checked && show(mode.value));
    label.append(input, Object.assign(document.createElement("span"), { textContent: mode.label }));
    radios.append(label);
  });
  show(options[0].value);
  return [radios, ...blocks];
}

function buildLegendBlock(entry) {
  const box = document.createElement("div");
  box.id = `${entry.id}-legend`;          // DOM-Vertrag (CLAUDE.md): nicht umbenennen
  box.className = "ml-20 mt-6 fs-11";

  // Zoom-Hinweis, solange die Daten unter dataMinZoom noch nicht rendern. Sichtbarkeit
  // schaltet legendHandlers über .is-due — hier entsteht nur das Markup.
  if (entry.dataMinZoom != null) {
    const hint = document.createElement("div");
    hint.className = "zoom-hint";
    const link = document.createElement("a");
    link.href = "#";
    link.className = "zoom-link";
    link.dataset.zoom = String(entry.dataMinZoom);
    link.textContent = `Zoomstufe ${entry.dataMinZoom}+`;
    hint.append("ℹ️ Daten sind ab ", link, " sichtbar.");
    box.append(hint);
  }

  if (entry.legend.modes) box.append(...buildModes(entry.legend.modes));
  box.append(...buildScale(entry.legend));

  const swatches = entry.legend.swatches ?? [];
  if (swatches.length) {
    const list = document.createElement("div");
    list.className = "mt-4";
    for (const { color, text, shape = "swatch-dot" } of swatches) {
      const row = document.createElement("div");
      const dot = document.createElement("span");
      dot.className = shape;
      dot.style.background = color;
      row.append(dot, ` ${text}`);
      list.append(row);
    }
    box.append(list);
  }

  return box;
}

/**
 * Platzhalter durch die erzeugten Einträge ersetzen. Muss laufen, BEVOR irgendetwas
 * `#toggle-<id>` sucht — also vor addSources/applyDataVintages und vor setupUI.
 * @returns {string[]} die erzeugten Eintrags-IDs (für Tests/Diagnose)
 */
export function renderLegendEntries() {
  const done = [];

  for (const entry of LAYER_REGISTRY) {
    const slot = document.querySelector(`[data-legend-entry="${entry.id}"]`);
    if (!slot) continue;
    if (!entry.legend) {
      // Laut statt still: ein Platzhalter ohne Daten hinterließe sonst eine Lücke in der
      // Legende, die niemand mit dem fehlenden Feld in Verbindung bringt.
      throw new Error(`Legende: Platzhalter für "${entry.id}", aber der Registry-Eintrag hat kein legend-Feld`);
    }
    slot.replaceWith(buildToggleRow(entry), buildLegendBlock(entry));
    done.push(entry.id);
  }

  const orphans = [...document.querySelectorAll("[data-legend-entry]")].map((el) => el.dataset.legendEntry);
  if (orphans.length) throw new Error(`Legende: Platzhalter ohne Registry-Eintrag: ${orphans.join(", ")}`);

  return done;
}
