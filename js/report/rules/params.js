// params.js — Regelwerk-Version und Landesprofile (Konzept § 4.6). REIN.
//
// Jedes Landesprofil überschreibt nur, was vom Bund abweicht, und nennt die Quelle. Als JS statt
// JSON, weil *.json unter js/ gitignored ist (.gitignore) und die Profile Kommentare brauchen.
// Juristisch zu prüfen (RDG § 6 Abs. 2): jede Änderung hier = neue Minor-Version + CHANGELOG.

export const RW = {
  version: "0.1.0",
  stand: "26.09.2026",
  stvo: "StVO i. d. F. der 57. ÄndVO v. 02.10.2024 (BGBl. 2024 I Nr. 299), in Kraft 11.10.2024",
  vwv: "VwV-StVO i. d. F. der 12. AVwV v. 03.04.2025 (BAnz AT 09.04.2025 B2), in Kraft 10.04.2025",
};
export const TEXTVERSION = "0.1.0";

export const PROFILE = {
  bund: {
    label: "Bund (ohne Landesregeln)", quelle: "StVO, VwV-StVO",
    weg_a: {
      anliegend_m: 30,              // eigene Operationalisierung (wie Sc6), keine Norm
      anliegend_unklar_m: 60,
      laenge_max_m: 300,            // VwV zu Z. 274 Rn. 13, 13b
      lueckenschluss_max_m: 500,    // § 45 Abs. 9 S. 4 Nr. 4 StVO: „Tempo 30-Zonen … und kurzen streckenbezogenen
                                    // … 30 km/h … bis zu 500 Metern zwischen zwei Tempo 30-Strecken" (Nr. 4 deckt beides)
      lueckenschluss_nicht_ueber_lsa: false,
      zeitfenster: null,            // Bund: „auf die Öffnungszeiten beschränken" (Rn. 13)
      mehrstreifig_ab: null,
    },
    schulzeit: [7, 8, 12, 13, 14, 15], // nur Statistik: werktags 7–9 und 12–16 Uhr
    uko: ["mu_3jk_up5", "mu_uhl_typ4", "mu_1jk_gtyp5_untergrenze"],
    weg_c: { lap: null, bw: null },
  },
  hh: {
    label: "Hamburg (HRVV Tempo 30, 22.01.2026)",
    quelle: "HRVV Tempo 30 vor sensiblen Einrichtungen, BIS, 22.01.2026; Lärmaktionsplan HH, 4. Stufe",
    weg_a: {
      lueckenschluss_nicht_ueber_lsa: true, // HRVV II 2
      mehrstreifig_ab: 2,                   // HRVV I 4
      zeitfenster: {                        // HRVV II 3
        schule: "werktags 6–22 Uhr", kita: "Mo–Fr 6–19 Uhr", spielplatz: "täglich 6–19 Uhr",
        altenheim: "ganztägig", krankenhaus: "ganztägig",
        wohnheim_behinderung: "ganztägig (Wohnheime) bzw. Mo–Fr 6–19 Uhr (Werkstätten, Tagesstätten)",
      },
      eingang: "Hamburg (HRVV I 6): maßgeblich sind die tatsächlich benutzten Eingänge für Fuß und Rad; Nebenfahrbahnen zählen nicht.",
    },
    weg_c: { lap: { lden: 65, lnight: 55, vorrang: [70, 60] } }, // LAP S. 7, S. 15 f.
  },
  bw: {
    label: "Baden-Württemberg (Lärm-Erlass 2023)", quelle: "Kooperationserlass-Lärmaktionsplanung BW vom 08.02.2023",
    weg_c: { bw: { tag: 65, nacht: 55 } },
  },
  nw: {
    label: "Nordrhein-Westfalen (UKo-Erlass 2017)", quelle: "Gem. RdErl. Unfallkommission NRW vom 25.06.2017",
    uko: ["nw_3jk_fussrad_up5", "nw_3jk_usp3", "mu_3jk_up5", "mu_uhl_typ4", "nw_1jk_gtyp3_untergrenze"],
  },
  sn: {
    label: "Sachsen (VwV Unfalluntersuchung 2020)", quelle: "VwV Örtliche Unfalluntersuchung Sachsen vom 28.08.2020",
    uko: ["mu_3jk_up5", "mu_uhl_typ4", "mu_1jk_gtyp5_untergrenze", "sn_1jk_ausserorts_gtyp7_untergrenze"],
  },
};

export const LAENDER = [
  ["bw", "Baden-Württemberg"], ["by", "Bayern"], ["be", "Berlin"], ["bb", "Brandenburg"], ["hb", "Bremen"],
  ["hh", "Hamburg"], ["he", "Hessen"], ["mv", "Mecklenburg-Vorpommern"], ["ni", "Niedersachsen"],
  ["nw", "Nordrhein-Westfalen"], ["rp", "Rheinland-Pfalz"], ["sl", "Saarland"], ["sn", "Sachsen"],
  ["st", "Sachsen-Anhalt"], ["sh", "Schleswig-Holstein"], ["th", "Thüringen"],
];
export const landName = (code) => LAENDER.find(([k]) => k === code)?.[1] ?? null;

/** Wirksame Parameter für ein Land (Bund + Abweichungen). */
export function params(land) {
  const b = PROFILE.bund;
  const p = PROFILE[land] || {};
  return {
    land: land || "bund",
    label: p.label || (landName(land) ? `${landName(land)} (ohne eigene Regeln im Regelwerk)` : b.label),
    quelle: p.quelle || b.quelle,
    weg_a: { ...b.weg_a, ...(p.weg_a || {}) },
    schulzeit: p.schulzeit || b.schulzeit,
    uko: p.uko || b.uko,
    weg_c: { ...b.weg_c, ...(p.weg_c || {}) },
    hasOwn: !!PROFILE[land] && land !== "bund",
  };
}
