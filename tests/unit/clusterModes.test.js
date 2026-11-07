// Kreis-Cluster „Anteil einer Beteiligung" OHNE Browser: `npm run test:unit` (node --test).
// Die Ausdrücke werden mit MapLibres eigener Style-Spec ausgewertet — wie in der Karte.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createExpression } from "@maplibre/maplibre-gl-style-spec";
import {
  BET_BITS, FOCUS, PIE_FOCUS, RADIUS_STOPS, clusterFocusStyle, clusterHintHtml, countSelected, focusAverage,
  focusBreaks, focusClassLabels, focusFields, radiusFor, shareClass,
} from "../../js/map/clusterModes.js";

const evaluate = (expr, properties, key = "layers[0].paint.circle-color") => {
  const compiled = createExpression(expr, key);
  assert.equal(compiled.result, "success", JSON.stringify(compiled.value));
  return compiled.value.evaluate({ zoom: 8 }, { properties });
};

// 100 Unfälle; Rad allein 20, Rad + Pkw 10, Fuß + Pkw 5, nur Pkw 65
const CLUSTER = { UKATEGORIE__1: 2, UKATEGORIE__2: 18, UKATEGORIE__3: 80, BET__1: 20, BET__3: 10, BET__6: 5, BET__2: 65 };

test("Bitmasken: Vertrag mit tiles.yaml, Fahrrad zählt auch Fahrrad + Pkw", () => {
  assert.deepEqual(BET_BITS.slice(0, 3), ["IstRad", "IstPKW", "IstFuss"]); // = beteiligung_bits
  const rad = focusFields("IstRad");
  assert.ok(rad.includes("BET__1") && rad.includes("BET__3") && !rad.includes("BET__2"));
  assert.equal(rad.length, 32); // jede Maske mit Bit 1
  assert.equal(countSelected(CLUSTER, "IstRad"), 30);
  assert.equal(countSelected(CLUSTER, "IstFuss"), 5);
  assert.equal(countSelected(CLUSTER, PIE_FOCUS), 100);
  assert.equal(countSelected({ BET__1: "7" }, "IstRad"), 7); // Strings (MVT) zählen mit
});

test("Kreis: Filter, Größe und Farbe aus den Feldern der Beteiligung", () => {
  const style = clusterFocusStyle("IstRad");
  assert.equal(evaluate(style.filter, CLUSTER, "layers[0].filter"), true);
  assert.equal(evaluate(style.filter, { BET__2: 9, UKATEGORIE__3: 9 }, "layers[0].filter"), false); // kein Rad
  assert.equal(evaluate(style.color, CLUSTER), FOCUS.IstRad.colors[2]);  // 30 % → Stufe 25–38 %
  assert.equal(evaluate(style.radius, CLUSTER, "layers[0].paint.circle-radius"), radiusFor(30));
  assert.equal(evaluate(style.sortKey, CLUSTER, "layers[0].layout.circle-sort-key"), -30);
});

test("Farbstufe in JS = step-Ausdruck, auch genau auf den Grenzen — für jede Beteiligung", () => {
  for (const focus of Object.keys(FOCUS)) {
    const expr = clusterFocusStyle(focus).color;
    for (let n = 1; n <= 400; n++) {   // 400 Unfälle im Cluster, davon n mit dieser Beteiligung
      const bit = 1 << BET_BITS.indexOf(focus);
      const color = evaluate(expr, { [`BET__${bit}`]: n, UKATEGORIE__3: 400 });
      assert.equal(color, FOCUS[focus].colors[shareClass(focus, n / 400)], `${focus}: ${n}/400`);
    }
  }
});

test("Stufen hängen am Bundesschnitt: mittlere Stufe = um den Schnitt", () => {
  for (const [focus, { avg, colors }] of Object.entries(FOCUS)) {
    const b = focusBreaks(focus);
    assert.equal(b.length, colors.length - 1);
    assert.ok(b.every((x, i) => i === 0 || x > b[i - 1]), `${focus}: Grenzen steigen`);
    assert.equal(shareClass(focus, avg), 2, `${focus}: Schnitt liegt in der mittleren Stufe`);
  }
  assert.deepEqual(focusBreaks("IstRad"), [0.15, 0.25, 0.38, 0.49]);
  assert.deepEqual(focusClassLabels("IstFuss"), ["< 4,5 %", "4,5–7 %", "7–11 %", "11–14 %", "≥ 14 %"]);
  assert.equal(focusAverage("IstRad"), "31 %");
});

test("Radius: Stützstellen exakt, dazwischen linear, außerhalb begrenzt", () => {
  for (const [n, r] of RADIUS_STOPS) assert.equal(radiusFor(n), r);
  assert.equal(radiusFor(55), (5.5 + 12) / 2);
  assert.equal(radiusFor(0), 2.5);
  assert.equal(radiusFor(1e6), 29);
});

test("Legenden-Text je Ansicht", () => {
  assert.match(clusterHintHtml(PIE_FOCUS), /Farbanteile<\/b> = Schweregrad/);
  assert.match(clusterHintHtml("IstRad"), /Zahl der Unfälle mit Radbeteiligung/);
  assert.match(clusterHintHtml("IstRad"), /Alle Jahre, ohne Filter/);
});
