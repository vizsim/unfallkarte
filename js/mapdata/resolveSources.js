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

// Manifest local-first laden, sonst von B2. So braucht die deployte Seite (Pages)
// kein eigenes data/manifest.json — sie nimmt das aus dem Bucket.
export async function loadManifest(localPath = "./data/manifest.json", remoteBase = REMOTE_BASE) {
  for (const url of [localPath, `${remoteBase}manifest.json`]) {
    try {
      const res = await fetch(url, { cache: "no-cache" });
      if (res.ok) return await res.json();
    } catch {
      /* nächste Quelle versuchen */
    }
  }
  console.warn("[resolveSources] manifest weder lokal noch auf B2 ladbar");
  return {};
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
  const manifest = await loadManifest("./data/manifest.json", remoteBase);
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
