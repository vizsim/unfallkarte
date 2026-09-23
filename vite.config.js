// vite.config.js — Dev-Server + Build des Frontends. Hintergrund: docs/VITE_MIGRATION.md.
//
// Drei Abweichungen vom Vite-Standard, jede mit gemessenem Grund:
//  1. MapLibre wird NICHT gebündelt (maplibreExternal). Es sucht seinen Worker zur Laufzeit
//     neben der eigenen Datei (import.meta.url). Gebündelt bleibt die Karte leer, ohne jeden
//     Fehler; mit setWorkerUrl lädt der Worker `-shared` ein zweites Mal (+121 KB gzip).
//  2. appType "mpa": Vites SPA-Fallback beantwortet jeden unbekannten Pfad mit der index.html
//     und Status 200. Die Local-first-Probe (HEAD ./data/…) hielte dann jede fehlende Datei
//     für lokal vorhanden, und MapLibre bekäme HTML statt Tiles.
//  3. localData: ./data (Symlink auf pipeline/data, gitignored, 18 GB) wird in Dev UND Preview
//     mit Range-Requests ausgeliefert — aber nie nach dist/ kopiert und nie beobachtet.
import { defineConfig } from "vite";
import { createReadStream, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, extname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

// ---- 1. MapLibre ungebündelt ------------------------------------------------------------
// Die drei .mjs werden unverändert aus node_modules in einen Ordner MIT Version kopiert
// (Cache-Busting über den Pfad). Der nackte Import "maplibre-gl" im Bündel löst eine
// Importmap auf. So teilen Hauptthread und Worker sich dieselbe -shared.mjs — wie mit dem
// früheren vendor/.
const ML_PKG = require.resolve("maplibre-gl/package.json");
const ML_DIR = `lib/maplibre-gl@${require(ML_PKG).version}`;
const ML_FILES = ["maplibre-gl.mjs", "maplibre-gl-shared.mjs", "maplibre-gl-worker.mjs"];

function maplibreExternal() {
  return {
    name: "unfallkarte:maplibre-external",
    apply: "build",
    config: () => ({ build: { rolldownOptions: { external: ["maplibre-gl"] } } }),
    transformIndexHtml: () => [
      // Die Importmap muss vor dem ersten Modul stehen.
      { tag: "script", attrs: { type: "importmap" }, injectTo: "head-prepend",
        children: JSON.stringify({ imports: { "maplibre-gl": `./${ML_DIR}/maplibre-gl.mjs` } }) },
      // Ohne Preload entdeckt der Browser MapLibre erst nach dem Parsen des Bündels, -shared
      // noch einen Roundtrip später (gemessen ~0,3 s, docs/MAPLIBRE_6_UPGRADE.md).
      ...ML_FILES.slice(0, 2).map((f) => ({
        tag: "link", attrs: { rel: "modulepreload", href: `./${ML_DIR}/${f}` }, injectTo: "head-prepend",
      })),
    ],
    writeBundle({ dir }) {
      mkdirSync(join(dir, ML_DIR), { recursive: true });
      for (const f of ML_FILES) {
        // .map-Dateien liefern wir nicht aus -> Verweis weg, sonst 404 in den DevTools.
        const code = readFileSync(join(dirname(ML_PKG), "dist", f), "utf8")
          .replace(/\/\/# sourceMappingURL=\S+\s*$/, "");
        writeFileSync(join(dir, ML_DIR, f), code);
      }
    },
  };
}

// ---- 3. ./data mit Range-Requests (Dev + Preview) ----------------------------------------
// PMTiles liest Byte-Bereiche; ohne 206 scheitert es. Fehlt eine Datei (CI: kein data/),
// antwortet der Handler mit einem echten 404 -> das Frontend fällt auf B2 zurück.
const DATA_DIR = join(ROOT, "data");
const TYPES = { ".json": "application/json", ".pmtiles": "application/octet-stream" };

function serveLocalData(req, res, next) {
  if (req.method !== "GET" && req.method !== "HEAD") return next();
  const file = resolve(DATA_DIR, `.${decodeURIComponent(new URL(req.url, "http://x").pathname)}`);
  if (!file.startsWith(DATA_DIR + sep)) { res.statusCode = 403; return res.end(); }
  let size;
  try {
    const st = statSync(file);
    if (!st.isFile()) throw new Error("kein File");
    size = st.size;
  } catch {
    res.statusCode = 404;
    return res.end();
  }
  let start = 0;
  let end = size - 1;
  const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range ?? "");
  if (range) {
    if (range[1] === "") start = Math.max(0, size - Number(range[2]));   // "bytes=-N": die letzten N
    else {
      start = Number(range[1]);
      if (range[2] !== "") end = Math.min(end, Number(range[2]));
    }
    if (start > end) {
      res.statusCode = 416;
      res.setHeader("Content-Range", `bytes */${size}`);
      return res.end();
    }
    res.statusCode = 206;
    res.setHeader("Content-Range", `bytes ${start}-${end}/${size}`);
  }
  res.setHeader("Content-Type", TYPES[extname(file)] ?? "application/octet-stream");
  res.setHeader("Content-Length", end - start + 1);
  res.setHeader("Accept-Ranges", "bytes");
  res.setHeader("Cache-Control", "no-cache");
  if (req.method === "HEAD") return res.end();
  createReadStream(file, { start, end }).pipe(res);
}

function localData() {
  return {
    name: "unfallkarte:local-data",
    configureServer: (server) => { server.middlewares.use("/data", serveLocalData); },
    configurePreviewServer: (server) => { server.middlewares.use("/data", serveLocalData); },
  };
}

export default defineConfig({
  base: "./",        // Pages liefert unter vizsim.de/unfallkarte/ aus; relativ passt überall
  appType: "mpa",    // siehe 2. oben
  server: {
    // Nicht beobachten: der Datenbaum (18 GB) und alles, was die Pipeline/Tests erzeugen.
    watch: { ignored: ["**/data/**", "**/pipeline/**", "**/test-results/**", "**/playwright-report/**"] },
  },
  // Dev: MapLibre direkt aus node_modules laden statt vorgebündelt — dann liegt der Worker
  // wie vorgesehen neben der Datei, die ihn sucht.
  optimizeDeps: { exclude: ["maplibre-gl"] },
  plugins: [maplibreExternal(), localData()],
});
