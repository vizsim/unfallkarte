// drawingState.js — „gerade wird ein Gebiet gezeichnet". Solange setzen Karten-Klicks nur
// Punkte: das Hover-Popup (js/ui/hoverPopup.js) und der Mapillary-Klick halten still.
// Gesetzt von js/selection/drawArea.js.

let drawing = false;
const listeners = new Set();

export const isDrawing = () => drawing;

export function setDrawing(on) {
  drawing = on;
  for (const cb of listeners) cb(on);
}

export const onDrawingChange = (cb) => listeners.add(cb);
