// addressee.js — Wer ist vermutlich Straßenverkehrsbehörde? (Konzept § 6.1). REIN.
//
// Regeltabelle je Land, angewandt auf das, was der Report über den Ort weiß: Land (Lage),
// Gemeinde (Zensus) und Kreis bzw. Stadt (Photon, OSM-Verwaltungsgrenzen). Einwohnerzahlen und
// Städtelisten (Große Kreisstadt usw.) fehlen noch (report/zustaendigkeit.json, TODO R12) —
// darum nennt der Vorschlag die Alternativen und bleibt „vermutlich". Keine Adressen erfinden:
// die Nutzerin trägt die Anschrift selbst ein; der Bundesportal-Link hilft beim Finden.

export const BUNDESPORTAL = "https://verwaltung.bund.de/leistungsverzeichnis/de/leistung/99108014042000";
const STVB = "Straßenverkehrsbehörde";

/**
 * @param {string|null} land   Länderkürzel (bw, by, …) oder "bund"/null
 * @param {{ gemeinde?: string|null, city?: string|null, county?: string|null, kreisfrei?: boolean|null, district?: string|null }} place
 * @param {{ refClass?: string|null, major?: boolean }} road
 * @returns {{ stelle: string, basis: string, sicher: string, quelle: string, alt?: string }}
 */
export function zustaendigkeit(land, place = {}, road = {}) {
  const city = place.city || place.gemeinde || null;
  const county = place.county || null;
  const kreisfrei = place.kreisfrei;
  const stadt = city ? `Stadt bzw. Gemeinde ${city}` : "Gemeinde";
  const kreis = county || "Landkreis";
  const R = (stelle, basis, sicher, quelle, alt) => ({ stelle, basis, sicher, quelle, ...(alt ? { alt } : {}) });
  const kf = (name) => R(`Stadt ${name} – ${STVB}`, `${name} ist nach den Ortsdaten vermutlich kreisfrei; kreisfreie Städte sind selbst Straßenverkehrsbehörde.`, "teilweise", "§ 44 Abs. 1 StVO; Landesrecht");

  switch (land) {
    case "bw":
      if (kreisfrei && city) return kf(city);
      return R(`Landratsamt ${kreis} – ${STVB} (untere Verwaltungsbehörde)`, `Ist ${city ?? "die Gemeinde"} Große Kreisstadt, ist die Stadt selbst zuständig. Gemeinden und Verwaltungsgemeinschaften über 5.000 Einwohner können auf Antrag örtliche Straßenverkehrsbehörde sein (nur Gemeindestraßen).`, "belegt", "StVOZuG BW vom 29.04.2025, §§ 1–3", `${stadt} (falls Große Kreisstadt)`);
    case "by":
      if (kreisfrei && city) return kf(city);
      return R(`Landratsamt ${kreis} – untere ${STVB}`, `Große Kreisstädte sind selbst zuständig. Gemeinden sind als örtliche Straßenverkehrsbehörde nur für Gemeindestraßen zuständig${road.refClass ? `; hier geht es um eine ${road.refClass === "B" ? "Bundes" : road.refClass === "K" ? "Kreis" : "Staats"}straße` : ""}.`, "belegt", "Art. 2–3 ZustGVerk (Bayern)", `${stadt} (Große Kreisstadt bzw. Gemeindestraße)`);
    case "be":
      return road.refClass || road.major
        ? R("Senatsverwaltung für Mobilität, Verkehr, Klimaschutz und Umwelt – Abteilung Verkehrsmanagement", "Straßen des übergeordneten Netzes: Senat. Im Nebenstraßennetz ist das Straßen- und Grünflächenamt des Bezirks zuständig.", "teilweise", "ASOG Bln, ZustKat Ord Nr. 11 Abs. 4, Nr. 22b Abs. 3", `Straßen- und Grünflächenamt ${place.district ? `des Bezirks ${place.district}` : "des Bezirks"}`)
        : R(`Straßen- und Grünflächenamt ${place.district ? `des Bezirks ${place.district}` : "des Bezirks"} – ${STVB}`, "Nebenstraßen: Bezirk. Straßen des übergeordneten Netzes: Senatsverwaltung.", "teilweise", "ASOG Bln, ZustKat Ord Nr. 11 Abs. 4, Nr. 22b Abs. 3");
    case "bb":
      if (kreisfrei && city) return kf(city);
      return R(`Landkreis ${kreis} – ${STVB}`, "Große kreisangehörige Städte nach der StGÜZV sind selbst zuständig.", "belegt", "StGÜZV Brandenburg §§ 4, 4a", `${stadt} (falls in der Liste der StGÜZV)`);
    case "hb":
      return R(/bremerhaven/i.test(city ?? "") ? `Magistrat der Stadt Bremerhaven – ${STVB}` : "Amt für Straßen und Verkehr (Stadt Bremen) – Straßenverkehrsbehörde", "Zwei Städte, zwei Straßenverkehrsbehörden.", "belegt", "VO über die Zuständigkeiten nach der StVO (Bremen), § 1 Abs. 3");
    case "hh":
      return R(`Polizei Hamburg – ${STVB} im örtlich zuständigen Polizeikommissariat`, "Das Kommissariat ergibt sich aus Straße und Hausnummer (Behördenfinder). Die Verkehrsdirektion (VD 5) wird vor jeder Anordnung beteiligt.", "teilweise", "Polizei Hamburg; HRVV T30 vom 22.01.2026");
    case "he":
      if (kreisfrei && city) return kf(city);
      return R(`${city ? `Bürgermeister der Gemeinde ${city}` : "Bürgermeister der Gemeinde"} – örtliche ${STVB}`, `Gemeinden sind örtliche Straßenverkehrsbehörde; Gemeinden bis 50.000 Einwohner aber nicht für Bundesstraßen – dann der Landrat${county ? ` (${county})` : ""}.`, "teilweise", "StVRZustV Hessen § 10 (Gliederung 2025 geändert)", road.refClass === "B" ? `Landrat ${county ? `des ${county}` : "des Landkreises"} – Kreisordnungsbehörde` : null);
    case "mv":
      if (kreisfrei && city) return kf(city);
      return R(`Landkreis ${kreis} – ${STVB}`, "Städte über 20.000 Einwohner sind für § 45 StVO selbst zuständig.", "teilweise", "StVZustLVO M-V § 4 Abs. 2", `${stadt} (falls über 20.000 Einwohner)`);
    case "ni":
      if (kreisfrei && city) return kf(city);
      return R(`Landkreis ${kreis} – ${STVB}`, "Selbständige Gemeinden und große selbständige Städte (§ 14 NKomVG) übernehmen die Aufgabe selbst.", "teilweise", "ZustVO-Verkehr Niedersachsen §§ 2, 20; § 14 NKomVG", `${stadt} (falls selbständige Gemeinde)`);
    case "nw":
      if (kreisfrei && city) return kf(city);
      return R(`${kreis} – ${STVB}`, "Große und mittlere kreisangehörige Städte sind selbst Straßenverkehrsbehörde; sonst der Kreis.", "belegt", "VO über Zuständigkeiten im Bereich Straßenverkehr (NRW), § 10; § 4 GO NRW", `${stadt} (falls große oder mittlere kreisangehörige Stadt)`);
    case "rp":
      if (kreisfrei && city) return kf(city);
      return R(`Verbandsgemeinde bzw. verbandsfreie Gemeinde${city ? ` (${city})` : ""} – ${STVB}`, "Innerorts sind Verbandsgemeinden und verbandsfreie Gemeinden zuständig, außerorts die Kreisverwaltung.", "nur Sekundärquelle", "StVRZustV RP § 5 (Stand 2020, Sekundärquelle)", `Kreisverwaltung ${county ?? ""}`.trim());
    case "sl":
      return R(`${county ?? "Landkreis bzw. Regionalverband"} – ${STVB}`, "Gemeinden sind nur für Gemeindestraßen zuständig.", "nur Sekundärquelle", "StV-ZustG Saarland §§ 6, 11 (Wiedergabe Stand 2010)", `${stadt} (Gemeindestraßen)`);
    case "sn":
      if (kreisfrei && city) return kf(city);
      return R(`Landratsamt ${kreis} – untere ${STVB}`, "Gemeinden sind nur zuständig, wenn ausschließlich Gemeindestraßen betroffen sind.", "belegt", "SächsStrVRG §§ 1–2", `${stadt} (nur Gemeindestraßen)`);
    case "st":
      if (kreisfrei && city) return kf(city);
      return R(`vermutlich Landkreis ${kreis} – ${STVB}`, "Für Sachsen-Anhalt ist die Zuständigkeit noch nicht belegt.", "offen", "–");
    case "sh":
      if (kreisfrei && city) return kf(city);
      return R(`${county ?? "Kreis"} – ${STVB} (vermutlich)`, "Städte über 20.000 Einwohner haben einzelne Aufgaben; ob § 45 dazugehört, ist nicht belegt.", "teilweise", "StrVRZustVO SH; Behördentext SH im FIM-Portal", `${stadt} (falls über 20.000 Einwohner)`);
    case "th":
      if (kreisfrei && city) return kf(city);
      return R(`Landratsamt ${kreis} – ${STVB}`, "Große kreisangehörige Städte sind selbst zuständig.", "teilweise", "Behördentext TH im FIM-Portal (Stand 2020)", `${stadt} (falls große kreisangehörige Stadt)`);
    default:
      return R("Straßenverkehrsbehörde (meist Landkreis oder kreisfreie Stadt, je nach Land auch größere Städte)", "Das Land ist nicht bekannt – bitte oben wählen.", "–", "§ 44 StVO; Landesrecht");
  }
}
