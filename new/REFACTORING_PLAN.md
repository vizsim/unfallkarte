# Refactoring-Plan: Unfallkarte – Notebooks → stabile Python-Pipeline

> Ziel: Die Jupyter-Notebooks in `preprocessing/` und `scenarios/` durch einen
> wartbaren, testbaren Python-Code ersetzen, sodass sich die Daten (v. a. die
> Unfalldaten) flexibel aktualisieren und anschließend **alle Szenarien
> reproduzierbar neu rechnen** lassen.

---

## 1. Ist-Zustand (rekonstruiert)

**Datenfluss heute:**

1. `preprocessing/data_get_accident_data_Unfallatlas.ipynb`
   → lädt pro Jahr ZIPs (opengeodata.nrw.de), parst mit **jahresspezifischen
   Pfaden + Spalten-Renames**, baut GeoDataFrame, exportiert das Master-Dataset
   `accidents_germany_2017-2023_oid.parquet`.
2. `prepare_all_clusered_zoom_group_accidents4cluster.ipynb`
   → fügt One-Hot-Spalten `UKATEGORIE__1/2/3` hinzu, exportiert
   `accidents_germany_2017-2023_oid_grouped.geojson(.gz)`.
3. `run_tippecanoe_accidents_single.ipynb`
   → erzeugt `accidents_single*.pmtiles` + Cluster-Tiles (Zoom 6–8, 9–11),
   `tile-join` → `combined_may25_group.pmtiles`.
4. OSM-Prep-Notebooks (schools/health/playgrounds/crossings/cycleways/
   network-maxspeed) → je `.fgb`/GeoJSON → tippecanoe → `processed_*.pmtiles`.
5. Kontext-Daten: `laerm/` (4 Notebooks), Mapillary, OBS, Uber-Movement.
6. **Szenarien** (`scenarios/scenario1..8`): kombinieren das Unfall-Parquet mit
   je einer Kontextebene → `.fgb` → PMTiles.

**Output-Vertrag mit dem Frontend** (`js/mapdata/addSources.js`):
- Alle PMTiles liegen auf Backblaze B2:
  `https://f003.backblazeb2.com/file/unfallkarte-data/`
- Das Frontend referenziert **exakte Dateinamen** und teils **interne
  Layer-Namen** (z. B. `accidents`, `clusters_6_8`, `scenario2-points`,
  `scenario2-polys`). Diese müssen erhalten bleiben – oder im Lockstep mit
  `addSources.js` aktualisiert werden.

---

## 2. Hauptprobleme (warum sich das Refactoring lohnt)

1. **Notebooks sind nicht diff-/review-/testbar.** Eingebettete Outputs blähen
   das Repo (320 MB; einzelne Szenario-Notebooks bis 37 MB).
2. **Jahres-Hardcoding.** Datei-Pfade und Spalten-Renames unterscheiden sich pro
   Jahr (Sonderfall 2020, 2021 abweichender Pfad …). 2024 hinzufügen = an
   mehreren Stellen Code editieren. → genau dein Painpoint.
3. **Duplizierte Logik** über Szenarien hinweg (Parquet laden, `to_crs(25832)`,
   Schulen 50 m buffern, `sjoin`, nach `oid` zählen, nach PMTiles). scenario2 und
   scenario6 puffern beide Schulen – Copy-Paste statt Helper.
4. **Keine Single Source of Truth** für Dataset-Pfad/Version; Dateiname trägt
   den Zeitraum `2017-2023` fest im Namen.
5. **Tippecanoe-Aufrufe** mehrfach kopiert (Zoom-/Cluster-Parameter).
6. **Kein Dependency-Graph.** "Alle Szenarien neu rechnen" ist heute manuell.
7. **Secrets im Repo** (`config.public.js`: MapTiler-Key, Mapillary-Token).
8. **Große Binärdaten im Git** (44 MB Parquet etc.). Gehört in `.gitignore` +
   Fetch-Step oder git-lfs.
9. Kein Test, kein CI, kein kuratiertes Env (nur ein voller `pip freeze`).

---

## 3. Zielarchitektur

Ein installierbares Python-Paket, z. B. `unfallkarte_pipeline/`, mit CLI:

```
unfallkarte_pipeline/
├── pyproject.toml            # uv/pip, kuratierte deps + dev-deps (ruff, pytest)
├── .env.example              # MAPTILER_API_KEY, MAPILLARY_TOKEN, B2-Creds
├── config/
│   ├── accidents.yaml        # Jahres-Registry (s. u.) – DAS Kernstück
│   ├── tiles.yaml            # Tippecanoe-Profile (Zoom/Cluster/Layer-Namen)
│   └── datasets.yaml         # Output-Dateinamen + Datums-Stamps + B2-Pfade
├── src/unfallkarte/
│   ├── cli.py                # Typer/argparse-Einstieg
│   ├── paths.py              # zentrale Pfad-/Dateinamen-/Versionslogik
│   ├── accidents.py          # download + parse + harmonize + parquet
│   ├── osm.py                # geteilte OSM-Extraktion (osmconf-parametrisiert)
│   ├── geo.py                # geteilte Spatial-Helpers (buffer/join/count …)
│   ├── tiles.py              # tippecanoe / tile-join Wrapper (subprocess)
│   ├── deploy.py             # B2-Upload, nur geänderte Dateien
│   └── scenarios/
│       ├── registry.py       # name → run()-Funktion + inputs/outputs
│       ├── scenario01_clusters.py
│       ├── scenario02_schools.py
│       └── ...
└── tests/                    # pytest: kleine Fixtures + Golden-Checks
```

### 3.1 Das Kernstück: Jahres-Registry für Unfalldaten

Statt `if year == '2020': ...` eine deklarative Tabelle (`accidents.yaml`):

```yaml
years:
  "2023":
    url: "https://www.opengeodata.nrw.de/.../Unfallorte2023_EPSG25832_CSV.zip"
    csv_path: "csv/Unfallorte2023_LinRef.csv"
    sep: ";"
  "2024":
    url: "..."                 # beim Hinzufügen verifizieren (NRW-Mirror vs.
    csv_path: "..."            #   statistikportal.de; Pfad/Spalten prüfen!)
    sep: ";"
# globale Spalten-Harmonisierung (greift über alle Jahre)
rename:
  UIDENTSTLAE: UIDENTSTLA
  ULICHTVERH: LICHT
  OBJECTID_1: OBJECTID
  OID_: OBJECTID
  IstStrassenzustand: USTRZUSTAND
  STRZUSTAND: USTRZUSTAND
  IstSonstige: IstSonstig
```

→ **Neues Jahr hinzufügen = ein YAML-Block**, kein Code-Edit.
`accidents.py` iteriert über die Registry, normalisiert Spalten, baut die
GeoDataFrame (Komma→Punkt bei `XGCSWGS84/YGCSWGS84`, EPSG:4326), dropt die
bekannten Spalten und schreibt `accidents_germany_<minYear>-<maxYear>_oid.parquet`
(Zeitraum aus der Registry abgeleitet, nicht hartcodiert).

### 3.2 Geteilte Spatial-Helpers (`geo.py`)

Killt die Szenario-Duplikation. Typische Bausteine:
- `to_metric(gdf)` / `to_wgs(gdf)` (25832 ↔ 4326)
- `buffer_features(gdf, meters)`
- `count_accidents_per_feature(accidents, features, oid_col, filters=...)`
  (kapselt `sjoin` + `value_counts` für total/bike/ped/biped)
- `centroids(gdf)`, `dedupe_by_index(gdf)`

scenario2 und scenario6 nutzen denselben "Schulen puffern + zählen"-Pfad.

### 3.3 Tile-Profile (`tiles.py` + `tiles.yaml`)

Benannte Profile statt kopierter Argumentlisten, z. B.:
```yaml
accidents_single: { minzoom: 11, maxzoom: 13, layer: accidents, drop_rate: 0 }
clusters_6_8:     { minzoom: 6,  maxzoom: 8,  cluster_distance: 25,
                    accumulate: [UKATEGORIE__1, UKATEGORIE__2, UKATEGORIE__3] }
```
`tiles.run(profile, input, output)` + `tiles.join(out, [a, b])`.
**Layer-Namen exakt wie heute** (Frontend-Vertrag!).

### 3.4 Szenario-Registry & Orchestrierung

Jedes Szenario = `run(ctx) -> list[OutputArtifact]` mit deklarierten Inputs.
`cli scenario run-all` läuft sie in Abhängigkeitsreihenfolge. Für echten DAG
optional `doit`/`snakemake`; für den Anfang reicht eine geordnete Liste +
"skip if up-to-date"-Check (mtime/hash).

### 3.5 Secrets & Daten

- Tokens in `.env` (pydantic-settings / python-dotenv); `config.public.js`
  generiert sich aus Env oder bleibt, aber **Mapillary-Token rotieren** (war
  öffentlich im Repo).
- `data/` (raw + intermediate) in `.gitignore`. Master-Parquet entweder per
  `fetch`-Step reproduzierbar oder bewusst via git-lfs versioniert.

---

## 4. Migrationsstrategie (phasenweise, branch-/PR-tauglich)

Jede Phase ist ein eigener, klein gehaltener PR auf einem Branch
`refactor/python-pipeline`.

### Phase 0 – Gerüst & Sicherheitsnetz (kein Verhaltenswechsel)
- **uv** als Packaging: `uv init`, kuratierte Deps in `pyproject.toml`
  (NICHT der volle `pip freeze`), `uv.lock` committen, Aufrufe via `uv run …`,
  b2-CLI via `uv tool install b2`. ruff/pytest als dev-deps.
- `.env.example`; Tokens aus committetem Config rausziehen; `data/` → `.gitignore`.
- **System-Binaries** dokumentieren statt Docker (Scope: lokal, ~1×/Monat–1×/Jahr):
  `tippecanoe`, `osmium-tool`, `gdal-bin` via brew/apt; Versionen im README.
- **Golden Reference** festhalten: Größe/Hash + ein paar Feature-Counts der
  aktuellen Schlüssel-PMTiles, um spätere Phasen dagegen zu validieren.

### Phase 1 – Accidents-Core (deine #1-Priorität)
- `data_get_accident_data` → `accidents.py` + Jahres-Registry.
  Akzeptanztest: 2024 per YAML-Block ergänzbar, Pipeline läuft durch.
- Grouped-GeoJSON + Tippecanoe-Schritte → `tiles.py`-Profile →
  reproduziert `accidents_single.pmtiles` und `combined_may25_group.pmtiles`.
- Gegen Golden validieren (Feature-Counts gleich).

### Phase 2 – Geteilte Helpers + OSM + Tiles
- `geo.py`-Helper extrahieren. OSM-Prep-Notebooks portieren
  (osmconf-parametrisiert). Laerm/Mapillary/OBS/Uber als reine `fetch`-Skripte
  (ändern sich selten – niedrigere Prio).

### Phase 3 – Szenarien
- Szenario für Szenario auf die Helper portieren, je in der Registry.
  **Mit scenario2 + scenario6 starten** (gemeinsame Schul-Buffer-Logik = guter
  Test der Abstraktion). Outputs gegen Golden prüfen.

### Phase 4 – Orchestrierung & Deploy
- `cli scenario run-all` mit Reihenfolge + Up-to-date-Skip.
- `cli deploy` → **B2-Upload** nur geänderter PMTiles (Details s. §9).
- Optional GitHub Action: lint + schneller Smoke-Test (kein schwerer Full-Build).

### Phase 5 – Aufräumen
- Notebooks entfernen oder nach `notebooks/exploration/` verschieben und mit
  `nbstripout` von Outputs befreien. README aktualisieren.

---

## 5. Repo-spezifische Stolperfallen (unbedingt beachten)

1. **Frontend-Vertrag:** Exakte PMTiles-**Dateinamen** und interne
   **Layer-Namen** beibehalten, sonst `addSources.js` synchron anpassen.
2. **CRS-Handling:** Metrische Buffer/Joins in **EPSG:25832**, Output in
   **EPSG:4326**. Nicht vermischen.
3. **Jahres-Quirks** sind die eigentliche Korrektheitsfalle: Sonderfall 2020
   (Verfügbarkeit alle Länder), abweichende Pfade/Spalten – alles in der
   Registry kapseln und mit Mini-Tests absichern.
4. **2024-Quelle verifizieren:** Daten sind seit Juli 2025 verfügbar (alle
   Länder). Beim Hinzufügen prüfen, ob der NRW-Mirror-URL-Pattern weiter greift
   oder besser direkt über `unfallatlas.statistikportal.de`/Open-Data bezogen
   wird – inkl. evtl. neuer Spalten.
5. **Externe Binaries:** `tippecanoe` + `tile-join` müssen installiert sein
   (Version dokumentieren). Im CI ggf. nur Smoke-Test ohne sie.
6. **Repo-Größe:** Auf Scripts umzustellen verkleinert die *History* nicht.
   git-lfs-Migration ist eine separate, schwerere Entscheidung.

---

## 6. Erste konkrete Schritte für VS Code (Claude im Branch)

1. `git checkout -b refactor/python-pipeline`
2. Phase 0 umsetzen: `pyproject.toml`, ruff/pytest, `.env.example`,
   Tokens raus, `.gitignore` für `data/`.
3. Golden-Reference-Script schreiben (`tests/golden/`), aktuelle PMTiles
   vermessen.
4. Phase 1: `accidents.py` + `config/accidents.yaml` bauen, gegen Golden testen,
   dann **2024 als YAML-Block ergänzen** als erster echter Mehrwert.

> Empfehlung zur Reihenfolge: Erst Phase 0+1 mergen (sofortiger Nutzen:
> Unfalldaten flexibel aktualisierbar), dann iterativ die Szenarien. So bleibt
> das Frontend jederzeit lauffähig.

---

## 7. Basemap & Terrain-Panel (Vorbild: **gradients2osm**)

**Heute (unfallkarte):** MapTiler an drei Stellen – `maps/dataviz/style.json`,
`tiles/hillshades/tiles.json`, `tiles/terrain-rgb-v2/tiles.json` – plus
`MAPTILER_API_KEY` im committeten Config, und ein simpler Standard/Satellit-
Umschalter (`thumbs/thumb-standard.png`, `thumb-satellite.png`).

**Ziel:** komplett keyless, und das schöne **Karten-Panel unten links** aus
`gradients2osm` übernehmen. Dort ist alles fertig durchdacht und nahezu 1:1
übernehmbar – die relevanten Dateien:
- `viz/js/map/initMap.js` – komplette Basemap/Terrain/Buildings-Logik
- `viz/index.html` – Panel-Markup (`#map-settings-toggle` + `#map-settings-panel`)
- `viz/style.css` – Panel-Styles (`.map-settings-*`, `.basemap-*`, `.switch`)
- `viz/assets/basemaps/*-thumb.png` – Vorschau-Thumbnails

### 7.1 Das Panel (unten links)
Ein 44px-Button `#map-settings-toggle` (`position:absolute; left:16px;
bottom:16px`) öffnet ein einklappbares `#map-settings-panel` mit:
- **`.basemap-grid`** – drei Thumbnail-Buttons: **Positron** / **OSM Carto** /
  **Esri Imagery** (`data-basemap="positron|osm|satellite"`).
- **`.terrain-row`** „Geländerelief" – Toggle für 3D-Oberfläche + Hillshade.
- **`.terrain-row`** „3D-Gebäude" – Toggle für Fill-Extrusion ab Zoom 14.

Verdrahtung (aus `main.js`): Buttons/Toggles rufen `setMapBasemap`,
`setMapRelief`, `setMapBuildings` auf.

### 7.2 Basemap = OpenFreeMap (keyless)
```js
const POSITRON_STYLE_URL = 'https://tiles.openfreemap.org/styles/positron';
// Raster-Alternativen als visibility-Toggle (kein Style-Swap):
//   OSM Carto:  https://tile.openstreetmap.org/{z}/{x}/{y}.png
//   Esri:       https://server.arcgisonline.com/.../World_Imagery/.../{z}/{y}/{x}
// 3D-Gebäude:   vector url 'https://tiles.openfreemap.org/planet' (source-layer 'building')
```
Clever an der Vorlage: **kein Style-Wechsel** beim Umschalten – Raster-Basemaps
liegen als eigene Layer vor und werden per `visibility` ein/ausgeblendet; beim
Aktivieren werden die Positron-Host-Layer versteckt. Dadurch müssen die eigenen
Daten-Layer nie neu hinzugefügt werden.

### 7.3 Terrain + Hillshade via Mapterhorn (raster-dem, terrarium)
```js
map.addSource('terrain-dem', {
  type: 'raster-dem',
  url: 'https://tiles.mapterhorn.com/tilejson.json',
  tileSize: 512,
  encoding: 'terrarium',
  attribution: '© Mapterhorn',
});
map.addLayer({ id: 'hillshade-layer', type: 'hillshade', source: 'terrain-dem',
  paint: { 'hillshade-exaggeration': 0.35 } });
map.setTerrain({ source: 'terrain-dem', exaggeration: 1 });
// + blauer Himmel via map.setSky(...) wenn Relief aktiv
```
**Lazy-Loading** (aus der Vorlage übernehmen): DEM- und Buildings-Sources erst
beim ersten Toggle hinzufügen – sonst feuern sie ihre Tile-Fetches schon beim
Laden, obwohl der Layer versteckt ist.

**Rate-Limits:** Der gehostete Mapterhorn-Endpoint kann bei dominantem Traffic
gedrosselt werden. **Entscheidung: gehosteten Endpoint nutzen** (kein eigenes
Hosting) – bei eurem Traffic unkritisch; B2-Spiegel bliebe nur als Notfall-Option.

### 7.4 Wichtige Anpassung für unfallkarte
Die Vorlage versteckt beim Raster-Basemap-Wechsel **alle** Nicht-Custom-Layer.
In unfallkarte müssen die **Unfall-/Kontext-/Szenario-Layer** in das Pendant zu
`CUSTOM_LAYER_IDS` aufgenommen werden, damit sie beim Umschalten auf OSM/Esri
**nicht** mit ausgeblendet werden.

### 7.5 Konkrete Schritte
1. `MAPTILER_API_KEY` aus `config.public.js` entfernen; die drei MapTiler-
   Quellen löschen.
2. Panel-Markup + CSS + Thumbnails aus `gradients2osm` übernehmen.
3. `initMap.js`-Helper (`setMapBasemap/Relief/Buildings`, Lazy-Adder) an die
   unfallkarte-Struktur (`addSources.js`/`addLayers.js`) anpassen.
4. Bestehenden Standard/Satellit-Umschalter durch das Panel ersetzen.
5. Custom-Layer-Set um die Daten-Layer ergänzen (§7.4).
6. Attribution aktualisieren (OpenFreeMap, Mapterhorn, OSM, Esri).

---

## 8. Neues Kontextlayer: Radinfrastruktur (aus mapillary_coverage_analysis)

Im Referenzprojekt ist das **kein Pipeline-Output**, sondern ein live
konsumierter externer Vektor-Tile-Server (TILDA / radverkehrsatlas):
```js
map.addSource('bike-lanes', {
  type: 'vector',
  tiles: ['https://tiles.tilda-geo.de/atlas_generalized_bikelanes/{z}/{x}/{y}'],
  minzoom: 9, maxzoom: 22
});
// source-layer: 'bikelanes', Styling nach Property `category`
```
Kategorien/Layer (aus `bikeLanesLayers.js`): `baulich`, `eigenstaendig`,
`fussverkehr`, `kfz`, `gehweg`, `needsClarification`.

**Übernahme nach unfallkarte = reine Frontend-Arbeit, kein B2, kein Preprocessing:**
1. `js/map/bikeLanesLayers.js` (Source + Layer-Definitionen) portieren.
2. In `addSources.js` / `addLayers.js` einhängen.
3. Toggle in `setupLayerToggles.js` + Legendeneintrag ergänzen.
4. Attribution für TILDA/radverkehrsatlas ergänzen.

> **Entscheidung:** vorerst **nur Kontextlayer** (TILDA-Tiles, fertig kategorisiert).
> Mögliches Szenario später: „Radunfälle im Mischverkehr ohne bauliche Trennung"
> – Unfälle mit `IstRad==1` auf Straßenabschnitte joinen; wo Radverkehr auf der
> Kfz-Fahrbahn läuft (keine getrennte Infra) **und** sich Unfälle häufen →
> Priorisierung für geschützte Radinfra. **Wichtig:** dafür die Klassifikation als
> *Daten* nötig (joinbar), nicht die generalisierten TILDA-Tiles → auf der eigenen
> **OSM-Cycleway-Extraktion** (`osmconf_cycleways.ini`) aufbauen, nicht auf TILDA.

---

## 9. Deploy: PMTiles via B2 CLI aktualisieren (Keys in .env)

**Ziel:** Nach `run-all` werden die (geänderten) PMTiles auf Backblaze B2
(`unfallkarte-data`) hochgeladen. Secrets in `.env`. **gradients2osm hat dafür
ein fertiges Skript** (`viz/preprocessing/upload_pmtiles.sh` + `B2-UPLOAD.md` +
`.env.example`) – fast 1:1 übernehmbar.

### 9.1 .env (nie committen; `.env.example` als Vorlage committen)
```dotenv
# Backblaze B2 (Application Key auf den Bucket beschränken, NICHT Master-Key)
B2_APPLICATION_KEY_ID=
B2_APPLICATION_KEY=
B2_BUCKET_NAME=unfallkarte-data
# Tokens (aus config.public.js hierher verschieben)
MAPILLARY_TOKEN=
# MAPTILER_API_KEY entfällt komplett
```
- Laden via `python-dotenv` / `pydantic-settings` (Py) bzw. `set -a; source .env`
  (Bash, wie in der Vorlage). `.env` in `.gitignore`.
- **Mapillary-Token rotieren** (war öffentlich).

### 9.2 Upload-Schritt (Muster aus gradients2osm)
b2 CLI v4 (`uv tool install b2`), dann:
```bash
b2 account authorize "$B2_APPLICATION_KEY_ID" "$B2_APPLICATION_KEY"   # idempotent, cached
b2 sync --no-progress \
  --exclude-regex '.*' --include-regex '.*\.pmtiles$' \
  "$DATA_DIR" "b2://$B2_BUCKET_NAME"
```
- `b2 sync` lädt nur Geändertes (Name + mtime); Re-Runs sind günstig.
- Regex-Filter = nur PMTiles hochladen, Zwischendateien bleiben lokal.
- `--dry-run` zum Vorab-Anschauen.
- Alternativ S3-kompatibel via boto3 (B2-S3-Endpoint), falls keine CLI gewünscht.

### 9.3 Public-Bucket + CORS (aus B2-UPLOAD.md)
Für `pmtiles://`-Streaming aus dem Browser: Bucket auf **Public** stellen und
CORS-Regel setzen (Allowed Origins `*` bzw. eure Domain, Headers
`range,content-type`).

### 9.4 Einbindung in den Prozess
- Eigener Command `cli deploy` (oder `upload_pmtiles.sh`), lokal aufrufbar **oder**
  als letzter Schritt von `run-all`.
- Cron/Automatik analog `run_weekly.sh` (git pull → Pipeline → Deploy → Logs).
- **CI-Hinweis:** B2-Upload nur lokal/auf Server mit Secrets, **nicht** in einer
  öffentlichen GitHub Action.

### 9.5 Hosting-Modell (ENTSCHIEDEN): Local-first + B2-Fallback
Das Frontend HEAD-probt beim Start `./data/<file>` und nutzt es direkt
(`pmtiles://./data/<file>`); nur bei 404/Fehler fällt es auf B2 zurück. Lokale
Entwicklung läuft damit ohne B2-Traffic, das öffentliche Deploy streamt von B2.
- Umbau in `addSources.js`: vorgelagerter Auflösungsschritt (alle URLs einmal
  parallel proben → dann Sources hinzufügen), Muster `resolveRegionUrls` aus
  `gradients2osm`.
- Bei ~20+ Quellen optional ein einziges `data/manifest.json` statt N HEAD-Probes
  (später optimierbar; erst mit Parallel-Probes starten).

### 9.6 Bucket-Struktur (ENTSCHIEDEN): neues Bucket + Subfolder
Neues Bucket (z. B. `unfallkarte-data-v2`), altes als eingefrorenes Archiv/Rollback
behalten. **`b2 sync` spiegelt den lokalen `data/`-Ordnerbaum 1:1** → lokale und
remote Pfade sind identisch, die Local-first-Logik ist nur ein Basis-URL-Tausch.
```
unfallkarte-data-v2/
├── accidents/    accidents_single, combined_cluster
├── scenarios/    scenario1 … scenario8
├── osm/          schools, health, playgrounds, crossings, cycleways
├── traffic/      movebis, uber, hvs, maxspeed (major/minor)
├── noise/        laerm den/night
├── obs/          OBS-Messungen
└── terrain/      optional, falls Mapterhorn-DEM gespiegelt
```
- `addSources.js`-Pfade beim selben Umbau auf die Subfolder umstellen.
- Bucket auf **Public** + CORS (`range,content-type`).
- Versionierung: fürs Erste stabile Namen + altes Bucket als Archiv genügt;
  B2-native Datei-Versionierung wäre die nächste Ausbaustufe.

### 9.7 Manifest & Datenstand (ENTSCHIEDEN): ein generiertes `data/manifest.json`
Eine **einzige, vom Pipeline-Lauf generierte** Datei erfüllt zwei Zwecke
zugleich – Local-first-Index *und* Datenstand-/Attribution-Übersicht. Frontend
liest sie genau einmal.
```jsonc
{
  "accidents_single": {
    "file": "accidents/accidents_single.pmtiles",
    "present": true,          // Local-first
    "vintage": "2024",        // Datenstand der Rohdaten
    "built": "2026-05-28",
    "label": "Unfalldaten",
    "attribution": "Unfallatlas (dl-de/by-2-0)"
  },
  "osm_schools": { "file": "osm/schools.pmtiles", "vintage": "2025-05-28", "...": "" },
  "bikelanes":   { "live": true, "label": "Radinfrastruktur", "attribution": "radverkehrsatlas / TILDA" }
}
```
**Datums-Herkunft (`vintage`) je Quelle:**
- Unfälle → max. Jahr aus `accidents.yaml` (automatisch).
- OSM → `osmium fileinfo` der Geofabrik-PBF (automatisch beim Build).
- Lärm/Uber/OBS → statischer Festwert in der Config.
- Mapillary → Fetch-Datum.
- Live-Layer (TILDA/OpenFreeMap/Mapterhorn) → `"live": true`, kein festes Datum.

**Source-of-truth-Split:**
- `config/sources.yaml` (von Hand): Label, Attribution, Lizenz, `date: auto|fixed:…`.
- `data/manifest.json` (generiert): deklarierte Metadata + aufgelöste Daten +
  Präsenz. Du editierst nur die yaml.

**Frontend:** manifest einmal lesen → (a) URL-Auflösung Local-first, (b) „Stand:"-
Zeile pro Layer (Muster verbessert aus `mapillary_coverage_analysis/
viz/utils/layerUpdateDates.js`, dort fragmentiert über N Quellen – hier 1 Fetch).
→ Datum lebt nicht mehr im Dateinamen; stabile Namen + B2-Versionierung.

---

## 10. OSM-Datenaktualisierung: Geofabrik + osmium (smooth)

**Heute:** pro Kategorie `ogr2ogr` mit `osmconf.ini` direkt auf der ganzen
Deutschland-PBF (~4 GB) – langsam, speicherhungrig, datums-gestempelte Dateinamen
manuell gepflegt.

**Ziel-Flow (in `osm.py`, config-getrieben):**
1. **Download** `germany-latest.osm.pbf` von Geofabrik (immer aktuell). Tatsächliches
   Datenstand-Datum via `osmium fileinfo` auslesen → damit Output-Dateien benennen
   (kein manuelles Datums-Hardcoding mehr).
2. **Vorfiltern mit `osmium tags-filter`** (streaming, schnell) auf kleine
   Kategorie-PBFs, *bevor* der schwere Schritt läuft:
   - Schulen: `nwr/amenity=school,kindergarten`
   - Spielplätze: `nwr/leisure=playground`
   - Gesundheit: `nwr/amenity=hospital,clinic,doctors nwr/healthcare nwr/social_facility`
   - Netz/Tempo/Radwege: `w/highway`
3. Gefilterte PBF → `ogr2ogr`/geopandas (mit bestehender `osmconf`-Attributliste)
   → fgb. Jetzt sekundenschnell statt minutenlang.
4. tippecanoe → pmtiles.

**Config-Eintrag pro Kategorie:** `{ filter, attributes (aus osmconf), tile-profil }`.
Aktualisieren = `cli osm build --all`.
**Binary-Hinweis:** `osmium-tool` ist ein System-Binary (wie tippecanoe – Version
dokumentieren). Python-Alternative: `pyosmium`, aber CLI ist für tags-filter
einfacher.

---

## 11. Lizenz: Wechsel MIT → AGPL-3.0 (ENTSCHIEDEN)

- **Eigenes Recht:** Relizenzierung des eigenen Projekts jederzeit möglich. Bereits
  unter MIT veröffentlichte Versionen bleiben MIT; künftige sind AGPL. Bei
  quasi-Solo-Autorschaft unkritisch (MIT-Beiträge dürfen ins AGPL-Werk, Attribution
  erhalten).
- **Dependency-Kompatibilität:** alles permissiv (pandas/numpy/geopandas/shapely
  BSD, pyproj/GDAL MIT, tippecanoe/osmium BSD, MapLibre/PMTiles BSD-3) → AGPL-tauglich.
  Keine GPL-inkompatible Abhängigkeit.
- **Daten ≠ Code:** AGPL betrifft nur Code. Unfallatlas (dl-de/by-2-0), OSM (ODbL),
  OpenFreeMap (ODbL), Mapterhorn behalten ihre Lizenzen + Attribution.
- **§13-Pflicht (Network Use):** sichtbarer Quellcode-Link im UI – der GitHub-Link
  im Panel-Footer (aus `gradients2osm`) erfüllt das ohnehin.
- **To-do:** `LICENSE` auf AGPL-3.0 setzen, README-Lizenzhinweis, optional
  Datei-Header.

---

## 12. Offene Fragen (Rest)

1. **Repo-History (Reihenfolge geklärt):** Zwei getrennte Dinge nicht verwechseln:
   - *Jetzt, auf dem Branch (sicher):* `data/` in `.gitignore` **und** bereits
     getrackte Großdateien per `git rm --cached <datei>` aus dem Tracking nehmen
     (Datei bleibt lokal, raus aus künftigen Commits). Normaler Commit.
   - *Später, einmalig nach dem Merge (invasiv):* `git filter-repo` aufs ganze
     Repo + Force-Push, um die Alt-Blobs (~320 MB) aus der History zu tilgen.
     Hashes ändern sich, Inhalt bleibt. **Nicht** mitten in der Refactor-Phase –
     History-Rewrite ist eine Ganz-Repo-Operation, kein Branch-Schritt, und bringt
     während der Branch-Arbeit keinen Vorteil. Erst Branch fertig → mergen →
     läuft → dann als separate Aktion.

**Bereits entschieden:** uv (Packaging) · Local-first + B2-Fallback · neues Bucket
mit Subfoldern · generiertes `manifest.json` (Local-first + Datenstand) · stabile
Namen + B2-Versionierung · OSM via Geofabrik+osmium · einfache CLI-Orchestrierung ·
AGPL-3.0 · MapTiler raus → OpenFreeMap + Mapterhorn (gehosteter Endpoint) ·
Karten-Panel aus gradients2osm · Radinfrastruktur als Layer (Szenario optional,
auf OSM-Cycleway-Basis) · kein Docker (System-Binaries dokumentieren) ·
`data/` gitignoren ab jetzt, History-Cleanup erst nach dem Merge.
