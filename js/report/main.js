// main.js — Analyse-Report (report.html): Verdrahtung. Der einzige Ort mit DOM und fetch;
// Datenmodell, Regelwerk und Texte sind reine Module (browserlos getestet, tests/unit/report-*).
//
// Ablauf: Link lesen (reportLink.js) → Quellen auflösen (Manifest, Local-first/B2) → Kacheln im
// Umfeld lesen (tileReader.js) → Modell (model.js) → Regelwerk (rules/) → Ansichten (render/).
// Gewählt wird die Stelle in der Karte (js/analysis/: Akkordeon „Analyse", Rechtsklick, Popup);
// hier gibt es keine eigene Auswahlkarte und damit kein MapLibre — die Karte im Report ist SVG.
// Eigene Eingaben (Rolle, Beobachtung, Name) bleiben im Arbeitsspeicher und nie im Link.
import { createTileReader } from "./tileReader.js";
import { DATASETS, extentOf, readAll, resolveReportSources } from "./sources.js";
import { buildModel } from "./model.js";
import { localProjection } from "./geometry.js";
import { evaluate } from "./rules/synthesis.js";
import { RADIUS, SUPPORTED_KINDS, formatReportLink, mapLinkFor, parseReportLink } from "./reportLink.js";
import { landAt, loadLaender, placeFrom, reverseGeocode } from "./place.js";
import { zustaendigkeit } from "./addressee.js";
import { titleOf, buildLetter } from "./texts.js";
import { letterParts, renderBrief, renderEmpty, renderPrint, renderReport } from "./render/views.js";
import { esc, today } from "./render/common.js";
import { RW } from "./rules/params.js";

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const st = {
  tab: "report", sel: null, r: { k: RADIUS.k.def, e: RADIUS.e.def }, years: null, land: "", roadKey: null, answers: {},
  brief: "anregung", role: "eltern", tone: "sachlich", beob: "", name: "", kontakt: "", anschrift: "", initiative: "", hausnr: "",
  ortstermin: true, cc: { polizei: false, bv: false }, behoerde: "", behoerdeMail: "",
};
// genReport verwirft Ergebnisse überholter Läufe (ein später fertiger alter Lauf überschriebe sonst den neuen).
const app = {
  sources: null, reader: createTileReader(), dataYears: [], raw: null, rawFor: null, M: null, R: null, E: null, place: null, photon: null,
  laender: null, busyReport: false, warnings: [], genReport: 0, progress: 0, error: null,
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
const r = () => st.r[st.sel?.kind ?? "k"];
const sameSel = (a, b) => !!a && !!b && a.kind === b.kind && a.lat === b.lat && a.lng === b.lng && (a.oid ?? null) === (b.oid ?? null);
/** Sind die voll geladenen Daten die der aktuellen Auswahl (Stelle + Radius)? */
const isFresh = () => !!app.rawFor?.full && sameSel(app.rawFor, st.sel) && app.rawFor.r === r();
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

/**
 * Vollständigen Report laden (alle Datensätze) und darstellen. `quiet`: der alte Report bleibt
 * stehen, bis der neue fertig ist (Radius ändern) — statt kurz die Lade-Ansicht zu zeigen.
 */
async function loadReport({ quiet = false } = {}) {
  const gen = ++app.genReport;
  clearTimeout(rangeTimer);
  const selAt = { ...st.sel };
  const rAt = r();
  app.busyReport = !quiet;
  app.progress = 0;
  app.error = null;
  delete document.documentElement.dataset.reportReady;
  if (!quiet) render();
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
      render({ keep: quiet });
      document.documentElement.dataset.reportReady = app.error ? "error" : "true";
    }
  }
}

async function ensureLaender() {
  app.laender ??= await loadLaender();
  return app.laender;
}

// ------------------------------------------------------------------ Darstellung
function paintProgress() {
  const bar = $("#progress-bar");
  if (bar) bar.style.width = `${Math.round(app.progress * 100)}%`;
}
function render({ keep = false } = {}) {
  const tabs = ["report", "brief", "pdf"];
  $$(".step").forEach((b) => {
    b.setAttribute("aria-selected", String(b.dataset.tab === st.tab));
    b.setAttribute("aria-disabled", String(!st.sel));
  });
  for (const t of tabs) $(`#view-${t}`).hidden = t !== st.tab;
  const view = $(`#view-${st.tab}`);
  if (!st.sel) { view.innerHTML = renderEmpty({ warnings: app.warnings }); return; }
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
  if (!st.sel) { toast("Bitte zuerst in der Karte eine Stelle wählen."); return; }
  st.tab = tab;
  if (!isFresh() && !app.busyReport) loadReport();
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
  const t = ev.target.closest("button, a");
  if (!t) return;
  if (t.dataset.tab) { setTab(t.dataset.tab); return; }
  if (t.dataset.go) { if (t.getAttribute("aria-disabled") === "true") { toast("Bitte zuerst in der Karte eine Stelle wählen."); return; } setTab(t.dataset.go); return; }
  if (t.dataset.ans != null) {
    if (t.dataset.val === "") delete st.answers[t.dataset.ans];
    else st.answers[t.dataset.ans] = t.dataset.val;
    if (t.dataset.ans === "A5" && t.dataset.val !== "nein") delete st.answers.A5q;
    reevaluate();
    return;
  }
  if (t.dataset.copy) { const el = $(t.dataset.copy); copyText(el.textContent, el); return; }
  if (t.id === "rep-copy-link") { copyText(absLink() ?? location.href); return; }
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
  const k = el.dataset.bind;
  if (!k) return;
  let v = el.value;
  if (k === "r") {
    if (!st.sel) return;
    st.r[st.sel.kind] = Number(v);
    const lbl = el.closest(".field")?.querySelector("b");
    if (lbl) lbl.textContent = `${v} m`;
    clearTimeout(rangeTimer);
    rangeTimer = setTimeout(() => { syncUrl(); loadReport({ quiet: true }); }, 350);
    return;
  }
  if (k === "from" || k === "to") {
    v = Number(v);
    st.years = { ...st.years, [k]: v };
    if (st.years.from > st.years.to) st.years = k === "from" ? { from: v, to: v } : { from: v, to: v };
    reevaluate({ model: true });
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
    st.r[L.sel.kind] = L.r;
    if (!app.sources.manifestOk) app.warnings.push("Das Daten-Manifest war nicht erreichbar – nur die Unfalldaten stehen sicher zur Verfügung.");
    syncUrl(); // Jahre (und Radius) ausgeschrieben in die Adresszeile: so wird der Link teilbar
    setTab("report");
  } else {
    render();
    document.documentElement.dataset.reportReady = "empty";
  }
})();
