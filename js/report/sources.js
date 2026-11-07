// sources.js — welche Archive der Report liest, woher (Local-first/B2 über das Manifest) und
// wie weit um die Auswahl herum. Die Feldlisten sind der Vertrag Report ↔ Pipeline:
// tests/web/report.spec.js prüft sie gegen die `vector_layers` der echten Archive (wie
// contract.spec.js für die Karte).
import { resolveAccidentSources, resolveSources } from "../mapdata/resolveSources.js";

/**
 * reach(ext): Leseradius in Metern um den Mittelpunkt; ext = Radius der Auswahl (+ Reserve
 * für große Einrichtungen). Straßen weit, damit sich Tempo-30-Strecken bis 500 m hinter dem
 * Vorschlag finden lassen (Nr. 4).
 */
export const DATASETS = [
  { id: "accidents", manifest: "accidents_single", layer: "accidents", reach: (e) => e + 120, core: true,
    fields: ["UKATEGORIE", "UJAHR", "UMONAT", "UWOCHENTAG", "USTUNDE", "UART", "UTYP1", "IstRad", "IstPKW", "IstFuss", "IstKrad", "IstGkfz", "IstSonstig"] },
  { id: "roads", manifest: "maxspeed_major", layer: "highways", reach: (e) => e + 750, core: true,
    fields: ["highway", "maxspeed", "maxspeed_forward", "maxspeed_backward", "maxspeed_conditional", "maxspeed_type", "zone_traffic", "name", "ref", "osm_id"] },
  { id: "roadsMinor", manifest: "maxspeed_minor", layer: "highways_minor", reach: (e) => e + 250, core: true,
    fields: ["highway", "maxspeed", "maxspeed_type", "zone_traffic", "name", "osm_id"] },
  { id: "schools", manifest: "osm_schools", layer: "germany_osm_schools", reach: (e) => e + 250, core: true, fields: ["name", "amenity", "isced_level", "osm_id", "osm_way_id"] },
  { id: "health", manifest: "osm_health", layer: "germany_osm_health", reach: (e) => e + 250, core: true,
    fields: ["name", "amenity", "healthcare", "social_facility", "social_facility_for", "osm_id", "osm_way_id"] },
  { id: "playgrounds", manifest: "osm_playgrounds", layer: "germany_osm_playgrounds", reach: (e) => e + 250, core: true, fields: ["name", "leisure", "osm_id", "osm_way_id"] },
  { id: "crossings", manifest: "osm_crossings", layer: "germany_osm_crossings", reach: (e) => e + 750, fields: ["crossing", "crossing_markings", "highway"] },
  { id: "platforms", manifest: "osm_platforms", layer: "germany_osm_platforms", reach: (e) => e + 300, fields: ["name", "bus", "tram", "train", "highway", "railway"] },
  { id: "census", manifest: "census_population", layer: "rasters-polys", reach: (e) => Math.max(330, e + 30),
    fields: ["Einwohner", "Unter18", "a65undaelter", "name_23", "plz", "RegioStaR7"] },
  { id: "noiseDen", manifest: "laerm_den", layer: "laerm_hlq_den-polys", reach: (e) => e + 60, fields: ["Lärmpegelklasse"] },
  { id: "noiseNight", manifest: "laerm_night", layer: "laerm_4120_hlq_night-polys", reach: (e) => e + 60, fields: ["Lärmpegelklasse"] },
  { id: "svz", manifest: "svz", layer: "svz", reach: (e) => e + 120, fields: ["dtv_kfz", "year", "metric"] },
  { id: "hvs", manifest: "hvs", layer: "lines", reach: (e) => e + 120, fields: ["annualTrafficFlow"] },
  { id: "telraam", manifest: "telraam_segments", layer: "telraam_segments", reach: (e) => e + 120, fields: ["car_per_day", "bike_per_day"] },
  { id: "obs", manifest: "obs", layer: "obs_data-points", reach: (e) => e + 60, fields: ["distance_overtaker", "zone"] },
  { id: "sc9", manifest: "scenario9", layer: "scenario9-polys", reach: (e) => e + 60, fields: ["rule", "n_max", "window_best"] },
];

/** Leseumfang je Auswahl: Radius plus Reserve für große Einrichtungsflächen. */
export const extentOf = (sel, r) => r + (sel.kind === "e" ? 250 : 0);

/**
 * URLs + Datenstände aus dem Manifest. Die Unfall-Datei ist ein stabiler Vertrag
 * (ACCIDENT_SOURCES) und geht auch ohne Manifest.
 */
export async function resolveReportSources() {
  const [src, acc] = await Promise.all([resolveSources(), resolveAccidentSources()]);
  const strip = (u) => u.replace(/^pmtiles:\/\//, "");
  const urls = {};
  const meta = {};
  for (const d of DATASETS) {
    const m = src.manifest?.[d.manifest];
    meta[d.id] = m ? { label: m.label, attribution: m.attribution, vintage: m.vintage ?? null } : null;
    if (d.id === "accidents") urls[d.id] = strip(acc.accidents_single);
    else if (src.map[d.manifest]) urls[d.id] = strip(src.map[d.manifest]);
  }
  return { urls, meta, manifestOk: src.manifestOk, accidentUrl: acc.accidents_single };
}

/**
 * Alle Datensätze für eine Auswahl lesen. Fehler je Datensatz werden festgehalten, nicht
 * geworfen: Der Report zeigt dann „nicht verfügbar" statt gar nichts.
 * @returns {Promise<Record<string, { status: "ok"|"missing"|"error", features: object[], error?: string, tiles?: number }>>}
 */
export async function readAll(reader, urls, proj, ext, { only, onProgress } = {}) {
  const list = DATASETS.filter((d) => !only || only.includes(d.id));
  let done = 0;
  const results = await Promise.all(list.map(async (d) => {
    const url = urls[d.id];
    if (!url) return [d.id, { status: "missing", features: [] }];
    try {
      const { layers, tiles } = await reader.read(url, [d.layer], proj.bbox(d.reach(ext)));
      return [d.id, { status: "ok", features: layers[d.layer] ?? [], tiles }];
    } catch (err) {
      return [d.id, { status: "error", features: [], error: String(err?.message ?? err) }];
    } finally {
      onProgress?.(++done, list.length);
    }
  }));
  return Object.fromEntries(results);
}
