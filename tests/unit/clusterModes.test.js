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

// --- Trend ----------------------------------------------------------------------------------

import { TREND, TREND_FOCUS, circleCount, circleStyle, isCircleFocus, trendOf } from "../../js/map/clusterModes.js";

const years = (y22, y23, y24, y25, extra = {}) => ({ UJAHR__2022: y22, UJAHR__2023: y23, UJAHR__2024: y24, UJAHR__2025: y25, ...extra });

test("Trend in JS: 2024/25 gegen 2022/23, Poisson-z, Richtung, Schwelle", () => {
  const t = trendOf(years(50, 50, 35, 35, { UJAHR__2019: 999 }));   // 2019 zählt nicht mit
  assert.deepEqual([t.early, t.late, t.window], [100, 70, 170]);
  assert.equal(Math.round(t.change * 100), -30);
  assert.ok(Math.abs(t.z - -30 / Math.sqrt(170)) < 1e-9);
  assert.equal(t.cls, 0);                                           // rückläufig
  assert.equal(t.needed, 27);                                       // 2 · √170 aufgerundet
  assert.equal(t.certain, true);
  assert.equal(trendOf(years(50, 50, 52, 50)).cls, 1);              // +2 % → stabil
  assert.equal(trendOf(years(50, 50, 80, 80)).cls, 2);              // +60 % → steigend
  assert.equal(trendOf(years(5, 5, 6, 6)).certain, false);           // +20 %, aber 22 Unfälle: Zufall
  assert.equal(trendOf(years(2, 1, 3, 2)).small, true);              // < 10 Unfälle → grau
  assert.equal(trendOf(years(2, 1, 3, 2)).cls, 1);                 // grau wie „stabil"
  assert.equal(circleCount(years(1, 2, 3, 4), TREND_FOCUS), 10);
  assert.ok(isCircleFocus(TREND_FOCUS) && isCircleFocus("IstRad") && !isCircleFocus("UKATEGORIE"));
});

test("Trend-Ausdrücke = JS-Rechnung (Farbe, Deckkraft, Filter) über viele Fälle", () => {
  const style = circleStyle(TREND_FOCUS);
  let seed = 7;
  const rand = (n) => Math.floor(((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31) * n);
  for (let i = 0; i < 400; i++) {
    const p = years(rand(60), rand(60), rand(60), rand(60));
    const t = trendOf(p);
    if (t.window === 0) {
      assert.equal(evaluate(style.filter, p, "layers[0].filter"), false);
      continue;
    }
    assert.equal(evaluate(style.color, p), TREND.colors[t.cls], JSON.stringify(p));
    assert.equal(evaluate(style.opacity, p, "layers[0].paint.circle-opacity"),
      t.certain ? TREND.opacity.certain : TREND.opacity.uncertain, JSON.stringify(p));
  }
});
