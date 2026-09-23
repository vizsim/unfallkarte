// Verkehrs-Layer mit Hook statt reinem Sichtbarkeits-Toggle (js/layers/traffic-*.js):
// Uber-Stunden-Regler + Chart-Klick, SVZ Master/Unter-Haken/Modus, Telraam-Modus.
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

test("Uber: Klick auf ein Segment öffnet das Tagesverlauf-Chart", async ({ page }) => {
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

  await hoverAt(page, pt);
  await expect(popups(page).first().locator(".pop-pinhint")).toContainText("Tagesverlauf");
  await page.mouse.click(pt.x, pt.y);
  await expect(page.locator(".maplibregl-popup canvas#speed-chart")).toHaveCount(1);
  // Chart.js hat gezeichnet = der Canvas trägt Pixel. (Früher prüfte der Test das globale
  // window.Chart; das lazy importierte ESM-Chart.js setzt keines mehr.)
  await expect.poll(() => page.evaluate(() => {
    const c = document.querySelector(".maplibregl-popup canvas#speed-chart");
    const px = c?.getContext("2d").getImageData(0, 0, c.width, c.height).data ?? [];
    for (let i = 3; i < px.length; i += 4) if (px[i]) return true;
    return false;
  }), { message: "chart.js hat nichts gezeichnet" }).toBe(true);
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
  const ramps = await page.evaluate(() => [...document.querySelectorAll(".telraam-ramp")]
    .map((el) => [el.dataset.mode, el.style.display]));
  expect(ramps).toContainEqual(["car", "block"]);
  expect(ramps).toContainEqual(["bike", "none"]);
  expectNoErrors(errors);
});
