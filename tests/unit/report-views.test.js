// Analyse-Report: die Ansichten (js/report/render/views.js) mit und ohne Rechtsteil — browserlos
// am erfundenen Testort (tests/fixtures/report/scenario.mjs). Die Live-Seite zeigt bis zur
// juristischen Durchsicht nur den Datenteil (REPORT_LEGAL aus, js/config/env.js); die Web-Tests
// sehen darum nur diesen Modus. Hier steht, dass ohne Rechtsteil nichts davon durchsickert und
// dass er mit dem Schalter vollständig wiederkommt.
import { test } from "node:test";
import assert from "node:assert/strict";

import { rawDatasets, CENTER } from "../fixtures/report/scenario.mjs";
import { buildModel } from "../../js/report/model.js";
import { evaluate, facts } from "../../js/report/rules/synthesis.js";
import { titleOf } from "../../js/report/texts.js";
import { zustaendigkeit } from "../../js/report/addressee.js";
import { annex, printDoc, renderReport } from "../../js/report/render/views.js";
import { esc } from "../../js/report/render/common.js";

const YEARS = { from: 2023, to: 2025 };
const DATA_YEARS = [2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025];
const SCHOOL = { kind: "e", oid: "way/3001", lat: CENTER.lat + 0.0006, lng: CENTER.lng + 0.0015 };
const CROSSING = { kind: "k", lat: CENTER.lat, lng: CENTER.lng };

/** Ansichtsmodell wie js/report/main.js (computeRules), ohne DOM. */
function view({ sel = SCHOOL, r = 150, legal, raw = rawDatasets() } = {}) {
  const M = buildModel({ raw, sel, r, years: YEARS, dataYears: DATA_YEARS });
  const R = evaluate(M, { years: YEARS, land: "hh", answers: {} });
  const st = {
    years: YEARS, answers: {}, land: "", brief: "anregung", role: "eltern", tone: "sachlich", beob: "", name: "", kontakt: "",
    anschrift: "", initiative: "", hausnr: "", ortstermin: true, cc: {}, behoerde: "", behoerdeMail: "",
  };
  const place = { city: "Teststadt", land: "hh", landQuelle: "Lage" };
  const adr = zustaendigkeit(R.P.land, place, {});
  const title = titleOf(M, place);
  const V = { st, M, R, place, adr, title, meta: {}, dataYears: DATA_YEARS, link: "https://example.org/report.html?rv=1", mapLink: null, warnings: [], today: "07.11.2026", legal };
  V.E = { M, R, s: st, place, adr, title, today: V.today, meta: {} };
  return V;
}

// Was im Datenteil nicht vorkommen darf: Rechtsbezug, Bewertung als Kandidat, Behörde, Brief.
const LEGAL = [/§/, /StVO/, /Rechtsberatung/, /Nr\. 6/, /Weg [ABC]/, /Kandidat/, /zuständig/i, /Landesregeln/, /Regelwerk/,
  /Brief/, /Behörde/, /Maßnahme/, /Vorschlag Tempo 30/, /Rechtliche Einordnung/, /Gegenargument/];
const leaks = (html) => LEGAL.filter((re) => re.test(html)).map(String);
const sectionNos = (html) => [...html.matchAll(/<span class="no">(\d+)<\/span>/g)].map((m) => Number(m[1]));

test("ohne Rechtsteil: Abschnitte 1–5 + Datengrundlage als 6, kein Rechtsbezug (Einrichtung und Kreuzung)", () => {
  for (const sel of [SCHOOL, CROSSING]) {
    const V = view({ sel, r: sel === SCHOOL ? 150 : 25, legal: false });
    const html = renderReport(V);
    assert.deepEqual(sectionNos(html), [2, 3, 4, 5, 6], sel.kind);
    assert.match(html, /<span class="no">6<\/span><h2>Datengrundlage und Grenzen/);
    assert.deepEqual(leaks(html), [], `${sel.kind}: Rechtsteil sickert durch`);
    assert.match(html, /data-go="pdf">Druckansicht →/, "nächster Schritt ist der Druck, nicht der Brief");
    assert.doesNotMatch(html, /id="rep-land"/);
    for (const f of V.R.facts) assert.ok(html.includes(esc(f.t)), `Befund fehlt: ${f.t}`);
    assert.match(html, /Art<\/th>/, "Einrichtungen nach Art, nicht nach Nr. 6");
  }
});

test("ohne Rechtsteil: Druck ohne Brief, Anhang ohne Prüfergebnisse", () => {
  const V = view({ legal: false });
  const doc = printDoc(V);
  assert.deepEqual(leaks(doc), []);
  assert.doesNotMatch(doc, /class="letter"/);
  assert.match(doc, /<h2>6 · Datengrundlage und Grenzen<\/h2>/);
  assert.match(doc, /Datenbasierte Auswertung · kein Gutachten · keine amtliche Feststellung/);
  const json = annex(V);
  for (const k of ["regelwerk", "texte", "weg_a", "weg_b", "weg_c", "massnahmen"]) assert.ok(!(k in json), `Anhang enthält ${k}`);
  for (const k of ["unfaelle", "uko", "auswahl", "datenstaende"]) assert.ok(k in json, `Anhang ohne ${k}`);
});

test("mit Rechtsteil (VITE_REPORT_LEGAL=1): alles wieder da — Wege, Maßnahmen, Zuständigkeit, Brief", () => {
  const V = view({ legal: true });
  const html = renderReport(V);
  assert.deepEqual(sectionNos(html), [2, 3, 4, 5, 6, 7, 8, 9]);
  assert.ok(leaks(html).length >= 10, `Gegenprobe: der Detektor muss den Rechtsteil erkennen (${leaks(html)})`);
  for (const s of ["Rechtliche Einordnung", "Mögliche Maßnahmen", "Vermutlich zuständig", "Maßnahmen-Kandidaten", "Landesregeln und Zuständigkeit", "Brief schreiben →", "Kategorie nach Nr. 6", "Vorschlag Tempo 30"]) {
    assert.ok(html.includes(s), `fehlt: ${s}`);
  }
  const doc = printDoc(V);
  assert.match(doc, /class="letter"/);
  assert.match(doc, /<h2>9 · Datengrundlage und Grenzen<\/h2>/);
  assert.ok("weg_a" in annex(V) && "massnahmen" in annex(V));
});

test("„Auf einen Blick“ ohne Rechtsteil: Häufung neutral, sonst „keine besonderen Befunde“", () => {
  const atCrossing = view({ sel: CROSSING, r: 25, legal: false });
  const f = atCrossing.R.facts;
  assert.equal(f[0].st, "auffaellig", "Häufung als Befund, kein grünes ✓");
  assert.match(f[0].t, /^Auffällig: /);
  assert.deepEqual(f.flatMap((x) => leaks(`${x.t} ${x.n}`)), []);
  // Ohne Unfälle, Lärm und Häufung bleibt ein ehrlicher Leerbefund.
  const quiet = view({ legal: false, raw: rawDatasets({ accidents: null, noiseDen: null, noiseNight: null }) });
  assert.deepEqual(quiet.R.facts.map((x) => x.t), ["Nach den Daten keine besonderen Befunde."]);
  // Lärm ab L_Night 60 / L_DEN 70 als Messwert, ohne Bitte um Berechnung.
  const loud = facts({ accidents: { n: 0, fr: 0 }, noise: { den: { status: "ok", v: 70, txt: "70–74" }, night: { status: "ok", v: 60, txt: "60–64" } } }, { any: false });
  assert.deepEqual(loud.map((x) => x.t), ["Lärm laut Kartierung: L_DEN 70–74, L_Night 60–64 dB(A)."]);
});
