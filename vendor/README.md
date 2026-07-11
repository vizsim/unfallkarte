# vendor/ — eingefrorene Frontend-Libs

Vendored statt CDN (unpkg war Single Point of Failure). Eingebunden in `../index.html`.

| Datei | Paket | Version | Quelle |
|---|---|---|---|
| `maplibre-gl.js` + `maplibre-gl.css` | maplibre-gl | **5.24.0** | `https://unpkg.com/maplibre-gl@5.24.0/dist/` |
| `pmtiles.js` | pmtiles | **4.4.1** | `https://unpkg.com/pmtiles@4.4.1/dist/` |
| `chart.umd.min.js` | chart.js | **4.5.1** | `https://unpkg.com/chart.js@4.5.1/dist/` |

Lizenzen (BSD-3/MIT) stehen in den Datei-Headern.

**Update:** neue Dist-Datei(en) herunterladen und hier ablegen (gleiche Dateinamen),
dann Versionsangaben in dieser Tabelle **und** im Kommentar am Ende von `index.html`
anpassen. Kurzer Browser-Check (Karte lädt, keine Konsolen-Fehler), committen.
