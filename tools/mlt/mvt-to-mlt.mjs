// mvt-to-mlt.mjs — PMTiles mit MVT-Kacheln (tippecanoe) in PMTiles mit MLT-Kacheln umwandeln.
//
//   node tools/mlt/mvt-to-mlt.mjs <eingabe.pmtiles> <ausgabe.pmtiles> [--no-verify]
//
// Warum ein Konverter statt eines anderen Tilers: tippecanoe bleibt (Puffer, Attribut-Diät,
// Ausdünnen wie gehabt), nur das Kachelformat ändert sich. Hintergrund und Zahlen:
// docs/MLT_EVALUATION.md. Aufgerufen von der Pipeline (`unfallkarte accidents mlt` bzw. als
// letzter Schritt von `accidents tiles`, pipeline/src/unfallkarte/tiles.py).
//
// - Kodieren mit @maplibre/mlt (dieselbe Bibliothek, deren Decoder MapLibre mitbringt; Version
//   in package.json exakt gepinnt). Ganzzahl-Spalten als int32 — NIE int64: das käme im Browser
//   als BigInt an, und daran scheitert jeder Filter der Karte.
// - Kacheln gzip -6, Verzeichnisse gzip, Metadaten (vector_layers …) vom Original übernommen —
//   tests/web/contract.spec.js prüft die Felder dagegen. Gleiche Kacheln nur einmal gespeichert.
// - Danach wird JEDE Kachel zurückgelesen und Feature für Feature mit dem Original verglichen
//   (Geometrie + alle Attribute). Geschrieben wird unter <ausgabe>.tmp und erst nach bestandener
//   Prüfung umbenannt — `unfallkarte deploy` lädt jede *.pmtiles nach B2.
import { createHash } from "node:crypto";
import { fstatSync, renameSync, statSync, unlinkSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { compareTile, mvtToMlt, readArchive, TILE_TYPE_MLT, TILE_TYPE_MVT, writeArchive } from "./lib.mjs";

const [input, output, ...flags] = process.argv.slice(2);
if (!input || !output) {
  console.error("Aufruf: node tools/mlt/mvt-to-mlt.mjs <eingabe.pmtiles> <ausgabe.pmtiles> [--no-verify]");
  process.exit(2);
}
const t0 = Date.now();
const src = readArchive(input);
if (src.header.tileType !== TILE_TYPE_MVT) throw new Error(`${input}: Kacheltyp ${src.header.tileType}, erwartet MVT`);

// Geclustert (nach tileId); gleiche Inhalte nur einmal (Hash), aufeinanderfolgende als Lauf.
const entries = [];
const chunks = [];
const byHash = new Map();
let dataLength = 0;
let rawIn = 0;
let rawOut = 0;
for (const e of src.entries) {
  const mvt = src.tile(e);
  const mlt = mvtToMlt(mvt);
  const gz = gzipSync(mlt, { level: 6 });
  rawIn += mvt.length * e.runLength;
  rawOut += mlt.length * e.runLength;
  const hash = createHash("sha256").update(gz).digest("hex");
  let offset = byHash.get(hash);
  if (offset === undefined) {
    offset = dataLength;
    byHash.set(hash, offset);
    chunks.push(gz);
    dataLength += gz.length;
  }
  const last = entries.at(-1);
  if (last && last.offset === offset && last.tileId + last.runLength === e.tileId) last.runLength += e.runLength;
  else entries.push({ tileId: e.tileId, offset, length: gz.length, runLength: e.runLength });
}

const h = src.header;
const tmpOutput = `${output}.tmp`;
writeArchive(tmpOutput, {
  entries,
  chunks,
  metadata: {
    ...src.metadata,
    // Nachvollziehbar, woher die Kacheln stammen (reiner Formatwechsel).
    mlt_conversion: { encoder: "@maplibre/mlt", from: src.metadata.generator ?? "MVT", tool: "tools/mlt/mvt-to-mlt.mjs" },
  },
  info: {
    tileType: TILE_TYPE_MLT,
    minZoom: h.minZoom, maxZoom: h.maxZoom, minLon: h.minLon, minLat: h.minLat, maxLon: h.maxLon, maxLat: h.maxLat,
    centerZoom: h.centerZoom, centerLon: h.centerLon, centerLat: h.centerLat,
  },
});
const mb = (n) => `${(n / 1e6).toFixed(1)} MB`;
console.log(`MLT geschrieben: ${entries.length} Einträge, ${chunks.length} Inhalte, `
  + `Datei ${mb(statSync(tmpOutput).size)} (vorher ${mb(fstatSync(src.fd).size)}), `
  + `roh ${mb(rawIn)} -> ${mb(rawOut)}, ${((Date.now() - t0) / 1000).toFixed(0)} s`);

const fail = (msg) => {
  console.error(msg);
  unlinkSync(tmpOutput);
  process.exit(1);
};

if (!flags.includes("--no-verify")) {
  // Zurücklesen durch den eigenen Leser (prüft Header + Verzeichnisse) und jede Kachel vergleichen.
  const t1 = Date.now();
  const back = readArchive(tmpOutput);
  if (back.header.tileType !== TILE_TYPE_MLT) fail(`Verify: Kacheltyp ${back.header.tileType} statt MLT`);
  // Läufe auf einzelne IDs aufklappen — die Ausgabe darf Läufe anders zusammenfassen als die Eingabe.
  const byId = (list) => {
    const m = new Map();
    for (const e of list) for (let i = 0; i < e.runLength; i++) m.set(e.tileId + i, e);
    return m;
  };
  const want = byId(src.entries);
  const got = byId(back.entries);
  if (want.size !== got.size || [...want.keys()].some((id) => !got.has(id))) {
    fail(`Verify: Kachel-IDs weichen ab (${got.size} statt ${want.size})`);
  }
  for (const e of src.entries) {
    const problem = compareTile(`Kachel ${e.tileId}`, src.tile(e), back.tile(got.get(e.tileId)));
    if (problem) fail(`Verify: ${problem}`);
  }
  back.close();
  console.log(`Verify: ${want.size} Kacheln identisch (Geometrie + Attribute, keine BigInts), ${((Date.now() - t1) / 1000).toFixed(0)} s`);
}
renameSync(tmpOutput, output);
console.log(`-> ${output}`);
