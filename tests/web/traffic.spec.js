// Verkehrs-Layer mit Hook statt reinem Sichtbarkeits-Toggle (js/layers/traffic-*.js):
// Uber-Stunden-Regler + Tagesverlauf im Popup, SVZ Master/Unter-Haken/Modus, Telraam-Modus.
import { test, expect } from "@playwright/test";
import { openMap, jumpTo, hoverAt, popups, layerVisibility, expectNoErrors } from "./helpers.js";

const vis = layerVisibility;
const shown = (page, id) => page.evaluate((id) => document.getElementById(id).offsetParent !== null, id);

test("Uber: Stunden-Regler setzt Filter + Farbe beider Richtungen", async ({ page }) => {
  const errors = await openMap(page);
  expect(await shown(page, "uspeed-slider-container")).toBe(false);
  await page.click("#toggle-uspeed", { force: true });
  expect(await vis(page, ["uspeed-forward", "uspeed-reverse"])).toEqual(["visible", "visible"]);
  expect(await shown(page, "uspeed-slider-container")).toBe(true);
  expect(await shown(page, "uspeed-legend")).toBe(true);

  await page.evaluate(() => {
    const el = document.getElementById("uspeed-slider");
    el.value = "8";
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await expect(page.locator("#uspeed-slider-value")).toHaveText("8");
  // gebündelt (debounce) -> pollen
  await expect.poll(() => page.evaluate(() => JSON.stringify(window.map.getFilter("uspeed-reverse"))))
    .toBe(JSON.stringify(["all", ["has", "speed_8"], ["==", ["get", "reconstruction_direction"], "reverse"]]));
  expect(await page.evaluate(() => JSON.stringify(window.map.getPaintProperty("uspeed-forward", "line-color")))).toContain("speed_8");
  expectNoErrors(errors);
});

test("Uber: Hover zeigt den Tagesverlauf, Klick fixiert, Stunde zeigt ihren Wert", async ({ page }) => {
  const errors = await openMap(page);
  await page.click("#toggle-uspeed", { force: true });
  await jumpTo(page, [13.405, 52.52], 14);

  const find = () => page.evaluate(() => {
    const m = window.map;
    const rect = m.getContainer().getBoundingClientRect();
    for (let x = 60; x < rect.width - 60; x += 6) for (let y = 60; y < rect.height - 60; y += 6) {
      if (!document.elementFromPoint(rect.left + x, rect.top + y)?.classList.contains("maplibregl-canvas")) continue;
      const top = m.queryRenderedFeatures([x, y]).find((f) => f.layer.id.startsWith("uspeed") || f.layer.id === "accident-points");
      if (top?.layer.id.startsWith("uspeed")) return { x: rect.left + x, y: rect.top + y };
    }
    return null;
  });
  let pt = null;
  await expect.poll(async () => (pt = await find()), { message: "kein Uber-Segment gefunden", timeout: 60_000 }).not.toBeNull();

  // Hover: Diagramm steht schon in der Vorschau (SVG, kein Nachladen); Regler-Standard = 14 Uhr
  await hoverAt(page, pt);
  const hover = popups(page).first();
  await expect(hover.locator("svg.pop-speed")).toHaveCount(1);
  await expect(hover.locator(".pop-speed-hit")).toHaveCount(24);
  await expect(hover.locator(".pop-speed-sel")).toHaveCount(1);
  await expect(hover.locator(".pop-speed-tick--sel")).toHaveText("14");
  await expect(hover.locator(".pop-pinhint")).toContainText("Klick fixiert");

  // Klick fixiert wie bei jedem anderen Layer (kein eigenes Chart-Fenster mehr)
  await page.mouse.click(pt.x, pt.y);
  const pinned = page.locator(".maplibregl-popup:has(.maplibregl-popup-close-button)");
  await expect(pinned.locator("svg.pop-speed")).toHaveCount(1);
  await expect(page.locator(".maplibregl-popup canvas")).toHaveCount(0);

  // Im fixierten Fenster zeigt eine Stunde ihren Wert im gemeinsamen Tooltip
  await pinned.locator('.pop-speed-hit[data-tip^="14 Uhr"]').hover();
  await expect(page.locator(".app-tooltip.is-visible")).toContainText(/^14 Uhr: (\d+ km\/h|keine Messung)$/);
  expectNoErrors(errors);
});

test("SVZ: Master + Unter-Haken schalten ihre Layer; SV-Modus schreibt Größen um und sperrt UBA", async ({ page }) => {
  const errors = await openMap(page);
  const LAYERS = ["svz-lines", "svz-points", "bast-points", "hvs"];
  expect(await vis(page, LAYERS)).toEqual(["absent", "absent", "absent", "absent"]); // lazy

  await page.click("#toggle-svz", { force: true });
  expect(await shown(page, "svz-children")).toBe(true);
  expect(await shown(page, "svz-legend")).toBe(true);
  // HTML-Defaults: Länder + BASt an, UBA aus
  expect(await vis(page, LAYERS)).toEqual(["visible", "visible", "visible", "none"]);

  await page.click("#toggle-hvs", { force: true });
  expect(await vis(page, ["hvs"])).toEqual(["visible"]);
  await page.click("#toggle-svz-bast", { force: true });
  expect(await vis(page, ["bast-points"])).toEqual(["none"]);

  const widthDtv = await page.evaluate(() => JSON.stringify(window.map.getPaintProperty("svz-lines", "line-width")));
  await page.click('input[name="svz-mode"][value="sv"]', { force: true });
  const widthSv = await page.evaluate(() => JSON.stringify(window.map.getPaintProperty("svz-lines", "line-width")));
  expect(widthSv).not.toBe(widthDtv);
  expect(widthSv).toContain("sv_anteil");
  // Größen-Legende wird aus den Karten-Schwellen erzeugt (Referenzwerte, keine Klassen)
  const labels = (mode) => page.evaluate((m) =>
    [...document.querySelectorAll(`#svz-legend .svz-scale[data-mode="${m}"] .svz-label`)].map((el) => el.textContent), mode);
  expect(await labels("dtv")).toEqual(["5.000", "15.000", "30.000", "≥ 50.000"]);
  expect(await labels("sv")).toEqual(["5 %", "10 %", "20 %", "≥ 30 %"]);
  // Legende: nur die SV-Rampe sichtbar (Chips schalten über .is-active + CSS)
  const ramps = await page.evaluate(() => [...document.querySelectorAll(".svz-ramp")]
    .map((el) => [el.dataset.mode, getComputedStyle(el).display]));
  expect(ramps).toContainEqual(["sv", "block"]);
  expect(ramps).toContainEqual(["dtv", "none"]);
  // UBA hat keinen SV-Anteil -> Layer aus, Haken gesperrt
  expect(await vis(page, ["hvs"])).toEqual(["none"]);
  expect(await page.evaluate(() => document.getElementById("toggle-hvs").disabled)).toBe(true);

  await page.click("#toggle-svz", { force: true }); // Master aus -> alles aus
  expect(await vis(page, LAYERS)).toEqual(["none", "none", "none", "none"]);
  expectNoErrors(errors);
});

test("Telraam: Auto/Rad-Umschalter tauscht Farb-Expression und Legenden-Rampe", async ({ page }) => {
  const errors = await openMap(page);
  await page.click("#toggle-telraam", { force: true });
  expect(await vis(page, ["telraam"])).toEqual(["visible"]);
  const color = () => page.evaluate(() => JSON.stringify(window.map.getPaintProperty("telraam", "line-color")));
  expect(await color()).toContain("bike_per_day");

  await page.click('input[name="telraam-mode"][value="car"]', { force: true });
  expect(await color()).toContain("car_per_day");
  // Berechnete Sichtbarkeit statt el.style: die Rampe schaltet über .is-active + CSS
  const ramps = await page.evaluate(() => [...document.querySelectorAll(".telraam-ramp")]
    .map((el) => [el.dataset.mode, getComputedStyle(el).display]));
  expect(ramps).toContainEqual(["car", "block"]);
  expect(ramps).toContainEqual(["bike", "none"]);
  expectNoErrors(errors);
});
