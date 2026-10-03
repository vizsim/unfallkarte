// accidentExport.js — Unfälle eines Gebiets aus der veröffentlichten GeoParquet-Datei lesen
// (data.vizsim.de/unfallorte/, gebaut von `unfallkarte publish`) und als GeoJSON oder CSV
// ausgeben.
//
// REIN bis aufs Laden: kein DOM, kein window — darum browserlos testbar
// (tests/unit/accidentExport.test.js). hyparquet liest per HTTP-Range nur die Row Groups,
// deren Min/Max-Koordinaten das Gebiet berühren (die Datei ist räumlich sortiert), fzstd
// entpackt sie. Beides kommt mit dem Export-Dialog als eigener Chunk erst beim ersten Öffnen.

import { asyncBufferFromUrl, cachedAsyncBuffer, parquetMetadataAsync, parquetReadObjects } from "hyparquet";
import { decompress } from "fzstd";

/** latest.json: lokal (pipeline/data/publish/, nur auf dem Entwicklungsrechner) oder online. */
export const LATEST_URLS = {
  local: "./data/publish/unfallorte/latest.json",
  remote: "https://data.vizsim.de/unfallorte/latest.json",
};

/** Bis confirmBytes direkt laden, bis maxBytes nachfragen; darüber auf die Gesamtdatei verweisen. */
export const LIMITS = { confirmBytes: 15e6, maxBytes: 60e6, maxRows: 50_000 };

const compressors = { ZSTD: (input, outputLength) => decompress(input, new Uint8Array(outputLength)) };

/** Spalten mit Schlüssel → zusätzlich `<SPALTE>_text` in GeoJSON und CSV. */
const LABELLED = ["UWOCHENTAG", "UKATEGORIE", "UART", "UTYP1", "ULICHTVERH", "USTRZUSTAND", "ULAND"];

/** Die Karte filtert mit den internen Namen der Pipeline, die Datei heißt wie die Datensatzbeschreibung. */
const MAP_TO_FILE = { IstSonstig: "IstSonstige" };
export const fileColumn = (field) => MAP_TO_FILE[field] ?? field;

/** Die Lage steht in XGCSWGS84/YGCSWGS84; die WKB-Geometrie (~¼ der Datei) brauchen wir nicht. */
const SKIP = new Set(["geometry"]);

// ---------------------------------------------------------------------------------------
// Laden

/**
 * Wo liegt latest.json? Lokal nur, wenn es einen data/-Baum geben kann (Entwicklungsrechner)
 * UND die Datei dort existiert — sonst online. `base` macht die lokale URL absolut.
 */
export async function resolveLatestUrl({ tryLocal, base, fetchImpl = fetch }) {
  if (tryLocal) {
    const local = new URL(LATEST_URLS.local, base).href;
    try {
      if ((await fetchImpl(local, { method: "HEAD", cache: "no-cache" })).ok) return local;
    } catch { /* kein lokaler Baum */ }
  }
  return LATEST_URLS.remote;
}

/** latest.json laden, Datei öffnen, Footer lesen — einmal je Sitzung, danach wiederverwenden. */
export async function openDataset(latestUrl, { fetchImpl = fetch } = {}) {
  const res = await fetchImpl(latestUrl, { cache: "no-cache" });
  if (!res.ok) throw new Error(`latest.json: HTTP ${res.status}`);
  const latest = await res.json();
  // Die versionierte Datei, nie der Alias: eine offene Sitzung liest so nie alte und neue
  // Bytes gemischt. Relativ zu latest.json → lokal und online gleich.
  const url = new URL(latest.datei, latestUrl).href;
  const remote = await asyncBufferFromUrl({ url, byteLength: latest.bytes, fetch: fetchImpl });
  // Gelesene Bereiche bleiben im Speicher: Filter oder Format wechseln lädt nichts nach.
  const file = cachedAsyncBuffer(remote, { minSize: latest.footer_bytes + 8 });
  const metadata = await parquetMetadataAsync(file, { initialFetchSize: latest.footer_bytes + 8 });
  const columns = metadata.schema.slice(1).map((s) => s.name).filter((n) => !SKIP.has(n));
  return { latest, url, file, metadata, columns };
}

// ---------------------------------------------------------------------------------------
// Geometrie (GeoJSON Polygon/MultiPolygon in Länge/Breite)

const polygonsOf = (geometry) =>
  geometry.type === "Polygon" ? [geometry.coordinates] : geometry.coordinates;

export function bboxOf(geometry) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const poly of polygonsOf(geometry)) {
    for (const [x, y] of poly[0]) {
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
  }
  return [x0, y0, x1, y1];
}

/** Rechteck [x0, y0, x1, y1] als GeoJSON-Polygon (Kartenausschnitt). */
export function bboxPolygon([x0, y0, x1, y1]) {
  return { type: "Polygon", coordinates: [[[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]]] };
}

function inRing(x, y, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** Punkt in Polygon/MultiPolygon (Löcher werden abgezogen). */
export function pointInGeometry(x, y, geometry) {
  return polygonsOf(geometry).some(
    ([outer, ...holes]) => inRing(x, y, outer) && !holes.some((h) => inRing(x, y, h)),
  );
}

// ---------------------------------------------------------------------------------------
// Planen, Lesen, Filtern

/** Obergrenze aus den Footer-Statistiken: welche Row Groups berührt das Rechteck? */
export function estimate(ds, [x0, y0, x1, y1]) {
  let rows = 0, bytes = 0, groups = 0;
  for (const rg of ds.metadata.row_groups) {
    const st = Object.fromEntries(rg.columns.map((c) => [c.meta_data.path_in_schema[0], c.meta_data]));
    const lon = st.XGCSWGS84.statistics;
    const lat = st.YGCSWGS84.statistics;
    if (lon.max_value < x0 || lon.min_value > x1 || lat.max_value < y0 || lat.min_value > y1) continue;
    groups += 1;
    rows += Number(rg.num_rows);
    for (const name of ds.columns) bytes += Number(st[name].total_compressed_size);
  }
  return { groups, rows, bytes };
}

/** Alle Unfälle im Gebiet: Rechteck-Filter in hyparquet, dann genau ins Polygon schneiden. */
export async function readArea(ds, geometry) {
  const [x0, y0, x1, y1] = bboxOf(geometry);
  const rows = await parquetReadObjects({
    file: ds.file,
    metadata: ds.metadata,
    columns: ds.columns,
    compressors,
    // Operator-Form ist Pflicht: die Kurzform {spalte: wert} überspringt KEINE Row Groups.
    filter: { XGCSWGS84: { $gte: x0, $lte: x1 }, YGCSWGS84: { $gte: y0, $lte: y1 } },
  });
  return rows.filter((r) => pointInGeometry(r.XGCSWGS84, r.YGCSWGS84, geometry));
}

/**
 * Wie der MapLibre-Filter der Karte (accidentLayers.js): jede Dimension UND, die Beteiligung
 * ODER. `selection` = readSelection() der Karte; ohne Auswahl passt alles.
 */
export function matchesSelection(row, selection) {
  if (!selection) return true;
  for (const [col, values] of Object.entries(selection.byGroup)) {
    if (!values.includes(Number(row[col]))) return false;
  }
  return selection.beteiligungen.some((f) => Number(row[fileColumn(f)]) === 1);
}

// ---------------------------------------------------------------------------------------
// Hinweise und Ausgabe

/** Jahre zu Bereichen: [2016, 2017, 2019] → "2016–2017, 2019". */
export function yearRanges(years) {
  const out = [];
  for (const y of [...years].sort((a, b) => a - b)) {
    const last = out[out.length - 1];
    if (last && y === last[1] + 1) last[1] = y;
    else out.push([y, y]);
  }
  return out.map(([a, b]) => (a === b ? `${a}` : `${a}–${b}`)).join(", ");
}

/** Länder im Ergebnis, für die einzelne gewählte Jahre im Unfallatlas fehlen. */
export function coverageWarnings(rows, latest, years) {
  const lands = [...new Set(rows.map((r) => r.ULAND))].sort();
  const warnings = [];
  for (const land of lands) {
    const have = new Set(latest.abdeckung[land] ?? []);
    const missing = years.filter((y) => !have.has(y));
    if (missing.length) {
      warnings.push(`${latest.schluessel.ULAND[land] ?? land}: für ${yearRanges(missing)} enthält der Unfallatlas keine Daten.`);
    }
  }
  return warnings;
}

function labelled(row, latest) {
  const out = {};
  for (const [k, v] of Object.entries(row)) {
    if (k === "XGCSWGS84" || k === "YGCSWGS84") continue;
    out[k] = typeof v === "bigint" ? Number(v) : v;
    if (LABELLED.includes(k)) out[`${k}_text`] = v == null ? null : latest.schluessel[k]?.[String(v)] ?? null;
  }
  return out;
}

const round6 = (v) => Math.round(v * 1e6) / 1e6; // RFC 7946: 6 Nachkommastellen ≈ 10 cm

/**
 * Quellenvermerk für einen Auszug (dl-de/by-2-0: Bereitsteller, Lizenz mit Verweis, Verweis
 * auf den Datensatz, Hinweis auf Veränderung). Kurz genug zum Kopieren; die vollständige Liste
 * der Änderungen steht in latest.json bzw. im GeoJSON unter `veraenderung`.
 */
export function citation(latest) {
  const q = latest.quelle ?? {};
  const strip = (u) => String(u ?? "").replace(/^https?:\/\//, "").replace(/\/$/, "");
  const base = latest.url ? strip(new URL(".", latest.url).href) : "";
  return `Datenquelle: ${q.datensatz} (${strip(q.datensatz_url)}), ${q.bereitsteller}, `
    + `${q.lizenz_kurz} (${strip(q.lizenz_url)}). Daten verändert: aufbereitet von vizsim, `
    + `Auszug aus ${base}, Stand ${latest.version}.`;
}

/** GeoJSON (RFC 7946); Quellenvermerk und Auswahl im Fremdelement "metadata". */
export function toGeoJSON(rows, latest, context) {
  return JSON.stringify({
    type: "FeatureCollection",
    metadata: {
      quellenvermerk: citation(latest),
      veraenderung: latest.quelle?.veraenderung,
      lizenz: latest.quelle?.lizenz_url,
      datenstand: latest.version,
      datei: latest.datei,
      erstellt: context.created,
      gebiet: context.geometry,
      filter: context.filterText,
      anzahl: rows.length,
      hinweise: context.warnings,
    },
    features: rows.map((r) => ({
      type: "Feature",
      id: r.unfall_id,
      geometry: { type: "Point", coordinates: [round6(r.XGCSWGS84), round6(r.YGCSWGS84)] },
      properties: labelled(r, latest),
    })),
  });
}

const csvCell = (v) => {
  if (v === null || v === undefined) return "";
  const s = String(v);
  return /[;"\r\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
};
const deNumber = (v) => String(v).replace(".", ","); // Dezimalkomma für Excel (deutsch)

/** CSV für Excel (deutsch): Semikolon, Dezimalkomma, UTF-8 mit BOM, CRLF. Ohne `sep=`-Zeile:
 *  mit ihr ignoriert Excel das BOM, und die Umlaute brechen. */
export function toCSV(rows, latest) {
  const bom = "﻿";
  if (!rows.length) return bom;
  const keys = Object.keys(labelled(rows[0], latest));
  const lines = [[...keys, "XGCSWGS84", "YGCSWGS84"].join(";")];
  for (const r of rows) {
    const p = labelled(r, latest);
    lines.push([...keys.map((k) => csvCell(p[k])), deNumber(round6(r.XGCSWGS84)), deNumber(round6(r.YGCSWGS84))].join(";"));
  }
  return `${bom}${lines.join("\r\n")}\r\n`;
}

export function fileName(kind, latest, created) {
  return `unfaelle_${created.slice(0, 10)}_stand-${latest.version}.${kind}`;
}
