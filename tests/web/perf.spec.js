// Ladeverhalten beim Start — die Zusicherungen, die sich sonst still zurückdrehen.
//
// Absichtlich KEINE Zeitmessung: Zeiten streuen auf CI-Runnern um Größenordnungen und
// machen den Test zur Flake-Quelle. Was hier steht, ist zählbar und deterministisch:
// welche Dateien werden geholt, und wie oft.
import { test, expect } from "@playwright/test";
import { openMap, expectNoErrors } from "./helpers.js";

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
  const accidentTiles = reqs.filter((r) => r.path.endsWith("accidents_single.pmtiles"));
  expect(accidentTiles.length, "keine Unfall-Tile-Anfrage vor dem Manifest").toBeGreaterThan(0);
});

test("Karte startet, ohne auf die Token-Konfig zu warten", async ({ page }) => {
  // config.js/config.public.js liefert einzig den Mapillary-Token, hing aber vor dem
  // Style-Fetch und dem Kartenkonstruktor. Gleiche Prüfung wie beim Manifest: künstlich
  // verzögern und schauen, ob die Karte trotzdem hochkommt.
  let configDone = false;
  await page.route(/js\/config\/config(\.public)?\.js/, async (route) => {
    await new Promise((r) => setTimeout(r, 5000));
    configDone = true;
    await route.continue();
  });

  await page.goto("/index.html");
  await page.waitForFunction(
    () => !!window.map?.getSource?.("accidents_single"),
    null, { timeout: 15_000 },
  );
  expect(configDone, "Konfig war schon durch — Verzögerung hat nicht gegriffen").toBe(false);
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
      .map((r) => r.path.split("/").pop()),
  )];
  const unexpected = loaded.filter(
    (f) => !["accidents_single.pmtiles", "combined_cluster.pmtiles"].includes(f),
  );
  expect(unexpected, `unerwartete PMTiles beim Start: ${unexpected.join(", ")}`).toEqual([]);
  expectNoErrors(errors);
});
