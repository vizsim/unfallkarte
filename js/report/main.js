// main.js — Analyse-Report (report.html): Verdrahtung. Der einzige Ort mit DOM, Karte und fetch;
// Datenmodell, Regelwerk und Texte sind reine Module (browserlos getestet, tests/unit/report-*).
//
// Ablauf: Link lesen (reportLink.js) → Quellen auflösen (Manifest, Local-first/B2) → Kacheln im
// Umfeld lesen (tileReader.js) → Modell (model.js) → Regelwerk (rules/) → Ansichten (render/).
// Eigene Eingaben (Rolle, Beobachtung, Name) bleiben im Arbeitsspeicher und nie im Link.
import { Map as MapLibreMap, NavigationControl, addProtocol } from "../lib/maplibre.js";
import { createPMTilesProtocol } from "../mapdata/pmtilesProtocol.js";
import { createTileReader } from "./tileReader.js";
import { DATASETS, extentOf, readAll, resolveReportSources } from "./sources.js";
import { buildModel, facilityAt, snapToJunction } from "./model.js";
import { bufferOutline, circleRing, localProjection } from "./geometry.js";
import { evaluate } from "./rules/synthesis.js";
import { RADIUS, SUPPORTED_KINDS, formatReportLink, mapLinkFor, parseReportLink } from "./reportLink.js";
import { landAt, loadLaender, placeFrom, reverseGeocode } from "./place.js";
import { zustaendigkeit } from "./addressee.js";
import { titleOf, buildLetter } from "./texts.js";
import { letterParts, renderBrief, renderPanel, renderPrint, renderReport } from "./render/views.js";
import { esc, today } from "./render/common.js";
import { RW } from "./rules/params.js";

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const CORE = ["accidents", "roads", "roadsMinor", "schools", "health", "playgrounds"];
const FAC_IDS = ["schools", "health", "playgrounds"];

const st = {
  tab: "auswahl", mode: "k", sel: null, r: { k: RADIUS.k.def, e: RADIUS.e.def }, years: null, land: "", roadKey: null, answers: {},
  brief: "anregung", role: "eltern", tone: "sachlich", beob: "", name: "", kontakt: "", anschrift: "", initiative: "", hausnr: "",
  ortstermin: true, cc: { polizei: false, bv: false }, behoerde: "", behoerdeMail: "", search: "",
};
// Drei getrennte Zähler: Report-Laden, Vorschau und Kartenklick überholen sich sonst gegenseitig
// (ein später fertiger alter Lauf überschriebe den neuen).
const app = {
  sources: null, reader: createTileReader(), dataYears: [], raw: null, rawFor: null, M: null, R: null, E: null, place: null, photon: null,
  laender: null, preview: null, previewKey: null, previewM: null, busyReport: false, busyPreview: false, warnings: [],
  genReport: 0, genPreview: 0, genClick: 0, progress: 0, map: null, snapNote: null, error: null,
};
const TEXT_FIELDS = ["beob", "name", "kontakt", "anschrift", "initiative", "hausnr", "behoerde", "behoerdeMail"];
window.__report = { st, app, DATASETS }; // Test-Hook (tests/web/report*.spec.js): nur lesen

let rangeTimer = null;

// ------------------------------------------------------------------ Hilfen
function toast(msg) {
  const t = document.createElement("div");
  t.className = "toast";
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 3200);
}
async function copyText(text, fallbackEl) {
  try {
    await navigator.clipboard.writeText(text);
    toast("Kopiert.");
  } catch {
    if (fallbackEl) {
      const r = document.createRange();
      r.selectNodeContents(fallbackEl);
      const s = getSelection();
      s.removeAllRanges();
      s.addRange(r);
    }
    toast("Kopieren ist hier gesperrt – der Text ist markiert, bitte mit Strg+C bzw. ⌘C kopieren.");
  }
}
const r = () => st.r[st.sel?.kind ?? st.mode];
const sameSel = (a, b) => !!a && !!b && a.kind === b.kind && a.lat === b.lat && a.lng === b.lng && (a.oid ?? null) === (b.oid ?? null);
/** Sind die voll geladenen Daten die der aktuellen Auswahl (Stelle + Radius)? */
const isFresh = () => !!app.rawFor?.full && sameSel(app.rawFor, st.sel) && app.rawFor.r === r();
const previewKeyNow = () => JSON.stringify([st.sel, r(), st.years]);
const linkQuery = () => (st.sel ? formatReportLink({ sel: st.sel, r: r(), years: st.years, land: st.land || null }) : null);
const absLink = () => (st.sel ? new URL(`report.html?${linkQuery()}`, document.baseURI).href : null);
const mapLink = () => (st.sel ? new URL(`index.html?${mapLinkFor({ lat: st.sel.lat, lng: st.sel.lng, years: st.years })}`, document.baseURI).href : null);
function syncUrl() {
  const q = linkQuery();
  try { history.replaceState(null, "", q ? `?${q}` : location.pathname); } catch { /* file:// o. Ä. */ }
}
const effectiveLand = () => st.land || app.place?.land || "bund";

// ------------------------------------------------------------------ Daten
async function loadRaw(sel, radius, { only, progress = false } = {}) {
  const proj = localProjection(sel.lat, sel.lng);
  const ext = extentOf(sel, radius);
  return readAll(app.reader, app.sources.urls, proj, ext, {
    only,
    onProgress: progress ? (done, total) => { app.progress = done / total; paintProgress(); } : undefined,
  });
}

/** Datenmodell (teuer: Geometrie über alle gelesenen Features). Nur bei neuen Daten/Jahren/Straße. */
function computeModel() {
  const { sel } = st;
  if (!sel || !app.raw) return;
  app.M = buildModel({ raw: app.raw, sel, r: r(), years: st.years, dataYears: app.dataYears, roadKey: st.roadKey });
  app.place = placeFrom({ landGeo: app.laender ? landAt(app.laender, sel.lng, sel.lat) : null, photon: app.photon, gemeinde: app.M.census?.gemeinde ?? null });
}

/** Regelwerk, Zuständigkeit, Titel (billig) — auch bei Antworten, Land und Brieftext. */
function computeRules() {
  const M = app.M;
  if (!M) return;
  const R = evaluate(M, { years: st.years, land: effectiveLand(), answers: st.answers, beob: st.beob });
  const adr = zustaendigkeit(R.P.land, app.place, { refClass: M.road?.refClass ?? null, major: M.road ? !M.road.minor : false });
  const title = titleOf(M, app.place);
  app.R = R;
  const V = { st, M, R, place: app.place, adr, title, meta: app.sources.meta, dataYears: app.dataYears, link: absLink(), mapLink: mapLink(), warnings: app.warnings, today: today() };
  V.E = { M, R, s: st, place: app.place, adr, title, today: V.today, meta: app.sources.meta };
  app.E = V;
}
function compute() {
  computeModel();
  computeRules();
}

/** Vollständigen Report laden (alle Datensätze) und darstellen. */
async function loadReport() {
  const gen = ++app.genReport;
  app.genPreview++; // eine laufende Vorschau ist damit überholt
  clearTimeout(rangeTimer);
  const selAt = { ...st.sel };
  const rAt = r();
  app.busyReport = true;
  app.progress = 0;
  app.error = null;
  delete document.documentElement.dataset.reportReady;
  render();
  try {
    const [raw] = await Promise.all([loadRaw(selAt, rAt, { progress: true }), ensureLaender()]);
    if (gen !== app.genReport) return;
    app.raw = raw;
    app.rawFor = { ...selAt, r: rAt, full: true };
    app.photon = null;
    compute();
    // Photon (Stadt/Kreis) nachladen, ohne den Report aufzuhalten.
    reverseGeocode(selAt.lat, selAt.lng).then((p) => {
      if (gen !== app.genReport || !p) return;
      app.photon = p;
      compute();
      render({ keep: true });
    });
  } catch (err) {
    console.error("[report] Laden fehlgeschlagen:", err);
    app.error = String(err?.message ?? err);
  } finally {
    if (gen === app.genReport) {
      app.busyReport = false;
      render();
      document.documentElement.dataset.reportReady = app.error ? "error" : "true";
    }
  }
}

async function ensureLaender() {
  app.laender ??= await loadLaender();
  return app.laender;
}

/** Vorschau in der Auswahl: nur die Kern-Datensätze. */
async function loadPreview() {
  if (!st.sel) return;
  const gen = ++app.genPreview;
  const selAt = { ...st.sel };
  const rAt = r();
  const key = previewKeyNow();
  app.busyPreview = true;
  renderPanelOnly();
  try {
    const raw = await loadRaw(selAt, rAt, { only: CORE });
    if (gen !== app.genPreview) return;
    const M = buildModel({ raw, sel: selAt, r: rAt, years: st.years, dataYears: app.dataYears });
    const sp = M.speed;
    app.preview = {
      n: M.accidents.n, nSP: M.accidents.nSP, fr: M.accidents.fr,
      speed: sp?.v != null ? `${sp.v} km/h${sp.derived ? "*" : ""}` : null,
      road: M.road ? M.streetName && M.road.ref ? `${M.streetName} · ${M.road.ref}` : M.road.label : null,
      fac: M.selection.fac ? M.selection.fac.name ?? "Einrichtung ohne Namen" : null, snap: app.snapNote,
    };
    app.previewM = M;
    app.previewKey = key;
    drawSelection(M);
  } catch (err) {
    console.error("[report] Vorschau fehlgeschlagen:", err);
    app.preview = null;
    toast("Die Daten für diese Stelle ließen sich nicht laden.");
  } finally {
    if (gen === app.genPreview) {
      app.busyPreview = false;
      renderPanelOnly();
    }
  }
}

// ------------------------------------------------------------------ Auswahlkarte
function setupMap() {
  app.mapReady ??= createMap();
  return app.mapReady;
}

async function createMap() {
  addProtocol("pmtiles", createPMTilesProtocol());
  const styleUrl = new URL("./style.json", document.baseURI).href;
  let style;
  try {
    const res = await fetch(styleUrl);
    style = await res.json();
    if (style.sprite && !/^https?:\/\//.test(style.sprite)) style.sprite = new URL(style.sprite, styleUrl).href;
  } catch {
    style = { version: 8, sources: {}, layers: [{ id: "bg", type: "background", paint: { "background-color": "#eef2ef" } }] };
  }
  const L = parseReportLink(location.search, { years: app.dataYears });
  const start = st.sel ?? L.map ?? { lat: 51.2, lng: 10.4 };
  try {
    app.map = new MapLibreMap({ container: "selmap", style, center: [start.lng, start.lat], zoom: st.sel ? 16.5 : L.map?.zoom ?? 6, minZoom: 5, maxZoom: 20 });
  } catch (err) {
    $("#selmap").innerHTML = `<div class="empty" style="margin:16px">Die Karte braucht WebGL2 (${esc(err?.message ?? err)}). Ein Report-Link funktioniert trotzdem.</div>`;
    return;
  }
  const map = app.map;
  map.addControl(new NavigationControl({ showCompass: false }), "top-right");
  // Wie die Karte: schon bei "style.load" (nicht erst "load", das auf alle Grundkarten-Kacheln
  // wartet) — sonst hinge die Auswahl an einem langsamen Grundkarten-Server.
  map.once("style.load", () => {
    const u = app.sources.urls;
    const pm = (url) => `pmtiles://${url}`;
    map.addSource("acc", { type: "vector", url: pm(u.accidents), encoding: "mlt", attribution: "Unfallatlas (dl-de/by-2-0)" });
    map.addLayer({ id: "acc", type: "circle", source: "acc", "source-layer": "accidents", minzoom: 11, filter: yearFilter(),
      paint: { "circle-radius": ["interpolate", ["linear"], ["zoom"], 11, 2, 15, 4.5, 18, 7], "circle-color": ["match", ["to-number", ["get", "UKATEGORIE"]], 1, "#7a1a1d", 2, "#c8402f", "#ee9a7c"], "circle-stroke-color": "#fff", "circle-stroke-width": 0.8 } });
    const facColor = { schools: "#2a78d6", health: "#d03b3b", playgrounds: "#008300" };
    const facLayer = { schools: "germany_osm_schools", health: "germany_osm_health", playgrounds: "germany_osm_playgrounds" };
    for (const id of FAC_IDS) {
      if (!u[id]) continue;
      map.addSource(`fac-${id}`, { type: "vector", url: pm(u[id]), attribution: "© OpenStreetMap-Mitwirkende (ODbL)" });
      map.addLayer({ id: `fac-${id}-fill`, type: "fill", source: `fac-${id}`, "source-layer": facLayer[id], minzoom: 14, filter: ["==", ["geometry-type"], "Polygon"], paint: { "fill-color": facColor[id], "fill-opacity": 0.18, "fill-outline-color": facColor[id] } });
      map.addLayer({ id: `fac-${id}-pt`, type: "circle", source: `fac-${id}`, "source-layer": facLayer[id], minzoom: 14, filter: ["==", ["geometry-type"], "Point"], paint: { "circle-radius": 5, "circle-color": facColor[id], "circle-stroke-color": "#fff", "circle-stroke-width": 1.2 } });
    }
    map.addSource("sel", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
    map.addLayer({ id: "sel-fill", type: "fill", source: "sel", filter: ["==", ["get", "k"], "area"], paint: { "fill-color": "#0d5a9e", "fill-opacity": 0.1 } });
    map.addLayer({ id: "sel-line", type: "line", source: "sel", filter: ["==", ["get", "k"], "area"], paint: { "line-color": "#0d5a9e", "line-width": 2, "line-dasharray": [3, 2] } });
    map.addLayer({ id: "sel-fac", type: "line", source: "sel", filter: ["==", ["get", "k"], "fac"], paint: { "line-color": "#0d5a9e", "line-width": 3 } });
    map.addLayer({ id: "sel-pt", type: "circle", source: "sel", filter: ["==", ["get", "k"], "pt"], paint: { "circle-radius": 5, "circle-color": "#0d5a9e", "circle-stroke-color": "#fff", "circle-stroke-width": 2 } });
    if (app.previewM ?? app.M) drawSelection(app.previewM ?? app.M);
    document.documentElement.dataset.mapReady = "true";
  });
  map.on("click", (e) => onMapClick(e.lngLat));
  map.getCanvas().style.cursor = "crosshair";
}

const yearFilter = () => ["all", [">=", ["to-number", ["get", "UJAHR"]], st.years.from], ["<=", ["to-number", ["get", "UJAHR"]], st.years.to]];

/** Auswahl in die Karte zeichnen (Kreis bzw. Puffer um die Einrichtung). */
function drawSelection(M) {
  const map = app.map;
  if (!map?.getSource("sel") || !st.sel) return;
  const proj = M?.proj ?? localProjection(st.sel.lat, st.sel.lng);
  const toLL = (ring) => [...ring, ring[0]].map((p) => proj.lngLat(p));
  const fac = M?.selection.fac;
  const area = fac ? bufferOutline(fac.geom, r()) : circleRing([0, 0], r(), 72);
  const features = [{ type: "Feature", properties: { k: "area" }, geometry: { type: "Polygon", coordinates: [toLL(area)] } }];
  if (fac) for (const poly of fac.geom.polygons) features.push({ type: "Feature", properties: { k: "fac" }, geometry: { type: "LineString", coordinates: [...poly[0], poly[0][0]].map((p) => proj.lngLat(p)) } });
  features.push({ type: "Feature", properties: { k: "pt" }, geometry: { type: "Point", coordinates: [st.sel.lng, st.sel.lat] } });
  map.getSource("sel").setData({ type: "FeatureCollection", features });
}

async function onMapClick({ lat, lng }) {
  const gen = ++app.genClick;
  const proj = localProjection(lat, lng);
  const small = (ids, m) => Promise.all(ids.map(async (id) => {
    const d = DATASETS.find((x) => x.id === id);
    if (!app.sources.urls[id]) return [id, { status: "missing", features: [] }];
    try {
      const { layers } = await app.reader.read(app.sources.urls[id], [d.layer], proj.bbox(m));
      return [id, { status: "ok", features: layers[d.layer] ?? [] }];
    } catch {
      return [id, { status: "error", features: [] }];
    }
  })).then(Object.fromEntries);
  try {
    if (st.mode === "e") {
      const raw = await small(FAC_IDS, 80);
      if (gen !== app.genClick) return;
      const hit = facilityAt(raw, lat, lng, 40);
      if (!hit) { toast("Hier liegt keine Schule, Kita, kein Spielplatz und keine Gesundheits-/Pflegeeinrichtung (laut OSM). Näher heranzoomen und auf die Fläche klicken."); return; }
      st.sel = { kind: "e", oid: hit.oid, lat: hit.lat, lng: hit.lng };
      app.snapNote = null;
    } else {
      const raw = await small(["roads", "roadsMinor"], 80);
      if (gen !== app.genClick) return;
      const snap = snapToJunction(raw, lat, lng, 30);
      st.sel = { kind: "k", lat: snap.lat, lng: snap.lng };
      app.snapNote = snap.snapped ? `Eingerastet auf den Knoten ${snap.roads.slice(0, 2).join(" / ")}.` : snap.roads.length ? `Kein Knoten in 30 m – Mittelpunkt an ${snap.roads[0]}.` : "Keine Straße in der Nähe.";
    }
  } catch (err) {
    console.error(err);
    toast("Die Daten für diese Stelle ließen sich nicht laden.");
    return;
  }
  resetData();
  syncUrl();
  drawSelection(null);
  loadPreview();
}

/** Neue Auswahl: alles, was zur alten gehörte, verwerfen. */
function resetData() {
  st.roadKey = null;
  st.answers = {};
  app.genReport++;
  app.raw = null;
  app.rawFor = null;
  app.M = null;
  app.E = null;
  app.previewM = null;
  app.preview = null;
  app.previewKey = null;
}

// ------------------------------------------------------------------ Suche (Photon, wie die Karte)
let searchTimer = null;
async function search(q) {
  const box = $("#sel-results");
  if (!box) return;
  if (q.trim().length < 3) { box.hidden = true; return; }
  try {
    const res = await fetch(`https://photon.komoot.io/api/?q=${encodeURIComponent(q)}&lang=de&limit=6&bbox=5,47,15,55`);
    const feats = (await res.json()).features ?? [];
    box.innerHTML = feats.map((f) => {
      const p = f.properties;
      const primary = p.street && p.housenumber ? `${p.street} ${p.housenumber}` : p.name || p.street || "Ort";
      const secondary = [p.postcode, p.city, p.state].filter(Boolean).join(" ");
      const [x, y] = (f.geometry?.coordinates ?? []).map(Number);
      if (!Number.isFinite(x) || !Number.isFinite(y)) return "";
      return `<button type="button" data-geo="${x},${y}">${esc(primary)}<small>${esc(secondary)}</small></button>`;
    }).join("") || '<div class="empty">Nichts gefunden.</div>';
    box.hidden = false;
  } catch {
    box.innerHTML = '<div class="empty">Die Suche ist gerade nicht erreichbar.</div>';
    box.hidden = false;
  }
}

// ------------------------------------------------------------------ Darstellung
function paintProgress() {
  const bar = $("#progress-bar");
  if (bar) bar.style.width = `${Math.round(app.progress * 100)}%`;
}
function renderPanelOnly() {
  const el = $("#selpanel");
  if (!el) return;
  const focusId = document.activeElement?.id;
  el.innerHTML = renderPanel({ st, dataYears: app.dataYears, preview: app.previewKey === previewKeyNow() ? app.preview : null, link: absLink(), busy: app.busyPreview });
  if (focusId === "sel-search") { const i = $("#sel-search"); i?.focus(); i?.setSelectionRange(i.value.length, i.value.length); }
  const hint = $("#map-hint");
  if (hint) hint.textContent = st.mode === "k" ? "Klick setzt den Mittelpunkt der Auswahl" : "Klick auf eine Einrichtung wählt sie aus";
}

function render({ keep = false } = {}) {
  const tabs = ["auswahl", "report", "brief", "pdf"];
  $$(".step").forEach((b) => {
    b.setAttribute("aria-selected", String(b.dataset.tab === st.tab));
    b.setAttribute("aria-disabled", String(b.dataset.tab !== "auswahl" && !st.sel));
  });
  for (const t of tabs) $(`#view-${t}`).hidden = t !== st.tab;
  if (st.tab === "auswahl") {
    renderPanelOnly();
    setupMap().then(() => app.map?.resize());
    return;
  }
  const view = $(`#view-${st.tab}`);
  if (!st.sel) { view.innerHTML = '<div class="empty">Bitte zuerst eine Stelle in der Karte wählen.</div>'; return; }
  if (app.busyReport) {
    view.innerHTML = `<div class="panel loading">Lade Daten für die Auswahl …<div class="progress"><i id="progress-bar" style="width:${Math.round(app.progress * 100)}%"></i></div><p class="hint">Unfälle, Straßen, Einrichtungen, Zensus, Lärm, Verkehr – direkt aus den Kacheln der Unfallkarte.</p></div>`;
    return;
  }
  if (app.error) { view.innerHTML = `<div class="notice">Der Report ließ sich nicht erstellen: ${esc(app.error)}</div>`; return; }
  if (!app.E || !isFresh()) { view.innerHTML = '<div class="panel loading">Wird vorbereitet …</div>'; return; }
  const scroll = window.scrollY;
  const focus = document.activeElement?.id;
  const pos = document.activeElement?.selectionStart;
  const open = $$("details.sec", view).map((d) => d.open);
  const V = { ...app.E, mapWidth: Math.max(320, Math.min(760, Math.round((view.clientWidth || 1100) * 0.56))) };
  if (st.tab === "report") view.innerHTML = renderReport(V);
  if (st.tab === "brief") view.innerHTML = renderBrief(V);
  if (st.tab === "pdf") view.innerHTML = renderPrint(V, { framed: (() => { try { return window.self !== window.top; } catch { return true; } })() });
  if (keep) {
    $$("details.sec", view).forEach((d, i) => { if (open[i] !== undefined) d.open = open[i]; });
    if (focus) {
      const el = document.getElementById(focus);
      if (el) { el.focus({ preventScroll: true }); if (pos != null && el.setSelectionRange) try { el.setSelectionRange(pos, pos); } catch { /* kein Textfeld */ } }
    }
    window.scrollTo(0, scroll);
  }
}

function setTab(tab) {
  if (tab !== "auswahl" && !st.sel) { toast("Bitte zuerst eine Stelle in der Karte wählen."); return; }
  st.tab = tab;
  if (tab === "auswahl") {
    render();
    // Jahre im Report geändert o. Ä.: Vorschau passt nicht mehr zur Auswahl.
    if (st.sel && app.previewKey !== previewKeyNow() && !app.busyPreview) loadPreview();
  } else if (!isFresh() && !app.busyReport) loadReport();
  else render();
  window.scrollTo({ top: 0 });
}

/** Neu bewerten nach Änderungen an Jahren/Straße (Modell) bzw. Antworten/Land (nur Regeln). */
function reevaluate({ model = false } = {}) {
  if (isFresh()) (model ? compute() : computeRules());
  syncUrl();
  render({ keep: true });
}

/** Brief beim Tippen: nur Vorschau, Zähler und Knöpfe — das Formular bleibt stehen. */
function updateLetter() {
  if (st.tab !== "brief" || !app.E) return;
  const P = letterParts({ ...app.E });
  const sheet = $("#letter");
  if (sheet) sheet.innerHTML = P.sheet;
  const count = $("#b-count");
  if (count) {
    count.textContent = `${P.len} Zeichen${P.ready ? "" : " – noch zu kurz"}`;
    count.classList.toggle("bad", !P.ready);
  }
  for (const id of ["#b-copy", "#b-mail"]) {
    const b = $(id);
    if (!b) continue;
    if (P.ready) b.removeAttribute("aria-disabled");
    else b.setAttribute("aria-disabled", "true");
  }
  const mail = $("#b-mail");
  if (mail) mail.setAttribute("href", P.ready ? P.mailto : "#");
}

// ------------------------------------------------------------------ Ereignisse
document.addEventListener("click", (ev) => {
  const t = ev.target.closest("button, a, [data-geo]");
  if (!t) return;
  if (t.dataset.tab) { setTab(t.dataset.tab); return; }
  if (t.dataset.go) { if (t.getAttribute("aria-disabled") === "true") { toast("Bitte zuerst eine Stelle in der Karte wählen."); return; } setTab(t.dataset.go); return; }
  if (t.dataset.mode) {
    if (t.dataset.mode === st.mode) return;
    st.mode = t.dataset.mode;
    // Eine Kreuzung ist keine Einrichtung: die Auswahl gilt nur für ihre Art.
    if (st.sel && st.sel.kind !== st.mode) {
      st.sel = null;
      resetData();
      syncUrl();
      app.map?.getSource("sel")?.setData({ type: "FeatureCollection", features: [] });
    }
    renderPanelOnly();
    return;
  }
  if (t.dataset.geo) {
    const [lng, lat] = t.dataset.geo.split(",").map(Number);
    app.map?.flyTo({ center: [lng, lat], zoom: 17, essential: true });
    $("#sel-results").hidden = true;
    return;
  }
  if (t.dataset.ans != null) {
    if (t.dataset.val === "") delete st.answers[t.dataset.ans];
    else st.answers[t.dataset.ans] = t.dataset.val;
    if (t.dataset.ans === "A5" && t.dataset.val !== "nein") delete st.answers.A5q;
    reevaluate();
    return;
  }
  if (t.dataset.copy) { const el = $(t.dataset.copy); copyText(el.textContent, el); return; }
  if (t.id === "b-copy") {
    if (t.getAttribute("aria-disabled") === "true") { toast("Bitte erst deine Beobachtung ergänzen (mindestens 80 Zeichen)."); return; }
    const L = buildLetter(app.E.E);
    copyText(`Betreff: ${L.subject}\n\n${L.body}`, $("#letter"));
    return;
  }
  if (t.id === "b-mail" && t.getAttribute("aria-disabled") === "true") { ev.preventDefault(); toast("Bitte erst deine Beobachtung ergänzen (mindestens 80 Zeichen)."); return; }
  if (t.id === "doprint") window.print();
});

document.addEventListener("input", (ev) => {
  const el = ev.target;
  if (el.id === "sel-search") {
    st.search = el.value;
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => search(el.value), 300);
    return;
  }
  const k = el.dataset.bind;
  if (!k) return;
  let v = el.value;
  if (k === "r") {
    st.r[st.mode] = Number(v);
    const lbl = el.closest(".field")?.querySelector("b");
    if (lbl) lbl.textContent = `${v} m`;
    const M = app.previewM ?? app.M;
    if (M) drawSelection(M);
    clearTimeout(rangeTimer);
    rangeTimer = setTimeout(() => { syncUrl(); loadPreview(); }, 250);
    return;
  }
  if (k === "from" || k === "to") {
    v = Number(v);
    st.years = { ...st.years, [k]: v };
    if (st.years.from > st.years.to) st.years = k === "from" ? { from: v, to: v } : { from: v, to: v };
    if (app.map?.getLayer("acc")) app.map.setFilter("acc", yearFilter());
    if (st.tab === "auswahl") { syncUrl(); loadPreview(); } else reevaluate({ model: true });
    return;
  }
  if (k === "land") { st.land = v; reevaluate(); return; }
  if (k === "roadKey") { st.roadKey = v; st.answers = {}; reevaluate({ model: true }); return; }
  st[k] = v;
  if (TEXT_FIELDS.includes(k)) {
    computeRules(); // B6 (Beobachtung) und der Brief hängen daran, das Modell nicht
    updateLetter();
    return;
  }
  render({ keep: true });
});
document.addEventListener("change", (ev) => {
  const el = ev.target;
  if (el.name === "brieftyp") { st.brief = el.value; render({ keep: true }); return; }
  if (el.dataset.cc) { st.cc[el.dataset.cc] = el.checked; render({ keep: true }); return; }
  if (el.dataset.bindCheck) { st[el.dataset.bindCheck] = el.checked; render({ keep: true }); }
});

// Tooltips (Karte + Diagramme)
let tipEl = null;
document.addEventListener("pointermove", (ev) => {
  const d = ev.target.closest?.("[data-tip]");
  const host = d?.closest(".mapbox, .chart");
  tipEl?.remove();
  tipEl = null;
  if (!d || !host) return;
  host.style.position = "relative";
  tipEl = document.createElement("div");
  tipEl.className = "tip";
  const [first, ...rest] = d.dataset.tip.split("\n");
  tipEl.innerHTML = `<strong>${esc(first)}</strong>${rest.map(esc).join("<br>")}`;
  host.appendChild(tipEl);
  const hb = host.getBoundingClientRect();
  let x = ev.clientX - hb.left + 12;
  if (x + 250 > hb.width) x = Math.max(4, ev.clientX - hb.left - 260);
  tipEl.style.left = `${x}px`;
  tipEl.style.top = `${ev.clientY - hb.top + 12}px`;
});
// Drucken aus jeder Ansicht druckt das Dokument — aber nur, wenn es zur Auswahl passt.
window.addEventListener("beforeprint", () => { if (st.sel && app.E && isFresh() && st.tab !== "pdf") { st.tab = "pdf"; render(); } });
let rsz;
window.addEventListener("resize", () => { clearTimeout(rsz); rsz = setTimeout(() => { if (st.tab === "report") render({ keep: true }); }, 200); });

// ------------------------------------------------------------------ Start
(async function init() {
  $("#rw-version").textContent = RW.version;
  try {
    app.sources = await resolveReportSources();
  } catch (err) {
    app.sources = { urls: {}, meta: {}, manifestOk: false };
    console.error(err);
  }
  const last = Number(/(\d{4})/.exec(String(app.sources.meta?.accidents?.vintage ?? ""))?.[1]) || 2025;
  app.dataYears = Array.from({ length: last - 2017 + 1 }, (_, i) => 2017 + i);
  const L = parseReportLink(location.search, { years: app.dataYears });
  st.years = L.years;
  app.warnings = L.warnings;
  st.land = L.land ?? "";
  if (L.sel && SUPPORTED_KINDS.includes(L.sel.kind)) {
    st.sel = { ...L.sel };
    st.mode = L.sel.kind;
    st.r[L.sel.kind] = L.r;
    if (!app.sources.manifestOk) app.warnings.push("Das Daten-Manifest war nicht erreichbar – nur die Unfalldaten stehen sicher zur Verfügung.");
    syncUrl(); // Jahre (und Radius) ausgeschrieben in die Adresszeile: so wird der Link teilbar
    setTab("report");
  } else {
    render();
  }
})();
