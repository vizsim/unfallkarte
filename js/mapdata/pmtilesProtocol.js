// pmtilesProtocol.js — PMTiles-Protokoll für MapLibre, mit PARALLELEN Range-Anfragen.
//
// Chromium lässt je URL nur EINE Anfrage gleichzeitig laufen (Schreib-Sperre des HTTP-Caches),
// auch für Range-Anfragen. Alle Kacheln eines Archivs teilen sich die URL — sie liefen darum
// nacheinander, jede mit einer vollen Antwortzeit von B2 (170–440 ms). Kein Antwort-Header
// hebt die Sperre auf, nur `cache: "no-store"` in der Anfrage (Minimaltest + Messung:
// docs/PERFORMANCE_PLAN.md, Stufe 7). pmtiles setzt das selbst nur für Chromium
// unter Windows (aus einem anderen Grund, crbug 40542704) — hier für alle Browser.
//
// Preis: Range-Antworten landen nicht im Browser-Cache. B2 schickt ohnehin keine Cache-Header,
// und innerhalb einer Sitzung hält MapLibre die Kacheln selbst.
import { FetchSource, PMTiles, Protocol } from "pmtiles";

class NoStoreFetchSource extends FetchSource {
  constructor(url) {
    super(url);
    // Internes Flag von FetchSource (pmtiles 4.5.0): schaltet genau `cache: "no-store"`.
    // Fällt es bei einem Update weg, schlägt tests/web/perf.spec.js an.
    this.chromeWindowsNoCache = true;
  }
}

// Archiv-URL aus der MapLibre-Anfrage — genau so, wie Protocol sie bildet:
// TileJSON "pmtiles://<url>", Kachel "pmtiles://<url>/<z>/<x>/<y>".
const TILE_URL = /pmtiles:\/\/(.+)\/(\d+)\/(\d+)\/(\d+)/;
const archiveUrl = ({ type, url }) => (type === "json" ? url.slice("pmtiles://".length) : TILE_URL.exec(url)?.[1]);

/** Handler für `addProtocol("pmtiles", …)`: jedes Archiv bekommt beim ersten Zugriff die Quelle ohne Cache-Sperre. */
export function createPMTilesProtocol() {
  const protocol = new Protocol();
  return (params, abortController) => {
    const url = archiveUrl(params);
    if (url && !protocol.get(url)) protocol.add(new PMTiles(new NoStoreFetchSource(url)));
    return protocol.tile(params, abortController);
  };
}
