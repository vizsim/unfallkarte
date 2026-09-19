// Touch-Verhalten der Popups.
//
// Auf Touch gibt es kein Hover: der Finger sieht nie die Vorschau, die auf dem Desktop
// ankündigt, wohin ein Klick führt. `openOnClick`-Layer (Tempolimit, Übergänge, Telraam)
// rissen den Nutzer deshalb ungefragt nach OSM/Telraam — Antippen heißt dort aber
// „was ist das?", nicht „bring mich weg".
//
// Die Gegenprobe mit der Maus steht in smoke.spec.js („openOnClick: Klick … öffnet
// OpenStreetMap") und muss unverändert grün bleiben: auf Hybridgeräten soll die Maus
// weiter direkt öffnen.
import { test, expect } from "@playwright/test";
import { openMap, expectNoErrors, jumpTo, popups, toggleOn } from "./helpers.js";

const BERLIN = [13.405, 52.52];

test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

/** Bildschirmpunkt, an dem ein Tempolimit-Segment der oberste interaktive Treffer ist. */
const findMaxspeed = (page) => page.evaluate(() => {
  const m = window.map;
  const rect = m.getContainer().getBoundingClientRect();
  for (let x = 40; x < rect.width - 40; x += 6) {
    for (let y = 40; y < rect.height - 260; y += 6) {   // unten liegt das Legenden-Sheet
      const el = document.elementFromPoint(rect.left + x, rect.top + y);
      if (!el?.classList.contains("maplibregl-canvas")) continue;
      const top = m.queryRenderedFeatures([x, y])
        .find((f) => f.layer.id.startsWith("maxspeed") || f.layer.id === "accident-points");
      if (top?.layer.id.startsWith("maxspeed") && top.properties.osm_id) return { x: rect.left + x, y: rect.top + y };
    }
  }
  return null;
});

async function maxspeedPoint(page) {
  let pt = null;
  await expect
    .poll(async () => (pt = await findMaxspeed(page)), {
      message: "kein Tempolimit-Segment gefunden",
      timeout: 60_000,
      intervals: [500, 1000, 2000],
    })
    .not.toBeNull();
  return pt;
}

test("Tippen auf ein openOnClick-Objekt navigiert NICHT weg, sondern fixiert das Fenster", async ({ page, context }) => {
  // Falls doch navigiert würde, soll der Test das sehen statt OSM wirklich anzusurfen.
  await context.route(/openstreetmap\.org/, (r) => r.fulfill({ status: 200, contentType: "text/html", body: "ok" }));
  const errors = await openMap(page);
  await toggleOn(page, ["toggle-maxspeed"]);
  await jumpTo(page, BERLIN, 15);

  const pt = await maxspeedPoint(page);
  const opened = [];
  context.on("page", (p) => opened.push(p));

  await page.touchscreen.tap(pt.x, pt.y);

  // Fixiertes Fenster (erkennbar am Schließen-Knopf) statt neuem Tab.
  await expect(popups(page).locator(".maplibregl-popup-close-button")).toHaveCount(1);
  await page.waitForTimeout(500);
  expect(opened, "Tap hat einen neuen Tab geöffnet").toHaveLength(0);

  // Der Link ist nicht weg — er steht jetzt im Fenster und lässt sich bewusst antippen.
  const link = popups(page).locator(".pop-foot a");
  await expect(link).toHaveCount(1);
  await expect(link).toHaveAttribute("href", /openstreetmap\.org\/way\/\d+/);
  expectNoErrors(errors);
});

test("Synthetisches mousemove nach einer Berührung erzeugt keine Hover-Vorschau", async ({ page }) => {
  const errors = await openMap(page);
  await toggleOn(page, ["toggle-maxspeed"]);
  await jumpTo(page, BERLIN, 15);
  const pt = await maxspeedPoint(page);

  // Genau die Reihenfolge, die ein Browser auf Touch erzeugt: pointerdown (touch) und
  // danach ein synthetisches mousemove. Ohne die Guard in hoverPopup.js entsteht daraus
  // eine Vorschau, die der Tap im nächsten Moment ersetzt — ein Aufblitzen mit einem
  // Hinweistext, der ohne Zeigegerät keinen Sinn ergibt.
  //
  // Bewusst per dispatchEvent: Playwrights touchscreen.tap() macht down+up in einem und
  // lässt den Zwischenzustand nicht beobachten.
  const preview = await page.evaluate(([x, y]) => {
    const canvas = window.map.getCanvas();
    const at = { clientX: x, clientY: y, bubbles: true, cancelable: true };
    canvas.dispatchEvent(new PointerEvent("pointerdown", { ...at, pointerType: "touch", isPrimary: true }));
    canvas.dispatchEvent(new MouseEvent("mousemove", at));
    return document.querySelectorAll(".maplibregl-popup").length;
  }, [pt.x, pt.y]);
  expect(preview, "Hover-Vorschau trotz Touch-Eingabe").toBe(0);

  // Mit der Maus am selben Punkt MUSS die Vorschau dagegen kommen (Hybridgeräte!).
  const withMouse = await page.evaluate(([x, y]) => {
    const canvas = window.map.getCanvas();
    const at = { clientX: x, clientY: y, bubbles: true, cancelable: true };
    canvas.dispatchEvent(new PointerEvent("pointermove", { ...at, pointerType: "mouse", isPrimary: true }));
    canvas.dispatchEvent(new MouseEvent("mousemove", at));
    return document.querySelectorAll(".maplibregl-popup").length;
  }, [pt.x, pt.y]);
  expect(withMouse, "Maus bekommt keine Vorschau mehr").toBeGreaterThan(0);
  expectNoErrors(errors);
});

test("Unfallpunkt antippen zeigt die Details", async ({ page }) => {
  const errors = await openMap(page);
  await jumpTo(page, BERLIN, 15);

  const pt = await page.evaluate(() => {
    const m = window.map;
    const rect = m.getContainer().getBoundingClientRect();
    for (let x = 40; x < rect.width - 40; x += 8) {
      for (let y = 40; y < rect.height - 260; y += 8) {
        const el = document.elementFromPoint(rect.left + x, rect.top + y);
        if (!el?.classList.contains("maplibregl-canvas")) continue;
        if (m.queryRenderedFeatures([x, y], { layers: ["accident-points"] }).length) {
          return { x: rect.left + x, y: rect.top + y };
        }
      }
    }
    return null;
  });
  expect(pt, "kein Unfallpunkt im Bild").not.toBeNull();

  await page.touchscreen.tap(pt.x, pt.y);
  await expect(popups(page).first()).toBeVisible();
  await expect(popups(page).first().locator(".pop-eyebrow").first()).toContainText("Unfallatlas");
  expectNoErrors(errors);
});
