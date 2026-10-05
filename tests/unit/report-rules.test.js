// Datenmodell + Regelwerk + Briefbausteine des Reports am erfundenen Testort
// (tests/fixtures/report/scenario.mjs) — browserlos. Die Grenzfälle sind im Szenario
// angelegt: Schule 25 m an einer B-Straße, Kita 40 m (unklar), Tempo-30-Strecke 370 m vor
// dem Vorschlag, Ampel in der Lücke (Hamburg: kein Verbinden), Häufung an der Kreuzung.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { rawDatasets, CENTER } from "../fixtures/report/scenario.mjs";
import { buildModel, snapToJunction, facilityAt } from "../../js/report/model.js";
import { evaluate } from "../../js/report/rules/synthesis.js";
import { parseSpeed } from "../../js/report/roads.js";
import { classifyFacility, iscedLevels } from "../../js/report/facilities.js";
import { titleOf, buildLetter, briefTypes } from "../../js/report/texts.js";
import { zustaendigkeit } from "../../js/report/addressee.js";
import { landAt, placeFrom } from "../../js/report/place.js";

const YEARS = { from: 2023, to: 2025 };
const DATA_YEARS = [2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025];
const SCHOOL = { kind: "e", oid: "way/3001", lat: CENTER.lat + 0.0006, lng: CENTER.lng + 0.0015 };

const run = ({ sel = SCHOOL, r = 150, land = "bund", answers = {}, raw = rawDatasets(), years = YEARS } = {}) => {
  const M = buildModel({ raw, sel, r, years, dataYears: DATA_YEARS });
  return { M, R: evaluate(M, { years, land, answers }) };
};
const step = (R, id) => R.A.steps.find((s) => s.id === id);

test("Tempo aus OSM: Zahl, abgeleitet, Zone, Richtung, Bedingung, Ortslage", () => {
  assert.deepEqual([parseSpeed({ maxspeed: "50" }).v, parseSpeed({ maxspeed: "50" }).derived], [50, false]);
  const urban = parseSpeed({ maxspeed_type: "DE:urban" });
  assert.equal(urban.v, 50);
  assert.ok(urban.derived && urban.urban);
  assert.ok(parseSpeed({ maxspeed: "30", maxspeed_type: "DE:zone30" }).zone);
  assert.equal(parseSpeed({ maxspeed: "DE:zone:30" }).v, 30);
  assert.equal(parseSpeed({ maxspeed_forward: "50", maxspeed_backward: "30" }).v, 50);
  assert.deepEqual(parseSpeed({ maxspeed: "50", maxspeed_conditional: "30 @ (Mo-Fr 07:00-17:00)" }).cond, { v: 30, when: "Mo-Fr 07:00-17:00" });
  assert.equal(parseSpeed({ maxspeed: "70", maxspeed_type: "DE:rural" }).urban, false);
  assert.equal(parseSpeed({ maxspeed: "50" }).urban, null, "ohne Typ bleibt die Ortslage offen");
});

test("Einrichtungen nach Nr. 6: ISCED, Namen, Gesundheit", () => {
  assert.deepEqual(iscedLevels("1;2"), [1, 2]);
  assert.deepEqual(iscedLevels("2-3"), [2, 3]);
  assert.equal(classifyFacility("schools", { amenity: "school", isced_level: "1" }).status, "erfuellt");
  assert.equal(classifyFacility("schools", { amenity: "school", isced_level: "4" }).status, "nicht_erfuellt");
  assert.equal(classifyFacility("schools", { amenity: "school", name: "Gymnasium Musterstadt" }).status, "erfuellt");
  assert.equal(classifyFacility("schools", { amenity: "school", name: "Berufskolleg Mitte" }).status, "unklar", "Name allein: nur unklar");
  assert.equal(classifyFacility("schools", { amenity: "school", name: "Canisius-Kolleg" }).status, "unklar");
  assert.equal(classifyFacility("schools", { amenity: "school", name: "Lindenschule" }).status, "unklar");
  assert.equal(classifyFacility("schools", { amenity: "school", name: "Förderzentrum Nord" }).typ, "foerderschule");
  assert.equal(classifyFacility("health", { amenity: "hospital" }).typ, "krankenhaus");
  assert.equal(classifyFacility("health", { social_facility: "assisted_living" }).status, "unklar");
  assert.equal(classifyFacility("health", { amenity: "clinic" }).status, "unklar");
  assert.equal(classifyFacility("playgrounds", { leisure: "playground" }).status, "erfuellt");
});

test("Schule an der B-Straße: Weg A Kandidat mit Klärungsbedarf (Eingang offen)", () => {
  const { M, R } = run();
  assert.equal(M.selection.fac?.name, "Grundschule am Testpark");
  assert.equal(M.road.ref, "B 99", "Hauptstraße = die B-Straße, nicht die Nebenstraße");
  assert.equal(step(R, "A0").status, "erfuellt");
  assert.equal(step(R, "A1").status, "erfuellt");
  assert.equal(step(R, "A2").status, "erfuellt");
  assert.equal(step(R, "A3").status, "erfuellt");
  assert.ok(step(R, "A3").txt.includes("laut Name"));
  assert.equal(step(R, "A4").status, "erfuellt");
  assert.match(step(R, "A4").txt, /rund 25 m/);
  assert.equal(step(R, "A5").status, "unklar");
  assert.equal(R.A.verdict.key, "klaerung");
  assert.equal(R.A.seg.len, 300, "±150 m um die Mitte der Front");
  assert.ok(R.A.busOn, "Bushalt an der Strecke");
  assert.equal(step(R, "A9").status, "erfuellt");
  assert.equal(step(R, "A9").gap, 370, "Lücke bis zur Tempo-30-Strecke bei x = −420");
  const ids = R.measures.map((m) => m.id);
  assert.deepEqual(ids.slice(0, 2), ["t30", "luecke"]);
  assert.ok(!ids.includes("fgue"), "Zebra liegt im Vorschlag → kein eigener FGÜ-Vorschlag");
  assert.ok(ids.includes("uko") && ids.includes("ueberholen"));
});

test("Nutzerangabe löst „unklar“ auf, „nicht erfüllt“ aus den Daten bleibt", () => {
  const { R } = run({ answers: { A5: "ja" } });
  assert.equal(R.A.verdict.key, "kandidat");
  const kita = run({ sel: { kind: "e", oid: "node/3002", lat: CENTER.lat + 0.00036, lng: CENTER.lng - 0.00226 } });
  assert.equal(step(kita.R, "A4").status, "unklar", "Kita 40 m von der Straße");
  const kitaJa = run({ sel: { kind: "e", oid: "node/3002", lat: CENTER.lat + 0.00036, lng: CENTER.lng - 0.00226 }, answers: { A4: "ja", A5: "ja" } });
  assert.equal(step(kitaJa.R, "A4").status, "erfuellt");
  assert.ok(step(kitaJa.R, "A4").nutz);
  const beruf = run({ sel: { kind: "e", oid: "way/3003", lat: CENTER.lat - 0.0011, lng: CENTER.lng - 0.0081 }, answers: { A3: "ja" } });
  assert.equal(step(beruf.R, "A3").status, "nicht_erfuellt", "ISCED 4 lässt sich nicht wegklicken");
});

test("Hamburg: Ampel in der Lücke verhindert den Lückenschluss, Zeitfenster aus der HRVV", () => {
  const { R } = run({ land: "hh" });
  assert.equal(step(R, "A9").status, "nicht_erfuellt");
  assert.equal(R.A.zf, "werktags 6–22 Uhr");
  assert.ok(R.Cw, "Lärm kartiert");
  assert.equal(R.Cw.steps.find((s) => s.id === "C5").status, "erfuellt", "Klassen 65–69 / 55–59 erreichen 65/55");
});

test("M Uko an der Kreuzung (r = 25 m) und Sc9-Treffer", () => {
  const { M, R } = run({ sel: { kind: "k", lat: CENTER.lat, lng: CENTER.lng }, r: 25 });
  assert.equal(M.accidents.n, 6);
  const u3 = R.U.list.find((u) => u.id === "mu_3jk_up5");
  assert.equal(u3.status, "erfuellt");
  assert.equal(R.U.list.find((u) => u.id === "mu_1jk_gtyp5_untergrenze").status, "unklar", "1-JK nur Untergrenze");
  assert.equal(M.sc9.length, 1);
  assert.equal(R.A.fac?.name, "Grundschule am Testpark", "Kreuzung: Einrichtung an der Hauptstraße in der Nähe");
  const nw = run({ sel: { kind: "k", lat: CENTER.lat, lng: CENTER.lng }, r: 25, land: "nw" });
  assert.ok(nw.R.U.list.some((u) => u.id === "nw_3jk_fussrad_up5"));
  const short = run({ sel: { kind: "k", lat: CENTER.lat, lng: CENTER.lng }, r: 25, years: { from: 2024, to: 2025 } });
  assert.equal(short.R.U.list.find((u) => u.id === "mu_3jk_up5").status, "unklar", "Fenster < 3 Jahre");
});

test("fehlende Datensätze: kein Absturz, Abschnitte melden „nicht verfügbar“", () => {
  const { M, R } = run({ raw: rawDatasets({ noiseDen: null, noiseNight: null, obs: null, census: null, svz: null }) });
  assert.equal(R.Cw, null);
  assert.equal(M.noise.den.status, "missing");
  assert.equal(M.census, null);
  assert.equal(M.traffic.svz.status, "missing");
  assert.equal(R.A.verdict.key, "klaerung", "Weg A hängt nicht an Lärm/Zensus");
});

test("Einrasten am Knoten und Einrichtung am Klickpunkt", () => {
  const raw = rawDatasets();
  const snap = snapToJunction(raw, CENTER.lat + 0.00008, CENTER.lng + 0.0001);
  assert.ok(snap.snapped);
  assert.ok(Math.abs(snap.lat - CENTER.lat) < 2e-5 && Math.abs(snap.lng - CENTER.lng) < 3e-5, "rastet auf die Kreuzung ein");
  assert.ok(snap.roads.some((r) => r.includes("Teststraße")));
  const hit = facilityAt(raw, CENTER.lat + 0.0006, CENTER.lng + 0.0015);
  assert.equal(hit.oid, "way/3001");
  assert.equal(facilityAt(raw, CENTER.lat - 0.003, CENTER.lng + 0.004), null);
});

test("Brief: Anregung mit Rechtsgrundlage, Prüfbitte nur bei erfülltem Kriterium", () => {
  const { M, R } = run();
  const s = { years: YEARS, answers: {}, brief: "anregung", role: "eltern", tone: "sachlich", beob: "", name: "", kontakt: "", cc: {} };
  const place = { city: "Teststadt" };
  const E = { M, R, s, place, adr: zustaendigkeit("hh", place, {}), title: titleOf(M, place), today: "26.09.2026", meta: {} };
  const L = buildLetter(E);
  assert.match(L.subject, /Tempo 30 vor der Grundschule am Testpark/);
  assert.match(L.body, /§ 45 Abs\. 9 Satz 4 Nr\. 6 StVO/);
  assert.match(L.body, /\[Deine Beobachtung fehlt noch\.\]/);
  assert.match(L.body, /Buslinie/);
  assert.ok(briefTypes(E).find((t) => t.id === "uko").ok);
  const U = buildLetter({ ...E, s: { ...s, brief: "uko" } });
  assert.match(U.subject, /Unfallkommission/);
  assert.match(U.body, /rechnerisch erfüllt/);
  assert.equal(buildLetter({ ...E, s: { ...s, brief: "laerm" } }).type, "anregung", "Lärmantrag nur mit Angabe „wohne am Abschnitt“");
});

test("Zuständigkeit: Stadtstaaten, kreisfreie Stadt, Landkreis", () => {
  assert.match(zustaendigkeit("hh", {}).stelle, /Polizei Hamburg/);
  assert.match(zustaendigkeit("be", {}, { major: true }).stelle, /Senatsverwaltung/);
  assert.match(zustaendigkeit("be", { district: "Pankow" }, { major: false }).stelle, /Bezirks Pankow/);
  assert.match(zustaendigkeit("nw", { city: "Köln", kreisfrei: true }).stelle, /^Stadt Köln/);
  assert.match(zustaendigkeit("by", { city: "Buchloe", county: "Landkreis Ostallgäu", kreisfrei: false }).stelle, /Landratsamt Landkreis Ostallgäu/);
  assert.equal(zustaendigkeit("st", { county: "Landkreis Harz" }).sicher, "offen");
  assert.match(zustaendigkeit(null, {}).basis, /nicht bekannt/);
});

test("Land aus der Lage (Natural Earth) und aus Photon", () => {
  const data = JSON.parse(readFileSync(new URL("../../public/report/laender.json", import.meta.url), "utf8"));
  const cities = [
    [10.0, 53.55, "hh"], [13.405, 52.52, "be"], [8.8, 53.08, "hb"], [11.575, 48.137, "by"], [9.18, 48.78, "bw"],
    [6.96, 50.94, "nw"], [13.74, 51.05, "sn"], [11.63, 52.13, "st"], [11.03, 50.98, "th"], [10.14, 54.32, "sh"],
    [11.41, 53.63, "mv"], [9.73, 52.37, "ni"], [8.27, 50.0, "rp"], [7.0, 49.23, "sl"], [8.24, 50.08, "he"], [13.06, 52.39, "bb"],
  ];
  for (const [lng, lat, want] of cities) assert.equal(landAt(data, lng, lat), want, `${lng},${lat}`);
  assert.equal(landAt(data, 2.35, 48.85), null, "Paris");
  const p = placeFrom({ landGeo: "nw", photon: { state: "Nordrhein-Westfalen", city: "Köln" } });
  assert.equal(p.kreisfrei, true);
  const q = placeFrom({ landGeo: "ni", photon: { state: "Niedersachsen", city: "Buchholz in der Nordheide", county: "Landkreis Harburg" } });
  assert.deepEqual([q.land, q.kreisfrei, q.county], ["ni", false, "Landkreis Harburg"]);
  assert.match(placeFrom({ landGeo: "by" }).landQuelle, /Lage/);
});

test("Grenzfälle Weg A: bestehendes zeitweises Tempo 30, angrenzende Tempo-30-Strecke, Relation als node/…", async () => {
  const S = await import("../fixtures/report/scenario.mjs");
  const { localProjection } = await import("../../js/report/geometry.js");
  const P = localProjection(S.CENTER.lat, S.CENTER.lng);
  const ln = (pts, props) => ({ type: "LineString", coordinates: pts.map((p) => P.lngLat(p)), properties: props });
  const main = { highway: "secondary", name: "Teststraße", ref: "B 99", maxspeed_type: "DE:urban" };

  // Zeitweise Tempo 30 vor der Schule
  const cond = S.rawDatasets({ roads: [
    ln([[-900, 0], [-420, 0]], { ...main, maxspeed: "30", osm_id: "1001" }),
    ln([[-420, 0], [0, 0]], { ...main, maxspeed: "50", osm_id: "1002" }),
    ln([[0, 0], [400, 0]], { ...main, maxspeed: "50", maxspeed_conditional: "30 @ (Mo-Fr 07:00-17:00)", osm_id: "1003" }),
  ] });
  const c = run({ raw: cond });
  assert.equal(c.R.A.verdict.key, "zeitweise");
  assert.ok(!c.R.A.candidate);
  assert.ok(c.R.measures.some((m) => m.id === "t30zeit"));

  // Tempo 30 beginnt 60 m östlich der Schule → Vorschlag endet dort: Verlängerung, kein Lückenschluss
  const adj = S.rawDatasets({ roads: [
    ln([[-900, 0], [0, 0]], { ...main, maxspeed: "50", osm_id: "1002" }),
    ln([[0, 0], [160, 0]], { ...main, maxspeed: "50", osm_id: "1003" }),
    ln([[160, 0], [900, 0]], { ...main, maxspeed: "30", osm_id: "1004" }),
  ] });
  const a = run({ raw: adj });
  const a9 = a.R.A.steps.find((s) => s.id === "A9");
  assert.equal(a9.status, "hinweis");
  assert.match(a9.txt, /Verlängerung/);
  assert.ok(!a.R.measures.some((m) => m.id === "luecke"));

  // Sc2/6/8-Link mit node/<Relations-ID> findet die Fläche relation/<ID>
  const rel = S.rawDatasets({ schools: [{ ...S.schools[0], properties: { name: "Grundschule am Testpark", amenity: "school", osm_id: "777" } }] });
  const r = run({ raw: rel, sel: { kind: "e", oid: "node/777", lat: S.CENTER.lat + 0.0006, lng: S.CENTER.lng + 0.0015 } });
  assert.equal(r.M.selection.fac?.oid, "relation/777");
  const gone = run({ sel: { kind: "e", oid: "way/999999", lat: S.CENTER.lat + 0.0006, lng: S.CENTER.lng + 0.0015 } });
  assert.equal(gone.R.A.verdict.key, "fehlt");
});

test("Auswahl per Klick: die kleinste Fläche gewinnt, Bayerns Kreisstraßen zählen", async () => {
  const S = await import("../fixtures/report/scenario.mjs");
  const { localProjection } = await import("../../js/report/geometry.js");
  const { refClass } = await import("../../js/report/roads.js");
  const P = localProjection(S.CENTER.lat, S.CENTER.lng);
  const rect = (x0, y0, x1, y1) => [[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]].map((p) => P.lngLat(p));
  const raw = S.rawDatasets({ playgrounds: [{ type: "Polygon", coordinates: [rect(60, 40, 90, 70)], properties: { name: "Schulhof-Spielplatz", leisure: "playground", osm_way_id: "5555" } }] });
  const [lng, lat] = P.lngLat([75, 55]);
  assert.equal(facilityAt(raw, lat, lng).oid, "way/5555", "Spielplatz auf dem Schulgelände");
  assert.equal(refClass("FS 12"), "K");
  assert.equal(refClass("St 2345"), "St");
  assert.equal(refClass("A 9"), null);
});
