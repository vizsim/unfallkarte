// Export „Unfälle herunterladen": Dialog, Datenweg per HTTP-Range, Inhalt der Dateien.
//
// Daten: eine kleine Veröffentlichung aus synthetischen Unfällen (tests/fixtures/export/,
// neu schreiben mit `uv --directory pipeline run python tests/synthetic.py`). Die Route liefert
// sie mit Range-Antworten wie data.vizsim.de aus — für die lokale UND die Online-Adresse. So
// laufen die Tests deterministisch und ohne Netz zu data.vizsim.de.
import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { openMap, jumpTo, expectNoErrors } from "./helpers.js";

const FIXTURE = join(dirname(fileURLToPath(import.meta.url)), "..", "fixtures", "export", "unfallorte");
const FIXTURE_FILE = "unfallorte_2016-2025_2026-10-01.parquet";
const KOTTBUSSER_TOR = [13.4183, 52.499];

/** Fixture unter **\/unfallorte/** ausliefern, mit 206 auf Range-Anfragen. Liefert das Protokoll. */
async function serveFixture(page) {
  const log = [];
  await page.route("**/unfallorte/**", async (route) => {
    const req = route.request();
    const name = new URL(req.url()).pathname.split("/").pop();
    const range = req.headers().range ?? null;
    log.push({ name, method: req.method(), range });
    let body;
    try {
      body = readFileSync(join(FIXTURE, name));
    } catch {
      return route.fulfill({ status: 404 });
    }
    const headers = { "content-type": name.endsWith(".json") ? "application/json" : "application/vnd.apache.parquet", "accept-ranges": "bytes" };
    const m = /bytes=(\d+)-(\d*)/.exec(range ?? "");
    if (!m) return route.fulfill({ status: 200, body, headers });
    const start = Number(m[1]);
    const end = m[2] ? Math.min(Number(m[2]), body.length - 1) : body.length - 1;
    return route.fulfill({
      status: 206,
      body: body.subarray(start, end + 1),
      headers: { ...headers, "content-range": `bytes ${start}-${end}/${body.length}` },
    });
  });
  return log;
}

async function download(page, format) {
  const [dl] = await Promise.all([
    page.waitForEvent("download"),
    page.click(`#export-dialog .export-format[data-format="${format}"]`),
  ]);
  return { name: dl.suggestedFilename(), text: readFileSync(await dl.path(), "utf8") };
}

/** CSV (Semikolon, Dezimalkomma) → Zeilen als Objekte. Die Klartexte enthalten kein Semikolon. */
function parseCSV(text) {
  const [head, ...lines] = text.replace(/^﻿/, "").trimEnd().split("\r\n");
  const keys = head.split(";");
  return lines.map((line) => Object.fromEntries(line.split(";").map((v, i) => [keys[i], v])));
}

const countIn = async (status) => parseInt((await status.textContent()).replace(/\./g, ""), 10);

test("Start lädt weder den Export-Code noch Unfalldaten aus der Veröffentlichung", async ({ page }) => {
  const urls = [];
  page.on("request", (r) => urls.push(r.url()));
  const errors = await openMap(page);
  expect(urls.filter((u) => /exportDialog|hyparquet|\/unfallorte\//.test(u))).toEqual([]);
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
