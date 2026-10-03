// Export: die reinen Teile von js/export/accidentExport.js (ohne Netz, ohne Browser).
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  bboxOf, bboxPolygon, citation, coverageWarnings, estimate, fileName, matchesSelection, pointInGeometry,
  resolveLatestUrl, toCSV, toGeoJSON, yearRanges, LATEST_URLS,
} from "../../js/export/accidentExport.js";

const square = {
  type: "Polygon",
  coordinates: [
    [[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]],
    [[4, 4], [6, 4], [6, 6], [4, 6], [4, 4]], // Loch
  ],
};

test("Punkt im Polygon: Loch wird abgezogen, MultiPolygon, Bounding Box", () => {
  assert.equal(pointInGeometry(1, 1, square), true);
  assert.equal(pointInGeometry(5, 5, square), false);
  assert.equal(pointInGeometry(11, 5, square), false);
  const multi = { type: "MultiPolygon", coordinates: [square.coordinates, [[[20, 20], [21, 20], [21, 21], [20, 21], [20, 20]]]] };
  assert.equal(pointInGeometry(20.5, 20.5, multi), true);
  assert.deepEqual(bboxOf(multi), [0, 0, 21, 21]);
  assert.deepEqual(bboxOf(bboxPolygon([1, 2, 3, 4])), [1, 2, 3, 4]);
});

test("Filter wie die Karte: Dimensionen UND, Beteiligung ODER, IstSonstig heißt in der Datei IstSonstige", () => {
  const sel = { byGroup: { UJAHR: [2024], UKATEGORIE: [1, 2] }, beteiligungen: ["IstRad", "IstSonstig"] };
  const row = { UJAHR: 2024, UKATEGORIE: 2, IstRad: 0, IstSonstige: 1 };
  assert.equal(matchesSelection(row, sel), true);
  assert.equal(matchesSelection({ ...row, UJAHR: 2023 }, sel), false);                  // Jahr fehlt
  assert.equal(matchesSelection({ ...row, IstSonstige: 0 }, sel), false);               // keine Beteiligung
  assert.equal(matchesSelection({ ...row, IstSonstige: 0, IstRad: 1 }, sel), true);
  assert.equal(matchesSelection({ ...row, IstGkfz: null, IstSonstige: 0 }, { ...sel, beteiligungen: ["IstGkfz"] }), false);
  assert.equal(matchesSelection(row, null), true);                                     // „alle Unfälle"
});

test("Jahre zu Bereichen, Abdeckungshinweise je Land", () => {
  assert.equal(yearRanges([2019, 2016, 2017, 2021, 2020]), "2016–2017, 2019–2021");
  const latest = {
    schluessel: { ULAND: { "11": "Berlin", "13": "Mecklenburg-Vorpommern" } },
    abdeckung: { "11": [2018, 2019, 2020], "13": [2020] },
  };
  assert.deepEqual(coverageWarnings([{ ULAND: "13" }, { ULAND: "11" }], latest, [2016, 2017, 2018, 2019, 2020]), [
    "Berlin: für 2016–2017 enthält der Unfallatlas keine Daten.",
    "Mecklenburg-Vorpommern: für 2016–2019 enthält der Unfallatlas keine Daten.",
  ]);
  assert.deepEqual(coverageWarnings([{ ULAND: "11" }], latest, [2019, 2020]), []);
});

test("Schätzung: nur Row Groups, deren Koordinaten das Rechteck berühren; Bytes ohne Geometrie", () => {
  const col = (name, size, stats) => ({ meta_data: { path_in_schema: [name], total_compressed_size: size, statistics: stats } });
  const rg = (x0, x1, y0, y1) => ({
    num_rows: 10,
    columns: [
      col("XGCSWGS84", 100, { min_value: x0, max_value: x1 }),
      col("YGCSWGS84", 100, { min_value: y0, max_value: y1 }),
      col("UJAHR", 5, {}),
      col("geometry", 1000, {}),
    ],
  });
  const ds = { metadata: { row_groups: [rg(13, 14, 52, 53), rg(6, 7, 50, 51)] }, columns: ["XGCSWGS84", "YGCSWGS84", "UJAHR"] };
  assert.deepEqual(estimate(ds, [13.3, 52.4, 13.5, 52.6]), { groups: 1, rows: 10, bytes: 205 });
  assert.deepEqual(estimate(ds, [0, 0, 1, 1]), { groups: 0, rows: 0, bytes: 0 });
});

const latest = {
  version: "2026-10-03",
  datei: "unfallorte_2016-2025_2026-10-03.parquet",
  url: "https://data.vizsim.de/unfallorte/unfallorte_2016-2025_2026-10-03.parquet",
  quelle: {
    datensatz: "Unfallatlas",
    datensatz_url: "https://unfallatlas.statistikportal.de/",
    bereitsteller: "© Statistische Ämter des Bundes und der Länder",
    lizenz_kurz: "dl-de/by-2-0",
    lizenz_url: "https://www.govdata.de/dl-de/by-2-0",
    veraenderung: "Daten geändert: …",
  },
  schluessel: { ULAND: { "11": "Berlin" }, UART: { "5": "Zusammenstoß mit einbiegendem/kreuzendem Fahrzeug" } },
};
const row = { unfall_id: "11002002-2024-o5", UJAHR: 2024, UART: 5, ULAND: "11", note: 'a;b "c"', XGCSWGS84: 13.4183456, YGCSWGS84: 52.49901234 };

test("CSV für Excel: BOM, Semikolon, Dezimalkomma, Klartext, Escaping", () => {
  const csv = toCSV([row], latest);
  assert.ok(csv.startsWith("﻿unfall_id;UJAHR;UART;UART_text;ULAND;ULAND_text;note;XGCSWGS84;YGCSWGS84\r\n"));
  assert.match(csv, /;Zusammenstoß mit einbiegendem\/kreuzendem Fahrzeug;11;Berlin;"a;b ""c""";13,418346;52,499012\r\n$/);
  assert.equal(toCSV([], latest), "﻿");
});

test("GeoJSON: 6 Nachkommastellen, unfall_id als id, Quellenvermerk in metadata", () => {
  const fc = JSON.parse(toGeoJSON([row], latest, { created: "2026-10-05T10:00:00Z", geometry: square, filterText: "alle", warnings: ["x"] }));
  assert.deepEqual(fc.features[0].geometry.coordinates, [13.418346, 52.499012]);
  assert.equal(fc.features[0].id, "11002002-2024-o5");
  assert.equal(fc.features[0].properties.XGCSWGS84, undefined);
  assert.equal(fc.features[0].properties.ULAND_text, "Berlin");
  assert.equal(fc.metadata.quellenvermerk, citation(latest));
  assert.equal(fc.metadata.veraenderung, "Daten geändert: …");
  assert.deepEqual([fc.metadata.anzahl, fc.metadata.datenstand, fc.metadata.datei], [1, "2026-10-03", latest.datei]);
  assert.equal(fileName("csv", latest, "2026-10-05T10:00:00Z"), "unfaelle_2026-10-05_stand-2026-10-03.csv");
});

test("Quellenvermerk für den Auszug: Bereitsteller, Lizenz, Datensatz, Veränderung, Stand", () => {
  assert.equal(citation(latest),
    "Datenquelle: Unfallatlas (unfallatlas.statistikportal.de), © Statistische Ämter des Bundes und der Länder, "
    + "dl-de/by-2-0 (www.govdata.de/dl-de/by-2-0). Daten verändert: aufbereitet von vizsim, "
    + "Auszug aus data.vizsim.de/unfallorte, Stand 2026-10-03.");
});

test("latest.json: lokal nur, wenn es den data/-Baum geben kann und die Datei da ist", async () => {
  const base = "http://localhost:5173/";
  const local = new URL(LATEST_URLS.local, base).href;
  const answer = (ok) => async () => ({ ok });
  assert.equal(await resolveLatestUrl({ tryLocal: true, base, fetchImpl: answer(true) }), local);
  assert.equal(await resolveLatestUrl({ tryLocal: true, base, fetchImpl: answer(false) }), LATEST_URLS.remote);
  assert.equal(await resolveLatestUrl({ tryLocal: true, base, fetchImpl: async () => { throw new Error("offline"); } }), LATEST_URLS.remote);
  let probed = false;
  await resolveLatestUrl({ tryLocal: false, base, fetchImpl: async () => { probed = true; return { ok: true }; } });
  assert.equal(probed, false, "online wird lokal gar nicht erst gefragt");
});
