// exportDialog.js — der Dialog „Unfälle herunterladen" (die DOM-Seite des Exports).
//
// Kommt samt accidentExport.js, hyparquet und fzstd erst beim ersten Klick auf den
// Download-Knopf (dynamischer Import in main.js → eigener Vite-Chunk). Gebiet ist der
// Kartenausschnitt; Filter wie in der Karte (dieselbe Logik wie der MapLibre-Filter) oder alle
// Unfälle der Datei — die reicht weiter zurück als die Karte.
//
// Ablauf: Footer-Statistik → Schätzung → bis LIMITS.confirmBytes direkt, bis maxBytes auf
// Nachfrage die Row Groups des Ausschnitts lesen → im Browser filtern → die Datei erst beim
// Klick erzeugen. Filter umschalten lädt nichts nach.

import {
  LIMITS, bboxPolygon, citation, coverageWarnings, estimate, fileColumn, fileName, matchesSelection,
  openDataset, readArea, resolveLatestUrl, toCSV, toGeoJSON, yearRanges,
} from "./accidentExport.js";
import { GROUPS, readSelection } from "../map/accidentLayers.js";
import { mayHaveLocalTree } from "../mapdata/resolveSources.js";
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

let ui = null;              // Elemente des Dialogs, einmal gebaut
let datasetPromise = null;  // openDataset, einmal je Sitzung (nach einem Fehler neu)
let latest = null;          // latest.json der geöffneten Datei
let area = null;            // { key, geometry, bytes, rows } — der zuletzt gelesene Ausschnitt
let output = null;          // { rows, sel, hints } — was ein Klick auf GeoJSON/CSV schreibt
let run = 0;                // verwirft Ergebnisse überholter Läufe

/** Dialog öffnen und den aktuellen Kartenausschnitt vorbereiten. */
export function openExportDialog(map) {
  ui ??= buildDialog();
  ui.dialog.showModal();
  prepare(map);
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

async function prepare(map) {
  const id = ++run;
  const b = map.getBounds();
  const bbox = [b.getWest(), b.getSouth(), b.getEast(), b.getNorth()];
  const key = bbox.map((v) => v.toFixed(6)).join(",");
  if (area?.key === key && area.rows) return render();   // derselbe Ausschnitt: schon gelesen

  area = { key, geometry: bboxPolygon(bbox), bytes: 0, rows: null };
  setStatus("Lade den Datenkatalog …", { busy: true });
  let ds;
  try {
    ds = await dataset();
  } catch (err) {
    if (id === run) fail(err);
    return;
  }
  if (id !== run) return;

  const est = estimate(ds, bbox);
  area.bytes = est.bytes;
  if (!est.groups) {
    area.rows = [];
    return render();
  }
  if (est.bytes > LIMITS.maxBytes) {
    return setStatus(
      `Der Ausschnitt ist zu groß für den Browser: Er berührt ${fmtMB(est.bytes)} Daten (Grenze ${fmtMB(LIMITS.maxBytes)}). `
      + "Zoome näher heran oder nimm die Gesamtdatei (Link unten).",
    );
  }
  if (est.bytes > LIMITS.confirmBytes) {
    setStatus(`Für diesen Ausschnitt sind ${fmtMB(est.bytes)} zu laden.`);
    ui.load.textContent = `${fmtMB(est.bytes)} laden`;
    ui.load.hidden = false;
    ui.load.onclick = () => load(id, ds);
    return;
  }
  load(id, ds);
}

async function load(id, ds) {
  setStatus(`Lade ${fmtMB(area.bytes)} …`, { busy: true });
  try {
    const rows = await readArea(ds, area.geometry);
    if (id !== run) return;
    area.rows = rows;
    render();
  } catch (err) {
    if (id === run) fail(err);
  }
}

function render() {
  const mode = ui.dialog.querySelector('input[name="export-filter"]:checked').value;
  const sel = mode === "map" ? readSelection() : null;
  const rows = area.rows.filter((r) => matchesSelection(r, sel));
  const years = sel ? sel.byGroup.UJAHR : range(...latest.jahre);
  const firstMapYear = Math.min(...allValues("UJAHR"));

  const hints = ["Nur Unfälle mit Personenschaden (Unfallatlas)."];
  if (!sel && latest.jahre[0] < firstMapYear) {
    hints.push(`Enthält auch ${yearRanges(range(latest.jahre[0], firstMapYear - 1))} — die Karte zeigt erst ab ${firstMapYear}.`);
  }
  hints.push(...coverageWarnings(rows, latest, years));
  output = { rows, sel, hints };

  ui.filterText.textContent = describe(sel);
  ui.hints.replaceChildren(...hints.map((h) => Object.assign(document.createElement("li"), { textContent: h })));
  const ok = rows.length > 0 && rows.length <= LIMITS.maxRows;
  if (!area.rows.length) setStatus("Im Kartenausschnitt liegen keine Unfälle.");
  else if (!rows.length) setStatus("Mit diesem Filter bleibt im Ausschnitt kein Unfall.");
  else if (!ok) {
    setStatus(`${fmtN(rows.length)} Unfälle — mehr als ${fmtN(LIMITS.maxRows)} sind zu viel für eine Datei aus dem Browser. `
      + "Zoome näher heran, filtere stärker oder nimm die Gesamtdatei.");
  } else {
    const of = sel && rows.length !== area.rows.length ? ` (von ${fmtN(area.rows.length)} im Ausschnitt)` : "";
    setStatus(`${fmtN(rows.length)} Unfälle${of} · geladen ${fmtMB(area.bytes)}`, { ok: true });
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
    ? toGeoJSON(rows, latest, { created, geometry: area.geometry, filterText: describe(sel), warnings: hints })
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
        <dd>Kartenausschnitt</dd>
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
  };

  el(".export-close").addEventListener("click", () => dialog.close());
  // Klick auf den abgedunkelten Hintergrund schließt (der Inhalt liegt in .export-body).
  dialog.addEventListener("click", (e) => { if (e.target === dialog) dialog.close(); });
  dialog.querySelectorAll('input[name="export-filter"]').forEach((input) =>
    input.addEventListener("change", () => area?.rows && render()));
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
