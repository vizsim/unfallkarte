// Frontend-Vertrag (CLAUDE.md): PMTiles-Dateinamen + interne Layer-Namen sind ein Vertrag
// zwischen Pipeline und Frontend. MapLibre prüft ihn NICHT: das pmtiles-Protokoll liefert
// kein vector_layers im TileJSON (vectorLayerIds = null) — ein umbenannter Layer oder ein
// fehlendes Attribut rendert lautlos einfach nichts.
//
// Dieser Test liest die Metadaten der echten PMTiles (lokal: frisch gebaute Tiles VOR dem
// Deploy; CI: Stand auf B2) und gleicht sie mit dem ab, was der Style tatsächlich benutzt.
// Erwartung wird automatisch aus dem Style abgeleitet -> keine zweite Liste, die driftet.
import { test, expect } from "@playwright/test";
import { openMap, jumpTo, toggleOn, expectNoErrors } from "./helpers.js";

test("Frontend-Vertrag: source-layer + benutzte Attribute existieren in den PMTiles", async ({ page }) => {
  await openMap(page);

  // Dynamische Filter in den Style holen: jeder Slider setzt per setFilter/setPaintProperty
  // Ausdrücke mit eigenen Attributnamen (Sc1/2/3/8/9-Schwellen, Uber-Stunde). Einmal
  // auslösen -> die Namen stehen im Style und werden unten mitgeprüft.
  await page.evaluate(() => {
    for (const el of document.querySelectorAll('input[type="range"]')) {
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
    }
  });

  const report = await page.evaluate(async () => {
    const style = window.map.getStyle();

    // Attributnamen aus Expressions (["get"|"has", name]) und Legacy-Filtern (["in", name, …])
    const LEGACY_OPS = new Set(["==", "!=", "<", ">", "<=", ">=", "in", "!in", "has", "!has"]);
    const fieldsOf = (node, out = new Set()) => {
      if (!Array.isArray(node)) return out;
      const [op, a] = node;
      if ((op === "get" || op === "has") && typeof a === "string" && node.length === 2) out.add(a);
      else if (LEGACY_OPS.has(op) && typeof a === "string" && !a.startsWith("$")) out.add(a);
      node.forEach((child) => fieldsOf(child, out));
      return out;
    };

    const out = [];
    for (const [id, src] of Object.entries(style.sources)) {
      if (src.type !== "vector" || !src.url?.startsWith("pmtiles://")) continue; // nur unsere PMTiles
      const url = new URL(src.url.slice("pmtiles://".length), document.baseURI).href;
      const layers = style.layers.filter((l) => l.source === id && l["source-layer"]);
      const entry = { id, url, problems: [] };
      try {
        const meta = await new pmtiles.PMTiles(url).getMetadata();
        const have = new Map((meta.vector_layers ?? []).map((v) => [v.id, new Set(Object.keys(v.fields ?? {}))]));
        for (const l of layers) {
          const fields = have.get(l["source-layer"]);
          if (!fields) {
            entry.problems.push(`Layer "${l.id}": source-layer "${l["source-layer"]}" fehlt (vorhanden: ${[...have.keys()].join(", ")})`);
            continue;
          }
          const used = fieldsOf([l.filter, l.paint, l.layout].map((x) => (x && typeof x === "object" && !Array.isArray(x) ? Object.values(x) : x)));
          for (const f of used) if (!fields.has(f)) entry.problems.push(`Layer "${l.id}": Attribut "${f}" fehlt in "${l["source-layer"]}"`);
        }
      } catch (err) {
        entry.problems.push(`Metadaten nicht lesbar: ${err}`);
      }
      out.push(entry);
    }
    return out;
  });

  // Plausibilität: es wurden wirklich (fast) alle Pipeline-Quellen geprüft
  expect(report.length, "zu wenige PMTiles-Quellen im Style gefunden").toBeGreaterThanOrEqual(20);
  const problems = report.flatMap((r) => r.problems.map((p) => `[${r.id}] ${p}\n    ${r.url}`));
  expect(problems, `Vertragsbrüche:\n${problems.join("\n")}`).toEqual([]);
});

test("Sc2-Slider filtert nach biped_count (blendete früher ALLES aus: Attribut hieß im Frontend biped_counts)", async ({ page }) => {
  const errors = await openMap(page);
  await toggleOn(page, ["toggle-scenario2"]);
  await jumpTo(page, [13.405, 52.52], 10.5); // Berlin, Punkt-Layer (z6–14)

  const count = () => page.evaluate(() =>
    new Set(window.map.queryRenderedFeatures({ layers: ["scenario2-points"] }).map((f) => f.properties.oid)).size);
  const setSlider = (v) => page.evaluate((v) => {
    const el = document.getElementById("scenario2-slider");
    el.value = String(v);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  }, v);

  let base = 0;
  await expect.poll(async () => (base = await count()), { message: "keine Sc2-Punkte gerendert", timeout: 60_000 }).toBeGreaterThan(5);

  await setSlider(5);
  let strict = -1;
  await expect.poll(async () => (strict = await count()), { timeout: 30_000 }).toBeLessThan(base); // filtert wirklich …
  expect(strict, "Slider blendet alles aus").toBeGreaterThan(0);                                   // … aber nicht alles
  const minShown = await page.evaluate(() =>
    Math.min(...window.map.queryRenderedFeatures({ layers: ["scenario2-points"] }).map((f) => Number(f.properties.biped_count))));
  expect(minShown).toBeGreaterThanOrEqual(5);

  await setSlider(3);
  await expect.poll(count, { timeout: 30_000 }).toBe(base); // zurück = alles wieder da
  expectNoErrors(errors);
});
