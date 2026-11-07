// Unfall-Popup OHNE Browser: `npm run test:unit` (node --test). accidentPopup.js ist rein.
import { test } from "node:test";
import assert from "node:assert/strict";
import { accidentWhen, renderAccident } from "../../js/ui/accidentPopup.js";

const BEISPIEL = { UKATEGORIE: 3, UJAHR: 2025, UMONAT: 6, UWOCHENTAG: 6, USTUNDE: 18, UART: 5, UTYP1: 3, IstRad: 1, IstPKW: 1, IstFuss: 0 };

test("Karte: Unfalltyp als Titel, Unfallart, Schwere-Pill, Beteiligte, Zeit", () => {
  const html = renderAccident(BEISPIEL);
  assert.match(html, /<div class="pop-acc-head"><div class="pop-title">Einbiegen\/Kreuzen<\/div>/);
  assert.match(html, /Unfallart: Einbiegend\/kreuzend/);
  assert.match(html, /<span class="pop-pill pop-pill--k3">Leichtverletzte<\/span>/);
  assert.deepEqual([...html.matchAll(/<span class="pop-chip">.*?<\/svg>([^<]+)<\/span>/g)].map((m) => m[1]), ["Fahrrad", "Pkw"]);
  assert.match(html, /Fr · Juni 2025 · 18–19 Uhr/);
  assert.doesNotMatch(html, /\(\d\)/, "keine Kennziffern mehr im Text");
});

test("Werte als Strings (MVT) ergeben dieselbe Karte", () => {
  const asStrings = Object.fromEntries(Object.entries(BEISPIEL).map(([k, v]) => [k, String(v)]));
  assert.equal(renderAccident(asStrings), renderAccident(BEISPIEL));
});

test("Fehlende oder unbekannte Werte: kein '?', leere Teile fallen weg", () => {
  const html = renderAccident({ UJAHR: 2024 });
  assert.match(html, /<div class="pop-title">Unfall<\/div>/);
  assert.doesNotMatch(html, /pop-pill|pop-chip|undefined|\?/);
  assert.match(html, /<div class="pop-when">.*2024<\/div>/);
  const unbekannt = renderAccident({ UTYP1: 9, UKATEGORIE: 0 });
  assert.match(unbekannt, /<div class="pop-title">Unfall<\/div>/);
  assert.doesNotMatch(unbekannt, /pop-pill|pop-when/);
});

test("Zeit: Mitternacht, Stunde 23 und fehlender Monat", () => {
  assert.equal(accidentWhen({ UWOCHENTAG: 1, UMONAT: 1, UJAHR: 2020, USTUNDE: 0 }), "So · Januar 2020 · 0–1 Uhr");
  assert.equal(accidentWhen({ UJAHR: 2021, USTUNDE: 23 }), "2021 · 23–24 Uhr");
  assert.equal(accidentWhen({}), "");
});
