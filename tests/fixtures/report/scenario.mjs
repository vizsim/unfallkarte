// scenario.mjs — ein erfundener Ort für die Report-Tests („Teststadt"), in Metern um einen
// Punkt in Hamburg angelegt und nach WGS84 umgerechnet. Alles ist fiktiv: Straßen, Schule,
// Unfälle, Zähl- und Lärmwerte. Er deckt die Prüfschritte ab (Weg A mit Lückenschluss und Ampel
// in der Lücke, M-Uko-Häufung an der Kreuzung, Typ-4-Kette, Lärm, OBS, Sc9).
//
//   Nord ↑        Querweg (T30-Zone, Nebenstraße)
//                     |            Grundschule am Testpark (x 40…160, y 25…120)
//   ---- T30 ----A----+----Z--H---------- Teststraße (B 99, 50 km/h) ----------
//   x=-900    -420  -200  0  100 130                               +900
//                (A = Ampel in der Lücke, + = Kreuzung mit Ampel, Z = Zebra, H = Bushalt)
import { localProjection } from "../../../js/report/geometry.js";

export const CENTER = { lat: 53.56, lng: 10.045 };
const P = localProjection(CENTER.lat, CENTER.lng);
const ll = (p) => P.lngLat(p);
const line = (pts) => pts.map(ll);
const rect = (x0, y0, x1, y1) => [[ll([x0, y0]), ll([x1, y0]), ll([x1, y1]), ll([x0, y1]), ll([x0, y0])]];
const pt = (p, properties, id) => ({ type: "Point", coordinates: ll(p), properties, ...(id != null ? { id } : {}) });
const ln = (pts, properties) => ({ type: "LineString", coordinates: line(pts), properties });
const pg = (r, properties) => ({ type: "Polygon", coordinates: rect(...r), properties });

const main = { highway: "secondary", name: "Teststraße", ref: "B 99", maxspeed_type: "DE:urban" };
export const roads = [
  ln([[-900, 0], [-420, 0]], { ...main, maxspeed: "30", osm_id: "1001" }),
  ln([[-420, 0], [-200, 0], [0, 0]], { ...main, maxspeed: "50", osm_id: "1002" }),
  ln([[0, 0], [400, 0]], { ...main, maxspeed: "50", osm_id: "1003" }),
  ln([[400, 0], [900, 5]], { ...main, maxspeed: "50", osm_id: "1004" }),
];
export const roadsMinor = [
  ln([[0, -400], [0, 0]], { highway: "residential", name: "Querweg", maxspeed: "30", maxspeed_type: "DE:zone30", osm_id: "2001" }),
  ln([[0, 0], [0, 400]], { highway: "residential", name: "Querweg", maxspeed: "30", maxspeed_type: "DE:zone30", osm_id: "2002" }),
  ln([[250, 0], [250, 320]], { highway: "residential", name: "Parkweg", maxspeed: "30", maxspeed_type: "DE:zone30", osm_id: "2003" }),
];
export const schools = [
  pg([40, 25, 160, 120], { name: "Grundschule am Testpark", amenity: "school", osm_way_id: "3001" }),
  pt([-150, 40], { name: "Kita Sonnenschein", amenity: "kindergarten", osm_id: "3002" }),
  pg([-600, -160, -480, -90], { name: "Berufsschule Hafen", amenity: "school", isced_level: "4", osm_way_id: "3003" }),
];
export const health = [
  pg([-300, -140, -220, -60], { name: "Seniorenstift Am Park", social_facility: "nursing_home", osm_way_id: "4001" }),
];
export const playgrounds = [
  pg([270, 150, 330, 220], { name: "Spielplatz Parkweg", leisure: "playground", osm_way_id: "5001" }),
];
export const crossings = [
  pt([0, 0], { highway: "crossing", crossing: "traffic_signals", osm_id: "6001" }),
  pt([-200, 0], { highway: "crossing", crossing: "traffic_signals", osm_id: "6002" }),
  pt([100, 0], { highway: "crossing", crossing: "zebra", crossing_markings: "zebra", osm_id: "6003" }),
];
export const platforms = [
  pt([130, -8], { name: "Testpark", highway: "bus_stop", bus: "yes", public_transport: "platform", osm_id: "7001" }),
];

// Unfälle: Häufung an der Kreuzung (2023–2025), Fußgänger (Typ 4) vor der Schule, Streuung.
// [x, y, Jahr, Kategorie, Typ, Art, Beteiligte, Stunde, Wochentag]
const ACC = [
  [3, 4, 2023, 3, 2, 5, ["IstRad", "IstPKW"], 8, 3], [-6, 2, 2023, 2, 3, 5, ["IstPKW"], 17, 5],
  [5, -7, 2024, 3, 2, 5, ["IstRad", "IstPKW"], 7, 2], [-3, -5, 2024, 3, 3, 5, ["IstPKW", "IstKrad"], 12, 4],
  [8, 1, 2025, 2, 2, 5, ["IstRad", "IstPKW"], 15, 6], [0, 9, 2025, 3, 3, 5, ["IstPKW"], 18, 1],
  [-2, 3, 2021, 3, 2, 5, ["IstPKW"], 9, 3],
  [75, 3, 2023, 2, 4, 6, ["IstFuss", "IstPKW"], 7, 2], [118, -2, 2024, 3, 4, 6, ["IstFuss", "IstPKW"], 13, 3],
  [150, 4, 2025, 3, 4, 6, ["IstFuss", "IstPKW"], 8, 5], [96, -3, 2022, 3, 4, 6, ["IstFuss", "IstPKW"], 14, 4],
  [60, 2, 2019, 3, 6, 2, ["IstPKW"], 16, 6], [210, -1, 2023, 3, 6, 2, ["IstPKW", "IstGkfz"], 10, 2],
  [-120, 1, 2024, 3, 7, 1, ["IstRad"], 19, 7], [-260, -3, 2020, 2, 1, 8, ["IstKrad"], 22, 1],
  [330, 2, 2021, 3, 6, 2, ["IstPKW"], 11, 3], [-60, 3, 2018, 3, 5, 1, ["IstPKW"], 9, 2],
  [180, 60, 2024, 3, 7, 0, ["IstRad"], 15, 4], [20, -150, 2025, 3, 1, 9, ["IstRad"], 6, 3],
];
export const accidents = ACC.map(([x, y, j, kat, typ, art, bet, h, wt], i) => pt([x, y], {
  UKATEGORIE: kat, UJAHR: j, UMONAT: (i % 12) + 1, UWOCHENTAG: wt, USTUNDE: h, UART: art, UTYP1: typ,
  IstRad: bet.includes("IstRad") ? 1 : 0, IstPKW: bet.includes("IstPKW") ? 1 : 0, IstFuss: bet.includes("IstFuss") ? 1 : 0,
  IstKrad: bet.includes("IstKrad") ? 1 : 0, IstGkfz: bet.includes("IstGkfz") ? 1 : 0, IstSonstig: 0,
}));

// Zensus: 100-m-Zellen, Einwohner nach Abstand zur Hauptstraße; eine Zelle geheimgehalten.
export const census = [];
for (let x = -500; x < 500; x += 100) {
  for (let y = -500; y < 500; y += 100) {
    const e = x === 100 && y === 100 ? -1 : Math.round(60 + 40 * Math.cos(x / 300) + (Math.abs(y) < 150 ? 30 : 0));
    census.push(pg([x, y, x + 100, y + 100], { Einwohner: e, Unter18: e > 0 ? Math.round(e * 0.18) : -1, a65undaelter: e > 0 ? Math.round(e * 0.21) : -1, name_23: "Teststadt", plz: "22089", RegioStaR7: 71 }));
  }
}
export const noiseDen = [
  pg([-900, -30, 900, 30], { "Lärmpegelklasse": "Lden6569" }),
  pg([-900, 30, 900, 70], { "Lärmpegelklasse": "Lden6064" }),
  pg([-900, -70, 900, -30], { "Lärmpegelklasse": "Lden6064" }),
];
export const noiseNight = [
  pg([-900, -30, 900, 30], { "Lärmpegelklasse": "Lnight5559" }),
  pg([-900, 30, 900, 70], { "Lärmpegelklasse": "Lnight5054" }),
];
export const svz = [ln([[-600, 0], [600, 0]], { dtv_kfz: "14200", sv_anteil: "4.1", year: "2021", metric: "DTV", road_no: "B 99" })];
export const hvs = [ln([[-600, 0], [600, 0]], { annualTrafficFlow: 5100000 })];
export const telraam = [ln([[280, 0], [360, 0]], { car_per_day: 9100, bike_per_day: 820 })];
export const obs = Array.from({ length: 25 }, (_, i) => pt([-100 + i * 12, (i % 2 ? 2 : -2)], { distance_overtaker: i < 11 ? 1.1 + (i % 4) * 0.1 : 1.6 + (i % 3) * 0.1, zone: "urban" }));
export const sc9 = [pg([-22, -22, 22, 22], { rule: "up5_3y", n_max: "6", window_best: "2023-2025", n_windows: "1", utyp: "0", UKATEGORIE__1: "0", UKATEGORIE__2: "2", UKATEGORIE__3: "4" })];

/** Datensätze wie readAll() sie liefert (Stücke = ganze Features, hier nicht zerschnitten). */
export function rawDatasets(overrides = {}) {
  const sets = { accidents, roads, roadsMinor, schools, health, playgrounds, crossings, platforms, census, noiseDen, noiseNight, svz, hvs, telraam, obs, sc9 };
  return Object.fromEntries(Object.entries({ ...sets, ...overrides }).map(([k, v]) => [k, v === null ? { status: "missing", features: [] } : { status: "ok", features: v }]));
}

/** Archiv-Spezifikation für die PMTiles-Fixtures: Datei, Layer, Zoom (= maxZoom des echten Archivs). */
export const ARCHIVES = [
  { id: "accidents_single", file: "accidents/accidents_single_mlt.pmtiles", layer: "accidents", features: accidents, zoom: 13, mlt: true },
  { id: "maxspeed_major", file: "osm/maxspeed_major.pmtiles", layer: "highways", features: roads, zoom: 14 },
  { id: "maxspeed_minor", file: "osm/maxspeed_minor.pmtiles", layer: "highways_minor", features: roadsMinor, zoom: 14 },
  { id: "osm_schools", file: "osm/schools.pmtiles", layer: "germany_osm_schools", features: schools, zoom: 15 },
  { id: "osm_health", file: "osm/health.pmtiles", layer: "germany_osm_health", features: health, zoom: 15 },
  { id: "osm_playgrounds", file: "osm/playgrounds.pmtiles", layer: "germany_osm_playgrounds", features: playgrounds, zoom: 15 },
  { id: "osm_crossings", file: "osm/crossings.pmtiles", layer: "germany_osm_crossings", features: crossings, zoom: 15 },
  { id: "osm_platforms", file: "osm/platforms.pmtiles", layer: "germany_osm_platforms", features: platforms, zoom: 15 },
  { id: "census_population", file: "census/population_100m.pmtiles", layer: "rasters-polys", features: census, zoom: 12 },
  { id: "laerm_den", file: "noise/laerm_den.pmtiles", layer: "laerm_hlq_den-polys", features: noiseDen, zoom: 14 },
  { id: "laerm_night", file: "noise/laerm_night.pmtiles", layer: "laerm_4120_hlq_night-polys", features: noiseNight, zoom: 14 },
  { id: "svz", file: "svz/svz_de.pmtiles", layer: "svz", features: svz, zoom: 14 },
  { id: "hvs", file: "uba/hvs_verkehrsmengen.pmtiles", layer: "lines", features: hvs, zoom: 15 },
  { id: "telraam_segments", file: "telraam/telraam_segments.pmtiles", layer: "telraam_segments", features: telraam, zoom: 14 },
  { id: "obs", file: "obs/obs_data.pmtiles", layer: "obs_data-points", features: obs, zoom: 14 },
  { id: "scenario9", file: "scenarios/scenario9_hotspots.pmtiles", layer: "scenario9-polys", features: sc9, zoom: 15 },
];
