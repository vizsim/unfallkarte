// make-laender.mjs — public/report/laender.json erzeugen: die 16 Länder als grobe Umrisse, damit
// der Analyse-Report das Land einer Stelle ohne Server bestimmen kann (Landesregeln,
// Zuständigkeit). Quelle: Natural Earth 1:10m Admin-1 (gemeinfrei). Genauigkeit ~1 km — an
// Landesgrenzen kann die Zuordnung danebenliegen; der Report lässt das Land darum wählen.
//
//   node tools/report/make-laender.mjs [ne_10m_admin_1_states_provinces.geojson]
//
// Ohne Argument wird die Datei von GitHub geladen (~40 MB).
import { readFileSync, writeFileSync } from "node:fs";

const SRC = "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_10m_admin_1_states_provinces.geojson";
const TOL = 0.002; // Grad (~150–220 m): weit unter der Genauigkeit der Quelle
const CODE = { "DE-BW": "bw", "DE-BY": "by", "DE-BE": "be", "DE-BB": "bb", "DE-HB": "hb", "DE-HH": "hh", "DE-HE": "he", "DE-MV": "mv", "DE-NI": "ni", "DE-NW": "nw", "DE-RP": "rp", "DE-SL": "sl", "DE-SN": "sn", "DE-ST": "st", "DE-SH": "sh", "DE-TH": "th" };

const file = process.argv[2];
const geo = file ? JSON.parse(readFileSync(file, "utf8")) : await (await fetch(SRC)).json();

// Douglas-Peucker auf einem Ring (Grad, reicht für diesen Zweck).
function simplify(pts, tol) {
  if (pts.length < 5) return pts;
  const keep = new Uint8Array(pts.length);
  keep[0] = keep[pts.length - 1] = 1;
  const stack = [[0, pts.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop();
    let best = -1;
    let dmax = 0;
    const [ax, ay] = pts[a];
    const [bx, by] = pts[b];
    const dx = bx - ax;
    const dy = by - ay;
    const len2 = dx * dx + dy * dy || 1e-18;
    for (let i = a + 1; i < b; i++) {
      const t = Math.max(0, Math.min(1, ((pts[i][0] - ax) * dx + (pts[i][1] - ay) * dy) / len2));
      const d = Math.hypot(pts[i][0] - (ax + t * dx), pts[i][1] - (ay + t * dy));
      if (d > dmax) { dmax = d; best = i; }
    }
    if (dmax > tol) { keep[best] = 1; stack.push([a, best], [best, b]); }
  }
  return pts.filter((_, i) => keep[i]);
}

const r4 = (v) => Math.round(v * 1e4) / 1e4;
const laender = {};
let points = 0;
for (const f of geo.features) {
  const code = CODE[f.properties.iso_3166_2];
  if (!code) continue;
  const polys = f.geometry.type === "Polygon" ? [f.geometry.coordinates] : f.geometry.coordinates;
  laender[code] = polys
    .map((poly) => poly.map((ring) => simplify(ring, TOL).map(([x, y]) => [r4(x), r4(y)])).filter((r) => r.length >= 4))
    .filter((poly) => poly.length);
  points += laender[code].flat(2).length;
}
if (Object.keys(laender).length !== 16) throw new Error(`nur ${Object.keys(laender).length} Länder gefunden`);
const out = {
  quelle: "Natural Earth 1:10m Admin-1 States/Provinces (gemeinfrei), vereinfacht mit tools/report/make-laender.mjs",
  genauigkeit: "etwa 1 km – an Landesgrenzen Land im Report prüfen",
  laender,
};
writeFileSync(new URL("../../public/report/laender.json", import.meta.url), JSON.stringify(out));
console.log(`16 Länder, ${points} Punkte`);
