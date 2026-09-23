// compare.mjs — MVT- und MLT-Archiv DERSELBEN Kacheln vergleichen (docs/MLT_EVALUATION.md).
//
//   node tools/mlt/compare.mjs <mvt.pmtiles> <mlt.pmtiles>
//
// - Archivgröße gesamt und je Zoomstufe (wie gespeichert).
// - Viewport-Bytes: 3×3-Kachelblock um vier Orte bei z11/z12, beide Seiten einheitlich mit
//   gzip -6 nachkomprimiert — so zählt das Format, nicht die gzip-Stufe des Erzeugers.
//   Entscheidungsregel aus der Evaluation: weiter bei ≥ 30 % weniger in den Städten.
// - Dekodierzeit der Kachel um Berlin-Mitte z11 in Node (ohne gunzip): MVT vollständig
//   (Geometrie + Attribute je Feature) gegen MLT (decodeTile + getFeatures). Median aus 40 nach
//   10 Aufwärmläufen. Laptop-Node, kein Handy-Browser — ein Stellvertreter, keine Messung im Worker.
import { gzipSync } from "node:zlib";
import { decodeMvt, decodeTile, readArchive } from "./lib.mjs";

const { zxyToTileId, tileIdToZxy } = await import("pmtiles");

const [mvtPath, mltPath] = process.argv.slice(2);
if (!mvtPath || !mltPath) {
  console.error("Aufruf: node tools/mlt/compare.mjs <mvt.pmtiles> <mlt.pmtiles>");
  process.exit(2);
}
const A = readArchive(mvtPath);
const B = readArchive(mltPath);
const kb = (n) => `${(n / 1024).toFixed(0)} KB`;
const pct = (a, b) => `${b >= a ? "+" : "−"}${Math.abs((b / a - 1) * 100).toFixed(0)} %`;

// ---- Archiv und Zoomstufen (wie gespeichert)
const perZoom = (ar) => {
  const m = new Map();
  for (const e of ar.entries) {
    const [z] = tileIdToZxy(e.tileId);
    m.set(z, (m.get(z) ?? 0) + e.length * e.runLength);
  }
  return m;
};
const [za, zb] = [perZoom(A), perZoom(B)];
const total = (m) => [...m.values()].reduce((s, v) => s + v, 0);
console.log("| Zoom | MVT (gespeichert) | MLT (gespeichert) | Δ |\n|---|---|---|---|");
for (const z of [...za.keys()].sort((x, y) => x - y)) {
  console.log(`| z${z} | ${(za.get(z) / 1e6).toFixed(1)} MB | ${(zb.get(z) / 1e6).toFixed(1)} MB | ${pct(za.get(z), zb.get(z))} |`);
}
console.log(`| gesamt | ${(total(za) / 1e6).toFixed(1)} MB | ${(total(zb) / 1e6).toFixed(1)} MB | ${pct(total(za), total(zb))} |\n`);

// ---- Viewport 3×3, einheitlich gzip -6
const PLACES = { "Berlin-Mitte": [13.405, 52.52], "München": [11.575, 48.137], "Köln": [6.958, 50.938], "Görlitz": [14.987, 51.153] };
const tileXY = (lon, lat, z) => {
  const n = 2 ** z;
  const r = (lat * Math.PI) / 180;
  return [Math.floor(((lon + 180) / 360) * n), Math.floor(((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * n)];
};
const lookup = (ar) => {
  const m = new Map();
  for (const e of ar.entries) for (let i = 0; i < e.runLength; i++) m.set(e.tileId + i, e);
  return m;
};
const [la, lb] = [lookup(A), lookup(B)];
const gz6 = (ar, e) => gzipSync(ar.tile(e), { level: 6 }).length;
console.log("| Viewport 3×3 (gzip -6) | MVT | MLT | Δ |\n|---|---|---|---|");
for (const [name, [lon, lat]] of Object.entries(PLACES)) {
  for (const z of [11, 12]) {
    const [cx, cy] = tileXY(lon, lat, z);
    let a = 0;
    let b = 0;
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
      const id = zxyToTileId(z, cx + dx, cy + dy);
      if (la.has(id)) a += gz6(A, la.get(id));
      if (lb.has(id)) b += gz6(B, lb.get(id));
    }
    console.log(`| ${name} z${z} | ${kb(a)} | ${kb(b)} | **${pct(a, b)}** |`);
  }
}

// ---- Dekodierzeit Berlin-Mitte z11
const [bx, by] = tileXY(...PLACES["Berlin-Mitte"], 11);
const id = zxyToTileId(11, bx, by);
const mvtBytes = A.tile(la.get(id));
const mltBytes = new Uint8Array(B.tile(lb.get(id)));
const median = (f) => {
  for (let i = 0; i < 10; i++) f();
  const ts = [];
  for (let i = 0; i < 40; i++) {
    const t = performance.now();
    f();
    ts.push(performance.now() - t);
  }
  return ts.sort((x, y) => x - y)[20];
};
let n = 0;
const tMvt = median(() => { n = decodeMvt(mvtBytes); });
const tMlt = median(() => { decodeTile(mltBytes).forEach((t) => t.getFeatures()); });
console.log(`\nDekodieren Berlin-Mitte z11 (${n} Features, roh ${kb(mvtBytes.length)} MVT / ${kb(mltBytes.length)} MLT): `
  + `MVT ${tMvt.toFixed(0)} ms, MLT ${tMlt.toFixed(0)} ms (Median aus 40, Node)`);
A.close();
B.close();
