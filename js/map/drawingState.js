// drawingState.js — „gerade wird in der Karte gezeichnet oder gewählt". Solange gehören
// Karten-Klicks dem Werkzeug: das Hover-Popup (js/ui/hoverPopup.js), der Mapillary-Klick und
// das Analyse-Kontextmenü halten still. Gesetzt von js/selection/drawArea.js (Gebiet) und
// js/analysis/analysisPanel.js (Stelle für die Analyse wählen).

let drawing = false;
const listeners = new Set();

export const isDrawing = () => drawing;

export function setDrawing(on) {
  drawing = on;
  for (const cb of listeners) cb(on);
}

export const onDrawingChange = (cb) => listeners.add(cb);
