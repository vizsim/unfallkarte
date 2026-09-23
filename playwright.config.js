// Smoke-Tests für das Frontend (tests/web/). Getestet wird der BUILD, nicht der Dev-Server:
// webServer baut dist/ und liefert es mit `vite preview` aus — genau das Artefakt, das die CI
// danach deployt (getestet = ausgeliefert).
//
// Daten: Local-first + B2-Fallback wie im Betrieb — lokal kommen die PMTiles aus
// ./data (Symlink auf pipeline/data, per Middleware aus vite.config.js mit Range-Requests),
// in der CI per Fallback aus dem public B2-Bucket.
//
// Bewusst 127.0.0.1: Local-first probt nur auf localhost/127.0.0.1 (resolveSources.js), und
// "localhost" kann auf ::1 auflösen, während preview auf IPv4 lauscht.
import { defineConfig, devices } from "@playwright/test";

// Port überschreibbar, für zwei Läufe nebeneinander: PW_PORT=4174 npx playwright test
// reuseExistingServer ist AUS: ein schon laufender Server wurde sonst still übernommen — ein
// alter Build oder gar der Server einer anderen Sitzung (beides passiert). Belegter Port =
// klarer Fehler statt Tests gegen den falschen Stand.
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
    command: `npm run build && npx vite preview --host 127.0.0.1 --port ${PORT} --strictPort`,
    url: `${BASE_URL}/index.html`,
    reuseExistingServer: false,
    timeout: 60_000,
  },
});
