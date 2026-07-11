![Status: Experimental](https://img.shields.io/badge/Status-Experimental-red)
![License: AGPL-3.0-or-later](https://img.shields.io/badge/License-AGPL--3.0--or--later-blue)

# 🚧 Unfallkarte (Deutschland)

**Interaktive Webkarte** für Verkehrsunfälle in Deutschland. Die Unfalldaten stammen
aus dem [Unfallatlas der Statistischen Ämter](https://unfallatlas.statistikportal.de/)
(dl-de/by-2-0). Rohe Unfall- und OpenStreetMap-Daten werden zu **PMTiles** verarbeitet
und in einer MapLibre-Karte dargestellt — komplett auf offenen, frei gehosteten
Diensten (keine kommerzielle Karten-API).

## 🚀 Online ansehen

👉 [Unfallkarte auf GitHub Pages](https://vizsim.github.io/unfallkarte/)

![Screenshot der Unfallkarte: Unfallpunkte auf der Karte, rechts die Legende mit Filtern](docs/screenshot.png)

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
  Querungen/Übergänge, Tempolimit-Straßennetz (Haupt- und Nebenstraßen).
- **Szenarien** (Unfälle/OSM × Kontext):
  - **sc1** — Unfall-Cluster auf Tempo-100-Straßen (DBSCAN)
  - **sc2** — Unfälle nahe Schulen (50 m, ab 2020)
  - **sc3** — Tempo-30 durchgängig: kurze 50er-Lücken zwischen 30er-Zonen
  - **sc6** — Tempo-50-Straßen vor Schulen (30 m, ≥60 m)
  - **sc8** — Lärm vor Schulen (UBA-Lärmkartierung, >56 dB)
  - **sc9** — Unfallhäufungen (Kriterien nach M Uko, vereinfacht: 3-Jahres-Fenster + DBSCAN)
- **Verkehr & Umwelt** (aus der Pipeline): Verkehrsmengen (SVZ der Länder,
  BASt-Bundesfernstraßen, UBA-Hauptverkehrsstraßen), Rad-Geschwindigkeiten (movebis),
  Überholabstände ([OpenBikeSensor](https://www.openbikesensor.org/)), Umgebungslärm
  (UBA, Tag/Nacht), Telraam-Zählstellen — dazu Pkw-Geschwindigkeiten Berlin
  (Uber Movement 2019, statisch).
- **Live-Layer**: Radinfrastruktur ([radinfra.de/TILDA](https://radinfra.de/)),
  Mapillary-Tiles (Street-View-Sprung).

## 🌐 Offene Dienste — ohne Registrierung/API-Key

Basemap, Terrain und Suche laufen auf frei gehosteten Diensten:

- **Basemap**: [OpenFreeMap](https://openfreemap.org/) Positron (gehostete OpenFreeMap-Tiles
  inkl. Fonts), dazu OSM Carto und Esri Imagery (im Karten-Panel umschaltbar).
- **Relief / 3D-Terrain + Hillshade**: [Mapterhorn](https://mapterhorn.com/) (raster-dem, terrarium).
- **3D-Gebäude**: OpenFreeMap-Planet. **Adress-Suche**: [Photon](https://photon.komoot.io/) (Komoot).

Einzige Ausnahme: der optionale Mapillary-Layer (Street-View-Sprung, Verkehrszeichen)
nutzt einen Mapillary-**Client-Token** (`js/config/config.public.js`). Pipeline-Secrets
(B2-Keys) liegen nur in `pipeline/.env` (gitignored).

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

Kontextlayer analog: `uv run unfallkarte <hvs|laerm|obs|telraam> fetch|build` bzw.
`movebis build` (Details in [`pipeline/README.md`](pipeline/README.md)).

System-Binaries (nicht via pip): `tippecanoe` + `tile-join`, `osmium-tool`; b2-CLI via
`uv tool install b2`. (`ogr2ogr`/gdal-bin wird **nicht** gebraucht — OSM-PBF wird direkt
via pyogrio gelesen.)

## 📚 Weitere Doku

- [`docs/TODO.md`](docs/TODO.md) — offene Punkte (UX, CI, Aufräumen).
- [`docs/REFACTORING_PLAN.md`](docs/REFACTORING_PLAN.md) — Historie & Begründung des
  Notebook→Pipeline-Refactors (abgeschlossen).
- [`CLAUDE.md`](CLAUDE.md) — Regeln/Konventionen für die Arbeit im Repo.

## 🧰 Tech

MapLibre GL JS · PMTiles · tippecanoe · osmium-tool · GeoPandas/pyogrio (Python-Pipeline, **uv**)
· OpenFreeMap · Mapterhorn · Backblaze B2 · Photon · radinfra.de/TILDA.

## 📄 Lizenz

**AGPL-3.0-or-later** © vizsim. (Früher MIT — bereits unter MIT veröffentlichte Stände
bleiben MIT; künftige Versionen sind AGPL.) Der Quellcode-Link im UI erfüllt die
AGPL-§13-Pflicht (Network Use).

**Daten** behalten ihre eigenen Lizenzen + Attribution: Unfallatlas (dl-de/by-2-0),
OpenStreetMap (ODbL), Umweltbundesamt (Lärm), OpenFreeMap (ODbL), Mapterhorn, Mapillary,
radinfra.de/TILDA.
