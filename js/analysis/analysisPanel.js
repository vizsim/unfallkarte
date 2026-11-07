// analysisPanel.js — Analyse in der Karte (experimentell). Drei Wege führen zur selben Auswahl:
//   1. das Akkordeon „Analyse" in der Legende: Art wählen, dann in die Karte klicken,
//   2. das Kontextmenü: Rechtsklick, am Handy langes Drücken — MapLibre meldet beides als
//      `contextmenu` (das lange Drücken per eigenem Timer, also auch in iOS Safari),
//   3. der Link „Analysieren →" im fixierten Popup (Unfälle, Einrichtungen, Szenarien).
// Die Auswahl erscheint in der Karte wie das gezeichnete Gebiet (Kreis bzw. Umfeld), das
// Akkordeon zeigt eine Vorschau und „Report öffnen" (report.html im neuen Tab).
//
// Im Hauptbündel liegt nur die Bedienung. Einrasten und Vorschau lesen PMTiles und laden erst
// bei der ersten Auswahl (analysisData.js, eigener Chunk). Solange in der Karte gewählt wird,
// gilt der Zeichen-Zustand (drawingState.js): Popups und Mapillary-Klick halten still.

import { RADIUS, formatReportLink, parseReportLink } from "../report/reportLink.js";
import { facilitySel } from "../report/entry.js";
import { circleRing, localProjection } from "../report/geometry.js";
import { isDrawing, setDrawing } from "../map/drawingState.js";
import { AREA_COLOR } from "../selection/areaSelection.js";
import { setLegendCollapsed } from "../ui/legendHandlers.js";
import { MOBILE_QUERY } from "../ui/mobileLayout.js";

const SOURCE = "analysis-selection";
const LAYERS = ["analysis-selection-fill", "analysis-selection-line", "analysis-selection-facility", "analysis-selection-point"];
const FACILITY_TOGGLES = ["toggle-schools", "toggle-health", "toggle-playgrounds"];
const FACILITY_LAYERS = ["schools-polygons", "schools-points", "health-polygons", "health-points", "playgrounds-polygons", "playgrounds-points"];
const NEAR_ZOOM = 16;   // nach der Auswahl mindestens so nah: 25 m sind darunter kaum zu sehen

const HINT_START = "Wähle oben, was du untersuchen willst, und klick dann in die Karte.";
const HINT_PICK = {
  k: "Klick in die Karte setzt die Kreuzung – sie rastet am nächsten Knoten ein.",
  e: "Klick auf eine Schule, Kita, einen Spielplatz oder eine Gesundheits- bzw. Pflegeeinrichtung.",
};
const BAR_PICK = {
  k: "Klick auf die Kreuzung, die du untersuchen willst",
  e: "Klick auf die Einrichtung: Schule, Kita, Spielplatz, Gesundheit/Pflege",
};
const NO_FACILITY = "Hier liegt keine Schule, Kita, kein Spielplatz und keine Gesundheits- oder "
  + "Pflegeeinrichtung (laut OpenStreetMap). Näher heranzoomen und auf die Fläche klicken.";

let map = null;
let ui = null;          // Elemente im Akkordeon
let data = null;        // Promise des dynamischen Imports
let picking = null;     // laufender Auswahlmodus: { kind, cancel }
let menu = null;        // offenes Kontextmenü: { el, close }
let run = 0;            // verwirft Ergebnisse überholter Läufe
let radiusTimer = null;

const state = {
  sel: null,            // { kind: "k"|"e", lat, lng, oid? }
  note: null,           // „Eingerastet auf …"
  message: null,        // Hinweis statt Ergebnis (nichts gefunden, Ladefehler)
  busy: false,
  preview: null,        // Ergebnis von analysisData.preview()
  r: { k: RADIUS.k.def, e: RADIUS.e.def },
};

const loadData = () => (data ??= import("./analysisData.js").catch((err) => {
  data = null;
  throw err;
}));
const isMobile = () => window.matchMedia?.(MOBILE_QUERY).matches ?? false;
// Tippt jemand gerade (Ortssuche …)? Dann gehört Esc dem Feld. Ein Chip (Radio) zählt nicht —
// nach dem Klick auf „Kreuzung" liegt der Fokus genau dort.
const isTyping = (e) => e.target instanceof HTMLElement
  && e.target.matches('textarea, select, input:not([type="radio"]):not([type="checkbox"]):not([type="range"])');

/** Alle Datenjahre der Karte (Legende) und das Zeitfenster der Vorschau: die letzten drei. */
function dataYears() {
  const ys = [...document.querySelectorAll('input[data-group="UJAHR"]')].map((cb) => Number(cb.value)).filter(Number.isFinite);
  if (!ys.length) return [];
  const lo = Math.min(...ys);
  return Array.from({ length: Math.max(...ys) - lo + 1 }, (_, i) => lo + i);
}
const lastThree = (ys) => (ys.length ? { from: Math.max(ys[0], ys.at(-1) - 2), to: ys.at(-1) } : null);

const radius = () => (state.sel ? state.r[state.sel.kind] : null);

/** Absoluter Report-Link (report.html, Vertrag rv=1) für die aktuelle Auswahl. */
function reportHref() {
  if (!state.sel) return null;
  const query = formatReportLink({ sel: state.sel, r: radius(), years: lastThree(dataYears()) });
  return new URL(`report.html?${query}`, document.baseURI).href;
}

/** Nur lesen (Test-Hook window.__app.analysis()). */
export const analysisSnapshot = () => ({
  sel: state.sel ? { ...state.sel } : null,
  r: radius(),
  busy: state.busy,
  ready: !!state.preview && !state.busy,
  n: state.preview?.n ?? null,
  href: reportHref(),
});

// ---------------------------------------------------------------------------------------
// Einrichten

export function setupAnalysis(mapInstance) {
  map = mapInstance;
  ui = bindPanel();
  if (!ui) return;
  map.on("contextmenu", onContextMenu);
  // Popup-Link „Analysieren →": normaler Klick öffnet das Akkordeon; Mittelklick und
  // Strg/⌘-Klick öffnen wie jeder Link direkt den Report.
  document.addEventListener("click", onPopupLink);
  render();
}

function bindPanel() {
  const section = document.querySelector('.legend-section[data-section="analyse"]');
  if (!section) return null;
  const el = (s) => section.querySelector(s);
  const refs = {
    section,
    arrow: el(".section-arrow"),
    chips: [...section.querySelectorAll('input[name="analysis-kind"]')],
    hint: el(".analysis-hint"),
    result: el(".analysis-result"),
    title: el(".analysis-title"),
    radius: el(".analysis-r"),
    radiusLabel: el(".analysis-r-label"),
    radiusValue: el(".analysis-r-value"),
    panel: el(".analysis-panel"),
    stats: el(".analysis-stats"),
    meta: el(".analysis-meta"),
    open: el(".analysis-open"),
    copy: el(".analysis-copy"),
    clear: el(".analysis-clear"),
  };
  // Die ganze Titelzeile klappt (sonst nur der Pfeil) — so findet man die Sektion leichter.
  el(".legend-section-title").addEventListener("click", (e) => {
    if (!e.target.closest(".section-arrow, .info-icon")) refs.arrow.click();
  });
  // „click" statt „change": ein zweiter Klick auf denselben Chip wählt neu.
  for (const input of refs.chips) input.addEventListener("click", () => startPicking(input.value));
  refs.radius.addEventListener("input", () => {
    if (!state.sel) return;
    state.r[state.sel.kind] = Number(refs.radius.value);
    draw();
    render();
    clearTimeout(radiusTimer);
    radiusTimer = setTimeout(refreshPreview, 300);
  });
  refs.clear.addEventListener("click", clear);
  // Den Link zum Teilen kopieren statt ihn auszuschreiben (eine lange URL sprengt das Panel).
  refs.copy.addEventListener("click", async () => {
    const href = reportHref();
    if (!href) return;
    try {
      await navigator.clipboard.writeText(href);
      refs.copy.textContent = "Kopiert ✓";
    } catch {
      window.prompt("Link zum Report:", href);   // ohne Clipboard-Recht: zum Kopieren anzeigen
    }
    setTimeout(() => { refs.copy.textContent = "Link kopieren"; }, 2000);
  });
  return refs;
}

// ---------------------------------------------------------------------------------------
// Akkordeon öffnen, Auswahl setzen

function openPanel() {
  if (ui.section.classList.contains("collapsed")) ui.arrow.click();
  if (document.querySelector(".legend")?.classList.contains("collapsed")) setLegendCollapsed(false);
  ui.section.scrollIntoView({ block: "nearest" });
}

const checkChip = (kind) => { for (const c of ui.chips) c.checked = c.value === kind; };

/** Auswahl übernehmen (aus Klick, Kontextmenü oder Popup-Link) und die Vorschau laden. */
export function select(sel, { note = null } = {}) {
  state.sel = { ...sel };
  state.note = note;
  state.message = null;
  state.preview = null;
  checkChip(sel.kind);
  draw();
  bringIntoView();
  openPanel();
  render();
  refreshPreview();
}

function clear() {
  ++run;
  state.sel = null;
  state.note = null;
  state.message = null;
  state.preview = null;
  state.busy = false;
  checkChip(null);
  draw();
  render();
}

/** Klickstelle → Auswahl: Kreuzung einrasten bzw. Einrichtung finden (liest PMTiles). */
async function choose(kind, { lat, lng }) {
  const id = ++run;
  state.busy = true;
  state.message = kind === "k" ? "Suche die Kreuzung …" : "Suche die Einrichtung …";
  openPanel();
  render();
  try {
    const d = await loadData();
    const place = kind === "k" ? await d.snapPlace(lat, lng) : await d.facilityPlace(lat, lng);
    if (id !== run) return;
    if (!place) {
      state.busy = false;
      state.message = NO_FACILITY;
      checkChip(state.sel?.kind ?? null);
      render();
      return;
    }
    select(place.sel, { note: place.note });
  } catch (err) {
    console.error("[analyse] Stelle nicht gefunden:", err);
    if (id !== run) return;
    state.busy = false;
    state.message = "Die Daten für diese Stelle ließen sich nicht laden.";
    render();
  }
}

async function refreshPreview() {
  const sel = state.sel;
  if (!sel) return;
  const id = ++run;
  state.busy = true;
  render();
  try {
    const d = await loadData();
    const years = dataYears();
    const p = await d.preview(sel, radius(), lastThree(years), years);
    if (id !== run) return;
    state.preview = p;
    state.message = p.facilityMissing ? "Diese Einrichtung ist nicht mehr in den OSM-Daten der Karte." : null;
  } catch (err) {
    console.error("[analyse] Vorschau fehlgeschlagen:", err);
    if (id !== run) return;
    state.message = "Die Vorschau ließ sich nicht laden. Der Report versucht es noch einmal.";
  }
  state.busy = false;
  draw();
  render();
}

/** Kreuzung bzw. Einrichtung ins Bild holen; bei kleinem Zoom heranfahren. */
function bringIntoView() {
  const { lat, lng } = state.sel;
  const inView = map.getBounds().contains([lng, lat]);
  if (map.getZoom() >= NEAR_ZOOM - 1 && inView) return;
  // Am Handy liegt unten das Bottom-Sheet: die Stelle in den freien oberen Teil schieben.
  const padding = isMobile() ? { top: 40, bottom: Math.round(window.innerHeight * 0.45), left: 20, right: 20 } : 0;
  map.easeTo({ center: [lng, lat], zoom: Math.max(map.getZoom(), NEAR_ZOOM), padding, duration: 600 });
}

// ---------------------------------------------------------------------------------------
// In der Karte wählen (Akkordeon)

function startPicking(kind) {
  closeMenu();
  picking?.cancel();
  if (kind === "e") {
    // Einrichtungen sichtbar machen, damit man sieht, was sich wählen lässt.
    for (const id of FACILITY_TOGGLES) {
      const cb = document.getElementById(id);
      if (cb && !cb.checked) cb.click();
    }
  }
  state.message = HINT_PICK[kind];
  render();

  const mobile = isMobile();
  if (mobile) setLegendCollapsed(true);   // die Karte freigeben; danach geht das Sheet wieder auf
  setDrawing(true);
  const canvas = map.getCanvas();
  const cursor = canvas.style.cursor;
  canvas.style.cursor = "crosshair";

  const bar = document.createElement("div");
  bar.className = "draw-bar analysis-bar";
  bar.setAttribute("role", "toolbar");
  bar.setAttribute("aria-label", "Stelle für die Analyse wählen");
  bar.innerHTML = '<p class="draw-hint"></p><div class="draw-actions"><button type="button" class="draw-cancel">Abbrechen</button></div>';
  bar.querySelector(".draw-hint").textContent = BAR_PICK[kind];
  document.body.append(bar);

  const onClick = (e) => {
    end();
    choose(kind, e.lngLat);
  };
  const onKey = (e) => {
    if (e.key !== "Escape" || isTyping(e)) return;
    e.preventDefault();
    cancel();
  };
  function end() {
    map.off("click", onClick);
    document.removeEventListener("keydown", onKey);
    bar.remove();
    canvas.style.cursor = cursor;
    setDrawing(false);
    picking = null;
    if (mobile) openPanel();
  }
  function cancel() {
    end();
    state.message = null;
    checkChip(state.sel?.kind ?? null);
    render();
  }
  map.on("click", onClick);
  document.addEventListener("keydown", onKey);
  bar.querySelector(".draw-cancel").addEventListener("click", cancel);
  picking = { kind, cancel };
}

// ---------------------------------------------------------------------------------------
// Kontextmenü (Rechtsklick / langes Drücken)

/** Sichtbare Einrichtung unter dem Zeiger → Auswahl mit OSM-Objekt, sonst null. */
function facilityUnder(point, lngLat) {
  const layers = FACILITY_LAYERS.filter((id) => map.getLayer(id));
  if (!layers.length) return null;
  const f = map.queryRenderedFeatures(point, { layers })[0];
  if (!f) return null;
  // Null-Prototyp der Feature-Properties (CLAUDE.md): als schlichtes Objekt weiterreichen.
  const sel = facilitySel({ ...f.properties }, f, lngLat);
  return sel?.kind === "e" ? { sel, name: f.properties.name || null } : null;
}

function onContextMenu(e) {
  if (isDrawing()) return;
  const fac = facilityUnder(e.point, e.lngLat);
  const items = [{ label: "Kreuzung hier analysieren", run: () => choose("k", e.lngLat) }];
  items.push(fac
    ? { label: fac.name ? `„${fac.name}“ analysieren` : "Diese Einrichtung analysieren", run: () => select(fac.sel) }
    : { label: "Einrichtung hier analysieren", run: () => choose("e", e.lngLat) });
  openMenu(e.point, items);
}

function openMenu(point, items) {
  closeMenu();
  const el = document.createElement("div");
  el.className = "map-menu";
  el.setAttribute("role", "menu");
  el.setAttribute("aria-label", "Analyse");
  const title = document.createElement("div");
  title.className = "map-menu-title";
  title.textContent = "Analyse · experimentell";
  el.append(title);
  for (const item of items) {
    const b = document.createElement("button");
    b.type = "button";
    b.setAttribute("role", "menuitem");
    b.textContent = item.label;
    b.addEventListener("click", () => {
      closeMenu();
      item.run();
    });
    el.append(b);
  }
  const container = map.getContainer();
  container.append(el);
  // Im Kartenrahmen halten (rechts und unten nicht abschneiden).
  el.style.left = `${Math.max(4, Math.min(point.x, container.clientWidth - el.offsetWidth - 4))}px`;
  el.style.top = `${Math.max(4, Math.min(point.y, container.clientHeight - el.offsetHeight - 4))}px`;

  const onOutside = (ev) => { if (!el.contains(ev.target)) closeMenu(); };
  const onKey = (ev) => { if (ev.key === "Escape") { ev.preventDefault(); closeMenu(); } };
  // Erst nach diesem Ereignis lauschen: sonst schlösse der Druck, der das Menü öffnet, es gleich.
  const timer = setTimeout(() => document.addEventListener("pointerdown", onOutside, true));
  document.addEventListener("keydown", onKey);
  map.once("movestart", closeMenu);
  menu = {
    el,
    close() {
      clearTimeout(timer);
      document.removeEventListener("pointerdown", onOutside, true);
      document.removeEventListener("keydown", onKey);
      map.off("movestart", closeMenu);
      el.remove();
    },
  };
  el.querySelector("button")?.focus({ preventScroll: true });
}

function closeMenu() {
  menu?.close();
  menu = null;
}

// ---------------------------------------------------------------------------------------
// Popup-Link „Analysieren →"

function onPopupLink(e) {
  const a = e.target instanceof Element ? e.target.closest("a.pop-report") : null;
  if (!a || e.button !== 0 || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return;
  const { sel } = parseReportLink(new URL(a.href).search);
  if (!sel) return;
  e.preventDefault();
  // Unfallpunkte und Häufungen liegen meist an einer Kreuzung: dort einrasten. Einrichtungen
  // tragen ihr OSM-Objekt und brauchen keine Suche.
  if (sel.kind === "k") choose("k", sel);
  else select(sel);
}

// ---------------------------------------------------------------------------------------
// Darstellung: Karte und Akkordeon

function draw() {
  const sel = state.sel;
  const features = [];
  if (sel) {
    const r = radius();
    let ring = state.preview?.outlineFor(r) ?? null;
    if (!ring && sel.kind === "k") {
      const proj = localProjection(sel.lat, sel.lng);
      const circle = circleRing([0, 0], r, 72);
      ring = [...circle, circle[0]].map((p) => proj.lngLat(p));
    }
    if (ring) features.push({ type: "Feature", properties: { k: "area" }, geometry: { type: "Polygon", coordinates: [ring] } });
    for (const line of state.preview?.facilityRings ?? []) {
      features.push({ type: "Feature", properties: { k: "facility" }, geometry: { type: "LineString", coordinates: line } });
    }
    if (sel.kind === "k") features.push({ type: "Feature", properties: { k: "point" }, geometry: { type: "Point", coordinates: [sel.lng, sel.lat] } });
  }
  // Eigene, schlichte Objekte — nie Features aus queryRenderedFeatures (CLAUDE.md).
  const fc = { type: "FeatureCollection", features };
  const source = map.getSource(SOURCE);
  if (source) {
    source.setData(fc);
    return;
  }
  if (!features.length) return;
  map.addSource(SOURCE, { type: "geojson", data: fc });
  const only = (k) => ["==", ["get", "k"], k];
  map.addLayer({ id: LAYERS[0], type: "fill", source: SOURCE, filter: only("area"), paint: { "fill-color": AREA_COLOR, "fill-opacity": 0.08 } });
  map.addLayer({ id: LAYERS[1], type: "line", source: SOURCE, filter: only("area"), paint: { "line-color": AREA_COLOR, "line-width": 2.5, "line-dasharray": [2, 1.5] } });
  map.addLayer({ id: LAYERS[2], type: "line", source: SOURCE, filter: only("facility"), paint: { "line-color": AREA_COLOR, "line-width": 3 } });
  map.addLayer({
    id: LAYERS[3], type: "circle", source: SOURCE, filter: only("point"),
    paint: { "circle-radius": 4.5, "circle-color": AREA_COLOR, "circle-stroke-color": "#ffffff", "circle-stroke-width": 1.5 },
  });
}

/** Eine Kennzahl der Vorschau: Wert groß, Bezeichnung klein, voller Text als Tooltip. */
function stat(value, label, title) {
  const cell = document.createElement("div");
  cell.className = "analysis-stat";
  cell.title = title;
  cell.append(Object.assign(document.createElement("b"), { textContent: value.toLocaleString("de-DE") }));
  cell.append(Object.assign(document.createElement("span"), { textContent: label }));
  return cell;
}

function renderPreview() {
  const p = state.preview;
  if (state.busy || !p) {
    ui.stats.replaceChildren();
    ui.meta.textContent = "Lade Vorschau …";
    return;
  }
  const ys = lastThree(dataYears());
  const span = ys ? `${ys.from}–${ys.to}` : null;
  ui.stats.replaceChildren(...(p.accidentsOk ? [
    stat(p.n, p.n === 1 ? "Unfall" : "Unfälle", `Unfälle mit Personenschaden${span ? ` ${span}` : ""}`),
    stat(p.nSP, "davon schwer", "mit Getöteten oder Schwerverletzten"),
    stat(p.fr, "mit Fuß/Rad", "mit Fuß- oder Radbeteiligung"),
  ] : []));
  ui.meta.textContent = [p.accidentsOk ? span : "Unfalldaten nicht verfügbar", p.road, p.speed].filter(Boolean).join(" · ");
}

function render() {
  const sel = state.sel;
  ui.hint.textContent = state.message ?? (sel ? state.note ?? "" : HINT_START);
  ui.panel.classList.toggle("has-selection", !!sel);
  ui.result.hidden = !sel;
  if (!sel) return;

  const lim = RADIUS[sel.kind];
  const r = radius();
  ui.title.textContent = sel.kind === "k" ? "Kreuzung" : state.preview?.facility ?? "Einrichtung";
  ui.radiusLabel.textContent = sel.kind === "k" ? "Radius" : "Umfeld";
  ui.radius.min = String(lim.min);
  ui.radius.max = String(lim.max);
  ui.radius.value = String(r);
  ui.radiusValue.textContent = `${r} m`;

  renderPreview();
  ui.open.href = reportHref();
}
