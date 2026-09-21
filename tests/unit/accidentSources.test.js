// Vertragstest OHNE Browser: `npm run test:unit` (node --test).
//
// Die Unfall-Quellen kommen bewusst ohne Manifest aus — ihre Dateinamen stehen als
// Konstante im Frontend (ACCIDENT_SOURCES). Damit hat der Pfad zwei Fetches weniger,
// handelt sich aber eine Gefahr ein: benennt die Pipeline eine Datei um, merkt das
// Frontend es erst an einer leeren Karte. Dieser Test hält beide Seiten zusammen.
//
// Der Import funktioniert browserlos, weil resolveSources.js auf oberster Ebene nichts
// Browsereigenes anfasst (`location` steckt in einer Funktion hinter globalThis?.).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { ACCIDENT_SOURCES } from "../../js/mapdata/resolveSources.js";

const YAML = new URL("../../pipeline/config/sources.yaml", import.meta.url);

/**
 * Minimal-Parser: liest `file:`-Werte je Datensatz-Block aus sources.yaml.
 * Bewusst kein YAML-Paket — `npm run test:unit` soll ohne Abhängigkeiten laufen, und
 * gebraucht wird genau eine Sorte Zeile (zwei Ebenen Einrückung, keine Anker/Listen).
 */
function filesFromSourcesYaml() {
  const files = {};
  let current = null;
  for (const line of readFileSync(YAML, "utf8").split("\n")) {
    const dataset = line.match(/^ {2}([A-Za-z0-9_]+):\s*$/);
    if (dataset) { current = dataset[1]; continue; }
    const file = line.match(/^ {4}file:\s*"?([^"\s]+)"?\s*$/);
    if (file && current) files[current] = file[1];
  }
  return files;
}

test("Dateinamen der Unfall-Quellen stimmen mit sources.yaml überein", () => {
  const files = filesFromSourcesYaml();
  // Der Parser selbst muss etwas gefunden haben, sonst wäre der Test still immer grün.
  assert.ok(Object.keys(files).length > 5, `sources.yaml lieferte nur ${Object.keys(files).length} Einträge`);

  for (const [sourceId, { manifestId, file }] of Object.entries(ACCIDENT_SOURCES)) {
    assert.equal(
      files[manifestId], file,
      `Quelle "${sourceId}": Frontend sagt "${file}", sources.yaml sagt "${files[manifestId]}"`,
    );
  }
});

test("jede Unfall-Quelle nennt eine Manifest-ID, die es in sources.yaml gibt", () => {
  const files = filesFromSourcesYaml();
  for (const [sourceId, { manifestId }] of Object.entries(ACCIDENT_SOURCES)) {
    assert.ok(manifestId in files, `Quelle "${sourceId}" zeigt auf unbekanntes Dataset "${manifestId}"`);
  }
});
