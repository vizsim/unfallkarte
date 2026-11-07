// env.js — der EINE Ort, an dem `import.meta.env` gelesen wird. Vite setzt die Werte zur
// Bauzeit ein.
//
// Bewusst isoliert: die Unit-Tests (node --test) importieren js/-Module direkt, und in Node ist
// `import.meta.env` undefined. Wer diese Datei importiert, ist nicht mehr browserlos testbar.
//
// Mapillary-Token: lokal aus `.env.development.local` (gitignored — ersetzt die frühere
// js/config/config.js), im Build aus `.env.production` (der öffentliche Client-Token, der
// ohnehin im ausgelieferten JS steht — ersetzt config.public.js).
export const MAPILLARY_TOKEN = import.meta.env.VITE_MAPILLARY_TOKEN ?? "";

// Analyse-Report: rechtliche Einordnung (Weg A/B/C, Maßnahmen, Gegenargumente), Zuständigkeit,
// Landesregeln und Brief erst nach der juristischen Durchsicht (docs/TODO.md R0). Bis dahin baut
// Pages nur den Datenteil; lokal schaltet `VITE_REPORT_LEGAL=1 npm run dev` (oder ein Eintrag in
// `.env.development.local`) den Rechtsteil ein. Bewusst kein URL-Parameter: sonst ließe er sich
// auf der Live-Seite von jedem einschalten.
export const REPORT_LEGAL = import.meta.env.VITE_REPORT_LEGAL === "1";

if (!MAPILLARY_TOKEN) {
  console.warn("VITE_MAPILLARY_TOKEN fehlt (.env.development.local bzw. .env.production) — Mapillary-Layer bleiben leer.");
}
