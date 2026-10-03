// Export „Unfälle herunterladen": Dialog, Datenweg per HTTP-Range, Inhalt der Dateien.
//
// Daten: eine kleine Veröffentlichung aus synthetischen Unfällen (tests/fixtures/export/,
// neu schreiben mit `uv --directory pipeline run python tests/synthetic.py`). Die Route liefert
// sie mit Range-Antworten wie data.vizsim.de aus — für die lokale UND die Online-Adresse. So
// laufen die Tests deterministisch und ohne Netz zu data.vizsim.de (helpers.js).
import { test, expect } from "@playwright/test";
import {
  FIXTURE_FILE, downloadExport as download, expectNoErrors, jumpTo, openMap,
  parseExportCSV as parseCSV, serveExportFixture as serveFixture,
} from "./helpers.js";

const KOTTBUSSER_TOR = [13.4183, 52.499];

const countIn = async (status) => parseInt((await status.textContent()).replace(/\./g, ""), 10);

test("Start lädt weder Export- noch Zeichen-Code (Terra Draw) noch Unfalldaten aus der Veröffentlichung", async ({ page }) => {
  const urls = [];
  page.on("request", (r) => urls.push(r.url()));
  const errors = await openMap(page);
  expect(urls.filter((u) => /exportDialog|drawArea|hyparquet|terra-draw|\/unfallorte\//.test(u))).toEqual([]);
  expectNoErrors(errors);
});

test("Export: Kartenausschnitt als CSV und GeoJSON; Filter wie die Karte oder alle Unfälle", async ({ page }) => {
  const errors = await openMap(page);
  const log = await serveFixture(page);
  await jumpTo(page, KOTTBUSSER_TOR, 15);
  const [w, s, e, n] = await page.evaluate(() => window.map.getBounds().toArray().flat());

  await page.click("#export-open");
  const dialog = page.locator("#export-dialog");
  const status = dialog.locator(".export-status");
  await expect(dialog).toBeVisible();
  await expect(status).toHaveText(/^\d[\d.]* Unfälle · geladen/);
  const total = await countIn(status);
  expect(total).toBeGreaterThan(0);

  // CSV: BOM, Kopfzeile, eine Zeile je Unfall, alle im Ausschnitt.
  const csv = await download(page, "csv");
  expect(csv.name).toMatch(/^unfaelle_\d{4}-\d{2}-\d{2}_stand-2026-10-01\.csv$/);
  expect(csv.text.startsWith("﻿unfall_id;UJAHR;")).toBe(true);
  const rows = parseCSV(csv.text);
  expect(rows).toHaveLength(total);
  const eps = 1e-6;   // Koordinaten sind auf 6 Stellen gerundet
  for (const r of rows) {
    const x = Number(r.XGCSWGS84.replace(",", "."));
    const y = Number(r.YGCSWGS84.replace(",", "."));
    expect(x >= w - eps && x <= e + eps && y >= s - eps && y <= n + eps, `${r.unfall_id} außerhalb`).toBe(true);
  }

  // GeoJSON: gleiche Anzahl, Quellenvermerk und Datenstand in metadata.
  const gj = JSON.parse((await download(page, "geojson")).text);
  expect(gj.features).toHaveLength(total);
  expect(gj.metadata.datei).toBe(FIXTURE_FILE);
  expect(gj.metadata.quellenvermerk).toMatch(/dl-de\/by-2-0/);

  // Gelesen nur in Byte-Bereichen — nie die ganze Datei.
  const parquet = log.filter((r) => r.name === FIXTURE_FILE);
  expect(parquet.length).toBeGreaterThan(0);
  expect(parquet.every((r) => r.range)).toBe(true);

  // „Wie in der Karte": 2025 in der Legende abwählen -> weniger Unfälle, keiner aus 2025.
  await dialog.locator(".export-close").click();
  const y2025 = page.locator('.legend input[data-group="UJAHR"][value="2025"]');
  await y2025.evaluate((el) => el.click());   // Jahres-Abschnitt ist zugeklappt; gleicher change-Pfad
  await expect(y2025).not.toBeChecked();
  await page.click("#export-open");
  await expect(status).toHaveText(/^\d[\d.]* Unfälle \(von [\d.]+ im Ausschnitt\)/);
  await expect(dialog.locator(".export-filter-text")).toHaveText("Jahre 2017–2024");
  const filtered = parseCSV((await download(page, "csv")).text);
  expect(filtered.length).toBeLessThan(total);
  expect(filtered.some((r) => r.UJAHR === "2025")).toBe(false);

  // „Alle Unfälle": wieder alles, und der Hinweis auf die Lücke Berlins vor 2018.
  await dialog.locator(".legend-chip", { hasText: "alle Unfälle" }).click();
  await expect(status).toHaveText(new RegExp(`^${total.toLocaleString("de-DE").replace(".", "\\.")} Unfälle · geladen`));
  await expect(dialog.locator(".export-hints")).toContainText("Berlin: für 2016–2017 enthält der Unfallatlas keine Daten.");
  expectNoErrors(errors);
});

test("Export: fehlen die Daten, zeigt der Dialog einen Fehler statt zu hängen", async ({ page }) => {
  await openMap(page);
  await page.route("**/unfallorte/**", (route) => route.fulfill({ status: 404 }));
  await page.click("#export-open");
  await expect(page.locator("#export-dialog .export-status")).toHaveText(/konnten nicht geladen werden/);
  await expect(page.locator('#export-dialog .export-format[data-format="csv"]')).toBeDisabled();
});

test.describe("Handy", () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

  test("Download-Knopf ist bei zugeklappter Legende erreichbar, der Dialog passt aufs Display", async ({ page }) => {
    const errors = await openMap(page);
    await serveFixture(page);
    await expect(page.locator(".legend")).toHaveClass(/collapsed/);
    await page.locator("#export-open").tap();
    const dialog = page.locator("#export-dialog");
    await expect(dialog.locator(".export-status")).not.toHaveText(/Lade/);
    const box = await dialog.boundingBox();
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(390);
    await expect(page.locator(".legend")).toHaveClass(/collapsed/);   // der Tipp klappte nichts auf
    expectNoErrors(errors);
  });
});
