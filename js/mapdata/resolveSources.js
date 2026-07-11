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
async function loadManifestWithSource(localPath, remoteBase) {
  const local = await fetchJson(localPath);
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

async function existsLocally(url) {
  try {
    const res = await fetch(url, { method: "HEAD" });
    return res.ok;
  } catch {
    return false;
  }
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
  await Promise.all(
    entries.map(async ([id, meta]) => {
      const useLocal = fromLocal && (await existsLocally(`${localBase}${meta.file}`));
      const base = useLocal ? localBase : remoteBase;
      resolved[id] = `pmtiles://${base}${meta.file}`;
      console.info(`[resolveSources] ${id}: ${useLocal ? "lokal" : "B2"} (${meta.file})`);
    })
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
