// Analyse-Report mit festen Testdaten (tests/fixtures/report/): ein erfundener Ort, als echte
// PMTiles-Archive gebaut (MVT, Unfälle als MLT) und per Routing ausgeliefert — lokal und in der
// CI gleich, unabhängig von data/ und B2. Prüft den ganzen Weg: Link → Kacheln → Modell →
// Regelwerk → Report/Brief/Druck, die Auswahl per Klick und den Einstieg aus dem Popup.
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

async function openReport(page, query) {
  const errors = collectErrors(page);
  await useFixtures(page);
  await page.goto(`/report.html?${query}`);
  await page.waitForFunction(() => ["true", "error"].includes(document.documentElement.dataset.reportReady), null, { timeout: 60_000 });
  expect(await page.evaluate(() => document.documentElement.dataset.reportReady)).toBe("true");
  return errors;
}

const SCHOOL = "rv=1&sel=e:way/3001@53.56065,10.04651&jahr=23-25";

test("Einrichtung aus dem Link: alle Abschnitte, Weg A, Nutzerangabe, Brief, Druck", async ({ page }) => {
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
  await expect(page.locator(".doc .map svg")).toHaveCount(1);
  await expect(page.locator(".doc .letter .subject")).toContainText("Tempo 30");
  await page.emulateMedia({ media: "print" });
  await expect(page.locator(".steps")).toBeHidden();
  await expect(page.locator(".doc")).toBeVisible();
  await page.emulateMedia({ media: "screen" });
  expect(errors).toEqual([]);
});

test("Hamburg: Landesregeln aus der Lage, Ampel in der Lücke, Zuständigkeit", async ({ page }) => {
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

test("Auswahl per Klick: rastet am Knoten ein, schreibt den Link, öffnet den Report", async ({ page }) => {
  const errors = collectErrors(page);
  await useFixtures(page);
  await page.goto(`/report.html?map=17/${CENTER.lat}/${CENTER.lng}`);
  await page.waitForFunction(() => document.documentElement.dataset.mapReady === "true", null, { timeout: 60_000 });
  const pt = await page.evaluate(([lat, lng]) => {
    const m = window.__report.app.map;
    const p = m.project([lng + 0.00012, lat + 0.00008]); // ~10 m neben der Kreuzung
    const r = m.getContainer().getBoundingClientRect();
    return { x: r.left + p.x, y: r.top + p.y };
  }, [CENTER.lat, CENTER.lng]);
  await page.mouse.click(pt.x, pt.y);
  await expect.poll(() => page.evaluate(() => window.__report.app.preview?.n ?? null), { timeout: 30_000 }).toBe(6);
  expect(page.url()).toContain("sel=k:53.56000,10.04500");
  await expect(page.locator("#selpanel")).toContainText("Eingerastet auf den Knoten");
  await page.click('button[data-go="report"]');
  await page.waitForFunction(() => document.documentElement.dataset.reportReady === "true" && window.__report.app.E?.M.selection.kind === "k");
  await expect(page.locator("#view-report h1")).toHaveText("Kreuzung Teststraße / Querweg");
  await expect(page.locator("details.sec").first()).toContainText("rechnerisch");
  expect(errors).toEqual([]);
});

test("kaputter Link: Hinweis statt Absturz, Auswahlkarte bleibt bedienbar", async ({ page }) => {
  const errors = collectErrors(page);
  await useFixtures(page);
  await page.goto("/report.html?rv=1&sel=e:foo/1@x");
  await expect(page.locator("#view-auswahl")).toBeVisible();
  await expect(page.locator('button[data-go="report"]')).toHaveAttribute("aria-disabled", "true");
  expect(errors).toEqual([]);
});
