// Unfall-Popup OHNE Browser: `npm run test:unit` (node --test). accidentPopup.js ist rein.
import { test } from "node:test";
import assert from "node:assert/strict";
import { accidentWhen, clusterTotal, renderAccident, renderCluster } from "../../js/ui/accidentPopup.js";

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

// --- Cluster ---------------------------------------------------------------

const rowsOf = (html) => [...html.matchAll(/<tr class="([^"]+)"><td><span class="pop-sev-dot"><\/span>([^<]+)<\/td><td>([^<]*)<\/td><td>([^<]*)<\/td><\/tr>/g)]
  .map(([, cls, label, n, pct]) => ({ cls, label, n, pct }));

test("Cluster: Gesamtzahl groß, Anteile als Balken, Zeilen zählen Unfälle je Kategorie", () => {
  const html = renderCluster({ UKATEGORIE__1: 0, UKATEGORIE__2: 14, UKATEGORIE__3: 114 });
  assert.match(html, /<div class="pop-hero">128 <span class="pop-unit">Unfälle<\/span><\/div>/);
  // Balken nur mit vorhandenen Anteilen, Breite = Anzahl
  assert.deepEqual([...html.matchAll(/<span class="pop-sev--k(\d)" style="flex-grow:(\d+)">/g)].map((m) => [m[1], m[2]]), [["2", "14"], ["3", "114"]]);
  assert.deepEqual(rowsOf(html), [
    { cls: "pop-sev--k1 is-zero", label: "mit Getöteten", n: "0", pct: "" },
    { cls: "pop-sev--k2", label: "mit Schwerverletzten", n: "14", pct: "11 %" },
    { cls: "pop-sev--k3", label: "mit Leichtverletzten", n: "114", pct: "89 %" },
  ]);
  assert.match(html, /Alle Jahre, ungefiltert/);
});

test("Cluster: Tausenderpunkt, <1 %, Einzahl, Strings und leere Felder", () => {
  const big = renderCluster({ UKATEGORIE__1: "3", UKATEGORIE__2: "1200", UKATEGORIE__3: "10797" });
  assert.match(big, /12\.000 <span class="pop-unit">Unfälle/);
  assert.equal(rowsOf(big)[0].pct, "&lt;1 %");
  assert.match(renderCluster({ UKATEGORIE__3: 1 }), /1 <span class="pop-unit">Unfall<\/span>/);
  assert.equal(clusterTotal({ UKATEGORIE__1: "2", UKATEGORIE__3: 5 }), 7);
  const empty = renderCluster({});
  assert.match(empty, /0 <span class="pop-unit">Unfälle/);
  assert.doesNotMatch(empty, /pop-sev-bar|NaN/);
});

test("Cluster, Beteiligung: Zahl + Anteil + Bundesschnitt, Balken in der Kreisfarbe, alle Beteiligten als Kontext", () => {
  // 100 Unfälle: nur Rad 20, Rad + Pkw 10, Fuß + Pkw 5, nur Pkw 65
  const c = { UKATEGORIE__2: 20, UKATEGORIE__3: 80, BET__1: 20, BET__3: 10, BET__6: 5, BET__2: 65 };
  const html = renderCluster(c, "IstRad");
  assert.match(html, /<div class="pop-hero">30 <span class="pop-unit">Unfälle mit Radbeteiligung<\/span>/);
  assert.match(html, /30\u00a0% von 100 Unfällen im Kreis · Ø Deutschland 31\u00a0%/);
  // 30 % = Stufe 25–38 % → mittleres Blau, Rest grau
  assert.match(html, /<span style="flex-grow:30;--sev:#2079b5"><\/span><span style="flex-grow:70;--sev:#d1d5db">/);
  const rows = [...html.matchAll(/<tr( [^>]*)?><td><span class="pop-sev-dot"><\/span>([^<]+)<\/td><td>(\d+)<\/td>/g)]
    .map((m) => [m[2], Number(m[3]), (m[1] ?? "").includes("is-zero")]);
  assert.deepEqual(rows, [["Fahrrad", 30, false], ["Pkw", 80, true], ["Fußgänger", 5, true]]); // Mehrfachnennung
  assert.match(html, /Alle Jahre, ohne Filter · Mehrfachnennung möglich/);
});

test("Cluster: unbekannte Ansicht fällt auf die Schwere zurück; Einzahl", () => {
  assert.match(renderCluster({ UKATEGORIE__3: 3 }, "unbekannt"), /Alle Jahre, ungefiltert/);
  assert.match(renderCluster({ UKATEGORIE__3: 3, BET__4: 1 }, "IstFuss"), /1 <span class="pop-unit">Unfall mit Fußgängerbeteiligung/);
});

test("Cluster, Trend: Veränderung groß, Urteil, Balken je Jahr (verglichene farbig)", () => {
  const p = { UJAHR__2019: 80, UJAHR__2022: 50, UJAHR__2023: 50, UJAHR__2024: 35, UJAHR__2025: 35 };
  const html = renderCluster(p, "TREND");
  assert.match(html, /<div class="pop-hero">−30 % <span class="pop-unit">2024\/25 ggü\. 2022\/23<\/span>/);
  assert.match(html, /Stark rückläufig – deutlich/);
  assert.equal((html.match(/class="pop-trend-col"/g) ?? []).length, 9);
  // 2019 = höchster Balken, grau (nicht verglichen); 2024 in der Trendfarbe
  assert.match(html, /data-tip="2019: 80 Unfälle"><div class="pop-trend-plot"><span class="pop-trend-bar" style="height:100%;--sev:#d1d5db">/);
  assert.match(html, /data-tip="2024: 35 Unfälle"><div class="pop-trend-plot"><span class="pop-trend-bar" style="height:44%;--sev:#17559b">/);
  assert.match(html, /100 → 70 Unfälle · Ø Deutschland \+3 %/);
  assert.match(renderCluster({ UJAHR__2022: 1, UJAHR__2025: 2 }, "TREND"), /Zu wenige Unfälle für einen Trend/);
  assert.match(renderCluster({ UJAHR__2022: 5, UJAHR__2023: 5, UJAHR__2024: 6, UJAHR__2025: 5 }, "TREND"), /Eher steigend – kann Zufall sein/); // +10 %
});
