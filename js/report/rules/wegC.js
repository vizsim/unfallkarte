// wegC.js — Weg C: Lärm (§ 45 Abs. 1 S. 2 Nr. 3 StVO), Entwurf (Konzept § 4.4). REIN.
// Der Report liefert Indizien und die Bitte um eine Berechnung nach RLS-19: Kartierungswerte
// (L_DEN/L_Night) sind keine Beurteilungspegel (LAI 2022). Ausnahme: Landesschwellen, die selbst
// in L_DEN/L_Night definiert sind (Hamburger Lärmaktionsplan) — dort ist der Vergleich sauber.
// Nur Hauptverkehrsstraßen sind kartiert: „keine Kartierung" heißt nicht „leise".

/** @returns {null | {steps, verdict, den, night, denTxt, nightTxt, ew, gebiet}} */
export function evalWegC(M, P, ans = {}) {
  const N = M.noise;
  if (N.den?.status !== "ok" || N.night?.status !== "ok") return null;
  if (N.den.v == null && N.night.v == null) return null; // keine Kartierung am Abschnitt
  const PC = P.weg_c;
  const steps = [];
  const band = M.census?.band;
  const ew = band?.ew ?? null;
  steps.push({ id: "C1", t: "Wohnbevölkerung", status: ew > 0 ? "erfuellt" : "unklar", mod: true,
    txt: ew != null ? `Rund ${ew.toLocaleString("de-DE")} Einwohner in Zensuszellen beidseits des Abschnitts (${band.width}-m-Band, ±150 m um die Stelle).${band.secret ? " Einzelne Zellen sind geheimgehalten – eher mehr." : ""}` : "Zensus nicht verfügbar.",
    data: "Zensus 2022 · 100-m-Gitter, Zellen anteilig (Zelle ≠ Fassade)" });
  const den = N.den.v;
  const night = N.night.v;
  steps.push({ id: "C2", t: "Lärmkartierung", status: "erfuellt",
    txt: `L_DEN ${N.den.txt ?? "unter 55"} dB(A), L_Night ${N.night.txt ?? "unter 50"} dB(A) am Abschnitt (höchste Klasse im 25-m-Band).`,
    data: "UBA-Lärmkartierung (END), Kartierungswerte – keine Beurteilungspegel" });
  const gebiet = ans.C6 || "WA";
  const g16 = gebiet === "MI" ? 54 : 49;
  const lsr = gebiet === "MI" ? 62 : 60;
  steps.push({ id: "C3", t: "Indiz 16. BImSchV (nachts)", status: night != null && night >= g16 ? "hinweis" : "entfaellt",
    txt: night != null && night >= g16 ? `Nachts könnte der Wert der 16. BImSchV für ${gebiet} (${g16} dB(A)) erreicht sein. Kartierungswerte sind nicht unmittelbar vergleichbar – Berechnung nach RLS-19 erbitten.` : "Kein Indiz.",
    data: "§ 2 Abs. 1 16. BImSchV; LAI 2022" });
  const strong = (night != null && night >= lsr) || (den != null && den >= 70);
  steps.push({ id: "C4", t: "Indiz LSR-StV", status: strong ? "hinweis" : "entfaellt",
    txt: strong ? `Starkes Indiz: Der Richtwert der Lärmschutz-Richtlinien-StV für ${gebiet} (nachts ${lsr} dB(A)) könnte erreicht sein. Dann kann sich das Ermessen zur Pflicht verdichten – nicht automatisch.` : "Kein Indiz.",
    data: "LSR-StV 2007 Nr. 2.1" });
  if (PC.lap) {
    // Kartierung in 5-dB-Klassen: die Klasse „65–69" erreicht den Auslösewert 65 dB(A).
    const over = den != null && night != null && den >= PC.lap.lden && night >= PC.lap.lnight;
    steps.push({ id: "C5", t: "Landesschwelle (Hamburg)", status: over ? "auffaellig" : "nicht_erreicht",
      txt: over ? `Die Pegelklassen erreichen die Auslösewerte des Hamburger Lärmaktionsplans (L_DEN ${PC.lap.lden}, L_Night ${PC.lap.lnight} dB(A)).${den >= PC.lap.vorrang[0] && night >= PC.lap.vorrang[1] ? " Im Vorrangbereich (70/60)." : ""} Typische Maßnahme dort: Tempo 30 nachts.` : "Unter den Auslösewerten des Lärmaktionsplans (65/55 dB(A)).",
      data: "Lärmaktionsplan Hamburg, 4. Stufe (Schwellen in L_DEN/L_Night – direkt vergleichbar)" });
  } else if (PC.bw) {
    steps.push({ id: "C5", t: "Landesschwelle (Baden-Württemberg)", status: "hinweis",
      txt: `Der BW-Erlass nennt ${PC.bw.tag}/${PC.bw.nacht} dB(A) (Beurteilungspegel) als Schwelle, ab der sich das Ermessen verdichtet, +2 dB(A) als grundsätzliche Pflicht. Prüfbar nur mit einer Berechnung nach RLS-19.`,
      data: "Kooperationserlass-Lärmaktionsplanung BW 2023, Abschn. 2.5.1" });
  }
  steps.push({ id: "C6", t: "Gebietsart", status: ans.C6 ? "erfuellt" : "unklar", nutz: !!ans.C6,
    txt: ans.C6 ? `Angabe: ${ans.C6 === "WA" ? "Wohngebiet (WA)" : "Mischgebiet (MI)"}.` : "Nicht in den Daten (Bebauungsplan). Voreinstellung: Wohngebiet (strenger).",
    data: "Angabe der Nutzerin", ask: { key: "C6", q: "Welche Gebietsart ist es?", opts: [["WA", "eher Wohngebiet"], ["MI", "eher Mischgebiet"]] } });
  const road = M.road;
  if (road && (road.refClass === "B" || road.highway === "primary" || road.highway === "trunk")) {
    steps.push({ id: "C7", t: "Verkehrsfunktion", status: "hinweis", gegen: true,
      txt: `${road.ref || M.streetName} ist eine Hauptverkehrsstraße. Deren Verkehrsfunktion steht einem Tempolimit „in der Regel“ entgegen – ein Gegenargument für die Abwägung.`,
      data: "BayVGH 11 ZB 20.2082, Leitsatz 2" });
  }
  steps.push({ id: "C8", t: "Eigene Betroffenheit", status: ans.C8 === "ja" ? "erfuellt" : ans.C8 === "nein" ? "entfaellt" : "unklar", nutz: !!ans.C8,
    txt: ans.C8 === "ja" ? "Du wohnst am Abschnitt: ein Antrag (mit Bescheid) ist möglich." : ans.C8 === "nein" ? "Du wohnst nicht am Abschnitt: möglich ist eine Anregung." : "Wohnst du am Abschnitt? Davon hängt ab, ob ein Antrag möglich ist.",
    data: "Angabe der Nutzerin", ask: { key: "C8", q: "Wohnst du an diesem Abschnitt?", opts: [["ja", "ja"], ["nein", "nein"]] } });
  const weak = night != null && night >= g16;
  const verdict = strong ? { key: "stark", label: "starkes Indiz – Berechnung erbitten", cls: "warn" }
    : weak ? { key: "indiz", label: "Indiz – Berechnung erbitten", cls: "info" }
      : { key: "kein", label: "kein Indiz", cls: "neutral" };
  return { steps, verdict, den, night, denTxt: N.den.txt ?? "unter 55", nightTxt: N.night.txt ?? "unter 50", ew, gebiet };
}
