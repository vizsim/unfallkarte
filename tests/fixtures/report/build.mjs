// build.mjs — die Test-Archive des erfundenen Orts (scenario.mjs) samt manifest.json schreiben,
// im selben Baum wie data/ auf B2 (accidents/, osm/, census/ …).
//
//   node tests/fixtures/report/build.mjs <zielordner>
//
// Genutzt von tests/web/report-fixture.spec.js (Ziel: test-results/, per Routing ausgeliefert).
// Lokal auch zum Ausprobieren: mit Ziel `data` liest `npm run dev` die Testdaten local-first —
// aber nur, wenn data/ nicht schon der Symlink auf pipeline/data ist.
import { writeFileSync, mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { ARCHIVES } from "./scenario.mjs";
import { writeFixtureArchive } from "./tiles.mjs";

export function buildFixtures(dir) {
  mkdirSync(dir, { recursive: true });
  const manifest = {};
  for (const a of ARCHIVES) {
    writeFixtureArchive(join(dir, a.file), { layer: a.layer, features: a.features, zoom: a.zoom, mlt: a.mlt });
    manifest[a.id] = { file: a.file, label: `Testdaten (${a.id})`, attribution: "Testdaten – erfundener Ort", vintage: a.id === "accidents_single" ? "2025" : "2026-09-25" };
  }
  writeFileSync(join(dir, "manifest.json"), JSON.stringify(manifest, null, 1));
  return manifest;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const dir = resolve(process.argv[2] ?? "test-results/report-fixtures");
  buildFixtures(dir);
  console.log(`Test-Archive geschrieben: ${dir}`);
}
