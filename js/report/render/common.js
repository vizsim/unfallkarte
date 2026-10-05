// common.js — kleine Helfer für die Darstellung des Reports (kein DOM-Zugriff).
// Alles, was aus den Daten kommt (OSM-Namen!), geht durch esc(): OSM-Attribute sind
// nutzergeneriert und landen in innerHTML.

const ESC = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
export const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ESC[c]);
export const fmt = (n, d = 0) => (Number.isFinite(Number(n)) ? Number(n).toLocaleString("de-DE", { minimumFractionDigits: d, maximumFractionDigits: d }) : "–");

export const ST_ICON = { erfuellt: "✓", unklar: "?", nicht_erfuellt: "✕", hinweis: "i", entfaellt: "–" };
export const ST_LABEL = { erfuellt: "erfüllt", unklar: "unklar", nicht_erfuellt: "nicht erfüllt", hinweis: "Hinweis", entfaellt: "entfällt" };
const ORIGIN = { AMT: "amtliche Daten", OSM: "OpenStreetMap", MESS: "Community-Messung", MOD: "Modell / geschätzt", NUTZ: "Angabe der Nutzerin" };
export const origin = (k) => `<span class="origin" title="${ORIGIN[k]}">${k}</span>`;
export const stIcon = (st, sm = false) => `<span class="st ${st}${sm ? " sm" : ""}" role="img" aria-label="${ST_LABEL[st]}">${ST_ICON[st]}</span>`;

/** „x von n" unter 20 Fällen, sonst Prozent (Konzept § 2.3). */
export const pctOr = (k, n) => (n >= 20 ? `${Math.round((100 * k) / n)} %` : `${k} von ${n}`);

/** Warum ein Wert fehlt — nie ein stummer leerer Abschnitt. */
export function unavailable(status) {
  if (status === "missing") return "nicht verfügbar (Datensatz nicht im Manifest)";
  if (status === "error") return "nicht verfügbar (Laden fehlgeschlagen)";
  return "nicht verfügbar";
}

export const today = () => new Date().toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" });
