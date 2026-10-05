// texts.js — Titel und Briefbausteine (Konzept § 5), Version TEXTVERSION. REIN.
// Deterministisch aus den Befunden; juristisch zu prüfen (RDG § 6 Abs. 2). Die Nutzerin
// entscheidet und versendet selbst — nichts wird gespeichert oder übertragen.
import { nearestWay } from "./roads.js";
import { FAC, facLabel, facPhrase } from "./facilities.js";
import { TYP } from "./model.js";
import { RW, TEXTVERSION } from "./rules/params.js";

const low = (t) => (t ? t[0].toLowerCase() + t.slice(1) : t);

/** Titel, Kurzname und Ortszeile des Reports. */
export function titleOf(M, place = {}) {
  const sel = M.selection;
  const ort = place.city || M.census?.gemeinde || null;
  if (sel.kind === "e") {
    const f = sel.fac;
    const titel = f ? facLabel(f) : "Einrichtung (nicht mehr in den Daten)";
    return { titel, kurz: titel, ort: [M.streetName, ort].filter(Boolean).join(", ") };
  }
  const here = M.roads
    .map((r) => ({ r, d: nearestWay(sel.center, r).d }))
    .filter((x) => x.d <= Math.max(20, Math.min(sel.r, 40)))
    .sort((a, b) => b.r.rank - a.r.rank || a.d - b.d)
    .map((x) => x.r.name || x.r.ref)
    .filter((v, i, a) => v && a.indexOf(v) === i);
  const titel = here.length >= 2 ? `Kreuzung ${here[0]} / ${here[1]}` : here.length === 1 ? `${here[0]} (Bereich ${sel.r} m)` : `Stelle ohne Straßennamen`;
  return { titel, kurz: here.length >= 2 ? `${here[0]} / ${here[1]}` : titel, ort: ort ?? "" };
}

export function briefTypes(E) {
  const { R, s } = E;
  const laermOk = !!R.Cw && R.Cw.verdict.key !== "kein" && s.answers.C8 === "ja";
  return [
    { id: "anregung", label: "Anregung", d: "Jede Person. Anspruch auf Mitteilung, wie verfahren wird (Art. 17 GG).", ok: true },
    { id: "laerm", label: "Antrag wegen Lärm", d: laermOk ? "Nur für Anwohnende. Führt zu einem Bescheid." : "Nur für Anwohnende mit Lärm-Indiz am Abschnitt (Abschnitt 6, Weg C).", ok: laermOk },
    { id: "uko", label: "Prüfbitte an die Unfallkommission", d: R.U.any ? "Ein M-Uko-Kriterium ist rechnerisch erfüllt." : "Erst, wenn ein M-Uko-Kriterium rechnerisch erfüllt ist.", ok: R.U.any },
  ];
}

const yearsTxt = (y) => (y.from === y.to ? String(y.from) : `${y.from}–${y.to}`);

/** Befunde für den Brief (höchstens fünf Sätze). */
export function befunde(E) {
  const { M, R, s, meta } = E;
  const out = [];
  const acc = M.accidents;
  const sel = M.selection;
  const where = sel.kind === "e" ? `im Umfeld von ${sel.r} m` : `im Umkreis von ${sel.r} m`;
  const stand = meta?.accidents?.vintage ? `, Datenjahre bis ${meta.accidents.vintage}` : "";
  if (acc.n >= 1) out.push(`${where[0].toUpperCase() + where.slice(1)} verzeichnet der Unfallatlas ${yearsTxt(s.years)} ${acc.n} Unfälle mit Personenschaden, ${acc.fr} davon mit Fuß- oder Radbeteiligung und ${acc.nSP} mit Getöteten oder Schwerverletzten (Unfallatlas der Statistischen Ämter${stand}).`);
  const schul = acc.win.filter((a) => a.wt >= 2 && a.wt <= 6 && R.P.schulzeit.includes(a.h)).length;
  if (acc.n >= 5 && schul >= 3 && sel.kind === "e" && ["schule", "kita", "foerderschule"].includes(R.A.typ)) out.push(`${schul} dieser Unfälle ereigneten sich werktags zu Schulzeiten (7–9 und 12–16 Uhr).`);
  for (const id of ["A4", "A0"]) {
    const x = R.A.steps.find((y) => y.id === id);
    if (x?.brief && (x.status === "erfuellt" || x.status === "hinweis")) out.push(x.brief);
  }
  const zebra = M.crossings.find((c) => c.kind === "zebra" && (sel.contains(c.p) || c.d <= 60));
  if (R.A.candidate && zebra) out.push(`Rund ${Math.round(zebra.d)} m entfernt liegt ein Fußgängerüberweg.`);
  const a9 = R.A.steps.find((x) => x.id === "A9");
  if (R.A.candidate && a9?.brief && (a9.status === "erfuellt" || a9.status === "hinweis")) out.push(a9.brief);
  if (R.U.any && s.brief !== "uko") out.push(`Nach den Kriterien des M Uko wäre eine Unfallhäufung rechnerisch gegeben (${R.U.best.text}).`);
  if (R.Cw && R.Cw.verdict.key === "stark" && s.brief !== "laerm") out.push(`Nach der Lärmkartierung des Umweltbundesamts liegt der Abschnitt in der Klasse L_DEN ${R.Cw.denTxt} / L_Night ${R.Cw.nightTxt} dB(A).`);
  return out.slice(0, 5);
}

/**
 * Briefentwurf.
 * @param {object} E  { M, R, s, place, adr, title, today, meta, link }
 */
export function buildLetter(E) {
  const { M, R, s, adr, title, place } = E;
  const A = R.A;
  const type = briefTypes(E).find((t) => t.id === s.brief && t.ok) ? s.brief : "anregung";
  const persoenlich = s.tone === "persoenlich";
  const fac = A.fac;
  const street = A.street ?? M.streetName ?? "Straße";
  const refTxt = M.road?.ref ? ` (${M.road.ref})` : "";
  const ortsname = place?.city || M.census?.gemeinde || "";
  const ortBez = M.selection.kind === "k" ? title.titel : `${street}${refTxt}`;
  const facIst = fac && ["schule", "kita", "foerderschule"].includes(A.typ);
  const rolle = {
    eltern: persoenlich
      ? `mein Kind besucht ${facIst ? facPhrase(fac, street).replace(/^der /, "die ").replace(/^dem /, "den ") : "eine Einrichtung in der Nähe"} und ist jeden Tag auf der ${street} unterwegs.`
      : `ich wende mich als Elternteil ${facIst ? `eines Kindes ${facPhrase(fac, street)}` : "eines Kindes aus dem Viertel"} an Sie.`,
    anwohner: persoenlich ? `ich wohne an der ${street} und erlebe die Situation jeden Tag.` : `ich wohne an der ${street}.`,
    initiative: `ich schreibe Ihnen für die ${s.initiative || "[Name der Initiative]"}.`,
    keine: "",
  }[s.role] ?? "";
  const lines = [];
  let subject;
  const beob = (s.beob || "").trim();
  if (type === "anregung") {
    const massK = A.candidate ? `Tempo 30 vor ${facPhrase(fac, street)}` : M.selection.kind === "k" ? "Prüfung von Maßnahmen an der Kreuzung" : "Prüfung von Maßnahmen";
    subject = `Anregung: ${massK} – ${ortBez}${ortsname ? `, ${ortsname}` : ""}`;
    if (A.candidate) {
      const von = A.seg ? `auf rund ${A.seg.len} m im Bereich der Einrichtung` : "im Bereich der Einrichtung";
      const a9 = A.steps.find((x) => x.id === "A9");
      const zf = A.zf;
      const zfP = !zf ? "zeitlich beschränkt auf die Öffnungszeiten der Einrichtung" : zf.startsWith("ganztägig") ? "ganztägig" : zf.startsWith("auf") ? "zeitlich beschränkt auf die Öffnungszeiten der Einrichtung" : `zeitlich beschränkt auf ${zf}`;
      const massL = `auf der ${street}${refTxt} ${von} eine Höchstgeschwindigkeit von 30 km/h anzuordnen, ${zfP}${a9?.status === "erfuellt" ? ", und die Strecke bis zur bestehenden Tempo-30-Strecke zu verlängern" : ""}`;
      lines.push("Sehr geehrte Damen und Herren,", "", low([rolle, `Ich rege an, ${massL}.`].filter(Boolean).join(" ")));
    } else {
      lines.push("Sehr geehrte Damen und Herren,", "", low([rolle, `Ich bitte Sie zu prüfen, ob ${M.selection.kind === "k" ? `an der ${title.titel}` : `an der ${street}`} Maßnahmen zur Verbesserung der Verkehrssicherheit in Betracht kommen.`].filter(Boolean).join(" ")));
    }
    lines.push("", "Anlass", beob || "[Deine Beobachtung fehlt noch.]", "", "Befunde (Einzelheiten und Quellen im beigefügten Report)", ...befunde(E).map((b) => `– ${b}`));
    if (A.candidate) {
      const pl = FAC[A.typ]?.plural || "Einrichtungen nach Nr. 6";
      lines.push("", `Nach § 45 Abs. 9 Satz 4 Nr. 6 StVO setzt eine streckenbezogene Beschränkung auf 30 km/h im unmittelbaren Bereich von ${pl} an Straßen des überörtlichen Verkehrs keine besondere Gefahrenlage im Sinne von Satz 3 voraus; die VwV-StVO zu Zeichen 274 (Rn. 13) sieht dies in der Regel vor.`);
      if (A.steps.find((x) => x.id === "A9")?.status === "erfuellt") lines.push("Eine Lücke von bis zu 500 m zwischen zwei Tempo-30-Strecken kann nach § 45 Abs. 9 Satz 4 Nr. 4 StVO ebenfalls ohne besondere Gefahrenlage geschlossen werden.");
      if (A.busOn) lines.push(`Mir ist bewusst, dass an der ${street} eine Buslinie verkehrt; die zeitliche Beschränkung könnte die Auswirkungen auf den Takt begrenzen.`);
    }
    lines.push("", persoenlich ? "Ich würde mich sehr freuen, von Ihnen zu hören, wie Sie mit dieser Anregung umgehen." : "Ich bitte Sie, mir mitzuteilen, wie Sie mit dieser Anregung verfahren.", "Sollten Sie nicht zuständig sein, bitte ich um Weiterleitung an die zuständige Stelle und um eine kurze Nachricht.");
    if (s.ortstermin) lines.push("Für einen Ortstermin stehe ich gern zur Verfügung.");
  } else if (type === "laerm") {
    const C = R.Cw;
    subject = `Antrag auf Lärmschutz nach § 45 Abs. 1 Satz 2 Nr. 3 StVO – ${street}${ortsname ? `, ${ortsname}` : ""}`;
    lines.push("Sehr geehrte Damen und Herren,", "", `ich wohne an der ${street}${s.hausnr ? ` ${s.hausnr}` : ""} und beantrage, zum Schutz der Wohnbevölkerung vor Lärm eine Beschränkung der Höchstgeschwindigkeit auf 30 km/h in der Zeit von 22 bis 6 Uhr für den Abschnitt vor meiner Wohnung anzuordnen.`,
      "", "Begründung",
      `– Nach der Lärmkartierung des Umweltbundesamts liegt der Abschnitt in der Pegelklasse L_DEN ${C.denTxt} dB(A) und L_Night ${C.nightTxt} dB(A). Mir ist bewusst, dass diese Werte nicht unmittelbar mit Beurteilungspegeln nach RLS-19 vergleichbar sind.`);
    if (C.ew) lines.push(`– Beidseits des Abschnitts wohnen nach dem Zensus 2022 rund ${C.ew.toLocaleString("de-DE")} Menschen.`);
    const lap = R.P.weg_c.lap;
    if (lap && C.den >= lap.lden && C.night >= lap.lnight) lines.push(`– Die Pegelklassen des Abschnitts erreichen die Auslösewerte des Hamburger Lärmaktionsplans (L_DEN ${lap.lden} / L_Night ${lap.lnight} dB(A)).`);
    lines.push(`– ${beob || "[Deine Beobachtung fehlt noch.]"}`, "", "Ich bitte Sie, die Beurteilungspegel für mein Wohngebäude nach RLS-19 zu ermitteln oder vorhandene Berechnungen heranzuziehen und über meinen Antrag durch Bescheid zu entscheiden.");
  } else {
    const k = R.U.best;
    subject = `Bitte um Prüfung in der Unfallkommission – ${ortBez}${ortsname ? `, ${ortsname}` : ""}`;
    const w = M.accidents.inSel.filter((a) => a.j >= s.years.to - 2 && a.j <= s.years.to);
    const top = Object.entries(TYP).map(([t, label]) => [label, w.filter((a) => a.typ === Number(t)).length]).sort((a, b) => b[1] - a[1])[0];
    const typSatz = w.length >= 5 && top && top[1] / w.length >= 0.4 ? `; ${top[1]} davon gehören zum Typ „${top[0]}“` : "";
    const where = M.selection.kind === "k" ? `für den Bereich ${title.titel} (${M.selection.r} m um die Stelle)` : `für das Umfeld von „${fac ? facLabel(fac) : "Einrichtung"}“ (${M.selection.r} m)`;
    lines.push("Sehr geehrte Damen und Herren,", "", `im Unfallatlas der Statistischen Ämter sind ${where} in den Jahren ${R.U.window} ${w.length} Unfälle mit Personenschaden verzeichnet, davon ${w.filter((a) => a.kat <= 2).length} mit Getöteten oder Schwerverletzten${typSatz}. Damit wäre das Kriterium „${k.text}“ (${k.quelle}) rechnerisch erfüllt. Die Auswertung beruht allein auf Unfällen mit Personenschaden; ob eine Unfallhäufungsstelle vorliegt, stellt die Unfallkommission fest.`,
      "", "Ich bitte Sie, die Stelle – falls noch nicht geschehen – in der Unfallkommission zu behandeln, und um eine kurze Mitteilung, ob sie dort bereits bekannt ist.", "", beob || "[Deine Beobachtung fehlt noch.]");
  }
  lines.push("", "Mit freundlichen Grüßen", s.name || "[Name]", type === "laerm" ? (s.anschrift || "[Anschrift]") : (s.kontakt || ""));
  const cc = [];
  if (s.cc?.polizei) cc.push("Polizei (Mitglied der Unfallkommission)");
  if (s.cc?.bv) cc.push("Bezirks- bzw. Gemeindevertretung");
  if (cc.length) lines.push("", `Nachrichtlich: ${cc.join("; ")}`);
  lines.push("", `Anlage: Report „${title.titel}“ (PDF), erstellt am ${E.today} mit der Unfallkarte (Regelwerk ${RW.version}, Textbausteine ${TEXTVERSION})`);
  const body = lines.join("\n").replace(/\n{3,}/g, "\n\n");
  return { type, subject, body, to: adr };
}
