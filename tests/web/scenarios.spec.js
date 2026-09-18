// Szenario-Regler (js/ui/setupEntryControls.js): Schwellen-Slider + Sc9-Kriterium setzen den
// Filter auf Flächen UND Punkte; beim Wiedereinschalten gilt der angezeigte Wert weiter.
import { test, expect } from "@playwright/test";
import { openMap, layerVisibility, expectNoErrors } from "./helpers.js";

const filters = (page, n) => page.evaluate((n) =>
  [`scenario${n}-polys`, `scenario${n}-points`].map((id) => window.map.getFilter(id)), n);
const setSlider = (page, id, v) => page.evaluate(([id, v]) => {
  const el = document.getElementById(id);
  el.value = String(v);
  el.dispatchEvent(new Event("input", { bubbles: true }));
}, [id, v]);
const shown = (page, id) => page.evaluate((id) => document.getElementById(id).offsetParent !== null, id);

for (const { n, field } of [{ n: 1, field: "cluster_size" }, { n: 2, field: "biped_count" }, { n: 8, field: "max_laerm_num" }]) {
  test(`Sc${n}: Regler filtert ${field}, Wert überlebt Aus-/Einschalten`, async ({ page }) => {
    const errors = await openMap(page);
    const container = `scenario${n}-slider-container`;
    expect(await shown(page, container)).toBe(false);

    await page.click(`#toggle-scenario${n}`, { force: true });
    expect(await shown(page, container)).toBe(true);

    const max = await page.evaluate((n) => Number(document.getElementById(`scenario${n}-slider`).max), n);
    const v = max - 1;
    await setSlider(page, `scenario${n}-slider`, v);
    const expected = [">=", ["to-number", ["get", field]], v];
    expect(await filters(page, n)).toEqual([expected, expected]);
    await expect(page.locator(`#scenario${n}-slider-value`)).toHaveText(String(v));

    await page.click(`#toggle-scenario${n}`, { force: true }); // aus
    expect(await shown(page, container)).toBe(false);
    await page.click(`#toggle-scenario${n}`, { force: true }); // wieder an: Filter = angezeigter Wert
    expect(await filters(page, n)).toEqual([expected, expected]);
    expectNoErrors(errors);
  });
}

test("Sc9: Regler + Kriterium ergeben einen kombinierten Filter", async ({ page }) => {
  const errors = await openMap(page);
  await page.click("#toggle-scenario9", { force: true });
  expect(await shown(page, "scenario9-controls")).toBe(true);

  await setSlider(page, "scenario9-slider", 5);
  const minOnly = ["all", [">=", ["to-number", ["get", "n_max"]], 5]];
  expect(await filters(page, 9)).toEqual([minOnly, minOnly]);

  const rule = await page.evaluate(() => {
    const sel = document.getElementById("scenario9-rule");
    const opt = [...sel.options].find((o) => o.value !== "all");
    sel.value = opt.value;
    sel.dispatchEvent(new Event("change", { bubbles: true }));
    return opt.value;
  });
  const both = ["all", [">=", ["to-number", ["get", "n_max"]], 5], ["==", ["get", "rule"], rule]];
  expect(await filters(page, 9)).toEqual([both, both]);
  expectNoErrors(errors);
});

test("Sc6: Toggle schaltet auch die rot umrandeten Tempo-50-Abschnitte (scenario6-polys2)", async ({ page }) => {
  const errors = await openMap(page);
  const vis = () => layerVisibility(page, ["scenario6-polys", "scenario6-points", "scenario6-polys2"]);
  expect(await vis()).toEqual(["absent", "absent", "absent"]); // lazy: entsteht erst beim Einschalten
  await page.click("#toggle-scenario6", { force: true });
  expect(await vis()).toEqual(["visible", "visible", "visible"]);
  expectNoErrors(errors);
});
