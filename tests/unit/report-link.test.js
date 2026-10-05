// Report-Link (Vertrag rv=1, Konzept § 3.2) — browserlos: `npm run test:unit`.
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  parseReportLink, formatReportLink, packYearRange, encodePolyline, decodePolyline, mapLinkFor, RADIUS, unpackYears,
} from "../../js/report/reportLink.js";
import { serialize, parse } from "../../js/utils/permalinkFormat.js";

const YEARS = [2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025];

test("Kreuzung: lesen, Voreinstellungen, schreiben (Rundreise)", () => {
  const L = parseReportLink("?rv=1&sel=k:53.56123,10.03456", { years: YEARS });
  assert.deepEqual(L.sel, { kind: "k", lat: 53.56123, lng: 10.03456 });
  assert.equal(L.r, RADIUS.k.def);
  assert.deepEqual(L.years, { from: 2023, to: 2025 }, "Voreinstellung: die letzten drei Datenjahre");
  assert.deepEqual(L.warnings, []);
  // Jahre stehen im geschriebenen Link IMMER (Reproduzierbarkeit), Radius nur abweichend.
  assert.equal(formatReportLink(L), "rv=1&sel=k:53.56123,10.03456&jahr=23-25");
  assert.equal(formatReportLink({ ...L, r: 40 }), "rv=1&sel=k:53.56123,10.03456&r=40&jahr=23-25");
});

test("Einrichtung mit OSM-Objekt und Rückfall-Koordinate", () => {
  const L = parseReportLink("rv=1&sel=e:way/123456789@53.56012,10.03312&r=200&jahr=21-25&land=hh", { years: YEARS });
  assert.deepEqual(L.sel, { kind: "e", oid: "way/123456789", lat: 53.56012, lng: 10.03312 });
  assert.equal(L.r, 200);
  assert.deepEqual(L.years, { from: 2021, to: 2025 });
  assert.equal(L.land, "hh");
  assert.equal(formatReportLink(L), "rv=1&sel=e:way/123456789@53.56012,10.03312&r=200&jahr=21-25&land=hh");
});

test("Radius wird auf die Grenzen der Auswahlart begrenzt", () => {
  const k = parseReportLink("sel=k:52.5,13.4&r=500", { years: YEARS });
  assert.equal(k.r, RADIUS.k.max);
  assert.ok(k.warnings.some((w) => w.includes("begrenzt")));
  const e = parseReportLink("sel=e:node/1@52.5,13.4&r=10", { years: YEARS });
  assert.equal(e.r, RADIUS.e.min);
});

test("Jahre wie der Karten-Permalink; Lücken werden zum Bereich, Grenzen zum Datenbestand", () => {
  assert.equal(packYearRange(2023, 2025), "23-25");
  assert.equal(packYearRange(2024, 2025), "24_25");
  assert.equal(packYearRange(2025, 2025), "25");
  const gap = parseReportLink("sel=k:52.5,13.4&jahr=17_19_25", { years: YEARS });
  assert.deepEqual(gap.years, { from: 2017, to: 2025 });
  assert.ok(gap.warnings.some((w) => w.includes("zusammenhängend")));
  const hostile = parseReportLink("sel=k:52.5,13.4&jahr=00-99999999", { years: YEARS });
  assert.deepEqual(hostile.years, { from: 2023, to: 2025 }, "unlesbare Jahre → Voreinstellung, keine Endlosschleife");
  const future = parseReportLink("sel=k:52.5,13.4&jahr=24-27", { years: YEARS });
  assert.deepEqual(future.years, { from: 2024, to: 2025 });
});

test("kaputte oder unbekannte Auswahl: kein Absturz, sel = null, Hinweis", () => {
  for (const s of ["sel=x:1,2", "sel=k:abc", "sel=e:way/12", "sel=e:foo/1@52,13", "sel=k:95,13", "sel="]) {
    const L = parseReportLink(s, { years: YEARS });
    assert.equal(L.sel, null, s);
  }
  assert.ok(parseReportLink("sel=k:abc").warnings.length > 0);
  const outside = parseReportLink("sel=k:48.85,2.35", { years: YEARS });
  assert.ok(outside.sel, "Paris ist ein gültiger Link …");
  assert.ok(outside.warnings.some((w) => w.includes("außerhalb")), "… aber ohne Daten");
});

test("reservierte Arten (Straßenzug, Gebiet, Gemeinde) werden gelesen und als später markiert", () => {
  const pts = [[53.5, 10.0], [53.501, 10.002], [53.5035, 10.0041]];
  const enc = encodePolyline(pts);
  assert.deepEqual(decodePolyline(enc), pts);
  const s = parseReportLink(`sel=s:${encodeURIComponent(enc)}&b=30`, { years: YEARS });
  assert.equal(s.sel.kind, "s");
  assert.equal(s.b, 30);
  assert.ok(s.warnings.some((w) => w.includes("späteren Stufe")));
  assert.equal(parseReportLink("sel=ags:02000000").sel.ags, "02000000");
  assert.equal(formatReportLink({ sel: s.sel, b: 30 }), `rv=1&sel=s:${encodeURIComponent(enc)}&b=30`);
});

test("Rücksprung in die Karte: Permalink v2 mit Ansicht und Jahren", () => {
  assert.equal(mapLinkFor({ lat: 53.5612345, lng: 10.0345678, years: { from: 2023, to: 2025 } }), "v=2&map=17.00/53.56123/10.03457&jahr=23-25");
});

test("Jahre kodiert wie der Karten-Permalink (eigene Kopie, gleiche Ergebnisse)", () => {
  for (const ys of [["2023", "2024", "2025"], ["2024", "2025"], ["2017", "2018", "2019", "2025"], ["2021"]]) {
    const map = serialize({ filters: { UJAHR: ys } }, {});
    const from = Number(ys[0]);
    const to = Number(ys.at(-1));
    if (to - from + 1 === ys.length) assert.ok(map.includes(`jahr=${packYearRange(from, to)}`), map);
    const jahr = /jahr=([^&]+)/.exec(map)[1];
    assert.deepEqual(unpackYears(jahr).map((c) => String(2000 + Number(c))), parse(`?${map}`).filters.UJAHR);
  }
});
