// Gebiet zeichnen (Export, Terra Draw): Zeichnen per Maus und Touch, Popups pausieren, Export
// nur im Gebiet, Gebiet im Permalink (sel=g:), Bearbeiten, Abbrechen. Daten: die Export-Fixture
// (helpers.js) — ohne Netz zu data.vizsim.de.
import { test, expect } from "@playwright/test";
import { encodePolyline } from "../../js/utils/permalinkFormat.js";
import {
  downloadExport, expectNoErrors, jumpTo, openMap, parseExportCSV, serveExportFixture,
} from "./helpers.js";

const KOTTBUSSER_TOR = [13.4183, 52.499];
// Viereck um die Kartenmitte (1400×900, Legende rechts): 300 px Kante — weit mehr als der
// Abstand, ab dem Terra Draw einen Klick als „zurück zum ersten Punkt" liest.
const SQUARE = [[550, 300], [850, 300], [850, 600], [550, 600]];

function inRing(x, y, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

const appReady = (page) => page.waitForFunction(
  () => document.documentElement.dataset.appReady === "true" && window.map?.loaded?.(), null, { timeout: 90_000 });
const selParam = (page) => new URL(page.url()).searchParams.get("sel");

async function startDrawing(page) {
  await page.click("#export-open");
  const dialog = page.locator("#export-dialog");
  await expect(dialog.locator(".export-status")).not.toHaveText(/^Lade/);
  await dialog.locator(".legend-chip", { hasText: "Gebiet zeichnen" }).click();
  await expect(dialog).toBeHidden();
  await expect(page.locator(".draw-bar")).toBeVisible();
  return dialog;
}

test("Gebiet zeichnen: Viereck per Maus, Popups pausieren, Export nur im Gebiet, Link trägt es", async ({ page }) => {
  const errors = await openMap(page);
  await serveExportFixture(page);
  await jumpTo(page, KOTTBUSSER_TOR, 15);
  const dialog = await startDrawing(page);

  // Vier Ecken, dann zurück auf die erste: schließt. Die Klicks treffen Unfallpunkte — ohne
  // Pause fixierten sie Popups.
  for (const [x, y] of SQUARE) await page.mouse.click(x, y);
  await page.mouse.click(...SQUARE[0]);
  await expect(page.locator(".draw-bar")).toBeHidden();
  expect(await page.locator(".maplibregl-popup").count(), "Popup beim Zeichnen").toBe(0);

  await expect(dialog).toBeVisible();
  await expect(dialog.locator('input[name="export-area"][value="drawn"]')).toBeChecked();
  await expect(dialog.locator(".export-drawn-label")).toHaveText("Gezeichnetes Gebiet");
  const status = dialog.locator(".export-status");
  await expect(status).toHaveText(/^\d[\d.]* Unfälle · geladen/);

  const area = await page.evaluate(() => window.__app.getArea());
  expect(area.type).toBe("Polygon");
  expect(area.coordinates[0]).toHaveLength(5);   // vier Ecken + Schlusspunkt
  await expect.poll(() => selParam(page)).toMatch(/^g:/);

  const rows = parseExportCSV((await downloadExport(page, "csv")).text);
  expect(rows.length).toBeGreaterThan(0);
  for (const r of rows) {
    const x = Number(r.XGCSWGS84.replace(",", "."));
    const y = Number(r.YGCSWGS84.replace(",", "."));
    expect(inRing(x, y, area.coordinates[0]), `${r.unfall_id} liegt außerhalb des Gebiets`).toBe(true);
  }
  const gj = JSON.parse((await downloadExport(page, "geojson")).text);
  expect(gj.metadata.gebiet).toEqual(area);

  // Der ganze Ausschnitt enthält mehr als das Gebiet darin.
  await dialog.locator(".legend-chip", { hasText: "Kartenausschnitt" }).click();
  await expect(status).toHaveText(/^\d[\d.]* Unfälle · geladen/);
  expect(parseInt((await status.textContent()).replace(/\./g, ""), 10)).toBeGreaterThan(rows.length);
  expectNoErrors(errors);
});

test("Gebiet aus einem Link: als Fläche da (ohne Terra Draw), bearbeiten verschiebt eine Ecke", async ({ page }) => {
  const [lng, lat] = KOTTBUSSER_TOR;
  const ring = [[lng - 0.004, lat - 0.002], [lng + 0.004, lat - 0.002], [lng + 0.004, lat + 0.002], [lng - 0.004, lat + 0.002]];
  const sel = `g:${encodeURIComponent(encodePolyline(ring.map(([x, y]) => [y, x])))}`;
  const urls = [];
  page.on("request", (r) => urls.push(r.url()));
  await serveExportFixture(page);
  await page.goto(`/index.html?v=2&map=15.00/${lat}/${lng}&sel=${sel}`);
  await appReady(page);

  expect(await page.evaluate(() => !!window.map.getLayer("selection-area-line"))).toBe(true);
  const area = await page.evaluate(() => window.__app.getArea());
  expect(area.coordinates[0].slice(0, 4).map(([x, y]) => [x.toFixed(5), y.toFixed(5)]))
    .toEqual(ring.map(([x, y]) => [x.toFixed(5), y.toFixed(5)]));
  expect(urls.filter((u) => /drawArea|terra-draw/.test(u)), "Terra Draw nur zum Bearbeiten").toEqual([]);

  // Dialog nimmt das Gebiet; „bearbeiten" -> erste Ecke 60 px nach links ziehen -> Fertig.
  await page.click("#export-open");
  const dialog = page.locator("#export-dialog");
  await expect(dialog.locator('input[name="export-area"][value="drawn"]')).toBeChecked();
  await dialog.locator('[data-area="edit"]').click();
  await expect(page.locator(".draw-bar")).toBeVisible();
  const corner = await page.evaluate(([x, y]) => window.map.project([x, y]), ring[0]);
  await page.mouse.move(corner.x, corner.y);
  await page.mouse.down();
  await page.mouse.move(corner.x - 30, corner.y, { steps: 5 });
  await page.mouse.move(corner.x - 60, corner.y, { steps: 5 });
  await page.mouse.up();
  await page.locator(".draw-bar .draw-done").click();
  await expect(dialog).toBeVisible();

  const moved = await page.evaluate(() => window.__app.getArea());
  expect(moved.coordinates[0][0][0], "erste Ecke nach Westen gezogen").toBeLessThan(ring[0][0] - 0.0005);
  await expect.poll(() => selParam(page)).not.toBe(decodeURIComponent(sel));
});

test("Gebiet zeichnen: Fertig braucht drei Punkte, Esc bricht ab und lässt kein Gebiet zurück", async ({ page }) => {
  const errors = await openMap(page);
  await serveExportFixture(page);
  await jumpTo(page, KOTTBUSSER_TOR, 15);
  const dialog = await startDrawing(page);

  await page.mouse.click(...SQUARE[0]);
  await page.mouse.click(...SQUARE[1]);
  await page.locator(".draw-bar .draw-done").click();
  await expect(page.locator(".draw-bar .draw-hint")).toHaveText(/mindestens drei Punkte/);
  await page.locator(".draw-bar .draw-undo").click();   // Punkt zurück (darf nicht werfen)

  await page.keyboard.press("Escape");
  await expect(page.locator(".draw-bar")).toBeHidden();
  await expect(dialog).toBeVisible();
  await expect(dialog.locator('input[name="export-area"][value="view"]')).toBeChecked();
  expect(await page.evaluate(() => window.__app.getArea())).toBeNull();
  expect(selParam(page)).toBeNull();
  expectNoErrors(errors);
});

test.describe("Handy", () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

  test("Gebiet per Tippen zeichnen und mit Fertig schließen", async ({ page }) => {
    const errors = await openMap(page);
    await serveExportFixture(page);
    await jumpTo(page, KOTTBUSSER_TOR, 15);
    await page.locator("#export-open").tap();
    const dialog = page.locator("#export-dialog");
    await expect(dialog.locator(".export-status")).not.toHaveText(/^Lade/);
    await dialog.locator(".legend-chip", { hasText: "Gebiet zeichnen" }).tap();
    const bar = page.locator(".draw-bar");
    await expect(bar).toBeVisible();
    const box = await bar.boundingBox();
    expect(box.x + box.width).toBeLessThanOrEqual(390);

    for (const [x, y] of [[110, 260], [290, 260], [200, 460]]) await page.touchscreen.tap(x, y);
    await bar.locator(".draw-done").tap();
    await expect(bar).toBeHidden();
    await expect(dialog.locator('input[name="export-area"][value="drawn"]')).toBeChecked();
    expect((await page.evaluate(() => window.__app.getArea())).coordinates[0]).toHaveLength(4);
    expectNoErrors(errors);
  });
});
