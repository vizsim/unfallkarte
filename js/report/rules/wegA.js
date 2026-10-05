// wegA.js — Weg A: Tempo 30 vor Einrichtungen ohne besondere Gefahrenlage
// (§ 45 Abs. 1 S. 1, Abs. 9 S. 4 Nr. 6 und Nr. 4 StVO; VwV zu Z. 274 Rn. 13–13b). REIN.
//
// Pflichtschritte A0–A5 bestimmen das Urteil (Konzept § 4.1/4.2); A6–A9 sind Ausgestaltung und
// Abwägung. Nutzerangaben (NUTZ) lösen nur „unklar" auf — ein „nicht erfüllt" aus den Daten
// bleibt stehen. Jeder Schritt nennt das Datenfeld, aus dem er stammt.
import { nearestOnLine } from "../geometry.js";
import { wayAt, REF_LABEL, MAJOR } from "../roads.js";
import { FAC, ASK_TYPE, facLabel } from "../facilities.js";

const PFLICHT = ["A0", "A1", "A2", "A3", "A4", "A5"];
const ABOVE = (v) => v == null || v > 30; // unbekanntes Tempo verlängert den Vorschlag nicht künstlich, sperrt ihn aber auch nicht
const yesNo = [["ja", "ja"], ["nein", "nein"], ["", "weiß nicht"]];

/** Einrichtung, für die Weg A geprüft wird. */
export function pickFacility(M) {
  if (M.selection.kind === "e") return M.selection.fac;
  const cand = M.facilities
    .filter((f) => f.status !== "nicht_erfuellt" && f.dRoad != null && f.dRoad <= 60 && f.dSel <= M.selection.r + 150)
    .sort((a, b) => (a.status === "erfuellt" ? 0 : 1) - (b.status === "erfuellt" ? 0 : 1) || a.dRoad - b.dRoad);
  return cand[0] ?? null;
}

/** Lage der Einrichtung auf der Straßenkette (Bogenlänge s, Fußpunkt q). */
export function frontOnChain(M, fac) {
  if (!M.chain) return null;
  if (!fac || !fac.centroid) return { s: M.chain.s, q: M.chain.q, d: 0 };
  // Lot vom Schwerpunkt = Mitte der Straßenfront (wie im Datenmodell).
  const h = nearestOnLine(fac.centroid, M.chain.line);
  return { s: h.s, q: h.q, d: h.d };
}

/** Vorschlag ±half m um s, aber nicht in bestehende Tempo-30-Abschnitte hinein. */
export function segmentAround(profile, s, half, length) {
  let a = Math.max(0, s - half);
  let b = Math.min(length, s + half);
  for (const p of profile) {
    if (ABOVE(p.v)) continue;
    if (p.s1 <= s && p.s1 > a) a = p.s1;
    if (p.s0 >= s && p.s0 < b) b = p.s0;
  }
  return { a, b, len: Math.round(b - a) };
}

/**
 * @param {object} M        Datenmodell
 * @param {object} P        params(land)
 * @param {Record<string,string>} ans  Nutzerangaben
 */
export function evalWegA(M, P, ans = {}) {
  const PA = P.weg_a;
  const steps = [];
  const push = (o) => steps.push(o);
  const road = M.road;
  const fac = pickFacility(M);
  const street = M.streetName ?? road?.label ?? "Straße";
  const refTxt = road?.ref ? ` (${road.ref})` : "";

  if (!road || !M.chain) {
    push({ id: "A0", t: "Straße", status: "unklar", txt: "An der Auswahl liegt keine Straße aus den OSM-Kacheln.", data: "OSM highways / highways_minor" });
    return { steps, verdict: { key: "keine_strasse", label: "keine Straße in den Daten", cls: "neutral" }, fac, road, candidate: false };
  }

  const fr = frontOnChain(M, fac);
  const way = wayAt(M.chain, fr.s);
  const sp = way?.speed ?? { v: null };
  const osmSpeed = `OSM maxspeed=${way?.props.maxspeed ?? "–"}${way?.props.maxspeed_type ? ` · maxspeed:type=${way.props.maxspeed_type}` : ""}${way?.props.maxspeed_conditional ? ` · conditional=${way.props.maxspeed_conditional}` : ""}`;

  // A0 Tempo heute
  if (sp.v == null) {
    push({ id: "A0", t: "Tempo heute", status: "unklar", txt: `Für die ${street} ist in OpenStreetMap kein Tempo eingetragen${sp.note ? ` (${sp.note})` : ""}. Beschilderung vor Ort prüfen.`, data: osmSpeed });
  } else if (sp.v <= 30) {
    push({ id: "A0", t: "Tempo heute", status: "entfaellt", txt: sp.zone ? `Hier gilt bereits Tempo ${sp.v} (Zone).` : `Hier gilt bereits höchstens ${sp.v} km/h.`, data: osmSpeed });
  } else if (sp.cond && sp.cond.v <= 30) {
    push({ id: "A0", t: "Tempo heute", status: "hinweis", txt: `Grundsätzlich ${sp.v} km/h, zeitlich beschränkt schon ${sp.cond.v} km/h (${sp.cond.when}). Zu prüfen ist, ob die Zeiten zur Einrichtung passen.`, data: osmSpeed,
      brief: `Auf der ${street}${refTxt} gilt derzeit ${sp.v} km/h, zeitweise ${sp.cond.v} km/h (${sp.cond.when}).` });
  } else {
    push({ id: "A0", t: "Tempo heute", status: "erfuellt", txt: `Auf der ${street} gilt ${sp.v} km/h${sp.derived ? " (abgeleitet aus der Ortslage, kein eigenes Schild in OSM)" : ""}${sp.dir ? `, ${sp.dir}` : ""}.`, data: osmSpeed,
      brief: `Auf der ${street}${refTxt} gilt derzeit ${sp.v} km/h (laut OpenStreetMap).` });
  }

  // A1 innerorts
  if (sp.urban === true) push({ id: "A1", t: "Innerorts", status: "erfuellt", txt: "Der Abschnitt liegt innerhalb geschlossener Ortschaft.", data: `OSM ${way?.props.maxspeed_type ? "maxspeed:type" : "zone:traffic"}=${sp.type ?? "DE:urban"}` });
  else if (sp.urban === false) push({ id: "A1", t: "Innerorts", status: "nicht_erfuellt", txt: "Laut OSM liegt der Abschnitt außerorts. Nr. 6 gilt nur innerorts.", data: `OSM maxspeed:type=${sp.type}` });
  else {
    const a = ans.A1;
    push({ id: "A1", t: "Innerorts", status: a === "ja" ? "erfuellt" : a === "nein" ? "nicht_erfuellt" : "unklar", nutz: !!a,
      txt: a ? (a === "ja" ? "Innerorts – Angabe der Nutzerin." : "Außerorts – Angabe der Nutzerin.") : "Ortslage nicht in den Daten. Liegt die Stelle hinter der Ortstafel (Zeichen 310)?",
      data: "OSM maxspeed:type / zone:traffic fehlt", ask: { key: "A1", q: "Liegt die Stelle innerorts (hinter der Ortstafel)?", opts: yesNo } });
  }

  // A2 Straßenkategorie
  if (road.refClass) {
    push({ id: "A2", t: "Straßenkategorie", status: "erfuellt", txt: `${REF_LABEL[road.refClass]} ${road.ref} – Straße des überörtlichen Verkehrs.`, data: `OSM ref=${road.ref}` });
  } else if (road.highway === "motorway") {
    push({ id: "A2", t: "Straßenkategorie", status: "nicht_erfuellt", txt: "Autobahn – Nr. 6 greift hier nicht.", data: "OSM highway=motorway" });
  } else if (MAJOR.has(road.highway)) {
    const a = ans.A2;
    push({ id: "A2", t: "Straßenkategorie", status: a === "ja" ? "erfuellt" : a === "nein" ? "nicht_erfuellt" : "unklar", nutz: !!a,
      txt: a === "ja" ? "Vorfahrtstraße (Zeichen 306) – Angabe der Nutzerin." : a === "nein" ? "Keine Vorfahrtstraße – Angabe der Nutzerin. Nr. 6 greift dann nicht; in Betracht kommt eine Tempo-30-Zone (§ 45 Abs. 1c)." : "Hauptstraße ohne Straßennummer: Ist sie Vorfahrtstraße (Zeichen 306)? Vor Ort oder in Mapillary prüfen.",
      data: `OSM highway=${road.highway}, kein ref (priority_road fehlt in den Kacheln)`, ask: { key: "A2", q: `Ist die ${street} Vorfahrtstraße (Zeichen 306)?`, opts: yesNo } });
  } else {
    push({ id: "A2", t: "Straßenkategorie", status: "nicht_erfuellt", txt: "Nebenstraße: Nr. 6 greift nicht. In Betracht kommt eine Tempo-30-Zone (§ 45 Abs. 1c, Nr. 4) oder eine Anordnung nach Abs. 1.", data: `OSM highway=${road.highway}` });
  }

  // A3 Einrichtung
  let typ = fac ? fac.typ : null;
  if (!fac) {
    const missing = M.selection.kind === "e" && M.selection.facMissing;
    push({ id: "A3", t: "Einrichtung nach Nr. 6", status: missing ? "unklar" : "nicht_erfuellt",
      txt: missing ? "Die Einrichtung aus dem Link ist nicht mehr in den OSM-Kacheln. Ausgewertet wird die Koordinate." : `Im Umfeld liegt keine Einrichtung nach Nr. 6 direkt an der ${street}.`,
      data: "OSM: Schulen, Kitas, Spielplätze, Gesundheit/Pflege" });
  } else if (fac.status === "unklar" && ASK_TYPE[fac.typ]) {
    const a = ans.A3;
    const ask = ASK_TYPE[fac.typ];
    if (a === "ja") typ = ask.yes;
    push({ id: "A3", t: "Einrichtung nach Nr. 6", status: a === "ja" ? "erfuellt" : a === "nein" ? "nicht_erfuellt" : "unklar", nutz: !!a,
      txt: a === "ja" ? `${facLabel(fac)}: ${FAC[ask.yes].nr6} – Angabe der Nutzerin.` : a === "nein" ? `${facLabel(fac)}: nach Angabe der Nutzerin keine Einrichtung nach Nr. 6.` : `${facLabel(fac)}: ${fac.why}.`,
      data: `OSM ${fac.osm}`, ask: { key: "A3", q: ask.q, opts: yesNo } });
  } else {
    push({ id: "A3", t: "Einrichtung nach Nr. 6", status: fac.status,
      txt: fac.status === "erfuellt" ? `${facLabel(fac)}: ${FAC[fac.typ].nr6}${fac.why.startsWith("laut") ? " (laut Name)" : ""}.${fac.typ === "spielplatz" ? " Öffentlich zugänglich? Das steht nicht in den Kacheln." : ""}` : `${facLabel(fac)}: ${fac.why}. Nr. 6 erfasst nur allgemeinbildende Schulen und Förderschulen.`,
      data: `OSM ${fac.osm}` });
  }
  const erfasst = !!fac && steps.at(-1).status !== "nicht_erfuellt";

  // A4 Lage an der Straße
  if (fac) {
    const d = Math.round(fac.dRoad ?? Infinity);
    let status = d <= PA.anliegend_m ? "erfuellt" : d <= PA.anliegend_unklar_m ? "unklar" : "nicht_erfuellt";
    let nutz = false;
    if (status === "unklar" && ans.A4) { status = ans.A4 === "ja" ? "erfuellt" : "nicht_erfuellt"; nutz = true; }
    push({ id: "A4", t: "Lage an der Straße", status, nutz,
      txt: `Abstand zur ${street}: rund ${d} m (erfüllt bis ${PA.anliegend_m} m, unklar bis ${PA.anliegend_unklar_m} m).${nutz ? ` Angabe der Nutzerin: ${ans.A4 === "ja" ? "grenzt an die Straße" : "grenzt nicht an die Straße"}.` : ""}`,
      data: "Abstand Fläche/Punkt – Straßenachse (eigene Operationalisierung wie Sc6)",
      ask: d > PA.anliegend_m && d <= PA.anliegend_unklar_m ? { key: "A4", q: `Grenzt das Grundstück an die ${street}?`, opts: yesNo } : null,
      brief: status !== "erfuellt" ? null : nutz ? `${facLabel(fac)} (${FAC[typ]?.nr6 ?? FAC[fac.typ].noun}) grenzt an die ${street}.` : `${facLabel(fac)} (${FAC[typ]?.nr6 ?? FAC[fac.typ].noun}) liegt unmittelbar an der ${street} (rund ${d} m laut OpenStreetMap).` });
  }

  // A5 Zugang
  if (fac && erfasst) {
    const aZ = ans.A5;
    const aQ = ans.A5q;
    let status = "unklar";
    let txt = `Der Eingang steht nicht in den Daten. Liegt der Haupteingang an der ${street}?`;
    if (aZ === "ja") { status = "erfuellt"; txt = `Haupteingang an der ${street} – Angabe der Nutzerin.`; }
    else if (aZ === "nein" && aQ === "ja") { status = "erfuellt"; txt = "Kein Eingang an der Straße, aber starker Hol- und Bringverkehr bzw. eine Haltestelle davor – Angabe der Nutzerin (Rn. 13: „oder“)."; }
    else if (aZ === "nein" && aQ === "nein") { status = "nicht_erfuellt"; txt = "Weder Eingang noch starker Ziel- und Quellverkehr an dieser Straße – Angabe der Nutzerin."; }
    const stop = M.stops.find((x) => Math.hypot(x.p[0] - fr.q[0], x.p[1] - fr.q[1]) <= 50);
    push({ id: "A5", t: "Zugang zur Straße", status, txt, nutz: !!aZ,
      data: `OSM entrance: nicht in den Kacheln${stop ? ` · Indiz: Haltestelle „${stop.name ?? "ohne Namen"}“ ≤ 50 m` : ""}`,
      ask: aZ === "nein" ? { key: "A5q", q: "Gibt es dort starken Hol- und Bringverkehr oder eine Haltestelle vor der Einrichtung?", opts: [["ja", "ja"], ["nein", "nein"]] }
        : { key: "A5", q: `Liegt der Haupteingang an der ${street}?`, opts: yesNo },
      hilfe: PA.eingang ?? "Prüfhilfe: Welchen Eingang nutzen die Menschen tatsächlich?" });
  }

  // A6 Streckenvorschlag (±150 m, nicht in bestehende Tempo-30-Abschnitte)
  let seg = null;
  if (erfasst && sp.v != null && sp.v > 30) {
    seg = segmentAround(M.profile, fr.s, 150, M.chain.length);
    push({ id: "A6", t: "Streckenlänge", status: seg.len <= PA.laenge_max_m ? "erfuellt" : "hinweis",
      txt: `Vorschlag: rund ${seg.len} m entlang der ${street}, bis zu 150 m beidseits der Einrichtung (höchstens ${PA.laenge_max_m} m).`, data: "VwV zu Z. 274 Rn. 13" });
  }

  // A7 Zeitfenster
  let zf = null;
  if (erfasst && sp.v != null && sp.v > 30) {
    const key = FAC[typ]?.zf;
    const land = PA.zeitfenster?.[key];
    zf = land || (["pflegeheim", "krankenhaus"].includes(typ) ? "ganztägig" : "auf die Öffnungszeiten beschränkt");
    push({ id: "A7", t: "Zeitfenster", status: "hinweis",
      txt: land ? `Landesregel: ${land}.` : ["pflegeheim", "krankenhaus"].includes(typ) ? "Heime und Krankenhäuser sind durchgehend in Betrieb; eine zeitliche Beschränkung liegt nicht nahe." : "Auf die festgelegten Öffnungszeiten beschränken, einschließlich Nach- und Nebennutzungen.",
      data: land ? "HRVV T30 Ziff. II 3" : "VwV zu Z. 274 Rn. 13", zf });
  }

  // A8 ÖPNV und Verlagerung
  let busOn = false;
  if (seg) {
    busOn = M.stops.some((x) => x.mode === "bus" && x.chain.d <= 20 && x.chain.s >= seg.a && x.chain.s <= seg.b);
    const lanes = ans.lanes;
    let status = "hinweis";
    let txt = busOn ? "An der Strecke liegt eine Bushaltestelle: Auswirkungen auf den Takt sind abzuwägen (Rn. 13, Ausnahmefall)." : "Keine Bushaltestelle an der Strecke (laut OSM).";
    if (lanes === "2" && PA.mehrstreifig_ab) txt += " Mehrstreifig (≥ 2 Fahrstreifen je Richtung): gesonderte Prüfung, Zustimmung der obersten Landesbehörde (HRVV I 4).";
    else if (lanes === "2") txt += " Zwei Fahrstreifen je Richtung: mögliche Verlagerung in Wohnstraßen prüfen.";
    else if (lanes === "1" && PA.mehrstreifig_ab) { txt += " Einstreifig: nach der HRVV grundsätzlich verträglich."; if (!busOn) status = "erfuellt"; }
    push({ id: "A8", t: "ÖPNV und Verlagerung", status, txt, nutz: !!lanes, gegen: busOn,
      data: "OSM Haltestellen · Fahrstreifen (lanes) nicht in den Kacheln",
      ask: lanes ? null : { key: "lanes", q: `Wie viele Fahrstreifen hat die ${street} je Richtung?`, opts: [["1", "einer"], ["2", "zwei oder mehr"]] } });
  }

  // A9 Lückenschluss (Nr. 4)
  let gapInfo = null;
  if (seg) {
    // Endet der Vorschlag genau an einer bestehenden Tempo-30-Strecke (Lücke ~0), ist das eine
    // Verlängerung, kein Lückenschluss — gesucht wird dann die nächste echte Lücke.
    let best = null;
    let adjacent = null;
    for (const x of M.profile) {
      if (ABOVE(x.v)) continue;
      const gap = x.s0 >= seg.b ? x.s0 - seg.b : seg.a >= x.s1 ? seg.a - x.s1 : 0;
      const side = x.s0 >= seg.b ? [seg.b, x.s0] : [x.s1, seg.a];
      if (gap <= 5) { adjacent ??= { x }; continue; }
      if (!best || gap < best.gap) best = { gap, x, side };
    }
    const lesbar = Math.round(Math.min(fr.s, M.chain.length - fr.s));
    if ((!best || best.gap > PA.lueckenschluss_max_m) && adjacent) {
      const art = adjacent.x.zone ? "Zone" : "Strecke";
      gapInfo = { gap: 0, art, adjacent: true };
      push({ id: "A9", t: "Lückenschluss (Nr. 4)", status: "hinweis", txt: `Der Vorschlag schließt direkt an eine bestehende Tempo-30-${art} an – das wäre eine Verlängerung, kein Lückenschluss.`, data: "OSM maxspeed entlang derselben Straße",
        brief: `Der vorgeschlagene Abschnitt schließt an die bestehende Tempo-30-${art} an.` });
    } else if (!best || best.gap > PA.lueckenschluss_max_m) {
      push({ id: "A9", t: "Lückenschluss (Nr. 4)", status: "entfaellt", txt: `Keine Tempo-30-Strecke oder -Zone innerhalb von ${PA.lueckenschluss_max_m} m entlang der ${street}${lesbar < 650 ? ` (die Straße ist in den Daten nur ${lesbar} m weit verfolgbar)` : ""}.`, data: "OSM maxspeed entlang derselben Straße (Name/Nummer)" });
    } else {
      const [lo, hi] = best.side;
      const lsa = M.crossings.some((c) => c.kind === "lsa" && c.chain.d <= 15 && c.chain.s > lo && c.chain.s < hi);
      const art = best.x.zone ? "Zone" : "Strecke";
      gapInfo = { gap: Math.round(best.gap), art, s0: lo, s1: hi, lsa };
      if (lsa && PA.lueckenschluss_nicht_ueber_lsa) {
        push({ id: "A9", t: "Lückenschluss (Nr. 4)", status: "nicht_erfuellt", txt: `Die Lücke zur Tempo-30-${art} misst rund ${gapInfo.gap} m, dazwischen liegt aber eine Ampel. Nach der HRVV wird nicht über Ampelknoten verbunden.`, data: "HRVV T30 Ziff. II 2 · OSM crossing=traffic_signals" });
      } else {
        push({ id: "A9", t: "Lückenschluss (Nr. 4)", status: "erfuellt", txt: `Bis zur Tempo-30-${art} sind es entlang der ${street} rund ${gapInfo.gap} m (≤ ${PA.lueckenschluss_max_m} m): Verbinden ist ohne Gefahrenlage möglich.${lsa ? " Dazwischen liegt eine Ampel." : ""}`,
          data: "§ 45 Abs. 9 S. 4 Nr. 4 StVO · OSM maxspeed", gap: gapInfo.gap,
          brief: `Bis zur bestehenden Tempo-30-${art} sind es entlang der ${street} rund ${gapInfo.gap} m.` });
      }
    }
  }

  // Urteil
  const pflicht = steps.filter((x) => PFLICHT.includes(x.id));
  let verdict;
  if (M.selection.kind === "e" && M.selection.facMissing) verdict = { key: "fehlt", label: "Einrichtung nicht in den Daten – bitte neu auswählen", cls: "warn" };
  else if (steps[0].status === "entfaellt") verdict = { key: "entfaellt", label: "entfällt – Tempo 30 gilt bereits", cls: "neutral" };
  else if (steps[0].status === "hinweis" && !pflicht.some((x) => x.status === "nicht_erfuellt")) verdict = { key: "zeitweise", label: "Tempo 30 gilt schon zeitweise – Zeiten prüfen", cls: "info" };
  else if (pflicht.some((x) => x.status === "nicht_erfuellt")) verdict = { key: "kein", label: "kein Kandidat nach Nr. 6", cls: "crit" };
  else if (pflicht.some((x) => x.status === "unklar")) verdict = { key: "klaerung", label: "Kandidat mit Klärungsbedarf", cls: "warn" };
  else verdict = { key: "kandidat", label: "Kandidat", cls: "good" };
  const candidate = ["kandidat", "klaerung"].includes(verdict.key) && !!fac;
  return { steps, verdict, fac, typ, road, street, front: fr, seg, sp, zf, busOn, gap: gapInfo, candidate };
}
