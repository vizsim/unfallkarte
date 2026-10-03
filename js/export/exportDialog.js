// exportDialog.js — der Dialog „Unfälle herunterladen" (die DOM-Seite des Exports).
//
// Kommt samt accidentExport.js, hyparquet und fzstd erst beim ersten Klick auf den
// Download-Knopf (dynamischer Import in main.js → eigener Vite-Chunk). Gebiet: Kartenausschnitt
// oder ein gezeichnetes Gebiet (js/selection/; Terra Draw lädt erst beim Zeichnen). Filter: wie
// in der Karte (dieselbe Logik wie der MapLibre-Filter) oder alle Unfälle der Datei — die reicht
// weiter zurück als die Karte.
//
// Ablauf: Footer-Statistik → Schätzung → bis LIMITS.confirmBytes direkt, bis maxBytes auf
// Nachfrage die Row Groups des Gebiets lesen → im Browser filtern → die Datei erst beim Klick
// erzeugen. Filter umschalten lädt nichts nach.

import {
  LIMITS, bboxOf, bboxPolygon, citation, coverageWarnings, estimate, fileColumn, fileName,
  matchesSelection, openDataset, readArea, resolveLatestUrl, toCSV, toGeoJSON, yearRanges,
} from "./accidentExport.js";
import { GROUPS, readSelection } from "../map/accidentLayers.js";
import { mayHaveLocalTree } from "../mapdata/resolveSources.js";
import { getArea, setArea } from "../selection/areaSelection.js";
import { translations } from "../ui/accidentLabels.js";

const GROUP_NAMES = { UKATEGORIE: "Schwere", UART: "Unfallart", UTYP1: "Unfalltyp" };
const COPY_LABEL = "Quellenvermerk kopieren";

const fmtMB = (bytes) => (bytes < 1e6
  ? `${Math.max(1, Math.round(bytes / 1e3))} KB`
  : `${(bytes / 1e6).toLocaleString("de-DE", { maximumFractionDigits: 1 })} MB`);
const fmtN = (n) => n.toLocaleString("de-DE");
const range = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => a + i);
const allValues = (group) =>
  [...document.querySelectorAll(`input[data-group="${group}"]`)].map((cb) => parseInt(cb.value, 10));

let map = null;
let ui = null;              // Elemente des Dialogs, einmal gebaut
let datasetPromise = null;  // openDataset, einmal je Sitzung (nach einem Fehler neu)
let latest = null;          // latest.json der geöffneten Datei
let loaded = null;          // { key, geometry, drawn, bytes, rows } — das zuletzt gelesene Gebiet
let output = null;          // { rows, sel, hints } — was ein Klick auf GeoJSON/CSV schreibt
let run = 0;                // verwirft Ergebnisse überholter Läufe

/** Dialog öffnen: mit gezeichnetem Gebiet, wenn es eins gibt, sonst mit dem Kartenausschnitt. */
export function openExportDialog(mapInstance) {
  map = mapInstance;
  ui ??= buildDialog();
  setAreaMode(getArea() ? "drawn" : "view");
  ui.dialog.showModal();
  prepare();
}

function dataset() {
  datasetPromise ??= resolveLatestUrl({ tryLocal: mayHaveLocalTree(), base: document.baseURI })
    .then((url) => openDataset(url))
    .then((ds) => {
      latest = ds.latest;
      ui.quelle.textContent = citation(latest);
      return ds;
    })
    .catch((err) => {
      datasetPromise = null;
      throw err;
    });
  return datasetPromise;
}

// --- Gebiet ------------------------------------------------------------------------------

const areaMode = () => ui.dialog.querySelector('input[name="export-area"]:checked').value;

function setAreaMode(mode) {
  ui.dialog.querySelector(`input[name="export-area"][value="${mode}"]`).checked = true;
  const has = !!getArea();
  ui.drawnLabel.textContent = has ? "Gezeichnetes Gebiet" : "Gebiet zeichnen";
  ui.areaActions.hidden = !(has && mode === "drawn");
}

const viewPolygon = () => {
  const b = map.getBounds();
  return bboxPolygon([b.getWest(), b.getSouth(), b.getEast(), b.getNorth()].map((v) => Math.round(v * 1e6) / 1e6));
};

/** Zeichnen (initial = null) oder bearbeiten; der Dialog geht solange zu und danach wieder auf. */
async function editArea(initial) {
  ui.dialog.close();
  try {
    const { drawArea } = await import("../selection/drawArea.js");
    const result = await drawArea(map, initial);
    if (result) setArea(map, result);
  } catch (err) {
    console.error("[export] Zeichnen fehlgeschlagen:", err);
  }
  setAreaMode(getArea() ? "drawn" : "view");
  ui.dialog.showModal();
  prepare();
}

// --- Laden -------------------------------------------------------------------------------

async function prepare() {
  const id = ++run;
  const drawn = areaMode() === "drawn" ? getArea() : null;
  const geometry = drawn ?? viewPolygon();
  const key = JSON.stringify(geometry.coordinates);
  if (loaded?.key === key && loaded.rows) return render();   // dasselbe Gebiet: schon gelesen

  loaded = { key, geometry, drawn: !!drawn, bytes: 0, rows: null };
  setStatus("Lade den Datenkatalog …", { busy: true });
  let ds;
  try {
    ds = await dataset();
  } catch (err) {
    if (id === run) fail(err);
    return;
  }
  if (id !== run) return;

  const est = estimate(ds, bboxOf(geometry));
  loaded.bytes = est.bytes;
  if (!est.groups) {
    loaded.rows = [];
    return render();
  }
  if (est.bytes > LIMITS.maxBytes) {
    return setStatus(
      `Zu groß für den Browser: Hier wären ${fmtMB(est.bytes)} zu laden (Grenze ${fmtMB(LIMITS.maxBytes)}). `
      + "Zoome näher heran, zeichne ein kleineres Gebiet oder nimm die Gesamtdatei (Link unten).",
    );
  }
  if (est.bytes > LIMITS.confirmBytes) {
    setStatus(`Hier sind ${fmtMB(est.bytes)} zu laden.`);
    ui.load.textContent = `${fmtMB(est.bytes)} laden`;
    ui.load.hidden = false;
    ui.load.onclick = () => load(id, ds);
    return;
  }
  load(id, ds);
}

async function load(id, ds) {
  setStatus(`Lade ${fmtMB(loaded.bytes)} …`, { busy: true });
  try {
    const rows = await readArea(ds, loaded.geometry);
    if (id !== run) return;
    loaded.rows = rows;
    render();
  } catch (err) {
    if (id === run) fail(err);
  }
}

function render() {
  const mode = ui.dialog.querySelector('input[name="export-filter"]:checked').value;
  const sel = mode === "map" ? readSelection() : null;
  const rows = loaded.rows.filter((r) => matchesSelection(r, sel));
  const years = sel ? sel.byGroup.UJAHR : range(...latest.jahre);
  const firstMapYear = Math.min(...allValues("UJAHR"));
  const where = loaded.drawn ? "im Gebiet" : "im Ausschnitt";

  const hints = ["Nur Unfälle mit Personenschaden (Unfallatlas)."];
  if (!sel && latest.jahre[0] < firstMapYear) {
    hints.push(`Enthält auch ${yearRanges(range(latest.jahre[0], firstMapYear - 1))} — die Karte zeigt erst ab ${firstMapYear}.`);
  }
  hints.push(...coverageWarnings(rows, latest, years));
  output = { rows, sel, hints };

  ui.filterText.textContent = describe(sel);
  ui.hints.replaceChildren(...hints.map((h) => Object.assign(document.createElement("li"), { textContent: h })));
  const ok = rows.length > 0 && rows.length <= LIMITS.maxRows;
  if (!loaded.rows.length) setStatus(`${loaded.drawn ? "Im Gebiet" : "Im Kartenausschnitt"} liegen keine Unfälle.`);
  else if (!rows.length) setStatus(`Mit diesem Filter bleibt ${where} kein Unfall.`);
  else if (!ok) {
    setStatus(`${fmtN(rows.length)} Unfälle — mehr als ${fmtN(LIMITS.maxRows)} sind zu viel für eine Datei aus dem Browser. `
      + "Zoome näher heran, filtere stärker oder nimm die Gesamtdatei.");
  } else {
    const of = sel && rows.length !== loaded.rows.length ? ` (von ${fmtN(loaded.rows.length)} ${where})` : "";
    setStatus(`${fmtN(rows.length)} Unfälle${of} · geladen ${fmtMB(loaded.bytes)}`, { ok: true });
  }
  for (const btn of ui.formats) btn.disabled = !ok;
}

/** Die Auswahl als Text, für Dialog und GeoJSON-Metadaten. */
function describe(sel) {
  if (!sel) return `alle Unfälle der Datei (${yearRanges(range(...latest.jahre))})`;
  const parts = [];
  for (const group of GROUPS) {
    const chosen = sel.byGroup[group];
    if (chosen.length === allValues(group).length) continue;
    parts.push(group === "UJAHR"
      ? `Jahre ${yearRanges(chosen) || "keine"}`
      : `${GROUP_NAMES[group]}: ${chosen.map((v) => translations[group]?.[v] ?? v).join(", ") || "keine"}`);
  }
  const fields = document.querySelectorAll("input[data-field]").length;
  if (sel.beteiligungen.length !== fields) {
    const names = sel.beteiligungen.map((f) => latest.beteiligung?.[fileColumn(f)] ?? f);
    parts.push(`Beteiligung: ${names.join(", ") || "keine"}`);
  }
  return parts.length ? parts.join(" · ") : `alle Unfälle der Karte (${yearRanges(allValues("UJAHR"))})`;
}

function download(format) {
  const { rows, sel, hints } = output;
  const created = new Date().toISOString();
  const text = format === "geojson"
    ? toGeoJSON(rows, latest, { created, geometry: loaded.geometry, filterText: describe(sel), warnings: hints })
    : toCSV(rows, latest);
  const type = format === "geojson" ? "application/geo+json" : "text/csv;charset=utf-8";
  const a = Object.assign(document.createElement("a"), {
    href: URL.createObjectURL(new Blob([text], { type })),
    download: fileName(format, latest, created),
  });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
}

function setStatus(text, { busy = false, ok = false } = {}) {
  ui.status.textContent = text;
  ui.status.classList.toggle("is-ok", ok);
  ui.dialog.setAttribute("aria-busy", String(busy));
  ui.load.hidden = true;
  if (!ok) for (const btn of ui.formats) btn.disabled = true;
}

function fail(err) {
  console.error("[export]", err);
  setStatus("Die Unfalldaten konnten nicht geladen werden. Bitte später noch einmal versuchen.");
}

function buildDialog() {
  const dialog = document.createElement("dialog");
  dialog.id = "export-dialog";
  dialog.className = "export-dialog";
  dialog.setAttribute("aria-labelledby", "export-title");
  // Nur statischer Text im Markup; alles aus den Daten kommt per textContent hinein.
  dialog.innerHTML = `
    <div class="export-body">
      <div class="export-head">
        <h2 id="export-title">Unfälle herunterladen</h2>
        <button type="button" class="export-close" aria-label="Schließen">×</button>
      </div>
      <dl class="export-grid">
        <dt>Gebiet</dt>
        <dd>
          <div class="legend-modes" role="radiogroup" aria-label="Gebiet">
            <label class="legend-chip"><input type="radio" name="export-area" value="view" checked><span>Kartenausschnitt</span></label>
            <label class="legend-chip"><input type="radio" name="export-area" value="drawn"><span class="export-drawn-label">Gebiet zeichnen</span></label>
          </div>
          <p class="export-area-actions" hidden>
            <button type="button" class="export-link" data-area="edit">bearbeiten</button> ·
            <button type="button" class="export-link" data-area="redraw">neu zeichnen</button> ·
            <button type="button" class="export-link" data-area="delete">löschen</button>
          </p>
        </dd>
        <dt>Filter</dt>
        <dd>
          <div class="legend-modes" role="radiogroup" aria-label="Filter">
            <label class="legend-chip"><input type="radio" name="export-filter" value="map" checked><span>wie in der Karte</span></label>
            <label class="legend-chip"><input type="radio" name="export-filter" value="all"><span>alle Unfälle</span></label>
          </div>
          <p class="export-filter-text"></p>
        </dd>
      </dl>
      <p class="export-status" role="status" aria-live="polite"></p>
      <button type="button" class="export-load" hidden></button>
      <ul class="export-hints"></ul>
      <div class="export-actions">
        <button type="button" class="export-format" data-format="geojson" disabled>GeoJSON <small>QGIS, uMap</small></button>
        <button type="button" class="export-format" data-format="csv" disabled>CSV <small>Excel</small></button>
      </div>
      <div class="export-source">
        <p class="export-quelle"></p>
        <button type="button" class="export-copy">${COPY_LABEL}</button>
      </div>
      <p class="export-more">Ganz Deutschland, Anleitung und Python-Beispiele:
        <a href="https://data.vizsim.de/unfallorte/" target="_blank" rel="noopener">data.vizsim.de/unfallorte</a></p>
    </div>`;
  document.body.append(dialog);

  const el = (sel) => dialog.querySelector(sel);
  const refs = {
    dialog,
    status: el(".export-status"),
    load: el(".export-load"),
    hints: el(".export-hints"),
    filterText: el(".export-filter-text"),
    quelle: el(".export-quelle"),
    copy: el(".export-copy"),
    formats: [...dialog.querySelectorAll(".export-format")],
    drawnLabel: el(".export-drawn-label"),
    areaActions: el(".export-area-actions"),
  };

  el(".export-close").addEventListener("click", () => dialog.close());
  // Klick auf den abgedunkelten Hintergrund schließt (der Inhalt liegt in .export-body).
  dialog.addEventListener("click", (e) => { if (e.target === dialog) dialog.close(); });
  dialog.querySelectorAll('input[name="export-filter"]').forEach((input) =>
    input.addEventListener("change", () => loaded?.rows && render()));
  // „Gebiet zeichnen" ohne Gebiet startet das Zeichnen; mit Gebiet schaltet es nur um.
  dialog.querySelectorAll('input[name="export-area"]').forEach((input) =>
    input.addEventListener("change", () => {
      if (input.value === "drawn" && !getArea()) return editArea(null);
      setAreaMode(input.value);
      prepare();
    }));
  dialog.querySelectorAll("[data-area]").forEach((btn) => btn.addEventListener("click", () => {
    const action = btn.dataset.area;
    if (action === "edit") return editArea(getArea());
    if (action === "redraw") return editArea(null);
    setArea(map, null);   // löschen
    setAreaMode("view");
    prepare();
  }));
  refs.formats.forEach((btn) => btn.addEventListener("click", () => download(btn.dataset.format)));
  refs.copy.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(latest ? citation(latest) : "");
      refs.copy.textContent = "Kopiert ✓";
    } catch {
      getSelection()?.selectAllChildren(refs.quelle);   // ohne Clipboard-Recht: zum Kopieren markieren
    }
    setTimeout(() => { refs.copy.textContent = COPY_LABEL; }, 2000);
  });
  return refs;
}
