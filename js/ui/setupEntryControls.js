// Schwellen-Regler eines Registry-Eintrags (js/layers/registry.js, `controls`):
//   container    Element, das nur bei eingeschaltetem Layer sichtbar ist
//   slider       <input type="range">          sliderLabel  Element, das den Wert anzeigt
//   select?      <select> für eine zweite Filter-Dimension (z. B. Sc9-Kriterium)
//   filter       ({ value, select }) -> MapLibre-Filter
//   filterLayers Layer, auf die der Filter wirkt (Default: alle Layer des Eintrags)
//   apply?       (map, { value, select }) statt filter, wenn der Regler mehr tut als filtern
//                (Uber-Stunde: Filter + Farbe je Layer)
//   debounceMs?  Regler-Eingaben bündeln (teure apply-Funktionen)
//
// Beim Einschalten gilt der AKTUELL angezeigte Reglerwert (früher setzten Sc1/2/8 still auf
// ">= 0" zurück, während das Label noch den alten Wert zeigte).
export function setupEntryControls(map, entry) {
  const c = entry.controls;
  if (!c) return;
  const byId = (id) => (id ? document.getElementById(id) : null);
  const toggle = byId(`toggle-${entry.id}`);
  const container = byId(c.container);
  const slider = byId(c.slider);
  const label = byId(c.sliderLabel);
  const select = byId(c.select);
  if (!toggle || !slider) return;

  const apply = () => {
    const state = { value: parseInt(slider.value, 10), select: select?.value };
    if (c.apply) return c.apply(map, state);
    const filter = c.filter(state);
    for (const id of c.filterLayers ?? entry.layerIds) {
      if (map.getLayer(id)) map.setFilter(id, filter);
    }
  };
  let timer = null;
  const applySoon = () => {
    if (!c.debounceMs) return apply();
    clearTimeout(timer);
    timer = setTimeout(apply, c.debounceMs);
  };

  slider.addEventListener("input", () => {
    const val = parseInt(slider.value, 10);
    if (label) label.textContent = val;
    applySoon();
    const percent = ((val - slider.min) / (slider.max - slider.min)) * 100;
    slider.style.setProperty("--progress", `${percent}%`);
  });
  select?.addEventListener("change", apply);
  toggle.addEventListener("change", (e) => {
    if (container) container.style.display = e.target.checked ? "block" : "none";
    if (e.target.checked) apply();
  });
}
