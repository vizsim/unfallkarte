// Analyse-Report gegen ECHTE Daten (lokal: data/, CI: B2). Bewusst tolerant: geprüft wird,
// dass die Seite lädt, alle Archive liest und die Abschnitte baut — nicht, wie viele Unfälle es
// an einer Stelle gerade sind. Die Rechenregeln prüfen tests/unit/report-*.test.js und
// report-fixture.spec.js mit festen Daten.
import { test, expect } from "@playwright/test";
import { openMap, expectNoErrors } from "./helpers.js";

// Berlin, Umfeld Alexanderplatz: viel Verkehr, seit Jahren Unfälle mit Personenschaden.
const ALEX = "rv=1&sel=k:52.52022,13.41619&r=60";
const IGNORED = [/Failed to load resource/i];

test("Report für eine echte Kreuzung: lädt, liest alle Archive, baut die Abschnitte", async ({ page }) => {
  test.setTimeout(180_000);
  const errors = [];
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
  page.on("console", (m) => { if (m.type() === "error" && !IGNORED.some((re) => re.test(m.text()))) errors.push(m.text()); });
  await page.goto(`/report.html?${ALEX}`);
  await page.waitForFunction(() => ["true", "error"].includes(document.documentElement.dataset.reportReady), null, { timeout: 150_000 });
  expect(await page.evaluate(() => document.documentElement.dataset.reportReady)).toBe("true");
  const info = await page.evaluate(() => {
    const E = window.__report.app.E;
    return { status: E.M.status, n: E.M.accidents.n, road: E.M.road?.label ?? null, land: E.R.P.land, sections: document.querySelectorAll("details.sec").length };
  });
  expect(info.status.accidents, "Unfälle (MLT) gelesen").toBe("ok");
  expect(Object.entries(info.status).filter(([, s]) => s === "error"), "Archive mit Lesefehler").toEqual([]);
  expect(info.n, "am Alexanderplatz gibt es Unfälle im Dreijahresfenster").toBeGreaterThan(0);
  expect(info.road, "Hauptstraße erkannt").not.toBeNull();
  expect(info.land).toBe("be");
  expect(info.sections, "Datenteil: 2–5 + Datengrundlage (ohne VITE_REPORT_LEGAL)").toBe(5);
  expectNoErrors(errors);
});

test("Report-Vertrag: jedes Feld, das der Report liest, steht in den Archiven", async ({ page }) => {
  // Pendant zu contract.spec.js: benennt die Pipeline ein Feld um, zeigte der Report sonst
  // still „nicht verfügbar" bzw. falsche Werte.
  test.setTimeout(120_000);
  await page.goto("/report.html");
  await page.waitForFunction(() => window.__report?.app.sources, null, { timeout: 60_000 });
  const problems = await page.evaluate(async () => {
    const { app, DATASETS } = window.__report;
    const out = [];
    for (const d of DATASETS) {
      const url = app.sources.urls[d.id];
      if (!url) { out.push(`${d.id}: keine URL (Manifest-Eintrag ${d.manifest} fehlt)`); continue; }
      try {
        const meta = await app.reader.metadata(url);
        const vl = (meta.vector_layers ?? []).find((v) => v.id === d.layer);
        if (!vl) { out.push(`${d.id}: Layer "${d.layer}" fehlt`); continue; }
        for (const f of d.fields) if (!(f in (vl.fields ?? {}))) out.push(`${d.id}: Feld "${f}" fehlt in "${d.layer}"`);
      } catch (err) {
        out.push(`${d.id}: Metadaten nicht lesbar (${err})`);
      }
    }
    return out;
  });
  expect(problems).toEqual([]);
});

test("Einstieg aus der Karte: fixiertes Unfall-Popup verlinkt den Report", async ({ page }) => {
  const errors = await openMap(page);
  await page.evaluate(() => window.map.jumpTo({ center: [13.41619, 52.52022], zoom: 17 }));
  // Einen gerenderten Unfallpunkt suchen und anklicken (fixiert das Popup).
  let target = null;
  await expect.poll(async () => {
    target = await page.evaluate(() => {
      const m = window.map;
      const f = m.queryRenderedFeatures({ layers: ["accident-points"] })[0];
      if (!f) return null;
      const p = m.project(f.geometry.coordinates);
      const r = m.getContainer().getBoundingClientRect();
      return { x: r.left + p.x, y: r.top + p.y };
    });
    return !!target;
  }, { timeout: 60_000 }).toBe(true);
  await page.mouse.click(target.x, target.y);
  const link = page.locator(".maplibregl-popup a.pop-report").first();
  await expect(link).toBeVisible();
  expect(await link.getAttribute("href")).toMatch(/\/report\.html\?rv=1&sel=k:52\.\d{5},13\.\d{5}$/);
  expectNoErrors(errors);
});
