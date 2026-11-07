// TileReader des Reports: MVT + MLT, Kachelkanten (Puffer-Duplikate), Zuschnitt — browserlos.
// Die Test-Archive entstehen hier im Temp-Ordner (tests/fixtures/report/tiles.mjs); MLT wird
// wie in der Pipeline aus MVT umgewandelt (tools/mlt/lib.mjs).
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, openSync, readSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PMTiles } from "pmtiles";

// Reihenfolge wichtig: tiles.mjs lädt tools/mlt/lib.mjs, das Node die endungslosen Importe von
// @maplibre/mlt beibringt — erst danach den Reader (dynamisch) laden.
const { writeFixtureArchive } = await import("../fixtures/report/tiles.mjs");
const { createTileReader, tileRange } = await import("../../js/report/tileReader.js");
const { localProjection, lineLength, polygonArea } = await import("../../js/report/geometry.js");

class NodeFileSource {
  constructor(path) { this.path = path; this.fd = openSync(path, "r"); }
  getKey() { return this.path; }
  async getBytes(offset, length) {
    const buf = Buffer.alloc(length);
    const n = readSync(this.fd, buf, 0, length, offset);
    return { data: buf.buffer.slice(buf.byteOffset, buf.byteOffset + n) };
  }
}

const dir = mkdtempSync(join(tmpdir(), "report-tiles-"));
test.after(() => rmSync(dir, { recursive: true, force: true }));
const reader = createTileReader({ open: (path) => new PMTiles(new NodeFileSource(path)) });

// Kachelgrenze z14 bei ~10.0195° O (x = 8647): Objekte links und rechts davon.
const Z = 14;
const EDGE_LNG = (8647 / 2 ** Z) * 360 - 180;
const LAT = 53.55;
const P = localProjection(LAT, EDGE_LNG);
const bbox = P.bbox(400);

test("Punkte im Kachelpuffer zählen genau einmal, Koordinaten auf < 1 m", async () => {
  const pts = [-3, -0.5, 0.5, 3, 40].map((dx, i) => ({ type: "Point", coordinates: P.lngLat([dx, i * 10]), properties: { n: String(i) } }));
  const path = join(dir, "points.pmtiles");
  writeFixtureArchive(path, { layer: "pts", features: pts, zoom: Z });
  const { zoom, tiles, layers } = await reader.read(path, ["pts"], bbox);
  assert.equal(zoom, Z);
  assert.ok(tiles >= 2, "Auswahl liegt über der Kachelgrenze");
  const got = layers.pts;
  assert.equal(got.length, pts.length, "keine Puffer-Duplikate");
  for (const f of got) {
    const want = pts[Number(f.properties.n)];
    const [x, y] = P.xy(f.coordinates);
    const [wx, wy] = P.xy(want.coordinates);
    assert.ok(Math.hypot(x - wx, y - wy) < 1, `Punkt ${f.properties.n}: ${Math.hypot(x - wx, y - wy)} m`);
  }
});

test("Linien und Flächen über die Kachelgrenze: zugeschnitten, Summe = Original", async () => {
  const line = [[-300, 20], [-100, 25], [150, 30], [310, 60]].map((p) => P.lngLat(p));
  const square = [[-60, -120], [60, -120], [60, -60], [-60, -60], [-60, -120]].map((p) => P.lngLat(p));
  const path = join(dir, "shapes.pmtiles");
  writeFixtureArchive(path, {
    layer: "roads", features: [{ type: "LineString", coordinates: line, properties: { name: "Teststraße" } }], zoom: Z,
    extraLayers: [{ layer: "areas", features: [{ type: "Polygon", coordinates: [square], properties: { k: "a" } }] }],
  });
  const { layers } = await reader.read(path, ["roads", "areas"], bbox);
  assert.ok(layers.roads.length >= 2, "Straße an der Kachelkante geteilt");
  const len = layers.roads.reduce((s, f) => s + lineLength(f.coordinates.map(P.xy)), 0);
  const want = lineLength(line.map(P.xy));
  assert.ok(Math.abs(len - want) < 2, `Länge ${len} statt ${want}`);
  assert.ok(layers.areas.length >= 2, "Fläche an der Kachelkante geteilt");
  const area = layers.areas.reduce((s, f) => s + polygonArea(f.coordinates.map((r) => r.map(P.xy))), 0);
  assert.ok(Math.abs(area - 7200) < 30, `Fläche ${area} statt 7200 m²`);
});

test("MLT-Unfälle: Punkte + Ganzzahl-Attribute (keine BigInts), Kantenfall einmal", async () => {
  const acc = [-1, 1, 25].map((dx, i) => ({ type: "Point", coordinates: P.lngLat([dx, 5 * i]), properties: { UKATEGORIE: 3 - i, UJAHR: 2023 + i, IstRad: i === 1 ? 1 : 0 } }));
  const path = join(dir, "acc_mlt.pmtiles");
  writeFixtureArchive(path, { layer: "accidents", features: acc, zoom: 13, mlt: true });
  const h = await reader.header(path);
  assert.equal(h.tileType, 6, "Archiv ist MLT");
  const { layers } = await reader.read(path, ["accidents"], bbox);
  assert.equal(layers.accidents.length, 3);
  const years = layers.accidents.map((f) => f.properties.UJAHR).sort();
  assert.deepEqual(years, [2023, 2024, 2025]);
  assert.ok(layers.accidents.every((f) => typeof f.properties.UKATEGORIE === "number"));
});

test("Kachelbereich: Umrandung -> Kacheln (inklusiv, Norden oben)", () => {
  const r = tileRange([EDGE_LNG - 0.001, LAT - 0.001, EDGE_LNG + 0.001, LAT + 0.001], Z);
  assert.equal(r.x0, 8646);
  assert.equal(r.x1, 8647);
  assert.ok(r.y0 <= r.y1);
});
