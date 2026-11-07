// Cluster-Ansicht wählbar (Chips im Cluster-Block, js/map/clusterView.js + clusterModes.js):
//   Schwere (Standard) → Torten; eine Beteiligung → Kreise aus cluster_modes.pmtiles
//   (Größe = Zahl der Unfälle mit ihr, Farbe = ihr Anteil). Die Quelle entsteht lazy.
import { test, expect } from "@playwright/test";
import { openMap, jumpTo, hoverAt, popups, waitForBusiestPoint, expectNoErrors } from "./helpers.js";
import { BET_BITS, FOCUS, TREND } from "../../js/map/clusterModes.js";

const PIES = ["pie-clusters-fine-layer", "pie-clusters-coarse-layer"];
const CIRCLES = ["cluster-modes-fine", "cluster-modes-coarse"];
const BERLIN = [13.4, 52.51];

const vis = (page, ids) => page.evaluate((ids) =>
  ids.map((id) => (window.map.getLayer(id) ? window.map.getLayoutProperty(id, "visibility") : "fehlt")), ids);
const legendView = (page) => page.evaluate(() => document.getElementById("cluster-legend-section").dataset.view);
const chip = (page, value) => page.locator(`label.legend-chip:has(input[name="cluster-focus"][value="${value}"])`);

test("Chip Fahrrad: Kreise statt Torten, Quelle erst dann, Punkte nach Beteiligung; zurück zu Schwere", async ({ page }) => {
  // Nur echte Abrufe zählen: lokal probt die App jede Manifest-Datei per HEAD (local-first),
  // deployt nicht — geladen werden darf beim Start nichts.
  const requests = [];
  page.on("request", (r) => { if (r.method() !== "HEAD") requests.push(r.url()); });
  const errors = await openMap(page);
  await jumpTo(page, BERLIN, 9);

  expect(await page.evaluate(() => !!window.map.getSource("accidents-cluster-modes")), "Quelle beim Start").toBe(false);
  expect(requests.some((u) => u.includes("cluster_modes.pmtiles")), "Start lädt cluster_modes.pmtiles").toBe(false);
  expect(await vis(page, PIES)).toEqual(["visible", "visible"]);
  expect(await legendView(page)).toBe("pie");

  await chip(page, "IstRad").click();
  await expect.poll(() => vis(page, CIRCLES)).toEqual(["visible", "visible"]);
  expect(await vis(page, PIES)).toEqual(["none", "none"]);
  await waitForBusiestPoint(page, CIRCLES, { step: 12, message: "keine Kreis-Cluster gerendert" });
  expect(await legendView(page)).toBe("share");
  // Farbe = Anteil in den Blautönen der Rad-Punkte
  const color = await page.evaluate(() => window.map.getPaintProperty("cluster-modes-fine", "circle-color"));
  expect(color[0]).toBe("step");
  expect(color).toContain(FOCUS.IstRad.colors[0]);
  await expect(page.locator(".cluster-share-key li")).toHaveCount(5);
  await expect(page.locator(".cluster-share-avg")).toContainText("Ø Deutschland 31");
  // Einzelpunkte färben jetzt nach Beteiligung, und der Link trägt die Ansicht
  expect(await page.locator('input[name="color-style"][value="BETEILIGUNG"]').isChecked()).toBe(true);
  await expect.poll(() => page.evaluate(() => new URLSearchParams(location.search).get("cl"))).toBe("1");

  await chip(page, "UKATEGORIE").click();
  await expect.poll(() => vis(page, PIES)).toEqual(["visible", "visible"]);
  expect(await vis(page, CIRCLES)).toEqual(["none", "none"]);
  expect(await legendView(page)).toBe("pie");
  await expect.poll(() => page.evaluate(() => new URLSearchParams(location.search).get("cl"))).toBe(null);
  expectNoErrors(errors);
});

test("Kreis-Popup: Unfälle mit der Beteiligung, Anteil, Bundesschnitt und alle Beteiligten", async ({ page }) => {
  const errors = await openMap(page);
  await jumpTo(page, BERLIN, 10);
  await chip(page, "IstRad").click();
  const pt = await waitForBusiestPoint(page, CIRCLES, { step: 12 });
  await hoverAt(page, pt);
  await expect(popups(page).first()).toContainText("mit Radbeteiligung");
  await expect(popups(page).first()).toContainText("Ø Deutschland");
  await expect(popups(page).first()).toContainText("Mehrfachnennung");
  expect(await vis(page, ["hover-ring", "hover-pie"])).toEqual(["visible", "none"]);
  expectNoErrors(errors);
});

test("Link stellt die Ansicht wieder her (ohne die Punktfarbe zu überschreiben); Cluster aus blendet alles aus", async ({ page }) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
  await page.goto("/index.html?v=2&map=9.00/52.51000/13.40000&cl=3");
  await page.waitForFunction(() => document.documentElement.dataset.appReady === "true" && window.map?.loaded?.(), null, { timeout: 90_000 });

  await expect.poll(() => vis(page, CIRCLES)).toEqual(["visible", "visible"]);
  expect(await page.locator('input[name="cluster-focus"][value="IstFuss"]').isChecked()).toBe(true);
  // Die Einfärbung der Punkte steht (nicht) im Link — sie bleibt, wie der Link sie will
  expect(await page.locator('input[name="color-style"][value="UKATEGORIE"]').isChecked()).toBe(true);
  expect(await page.evaluate(() => window.map.getPaintProperty("cluster-modes-fine", "circle-color"))).toContain(FOCUS.IstFuss.colors[4]);

  await page.evaluate(() => {
    const cb = document.querySelector('input.section-checkbox[data-section="cluster"]');
    cb.checked = false;
    cb.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await expect.poll(() => vis(page, [...CIRCLES, ...PIES])).toEqual(["none", "none", "none", "none"]);
  expect(errors).toEqual([]);
});

test("Vertrag cluster_modes.pmtiles: Layer + Felder, und die Bundesschnitte stimmen mit den Kacheln", async ({ page }) => {
  const errors = await openMap(page);
  await jumpTo(page, [10.4, 51.1], 6);   // ganz Deutschland im Bild: z6-Kacheln decken alles ab
  await chip(page, "IstRad").click();
  await waitForBusiestPoint(page, CIRCLES, { step: 20 });

  const report = await page.evaluate(async (bits) => {
    const m = window.map;
    const src = m.getStyle().sources["accidents-cluster-modes"];
    const url = new URL(src.url.slice("pmtiles://".length), document.baseURI).href;
    const meta = await new window.__app.PMTiles(url).getMetadata();
    const layers = Object.fromEntries((meta.vector_layers ?? []).map((v) => [v.id, Object.keys(v.fields ?? {})]));
    // Bundesschnitt aus den Kacheln: alle z6-Cluster (ungefiltert, ohne Doppelte an Kachelrändern)
    const seen = new Set();
    let total = 0;
    const withBit = Object.fromEntries(bits.map((b) => [b, 0]));
    for (const f of m.querySourceFeatures("accidents-cluster-modes", { sourceLayer: "clusters_6_8" })) {
      const key = JSON.stringify([f.geometry.coordinates, f.properties]);
      if (seen.has(key)) continue;
      seen.add(key);
      const p = f.properties;
      total += ["UKATEGORIE__1", "UKATEGORIE__2", "UKATEGORIE__3"].reduce((n, k) => n + (Number(p[k]) || 0), 0);
      for (const [k, v] of Object.entries(p)) {
        if (!k.startsWith("BET__")) continue;
        const mask = Number(k.slice(5));
        bits.forEach((b, i) => { if (mask & (1 << i)) withBit[b] += Number(v) || 0; });
      }
    }
    return { layers, total, withBit };
  }, BET_BITS);

  for (const layer of ["clusters_6_8", "clusters_9_11"]) {
    const fields = new Set(report.layers[layer] ?? []);
    for (const f of ["UKATEGORIE__1", "UKATEGORIE__2", "UKATEGORIE__3"]) expect(fields.has(f), `${layer}: ${f}`).toBe(true);
    // Beteiligung dünn besetzt: nur vorkommende Kombinationen — jede eine gültige Bitmaske
    const masks = [...fields].filter((f) => f.startsWith("BET__")).map((f) => Number(f.slice(5)));
    expect(masks.every((mk) => Number.isInteger(mk) && mk > 0 && mk < 2 ** BET_BITS.length)).toBe(true);
    // jede wählbare Beteiligung steckt in mindestens einer Kombination (Fuß z. B. nie allein,
    // immer mit einem weiteren Beteiligten — BET__4 gibt es darum nicht, BET__6 schon)
    for (const focus of Object.keys(FOCUS)) {
      const bit = 1 << BET_BITS.indexOf(focus);
      expect(masks.some((mk) => mk & bit), `${layer}: keine Kombination mit ${focus}`).toBe(true);
    }
  }
  // Die Stufen hängen am Bundesschnitt in clusterModes.js — nach einem Daten-Update nachziehen,
  // wenn er mehr als 2 Prozentpunkte abweicht.
  expect(report.total, "z6 deckt ganz Deutschland ab").toBeGreaterThan(2_000_000);
  for (const [focus, { avg }] of Object.entries(FOCUS)) {
    const actual = report.withBit[focus] / report.total;
    expect(Math.abs(actual - avg), `${focus}: Kacheln ${(actual * 100).toFixed(1)} %, clusterModes.js ${avg * 100} %`).toBeLessThan(0.02);
  }
  expectNoErrors(errors);
});

test("Chip Trend: Kreise mit Deckkraft je Sicherheit, Legende, Popup mit Jahresbalken; Bundestrend stimmt", async ({ page }) => {
  const errors = await openMap(page);
  await jumpTo(page, [10.4, 51.1], 6);
  await chip(page, "TREND").click();
  await expect.poll(() => vis(page, CIRCLES)).toEqual(["visible", "visible"]);
  await waitForBusiestPoint(page, CIRCLES, { step: 20 });
  expect(await page.evaluate(() => window.map.getPaintProperty("cluster-modes-coarse", "circle-opacity")[0])).toBe("case");
  await expect(page.locator(".cluster-share-title")).toContainText("Richtung 2024/25");
  await expect(page.locator(".cluster-share-key li")).toHaveCount(3);
  await expect(page.locator(".cluster-share-key li").first().locator(".cluster-legend-dot")).toHaveCount(2); // kräftig + blass
  await expect.poll(() => page.evaluate(() => new URLSearchParams(location.search).get("cl"))).toBe("t");
  // Einzelpunkte behalten ihre Einfärbung (nur eine Beteiligung schaltet sie um)
  expect(await page.locator('input[name="color-style"][value="UKATEGORIE"]').isChecked()).toBe(true);

  // Bundestrend aus allen z6-Clustern (ohne Doppelte an Kachelrändern) = TREND.national
  const national = await page.evaluate(({ early, late }) => {
    const seen = new Set();
    let e = 0, l = 0;
    for (const f of window.map.querySourceFeatures("accidents-cluster-modes", { sourceLayer: "clusters_6_8" })) {
      const key = JSON.stringify([f.geometry.coordinates, f.properties]);
      if (seen.has(key)) continue;
      seen.add(key);
      for (const y of early) e += Number(f.properties[`UJAHR__${y}`]) || 0;
      for (const y of late) l += Number(f.properties[`UJAHR__${y}`]) || 0;
    }
    return (l - e) / e;
  }, { early: TREND.early, late: TREND.late });
  expect(Math.abs(national - TREND.national), `Kacheln ${(national * 100).toFixed(1)} %, clusterModes.js ${TREND.national * 100} %`).toBeLessThan(0.01);

  await jumpTo(page, BERLIN, 9);
  const pt = await waitForBusiestPoint(page, CIRCLES, { step: 12 });
  await hoverAt(page, pt);
  await expect(popups(page).first().locator(".pop-trend-col")).toHaveCount(9);
  await expect(popups(page).first()).toContainText("2024/25 ggü. 2022/23");
  expectNoErrors(errors);
});
