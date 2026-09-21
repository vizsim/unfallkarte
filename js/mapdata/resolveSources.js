// js/mapdata/resolveSources.js
//
// Local-first + B2-Fallback für PMTiles, gesteuert über data/manifest.json
// (generiert von `unfallkarte manifest`). Das Frontend liest das Manifest einmal,
// probt pro Datei lokal (HEAD) und fällt bei 404 auf B2 zurück.
//
// Nutzung in addSources.js statt fester pmtilesBaseURL:
//   const sources = await resolveSources();
//   map.addSource("accidents_single", { type:"vector", url: sources.url("accidents_single") });

const LOCAL_BASE = "./data/";
const REMOTE_BASE = "https://tiles.vizsim.de/file/unfallkarte-data-v2/";

// Die Unfall-Quellen kommen OHNE Manifest aus: ihre Dateinamen sind ein stabiler Vertrag
// (pipeline/config/sources.yaml, kein Datum im Namen — siehe CLAUDE.md), die URL steht also
// schon zur Bauzeit fest. Das spart auf dem kritischen Pfad zwei Fetches, bevor der erste
// Unfallpunkt fließen kann: die lokale Manifest-Probe (auf Pages garantiert ein 404, samt
// 9-KB-Fehlerseite) und das Manifest von B2. Das Manifest lädt weiter — parallel, für
// Datenstände und Kontextlayer.
// Schlüssel = Frontend-Source-ID, manifestId = Eintrag in sources.yaml (sie weichen bei den
// Clustern ab). tests/unit/accidentSources.test.js hält beides gegen sources.yaml.
export const ACCIDENT_SOURCES = {
  accidents_single: { manifestId: "accidents_single", file: "accidents/accidents_single.pmtiles" },
  "accidents-cluster": { manifestId: "accidents_cluster", file: "accidents/combined_cluster.pmtiles" },
};

// ./data/ ist gitignoriert und existiert nur auf dem Entwicklungsrechner; auf Pages ist die
// Probe ein Roundtrip für eine Antwort, die immer "nein" lautet.
const mayHaveLocalTree = () => ["localhost", "127.0.0.1"].includes(globalThis.location?.hostname);

async function fetchJson(url) {
  try {
    const res = await fetch(url, { cache: "no-cache" });
    return res.ok ? await res.json() : null;
  } catch {
    return null;
  }
}

// Manifest local-first laden — und festhalten, OB es lokal kam. Kam es lokal, existiert
// ein data/-Baum und per-Datei-Probing lohnt; sonst (deployt/ohne data/) gehen wir direkt
// auf B2 und sparen pro Datei einen sinnlosen 404-HEAD-Probe.
//
// Deployt wird gar nicht erst lokal gesucht: data/ ist gitignoriert, auf Pages gibt es den
// Baum also garantiert nicht. Die Probe kostete dort einen Roundtrip und 9,4 KB
// Pages-Fehlerseite für eine Antwort, die immer "nein" lautet.
async function loadManifestWithSource(localPath, remoteBase) {
  const local = mayHaveLocalTree() ? await fetchJson(localPath) : null;
  if (local) return { manifest: local, fromLocal: true, ok: true };
  const remote = await fetchJson(`${remoteBase}manifest.json`);
  if (remote) return { manifest: remote, fromLocal: false, ok: true };
  console.warn("[resolveSources] manifest weder lokal noch auf B2 ladbar");
  return { manifest: {}, fromLocal: false, ok: false };
}

// Öffentliche API (unverändert): nur das Manifest-Objekt. So braucht die deployte Seite
// (Pages) kein eigenes data/manifest.json — sie nimmt es aus dem Bucket.
export async function loadManifest(localPath = "./data/manifest.json", remoteBase = REMOTE_BASE) {
  return (await loadManifestWithSource(localPath, remoteBase)).manifest;
}

// Je Datei nur EINE Probe pro Seitenaufruf: die Unfall-Dateien werden von zwei Stellen
// aufgelöst (resolveAccidentSources ohne Manifest, resolveSources mit) und würden sonst
// doppelt geprobt. Gemerkt wird die Promise, nicht das Ergebnis — sonst liefen zwei
// gleichzeitige Aufrufe trotzdem beide los.
const probeCache = new Map();

function existsLocally(url) {
  if (!probeCache.has(url)) {
    probeCache.set(url, fetch(url, { method: "HEAD" }).then((r) => r.ok).catch(() => false));
  }
  return probeCache.get(url);
}

/**
 * URLs der Unfall-Quellen, ohne auf das Manifest zu warten.
 * Lokal (mit data/-Baum) wird pro Datei einmal geprobt — dort kostet das nichts und
 * local-first bleibt erhalten; deployt fällt die Probe ersatzlos weg.
 */
export async function resolveAccidentSources({ localBase = LOCAL_BASE, remoteBase = REMOTE_BASE } = {}) {
  const entries = Object.entries(ACCIDENT_SOURCES);
  if (!mayHaveLocalTree()) {
    return Object.fromEntries(entries.map(([id, { file }]) => [id, `pmtiles://${remoteBase}${file}`]));
  }
  const resolved = await Promise.all(
    entries.map(async ([id, { file }]) => {
      const base = (await existsLocally(`${localBase}${file}`)) ? localBase : remoteBase;
      return [id, `pmtiles://${base}${file}`];
    })
  );
  return Object.fromEntries(resolved);
}

// Liefert ein Lookup-Objekt: url(id) -> "pmtiles://<lokal|remote>".
// Local-first wird pro Datei via HEAD-Probe entschieden — aber NUR, wenn das Manifest
// lokal kam (sonst existiert kein data/ und die Probes wären sinnlose 404s, die den
// ersten Render blockieren). live/external-Einträge werden übersprungen (binden ihre
// URL direkt ein).
export async function resolveSources({ localBase = LOCAL_BASE, remoteBase = REMOTE_BASE } = {}) {
  const { manifest, fromLocal, ok } = await loadManifestWithSource(`${localBase}manifest.json`, remoteBase);
  const resolved = {};

  const entries = Object.entries(manifest).filter(([, m]) => m.file && !m.live && !m.external);
  const local = [];
  await Promise.all(
    entries.map(async ([id, meta]) => {
      const useLocal = fromLocal && (await existsLocally(`${localBase}${meta.file}`));
      resolved[id] = `pmtiles://${useLocal ? localBase : remoteBase}${meta.file}`;
      if (useLocal) local.push(id);
    })
  );
  // EINE Zeile statt 25: aufgezählt wird nur, was vom Normalfall abweicht (= lokal liegt).
  // Vorher füllte die Auflösung bei jedem Laden die halbe Konsole und verdeckte echte Meldungen.
  console.info(
    `[resolveSources] ${entries.length} Quellen: ${entries.length - local.length}× B2`
    + (local.length ? `, ${local.length}× lokal (${local.join(", ")})` : "")
  );

  return {
    manifest,
    map: resolved,
    // false, wenn das Manifest weder lokal noch auf B2 ladbar war -> Datenlayer
    // bleiben leer; addSources.js zeigt dann das Fehler-Banner (js/ui/errorBanner.js).
    manifestOk: ok,
    url(id) {
      return resolved[id] ?? `pmtiles://${remoteBase}${id}.pmtiles`;
    },
    // Für external-Layer (z.B. mapillary_trafficsigns): direkte URL aus dem Manifest.
    externalUrl(id) {
      const m = manifest[id];
      return m && m.external ? `pmtiles://${m.external}` : null;
    },
  };
}
