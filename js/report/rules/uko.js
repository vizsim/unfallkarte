// uko.js — M-Uko-Kriterien, rechnerisch (Konzept § 4.5). REIN.
//
// Grundlage: M Uko 2012, zitiert nach der RLP-VwV „Örtliche Untersuchung der
// Straßenverkehrsunfälle" (Stand 2022); NRW-Werte aus dem Gem. RdErl. 2017 (Wiedergabe Stadt
// Bielefeld). Der Unfallatlas kennt nur Unfälle MIT Personenschaden: Kriterien, die alle
// Kategorien zählen (1-Jahres-Karte), sind damit nur als Untergrenze prüfbar — erreicht schon
// U(P) die Schwelle, ist es erfüllt, sonst bleibt es offen. „Erfüllt" heißt immer „rechnerisch";
// ob eine Unfallhäufungsstelle vorliegt, stellt die Unfallkommission fest.
// Die IDs sind für report/uko_rules.json gedacht, das Sc9 und Report künftig teilen (TODO R8/R14).
import { dist, nearestOnLine } from "../geometry.js";

export const UKO_DEF = {
  mu_3jk_up5: { text: "≥ 5 Unfälle mit Personenschaden in 3 Jahren, Ausdehnung ≤ 50 m", quelle: "M Uko 2012, 3-Jahres-Karte (Unfallhäufungsstelle innerorts)" },
  mu_uhl_typ4: { text: "≥ 3 Unfälle Typ 4 (Überschreiten) in 3 Jahren, Abstand ≤ 300 m", quelle: "M Uko 2012, Unfallhäufungslinie Typ 4 innerorts" },
  mu_1jk_gtyp5_untergrenze: { text: "≥ 5 Unfälle gleichen Typs in 1 Jahr (alle Kategorien)", quelle: "M Uko 2012, 1-Jahres-Karte – mit dem Unfallatlas nur als Untergrenze prüfbar" },
  nw_3jk_fussrad_up5: { text: "≥ 5 Unfälle mit Personenschaden und Fuß- oder Radbeteiligung in 3 Jahren", quelle: "Grenzwert NRW (Gem. RdErl. 2017, Wiedergabe Stadt Bielefeld)" },
  nw_3jk_usp3: { text: "≥ 3 Unfälle mit Getöteten oder Schwerverletzten in 3 Jahren", quelle: "Grenzwert NRW (Gem. RdErl. 2017)" },
  nw_1jk_gtyp3_untergrenze: { text: "≥ 3 Unfälle gleichen Typs in 1 Jahr (alle Kategorien)", quelle: "Grenzwert NRW – nur als Untergrenze prüfbar" },
  sn_1jk_ausserorts_gtyp7_untergrenze: { text: "außerorts: ≥ 7 Unfälle gleichen Typs in 1 Jahr (alle Kategorien)", quelle: "VwV Sachsen 2020 – nur als Untergrenze prüfbar" },
};

const HALF = 25; // Ausdehnung ≤ 50 m: je Unfall die Nachbarn im Umkreis von 25 m

/** Größte Gruppe (≥ min) von Unfällen, die im 25-m-Umkreis eines Unfalls liegen. */
function densest(list, pred = () => true) {
  let best = { k: 0, at: null };
  const cand = list.filter(pred);
  for (const a of cand) {
    const k = cand.filter((b) => dist(a.p, b.p) <= HALF).length;
    if (k > best.k) best = { k, at: a.p };
  }
  return best;
}

/**
 * @param {object} M       Datenmodell (model.js)
 * @param {{from: number, to: number}} years
 * @param {object} P       params(land)
 * @param {{urban: boolean|null}} [ctx]
 */
export function evalUko(M, years, P, { urban = null } = {}) {
  const to = years.to;
  const from3 = to - 2;
  const ok3 = years.from <= from3;
  const acc3 = M.accidents.inSel.filter((a) => a.j >= from3 && a.j <= to);
  const res = [];
  for (const id of P.uko) {
    const def = UKO_DEF[id];
    let status;
    let detail;
    const oneYear = id.includes("_1jk_");
    if (!ok3 && !oneYear) {
      res.push({ id, ...def, status: "unklar", detail: "Zeitfenster kürzer als 3 Jahre – so nicht prüfbar." });
      continue;
    }
    if (id === "mu_3jk_up5") {
      const b = densest(acc3);
      status = b.k >= 5 ? "erfuellt" : "nicht_erfuellt";
      detail = `höchstens ${b.k} Unfälle mit Personenschaden in 50 m (${from3}–${to})`;
    } else if (id === "nw_3jk_usp3") {
      const b = densest(acc3, (a) => a.kat <= 2);
      status = b.k >= 3 ? "erfuellt" : "nicht_erfuellt";
      detail = `höchstens ${b.k} Unfälle mit Getöteten/Schwerverletzten in 50 m (${from3}–${to})`;
    } else if (id === "nw_3jk_fussrad_up5") {
      const b = densest(acc3, (a) => a.bet.includes("IstFuss") || a.bet.includes("IstRad"));
      status = b.k >= 5 ? "erfuellt" : "nicht_erfuellt";
      detail = `höchstens ${b.k} Fuß-/Radunfälle in 50 m (${from3}–${to})`;
    } else if (id === "mu_uhl_typ4") {
      if (!M.chain) {
        status = "unklar";
        detail = "keine Straße in den Daten";
      } else {
        const s = acc3.filter((a) => a.typ === 4).map((a) => nearestOnLine(a.p, M.chain.line)).filter((h) => h.d <= 20).map((h) => h.s).sort((x, y) => x - y);
        let run = s.length ? 1 : 0;
        let best = run;
        for (let i = 1; i < s.length; i++) { run = s[i] - s[i - 1] <= 300 ? run + 1 : 1; best = Math.max(best, run); }
        status = best >= 3 ? "erfuellt" : "nicht_erfuellt";
        detail = `${s.length} Unfälle Typ 4 an der ${M.streetName ?? "Straße"} (${from3}–${to}), längste Kette ${best}`;
      }
    } else {
      // 1-Jahres-Karten: nur Untergrenze (Sachschäden fehlen im Unfallatlas).
      const need = id === "mu_1jk_gtyp5_untergrenze" ? 5 : id === "nw_1jk_gtyp3_untergrenze" ? 3 : 7;
      if (id.startsWith("sn_") && urban !== false) {
        res.push({ id, ...def, status: "entfaellt", detail: "gilt nur außerorts" });
        continue;
      }
      let best = { k: 0 };
      for (let y = Math.max(years.from, from3); y <= to; y++) {
        for (let t = 1; t <= 7; t++) {
          const b = densest(M.accidents.inSel.filter((a) => a.j === y && a.typ === t));
          if (b.k > best.k) best = { k: b.k, y, t };
        }
      }
      status = best.k >= need ? "erfuellt" : "unklar";
      detail = best.k >= need
        ? `schon mit Unfällen mit Personenschaden erreicht (${best.k} im Jahr ${best.y})`
        : `mit Personenschaden höchstens ${best.k} – Sachschäden fehlen im Unfallatlas, daher offen`;
    }
    res.push({ id, ...def, status, detail });
  }
  const hit = res.find((r) => r.status === "erfuellt");
  return { list: res, any: !!hit, best: hit || null, window: `${from3}–${to}`, ok3 };
}
