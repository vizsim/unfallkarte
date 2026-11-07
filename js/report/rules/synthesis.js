// synthesis.js — aus den Prüfergebnissen: Maßnahmen-Kandidaten, „Auf einen Blick",
// Gegenargumente (Konzept § 2.2, Abschnitte 1, 7, 8). REIN. Wortwahl wie Sc9: „Kandidat",
// „Hinweis", „nach den Daten", „rechnerisch" — nie „muss angeordnet werden".
import { params } from "./params.js";
import { evalUko } from "./uko.js";
import { evalWegA } from "./wegA.js";
import { evalWegB } from "./wegB.js";
import { evalWegC } from "./wegC.js";
import { facLabel, facPhrase } from "../facilities.js";

export function measures(M, A, U, Cw) {
  const out = [];
  const street = A.street ?? M.streetName ?? "Straße";
  if (A.candidate) {
    out.push({ id: "t30", t: "Tempo 30 vor der Einrichtung", sign: true,
      why: `${facLabel(A.fac)} an der ${street}${A.seg ? `; Vorschlag rund ${A.seg.len} m` : ""}, ${A.zf ?? "zeitlich nach Öffnungszeiten"}.`,
      norm: "§ 45 Abs. 9 S. 4 Nr. 6 StVO · VwV zu Z. 274 Rn. 13", who: "Straßenverkehrsbehörde · keine Gefahrenlage nötig" });
    const a9 = A.steps.find((x) => x.id === "A9");
    if (a9?.status === "erfuellt") out.push({ id: "luecke", t: "Tempo-30-Lückenschluss", sign: true, why: `rund ${a9.gap} m bis zur bestehenden Tempo-30-${A.gap?.art ?? "Strecke"}.`, norm: "§ 45 Abs. 9 S. 4 Nr. 4 StVO", who: "Straßenverkehrsbehörde · keine Gefahrenlage nötig" });
  }
  if (A.verdict.key === "zeitweise" && A.fac) {
    out.push({ id: "t30zeit", t: "Zeiten der bestehenden Tempo-30-Regel prüfen", sign: true, why: `An der ${street} gilt Tempo 30 schon zeitweise (${A.sp?.cond?.when ?? "laut OSM"}); zu prüfen ist, ob das die Öffnungszeiten ${facLabel(A.fac)} abdeckt.`, norm: "§ 45 Abs. 9 S. 4 Nr. 6 StVO · VwV zu Z. 274 Rn. 13", who: "Straßenverkehrsbehörde" });
  }
  // Tempo 30 am Fußgängerüberweg (Rn. 13b, „kann"): Zebra an der Hauptstraße, dort > 30 km/h.
  const vHere = A.sp?.v ?? M.speed?.v;
  const zebra = M.crossings.find((c) => c.kind === "zebra" && c.chain.d <= 15 && (M.selection.contains(c.p) || c.d <= 60));
  const covered = zebra && A.seg && zebra.chain.s >= A.seg.a && zebra.chain.s <= A.seg.b;
  if (zebra && !covered && vHere > 30) {
    out.push({ id: "fgue", t: "Tempo 30 am Fußgängerüberweg", sign: true, why: `Fußgängerüberweg rund ${Math.round(zebra.d)} m von der Stelle; Tempo 30 „kann“ dort angeordnet werden, etwa wenn Sichtweiten für 50 km/h fehlen.`, norm: "VwV zu Z. 274 Rn. 13b · § 45 Abs. 9 S. 4 Nr. 6", who: "Straßenverkehrsbehörde" });
  }
  if (U.any) out.push({ id: "uko", t: "Behandlung in der Unfallkommission", why: `${U.best.text} – rechnerisch erfüllt (${U.window}).`, norm: `${U.best.quelle} · VwV zu § 44 StVO`, who: "Straßenverkehrsbehörde (Vorsitz), Polizei, Straßenbaubehörde" });
  const acc = M.accidents;
  if (acc.byTyp[2] >= 3 && acc.bet.IstRad >= 3) out.push({ id: "abbiegen", t: "Abbiegekonflikte mit dem Radverkehr entschärfen", why: `${acc.byTyp[2]} Abbiegeunfälle, ${acc.bet.IstRad} mit Radbeteiligung: etwa getrennte Signalisierung oder vorgezogene Haltlinie für den Radverkehr.`, norm: "§ 45 Abs. 1 StVO; Signalprogramm", who: "Straßenverkehrsbehörde + Baulastträger" });
  const o = M.obs;
  if (o.status === "ok" && o.n >= 20 && o.k / o.n >= 0.3) out.push({ id: "ueberholen", t: "Überholverbot für einspurige Fahrzeuge (Z. 277.1)", why: `${Math.round((100 * o.k) / o.n)} % von ${o.n} gemessenen Überholvorgängen unter dem Mindestabstand.`, norm: "§ 45 Abs. 9 S. 3 StVO – Gefahrenlage nötig", who: "Straßenverkehrsbehörde" });
  if (Cw && Cw.verdict.key === "stark") out.push({ id: "laerm", t: "Tempo 30 nachts (Lärmschutz)", why: `L_Night ${Cw.nightTxt} dB(A) laut Kartierung${Cw.ew ? `, rund ${Cw.ew.toLocaleString("de-DE")} Einwohner am Abschnitt` : ""}. Vorher Berechnung nach RLS-19.`, norm: "§ 45 Abs. 1 S. 2 Nr. 3 StVO", who: "Straßenverkehrsbehörde" });
  const safeCrossing = M.crossings.some((c) => (c.kind === "zebra" || c.kind === "lsa") && c.d <= Math.max(60, M.selection.r));
  if (acc.bet.IstFuss >= 2 && !safeCrossing) out.push({ id: "querung", t: "Querungshilfe (baulich)", why: `${acc.bet.IstFuss} Unfälle mit Fußgängern, keine gesicherte Querung (Ampel oder Zebra) in der Nähe laut OSM.`, norm: "Straßenbaurecht", who: "Baulastträger – nicht die Straßenverkehrsbehörde" });
  const a2 = A.steps.find((x) => x.id === "A2");
  if (M.road && M.road.minor && a2?.status === "nicht_erfuellt" && vHere > 30) out.push({ id: "zone", t: "Tempo-30-Zone prüfen", why: `${street} ist eine Nebenstraße mit ${vHere} km/h.`, norm: "§ 45 Abs. 1c, Abs. 9 S. 4 Nr. 4 StVO (Einvernehmen der Gemeinde)", who: "Straßenverkehrsbehörde, Gemeinde" });
  return out;
}

export function glance(M, A, U, Cw) {
  const f = [];
  if (A.candidate) {
    const offen = A.steps.filter((x) => x.status === "unklar").map((x) => x.id);
    f.push({ st: A.verdict.key === "kandidat" ? "erfuellt" : "unklar", t: `${A.verdict.key === "kandidat" ? "Kandidat" : "Kandidat mit Klärungsbedarf"}: Tempo 30 vor ${facPhrase(A.fac, A.street)}.`,
      n: `§ 45 Abs. 9 S. 4 Nr. 6 StVO – ohne besondere Gefahrenlage${offen.length ? ` · offen: ${offen.join(", ")}` : ""}` });
  }
  if (A.verdict.key === "zeitweise") {
    const c = A.sp?.cond;
    f.push({ st: "hinweis", t: `Tempo 30 gilt hier schon zeitweise${c ? ` (${c.when})` : ""} – passen die Zeiten zur Einrichtung?`, n: "§ 45 Abs. 9 S. 4 Nr. 6 StVO · VwV zu Z. 274 Rn. 13 (Öffnungszeiten)" });
  }
  if (A.verdict.key === "fehlt") f.push({ st: "unklar", t: "Die Einrichtung aus dem Link ist nicht mehr in den OSM-Kacheln – bitte in der Auswahl neu wählen.", n: "Ausgewertet wurde ein Kreis um die gespeicherte Koordinate." });
  if (U.any) f.push({ st: "auffaellig", t: `Auffällig: ${U.best.text}.`, n: `${U.best.quelle} · rechnerisch, keine Feststellung – die trifft die Unfallkommission` });
  const acc = M.accidents;
  if (acc.n >= 5 && f.length < 3) {
    const share = acc.fr / acc.n;
    if (share >= 0.5) f.push({ st: "hinweis", t: `${acc.fr} von ${acc.n} Unfällen mit Fuß- oder Radbeteiligung.`, n: "Unfallatlas · Vergleichswerte folgen mit einer späteren Stufe" });
  }
  if (Cw && Cw.verdict.key === "stark" && f.length < 3) f.push({ st: "hinweis", t: `Lärm: L_Night ${Cw.nightTxt} dB(A) – starkes Indiz, Berechnung nach RLS-19 erbitten.`, n: "§ 45 Abs. 1 S. 2 Nr. 3 StVO · Kartierung ≠ Beurteilungspegel" });
  if (!f.length) f.push({ st: "entfaellt", t: "Nach den Daten keine besonderen Befunde.", n: "Eigene Beobachtungen können trotzdem eine Prüfbitte tragen." });
  return f.slice(0, 3);
}

// Hohe Pegel für „Auf einen Blick" im Datenteil: dieselben Werte wie Weg C (LSR-StV nachts im
// Wohngebiet, L_DEN 70), hier aber nur als Hinweis auf den Messwert, ohne Rechtsbezug.
const NOISE_NOTABLE = { night: 60, den: 70 };

/**
 * „Auf einen Blick" ohne Rechtsteil (REPORT_LEGAL aus): nur Befunde aus den Daten — keine
 * Wege A–C, keine Kandidaten, keine Bitte an eine Behörde.
 */
export function facts(M, U) {
  const f = [];
  if (U.any) f.push({ st: "auffaellig", t: `Auffällig: ${U.best.text}.`, n: `${U.best.quelle} · rechnerisch, keine Feststellung – die trifft die Unfallkommission` });
  const acc = M.accidents;
  if (acc.n >= 5 && acc.fr / acc.n >= 0.5) f.push({ st: "hinweis", t: `${acc.fr} von ${acc.n} Unfällen mit Fuß- oder Radbeteiligung.`, n: "Unfallatlas · Vergleichswerte folgen mit einer späteren Stufe" });
  const N = M.noise;
  const night = N.night?.status === "ok" ? N.night.v : null;
  const den = N.den?.status === "ok" ? N.den.v : null;
  if ((night != null && night >= NOISE_NOTABLE.night) || (den != null && den >= NOISE_NOTABLE.den)) {
    f.push({ st: "hinweis", t: `Lärm laut Kartierung: L_DEN ${N.den.txt ?? "unter 55"}, L_Night ${N.night.txt ?? "unter 50"} dB(A).`, n: "UBA-Lärmkartierung · Kartierungswerte, keine Beurteilungspegel" });
  }
  if (!f.length) f.push({ st: "entfaellt", t: "Nach den Daten keine besonderen Befunde.", n: "Alle Werte stehen in den Abschnitten unten." });
  return f.slice(0, 3);
}

export function gegen(M, A, Cw, ans = {}) {
  const g = [];
  if (A.busOn) g.push("ÖPNV: An der Strecke hält ein Bus. Nach Rn. 13 kann „im Ausnahmefall“ auf Tempo 30 verzichtet werden, wenn der Taktfahrplan leidet. Linien und Takt sind nicht in den Daten.");
  if (ans.lanes === "2") g.push("Mehrstreifige Führung: mögliche Verlagerung in Wohnnebenstraßen; in Hamburg gesonderte Prüfung mit Zustimmung der obersten Landesbehörde.");
  if (M.road && (M.road.refClass === "B" || M.road.highway === "primary" || M.road.highway === "trunk")) g.push(`Verkehrsfunktion: ${M.streetName ?? M.road.label} ist eine Hauptverkehrsstraße. Beim Lärmschutz steht das einem Tempolimit „in der Regel“ entgegen (BayVGH 11 ZB 20.2082).`);
  const a9 = A.steps.find((x) => x.id === "A9");
  if (a9?.status === "nicht_erfuellt") g.push("Ampel zwischen den Tempo-30-Abschnitten: nach der Hamburger Richtlinie kein Verbinden.");
  g.push("Verlagerung: ob Verkehr in parallele Wohnstraßen ausweicht, lässt sich aus den Daten nicht abschätzen.");
  if (Cw) g.push("Lärmkarten sind keine Beurteilungspegel. Ob Grenz- oder Richtwerte überschritten sind, zeigt erst eine Berechnung nach RLS-19.");
  g.push("Kleine Fallzahlen: Stellen, die man wegen vieler Unfälle anklickt, liegen im Folgejahr oft niedriger (Regression zur Mitte). Darum mindestens drei Jahre.");
  g.push("OpenStreetMap ist nicht die Beschilderung vor Ort: Tempo, Straßennummer und Einrichtungen vor dem Absenden kurz prüfen.");
  return g;
}

/**
 * Alles zusammen: Regelwerk auf das Modell anwenden.
 * @param {object} M      Datenmodell (model.js)
 * @param {object} opts   { years, land, answers, beob }
 */
export function evaluate(M, { years, land, answers = {}, beob = "" }) {
  const P = params(land);
  const A = evalWegA(M, P, answers);
  const U = evalUko(M, years, P, { urban: A.sp?.urban ?? null });
  const B = evalWegB(M, years, U, answers, beob);
  const Cw = evalWegC(M, P, answers);
  return { P, A, U, B, Cw, measures: measures(M, A, U, Cw), glance: glance(M, A, U, Cw), facts: facts(M, U), gegen: gegen(M, A, Cw, answers) };
}
