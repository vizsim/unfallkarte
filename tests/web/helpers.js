// Gemeinsame Helfer für die Frontend-Smoke-Tests.
import { expect } from "@playwright/test";

// Erwartetes Rauschen: Local-first probt ./data/<file> und fällt bei 404 auf B2 zurück —
// der Browser loggt jeden 404 als console.error. Alles andere ist ein echter Fehler.
const IGNORED_ERRORS = [/Failed to load resource/i];

/**
 * Seite öffnen und warten, bis die APP bereit ist. Liefert die gesammelten JS-Fehler (live).
 *
 * Bereit = <html data-app-ready> (gesetzt in permalink.js), NICHT map.loaded(): map.loaded()
 * kann schon wahr sein, bevor der Zustand aus dem Link auf Karte und Haken angewandt ist.
 * Historie: v1 schrieb ohne ?p= erst einen Default-Permalink und las ihn zwei Frames später
 * wieder ein — das setzte Center/Zoom + alle Checkboxen zurück, und auf langsamen CI-Runnern
 * lief ein Test davor los (erster CI-Lauf, Tempolimit-Test). Seit Permalink v2 entfällt dieser
 * Umweg (die URL wird nur noch GESCHRIEBEN, nie zurückgelesen); das Bereit-Signal bleibt
 * trotzdem die richtige Bedingung.
 *
 * PW_CPU_THROTTLE=6 npm run test:web  -> bremst die CPU (CDP), um solche Rennen lokal
 * nachzustellen; unser Entwicklungsrechner ist sonst zu schnell dafür.
 */
export async function openMap(page) {
  const errors = [];
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
  page.on("console", (m) => {
    if (m.type() === "error" && !IGNORED_ERRORS.some((re) => re.test(m.text()))) errors.push(m.text());
  });
  const throttle = Number(process.env.PW_CPU_THROTTLE);
  if (throttle > 1) {
    const cdp = await page.context().newCDPSession(page);
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: throttle });
  }
  await page.goto("/index.html");
  await page.waitForFunction(
    () => document.documentElement.dataset.appReady === "true" && window.map?.loaded?.(),
    null, { timeout: 90_000 },
  );
  return errors;
}

/**
 * Warten, bis die Karte ruht und die Tiles da sind. Bewusst billig — das heißt NICHT, dass
 * schon alles gezeichnet ist: die Cluster-Pies z. B. entstehen erst per Missing-Image-Resolver ->
 * addImage -> Re-Layout, da sind loaded()/areTilesLoaded() längst wahr (fiel unter
 * PW_CPU_THROTTLE auf). MapLibres "idle" wäre dafür korrekt, wartet aber auf ALLES (Basemap,
 * Terrain …) und verdreifacht die Laufzeit. Darum: Tests pollen gezielt auf IHRE Bedingung
 * (waitForBusiestPoint / expect.poll) statt auf globale Ruhe.
 */
export async function settle(page) {
  const calm = () => window.map.loaded() && window.map.areTilesLoaded() && !window.map.isMoving();
  await page.waitForFunction(calm, null, { timeout: 90_000 });
  await page.waitForTimeout(300);
  await page.waitForFunction(calm, null, { timeout: 90_000 });
}

export async function jumpTo(page, center, zoom) {
  await page.evaluate(([c, z]) => window.map.jumpTo({ center: c, zoom: z }), [center, zoom]);
  await settle(page);
  // Steht die Karte wirklich dort? Fängt alles ab, was die Ansicht nachträglich verstellt
  // (z. B. ein verspätetes applyPermalink) — mit klarer Meldung statt Folgefehlern.
  const view = await page.evaluate(() => ({ c: window.map.getCenter().toArray(), z: window.map.getZoom() }));
  expect(view.z, `Zoom nach jumpTo verstellt: ${JSON.stringify(view)}`).toBeCloseTo(zoom, 1);
  expect(Math.hypot(view.c[0] - center[0], view.c[1] - center[1]), `Center nach jumpTo verstellt: ${JSON.stringify(view)}`).toBeLessThan(1e-3);
}

/** Layer-/Szenario-Checkboxen einschalten (über echte Klicks -> gleiche Pfade wie im UI). */
export async function toggleOn(page, ids) {
  for (const id of ids) {
    await page.evaluate((tid) => {
      const cb = document.getElementById(tid);
      if (cb && !cb.checked) cb.click();
    }, id);
  }
}

/**
 * Bildschirmpunkt AUF DER KARTE (nicht unter Legende/Panels) mit den meisten
 * übereinanderliegenden Treffern. distinct=false zählt Layer, true zählt verschiedene
 * Features (für überlappende Flächen desselben Layers).
 */
export async function findBusiestPoint(page, layers, { distinct = false, step = 10 } = {}) {
  return page.evaluate(([layers, distinct, step]) => {
    const m = window.map;
    const existing = layers.filter((l) => m.getLayer(l));
    const rect = m.getContainer().getBoundingClientRect();
    let best = null;
    for (let x = 20; x < rect.width - 20; x += step) {
      for (let y = 20; y < rect.height - 20; y += step) {
        const el = document.elementFromPoint(rect.left + x, rect.top + y);
        if (!el?.classList.contains("maplibregl-canvas")) continue; // von UI verdeckt
        const feats = m.queryRenderedFeatures([x, y], { layers: existing });
        const n = new Set(feats.map((f) => (distinct ? JSON.stringify(f.properties) : f.layer.id))).size;
        if (!best || n > best.n) best = { x: rect.left + x, y: rect.top + y, n };
      }
    }
    return best;
  }, [layers, distinct, step]);
}

/**
 * findBusiestPoint wiederholen, bis mindestens `min` Treffer übereinanderliegen — wartet damit
 * genau auf das, was der Test braucht (Layer wirklich gerendert), egal wie langsam der Runner ist.
 */
export async function waitForBusiestPoint(page, layers, { min = 1, distinct = false, step = 10, message } = {}) {
  let best = null;
  await expect
    .poll(async () => {
      best = await findBusiestPoint(page, layers, { distinct, step });
      return best?.n ?? 0;
    }, { message: message ?? `keine Stelle mit >= ${min} Treffern in ${layers.join(", ")}`, timeout: 60_000, intervals: [500, 1000, 2000] })
    .toBeGreaterThanOrEqual(min);
  return best;
}

/** Maus von außerhalb auf den Punkt führen (löst echte mousemove-Events auf der Karte aus). */
export async function hoverAt(page, { x, y }) {
  await page.mouse.move(x + 120, y + 120);
  await page.mouse.move(x, y, { steps: 6 });
}

export const popups = (page) => page.locator(".maplibregl-popup");

export function expectNoErrors(errors) {
  expect(errors, `JS-Fehler im Browser:\n${errors.join("\n")}`).toEqual([]);
}

/**
 * Registrierten Layer durch einen Testpunkt mit frei wählbaren Properties ersetzen. Die
 * Popup-Registry hängt an der Layer-ID — so lassen sich präparierte Features (z. B. HTML im
 * Namen) durch den ECHTEN Hover-Pfad schicken, ohne dass die Tiles so etwas enthalten müssen.
 */
export async function replaceLayerWithPoint(page, layerId, lngLat, properties) {
  await page.evaluate(([layerId, lngLat, properties]) => {
    const m = window.map;
    const src = `test-src-${layerId}`;
    if (m.getLayer(layerId)) m.removeLayer(layerId);
    if (m.getSource(src)) m.removeSource(src);
    m.addSource(src, { type: "geojson", data: { type: "Feature", geometry: { type: "Point", coordinates: lngLat }, properties } });
    m.addLayer({ id: layerId, type: "circle", source: src, paint: { "circle-radius": 14, "circle-color": "#d0f" } });
  }, [layerId, lngLat, properties]);
}

/**
 * Alle Einträge der Layer-Registry anlegen (Quellen + Layer), OHNE sie einzuschalten. Die App
 * legt sie lazy beim ersten Einschalten an; Tests, die den kompletten Style brauchen (Golden,
 * Vertrag), holen das hiermit nach — über dasselbe Modul wie die App (gleiche Instanz).
 */
export async function ensureAllLayers(page) {
  await page.evaluate(async () => {
    const { LAYER_REGISTRY, ensureEntry } = await import("/js/layers/registry.js");
    for (const entry of LAYER_REGISTRY) ensureEntry(window.map, entry.id);
  });
}

/** Sichtbarkeit je Layer: "absent" (noch nicht angelegt) | "none" | "visible". */
export const layerVisibility = (page, ids) => page.evaluate((ids) =>
  ids.map((id) => (window.map.getLayer(id) ? window.map.getLayoutProperty(id, "visibility") ?? "visible" : "absent")), ids);
