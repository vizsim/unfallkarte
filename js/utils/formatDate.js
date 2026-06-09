// js/utils/formatDate.js
//
// Einheitliches deutsches Datumsformat für ALLE user-sichtbaren Datumsangaben:
// ISO "YYYY-MM-DD" (auch mit Zeit-Suffix) -> "TT.MM.JJJJ".
// Nicht-passende Eingaben werden unverändert zurückgegeben.

export function formatDateDE(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || "");
  return m ? `${m[3]}.${m[2]}.${m[1]}` : (iso || "");
}
