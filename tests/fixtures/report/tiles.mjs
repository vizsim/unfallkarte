// tiles.mjs — Test-Kacheln bauen: MVT kodieren, in Kacheln zerlegen, PMTiles schreiben.
// Nur für Tests (tests/unit/report-tiles.test.js, tests/web/report-fixture.spec.js). Die
// Pipeline baut ihre Kacheln mit tippecanoe; hier reicht ein kleiner Encoder, der die Form
// nachstellt, auf die es dem Report ankommt: Puffer an den Kachelkanten (Punkte doppelt,
// Linien/Flächen überstehend), Attribute als Strings wie aus dem FGB, MLT für die Unfälle.
import { gzipSync } from "node:zlib";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { PbfWriter } from "pbf";
import { zxyToTileId } from "pmtiles";
import { mvtToMlt, writeArchive, TILE_TYPE_MLT, TILE_TYPE_MVT } from "../../../tools/mlt/lib.mjs";

export const EXTENT = 4096;
const BUFFER = 80; // tippecanoe-Standard: 5 von 256 px

const zigzag = (n) => (n << 1) ^ (n >> 31);
const command = (id, count) => (id & 0x7) | (count << 3);

function encodeGeometry(type, parts) {
  const out = [];
  let cx = 0;
  let cy = 0;
  const move = (pts, close) => {
    out.push(command(1, 1), zigzag(pts[0][0] - cx), zigzag(pts[0][1] - cy));
    [cx, cy] = pts[0];
    const rest = pts.slice(1);
    if (rest.length) {
      out.push(command(2, rest.length));
      for (const [x, y] of rest) { out.push(zigzag(x - cx), zigzag(y - cy)); cx = x; cy = y; }
    }
    if (close) out.push(command(7, 1));
  };
  if (type === 1) {
    out.push(command(1, parts.length));
    for (const [x, y] of parts) { out.push(zigzag(x - cx), zigzag(y - cy)); cx = x; cy = y; }
  } else if (type === 2) {
    for (const line of parts) move(line, false);
  } else {
    for (const poly of parts) poly.forEach((ring) => move(ring, true));
  }
  return out;
}

function writeValue(v, pbf) {
  if (typeof v === "string") pbf.writeStringField(1, v);
  else if (typeof v === "boolean") pbf.writeBooleanField(7, v);
  else if (Number.isInteger(v)) (v < 0 ? pbf.writeSVarintField(6, v) : pbf.writeVarintField(5, v));
  else pbf.writeDoubleField(3, v);
}

/**
 * @param {{ name: string, extent?: number, features: { id?: number, type: 1|2|3, parts: any, properties?: object }[] }[]} layers
 *   parts: Punkte [[x,y]…] · Linien [[[x,y]…]…] · Polygone [[[[x,y]…] Ringe]…] in Kachelpixeln
 */
export function encodeMvt(layers) {
  const pbf = new PbfWriter();
  for (const layer of layers) {
    const keys = [];
    const values = [];
    const keyIdx = new Map();
    const valIdx = new Map();
    const feats = layer.features.map((f) => {
      const tags = [];
      for (const [k, v] of Object.entries(f.properties ?? {})) {
        if (v == null) continue;
        if (!keyIdx.has(k)) { keyIdx.set(k, keys.length); keys.push(k); }
        const vk = `${typeof v}:${v}`;
        if (!valIdx.has(vk)) { valIdx.set(vk, values.length); values.push(v); }
        tags.push(keyIdx.get(k), valIdx.get(vk));
      }
      return { ...f, tags };
    });
    pbf.writeMessage(3, (l, w) => {
      w.writeVarintField(15, 2);
      w.writeStringField(1, l.name);
      for (const f of feats) {
        w.writeMessage(2, (ff, ww) => {
          if (ff.id != null) ww.writeVarintField(1, ff.id);
          ww.writePackedVarint(2, ff.tags);
          ww.writeVarintField(3, ff.type);
          ww.writePackedVarint(4, encodeGeometry(ff.type, ff.parts));
        }, f);
      }
      for (const k of keys) w.writeStringField(3, k);
      for (const v of values) w.writeMessage(4, writeValue, v);
      w.writeVarintField(5, l.extent ?? EXTENT);
    }, layer);
  }
  return pbf.finish();
}

// ------------------------------------------------------------ WGS84 -> Kachelpixel
export function lngLatToWorld([lng, lat], z) {
  const scale = 2 ** z;
  const r = (lat * Math.PI) / 180;
  return [((lng + 180) / 360) * scale, ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * scale];
}

const ringArea = (ring) => ring.reduce((s, p, i) => { const q = ring[(i + 1) % ring.length]; return s + (p[0] * q[1] - q[0] * p[1]); }, 0) / 2;

/** Außenring im Uhrzeigersinn (Bildschirmkoordinaten), Löcher gegenläufig — wie MVT 2.1. */
function orient(poly) {
  return poly.map((ring, i) => {
    const r = ring[0][0] === ring.at(-1)[0] && ring[0][1] === ring.at(-1)[1] ? ring.slice(0, -1) : ring;
    const cw = ringArea(r) > 0;
    return (i === 0) === cw ? r : [...r].reverse();
  });
}

/**
 * GeoJSON-artige Features (Point/LineString/Polygon in WGS84) auf Kacheln der Zoomstufe z
 * verteilen: jedes Feature in JEDE Kachel, die seine Umrandung plus Puffer berührt — mit
 * unbeschnittenen Koordinaten (Decoder müssen selbst beschneiden, wie bei tippecanoe).
 * @returns {Map<string, object[]>}  "z/x/y" -> MVT-Features
 */
export function splitToTiles(features, z) {
  const tiles = new Map();
  for (const f of features) {
    const world = f.type === "Point" ? [f.coordinates] : f.type === "LineString" ? f.coordinates : f.coordinates.flat();
    const w = world.map((p) => lngLatToWorld(p, z));
    const pad = BUFFER / EXTENT;
    const x0 = Math.floor(Math.min(...w.map((p) => p[0])) - pad);
    const x1 = Math.floor(Math.max(...w.map((p) => p[0])) + pad);
    const y0 = Math.floor(Math.min(...w.map((p) => p[1])) - pad);
    const y1 = Math.floor(Math.max(...w.map((p) => p[1])) + pad);
    for (let x = x0; x <= x1; x++) {
      for (let y = y0; y <= y1; y++) {
        const px = (p) => {
          const [wx, wy] = lngLatToWorld(p, z);
          return [Math.round((wx - x) * EXTENT), Math.round((wy - y) * EXTENT)];
        };
        let type;
        let parts;
        if (f.type === "Point") { type = 1; parts = [px(f.coordinates)]; }
        else if (f.type === "LineString") { type = 2; parts = [f.coordinates.map(px)]; }
        else { type = 3; parts = [orient(f.coordinates.map((ring) => ring.map(px)))]; }
        const key = `${z}/${x}/${y}`;
        if (!tiles.has(key)) tiles.set(key, []);
        tiles.get(key).push({ id: f.id, type, parts, properties: f.properties });
      }
    }
  }
  return tiles;
}

/** Wie tippecanoe es ins Archiv schreibt: `vector_layers` mit Feldern (für Vertragstests). */
function vectorLayersOf(layerName, features, z) {
  const fields = {};
  for (const f of features) for (const [k, v] of Object.entries(f.properties ?? {})) fields[k] = typeof v === "number" ? "Number" : "String";
  return [{ id: layerName, fields, minzoom: z, maxzoom: z }];
}

/**
 * Ein Archiv aus Features bauen (eine Zoomstufe = maxZoom, wie es der Report liest).
 * @param {string} path
 * @param {{ layer: string, features: object[], zoom: number, mlt?: boolean, extraLayers?: {layer: string, features: object[]}[] }} spec
 */
export function writeFixtureArchive(path, { layer, features, zoom, mlt = false, extraLayers = [] }) {
  const all = [{ layer, features }, ...extraLayers];
  const perLayer = all.map(({ layer: name, features: fs }) => ({ name, tiles: splitToTiles(fs, zoom) }));
  const keys = [...new Set(perLayer.flatMap((l) => [...l.tiles.keys()]))];
  const entries = [];
  const chunks = [];
  let offset = 0;
  const sorted = keys.map((k) => { const [z, x, y] = k.split("/").map(Number); return { k, id: zxyToTileId(z, x, y) }; }).sort((a, b) => a.id - b.id);
  let bounds = [180, 90, -180, -90];
  for (const { k, id } of sorted) {
    const layers = perLayer.filter((l) => l.tiles.has(k)).map((l) => ({ name: l.name, features: l.tiles.get(k) }));
    let bytes = encodeMvt(layers);
    if (mlt) bytes = mvtToMlt(Buffer.from(bytes));
    const gz = gzipSync(bytes);
    entries.push({ tileId: id, offset, length: gz.length, runLength: 1 });
    chunks.push(gz);
    offset += gz.length;
  }
  for (const { features: fs } of all) {
    for (const f of fs) {
      const pts = f.type === "Point" ? [f.coordinates] : f.type === "LineString" ? f.coordinates : f.coordinates.flat();
      for (const [lng, lat] of pts) bounds = [Math.min(bounds[0], lng), Math.min(bounds[1], lat), Math.max(bounds[2], lng), Math.max(bounds[3], lat)];
    }
  }
  mkdirSync(dirname(path), { recursive: true });
  writeArchive(path, {
    entries,
    chunks,
    metadata: { name: layer, vector_layers: all.flatMap(({ layer: name, features: fs }) => vectorLayersOf(name, fs, zoom)), generator: "tests/fixtures/report" },
    info: {
      tileType: mlt ? TILE_TYPE_MLT : TILE_TYPE_MVT, minZoom: zoom, maxZoom: zoom,
      minLon: bounds[0], minLat: bounds[1], maxLon: bounds[2], maxLat: bounds[3],
      centerZoom: zoom, centerLon: (bounds[0] + bounds[2]) / 2, centerLat: (bounds[1] + bounds[3]) / 2,
    },
  });
  return { tiles: entries.length };
}
