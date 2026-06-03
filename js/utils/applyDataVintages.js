// js/utils/applyDataVintages.js
//
// Füllt die OSM-Quellen-Tooltips (info-icon) dynamisch mit dem Datenstand
// (vintage) aus dem Manifest — statt ein hartkodiertes Datum im HTML zu pflegen.
// `vintage` kommt aus `osmium fileinfo` der Geofabrik-PBF (siehe pipeline manifest.py),
// z. B. "2025-07-31". Markup: <span class="info-icon" data-osm-vintage="<manifest-id>">.

import { loadManifest } from "../mapdata/resolveSources.js";

// "2025-07-31" -> "25-07-31" (Kurzformat wie bisher im UI)
function shortDate(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || "");
  return m ? `${m[1].slice(2)}-${m[2]}-${m[3]}` : iso;
}

export async function applyDataVintages(manifest) {
  const mf = manifest || (await loadManifest());
  document.querySelectorAll("[data-osm-vintage]").forEach((el) => {
    const id = el.getAttribute("data-osm-vintage");
    const vintage = mf && mf[id] && mf[id].vintage;
    if (vintage) {
      el.title = `Quelle: © OpenStreetMap (${shortDate(vintage)}) – Lizenz: ODbL`;
    }
  });
}
