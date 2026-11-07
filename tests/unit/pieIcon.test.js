// Torten-Bilder der Cluster OHNE Browser: `npm run test:unit` (node --test).
//
// Der Bildname entsteht als MapLibre-Ausdruck im Style. Ausgewertet wird er hier mit MapLibres
// eigener Style-Spezifikation (@maplibre/maplibre-gl-style-spec, kommt mit maplibre-gl) — also
// genau so, wie die Karte ihn auswertet.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createExpression } from "@maplibre/maplibre-gl-style-spec";
import { PIE_SIZES, parsePieId, pieImageExpression } from "../../js/utils/generatePieIcon.js";

const compiled = createExpression(pieImageExpression(), "layers[0].layout.icon-image");
assert.equal(compiled.result, "success", JSON.stringify(compiled.value));
const nameOf = (k1, k2, k3) =>
  compiled.value.evaluate({ zoom: 8 }, { properties: { UKATEGORIE__1: k1, UKATEGORIE__2: k2, UKATEGORIE__3: k3 } });

test("Bildname = Größenstufe + Anteile in ganzen Prozent", () => {
  assert.equal(nameOf(0, 14, 114), "pie-64-0-11");      // 128 Unfälle: 0 % / 10,9 % (Rest 89 %)
  assert.equal(nameOf(2, 3, 5), "pie-32-20-30");        // 10 Unfälle → kleinste Stufe
  assert.equal(nameOf(0, 4, 9), "pie-48-0-31");         // 13 Unfälle → mittlere Stufe
  assert.equal(nameOf(0, 0, 1), "pie-32-0-0");
});

test("Ein vorhandener, winziger Anteil bleibt mindestens 1 %", () => {
  assert.equal(nameOf(1, 23, 161), "pie-64-1-12");      // 0,54 % Getötete → 1
  assert.equal(nameOf(1, 1, 9998), "pie-64-1-1");       // 0,01 % → trotzdem sichtbar
  assert.equal(nameOf(0, 0, 9999), "pie-64-0-0");       // 0 bleibt 0
});

test("Zahlen als Strings (MVT) ergeben denselben Namen", () => {
  assert.equal(nameOf("1", "23", "161"), nameOf(1, 23, 161));
});

test("Viele verschiedene Cluster teilen sich wenige Bilder", () => {
  // 50.000 Cluster mit zufälligen, aber realistischen Anteilen (wenig Getötete, ~15 % schwer)
  let seed = 42;
  const rand = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
  const names = new Set();
  for (let i = 0; i < 50_000; i++) {
    const total = 1 + Math.floor(rand() ** 3 * 20_000);
    const k1 = Math.floor(total * rand() * 0.02);
    const k2 = Math.floor((total - k1) * (0.05 + rand() * 0.25));
    names.add(nameOf(k1, k2, total - k1 - k2));
  }
  // Früher: ein Bild je Kombination der exakten Zahlen, also fast 50.000.
  assert.ok(names.size < 2_500, `${names.size} verschiedene Bilder`);
});

test("parsePieId liest genau die neuen Namen", () => {
  assert.deepEqual(parsePieId("pie-64-1-12"), { size: 64, shares: [1, 12, 87] });
  assert.deepEqual(parsePieId("pie-32-0-0"), { size: 32, shares: [0, 0, 100] });
  assert.deepEqual(parsePieId("pie-48-60-50"), { size: 48, shares: [60, 50, 0] }); // Rundung: Rest nie negativ
  for (const id of ["pie-1-23-161", "pie-50-1-2", "pie-64-101-0", "marker-64-1-2", "pie-64-1"]) {
    assert.equal(parsePieId(id), null, id);
  }
  for (const size of PIE_SIZES) assert.ok(parsePieId(`pie-${size}-0-0`));
});

// --- Torten folgen den Schwere-Häkchen ------------------------------------------------------

import { pieFilter, pieSizeExpression, pieSortKey } from "../../js/utils/generatePieIcon.js";

const evalAt = (expr, key, properties) => createExpression(expr, key).value.evaluate({ zoom: 8 }, { properties });

test("Ohne Auswahl sind die Ausdrücke exakt die bisherigen (Golden bleibt gleich)", () => {
  const T = ["+", ["get", "UKATEGORIE__1"], ["get", "UKATEGORIE__2"], ["get", "UKATEGORIE__3"]];
  assert.deepEqual(pieSizeExpression(), ["interpolate", ["linear"], T,
    1, 0.1, 4, 0.2, 10, 0.35, 50, 0.4, 100, 0.5, 500, 0.55, 1000, 0.6, 5000, 0.7, 10000, 0.75, 20000, 0.8, 40000, 0.9]);
  assert.deepEqual(pieSortKey(), ["-", ["/", ["get", "UKATEGORIE__3"], T]]);
  assert.equal(pieFilter(), null);
  assert.deepEqual(pieImageExpression([1, 2, 3]), pieImageExpression());
});

test("Nur Getötete + Schwerverletzte angehakt: Anteile, Größe und Filter beziehen sich darauf", () => {
  const sel = [1, 2];
  const c = { UKATEGORIE__1: 1, UKATEGORIE__2: 23, UKATEGORIE__3: 161 };
  const name = createExpression(pieImageExpression(sel), "layers[0].layout.icon-image").value.evaluate({ zoom: 8 }, { properties: c });
  assert.equal(name, "pie-48-4-96");                       // 24 Unfälle: 4 % / 96 %, Leichtverletzte 0
  assert.equal(evalAt(pieSizeExpression(sel), "layers[0].layout.icon-size", c),
    evalAt(pieSizeExpression(), "layers[0].layout.icon-size", { UKATEGORIE__1: 1, UKATEGORIE__2: 23, UKATEGORIE__3: 0 }));
  assert.equal(evalAt(pieFilter([1]), "layers[0].filter", c), true);
  assert.equal(evalAt(pieFilter([1]), "layers[0].filter", { ...c, UKATEGORIE__1: 0 }), false);
  assert.equal(evalAt(pieSortKey([1, 2]), "layers[0].layout.symbol-sort-key", c), -0);
});
