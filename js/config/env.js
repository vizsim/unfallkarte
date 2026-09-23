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

if (!MAPILLARY_TOKEN) {
  console.warn("VITE_MAPILLARY_TOKEN fehlt (.env.development.local bzw. .env.production) — Mapillary-Layer bleiben leer.");
}
