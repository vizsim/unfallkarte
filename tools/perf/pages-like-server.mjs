// pages-like-server.mjs — statischer Server, der sich beim Laden wie GitHub Pages verhält:
// gzip für Text, `Cache-Control: max-age=600`, Range-Requests, 404 mit ~9 KB Fehlerseite.
//
// Für Ladezeit-Vergleiche (docs/PERFORMANCE_PLAN.md, „Messmethode"). Nie gegen `npm run dev`
// oder `vite preview` messen: ohne gzip und Pages-Cache verfälscht das um Sekunden.
//
//   node tools/perf/pages-like-server.mjs <verzeichnis> <port> [host=127.0.0.2]
//
// 127.0.0.2 ist Absicht: für den Code eine fremde Herkunft, also der Produktionspfad (keine
// Local-first-Proben, siehe mayHaveLocalTree in js/mapdata/resolveSources.js).
import { createServer } from "node:http";
import { createReadStream, readFileSync, statSync } from "node:fs";
import { extname, join, resolve, sep } from "node:path";
import { gzipSync } from "node:zlib";

const [dir = "dist", port = "4300", host = "127.0.0.2"] = process.argv.slice(2);
const ROOT = resolve(dir);
const TYPES = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".mjs": "text/javascript",
  ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png",
  ".txt": "text/plain", ".pmtiles": "application/octet-stream",
};
const GZIP = new Set([".html", ".js", ".mjs", ".css", ".json", ".svg", ".txt"]);
const NOT_FOUND = `<!DOCTYPE html><title>404</title>${" ".repeat(9300)}`;   // Pages-404: ~9,4 KB
const gzCache = new Map();

createServer((req, res) => {
  let file = resolve(ROOT, `.${decodeURIComponent(new URL(req.url, "http://x").pathname)}`);
  if (file !== ROOT && !file.startsWith(ROOT + sep)) return res.writeHead(403).end();
  let st;
  try {
    st = statSync(file);
    if (st.isDirectory()) st = statSync((file = join(file, "index.html")));
  } catch {
    return res.writeHead(404, { "Content-Type": "text/html" }).end(NOT_FOUND);
  }
  const ext = extname(file);
  const headers = {
    "Content-Type": TYPES[ext] ?? "application/octet-stream",
    "Cache-Control": "max-age=600",
    "Access-Control-Allow-Origin": "*",
    "Last-Modified": st.mtime.toUTCString(),
  };

  if (GZIP.has(ext) && /\bgzip\b/.test(req.headers["accept-encoding"] ?? "")) {
    const key = `${file}:${st.mtimeMs}`;
    if (!gzCache.has(key)) gzCache.set(key, gzipSync(readFileSync(file), { level: 9 }));
    const body = gzCache.get(key);
    res.writeHead(200, { ...headers, "Content-Encoding": "gzip", "Vary": "Accept-Encoding", "Content-Length": body.length });
    return res.end(req.method === "HEAD" ? undefined : body);
  }

  let start = 0;
  let end = st.size - 1;
  const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range ?? "");
  if (range) {
    if (range[1] === "") start = Math.max(0, st.size - Number(range[2]));
    else {
      start = Number(range[1]);
      if (range[2] !== "") end = Math.min(end, Number(range[2]));
    }
    headers["Content-Range"] = `bytes ${start}-${end}/${st.size}`;
  }
  res.writeHead(range ? 206 : 200, { ...headers, "Accept-Ranges": "bytes", "Content-Length": end - start + 1 });
  if (req.method === "HEAD") return res.end();
  createReadStream(file, { start, end }).pipe(res);
}).listen(Number(port), host, () => console.log(`pages-like: http://${host}:${port}/ <- ${ROOT}`));
