// Smoke-Tests: lädt die Karte wirklich, und tun Hover/Klick das Richtige?
//
// Auslöser: das MapLibre-Upgrade 5.6 -> 5.24 brach den Cluster-Hover zwei Monate lang
// stumm (setData klont per Structured-Clone; rohe MapGeoJSONFeature sind nicht klonbar).
// Diese Tests fahren die Seite im echten Browser und schlagen bei JS-Fehlern an —
// vor jedem Vendor-Upgrade und in der CI.
//
// Datentolerant: Tests suchen sich ihre Stellen selbst (kein festes Pixel, keine feste
// Feature-ID), weil Szenarien/OSM-Stände sich mit jedem Pipeline-Lauf ändern.
import { test, expect } from "@playwright/test";
import { openMap, settle, jumpTo, toggleOn, waitForBusiestPoint, hoverAt, popups, expectNoErrors } from "./helpers.js";

const CLUSTER_LAYERS = ["pie-clusters-coarse-layer", "pie-clusters-fine-layer"];
const BERLIN = [13.405, 52.52];
const ADLERSHOF = [13.5492, 52.4346]; // Schulgelände mit Sc2 + Sc6 + OSM-Schule übereinander (Issue #30)
const RUDOWER_CHAUSSEE = [13.535, 52.43]; // überlappende Sc9-Unfallhäufungen (Issue #31)
const ALEXANDERPLATZ = [13.4125, 52.5219]; // Bus, Straßenbahn und S-/U-Bahn an einem Platz

test("Karte lädt ohne JS-Fehler, Kernquellen sind da", async ({ page }) => {
  const errors = await openMap(page);
  await settle(page);

  const state = await page.evaluate(() => ({
    sources: ["accidents-cluster", "hover-point"].map((id) => !!window.map.getSource(id)),
    layers: ["accident-points", "pie-clusters-coarse-layer", "hover-pie"].map((id) => !!window.map.getLayer(id)),
    banner: !!document.querySelector(".error-banner:not([hidden])"),
  }));
  expect(state.sources).toEqual([true, true]);
  expect(state.layers).toEqual([true, true, true]);
  expect(state.banner, "Manifest-Fehlerbanner sichtbar").toBe(false);
  expectNoErrors(errors);
});

test("Cluster-Hover: vergrößertes Pie + genau ein Popup, Aufräumen beim Verlassen", async ({ page }) => {
  const errors = await openMap(page);
  await jumpTo(page, BERLIN, 8);

  const pt = await waitForBusiestPoint(page, CLUSTER_LAYERS, { step: 8, message: "kein Cluster im Viewport gerendert" });

  await hoverAt(page, pt);
  await expect(popups(page)).toHaveCount(1);
  await expect(popups(page)).toContainText("Unfälle nach Schwere");
  // hover-pie = vergrößertes Pie über dem gehoverten Cluster (der Regressionsfall)
  await expect
    .poll(() => page.evaluate(() => window.map.queryRenderedFeatures({ layers: ["hover-pie"] }).length))
    .toBe(1);
  expect(await page.evaluate(() => window.map.getCanvas().style.cursor)).toBe("pointer");

  // Nordsee: nichts unter dem Cursor -> alles weg
  await jumpTo(page, [7.2, 54.7], 8);
  await page.mouse.move(700, 450, { steps: 4 });
  await expect(popups(page)).toHaveCount(0);
  expect(await page.evaluate(() => window.map.queryRenderedFeatures({ layers: ["hover-pie"] }).length)).toBe(0);
  expect(await page.evaluate(() => window.map.getCanvas().style.cursor)).toBe("");
  expectNoErrors(errors);
});

test("#30: überlappende Objekte -> EIN gestapeltes Popup; Klick fixiert, Klick ins Leere schließt", async ({ page }) => {
  const errors = await openMap(page);
  await toggleOn(page, ["toggle-scenario2", "toggle-scenario6", "toggle-schools", "toggle-playgrounds"]);
  await jumpTo(page, ADLERSHOF, 17);

  const layers = ["scenario2-polys", "scenario6-polys", "schools-polygons", "playgrounds-polygons"];
  const pt = await waitForBusiestPoint(page, layers, { min: 2, message: "keine Stelle mit >= 2 überlappenden Layern gefunden" });

  await hoverAt(page, pt);
  await expect(popups(page)).toHaveCount(1); // der Kern von #30: nie mehrere Popups
  const hover = popups(page).first();
  await expect(hover.locator(".pop-multi")).toContainText("Objekte an diesem Punkt");
  const hoverCards = await hover.locator(".pop-card").count();
  expect(hoverCards).toBeGreaterThanOrEqual(2);
  expect(await hover.locator(".pop-card--scenario").count()).toBeGreaterThanOrEqual(1);
  await expect(hover.locator(".maplibregl-popup-close-button")).toHaveCount(0);

  // Klick fixiert: Schließen-Button, ALLE Karten (Hover kappt bei 3), keine zweite Vorschau daneben
  await page.mouse.click(pt.x, pt.y);
  await expect(popups(page)).toHaveCount(1);
  const pinned = popups(page).first();
  await expect(pinned.locator(".maplibregl-popup-close-button")).toHaveCount(1);
  expect(await pinned.locator(".pop-card").count()).toBeGreaterThanOrEqual(Math.max(hoverCards, pt.n));
  await expect(pinned.locator(".pop-pinhint")).toHaveCount(0);

  // Klick ins Leere schließt das fixierte Fenster. "Leer" = die App selbst zeigt dort
  // keinen Pointer (kein registrierter Layer unter dem Cursor).
  let empty = null;
  for (const [x, y] of [[60, 60], [700, 60], [60, 450], [60, 840], [700, 840], [400, 200], [1000, 700]]) {
    const onCanvas = await page.evaluate(([x, y]) => document.elementFromPoint(x, y)?.classList.contains("maplibregl-canvas"), [x, y]);
    if (!onCanvas) continue;
    await page.mouse.move(x, y, { steps: 3 });
    if ((await page.evaluate(() => window.map.getCanvas().style.cursor)) === "") { empty = { x, y }; break; }
  }
  test.skip(!empty, "keine leere Kartenstelle im Viewport");
  await page.mouse.click(empty.x, empty.y);
  await expect(popups(page)).toHaveCount(0);
  expectNoErrors(errors);
});

test("#31: überlappende Flächen DESSELBEN Szenarios werden alle gezeigt", async ({ page }) => {
  const errors = await openMap(page);
  await toggleOn(page, ["toggle-scenario9"]);
  await jumpTo(page, RUDOWER_CHAUSSEE, 15.5);

  const pt = await waitForBusiestPoint(page, ["scenario9-polys"], {
    min: 2, distinct: true, message: "keine überlappenden Sc9-Flächen gefunden (Datenstand geändert?)",
  });

  await hoverAt(page, pt);
  await expect(popups(page)).toHaveCount(1);
  const mUko = popups(page).first().locator(".pop-card--scenario .pop-eyebrow", { hasText: "M-Uko" });
  expect(await mUko.count()).toBeGreaterThanOrEqual(2);
  expectNoErrors(errors);
});

test("Sweep: alle Kontext-Layer + Szenarien an, Raster abfahren -> Popups, keine Fehler", async ({ page }) => {
  const errors = await openMap(page);
  await toggleOn(page, [
    "toggle-schools", "toggle-playgrounds", "toggle-health", "toggle-crossings", "toggle-platforms", "toggle-population",
    "toggle-maxspeed",
    "toggle-laerm1", "toggle-laerm2", "toggle-hvs", "toggle-svz", "toggle-telraam", "toggle-obs",
    "toggle-movebis", "toggle-uspeed", "toggle-scenario1", "toggle-scenario2", "toggle-scenario3",
    "toggle-scenario6", "toggle-scenario8", "toggle-scenario9",
  ]);
  await jumpTo(page, BERLIN, 15);
  await waitForBusiestPoint(page, ["accident-points"], { step: 20, message: "keine Unfallpunkte gerendert" });

  const eyebrows = new Set();
  let seen = 0;
  for (let y = 80; y < 860; y += 70) {
    for (let x = 80; x < 1360; x += 90) {
      await page.mouse.move(x, y);
      const labels = await page.evaluate(() => {
        const all = document.querySelectorAll(".maplibregl-popup");
        if (all.length > 1) throw new Error(`${all.length} Popups gleichzeitig`);
        return all.length ? [...all[0].querySelectorAll(".pop-eyebrow")].map((e) => e.textContent) : null;
      });
      if (labels) { seen += 1; labels.forEach((l) => eyebrows.add(l)); }
    }
  }
  expect(seen, "kein einziges Popup im Raster").toBeGreaterThan(5);
  // In Berlin-Mitte müssen mindestens Unfälle und OSM-Kontext auftauchen
  expect([...eyebrows].some((l) => l.startsWith("Unfallatlas"))).toBe(true);
  expect([...eyebrows].some((l) => l.startsWith("Kontext"))).toBe(true);
  expectNoErrors(errors);
});

test("openOnClick: Klick auf ein Tempolimit-Segment öffnet OpenStreetMap statt zu fixieren", async ({ page, context }) => {
  // OSM nicht wirklich ansurfen — nur prüfen, WOHIN der Klick führt
  await context.route(/openstreetmap\.org/, (r) => r.fulfill({ status: 200, contentType: "text/html", body: "ok" }));
  const errors = await openMap(page);
  await toggleOn(page, ["toggle-maxspeed"]);
  await jumpTo(page, BERLIN, 15);

  const findMaxspeed = () => page.evaluate(() => {
    const m = window.map;
    const rect = m.getContainer().getBoundingClientRect();
    for (let x = 60; x < rect.width - 60; x += 6) for (let y = 60; y < rect.height - 60; y += 6) {
      const el = document.elementFromPoint(rect.left + x, rect.top + y);
      if (!el?.classList.contains("maplibregl-canvas")) continue;
      // oberster interaktiver Treffer muss ein Tempolimit sein (sonst gewinnt z. B. ein Unfallpunkt den Klick)
      const top = m.queryRenderedFeatures([x, y]).find((f) => f.layer.id.startsWith("maxspeed") || f.layer.id === "accident-points");
      if (top?.layer.id.startsWith("maxspeed") && top.properties.osm_id) return { x: rect.left + x, y: rect.top + y };
    }
    return null;
  });
  let pt = null;
  await expect
    .poll(async () => (pt = await findMaxspeed()), { message: "kein Tempolimit-Segment gefunden", timeout: 60_000, intervals: [500, 1000, 2000] })
    .not.toBeNull();

  await hoverAt(page, pt);
  await expect(popups(page).first().locator(".pop-pinhint")).toContainText("Klick öffnet OpenStreetMap");
  const [osmTab] = await Promise.all([context.waitForEvent("page"), page.mouse.click(pt.x, pt.y)]);
  expect(osmTab.url()).toMatch(/openstreetmap\.org\/way\/\d+/);
  await osmTab.close();
  await expect(popups(page).locator(".maplibregl-popup-close-button")).toHaveCount(0); // nicht fixiert
  expectNoErrors(errors);
});

test("ÖPNV-Haltestellen: Bus, Straßenbahn und Bahn rendern, Popup nennt das Verkehrsmittel", async ({ page }) => {
  const errors = await openMap(page);
  await toggleOn(page, ["toggle-platforms"]);
  await jumpTo(page, ALEXANDERPLATZ, 16);

  const layers = ["platforms-points", "platforms-lines", "platforms-polygons"];
  const pt = await waitForBusiestPoint(page, layers, { message: "keine Haltestelle gerendert" });

  // Alle drei Verkehrsmittel am Platz; Bahnsteige sind Ways (Linie/Fläche), Bushalte Nodes
  const props = await page.evaluate((layers) =>
    window.map.queryRenderedFeatures({ layers }).map((f) => ({ ...f.properties, layer: f.layer.id })), layers);
  expect(props.some((p) => p.tram === "yes"), "keine Straßenbahn-Haltestelle").toBe(true);
  expect(props.some((p) => p.highway === "bus_stop"), "keine Bushaltestelle").toBe(true);
  expect(props.some((p) => p.railway === "platform" && p.tram !== "yes" && p.layer !== "platforms-points"),
    "kein Bahnsteig als Linie/Fläche").toBe(true);

  await hoverAt(page, pt);
  await expect(popups(page)).toHaveCount(1);
  await expect(popups(page).first()).toContainText("Haltestelle");
  await expect(popups(page).first()).toContainText("Verkehrsmittel");
  expectNoErrors(errors);
});

test("Bevölkerung (Zensus): Zellen rendern ab z11, Popup nennt Einwohner", async ({ page }) => {
  const errors = await openMap(page);
  await toggleOn(page, ["toggle-population"]);
  await jumpTo(page, BERLIN, 14);

  const pt = await waitForBusiestPoint(page, ["population-cells"], { message: "keine Zensus-Zelle gerendert" });
  // Einwohner liegt in den Kacheln teils als String -> to-number muss greifen, sonst alles Klasse 1
  const maxEw = await page.evaluate(() =>
    Math.max(...window.map.queryRenderedFeatures({ layers: ["population-cells"] }).map((f) => Number(f.properties.Einwohner))));
  expect(maxEw, "Berlin-Mitte ohne dichte Zelle (>= 100 EW/ha)?").toBeGreaterThanOrEqual(100);

  // Nur der Zensus-Layer, sonst gewinnt am Punkt womöglich ein Unfall
  await page.evaluate(() => { const cb = document.querySelector('.section-checkbox[data-section="einzeln"]'); if (cb.checked) cb.click(); });
  await hoverAt(page, pt);
  await expect(popups(page)).toHaveCount(1);
  await expect(popups(page).first()).toContainText("Bevölkerung");
  await expect(popups(page).first()).toContainText("Einwohner");
  expectNoErrors(errors);
});
