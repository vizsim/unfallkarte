// Popup-Härtung: Feature-Attribute sind nutzergeneriert (OSM) und landen in innerHTML.
// Die Engine (js/ui/hoverPopup.js) escaped darum ALLE String-Properties per Default und
// sichert jeden Eintrags-Callback ab. Beides wird hier durch den echten Hover-Pfad geprüft —
// mit präparierten Features, die einen registrierten Layer ersetzen.
import { test, expect } from "@playwright/test";
import { openMap, jumpTo, replaceLayerWithPoint, waitForBusiestPoint, hoverAt, popups, expectNoErrors } from "./helpers.js";

const NORDSEE = [7.2, 54.7]; // leer: keine echten Features, die dazwischenfunken

test("HTML in Feature-Attributen wird escaped, nicht ausgeführt", async ({ page }) => {
  const errors = await openMap(page);
  await jumpTo(page, NORDSEE, 12);
  await replaceLayerWithPoint(page, "playgrounds-points", NORDSEE, {
    name: `<img src=x onerror="window.__xss=1"><b>fett</b>`,
    leisure: `"><script>window.__xss=2</script>`,
    operator: "Müller & Söhne <GmbH>",
  });

  const pt = await waitForBusiestPoint(page, ["playgrounds-points"]);
  await hoverAt(page, pt);
  const popup = popups(page).first();
  await expect(popup).toContainText("Spielplatz");

  // Als TEXT sichtbar …
  await expect(popup).toContainText(`<img src=x onerror="window.__xss=1"><b>fett</b>`);
  await expect(popup).toContainText("Müller & Söhne <GmbH>");
  // … aber nichts davon als Element im DOM und nichts ausgeführt
  await expect(popup.locator("img, script, b")).toHaveCount(0);
  expect(await page.evaluate(() => window.__xss)).toBeUndefined();

  // fixiert (anderer Codepfad: buildHTML pinned) gilt dasselbe
  await page.mouse.click(pt.x, pt.y);
  const pinned = popups(page).first();
  await expect(pinned.locator(".maplibregl-popup-close-button")).toHaveCount(1);
  await expect(pinned.locator("img, script, b")).toHaveCount(0);
  expect(await page.evaluate(() => window.__xss)).toBeUndefined();
  expectNoErrors(errors);
});

test("Link-hrefs: nur http(s), Attribut escaped", async ({ page }) => {
  const errors = await openMap(page);
  await jumpTo(page, NORDSEE, 12);
  // Sc6 baut den OSM-Link aus `oid` — ein Anführungszeichen darf nicht aus dem href ausbrechen
  await replaceLayerWithPoint(page, "scenario6-points", NORDSEE, { oid: `node/1" onmouseover="window.__xss=3` });

  const pt = await waitForBusiestPoint(page, ["scenario6-points"]);
  await hoverAt(page, pt);
  await page.mouse.click(pt.x, pt.y); // Sc6 fixiert (kein openOnClick) -> Link als Fußzeile
  const link = popups(page).first().locator(".pop-foot a");
  await expect(link).toHaveCount(1);
  expect(await link.getAttribute("href")).toBe(`https://www.openstreetmap.org/node/1" onmouseover="window.__xss=3`);
  expect(await link.getAttribute("onmouseover")).toBeNull();
  await link.hover();
  expect(await page.evaluate(() => window.__xss)).toBeUndefined();
  expectNoErrors(errors);
});

test("wirft ein render(), fehlt nur DIESE Karte — der Rest des Stapels bleibt", async ({ page }) => {
  // bewusst OHNE expectNoErrors: der Fehler SOLL geloggt werden (genau einmal)
  const errors = await openMap(page);
  await jumpTo(page, NORDSEE, 12);
  await replaceLayerWithPoint(page, "playgrounds-points", NORDSEE, { name: "Heiler Spielplatz" });
  await replaceLayerWithPoint(page, "uspeed-forward", NORDSEE, { speed_14: 30 });
  // uspeed.render liest den Stunden-Slider aus dem DOM -> ohne Element wirft es
  await page.evaluate(() => document.getElementById("uspeed-slider").remove());

  const pt = await waitForBusiestPoint(page, ["playgrounds-points", "uspeed-forward"], { min: 2 });
  await hoverAt(page, pt);
  const popup = popups(page).first();
  await expect(popup.locator(".pop-card")).toHaveCount(2);
  await expect(popup).toContainText("Heiler Spielplatz");
  await expect(popup).toContainText("Details nicht darstellbar");

  // weiterbewegen: Hover lebt weiter, Fehler wird nicht bei jedem mousemove neu geloggt
  await page.mouse.move(pt.x + 2, pt.y + 2, { steps: 4 });
  await page.mouse.move(pt.x - 2, pt.y - 1, { steps: 4 });
  await expect(popups(page)).toHaveCount(1);
  const renderErrors = errors.filter((e) => e.includes("[hoverPopup] uspeed.render"));
  expect(renderErrors).toHaveLength(1);
  expect(errors.filter((e) => !e.includes("[hoverPopup] uspeed.render"))).toEqual([]);
});
