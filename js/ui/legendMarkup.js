// legendMarkup.js — erzeugt die repetitiven Legenden-Einträge aus der Layer-Registry.
//
// Warum: dieselbe Information stand doppelt da — Farbe und Zoomgrenze im Registry-Eintrag
// (js/layers/), Beschriftung und Farbfleck nochmal von Hand in index.html. Genau daraus
// entsteht Drift: der Vertragstest fand so schon tote Popup-Zeilen, und die Swatch-Farben
// konnten still von den Layer-Farben abweichen.
//
// Umfang bewusst begrenzt: generiert wird das GERÜST (Toggle-Zeile, Beschriftung,
// Quellen-Icon, Legenden-Container, Zoom-Hinweis) plus einfache Farbflecken-Listen. Blöcke
// mit eigenen Widgets — Modus-Radios (svz, telraam), Farbverläufe (maxspeed), eigenes
// Markup (bikelanes) — bleiben handgeschrieben im HTML stehen. Ein Generator, der auch die
// abdeckt, wäre umständlicher als die 13 Blöcke, die er ersetzt.
//
// Platzhalter im HTML: <div data-legend-entry="<id>"></div> an genau der Stelle, an der der
// Eintrag erscheinen soll. Die Reihenfolge bleibt damit im Markup ablesbar (die Registry ist
// nach Modulen gruppiert, nicht nach Legendenposition).

import { LAYER_REGISTRY } from "../layers/registry.js";

/**
 * @typedef {Object} LegendSpec  Feld `legend` eines Registry-Eintrags
 * @property {string} label                    Text neben der Checkbox
 * @property {string} [tip]                    Quellen-/Lizenz-Hinweis am ⓘ-Icon
 * @property {string} [vintage]                Manifest-ID für den Datenstand (data-osm-vintage);
 *                                             js/utils/applyDataVintages.js ersetzt damit `tip`
 * @property {{color: string, text: string, shape?: string}[]} [swatches]
 */

function buildToggleRow(entry) {
  const { label, tip, vintage } = entry.legend;

  const row = document.createElement("div");
  row.className = "mt-6";
  const labelEl = document.createElement("label");
  labelEl.className = "ml-10";

  const checkbox = document.createElement("input");
  checkbox.type = "checkbox";
  checkbox.id = `toggle-${entry.id}`;
  labelEl.append(checkbox, ` ${label} `);

  if (tip || vintage) {
    const icon = document.createElement("span");
    icon.className = "info-icon";
    if (vintage) icon.dataset.osmVintage = vintage;
    if (tip) icon.dataset.tip = tip;
    icon.textContent = "i";
    labelEl.append(icon);
  }

  row.append(labelEl);
  return row;
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
