// wegB.js — Weg B: Befunde zur Gefahrenlage (§ 45 Abs. 9 S. 3 StVO; Maßstab BVerwG 3 C 37.09),
// Entwurf (Konzept § 4.3). REIN. Der Report stellt keine Gefahrenlage fest; er sammelt Befunde.
// B3 (Vergleich mit Referenzwerten) kommt erst mit report/baselines.json aus der Pipeline
// (Stufe 2) — bis dahin sagt der Schritt das offen, statt eine Referenz zu erfinden.
import { TYP } from "../model.js";

export function evalWegB(M, years, U, ans = {}, beob = "") {
  const A = M.accidents;
  const steps = [];
  steps.push({ id: "B1", t: "Datenbasis", status: A.nYears >= 3 && A.n >= 3 ? "erfuellt" : "unklar",
    txt: `${A.n} Unfälle mit Personenschaden in ${A.nYears} Jahren (${years.from}–${years.to}).${A.nYears < 3 ? " Für eine Aussage mindestens 3 Jahre wählen." : A.n < 3 ? " Zu wenige Fälle für eine Aussage." : ""}`,
    data: "Unfallatlas (nur Unfälle mit Personenschaden)" });
  steps.push({ id: "B2", t: "Unfallhäufung (M Uko)", status: U.any ? "erfuellt" : U.list.some((x) => x.status === "unklar") ? "unklar" : "nicht_erfuellt",
    txt: U.any ? `Kriterium rechnerisch erfüllt: ${U.best.text}.` : U.list.some((x) => x.status === "unklar") ? "Kein Kriterium sicher erfüllt; mindestens eines ist mit dem Unfallatlas nicht abschließend prüfbar." : "Kein Kriterium rechnerisch erfüllt.",
    data: U.any ? U.best.quelle : "siehe Abschnitt 2" });
  steps.push({ id: "B3", t: "Vergleich mit Referenz", status: "unklar", mod: true,
    txt: "Referenzwerte für vergleichbare Stellen (Land, Raumtyp, Knotentyp) liefert die Pipeline erst mit einer späteren Stufe. Bis dahin kein „x-mal so viele Unfälle“.",
    data: "report/baselines.json (geplant, Konzept § 2.4)" });
  const top = Object.entries(A.byTyp).sort((a, b) => b[1] - a[1])[0];
  const parts = [];
  if (A.n >= 5 && top && top[1] / A.n >= 0.4) parts.push(`${top[1]} von ${A.n} Unfällen gehören zum Typ „${TYP[top[0]]}“ – gleichartige Unfälle deuten auf eine örtliche Ursache.`);
  if (A.n >= 5) parts.push(`${A.fr} von ${A.n} mit Fuß- oder Radbeteiligung${A.n >= 20 ? ` (${Math.round((100 * A.fr) / A.n)} %)` : ""}; ein Vergleichswert fehlt noch.`);
  steps.push({ id: "B4", t: "Unfallstruktur", status: parts.length && top[1] / A.n >= 0.4 ? "hinweis" : "entfaellt", txt: parts.join(" ") || "Zu wenige Fälle für eine Aussage zur Struktur (ab 5).", data: "UTYP1, IstFuss, IstRad" });
  const o = M.obs;
  if (o.status === "ok" && o.n > 0) {
    const share = o.k / o.n;
    steps.push({ id: "B5", t: "Überholabstände", status: o.n >= 20 && share >= 0.3 ? "hinweis" : "entfaellt",
      txt: o.n >= 20 ? `${o.k} von ${o.n} OpenBikeSensor-Messungen unter dem Mindestabstand (${Math.round(100 * share)} %).${share >= 0.3 ? " Ein Überholverbot für einspurige Fahrzeuge (Z. 277.1) ließe sich prüfen." : ""}` : `Nur ${o.n} Messungen – zu wenig für einen Anteil (ab 20).`,
      data: "OpenBikeSensor (Community-Messung, Stichprobe)" });
  }
  const has = (beob || "").trim().length >= 80;
  steps.push({ id: "B6", t: "Örtliche Verhältnisse", status: has ? "hinweis" : "unklar", nutz: true,
    txt: has ? "Eigene Beobachtung liegt vor (Abschnitt „Brief“)." : "Noch keine eigene Beobachtung (Sicht, Querungsbedarf, Tempo) – sie ist im Brief Pflicht.", data: "Angabe der Nutzerin" });
  let verdict;
  if (steps[0].status !== "erfuellt") verdict = { key: "wenig", label: "zu wenig Daten", cls: "warn" };
  else if (steps[1].status === "erfuellt") verdict = { key: "stuetzt", label: "Befundlage stützt eine Prüfung", cls: "good" };
  else verdict = { key: "nicht", label: "keine datenbasierte Gefahrenlage erkennbar (ohne Referenzvergleich)", cls: "neutral" };
  return { steps, verdict };
}
