// maplibre.js — der EINE Ort, an dem die MapLibre-Bibliothek importiert wird.
//
// Seit v6 ist MapLibre ESM-only: es gibt kein UMD-Bundle und kein globales `maplibregl`
// mehr. Alle Module importieren von hier statt direkt aus dem Paket.
//
// Im Build wird "maplibre-gl" NICHT gebündelt, sondern per Importmap auf eine versionierte
// Kopie der drei .mjs aufgelöst (vite.config.js, maplibreExternal): MapLibre findet seinen
// Worker zur Laufzeit neben der eigenen Datei (import.meta.url), und Hauptthread + Worker
// teilen sich so dieselbe -shared.mjs. Die drei Dateien müssen dieselbe Version haben —
// das stellt jetzt package.json sicher.
export * from "maplibre-gl";
