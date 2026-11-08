// Tagesverlauf-SVG des uspeed-Popups OHNE Browser: `npm run test:unit` (node --test).
// Beispielwerte = echte Segmente aus pipeline/data/raw/uber/uber_speed.fgb.
import { test } from "node:test";
import assert from "node:assert/strict";
import { hourlySpeeds, profileStats, speedProfileSVG } from "../../js/ui/speedProfile.js";

const VOLL = [32.4, 33.3, 34.8, 32.1, 37.0, 38.0, 34.5, 36.6, 30.8, 32.4, 31.7, 33.0, 31.3, 30.7, 31.0, 32.1, 33.2, 33.8, 32.3, 33.5, 33.9, 33.9, 33.7, 32.1];
// Weg 51009821 (Gegenrichtung): 0 Uhr allein, 8–19 Uhr am Stück, nachts Lücken
const LUECKEN = [36.2, null, null, null, null, null, null, null, 31.9, 33.6, 32.3, 32.6, 29.0, 28.4, 28.0, 28.7, 33.0, 36.1, 30.5, 28.1, null, null, null, null];

const props = (speeds) => Object.fromEntries(speeds.flatMap((v, h) => (v == null ? [] : [[`speed_${h}`, String(v)]])));
const count = (svg, re) => (svg.match(re) || []).length;

test("hourlySpeeds: Strings aus den Tiles → Zahlen, fehlende Stunde → null", () => {
    assert.deepEqual(hourlySpeeds(props(LUECKEN)), LUECKEN);
    const odd = hourlySpeeds({ speed_0: "", speed_1: "abc", speed_2: 0, speed_3: null });
    assert.deepEqual(odd.slice(0, 4), [null, null, 0, null]);
    assert.equal(odd.length, 24);
});

test("profileStats: gemessene Stunden, langsamste und schnellste Stunde", () => {
    assert.deepEqual(profileStats(LUECKEN), { n: 13, min: { h: 14, v: 28.0 }, max: { h: 0, v: 36.2 } });
    assert.equal(profileStats(Array(24).fill(null)), null);
});

test("volle 24 Stunden: eine Linie durch alle Stunden, Regler-Stunde markiert", () => {
    const svg = speedProfileSVG(VOLL, 11);
    assert.equal(count(svg, /class="pop-speed-line"/g), 1);
    assert.equal(count(svg, /<circle class="pop-speed-pt"/g), 0);
    assert.equal(count(svg, /[ML][\d.]+,[\d.]+/g), 24, "ein Stützpunkt je Stunde");
    assert.equal(count(svg, /class="pop-speed-gap"/g), 0);
    assert.equal(count(svg, /class="pop-speed-sel"/g), 1);
    assert.equal(count(svg, /class="pop-speed-dot"/g), 1);
    assert.match(svg, /class="pop-speed-tick pop-speed-tick--sel"[^>]*>11</);
    assert.match(svg, /data-tip="11 Uhr: 33 km\/h"/);
    assert.doesNotMatch(svg, /NaN|undefined/);
});

test("Lücken: keine Linie über fehlende Stunden, Einzelstunde als Punkt, Lückenspalten grau", () => {
    const svg = speedProfileSVG(LUECKEN, 11);
    assert.equal(count(svg, /class="pop-speed-line"/g), 1, "nur 8–19 Uhr am Stück");
    assert.equal(count(svg, /<circle class="pop-speed-pt"/g), 1, "0 Uhr steht allein");
    assert.equal(count(svg, /class="pop-speed-gap"/g), 11);
    assert.match(svg, /data-tip="3 Uhr: keine Messung"/);
});

test("Regler auf einer Stunde ohne Messung: Lot ja, Punkt nein", () => {
    const svg = speedProfileSVG(LUECKEN, 3);
    assert.equal(count(svg, /class="pop-speed-sel"/g), 1);
    assert.equal(count(svg, /class="pop-speed-dot"/g), 0);
});

test("Achse: mindestens 0–60, schnelle Segmente auf volle 10 aufgerundet", () => {
    // Zonen-Grenze 50 liegt bei 0–60 auf y = 6 + 56·(1 − 50/60)
    assert.match(speedProfileSVG(VOLL, 0), /<text class="pop-speed-tick" x="252" y="18.33"[^>]*>50</);
    const fast = VOLL.map((v, h) => (h === 3 ? 104.2 : v)); // → 0–110
    assert.match(speedProfileSVG(fast, 0), new RegExp(`y="${Math.round((6 + 56 * (1 - 50 / 110) + 3) * 100) / 100}"[^>]*>50<`));
});

test("Stunde außerhalb 0–23 oder ohne Messwerte: kein Fehler", () => {
    assert.doesNotMatch(speedProfileSVG(VOLL, NaN), /pop-speed-sel|NaN/);
    assert.equal(speedProfileSVG(Array(24).fill(null), 5), "");
});
