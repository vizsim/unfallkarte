// drawArea.js — ein Gebiet zeichnen oder bearbeiten, mit Terra Draw. Lädt erst hier (dynamischer
// Import → eigener Chunk mit terra-draw, ~33 KB gzip). Terra Draw läuft nur, solange gezeichnet
// wird: Fertig/Abbrechen stoppt es wieder (entfernt seine Layer und Listener); angezeigt wird
// das Gebiet danach von areaSelection.js.
//
// Bedienung: Klick setzt Punkte, Klick auf den ersten Punkt oder Enter schließt. Die Leiste oben
// bietet Punkt zurück, Fertig und Abbrechen — auf dem Handy der einzige Weg, denn ein
// verlässliches Doppeltippen gibt es dort nicht. Esc bricht ab. Solange gezeichnet wird,
// pausieren Popups und Mapillary-Klick (drawingState.js).
//
// Gelernt aus routing_bulk (src/ui/polygon-draw.js): Doppelklick setzte dort die letzte Ecke
// doppelt, Enter in der Ortssuche schloss das Gebiet, auf dem Handy ließ es sich nicht beenden.
// Terra Draw schließt per Klick auf den ersten Punkt, hört auf Tasten nur am Karten-Canvas, und
// Fertig/Abbrechen sind hier Knöpfe.

import {
  TerraDraw, TerraDrawModeUndoRedo, TerraDrawPolygonMode, TerraDrawSelectMode, ValidateNotSelfIntersecting,
} from "terra-draw";
import { TerraDrawMapLibreGLAdapter } from "terra-draw-maplibre-gl-adapter";
import { setDrawing } from "../map/drawingState.js";
import { AREA_COLOR, setAreaVisible } from "./areaSelection.js";

const HINT_NEW = "Klick setzt Punkte · Klick auf den ersten Punkt (oder Fertig) schließt das Gebiet";
const HINT_EDIT = "Ecken ziehen · an der Kantenmitte ziehen fügt eine Ecke ein · Rechtsklick löscht eine Ecke";
const WHITE = "#ffffff";

let running = null;   // laufende Sitzung — es gibt nur eine

const polygonMode = () => new TerraDrawPolygonMode({
  keyEvents: { cancel: null, finish: "Enter" },   // Esc behandeln wir selbst (= Abbrechen)
  showCoordinatePoints: true,                      // jede gesetzte Ecke sichtbar — wichtig beim Tippen
  validation: (feature, { updateType }) =>
    (updateType === "finish" || updateType === "commit" ? ValidateNotSelfIntersecting(feature) : { valid: true }),
  styles: {
    fillColor: AREA_COLOR, fillOpacity: 0.1, outlineColor: AREA_COLOR, outlineWidth: 2,
    closingPointColor: WHITE, closingPointWidth: 7, closingPointOutlineColor: AREA_COLOR, closingPointOutlineWidth: 2,
    coordinatePointColor: WHITE, coordinatePointWidth: 5, coordinatePointOutlineColor: AREA_COLOR, coordinatePointOutlineWidth: 2,
  },
});

const selectMode = () => new TerraDrawSelectMode({
  keyEvents: { deselect: null, delete: null, rotate: null, scale: null },   // nichts per Taste löschen
  flags: {
    polygon: {
      feature: {
        draggable: true,
        selfIntersectable: false,
        coordinates: { midpoints: true, draggable: true, deletable: true },
      },
    },
  },
  styles: {
    selectedPolygonColor: AREA_COLOR, selectedPolygonFillOpacity: 0.1,
    selectedPolygonOutlineColor: AREA_COLOR, selectedPolygonOutlineWidth: 2,
    selectionPointColor: WHITE, selectionPointWidth: 6, selectionPointOutlineColor: AREA_COLOR, selectionPointOutlineWidth: 2,
    midPointColor: AREA_COLOR, midPointWidth: 4, midPointOutlineColor: WHITE, midPointOutlineWidth: 1,
  },
});

/** Tippt jemand gerade in ein Feld? Dann gehört Esc dem Feld (z. B. der Ortssuche). */
const isTyping = (e) => e.target instanceof HTMLElement && e.target.matches("input, textarea, select");

function buildBar(hint, canUndo) {
  const bar = document.createElement("div");
  bar.className = "draw-bar";
  bar.setAttribute("role", "toolbar");
  bar.setAttribute("aria-label", "Gebiet zeichnen");
  bar.innerHTML = `
    <p class="draw-hint"></p>
    <div class="draw-actions">
      ${canUndo ? '<button type="button" class="draw-undo">Punkt zurück</button>' : ""}
      <button type="button" class="draw-cancel">Abbrechen</button>
      <button type="button" class="draw-done">Fertig</button>
    </div>`;
  bar.querySelector(".draw-hint").textContent = hint;
  document.body.append(bar);
  return {
    el: bar,
    hint: bar.querySelector(".draw-hint"),
    undo: bar.querySelector(".draw-undo"),
    cancel: bar.querySelector(".draw-cancel"),
    done: bar.querySelector(".draw-done"),
  };
}

/**
 * Neues Gebiet zeichnen (initial = null) oder ein vorhandenes bearbeiten. Liefert das Polygon
 * (GeoJSON) — bei Abbruch das unveränderte `initial` (beim Neuzeichnen also null).
 */
export function drawArea(map, initial = null) {
  running?.cancel();
  return new Promise((resolve) => {
    const draw = new TerraDraw({
      adapter: new TerraDrawMapLibreGLAdapter({ map }),
      modes: [polygonMode(), selectMode()],
      undoRedo: { modeLevel: new TerraDrawModeUndoRedo() },
    });
    const bar = buildBar(initial ? HINT_EDIT : HINT_NEW, !initial);
    let featureId = null;

    const geometry = () => (featureId == null ? null : draw.getSnapshotFeature(featureId)?.geometry ?? null);
    const onKey = (e) => {
      if (e.key !== "Escape" || isTyping(e)) return;
      // Esc gehört hier dem Zeichnen: ohne preventDefault schlösse dieselbe Taste gleich den
      // Export-Dialog, der sich nach dem Abbruch wieder öffnet (Standardaktion von Esc).
      e.preventDefault();
      end(initial);
    };
    function end(result) {
      document.removeEventListener("keydown", onKey);
      draw.stop();
      bar.el.remove();
      setAreaVisible(map, true);
      setDrawing(false);
      running = null;
      resolve(result);
    }

    draw.start();
    setDrawing(true);
    setAreaVisible(map, false);
    const [added] = initial
      ? draw.addFeatures([{ type: "Feature", geometry: initial, properties: { mode: "polygon" } }])
      : [];
    if (added?.valid) {
      featureId = added.id;
      draw.selectFeature(featureId);   // wechselt in den Auswahl-Modus: Ecken greifbar
    } else {
      draw.setMode("polygon");         // neu — oder ein ungültiges Gebiet (alter Link) neu zeichnen
    }

    let closed = false;
    draw.on("finish", (id, { mode, action }) => {
      if (mode !== "polygon" || action !== "draw") return;
      closed = true;
      featureId = id;
      end(geometry());   // ein neues Gebiet ist fertig, sobald es geschlossen ist
    });

    bar.undo?.addEventListener("click", () => draw.undo());
    bar.cancel.addEventListener("click", () => end(initial));
    bar.done.addEventListener("click", () => {
      if (initial) return end(geometry() ?? initial);
      // Wie Enter: schließt, wenn mindestens drei Punkte stehen — dann feuert "finish" sofort.
      map.getCanvas().dispatchEvent(new KeyboardEvent("keyup", { key: "Enter", bubbles: true }));
      if (!closed) bar.hint.textContent = "Für ein Gebiet braucht es mindestens drei Punkte.";
    });
    document.addEventListener("keydown", onKey);
    running = { cancel: () => end(initial) };
  });
}
