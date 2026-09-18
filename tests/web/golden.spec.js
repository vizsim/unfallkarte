// Golden-Reference fürs Frontend (Pendant zu pipeline/tests/golden): hält fest, WAS die App
// aus ihrer Layer-Verdrahtung macht — unabhängig davon, WIE sie verdrahtet ist. Sicherheitsnetz
// für den Umbau auf die Layer-Registry (docs/TODO.md, Roadmap 2): nach jedem Schritt muss der
// Snapshot identisch sein, außer eine Änderung ist gewollt. Dann bewusst neu aufnehmen:
//
//     npx playwright test golden --update-snapshots      (Diff im Commit prüfen!)
//
// Festgehalten wird:
//   sources  Quelle -> Typ + Datei (URL auf "<ordner>/<datei>" normalisiert: lokal == B2)
//   layers   alle Style-Layer in Zeichenreihenfolge; unsere mit voller Definition
//            (Typ, source-layer, Zoom-Range, Filter, Paint, Layout), Basemap nur als ID
//   toggles  je Legenden-Toggle × Zoom 8/12/15: welche Layer werden sichtbar, welche
//            Legenden/Zoom-Hinweise erscheinen, was landet im Permalink
import { test, expect } from "@playwright/test";
import { openMap, ensureAllLayers, expectNoErrors } from "./helpers.js";

const ZOOMS = [8, 12, 15];

test("Golden: Quellen, Layer-Definitionen und Toggle-Verhalten", async ({ page }) => {
  test.setTimeout(240_000);
  const errors = await openMap(page);

  // Beim Start existieren nur die Unfall-Layer; alles andere entsteht lazy beim ersten
  // Einschalten (ensureEntry). Hier VOR der Aufnahme alle anlegen — in Registry-Reihenfolge,
  // die NICHT die Zeichenreihenfolge ist: der Snapshot beweist damit, dass nachträglich
  // eingefügte Layer exakt an ihrer Stelle landen (beforeId-Logik).
  const startLayers = await page.evaluate(() => window.map.getLayersOrder().length);
  await ensureAllLayers(page);
  expect(await page.evaluate(() => window.map.getLayersOrder().length), "Lazy greift nicht: Layer waren schon beim Start da")
    .toBeGreaterThan(startLayers + 40);

  const golden = await page.evaluate(async (ZOOMS) => {
    const m = window.map;
    const tick = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    const fileOf = (url) => (url ? url.replace(/^pmtiles:\/\//, "").split("/").slice(-2).join("/") : null);

    // --- sources ---------------------------------------------------------------------------
    const style = m.getStyle();
    const sources = {};
    for (const id of Object.keys(style.sources).sort()) {
      const s = style.sources[id];
      const ours = s.url?.startsWith("pmtiles://");
      sources[id] = ours ? { type: s.type, file: fileOf(s.url) } : { type: s.type };
    }

    // --- layers (Zeichenreihenfolge!) --------------------------------------------------------
    const BASEMAP = new Set(["openmaptiles"]);
    const layers = style.layers.map((l) => {
      if (!l.source || BASEMAP.has(l.source)) return l.id; // Basemap/Background: nur Position
      const { id, type, source, minzoom, maxzoom, filter, paint, layout } = l;
      return { id, type, source, sourceLayer: l["source-layer"], minzoom, maxzoom, filter, paint, layout };
    });

    // --- toggles -------------------------------------------------------------------------------
    const visibleLayers = () => new Set(m.getStyle().layers
      .filter((l) => (l.layout?.visibility ?? "visible") === "visible").map((l) => l.id));
    const shown = (el) => !!el && el.offsetParent !== null;
    const legendState = () => ({
      legends: [...document.querySelectorAll('.legend [id$="-legend"], .legend [id$="-zoomhint"], #cluster-legend-section')]
        .filter(shown).map((el) => el.id).sort(),
      zoomHints: [...document.querySelectorAll(".legend .zoom-hint")]
        .filter(shown).map((el) => el.closest("[id]")?.id).sort(),
    });
    const permalinkTail = () => (new URLSearchParams(location.search).get("p") ?? "").split(",").slice(5).join(",");

    const toggleIds = [...document.querySelectorAll('.legend input[type="checkbox"][id^="toggle-"]')].map((el) => el.id).sort();
    const toggles = {};
    for (const zoom of ZOOMS) {
      m.jumpTo({ zoom });
      await tick();
      const baseLayers = visibleLayers();
      const base = legendState();
      toggles[`z${zoom}`] = { _baseline: base };
      for (const id of toggleIds) {
        const cb = document.getElementById(id);
        if (cb.checked) continue; // Default-an (z. B. keine) — nicht anfassen
        cb.click();
        // (Historisch: Toggles schrieben die URL erst bei der nächsten Kartenbewegung. Seit
        // 2026-09 sofort — der Pan bleibt als Gürtel zum Hosenträger drin.)
        m.jumpTo({ center: m.getCenter() });
        await tick();
        const now = visibleLayers();
        const state = legendState();
        toggles[`z${zoom}`][id] = {
          layersOn: [...now].filter((l) => !baseLayers.has(l)).sort(),
          layersOff: [...baseLayers].filter((l) => !now.has(l)).sort(),
          legendsOn: state.legends.filter((l) => !base.legends.includes(l)),
          zoomHints: state.zoomHints,
          permalink: permalinkTail(),
        };
        cb.click();
        await tick();
        // Aus = zurück zum Ausgangszustand (sonst verfälscht ein Toggle alle folgenden)
        const after = visibleLayers();
        const leaked = [...after].filter((l) => !baseLayers.has(l));
        if (leaked.length) toggles[`z${zoom}`][id].leakedAfterOff = leaked.sort();
      }
    }
    return { sources, layers, toggles };
  }, ZOOMS);

  // Kanonisch serialisieren: Objekt-Schlüssel sortiert (Reihenfolge ist in Paint/Layout ohne
  // Bedeutung und hängt nur davon ab, wie ein Layer zusammengebaut wurde); Arrays bleiben, wie
  // sie sind — dort IST die Reihenfolge Inhalt (Expressions, Zeichenreihenfolge der Layer).
  const canonical = (v) => (Array.isArray(v) ? v.map(canonical)
    : v && typeof v === "object" ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, canonical(v[k])]))
    : v);
  expect(JSON.stringify(canonical(golden), null, 1) + "\n").toMatchSnapshot("frontend-golden.json");
  expectNoErrors(errors);
});
