// Kreis-Cluster der Merkmals-Ansichten OHNE Browser: `npm run test:unit` (node --test).
// Die Ausdrücke werden mit MapLibres eigener Style-Spec ausgewertet — wie in der Karte.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createExpression } from "@maplibre/maplibre-gl-style-spec";
import {
  ALL_SELECTED_COLOR, BET_BITS, SHARE_COLORS, betMask, clusterModeStyle, selectedFields,
} from "../../js/map/clusterModes.js";

const evaluate = (expr, properties, key = "layers[0].paint.circle-color") => {
  const compiled = createExpression(expr, key);
  assert.equal(compiled.result, "success", JSON.stringify(compiled.value));
  return compiled.value.evaluate({ zoom: 8 }, { properties });
};

// 100 Unfälle: 60 leicht, 30 schwer, 10 tödlich; Typ 2 = 12, Typ 3 = 30, Typ 6 = 58
const CLUSTER = { UKATEGORIE__1: 10, UKATEGORIE__2: 30, UKATEGORIE__3: 60, UTYP1__2: 12, UTYP1__3: 30, UTYP1__6: 58 };

test("Größe und Farbe folgen den angehakten Werten", () => {
  const { filter, radius, color } = clusterModeStyle("UTYP1", [2], 7);
  assert.equal(evaluate(filter, CLUSTER, "layers[0].filter"), true);
  assert.equal(evaluate(color, CLUSTER), SHARE_COLORS[2]);           // 12 % → Klasse 10–20 %
  assert.equal(evaluate(clusterModeStyle("UTYP1", [2, 3], 7).color, CLUSTER), SHARE_COLORS[4]); // 42 %
  assert.equal(evaluate(clusterModeStyle("UTYP1", [6], 7).color, CLUSTER), SHARE_COLORS[5]);   // 58 %
  assert.ok(evaluate(radius, CLUSTER, "layers[0].paint.circle-radius") > 5.5); // 12 Unfälle
});

test("Cluster ohne angehakte Unfälle verschwinden; fehlende Felder zählen 0", () => {
  const { filter } = clusterModeStyle("UTYP1", [4], 7);
  assert.equal(evaluate(filter, CLUSTER, "layers[0].filter"), false);
  assert.equal(evaluate(clusterModeStyle("UTYP1", [2], 7).color, { UTYP1__2: "3", UKATEGORIE__3: "3" }), SHARE_COLORS[5]);
});

test("Alles angehakt → neutrales Grau statt überall 100 %", () => {
  assert.equal(evaluate(clusterModeStyle("UTYP1", [1, 2, 3, 4, 5, 6, 7], 7).color, CLUSTER), ALL_SELECTED_COLOR);
});

test("Klassengrenzen: genau auf der Grenze zählt die höhere Klasse", () => {
  const color = (n) => evaluate(clusterModeStyle("UJAHR", [2024], 9).color, { UJAHR__2024: n, UKATEGORIE__3: 100 });
  assert.deepEqual([1, 5, 9, 10, 20, 35, 50, 100].map(color),
    [SHARE_COLORS[0], SHARE_COLORS[1], SHARE_COLORS[1], SHARE_COLORS[2], SHARE_COLORS[3], SHARE_COLORS[4], SHARE_COLORS[5], SHARE_COLORS[5]]);
});

test("Beteiligung: „Rad ODER Fuß“ zählt jede Kombination genau einmal", () => {
  assert.deepEqual(BET_BITS.slice(0, 3), ["IstRad", "IstPKW", "IstFuss"]); // = tiles.yaml beteiligung_bits
  assert.equal(betMask(["IstRad", "IstFuss"]), 0b101);
  const fields = selectedFields("BETEILIGUNG", ["IstRad", "IstFuss"]);
  assert.ok(fields.includes("BET__1") && fields.includes("BET__4") && fields.includes("BET__5") && fields.includes("BET__3"));
  assert.ok(!fields.includes("BET__2"), "nur Pkw gehört nicht dazu");
  // 10 nur Rad, 5 Rad+Pkw, 3 Fuß+Pkw, 20 nur Pkw → Rad ODER Fuß = 18 von 38
  const cluster = { BET__1: 10, BET__3: 5, BET__6: 3, BET__2: 20, UKATEGORIE__3: 38 };
  const count = evaluate(["+", 0, clusterModeStyle("BETEILIGUNG", ["IstRad", "IstFuss"], 6).sortKey], cluster, "layers[0].layout.circle-sort-key");
  assert.equal(count, -18);
  assert.equal(evaluate(clusterModeStyle("BETEILIGUNG", ["IstRad", "IstFuss"], 6).color, cluster), SHARE_COLORS[4]); // 47 %
});

import { countSelected, radiusFor, RADIUS_STOPS, shareClass } from "../../js/map/clusterModes.js";

test("JS-Zählung = Ausdruck (Popup und Zähler zeigen dieselbe Zahl wie die Karte)", () => {
  assert.equal(countSelected(CLUSTER, "UTYP1", [2, 3]), 42);
  assert.equal(countSelected(CLUSTER, "UKATEGORIE", [1, 2]), 40);
  const bet = { BET__1: 10, BET__3: 5, BET__6: 3, BET__2: "20" };
  assert.equal(countSelected(bet, "BETEILIGUNG", ["IstRad", "IstFuss"]), 18);
  assert.equal(countSelected(bet, "BETEILIGUNG", ["IstPKW"]), 28);
});

test("Radius: Stützstellen exakt, dazwischen linear, außerhalb begrenzt", () => {
  for (const [n, r] of RADIUS_STOPS) assert.equal(radiusFor(n), r);
  assert.equal(radiusFor(55), (5.5 + 12) / 2);
  assert.equal(radiusFor(0), 2.5);
  assert.equal(radiusFor(1e6), 29);
  const expr = clusterModeStyle("UJAHR", [2024], 9).radius;
  for (const n of [1, 3, 55, 700, 25000]) {
    assert.equal(evaluate(expr, { UJAHR__2024: n }, "layers[0].paint.circle-radius"), radiusFor(n), `n = ${n}`);
  }
});

test("Farbklasse in JS = step-Ausdruck, auch genau auf den Grenzen", () => {
  const expr = clusterModeStyle("UJAHR", [2024], 9).color;
  for (let n = 1; n <= 200; n++) {   // 200 Unfälle im Cluster, davon n angehakt
    const color = evaluate(expr, { UJAHR__2024: n, UKATEGORIE__3: 200 });
    assert.equal(color, SHARE_COLORS[shareClass(n / 200)], `Anteil ${n / 200}`);
  }
});
