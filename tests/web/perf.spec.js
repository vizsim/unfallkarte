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
