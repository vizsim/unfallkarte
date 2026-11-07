// Torten-Bilder der Cluster bleiben begrenzt (js/utils/generatePieIcon.js).
//
// MapLibre gibt Bilder, die die App per addImage hinzufügt, nie wieder frei, und baut jede
// Kachel neu auf, die ein neu hinzugekommenes Bild benutzt. Hieß jede Torte nach ihren exakten
// Zahlen, wuchs beides mit jeder Ansicht: auf genau dieser Tour (z6 → z7 → Ruhrgebiet z8)
// 2.718 Bilder / 164 MB, beim nächsten Sprung brach die Messung ab. Mit Namen aus Anteilen in
// ganzen Prozent sind es rund 380 Bilder, die sich wiederholen — die Grenze unten fängt einen
// Rückfall sicher ab und lässt Luft für neue Daten.
import { test, expect } from "@playwright/test";
import { openMap, jumpTo, expectNoErrors } from "./helpers.js";

const LAYERS = ["pie-clusters-coarse-layer", "pie-clusters-fine-layer"];
const TOUR = [
  [[10.4, 51.1], 6],   // Deutschland
  [[10.4, 51.1], 7],
  [[7.2, 51.5], 8],    // Ruhrgebiet
];

test("Torten-Bilder: begrenzte, wiederverwendbare Menge über eine Zoom-Tour", async ({ page }) => {
  test.setTimeout(180_000);
  const errors = await openMap(page);

  let shown = 0;
  for (const [center, zoom] of TOUR) {
    await jumpTo(page, center, zoom);
    shown += await page.evaluate((layers) =>
      window.map.queryRenderedFeatures({ layers: layers.filter((l) => window.map.getLayer(l)) }).length, LAYERS);
  }
  const pies = await page.evaluate(() => window.map.listImages().filter((id) => id.startsWith("pie-")));

  expect(shown, "die Tour zeigt Cluster").toBeGreaterThan(800);
  expect(pies.every((id) => /^pie-(32|48|64)-\d{1,3}-\d{1,3}$/.test(id)), pies.slice(0, 5).join(", ")).toBe(true);
  expect(pies.length, `${pies.length} Torten-Bilder für ${shown} gezeigte Cluster`).toBeLessThan(1_000);
  expectNoErrors(errors);
});
