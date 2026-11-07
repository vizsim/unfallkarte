// Analyse-Report mit festen Testdaten (tests/fixtures/report/): ein erfundener Ort, als echte
// PMTiles-Archive gebaut (MVT, Unfälle als MLT) und per Routing ausgeliefert — lokal und in der
// CI gleich, unabhängig von data/ und B2. Prüft den ganzen Weg: Link → Kacheln → Modell →
// Report → Druck. Der Build läuft ohne VITE_REPORT_LEGAL wie die Live-Seite: nur der Datenteil.
// Den Rechtsteil (Wege A–C, Brief, Zuständigkeit) prüfen tests/unit/report-rules.test.js und
// report-views.test.js browserlos in beiden Modi; die „Rechtsteil:"-Tests hier laufen nur mit
// `VITE_REPORT_LEGAL=1 npx playwright test report-fixture` (der webServer erbt die Variable).
import { test, expect } from "@playwright/test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { buildFixtures } from "../fixtures/report/build.mjs";
import { CENTER } from "../fixtures/report/scenario.mjs";

const DIR = join("test-results", "report-fixtures");
const IGNORED = [/Failed to load resource/i, /AJAXError/i];

test.beforeAll(() => { buildFixtures(DIR); });

/** Testarchive statt data/ bzw. B2 ausliefern (mit Range-Anfragen), Photon festlegen. */
async function useFixtures(page) {
  await page.route(/(\/data\/|\/file\/unfallkarte-data-v2\/)[^?]+/, (route) => {
    const req = route.request();
    const rel = new URL(req.url()).pathname.replace(/^.*?(\/data\/|\/file\/unfallkarte-data-v2\/)/, "");
    const file = join(DIR, rel);
    const cors = { "access-control-allow-origin": "*", "access-control-expose-headers": "content-range, content-length" };
    if (!existsSync(file)) return route.fulfill({ status: 404, headers: cors, body: "" });
    const buf = readFileSync(file);
    if (req.method() === "HEAD") return route.fulfill({ status: 200, headers: { ...cors, "content-length": String(buf.length) }, body: "" });
    const m = /bytes=(\d+)-(\d*)/.exec(req.headers().range ?? "");
    if (!m) return route.fulfill({ status: 200, headers: cors, contentType: file.endsWith(".json") ? "application/json" : "application/octet-stream", body: buf });
    const a = Number(m[1]);
    const b = m[2] ? Math.min(Number(m[2]), buf.length - 1) : buf.length - 1;
    return route.fulfill({ status: 206, headers: { ...cors, "content-range": `bytes ${a}-${b}/${buf.length}`, "content-type": "application/octet-stream" }, body: buf.subarray(a, b + 1) });
  });
  await page.route(/photon\.komoot\.io\/reverse/, (route) => route.fulfill({
    contentType: "application/json",
    body: JSON.stringify({ features: [{ properties: { countrycode: "DE", state: "Hamburg", city: "Hamburg", district: "Teststadt" } }] }),
  }));
}

function collectErrors(page) {
  const errors = [];
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
  page.on("console", (m) => { if (m.type() === "error" && !IGNORED.some((re) => re.test(m.text()))) errors.push(m.text()); });
  return errors;
}

async function gotoReport(page, query) {
  await page.goto(`/report.html?${query}`);
  await page.waitForFunction(() => ["true", "error"].includes(document.documentElement.dataset.reportReady), null, { timeout: 60_000 });
  expect(await page.evaluate(() => document.documentElement.dataset.reportReady)).toBe("true");
}

async function openReport(page, query) {
  const errors = collectErrors(page);
  await useFixtures(page);
  await gotoReport(page, query);
  return errors;
}

// Was im Datenteil nicht stehen darf (wie LEGAL in tests/unit/report-views.test.js).
const LEGAL_TEXT = /§|StVO|Rechtsberatung|Nr\. 6|Weg [ABC]\b|Kandidat|zuständig|Landesregeln|Regelwerk|Brief|Maßnahme|Rechtliche Einordnung|Gegenargument/;

const SCHOOL = "rv=1&sel=e:way/3001@53.56065,10.04651&jahr=23-25";
const LEGAL_BUILD = process.env.VITE_REPORT_LEGAL === "1";

test("Einrichtung aus dem Link: Datenteil aus allen Archiven, kein Rechtsteil, Druck ohne Brief", async ({ page }) => {
  test.skip(LEGAL_BUILD, "prüft den Build ohne Rechtsteil");
  const errors = await openReport(page, `${SCHOOL}&land=bund`);
  expect(await page.evaluate(() => window.__report.legal), "Build ohne VITE_REPORT_LEGAL (wie Pages)").toBe(false);
  await expect(page.locator("#view-report h1")).toHaveText("Grundschule am Testpark");
  await expect(page.locator("details.sec .no")).toHaveText(["2", "3", "4", "5", "6"]);
  await expect(page.locator("details.sec").last().locator("h2")).toHaveText("Datengrundlage und Grenzen");
  // Daten aus allen Archiven angekommen (MLT-Unfälle, Zensus, Lärm, SVZ …)
  const E = await page.evaluate(() => { const V = window.__report.app.E; return { n: V.M.accidents.n, status: V.M.status, dtv: V.M.traffic.svz.kfz, ew: V.M.census.ew }; });
  expect(Object.values(E.status).every((s) => s === "ok"), JSON.stringify(E.status)).toBe(true);
  expect(E.n).toBe(11);
  expect(E.dtv).toBe(14200);
  expect(E.ew).toBeGreaterThan(1000);

  // Rechtsteil bleibt draußen: keine Wege, kein Brief, keine Landesregeln, keine Zuständigkeit
  await expect(page.locator(".way")).toHaveCount(0);
  await expect(page.locator("#rep-land")).toHaveCount(0);
  await expect(page.locator("#tab-brief")).toBeHidden();
  await expect(page.locator(".step:visible")).toHaveText(["1Report", "2Druckansicht (PDF)"]);
  await expect(page.locator("#view-report")).not.toContainText(LEGAL_TEXT);
  await expect(page.locator(".topbar")).not.toContainText(LEGAL_TEXT);
  // „Auf einen Blick": nur Befunde aus den Daten, die Häufung neutral
  await expect(page.locator(".glance .finding").first()).toContainText("Auffällig:");
  await expect(page.locator(".glance .st.auffaellig")).toHaveCount(1);

  // Druckansicht: A4-Dokument mit Karte und Datenteil, ohne Brief; Druck-CSS blendet den Rest aus
  await page.click('button[data-go="pdf"]');
  await expect(page.locator(".doc h1")).toHaveText("Grundschule am Testpark");
  await expect(page.locator(".doc .map > svg")).toHaveCount(1);   // die Karte; ihre Legende hat eigene Symbole
  await expect(page.locator(".doc .maplegend")).toContainText("Unfälle");
  await expect(page.locator(".doc .letter")).toHaveCount(0);
  await expect(page.locator(".doc h2").last()).toHaveText("6 · Datengrundlage und Grenzen");
  await expect(page.locator(".doc")).not.toContainText(LEGAL_TEXT);
  await page.emulateMedia({ media: "print" });
  await expect(page.locator(".steps")).toBeHidden();
  await expect(page.locator(".doc")).toBeVisible();
  await page.emulateMedia({ media: "screen" });
  expect(errors).toEqual([]);
});

test("Land aus der Lage im Kopf; ein Land im Link wählt die M-Uko-Kriterien", async ({ page }) => {
  test.skip(LEGAL_BUILD, "prüft den Build ohne Rechtsteil");
  // Ohne Rechtsteil bestimmt das Land nur noch, welche M-Uko-Kriterien gelten (Bund 3, NRW 5).
  const errors = await openReport(page, SCHOOL);
  expect(await page.evaluate(() => window.__report.app.E.R.P.land)).toBe("hh");
  await expect(page.locator(".rhead .metaline").first()).toContainText("Hamburg");
  const uko = page.locator("table.t", { has: page.locator("th", { hasText: "M-Uko-Kriterium" }) }).locator("tbody tr");
  await expect(uko).toHaveCount(3);   // Hamburg hat keine eigenen Kriterien → Bund
  await gotoReport(page, `${SCHOOL}&land=nw`);
  await expect(page.locator(".rhead .metaline").first()).toContainText("Nordrhein-Westfalen");
  await expect(uko).toHaveCount(5);   // Gem. RdErl. NRW 2017
  expect(page.url()).toContain("land=nw");
  expect(errors).toEqual([]);
});

test("Rechtsteil: Einrichtung mit Weg A, Nutzerangabe, Brief, Druck", async ({ page }) => {
  test.skip(!LEGAL_BUILD, "nur mit VITE_REPORT_LEGAL=1");
  const errors = await openReport(page, `${SCHOOL}&land=bund`);
  await expect(page.locator("#view-report h1")).toHaveText("Grundschule am Testpark");
  for (const n of ["2", "3", "4", "5", "6", "7", "8", "9"]) await expect(page.locator(`details.sec .no:text-is("${n}")`)).toHaveCount(1);
  const verdict = page.locator(".way").first().locator(".verdict");
  await expect(verdict).toHaveText(/Kandidat mit Klärungsbedarf/i);
  // Daten aus allen Archiven angekommen (MLT-Unfälle, Zensus, Lärm, SVZ …)
  const E = await page.evaluate(() => { const V = window.__report.app.E; return { n: V.M.accidents.n, status: V.M.status, dtv: V.M.traffic.svz.kfz, ew: V.M.census.ew, a9: V.R.A.steps.find((s) => s.id === "A9").status }; });
  expect(Object.values(E.status).every((s) => s === "ok"), JSON.stringify(E.status)).toBe(true);
  expect(E.n).toBe(11);
  expect(E.dtv).toBe(14200);
  expect(E.ew).toBeGreaterThan(1000);
  expect(E.a9, "Bund: Lückenschluss trotz Ampel").toBe("erfuellt");

  // Nutzerangabe löst „unklar" auf
  await page.click('button[data-ans="A5"][data-val="ja"]');
  await expect(verdict).toHaveText(/^\s*Kandidat\s*$/i);

  // Brief: Pflichtfeld, Rechtsgrundlage, kein Versand ohne Beobachtung
  await page.click("#tab-brief");
  await expect(page.locator("#b-copy")).toHaveAttribute("aria-disabled", "true");
  await page.fill("#b-beob", "Morgens queren viele Kinder zwischen parkenden Autos die Teststraße, um zur Schule zu kommen; es wird schnell gefahren.");
  await expect(page.locator("#b-copy")).not.toHaveAttribute("aria-disabled", "true");
  await expect(page.locator("#letter .subject")).toHaveText(/Tempo 30 vor der Grundschule am Testpark/);
  await expect(page.locator("#letter .body")).toContainText("§ 45 Abs. 9 Satz 4 Nr. 6 StVO");

  // Druckansicht: A4-Dokument mit Karte, Einordnung und Brief; Druck-CSS blendet den Rest aus
  await page.click('button[data-go="pdf"]');
  await expect(page.locator(".doc h1")).toHaveText("Grundschule am Testpark");
  await expect(page.locator(".doc .map > svg")).toHaveCount(1);   // die Karte; ihre Legende hat eigene Symbole
  await expect(page.locator(".doc .maplegend")).toContainText("Unfälle");
  await expect(page.locator(".doc .letter .subject")).toContainText("Tempo 30");
  await page.emulateMedia({ media: "print" });
  await expect(page.locator(".steps")).toBeHidden();
  await expect(page.locator(".doc")).toBeVisible();
  await page.emulateMedia({ media: "screen" });
  expect(errors).toEqual([]);
});

test("Rechtsteil: Hamburger Landesregeln aus der Lage, Ampel in der Lücke, Zuständigkeit", async ({ page }) => {
  test.skip(!LEGAL_BUILD, "nur mit VITE_REPORT_LEGAL=1");
  const errors = await openReport(page, SCHOOL);
  const E = await page.evaluate(() => { const V = window.__report.app.E; return { land: V.R.P.land, a9: V.R.A.steps.find((s) => s.id === "A9").status, zf: V.R.A.zf, adr: V.adr.stelle }; });
  expect(E.land).toBe("hh");
  expect(E.a9).toBe("nicht_erfuellt");
  expect(E.zf).toBe("werktags 6–22 Uhr");
  expect(E.adr).toMatch(/Polizei Hamburg/);
  // Land von Hand überschreiben: Regeln und Link ziehen mit
  await page.selectOption("#rep-land", "nw");
  await expect.poll(() => page.evaluate(() => window.__report.app.E.R.P.land)).toBe("nw");
  expect(page.url()).toContain("land=nw");
  expect(errors).toEqual([]);
});

test("Kreuzung aus dem Link; Radius im Report ändern lädt nach und schreibt den Link", async ({ page }) => {
  // Gewählt wird in der Karte (js/analysis/, tests/web/analysis.spec.js) — hier kommt die Stelle
  // aus dem Link, wie nach „Report öffnen".
  const errors = await openReport(page, `rv=1&sel=k:${CENTER.lat.toFixed(5)},${CENTER.lng.toFixed(5)}&jahr=23-25`);
  await expect(page.locator("#view-report h1")).toHaveText("Kreuzung Teststraße / Querweg");
  await expect(page.locator("details.sec").first()).toContainText("rechnerisch");
  expect(await page.evaluate(() => window.__report.app.E.M.accidents.n)).toBe(6);

  await page.locator("#rep-r").evaluate((el) => {
    el.value = "40";
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await expect.poll(() => page.evaluate(() => window.__report.app.E?.M.selection.r)).toBe(40);
  expect(page.url()).toContain("&r=40&");
  await expect(page.locator("#view-report h1")).toBeVisible();   // der Report blieb stehen
  expect(errors).toEqual([]);
});

test("kaputter Link: Hinweis statt Absturz, Weg zurück in die Karte", async ({ page }) => {
  const errors = collectErrors(page);
  await useFixtures(page);
  await page.goto("/report.html?rv=1&sel=e:foo/1@x");
  await page.waitForFunction(() => document.documentElement.dataset.reportReady === "empty");
  const empty = page.locator("#view-report .empty-state");
  await expect(empty).toContainText("Noch keine Stelle gewählt");
  await expect(empty).toContainText("beschädigt");
  await expect(empty.locator('a[href="./index.html"]')).toBeVisible();
  await expect(page.locator("#tab-pdf")).toHaveAttribute("aria-disabled", "true");
  await expect(page.locator("#tab-brief")).toBeVisible({ visible: LEGAL_BUILD });
  expect(errors).toEqual([]);
});
