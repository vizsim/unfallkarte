// Aus der Layer-Registry erzeugte Legenden-Einträge (js/ui/legendMarkup.js).
// Golden deckt das VERHALTEN ab (Toggle -> Layer/Legende/Zoom-Hinweis); hier geht es darum,
// dass das erzeugte Markup dem entspricht, was die Registry sagt — also dass Beschriftung,
// Farbe und Zoomgrenze nicht wieder auseinanderlaufen können.
import { test, expect } from "@playwright/test";
import { openMap, expectNoErrors } from "./helpers.js";

/** Registry-Einträge mit `legend`-Feld — die Erwartung kommt aus derselben Quelle wie das Markup. */
const generated = (page) => page.evaluate(async () => {
  const { LAYER_REGISTRY } = await import("/js/layers/registry.js");
  return LAYER_REGISTRY.filter((e) => e.legend).map((e) => ({
    id: e.id, dataMinZoom: e.dataMinZoom ?? null, ...e.legend,
  }));
});

test("jeder erzeugte Eintrag steht vollständig im DOM", async ({ page }) => {
  const errors = await openMap(page);
  const entries = await generated(page);
  expect(entries.length, "keine Registry-Einträge mit legend-Feld").toBeGreaterThan(3);

  for (const entry of entries) {
    const actual = await page.evaluate((id) => {
      const cb = document.getElementById(`toggle-${id}`);
      const box = document.getElementById(`${id}-legend`);
      if (!cb || !box) return null;
      const icon = cb.closest("label")?.querySelector(".info-icon");
      return {
        label: cb.closest("label").textContent.replace(/\s+/g, " ").replace(/\s*i$/, "").trim(),
        boxClass: box.className,
        vintage: icon?.dataset.osmVintage ?? null,
        zoom: box.querySelector(".zoom-link")?.dataset.zoom ?? null,
        swatches: [...box.querySelectorAll(".mt-4 > div")].map((row) => ({
          text: row.textContent.trim(),
          shape: row.querySelector("span").className,
        })),
      };
    }, entry.id);

    expect(actual, `#toggle-${entry.id} / #${entry.id}-legend fehlt im DOM`).not.toBeNull();
    expect(actual.label, `Beschriftung von ${entry.id}`).toBe(entry.label);
    expect(actual.boxClass).toBe("ml-20 mt-6 fs-11");
    expect(actual.vintage).toBe(entry.vintage ?? null);
    expect(actual.zoom).toBe(entry.dataMinZoom == null ? null : String(entry.dataMinZoom));
    expect(actual.swatches.map((s) => s.text), `Farbflecken von ${entry.id}`)
      .toEqual((entry.swatches ?? []).map((s) => s.text));
  }
  expectNoErrors(errors);
});

test("keine Platzhalter übrig — jeder wurde ersetzt", async ({ page }) => {
  const errors = await openMap(page);
  // Ein stehen gebliebener Platzhalter hieße: Registry-Eintrag fehlt oder heißt anders.
  // renderLegendEntries wirft in dem Fall; der Test hält das als Zusicherung fest.
  expect(await page.locator("[data-legend-entry]").count()).toBe(0);
  expectNoErrors(errors);
});

test("Datenstand im Tooltip kommt aus dem Manifest, nicht aus dem Markup", async ({ page }) => {
  const errors = await openMap(page);
  // Im HTML stand früher ein hartkodiertes Datum, das beim OSM-Rebuild veraltete.
  const tip = await page.evaluate(() =>
    document.getElementById("toggle-schools").closest("label").querySelector(".info-icon").dataset.tip);
  expect(tip).toMatch(/^Quelle: © OpenStreetMap \(\d{2}\.\d{2}\.\d{4}\) – Lizenz: ODbL$/);
  expectNoErrors(errors);
});
