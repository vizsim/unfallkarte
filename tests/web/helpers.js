// Gemeinsame Helfer für die Frontend-Smoke-Tests.
import { expect } from "@playwright/test";

// Erwartetes Rauschen: Local-first probt ./data/<file> und fällt bei 404 auf B2 zurück —
// der Browser loggt jeden 404 als console.error. Alles andere ist ein echter Fehler.
const IGNORED_ERRORS = [/Failed to load resource/i];

/** Seite öffnen, auf die geladene Karte warten. Liefert die gesammelten JS-Fehler (live). */
export async function openMap(page) {
  const errors = [];
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
  page.on("console", (m) => {
    if (m.type() === "error" && !IGNORED_ERRORS.some((re) => re.test(m.text()))) errors.push(m.text());
  });
  await page.goto("/index.html");
  await page.waitForFunction(() => window.map?.loaded?.(), null, { timeout: 90_000 });
  return errors;
}

/** Warten, bis die Karte ruht UND alle Tiles da sind (statt fester Timeouts). */
export async function settle(page) {
  const idle = () => window.map.loaded() && window.map.areTilesLoaded() && !window.map.isMoving();
  await page.waitForFunction(idle, null, { timeout: 90_000 });
  await page.waitForTimeout(400); // Symbol-Placement läuft nach dem letzten Tile noch einen Frame nach
  await page.waitForFunction(idle, null, { timeout: 90_000 });
}

export async function jumpTo(page, center, zoom) {
  await page.evaluate(([c, z]) => window.map.jumpTo({ center: c, zoom: z }), [center, zoom]);
  await settle(page);
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

/** Maus von außerhalb auf den Punkt führen (löst echte mousemove-Events auf der Karte aus). */
export async function hoverAt(page, { x, y }) {
  await page.mouse.move(x + 120, y + 120);
  await page.mouse.move(x, y, { steps: 6 });
}

export const popups = (page) => page.locator(".maplibregl-popup");

export function expectNoErrors(errors) {
  expect(errors, `JS-Fehler im Browser:\n${errors.join("\n")}`).toEqual([]);
}
