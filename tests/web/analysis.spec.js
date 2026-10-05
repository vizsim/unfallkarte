// Analyse in der Karte (experimentell, js/analysis/): Akkordeon in der Legende, Wählen per Klick,
// Kontextmenü (Rechtsklick), Popup-Link „Analysieren →". Echte Daten wie smoke/report.spec.js
// (lokal data/, in der CI B2) — geprüft wird das Verhalten, nicht wie viele Unfälle es gerade sind.
import { test, expect } from "@playwright/test";
import { expectNoErrors, jumpTo, openMap, popups, waitForBusiestPoint } from "./helpers.js";

const KOTTBUSSER_TOR = [13.4183, 52.499];   // großer Knoten mit vielen Unfällen
const REPORT_K = /\/report\.html\?rv=1&sel=k:52\.\d{5},13\.\d{5}(&r=\d+)?&jahr=\d\d-\d\d$/;

const section = (page) => page.locator('.legend-section[data-section="analyse"]');
const snapshot = (page) => page.evaluate(() => window.__app.analysis());
// Aufs Wort „Analyse" klicken: die Plakette daneben zeigt per Klick ihren Tooltip (tooltip.js).
const openSection = (page) => section(page).locator(".analysis-heading").click({ position: { x: 6, y: 8 } });
const ready = (page) => expect.poll(async () => (await snapshot(page)).ready, { timeout: 60_000 }).toBe(true);

/** Pixel knapp neben dem Knoten (der Klick soll einrasten). */
const nearJunction = (page) => page.evaluate(([lng, lat]) => {
  const m = window.map;
  const p = m.project([lng + 0.00012, lat + 0.00008]);
  const r = m.getContainer().getBoundingClientRect();
  return { x: r.left + p.x, y: r.top + p.y };
}, KOTTBUSSER_TOR);

test("Akkordeon: Kreuzung per Klick wählen — Popups pausieren, Vorschau, Report-Link", async ({ page }) => {
  const errors = await openMap(page);
  await jumpTo(page, KOTTBUSSER_TOR, 17);
  const s = section(page);

  // Startet zugeklappt; die ganze Titelzeile klappt auf. Experimentell + Hinweis sichtbar.
  await expect(s).toHaveClass(/collapsed/);
  await openSection(page);
  await expect(s).not.toHaveClass(/collapsed/);
  await expect(s.locator(".analysis-badge")).toHaveText("Experimentell");
  await expect(s.locator(".analysis-disclaimer")).toContainText("Keine Gewähr");

  await s.locator(".legend-chip", { hasText: "Kreuzung" }).click();
  await expect(page.locator(".analysis-bar")).toBeVisible();
  const pt = await nearJunction(page);
  await page.mouse.click(pt.x, pt.y);
  await expect(page.locator(".analysis-bar")).toBeHidden();
  // Der Klick traf Unfallpunkte — beim Wählen fixiert er trotzdem kein Popup.
  expect(await popups(page).count(), "Popup beim Wählen").toBe(0);

  await ready(page);
  const a = await snapshot(page);
  expect(a.sel.kind).toBe("k");
  expect(a.n, "am Kottbusser Tor gibt es Unfälle im Dreijahresfenster").toBeGreaterThan(0);
  expect(a.href).toMatch(REPORT_K);
  await expect(s.locator(".analysis-hint")).toHaveText(/Eingerastet auf den Knoten|Kein Knoten in 30 m/);
  await expect(s.locator(".analysis-stats .analysis-stat")).toHaveCount(3);
  await expect(s.locator(".analysis-meta")).toHaveText(/^20\d\d–20\d\d/);
  await expect(s.locator(".analysis-intro")).toBeHidden();      // tritt mit Auswahl zurück
  await expect(s.locator(".analysis-disclaimer")).toBeVisible(); // der Hinweis bleibt
  await expect(s.locator(".analysis-open")).toHaveAttribute("href", a.href);

  // Radius ändern: Kreis, Vorschau und Link ziehen mit.
  await s.locator(".analysis-r").evaluate((el) => {
    el.value = "60";
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await expect(s.locator(".analysis-r-value")).toHaveText("60 m");
  await ready(page);
  expect((await snapshot(page)).href).toContain("&r=60&");

  // Löschen: Auswahl weg, Ergebnisbereich zu.
  await s.locator(".analysis-clear").click();
  expect((await snapshot(page)).sel).toBeNull();
  await expect(s.locator(".analysis-result")).toBeHidden();
  expectNoErrors(errors);
});

test("Akkordeon: Abbrechen per Esc lässt die Karte wieder normal klicken", async ({ page }) => {
  const errors = await openMap(page);
  await jumpTo(page, KOTTBUSSER_TOR, 17);
  const s = section(page);
  await openSection(page);
  await s.locator(".legend-chip", { hasText: "Kreuzung" }).click();
  await expect(page.locator(".analysis-bar")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.locator(".analysis-bar")).toBeHidden();
  expect((await snapshot(page)).sel).toBeNull();
  await expect(s.locator('input[name="analysis-kind"][value="k"]')).not.toBeChecked();
  // Popups gehen wieder: ein Klick auf einen Unfall fixiert sein Fenster.
  const hit = await waitForBusiestPoint(page, ["accident-points"]);
  await page.mouse.click(hit.x, hit.y);
  await expect(popups(page).locator(".maplibregl-popup-close-button")).toHaveCount(1);
  expectNoErrors(errors);
});

test("Rechtsklick: Kontextmenü, Esc schließt, „Kreuzung hier analysieren“ wählt", async ({ page }) => {
  const errors = await openMap(page);
  await jumpTo(page, KOTTBUSSER_TOR, 17);
  const pt = await nearJunction(page);
  const menu = page.locator(".map-menu");

  await page.mouse.click(pt.x, pt.y, { button: "right" });
  await expect(menu).toBeVisible();
  await expect(menu).toContainText("experimentell");
  await page.keyboard.press("Escape");
  await expect(menu).toBeHidden();

  await page.mouse.click(pt.x, pt.y, { button: "right" });
  await menu.getByRole("menuitem", { name: "Kreuzung hier analysieren" }).click();
  await expect(menu).toBeHidden();
  await expect(section(page)).not.toHaveClass(/collapsed/);
  await ready(page);
  const a = await snapshot(page);
  expect(a.sel.kind).toBe("k");
  expect(a.href).toMatch(REPORT_K);
  expectNoErrors(errors);
});

test("Einrichtung: der Chip blendet Einrichtungen ein, ein Klick darauf wählt sie", async ({ page }) => {
  const errors = await openMap(page);
  await jumpTo(page, KOTTBUSSER_TOR, 16);
  const s = section(page);
  await openSection(page);
  await s.locator(".legend-chip", { hasText: "Einrichtung" }).click();
  await expect(page.locator(".analysis-bar")).toBeVisible();
  await expect(page.locator("#toggle-schools")).toBeChecked();

  const layers = ["schools-polygons", "schools-points", "health-polygons", "health-points", "playgrounds-polygons", "playgrounds-points"];
  const hit = await waitForBusiestPoint(page, layers, { message: "keine Einrichtung im Bild" });
  await page.mouse.click(hit.x, hit.y);
  await ready(page);
  const a = await snapshot(page);
  expect(a.sel.kind).toBe("e");
  expect(a.sel.oid).toMatch(/^(node|way|relation)\/\d+$/);
  expect(a.href).toMatch(/\/report\.html\?rv=1&sel=e:(node|way|relation)\/\d+@52\.\d{5},13\.\d{5}&jahr=\d\d-\d\d$/);
  await expect(s.locator(".analysis-title")).not.toHaveText("Einrichtung");   // Name aus OSM (oder „… ohne Namen")
  expectNoErrors(errors);
});

test("Popup-Link „Analysieren →“ öffnet das Akkordeon statt eines neuen Tabs", async ({ page, context }) => {
  const errors = await openMap(page);
  await jumpTo(page, KOTTBUSSER_TOR, 17);
  const hit = await waitForBusiestPoint(page, ["accident-points"]);
  await page.mouse.click(hit.x, hit.y);
  const link = popups(page).locator("a.pop-report").first();
  await expect(link).toHaveText("Analysieren →");

  const opened = [];
  context.on("page", (p) => opened.push(p));
  await link.click();
  await expect(section(page)).not.toHaveClass(/collapsed/);
  await ready(page);
  expect((await snapshot(page)).sel.kind).toBe("k");
  await page.waitForTimeout(300);
  expect(opened, "Klick hat einen neuen Tab geöffnet").toHaveLength(0);
  expectNoErrors(errors);
});
