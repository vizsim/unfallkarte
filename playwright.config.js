// Smoke-Tests für das statische Frontend (tests/web/). Kein Build-Step: http-server
// liefert das Repo-Root aus (Range-Requests für PMTiles inklusive).
//
// Daten: Local-first + B2-Fallback wie im Betrieb — lokal kommen die PMTiles aus
// ./data (Symlink auf pipeline/data), in der CI per Fallback aus dem public B2-Bucket.
//
// Bewusst 127.0.0.1 statt localhost: main.js lädt auf "localhost" die gitignorte
// js/config/config.js — die gibt es in der CI nicht. 127.0.0.1 nimmt config.public.js.
import { defineConfig, devices } from "@playwright/test";

const PORT = 4173;
const BASE_URL = `http://127.0.0.1:${PORT}`;

export default defineConfig({
  testDir: "tests/web",
  timeout: 120_000,          // Tiles kommen in der CI aus B2 -> großzügig
  expect: { timeout: 30_000 },
  fullyParallel: false,      // ein Browser, eine Karte: WebGL + Tile-Last nicht vervielfachen
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  forbidOnly: !!process.env.CI,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: BASE_URL,
    viewport: { width: 1400, height: 900 },
    trace: "retain-on-failure",
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
