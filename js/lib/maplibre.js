// maplibre.js — der EINE Ort, an dem der Pfad zur MapLibre-Bibliothek steht.
//
// Seit v6 ist MapLibre ESM-only: es gibt kein UMD-Bundle und kein globales `maplibregl`
// mehr. Alle Module importieren von hier statt direkt aus vendor/ — so steht der
// Vendor-Pfad an genau einer Stelle, und beim späteren Vite-Schritt (docs/TODO.md,
// Roadmap 3) ändert sich nur diese Zeile auf `from "maplibre-gl"`.
//
// Der Worker (vendor/maplibre-gl-worker.mjs) wird same-origin automatisch über
// import.meta.url gefunden — kein setWorkerUrl nötig. Die drei .mjs-Dateien gehören
// zusammen und müssen dieselbe Version haben (siehe vendor/README.md).
export * from "../../vendor/maplibre-gl.mjs";
