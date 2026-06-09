// js/utils/applyDataVintages.js
//
// Füllt die OSM-Quellen-Tooltips (info-icon) dynamisch mit dem Datenstand
// (vintage) aus dem Manifest — statt ein hartkodiertes Datum im HTML zu pflegen.
// `vintage` kommt aus `osmium fileinfo` der Geofabrik-PBF (siehe pipeline manifest.py),
// z. B. "2025-07-31". Markup: <span class="info-icon" data-osm-vintage="<manifest-id>">.

import { loadManifest } from "../mapdata/resolveSources.js";
import { LEGACY } from "../mapdata/addSources.js";
import { formatDateDE } from "./formatDate.js";

export async function applyDataVintages(manifest) {
  const mf = manifest || (await loadManifest());
  document.querySelectorAll("[data-osm-vintage]").forEach((el) => {
    const id = el.getAttribute("data-osm-vintage");
    const vintage = mf && mf[id] && mf[id].vintage;
    if (vintage) {
      el.title = `Quelle: © OpenStreetMap (${formatDateDE(vintage)}) – Lizenz: ODbL`;
    }
  });

  // Telraam: eigener Quellen-/Lizenztext (CC BY-NC) + Prozessierungsdatum (Manifest-
  // vintage = mtime des PMTiles). Füllt Info-Icon-Tooltip und den "Stand"-Hinweis
  // hinter "Ø der letzten 2 Wochen" in der Legende.
  const tv = mf && mf.telraam_segments && mf.telraam_segments.vintage;
  if (tv) {
    document.querySelectorAll("[data-telraam-vintage]").forEach((el) => {
      el.title = `Quelle: Telraam (© Telraam-Mitwirkende) · Verkehrsmengen Ø letzte 2 Wochen, Stand ${formatDateDE(tv)} – Lizenz: CC BY-NC 4.0`;
    });
    const note = document.getElementById("telraam-vintage-note");
    if (note) note.textContent = ` (Stand: ${formatDateDE(tv)})`;
  }

  // OBS (Legacy-Layer, altes Bucket, kein Manifest): Stand DRY aus dem Dateinamen
  // (OBS_data_<YYYY-MM-DD>.pmtiles in addSources.js) ableiten.
  const obsDate = /(\d{4}-\d{2}-\d{2})/.exec((LEGACY && LEGACY.obs) || "");
  if (obsDate) {
    document.querySelectorAll("[data-obs-vintage]").forEach((el) => {
      el.title = `Quelle: OpenBikeSensor community, Stand ${formatDateDE(obsDate[1])} – Lizenz: ???`;
    });
  }

  // Lärm (UBA-Lärmkartierung, fixe Quelle 2017): Stand aus dem Manifest (laerm_den).
  // Jahres-Granularität -> formatDateDE reicht "2017" unverändert durch.
  const lv = mf && mf.laerm_den && mf.laerm_den.vintage;
  if (lv) {
    document.querySelectorAll("[data-laerm-vintage]").forEach((el) => {
      el.title = `Quelle: Umweltbundesamt-DE (Lärmkartierung), Stand ${formatDateDE(lv)} – Lizenz: dl-by-de/2.0`;
    });
  }
}
