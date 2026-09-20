// Smoke-Tests für das statische Frontend (tests/web/). Kein Build-Step: http-server
// liefert das Repo-Root aus (Range-Requests für PMTiles inklusive).
//
// Daten: Local-first + B2-Fallback wie im Betrieb — lokal kommen die PMTiles aus
// ./data (Symlink auf pipeline/data), in der CI per Fallback aus dem public B2-Bucket.
//
// Bewusst 127.0.0.1 statt localhost: main.js lädt auf "localhost" die gitignorte
// js/config/config.js — die gibt es in der CI nicht. 127.0.0.1 nimmt config.public.js.
import { defineConfig, devices } from "@playwright/test";

// Port überschreibbar: reuseExistingServer lässt zwei gleichzeitige Läufe auf derselben
// Maschine denselben Server teilen — wer zuerst fertig ist, reißt ihn dem anderen weg
// (ERR_CONNECTION_REFUSED mitten im Lauf). Zweiter Lauf daneben: PW_PORT=4174 npx playwright test
const PORT = Number(process.env.PW_PORT) || 4173;
const BASE_URL = `http://127.0.0.1:${PORT}`;

export default defineConfig({
  testDir: "tests/web",
  // Text-Snapshots (golden.spec.js) plattformunabhängig ablegen — sonst hängt Playwright
  // "-linux"/"-darwin" an und die CI findet die lokal erzeugte Referenz nicht.
  snapshotPathTemplate: "{testDir}/__snapshots__/{arg}{ext}",
  timeout: 120_000,          // Tiles kommen in der CI aus B2 -> großzügig
  expect: { timeout: 30_000 },
  // Parallel, weil gemessen: 43 Tests auf 8 Kernen (2026-09-20, --trace=off)
  //   1 Worker 223 s | 2 -> 118 s | 4 -> 94 s | 6 -> 92 s | 8 -> 95 s
  // Ab 4 ist Schluss: headless Chromium rendert WebGL per SwiftShader auf der CPU, mehr
  // Worker teilen nur dieselben Kerne. 9 Läufe (387 Ausführungen) ohne einen Flake.
  // Gewinn je nach Maschinenlast 1,7x bis 2,4x: seriell ist stabil (216/217/223 s), der
  // parallele Arm ist CPU-gebunden und reagiert auf Fremdlast (94 s ruhig, 117-134 s unter
  // Last). Verschränkt A/B gemessen, damit Cache-Wärme beide Arme gleich trifft.
  // undefined = Playwright-Default (halbe Kernzahl) -> passt sich der Maschine an.
  // CI (ubuntu-24.04, 4 vCPU, Tiles aus B2) bewusst vorsichtig auf 2 — dort nicht gemessen.
  fullyParallel: true,
  workers: process.env.CI ? 2 : undefined,
  retries: process.env.CI ? 1 : 0,
  forbidOnly: !!process.env.CI,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: BASE_URL,
    viewport: { width: 1400, height: 900 },
    // Tracing kostete gemessen ~13 % (107 s -> 93 s): "retain-on-failure" zeichnet JEDEN
    // Test auf und wirft die Aufnahme bei Grün wieder weg. CI behält den Trace beim Retry
    // (retries: 1), lokal gezielt anfordern: npx playwright test <datei> --trace=on
    trace: process.env.CI ? "on-first-retry" : "off",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"], viewport: { width: 1400, height: 900 } } }],
  webServer: {
    command: `npx http-server . -a 127.0.0.1 -p ${PORT} -c-1 --silent`,
    url: `${BASE_URL}/index.html`,
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
  },
});
