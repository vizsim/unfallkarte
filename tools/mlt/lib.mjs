// lib.mjs — gemeinsame Teile der MLT-Werkzeuge (mvt-to-mlt.mjs, compare.mjs):
// PMTiles v3 lesen/schreiben, MVT dekodieren, MLT kodieren/dekodieren.
// Hintergrund: docs/MLT_EVALUATION.md.
import { openSync, readSync, writeSync, closeSync } from "node:fs";
import { registerHooks } from "node:module";
import { gunzipSync, gzipSync } from "node:zlib";

// @maplibre/mlt liefert ESM mit endungslosen relativen Imports ("./mltDecoder") und läuft in Node
// sonst nur gebündelt. Statt eines Bundlers: fehlende Endung beim Auflösen ergänzen.
registerHooks({
  resolve(specifier, context, nextResolve) {
    try {
      return nextResolve(specifier, context);
    } catch (err) {
      if (err?.code !== "ERR_MODULE_NOT_FOUND" || !specifier.startsWith(".")) throw err;
      for (const suffix of [".js", "/index.js"]) {
        try { return nextResolve(specifier + suffix, context); } catch { /* nächster Versuch */ }
      }
      throw err;
    }
  },
});
export const { encodeTile, decodeTile } = await import("@maplibre/mlt");
const { VectorTile } = await import("@mapbox/vector-tile");
const { PbfReader } = await import("pbf");
const { bytesToHeader, readVarint, Compression } = await import("pmtiles");   // nur Lesen

export const HEADER_LEN = 127;
export const TILE_TYPE_MVT = 1;   // PMTiles-v3-Spezifikation
export const TILE_TYPE_MLT = 6;
const ROOT_MAX = 16384 - HEADER_LEN;   // Header + Wurzelverzeichnis passen in die ersten 16 KiB

// ---------------------------------------------------------------- PMTiles lesen
function readAt(fd, offset, length) {
  const buf = Buffer.alloc(length);
  readSync(fd, buf, 0, length, offset);
  return buf;
}

const inflate = (buf, compression) => (compression === Compression.Gzip ? gunzipSync(buf) : buf);

function deserializeDirectory(bytes) {
  const p = { buf: new Uint8Array(bytes), pos: 0 };
  const n = readVarint(p);
  const entries = [];
  let tileId = 0;
  for (let i = 0; i < n; i++) entries.push({ tileId: (tileId += readVarint(p)) });
  for (const e of entries) e.runLength = readVarint(p);
  for (const e of entries) e.length = readVarint(p);
  entries.forEach((e, i) => {
    const v = readVarint(p);
    e.offset = v === 0 && i > 0 ? entries[i - 1].offset + entries[i - 1].length : v - 1;
  });
  return entries;
}

/**
 * Archiv öffnen: Header, Metadaten, ALLE Kachel-Einträge (nach tileId, Blattverzeichnisse
 * aufgelöst) und `tile(e)` = dekomprimierte Kachel, `stored(e)` = Bytes wie gespeichert.
 */
export function readArchive(path) {
  const fd = openSync(path, "r");
  const hbuf = readAt(fd, 0, HEADER_LEN);
  const header = bytesToHeader(hbuf.buffer.slice(hbuf.byteOffset, hbuf.byteOffset + HEADER_LEN));
  if (header.specVersion !== 3) throw new Error(`${path}: PMTiles v${header.specVersion}, erwartet v3`);
  const dir = (offset, length) => deserializeDirectory(inflate(readAt(fd, offset, length), header.internalCompression));
  const entries = [];
  const walk = (list) => {
    for (const e of list) {
      if (e.runLength === 0) walk(dir(header.leafDirectoryOffset + e.offset, e.length));
      else entries.push(e);
    }
  };
  walk(dir(header.rootDirectoryOffset, header.rootDirectoryLength));
  const metadata = JSON.parse(
    inflate(readAt(fd, header.jsonMetadataOffset, header.jsonMetadataLength), header.internalCompression).toString("utf8"),
  );
  const stored = (e) => readAt(fd, header.tileDataOffset + e.offset, e.length);
  const tile = (e) => inflate(stored(e), header.tileCompression);
  return { fd, header, metadata, entries, stored, tile, close: () => closeSync(fd) };
}

// ---------------------------------------------------------------- PMTiles schreiben
function writeVarint(out, value) {
  let v = value;
  while (v >= 0x80) { out.push((v % 0x80) | 0x80); v = Math.floor(v / 0x80); }
  out.push(v);
}

function serializeDirectory(entries) {
  const out = [];
  writeVarint(out, entries.length);
  let last = 0;
  for (const e of entries) { writeVarint(out, e.tileId - last); last = e.tileId; }
  for (const e of entries) writeVarint(out, e.runLength);
  for (const e of entries) writeVarint(out, e.length);
  entries.forEach((e, i) => {
    const contiguous = i > 0 && e.offset === entries[i - 1].offset + entries[i - 1].length;
    writeVarint(out, contiguous ? 0 : e.offset + 1);
  });
  return gzipSync(Buffer.from(out));
}

/** Wurzel + Blattverzeichnisse, so dass Header + Wurzel in 16 KiB passen (wie go-/py-pmtiles). */
function buildDirectories(entries) {
  const single = serializeDirectory(entries);
  if (single.length <= ROOT_MAX) return { root: single, leaves: Buffer.alloc(0) };
  for (let leafSize = 4096; ; leafSize *= 2) {
    const rootEntries = [];
    const leaves = [];
    let offset = 0;
    for (let i = 0; i < entries.length; i += leafSize) {
      const leaf = serializeDirectory(entries.slice(i, i + leafSize));
      rootEntries.push({ tileId: entries[i].tileId, offset, length: leaf.length, runLength: 0 });
      leaves.push(leaf);
      offset += leaf.length;
    }
    const root = serializeDirectory(rootEntries);
    if (root.length <= ROOT_MAX) return { root, leaves: Buffer.concat(leaves) };
  }
}

function headerBytes(h) {
  const b = Buffer.alloc(HEADER_LEN);
  b.write("PMTiles", 0, "latin1");
  b.writeUInt8(3, 7);
  [h.rootOffset, h.rootLength, h.metadataOffset, h.metadataLength, h.leafOffset, h.leafLength,
    h.dataOffset, h.dataLength, h.addressedTiles, h.tileEntries, h.tileContents]
    .forEach((v, i) => b.writeBigUInt64LE(BigInt(v), 8 + i * 8));
  [1, Compression.Gzip, Compression.Gzip, h.tileType, h.minZoom, h.maxZoom]   // 1 = geclustert
    .forEach((v, i) => b.writeUInt8(v, 96 + i));
  [h.minLon, h.minLat, h.maxLon, h.maxLat].forEach((v, i) => b.writeInt32LE(Math.round(v * 1e7), 102 + i * 4));
  b.writeUInt8(h.centerZoom, 118);
  b.writeInt32LE(Math.round(h.centerLon * 1e7), 119);
  b.writeInt32LE(Math.round(h.centerLat * 1e7), 123);
  return b;
}

/**
 * Geclustertes Archiv schreiben. `entries` nach tileId sortiert ({tileId, offset, length,
 * runLength}, offset relativ zum Kachelbereich), `chunks` = gzip-Kacheln in Offset-Reihenfolge.
 * `info` = Zoom-/Bounds-/Center-Felder (z. B. vom Quell-Header) + tileType.
 */
export function writeArchive(path, { entries, chunks, metadata, info }) {
  const { root, leaves } = buildDirectories(entries);
  const meta = gzipSync(Buffer.from(JSON.stringify(metadata)));
  const leafOffset = HEADER_LEN + root.length + meta.length;
  const header = headerBytes({
    ...info,
    rootOffset: HEADER_LEN, rootLength: root.length,
    metadataOffset: HEADER_LEN + root.length, metadataLength: meta.length,
    leafOffset, leafLength: leaves.length,
    dataOffset: leafOffset + leaves.length, dataLength: chunks.reduce((n, c) => n + c.length, 0),
    addressedTiles: entries.reduce((n, e) => n + e.runLength, 0),
    tileEntries: entries.length, tileContents: chunks.length,
  });
  const fd = openSync(path, "w");
  for (const part of [header, root, meta, leaves, ...chunks]) writeSync(fd, part);
  closeSync(fd);
}

// ---------------------------------------------------------------- Kacheln
/** Reines MVT-Dekodieren wie im MapLibre-Worker (Geometrie + Attribute je Feature) — für Zeitvergleiche. */
export function decodeMvt(bytes) {
  const tile = new VectorTile(new PbfReader(bytes));
  let n = 0;
  for (const layer of Object.values(tile.layers)) {
    for (let i = 0; i < layer.length; i++) {
      const f = layer.feature(i);
      f.loadGeometry();
      n += f.properties ? 1 : 0;
    }
  }
  return n;
}

/** MVT -> Layer im Eingabeformat von encodeTile (nur Punkt-Layer, wie die Unfälle). */
export function mvtLayers(bytes) {
  const tile = new VectorTile(new PbfReader(bytes));
  return Object.values(tile.layers).map((layer) => {
    const features = [];
    for (let i = 0; i < layer.length; i++) {
      const f = layer.feature(i);
      if (f.type !== 1) throw new Error(`Layer "${layer.name}": nur Punkt-Geometrien unterstützt (Typ ${f.type})`);
      const points = f.loadGeometry().flat().map((p) => [p.x, p.y]);
      features.push({
        ...(f.id !== undefined ? { id: f.id } : {}),
        geometry: points.length === 1 ? { type: "Point", coordinates: points[0] } : { type: "MultiPoint", coordinates: points },
        properties: { ...f.properties },
      });
    }
    return { name: layer.name, extent: layer.extent, features };
  });
}

/** Spaltentyp je Attribut: int32 wo immer möglich — NIE int64 (käme im Browser als BigInt an). */
export function propertyTypes(layers) {
  const values = new Map();
  for (const l of layers) for (const f of l.features) {
    for (const [k, v] of Object.entries(f.properties)) {
      if (v === null || v === undefined) continue;
      if (!values.has(k)) values.set(k, []);
      values.get(k).push(v);
    }
  }
  const types = {};
  for (const [k, vs] of values) {
    if (vs.every((v) => Number.isInteger(v) && Math.abs(v) < 2 ** 31)) types[k] = "int32";
    else if (vs.every((v) => typeof v === "number")) types[k] = "double";
    else if (vs.every((v) => typeof v === "boolean")) types[k] = "boolean";
    else if (vs.every((v) => typeof v === "string")) types[k] = "string";
    else throw new Error(`Attribut "${k}": gemischte Typen (${[...new Set(vs.map((v) => typeof v))]})`);
  }
  return types;
}

/** MVT-Kachel -> MLT-Kachel (unkomprimiert). */
export const mvtToMlt = (mvtBytes) => {
  const layers = mvtLayers(mvtBytes);
  return encodeTile(layers, { propertyTypes: propertyTypes(layers) });
};

// MVT-Seite: Eingabe-Form ({type, coordinates}); MLT-Seite: Point[][] mit {x, y}.
const mvtPoints = (g) => (g.type === "Point" ? [g.coordinates] : g.coordinates).flat();
const mltPoints = (g) => g.coordinates.flat().flatMap((p) => [p.x, p.y]);

/** null = identisch; sonst die erste Abweichung als Text (Geometrie, Attribute, BigInts). */
export function compareTile(label, mvtBytes, mltBytes) {
  const want = mvtLayers(mvtBytes);
  const got = decodeTile(new Uint8Array(mltBytes));
  if (got.length !== want.length) return `${label}: ${got.length} statt ${want.length} Layer`;
  for (const w of want) {
    const table = got.find((t) => t.name === w.name);
    if (!table) return `${label}: Layer "${w.name}" fehlt`;
    const features = table.getFeatures();
    if (features.length !== w.features.length) return `${label}/${w.name}: ${features.length} statt ${w.features.length} Features`;
    for (let i = 0; i < features.length; i++) {
      const a = w.features[i];
      const b = features[i];
      const pa = mvtPoints(a.geometry);
      const pb = mltPoints(b.geometry);
      if (pa.length !== pb.length || pa.some((v, j) => v !== pb[j])) return `${label}/${w.name}#${i}: Geometrie weicht ab`;
      for (const k of new Set([...Object.keys(a.properties), ...Object.keys(b.properties ?? {})])) {
        const va = a.properties[k] ?? null;
        const vb = b.properties?.[k] ?? null;
        if (typeof vb === "bigint") return `${label}/${w.name}#${i}: "${k}" kommt als BigInt`;
        if (va !== vb) return `${label}/${w.name}#${i}: "${k}" = ${vb} statt ${va}`;
      }
    }
  }
  return null;
}
