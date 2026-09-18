// Lazy-Sources: beim Start werden nur die Unfall-Quellen registriert; Quellen + Layer eines
// Registry-Eintrags entstehen beim ersten Einschalten — an derselben Stelle der
// Zeichenreihenfolge, egal in welcher Reihenfolge eingeschaltet wird.
import { test, expect } from "@playwright/test";
import { openMap, layerVisibility, expectNoErrors } from "./helpers.js";

const ourSources = (page) => page.evaluate(() =>
  Object.entries(window.map.getStyle().sources).filter(([, s]) => s.url?.startsWith("pmtiles://")).map(([id]) => id).sort());

test("Start: nur die Unfall-Quellen sind registriert; Einschalten legt Quelle + Layer an", async ({ page }) => {
  const errors = await openMap(page);
  expect(await ourSources(page)).toEqual(["accidents-cluster", "accidents_single"]);
  expect(await layerVisibility(page, ["playgrounds-points", "maxspeed", "scenario9-polys"])).toEqual(["absent", "absent", "absent"]);

  await page.click("#toggle-playgrounds", { force: true });
  expect(await ourSources(page)).toEqual(["accidents-cluster", "accidents_single", "playgrounds"]);
  expect(await layerVisibility(page, ["playgrounds-points", "playgrounds-polygons"])).toEqual(["visible", "visible"]);

  // aus + wieder an: nichts doppelt, nichts verschwindet
  await page.click("#toggle-playgrounds", { force: true });
  expect(await layerVisibility(page, ["playgrounds-points"])).toEqual(["none"]);
  await page.click("#toggle-playgrounds", { force: true });
  expect(await layerVisibility(page, ["playgrounds-points"])).toEqual(["visible"]);
  expectNoErrors(errors);
});

test("Zeichenreihenfolge hängt nicht von der Einschalt-Reihenfolge ab", async ({ browser }) => {
  const orderAfter = async (reverse) => {
    const page = await browser.newPage();
    const errors = await openMap(page);
    const order = await page.evaluate(async (reverse) => {
      const { LAYER_REGISTRY, ensureEntry } = await import("/js/layers/registry.js");
      const ids = LAYER_REGISTRY.map((e) => e.id);
      if (reverse) ids.reverse();
      // ineinander verschränkt statt am Stück: erst jede zweite, dann den Rest
      for (const id of [...ids.filter((_, i) => i % 2), ...ids.filter((_, i) => !(i % 2))]) ensureEntry(window.map, id);
      return window.map.getLayersOrder();
    }, reverse);
    expectNoErrors(errors);
    await page.close();
    return order;
  };
  const a = await orderAfter(false);
  const b = await orderAfter(true);
  expect(a.length).toBeGreaterThan(100);
  expect(b).toEqual(a);
});
