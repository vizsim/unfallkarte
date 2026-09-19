// Frontend-Vertrag (CLAUDE.md): PMTiles-Dateinamen + interne Layer-Namen sind ein Vertrag
// zwischen Pipeline und Frontend. MapLibre prüft ihn NICHT: das pmtiles-Protokoll liefert
// kein vector_layers im TileJSON (vectorLayerIds = null) — ein umbenannter Layer oder ein
// fehlendes Attribut rendert lautlos einfach nichts.
//
// Dieser Test liest die Metadaten der echten PMTiles (lokal: frisch gebaute Tiles VOR dem
// Deploy; CI: Stand auf B2) und gleicht sie mit dem ab, was der Style tatsächlich benutzt.
// Erwartung wird automatisch aus dem Style abgeleitet -> keine zweite Liste, die driftet.
import { test, expect } from "@playwright/test";
import { openMap, jumpTo, toggleOn, ensureAllLayers, expectNoErrors } from "./helpers.js";

test("Frontend-Vertrag: source-layer + benutzte Attribute existieren in den PMTiles", async ({ page }) => {
  await openMap(page);
  await ensureAllLayers(page); // Layer entstehen sonst erst beim Einschalten

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

// Bekannte Lücken: Popup liest ein Attribut, das (noch) nicht in den Tiles steht -> die Zeile
// erscheint nie. Jede Ausnahme braucht einen Grund; sobald die Tiles das Feld liefern, schlägt
// der Test an ("Ausnahme überflüssig") und der Eintrag fliegt raus. Siehe docs/TODO.md.
const KNOWN_POPUP_GAPS = {
  // health/playgrounds: `operator` + `playground` fehlten bis zum OSM-Rebuild am 2026-09-19
  // (osmconf-Fix 187c78a). Ausnahmen entfernt, die Popup-Zeilen "Träger"/"Ausstattung" leben.
  scenario6: {
    name: "Sc6-Tiles tragen nur oid + Tempo-50-Länge (Pipeline-TODO „Sc6-Tiles ohne Namen“)",
    amenity: "dito",
  },
  svz: { sv_anteil: "kein Bug: nur der Linien-Layer hat sv_anteil, die Punkt-Layer liefern dtv_sv (Fallback im Popup)" },
};

test("Frontend-Vertrag: Attribute, die die Popups lesen, existieren in den PMTiles", async ({ page }) => {
  await openMap(page);
  await ensureAllLayers(page);

  const report = await page.evaluate(async (known) => {
    const { allPopupEntries } = await import("/js/ui/popupHandlers.js");
    const style = window.map.getStyle();
    const metaCache = new Map();
    const fieldsOfLayer = async (layerId) => {
      const l = style.layers.find((x) => x.id === layerId);
      const src = l && style.sources[l.source];
      if (!src?.url?.startsWith("pmtiles://")) return null; // Laufzeit-/Fremdquellen (hover-point, Mapillary)
      const url = new URL(src.url.slice("pmtiles://".length), document.baseURI).href;
      if (!metaCache.has(url)) metaCache.set(url, new pmtiles.PMTiles(url).getMetadata());
      const vl = ((await metaCache.get(url)).vector_layers ?? []).find((v) => v.id === l["source-layer"]);
      return vl ? new Set(Object.keys(vl.fields ?? {})) : null;
    };

    const problems = [];
    const gapsSeen = new Set(); // "eintrag.feld", das in mind. einem Layer wirklich fehlt
    let checked = 0;
    for (const entry of allPopupEntries(window.map)) {
      // Welche Properties liest render()? Aufzeichnender Proxy statt handgepflegter Liste.
      const read = new Set();
      const recorder = new Proxy({}, { get: (_, k) => (typeof k === "string" && read.add(k), undefined), has: () => false });
      try { entry.render(recorder, { properties: recorder, geometry: { coordinates: [0, 0] } }); } catch { /* bis zum Wurf Gelesenes zählt */ }
      try { entry.link?.(recorder); } catch { /* dito */ }

      for (const layerId of entry.layers) {
        const fields = await fieldsOfLayer(layerId);
        if (!fields) continue;
        checked += 1;
        for (const f of read) {
          if (fields.has(f)) continue;
          gapsSeen.add(`${entry.id}.${f}`);
          if (!known[entry.id]?.[f]) problems.push(`Popup "${entry.id}" liest "${f}" — fehlt in Layer "${layerId}"`);
        }
      }
    }
    // Verfallskontrolle: Ausnahme eingetragen, aber das Feld fehlt nirgends mehr
    for (const [id, fields] of Object.entries(known)) {
      for (const f of Object.keys(fields)) {
        if (!gapsSeen.has(`${id}.${f}`)) problems.push(`Ausnahme überflüssig: "${id}.${f}" ist inzwischen in den Tiles — aus KNOWN_POPUP_GAPS entfernen`);
      }
    }
    return { problems, checked };
  }, KNOWN_POPUP_GAPS);

  expect(report.checked, "zu wenige Popup-Layer geprüft").toBeGreaterThan(30);
  expect(report.problems, `Popups lesen Attribute, die es in den Tiles nicht gibt:\n${report.problems.join("\n")}`).toEqual([]);
});
