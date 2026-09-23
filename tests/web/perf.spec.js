// Ladeverhalten beim Start — die Zusicherungen, die sich sonst still zurückdrehen.
//
// Absichtlich KEINE Zeitmessung: Zeiten streuen auf CI-Runnern um Größenordnungen und
// machen den Test zur Flake-Quelle. Was hier steht, ist zählbar und deterministisch:
// welche Dateien werden geholt, und wie oft.
import { test, expect } from "@playwright/test";
import { openMap, expectNoErrors } from "./helpers.js";
// Dateinamen der Unfall-Quellen aus DERSELBEN Konstante wie die App (browserlos importierbar,
// siehe tests/unit/accidentSources.test.js) — ein Format-/Namenswechsel (MVT -> MLT) bricht
// diese Tests so nicht still.
import { ACCIDENT_SOURCES } from "../../js/mapdata/resolveSources.js";

const fileName = (path) => path.split("/").pop();
const ACCIDENT_FILES = Object.values(ACCIDENT_SOURCES).map((s) => fileName(s.file));

/** Anfragen der Seite mitschreiben (Methode mit, damit HEAD-Proben unterscheidbar bleiben). */
function recordRequests(page) {
  const reqs = [];
  page.on("request", (r) => reqs.push({ method: r.method(), path: new URL(r.url()).pathname }));
  return reqs;
}

test("style.json wird genau EINMAL geholt (Preload passt auf den fetch)", async ({ page }) => {
  const reqs = recordRequests(page);
  const errors = await openMap(page);

  // Der <link rel="preload" as="fetch"> im Head startet den Style, bevor main.js überhaupt
  // geparst ist. Er greift aber nur, wenn er zur späteren Anfrage PASST — und das hängt am
  // CORS-Modus, nicht an der Herkunft: as="fetch" ohne `crossorigin` lädt no-cors, fetch()
  // benutzt per Default mode:"cors". Fehlt das Attribut, holt der Browser die Datei ein
  // zweites Mal (gemessen), und der Preload macht die Sache schlechter statt besser.
  const style = reqs.filter((r) => r.path.endsWith("/style.json"));
  expect(style, `style.json-Anfragen: ${JSON.stringify(style)}`).toHaveLength(1);
  expectNoErrors(errors);
});

test("Unfall-Quellen warten nicht auf das Manifest", async ({ page }) => {
  // Die Zusicherung verhaltensbasiert prüfen statt über Zeitstempel: das Manifest wird
  // künstlich um 5 s verzögert. Hingen die Unfall-Quellen daran, käme in der Zeit keine
  // einzige Kachel. Ihre URL steht ohne Manifest fest (ACCIDENT_SOURCES), also müssen die
  // Tiles fliegen, während das Manifest noch unterwegs ist.
  let manifestDone = false;
  await page.route(/manifest\.json/, async (route) => {
    await new Promise((r) => setTimeout(r, 5000));
    manifestDone = true;
    await route.continue();
  });

  const reqs = recordRequests(page);
  await page.goto("/index.html");
  await page.waitForFunction(
    () => !!window.map?.getSource?.("accidents_single"),
    null, { timeout: 15_000 },
  );

  expect(manifestDone, "Manifest war schon durch — Verzögerung hat nicht gegriffen").toBe(false);
  const single = fileName(ACCIDENT_SOURCES.accidents_single.file);
  const accidentTiles = reqs.filter((r) => r.path.endsWith(single));
  expect(accidentTiles.length, "keine Unfall-Tile-Anfrage vor dem Manifest").toBeGreaterThan(0);
});

test("MapLibre ungebündelt: Worker und Hauptthread teilen sich -shared.mjs", async ({ page }) => {
  // MapLibre sucht seinen Worker zur Laufzeit neben der eigenen Datei (import.meta.url).
  // Gebündelt fände er ihn nicht (Karte leer, OHNE Fehler), mit setWorkerUrl lüde der Worker
  // -shared unter eigener URL ein zweites Mal (+121 KB gzip, Spike in docs/VITE_MIGRATION.md).
  // Darum bleibt MapLibre extern (vite.config.js). Hält das fest: alle drei Dateien kommen
  // aus EINEM versionierten Ordner, und -shared läuft über genau EINE URL (die zweite Anfrage
  // — die des Workers — ist dann ein Cache-Treffer). Worker-Anfragen sieht nur der Kontext.
  const urls = [];
  page.context().on("request", (r) => {
    if (/maplibre-gl/.test(r.url())) urls.push(new URL(r.url()).pathname);
  });
  const errors = await openMap(page);

  const dirs = new Set(urls.map((u) => u.slice(0, u.lastIndexOf("/"))));
  expect([...dirs], `MapLibre-Anfragen: ${JSON.stringify(urls)}`).toEqual([expect.stringMatching(/\/lib\/maplibre-gl@\d+\.\d+\.\d+$/)]);
  expect(urls.some((u) => u.endsWith("/maplibre-gl-worker.mjs")), "Worker nicht aus dem lib-Ordner geladen").toBe(true);
  expect(new Set(urls.filter((u) => u.endsWith("-shared.mjs"))).size).toBe(1);
  expectNoErrors(errors);
});

test("keine eigene Datei fehlt beim Start", async ({ page, baseURL }) => {
  // Fängt, was beim Build still verloren gehen kann: eine Datei, die zur Laufzeit per URL
  // geholt wird und darum in public/ liegen muss (style.json, Sprite, Legenden-Icons), oder
  // ein Verweis, den Vite nicht umgeschrieben hat. Ausgenommen: die Local-first-Probe nach
  // ./data/ — dort IST der 404 der Normalfall, sobald eine Datei nicht lokal liegt (CI).
  const failed = [];
  const origin = new URL(baseURL).origin;
  page.on("response", (r) => {
    const url = new URL(r.url());
    if (url.origin === origin && r.status() >= 400 && !url.pathname.includes("/data/")) {
      failed.push(`${r.status()} ${url.pathname}`);
    }
  });
  const errors = await openMap(page);
  expect(failed).toEqual([]);
  expectNoErrors(errors);
});

test("fehlender Kartenstil zeigt ein Banner statt einer weißen Seite", async ({ page }) => {
  // Der Style-Fetch lief ohne catch: ein Ausfall landete in einer unbehandelten Promise,
  // initMap brach ab, die Seite blieb weiß — obwohl errorBanner.js genau dafür existiert.
  await page.route(/\/style\.json/, (route) => route.fulfill({ status: 503, body: "" }));
  await page.goto("/index.html");
  await expect(page.locator(".error-banner")).toBeVisible({ timeout: 15_000 });
  await expect(page.locator(".error-banner-text")).toContainText(/Kartenstil/);
});

test("keine sinnlosen 404-Proben im Start-Wasserfall", async ({ page }) => {
  // Der Testserver läuft auf 127.0.0.1 = Entwicklungszweig, da IST eine lokale Probe
  // richtig. Geprüft wird deshalb, was auch dort gelten muss: jede Datei höchstens EINMAL
  // proben. `resolveAccidentSources()` und `resolveSources()` fassen beide die zwei
  // Unfall-Dateien an — ohne Memoisierung wären das vier Proben statt zwei.
  const probes = [];
  page.on("request", (r) => {
    if (r.method() !== "HEAD" && !/manifest\.json/.test(r.url())) return;
    probes.push(new URL(r.url()).pathname);
  });
  const errors = await openMap(page);

  const doubled = [...new Set(probes)].filter((p) => probes.filter((x) => x === p).length > 1);
  expect(doubled, `mehrfach geprobt: ${doubled.join(", ")}`).toEqual([]);
  expectNoErrors(errors);
});

test("Start lädt nur die Unfall-Tiles, keine Kontext-Layer", async ({ page }) => {
  const reqs = recordRequests(page);
  const errors = await openMap(page);

  // Gegenstück zu lazy.spec.js, eine Ebene tiefer: dort wird geprüft, dass keine QUELLE
  // registriert ist — hier, dass auch wirklich keine Bytes fließen. Eine versehentlich
  // eager angelegte Quelle fällt sonst erst im Netzwerk-Panel auf.
  //
  // Nur GET zählt: liegt lokal ein data/-Baum (Entwicklungsrechner, nicht CI), probt
  // resolveSources.js jede Manifest-Datei per HEAD auf Existenz. Die überträgt keine
  // Kachel-Bytes und gehört nicht in diese Zusicherung.
  const loaded = [...new Set(
    reqs.filter((r) => r.method === "GET" && r.path.endsWith(".pmtiles"))
      .map((r) => fileName(r.path)),
  )];
  const unexpected = loaded.filter((f) => !ACCIDENT_FILES.includes(f));
  expect(unexpected, `unerwartete PMTiles beim Start: ${unexpected.join(", ")}`).toEqual([]);
  expectNoErrors(errors);
});
