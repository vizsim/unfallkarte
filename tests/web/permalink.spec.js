// Permalink-Roundtrip: Zustand einstellen -> URL kopieren -> neu laden -> derselbe Zustand.
// Hätte den Telraam/Radinfra-Bug gefangen (fehlten in kontextKeys: Link verlor die Layer).
import { test, expect } from "@playwright/test";
import { openMap, expectNoErrors } from "./helpers.js";

const snapshotState = (page) => page.evaluate(() => ({
  toggles: [...document.querySelectorAll('.legend input[type="checkbox"][id^="toggle-"]')]
    .filter((cb) => cb.checked).map((cb) => cb.id).sort(),
  visibleLayers: window.map.getStyle().layers
    .filter((l) => l.source && l.source !== "openmaptiles" && (l.layout?.visibility ?? "visible") === "visible")
    .map((l) => l.id).sort(),
  view: [window.map.getCenter().lng.toFixed(4), window.map.getCenter().lat.toFixed(4), window.map.getZoom().toFixed(1)],
}));

test("Permalink-Roundtrip: alle Kontext-Layer + Szenarien überleben Kopieren und Neuladen", async ({ page }) => {
  const errors = await openMap(page);

  // Alles einschalten, was die Legende an Layer-Toggles hat (Unter-Haken/Details ausgenommen:
  // die gehören bewusst nicht in den Link), dann wie ein Nutzer die Karte bewegen.
  const SKIP = new Set(["toggle-details", "toggle-svz-bast", "toggle-svz-laender", "toggle-hvs"]);
  await page.evaluate((skip) => {
    for (const cb of document.querySelectorAll('.legend input[type="checkbox"][id^="toggle-"]')) {
      if (!cb.checked && !skip.includes(cb.id)) cb.click();
    }
    window.map.jumpTo({ center: [13.405, 52.52], zoom: 12.5 });
  }, [...SKIP]);
  await expect.poll(() => page.evaluate(() => new URLSearchParams(location.search).get("p") ?? "")).toContain("13.40500");

  const before = await snapshotState(page);
  expect(before.toggles.length).toBeGreaterThan(15);
  const url = await page.evaluate(() => location.pathname + location.search);

  await page.goto("about:blank");
  await page.goto(url);
  await page.waitForFunction(() => document.documentElement.dataset.appReady === "true" && window.map?.loaded?.(), null, { timeout: 90_000 });
  // applyPermalink stellt Haken per Event wieder her; einen Frame Luft für nachlaufende Handler
  await expect.poll(async () => (await snapshotState(page)).toggles, { timeout: 15_000 }).toEqual(before.toggles);

  const after = await snapshotState(page);
  expect(after.view).toEqual(before.view);
  expect(after.visibleLayers).toEqual(before.visibleLayers);
  expectNoErrors(errors);
});

test("Toggle schreibt die URL sofort — nicht erst bei der nächsten Kartenbewegung", async ({ page }) => {
  const errors = await openMap(page);
  const tail = () => page.evaluate(() => (new URLSearchParams(location.search).get("p") ?? "").split(",").slice(5).join(","));
  expect(await tail()).toBe(",");

  await page.click("#toggle-telraam", { force: true });    // Registry-Eintrag
  expect(await tail()).toBe(",z");
  await page.click("#toggle-scenario9", { force: true });  // Szenario (eigener ?p=-Teil)
  expect(await tail()).toBe("sc9,z");
  await page.click("#toggle-svz", { force: true });        // Custom-Toggle (Master)
  await page.click("#toggle-hvs", { force: true });        // … und Unter-Haken
  expect((await tail()).split(",")[1].split("").sort().join("")).toBe("hvz");
  await page.click("#toggle-bikelanes", { force: true });  // außerhalb der Registry
  expect((await tail()).split(",")[1]).toContain("f");

  await page.click("#toggle-telraam", { force: true });    // aus -> wieder raus
  expect((await tail()).split(",")[1]).not.toContain("z");
  expectNoErrors(errors);
});
