// tileReader.js — PMTiles-Kacheln im Auswahlbereich lesen und dekodieren (MVT und MLT).
//
// Warum direkt aus den Archiven statt `map.querySourceFeatures`: das hinge am Viewport und an
// den gerade geladenen Kacheln und lieferte Duplikate an Kachelkanten (Konzept § 8.2).
// Hier gilt:
// - Zoomstufe = maxZoom des Archivs (volle Auflösung, keine ausgedünnten Punkte).
// - Kachelkanten: tippecanoe legt einen Puffer um jede Kachel. Punkte zählen nur in der Kachel,
//   in der sie liegen (0 ≤ x, y < extent); Linien und Flächen werden auf die Kachel
//   zugeschnitten. So kommt jedes Objekt genau einmal vor — Stücke desselben Objekts führt
//   erst das Datenmodell über die OSM-ID wieder zusammen.
// - Die Unfall-Kacheln sind MLT (docs/MLT_EVALUATION.md). Der Decoder wird erst bei der ersten
//   MLT-Kachel geladen (eigener Chunk; in Node registriert tools/mlt/lib.mjs vorher den
//   Auflöser für die endungslosen Importe des Pakets).
// - Cache je Kachel (Promise): Radius- und Jahreswechsel lesen nichts neu. Die Karte lädt mit
//   `cache: "no-store"` (pmtilesProtocol.js), der Browser-Cache hilft hier also nicht.
import { PMTiles } from "pmtiles";
import { VectorTile, classifyRings } from "@mapbox/vector-tile";
import { PbfReader } from "pbf";
import { NoStoreFetchSource } from "../mapdata/pmtilesProtocol.js";
import { clipLineBox, clipRingBox, ringArea } from "./geometry.js";

export const TILE_TYPE = { MVT: 1, MLT: 6 };
const MAX_TILES_PER_READ = 36;

let mltDecoder = null;
const loadMlt = () => (mltDecoder ??= import("@maplibre/mlt").then((m) => m.decodeTile));

/** Kachelbereich (inklusiv) für eine Umrandung [west, süd, ost, nord] auf Zoom z. */
export function tileRange([w, s, e, n], z) {
  const scale = 2 ** z;
  const tx = (lng) => Math.min(scale - 1, Math.max(0, Math.floor(((lng + 180) / 360) * scale)));
  const ty = (lat) => {
    const r = (lat * Math.PI) / 180;
    const y = (1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2;
    return Math.min(scale - 1, Math.max(0, Math.floor(y * scale)));
  };
  return { x0: tx(w), x1: tx(e), y0: ty(n), y1: ty(s) };
}

/** Kachelkoordinate (Pixel innerhalb der Kachel) -> [lng, lat]. */
export function tileToLngLat(z, x, y, extent) {
  const scale = 2 ** z;
  return ([px, py]) => {
    const lng = ((x + px / extent) / scale) * 360 - 180;
    const yy = (y + py / extent) / scale;
    const lat = (Math.atan(Math.sinh(Math.PI * (1 - 2 * yy))) * 180) / Math.PI;
    return [lng, lat];
  };
}

const plain = (props) => (props ? { ...props } : {});
const xy = (p) => [p.x, p.y];

/**
 * Rohgeometrie einer Kachel (Punkte/Linien/Ringe in Kachelpixeln) auf die Kachel beschneiden
 * und nach WGS84 umrechnen. Liefert GeoJSON-artige Einzel-Features.
 */
export function clipAndProject(kind, parts, props, id, { z, x, y, extent }) {
  const toLL = tileToLngLat(z, x, y, extent);
  const box = [0, 0, extent, extent];
  const out = [];
  if (kind === "Point") {
    for (const p of parts.flat()) {
      if (p[0] >= 0 && p[1] >= 0 && p[0] < extent && p[1] < extent) out.push({ type: "Point", coordinates: toLL(p), properties: props, id });
    }
  } else if (kind === "LineString") {
    for (const line of parts) {
      for (const piece of clipLineBox(line, box)) out.push({ type: "LineString", coordinates: piece.map(toLL), properties: props, id });
    }
  } else if (kind === "Polygon") {
    for (const poly of parts) {
      // Außenring zuerst: fällt er weg, sind auch die Löcher bedeutungslos.
      const outer = clipRingBox(poly[0], box);
      if (outer.length < 3 || Math.abs(ringArea(outer)) <= 1e-6) continue;
      const holes = poly.slice(1).map((ring) => clipRingBox(ring, box)).filter((r) => r.length >= 3 && Math.abs(ringArea(r)) > 1e-6);
      const close = (r) => [...r, r[0]].map(toLL);
      out.push({ type: "Polygon", coordinates: [close(outer), ...holes.map(close)], properties: props, id });
    }
  }
  return out;
}

const MVT_KIND = { 1: "Point", 2: "LineString", 3: "Polygon" };

/** MVT-Kachel -> Map(Layername -> Features in WGS84). */
export function decodeMvtTile(bytes, tile, wanted) {
  const vt = new VectorTile(new PbfReader(bytes));
  const out = new Map();
  for (const name of wanted) {
    const layer = vt.layers[name];
    if (!layer) continue;
    const feats = [];
    for (let i = 0; i < layer.length; i++) {
      const f = layer.feature(i);
      const kind = MVT_KIND[f.type];
      if (!kind) continue;
      const geom = f.loadGeometry();
      const parts = kind === "Polygon" ? classifyRings(geom).map((poly) => poly.map((r) => r.map(xy))) : geom.map((l) => l.map(xy));
      feats.push(...clipAndProject(kind, parts, plain(f.properties), f.id, { ...tile, extent: layer.extent }));
    }
    out.set(name, feats);
  }
  return out;
}

// MLT: GEOMETRY_TYPE (maplibre-tile-spec) -> Grundform. Multi-Formen zerfallen in Einzelteile.
const MLT_KIND = { 0: "Point", 1: "LineString", 2: "Polygon", 3: "Point", 4: "LineString", 5: "Polygon" };

/** MLT-Kachel -> Map(Layername -> Features in WGS84). */
export async function decodeMltTile(bytes, tile, wanted) {
  const decodeTile = await loadMlt();
  const out = new Map();
  for (const table of decodeTile(new Uint8Array(bytes))) {
    if (!wanted.includes(table.name)) continue;
    const feats = [];
    const extent = table.extent || 4096;
    for (const f of table.getFeatures()) {
      const kind = MLT_KIND[f.geometry?.type];
      if (!kind) continue;
      const rings = f.geometry.coordinates.map((r) => r.map(xy));
      let parts = rings;
      if (kind === "Polygon") {
        // Ringe wie bei MVT nach Umlaufsinn in Polygone gruppieren.
        parts = classifyRings(f.geometry.coordinates).map((poly) => poly.map((r) => r.map(xy)));
      }
      const props = {};
      for (const [k, v] of Object.entries(f.properties ?? {})) props[k] = typeof v === "bigint" ? Number(v) : v;
      feats.push(...clipAndProject(kind, parts, props, f.id != null ? Number(f.id) : undefined, { ...tile, extent }));
    }
    out.set(table.name, feats);
  }
  return out;
}

/**
 * @param {{ open?: (url: string) => PMTiles }} [opts]  `open` austauschbar (Tests lesen Dateien).
 */
export function createTileReader({ open = (url) => new PMTiles(new NoStoreFetchSource(url)) } = {}) {
  const archives = new Map();
  const tiles = new Map();
  const archive = (url) => {
    if (!archives.has(url)) archives.set(url, open(url));
    return archives.get(url);
  };

  const header = (url) => archive(url).getHeader();

  function decodedTile(url, h, z, x, y, layers) {
    const key = `${url}|${z}/${x}/${y}|${layers.join(",")}`;
    if (!tiles.has(key)) {
      const p = archive(url).getZxy(z, x, y).then((res) => {
        if (!res?.data) return new Map();
        const tile = { z, x, y };
        if (h.tileType === TILE_TYPE.MLT) return decodeMltTile(res.data, tile, layers);
        if (h.tileType === TILE_TYPE.MVT) return decodeMvtTile(new Uint8Array(res.data), tile, layers);
        throw new Error(`Kacheltyp ${h.tileType} wird nicht unterstützt`);
      });
      // Fehlgeschlagene Kacheln nicht festhalten: ein zweiter Versuch darf neu laden.
      p.catch(() => tiles.delete(key));
      tiles.set(key, p);
    }
    return tiles.get(key);
  }

  /**
   * Alle Features der Layer in den Kacheln, die die Umrandung [w, s, e, n] berühren.
   * Filtert NICHT auf die Umrandung selbst — das macht das Datenmodell mit Metrik.
   * @returns {Promise<{ zoom: number, tiles: number, layers: Record<string, object[]> }>}
   */
  async function read(url, layers, bbox) {
    try {
      return await readTiles(url, layers, bbox);
    } catch (err) {
      // pmtiles hält Kopf/Verzeichnisse im Cache — auch fehlgeschlagene. Frisches Archiv-Objekt,
      // damit ein späterer Versuch (neue Auswahl, anderer Radius) wirklich neu lädt.
      archives.delete(url);
      throw err;
    }
  }

  async function readTiles(url, layers, bbox) {
    const h = await header(url);
    const z = h.maxZoom;
    const { x0, x1, y0, y1 } = tileRange(bbox, z);
    const count = (x1 - x0 + 1) * (y1 - y0 + 1);
    if (count > MAX_TILES_PER_READ) throw new Error(`Auswahl zu groß: ${count} Kacheln auf z${z}`);
    const jobs = [];
    for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) jobs.push(decodedTile(url, h, z, x, y, layers));
    const decoded = await Promise.all(jobs);
    return {
      zoom: z,
      tiles: count,
      layers: Object.fromEntries(layers.map((name) => [name, decoded.flatMap((m) => m.get(name) ?? [])])),
    };
  }

  return { header, read, metadata: (url) => archive(url).getMetadata() };
}
