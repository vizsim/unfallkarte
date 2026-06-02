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
const REMOTE_BASE = "https://f003.backblazeb2.com/file/unfallkarte-data-v2/";

export async function loadManifest(path = "./data/manifest.json") {
  try {
    const res = await fetch(path, { cache: "no-cache" });
    if (!res.ok) throw new Error(`manifest ${res.status}`);
    return await res.json();
  } catch (err) {
    console.warn("[resolveSources] manifest nicht ladbar, nutze nur Remote:", err);
    return {};
  }
}

async function existsLocally(url) {
  try {
    const res = await fetch(url, { method: "HEAD" });
    return res.ok;
  } catch {
    return false;
  }
}

// Liefert ein Lookup-Objekt: url(id) -> "pmtiles://<lokal|remote>".
// Local-first wird pro Datei via HEAD-Probe entschieden; live/external-Einträge
// werden übersprungen (die binden ihre URL direkt ein).
export async function resolveSources({ localBase = LOCAL_BASE, remoteBase = REMOTE_BASE } = {}) {
  const manifest = await loadManifest();
  const resolved = {};

  const entries = Object.entries(manifest).filter(([, m]) => m.file && !m.live && !m.external);
  await Promise.all(
    entries.map(async ([id, meta]) => {
      const localUrl = `${localBase}${meta.file}`;
      const useLocal = await existsLocally(localUrl);
      const base = useLocal ? localBase : remoteBase;
      resolved[id] = `pmtiles://${base}${meta.file}`;
      console.info(`[resolveSources] ${id}: ${useLocal ? "lokal" : "B2"} (${meta.file})`);
    })
  );

  return {
    manifest,
    map: resolved,
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
