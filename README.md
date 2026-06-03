![Status: Experimental](https://img.shields.io/badge/Status-Experimental-red)
![License: AGPL-3.0-or-later](https://img.shields.io/badge/License-AGPL--3.0--or--later-blue)

# 🚧 Unfallkarte (Deutschland)

**Interaktive Webkarte** für Verkehrsunfälle in Deutschland. Die Unfalldaten stammen
aus dem [Unfallatlas der Statistischen Ämter](https://unfallatlas.statistikportal.de/)
(dl-de/by-2-0). Rohe Unfall- und OpenStreetMap-Daten werden zu **PMTiles** verarbeitet
und **keyless** in einer MapLibre-Karte dargestellt.

## 🚀 Online ansehen

👉 [Unfallkarte auf GitHub Pages](https://vizsim.github.io/unfallkarte/)

## 🏗️ Architektur

Zwei Teile in einem Repo:

- **`pipeline/`** — Python-Pipeline (uv): lädt Unfalldaten (2017–2024) + OSM, baut
  PMTiles, rechnet die Szenarien und deployt nach Backblaze B2.
  Details + CLI: [`pipeline/README.md`](pipeline/README.md).
- **Frontend (Repo-Root)** — statische MapLibre-Karte (`index.html` + `js/`, `style.json`).
  Lädt die PMTiles **local-first** (`data/`) mit **B2-Fallback** über ein generiertes
  `manifest.json`.

## 🗂️ Daten & Ebenen

- **Unfälle 2017–2024** (Unfallatlas) — Einzelpunkte (hoher Zoom) + Cluster (niedriger
  Zoom mit Tortendiagrammen), filterbar nach Schwere, Art, Typ, Jahr und Beteiligung.
- **OSM-Kontext** (ODbL): Schulen & Kindergärten, Gesundheitseinrichtungen, Spielplätze,
  Tempolimit-Straßennetz (Haupt- und Nebenstraßen).
- **Szenarien** (Unfälle/OSM × Kontext):
  - **sc1** — Unfall-Cluster auf Tempo-100-Straßen (DBSCAN)
  - **sc2** — Unfälle nahe Schulen (50 m, ab 2020)
  - **sc3** — Tempo-30 durchgängig: kurze 50er-Lücken zwischen 30er-Zonen
  - **sc6** — Tempo-50-Straßen vor Schulen (30 m, ≥60 m)
  - **sc8** — Lärm vor Schulen (UBA-Lärmkartierung, >56 dB)
- **Live-/Kontextlayer**: Radinfrastruktur ([radverkehrsatlas/TILDA](https://radverkehrsatlas.de/)),
  Mapillary-Tiles (Street-View-Sprung), sowie statische Layer (Uber-Geschwindigkeiten Berlin,
  OpenBikeSensor, UBA-Lärm, Hauptverkehrsstraßen).

## 🔑 Keyless — kein MapTiler

- **Basemap**: [OpenFreeMap](https://openfreemap.org/) Positron (gehostete OpenFreeMap-Tiles
  inkl. Fonts), dazu OSM Carto und Esri Imagery (im Karten-Panel umschaltbar).
- **Relief / 3D-Terrain + Hillshade**: [Mapterhorn](https://mapterhorn.com/) (raster-dem, terrarium).
- **3D-Gebäude**: OpenFreeMap-Planet. **Adress-Suche**: [Photon](https://photon.komoot.io/) (Komoot).
- Kein API-Key im Code; Secrets nur in `.env` (gitignored).

## 🖥️ Frontend lokal starten

Statische Seite über HTTP servieren (ES-Module + `fetch` brauchen HTTP, kein `file://`):

```bash
python3 -m http.server 8000          # im Repo-Root
# -> http://localhost:8000
```

**Local-first**: liegt ein `data/`-Verzeichnis lokal vor (z. B. Symlink auf `pipeline/data/`),
werden die PMTiles von dort geladen; sonst fällt das Frontend automatisch auf B2 zurück
(Manifest wird local-first, sonst aus dem Bucket gelesen).

## ⚙️ Daten aufbauen (Pipeline)

Voll dokumentiert in [`pipeline/README.md`](pipeline/README.md). Kurzform:

```bash
cd pipeline
uv sync
uv run unfallkarte accidents fetch && uv run unfallkarte accidents build
uv run unfallkarte accidents tiles data/accidents/accidents_germany_2017-2024_oid.parquet
uv run unfallkarte osm fetch && uv run unfallkarte osm build all
uv run unfallkarte scenario run-all
uv run unfallkarte manifest && uv run unfallkarte deploy
```

System-Binaries (nicht via pip): `tippecanoe` + `tile-join`, `osmium-tool`; b2-CLI via
`uv tool install b2`. (`ogr2ogr`/gdal-bin wird **nicht** gebraucht — OSM-PBF wird direkt
via pyogrio gelesen.)

## 🧰 Tech

MapLibre GL JS · PMTiles · tippecanoe · osmium-tool · GeoPandas/pyogrio (Python-Pipeline, **uv**)
· OpenFreeMap · Mapterhorn · Backblaze B2 · Photon · radverkehrsatlas/TILDA.

## 📄 Lizenz

**AGPL-3.0-or-later** © vizsim. (Früher MIT — bereits unter MIT veröffentlichte Stände
bleiben MIT; künftige Versionen sind AGPL.) Der Quellcode-Link im UI erfüllt die
AGPL-§13-Pflicht (Network Use).

**Daten** behalten ihre eigenen Lizenzen + Attribution: Unfallatlas (dl-de/by-2-0),
OpenStreetMap (ODbL), Umweltbundesamt (Lärm), OpenFreeMap (ODbL), Mapterhorn, Mapillary,
radverkehrsatlas/TILDA.
