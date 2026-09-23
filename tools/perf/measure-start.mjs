// measure-start.mjs — Startzeit A/B: Zeit bis zum ersten sichtbaren Unfallpunkt und bis zur
// fertigen Startansicht, abwechselnd gegen zwei Server, frischer Browser-Kontext je Lauf.
//
//   node tools/perf/measure-start.mjs <urlA> <urlB> [läufe=7] [profil=mobil|schnell]
//
// Profil "mobil" = 1,6 Mbit/s / 150 ms RTT per CDP (wie alle Messungen in
// docs/PERFORMANCE_PLAN.md), "schnell" = ungedrosselt. Je Arm ein Aufwärmlauf (DNS/TLS der
// Fremd-Hosts), der nicht zählt; die Reihenfolge A/B wechselt jede Runde, damit keiner der
// beiden Arme systematisch zuerst läuft. Ausgabe: Median + Spanne je Arm und Metrik, dazu die
// übertragenen KB der eigenen Herkunft (HTML/JS/CSS/Style — der Teil, den ein Bundler
// überhaupt beeinflussen kann; Kacheln kommen von B2/OpenFreeMap und sind in beiden Armen gleich).
//
// Server: tools/perf/pages-like-server.mjs (gzip + max-age=600 wie GitHub Pages), Host
// 127.0.0.2 = Produktionspfad ohne Local-first-Proben.
//
// CPU_THROTTLE=4 node tools/perf/measure-start.mjs … bremst zusätzlich die CPU (CDP), etwa für
// Dekodier-Unterschiede, die auf einem Laptop verschwinden, auf dem Handy aber zählen.
import { chromium } from "@playwright/test";

const [urlA, urlB, runsArg = "7", profile = "mobil"] = process.argv.slice(2);
const CPU_THROTTLE = Number(process.env.CPU_THROTTLE) || 1;
if (!urlA || !urlB) {
  console.error("Aufruf: node tools/perf/measure-start.mjs <urlA> <urlB> [läufe=7] [mobil|schnell]");
  process.exit(1);
}
const RUNS = Number(runsArg);
const THROTTLE = { offline: false, latency: 150, downloadThroughput: 1.6e6 / 8, uploadThroughput: 0.75e6 / 8 };

const browser = await chromium.launch();

async function run(url) {
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  const page = await ctx.newPage();
  const cdp = await ctx.newCDPSession(page);
  await cdp.send("Network.enable");
  if (profile === "mobil") await cdp.send("Network.emulateNetworkConditions", THROTTLE);
  if (CPU_THROTTLE > 1) await cdp.send("Emulation.setCPUThrottlingRate", { rate: CPU_THROTTLE });

  const origin = new URL(url).origin;
  const urls = new Map();
  let ownBytes = 0;
  let ownRequests = 0;
  cdp.on("Network.requestWillBeSent", (e) => urls.set(e.requestId, e.request.url));
  cdp.on("Network.loadingFinished", (e) => {
    if (urls.get(e.requestId)?.startsWith(origin)) { ownBytes += e.encodedDataLength; ownRequests++; }
  });

  const at = (predicate) => page
    .waitForFunction(predicate, null, { polling: 50, timeout: 180_000 })
    .then((h) => h.jsonValue());
  await page.goto(url);
  // performance.now() = ms seit Navigationsbeginn
  const firstPoint = await at(() => {
    const m = window.map;
    return m?.getLayer?.("accident-points")
      && m.queryRenderedFeatures({ layers: ["accident-points"] }).length > 0
      && performance.now();
  });
  const ready = await at(() => {
    const m = window.map;
    return document.documentElement.dataset.appReady === "true"
      && m.loaded() && m.areTilesLoaded() && !m.isMoving()
      && performance.now();
  });
  await ctx.close();
  return { firstPoint, ready, ownKB: ownBytes / 1024, ownRequests };
}

const arms = { A: { url: urlA, runs: [] }, B: { url: urlB, runs: [] } };
await run(urlA);
await run(urlB);
for (let i = 0; i < RUNS; i++) {
  for (const key of i % 2 ? ["B", "A"] : ["A", "B"]) {
    const r = await run(arms[key].url);
    arms[key].runs.push(r);
    console.log(`Runde ${i + 1} ${key}: Punkt ${(r.firstPoint / 1000).toFixed(2)} s · fertig ${(r.ready / 1000).toFixed(2)} s · eigen ${r.ownKB.toFixed(0)} KB in ${r.ownRequests} Anfragen`);
  }
}
await browser.close();

const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
};
const fmt = (xs) => `${(median(xs) / 1000).toFixed(2)} s (${(Math.min(...xs) / 1000).toFixed(2)}–${(Math.max(...xs) / 1000).toFixed(2)})`;
console.log(`\nProfil ${profile}${CPU_THROTTLE > 1 ? `, CPU ×${CPU_THROTTLE} gebremst` : ""}, ${RUNS} Läufe je Arm, Median (Spanne):`);
for (const [key, { url, runs }] of Object.entries(arms)) {
  console.log(`${key} ${url}`);
  console.log(`  erster Unfallpunkt   ${fmt(runs.map((r) => r.firstPoint))}`);
  console.log(`  fertige Startansicht ${fmt(runs.map((r) => r.ready))}`);
  console.log(`  eigene Herkunft      ${median(runs.map((r) => r.ownKB)).toFixed(0)} KB in ${median(runs.map((r) => r.ownRequests))} Anfragen`);
}
