// Permalink-Roundtrip DURCH die App: Zustand einstellen -> URL kopieren -> neu laden ->
// derselbe Zustand. Hätte den Telraam/Radinfra-Bug gefangen (fehlten in kontextKeys: Link
// verlor die Layer). Das Format selbst prüft browserlos tests/unit/permalinkFormat.test.js.
import { test, expect } from "@playwright/test";
import { openMap, expectNoErrors } from "./helpers.js";

const snapshotState = (page) => page.evaluate(() => ({
  toggles: [...document.querySelectorAll('.legend input[type="checkbox"][id^="toggle-"]')]
    .filter((cb) => cb.checked).map((cb) => cb.id).sort(),
  visibleLayers: window.map.getStyle().layers
    .filter((l) => l.source && l.source !== "openmaptiles" && (l.layout?.visibility ?? "visible") === "visible")
    .map((l) => l.id).sort(),
  view: [window.map.getCenter().lng.toFixed(4), window.map.getCenter().lat.toFixed(4), window.map.getZoom().toFixed(1)],
  // Regler + Modi — in v1 fehlten die im Link komplett.
  controls: {
    sc9: document.getElementById("scenario9-slider")?.value,
    sc9rule: document.getElementById("scenario9-rule")?.value,
    uhr: document.getElementById("uspeed-slider")?.value,
    svz: document.querySelector('input[name="svz-mode"]:checked')?.value,
    telraam: document.querySelector('input[name="telraam-mode"]:checked')?.value,
    population: document.querySelector('input[name="population-mode"]:checked')?.value,
    laerm: document.querySelector('input[name="laerm-mode"]:checked')?.value,
  },
}));

const param = (page, name) => page.evaluate((n) => new URLSearchParams(location.search).get(n), name);

test("Permalink-Roundtrip: alle Kontext-Layer, Szenarien und Regler überleben Kopieren und Neuladen", async ({ page }) => {
  const errors = await openMap(page);

  // Alles einschalten, was die Legende an Layer-Toggles hat (Unter-Haken/Details ausgenommen:
  // die gehören bewusst nicht in den Link), Regler verstellen, dann die Karte bewegen.
  const SKIP = new Set(["toggle-details", "toggle-svz-bast", "toggle-svz-laender", "toggle-hvs"]);
  await page.evaluate((skip) => {
    for (const cb of document.querySelectorAll('.legend input[type="checkbox"][id^="toggle-"]')) {
      if (!cb.checked && !skip.includes(cb.id)) cb.click();
    }
    const set = (id, value, type = "input") => {
      const el = document.getElementById(id);
      el.value = value;
      el.dispatchEvent(new Event(type, { bubbles: true }));
    };
    set("scenario9-slider", "7");
    set("scenario9-rule", "usp3_3y", "change");
    set("uspeed-slider", "8");
    for (const [name, value] of [["svz-mode", "sv"], ["telraam-mode", "car"], ["population-mode", "a65"], ["laerm-mode", "night"]]) {
      const radio = document.querySelector(`input[name="${name}"][value="${value}"]`);
      radio.checked = true;
      radio.dispatchEvent(new Event("change", { bubbles: true }));
    }
    window.map.jumpTo({ center: [13.405, 52.52], zoom: 12.5 });
  }, [...SKIP]);
  await expect.poll(() => param(page, "map")).toContain("13.40500");

  const before = await snapshotState(page);
  expect(before.toggles.length).toBeGreaterThan(15);
  expect(before.controls).toEqual({ sc9: "7", sc9rule: "usp3_3y", uhr: "8", svz: "sv", telraam: "car", population: "a65", laerm: "night" });
  const url = await page.evaluate(() => location.pathname + location.search);

  await page.goto("about:blank");
  await page.goto(url);
  await page.waitForFunction(() => document.documentElement.dataset.appReady === "true" && window.map?.loaded?.(), null, { timeout: 90_000 });
  await expect.poll(async () => (await snapshotState(page)).toggles, { timeout: 15_000 }).toEqual(before.toggles);

  const after = await snapshotState(page);
  expect(after.view).toEqual(before.view);
  expect(after.visibleLayers).toEqual(before.visibleLayers);
  expect(after.controls).toEqual(before.controls);
  expectNoErrors(errors);
});

test("Startansicht schreibt einen kurzen Link — nur was vom Default abweicht", async ({ page }) => {
  const errors = await openMap(page);

  // Ohne Zutun: Version + Ansicht, sonst nichts. Alle Filter stehen auf Default und gehören
  // darum NICHT in den Link (v1 schrieb sie immer aus: 112 statt 32 Zeichen).
  await expect.poll(() => page.evaluate(() => location.search)).toMatch(/^\?v=2&map=[\d.]+\/[\d.]+\/[\d.]+$/);

  await page.click("#toggle-telraam", { force: true });    // Registry-Eintrag
  expect(await param(page, "l")).toBe("z");
  await page.click("#toggle-scenario9", { force: true });  // Szenario (eigener Parameter)
  expect(await param(page, "n")).toBe("9");
  await page.click("#toggle-svz", { force: true });        // Custom-Toggle (Master)
  await page.click("#toggle-hvs", { force: true });        // … und Unter-Haken
  expect((await param(page, "l")).split("").sort().join("")).toBe("hvz");
  await page.click("#toggle-bikelanes", { force: true });  // außerhalb der Registry
  expect(await param(page, "l")).toContain("f");

  await page.click("#toggle-telraam", { force: true });    // aus -> wieder raus
  expect(await param(page, "l")).not.toContain("z");

  // Eine abweichende Filter-Dimension taucht als eigener Parameter auf, die anderen nicht.
  await page.click('.legend input[data-group="UKATEGORIE"][value="3"]', { force: true });
  expect(await param(page, "uk")).toBe("1_2");
  expect(await param(page, "art")).toBe(null);
  expectNoErrors(errors);
});

test("alter ?p=-Link wird gelesen und auf v2 hochgeschrieben", async ({ page }) => {
  const errors = await openMap(page);
  // Kontext-Zeichen c = Übergänge, z = Telraam; Szenario sc9. Geografisch: Berlin.
  await page.goto("/index.html?p=52.52000,13.40500,12.50,U,1_2_3|1_2_3_4_5_6|17_18_19_20_21_22_23_24_25|1_2_3_4_5_6_7|1_2_3_4_5_6_7_8_9_0,sc9,cz");
  await page.waitForFunction(() => document.documentElement.dataset.appReady === "true" && window.map?.loaded?.(), null, { timeout: 90_000 });

  // Zustand da …
  const state = await snapshotState(page);
  expect(state.toggles).toEqual(expect.arrayContaining(["toggle-crossings", "toggle-telraam", "toggle-scenario9"]));
  expect(state.view).toEqual(["13.4050", "52.5200", "12.5"]);

  // … und die URL steht jetzt im neuen Format (kein ?p= mehr).
  expect(await page.evaluate(() => location.search)).toMatch(/^\?v=2&map=12\.50\/52\.52000\/13\.40500&l=cz&n=9$/);
  expectNoErrors(errors);
});

test("Alter Link mit Lärm (Nacht) als eigenem Layer (l=r) -> Lärm-Layer im Modus Nacht", async ({ page }) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
  await page.goto("/index.html?v=2&map=12.00/52.52000/13.40500&l=r");
  await page.waitForFunction(() => document.documentElement.dataset.appReady === "true" && window.map?.loaded?.(), null, { timeout: 90_000 });

  const state = await page.evaluate(() => ({
    on: document.getElementById("toggle-laerm1").checked,
    mode: document.querySelector('input[name="laerm-mode"]:checked')?.value,
    visible: ["laerm1", "laerm2"].map((id) => window.map.getLayer(id) ? window.map.getLayoutProperty(id, "visibility") : "absent"),
    scale: [...document.querySelectorAll("#laerm1-legend .legend-mode.is-active")].map((el) => el.dataset.mode),
  }));
  expect(state).toEqual({ on: true, mode: "night", visible: ["none", "visible"], scale: ["night"] });
  // … und hochgeschrieben auf das neue Kürzel + Modus
  expect(await param(page, "l")).toBe("l");
  expect(await param(page, "o")).toBe("lm:night");
  expectNoErrors(errors);
});
