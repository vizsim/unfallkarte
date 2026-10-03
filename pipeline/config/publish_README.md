# Unfallorte aus dem Unfallatlas: alle Jahre in einer Datei

Alle Unfälle mit Personenschaden aus dem [Unfallatlas](https://unfallatlas.statistikportal.de/)
der Statistischen Ämter des Bundes und der Länder, **{{jahr_von}} bis {{jahr_bis}} in einer
GeoParquet-Datei**, aufbereitet von [vizsim](https://vizsim.de/). Eine Zeile ist ein Unfall.
Die Jahresdateien sind zusammengeführt, die Spaltennamen vereinheitlicht, und die Datei ist
räumlich sortiert. Deshalb kannst du einen Ort oder ein Gebiet direkt aus dem Netz abfragen,
ohne die ganze Datei zu laden.

<!-- karten-export -->
Die Datei ist auch die Grundlage für den Export in der [Unfallkarte](https://vizsim.de/unfallkarte/):
Dort lädst du die Unfälle im Kartenausschnitt als GeoJSON oder CSV herunter, ganz ohne
Programmieren.
<!-- /karten-export -->

| | |
|---|---|
| Inhalt | Unfälle mit Personenschaden, Unfallatlas {{jahr_von}}–{{jahr_bis}} |
| Umfang | {{zeilen}} Unfälle |
| Format | GeoParquet 1.1, Punkte in WGS 84 (Länge/Breite), zstd-komprimiert |
| Größe | {{groesse}} |
| Stand | {{version}} |
| Lizenz | Datenlizenz Deutschland – Namensnennung – Version 2.0 ([Quellenvermerk](#quellenvermerk)) |
| Aktualisierung | einmal im Jahr, nachdem das neue Datenjahr erschienen ist (meist im Juli) |

> **Kein amtlicher Datensatz.** Das ist eine Aufbereitung der amtlichen Daten. Bei Abweichungen
> gilt das [Original](https://www.opengeodata.nrw.de/produkte/transport_verkehr/unfallatlas/).

---

## Dateien

| Datei | Inhalt |
|---|---|
| `{{alias}}` | die Daten, immer der neueste Stand |
| `{{dataset}}_<Jahre>_<Stand>.parquet` | dieselben Daten mit Stand im Namen, aktuell `{{datei}}`. Diese Dateien ändern sich nie |
| `latest.json` | nennt die aktuelle Datei mit Stand; dazu Prüfsumme, Größe, Schlüssel, Abdeckung |
| `coverage.csv` | Unfälle je Land und Jahr (0 = Land in diesem Jahr nicht im Unfallatlas) |
| `schluessel.csv` | alle Codes mit ihrer Bedeutung |
| `SHA256SUMS` | Prüfsumme der Parquet-Datei |
| `README.md` | diese Beschreibung |

Für Skripte, die immer die neuesten Daten nehmen sollen, gibt es `{{alias}}`.
Für eine nachvollziehbare Auswertung trägst du den Dateinamen mit Stand fest ein; er steht in
`latest.json` unter `datei`.

---

## Spalten

Spalten in **GROSSBUCHSTABEN** heißen wie in der
[Datensatzbeschreibung](https://www.opengeodata.nrw.de/produkte/transport_verkehr/unfallatlas/DSB_Unfallatlas.pdf)
des Unfallatlas. Die **kleingeschriebenen** Spalten haben wir ergänzt.

| Spalte | Typ | Bedeutung |
|---|---|---|
| `unfall_id` | Text | eindeutige Kennung innerhalb eines Stands: `<ags>-<Jahr>-<Nummer>` (siehe [unten](#bitte-vor-der-auswertung-lesen), Punkt 8) |
| `UJAHR` | Zahl | Jahr |
| `UMONAT` | Zahl | Monat (1–12) |
| `USTUNDE` | Zahl | Stunde (0–23) |
| `UWOCHENTAG` | Zahl | 1 = Sonntag, 2 = Montag … 7 = Samstag |
| `UKATEGORIE` | Zahl | schwerste Unfallfolge: 1 = mit Getöteten, 2 = mit Schwerverletzten, 3 = mit Leichtverletzten |
| `UART` | Zahl | Unfallart, 0–9 (siehe `schluessel.csv`) |
| `UTYP1` | Zahl | Unfalltyp, 1–7 (siehe `schluessel.csv`) |
| `ULICHTVERH` | Zahl | 0 = Tageslicht, 1 = Dämmerung, 2 = Dunkelheit |
| `USTRZUSTAND` | Zahl | 0 = trocken, 1 = nass/feucht/schlüpfrig, 2 = winterglatt |
| `IstRad`, `IstPKW`, `IstFuss`, `IstKrad`, `IstGkfz`, `IstSonstige` | Zahl | Beteiligung: 1 = ja, 0 = nein (Rad, Pkw, zu Fuß, Kraftrad, Güterkraftfahrzeug, Sonstige) |
| `PLST` | Zahl | Plausibilisierung des Unfallorts: 1 = reguläres Verfahren, 2 = erweitertes Verfahren für Unfälle mit Fahrradbeteiligung. Erst ab 2023, davor leer |
| `ULAND` | Text | Land, zweistellig (`01` Schleswig-Holstein … `16` Thüringen) |
| `UREGBEZ`, `UKREIS`, `UGEMEINDE` | Text | Regierungsbezirk, Kreis, Gemeinde (Teile des Gemeindeschlüssels) |
| `ags` | Text | Gemeindeschlüssel, 8-stellig = `ULAND` + `UREGBEZ` + `UKREIS` + `UGEMEINDE` |
| `XGCSWGS84` | Zahl | geografische Länge (WGS 84) |
| `YGCSWGS84` | Zahl | geografische Breite (WGS 84) |
| `geometry` | Punkt | dieselbe Lage als Geometrie (WKB), damit GIS-Programme die Datei als Punktlayer öffnen |

Nicht übernommen: `OBJECTID` (laufende Nummer innerhalb einer Jahresdatei, 2025 nicht mehr
geliefert), `UIDENTSTLAE` (steckt in `unfall_id`) und `LINREFX`/`LINREFY` (dieselbe Lage in
ETRS89/UTM 32N; aus Länge und Breite jederzeit umrechenbar).

---

## Bitte vor der Auswertung lesen

1. **Nur Unfälle mit Personenschaden.** Unfälle mit reinem Sachschaden enthält der
   Unfallatlas nicht.
2. **Nicht alle Länder für alle Jahre.** Die Länder sind zu unterschiedlichen Zeitpunkten
   dazugekommen. Ein Land fehlt in einem Jahr ganz, es ist nicht „unfallfrei“. Für Zeitreihen
   vergleichst du nur Länder und Jahre, die durchgehend enthalten sind (`coverage.csv`).

   {{abdeckung}}

3. **`IstGkfz` fehlt {{gkfz_leer}}.** Güterkraftfahrzeuge sind dort nicht getrennt erfasst,
   Unfälle mit Lkw stecken in `IstSonstige`.
4. **Ort ist der auf den Straßenabschnitt bezogene Unfallort.** Die Polizei erfasst die
   Koordinaten bei der Unfallaufnahme; im Unfallatlas liegt der Ort auf dem zugehörigen
   Straßenabschnitt. Rechne nicht mit Zentimetern.
5. **Kein Datum.** Es gibt Jahr, Monat, Wochentag und Stunde, aber keinen Tag. Ferien oder
   Feiertage lassen sich deshalb nicht genau herausfiltern.
6. **Gemeindeschlüssel wie geliefert.** `ags` stammt aus dem jeweiligen Unfalljahr. Nach
   Gemeindefusionen kann dieselbe Stelle in verschiedenen Jahren verschiedene Schlüssel haben.
   **Berlin und Hamburg** sind im Unfallatlas nach Bezirken aufgeteilt (`11001001` …
   `11012012`, `02101101` …), nicht unter dem amtlichen Schlüssel der Stadt. Für die ganze
   Stadt filterst du dort nach `ULAND` (`'11'` bzw. `'02'`).
7. **Wenige Fälle, große Schwankung.** An einer Kreuzung sind 0 bis 10 Unfälle in drei Jahren
   normal. Ein einzelnes Jahr sagt wenig.
8. **`unfall_id` gilt für einen Stand.** Die Nummer ist meist die Unfallnummer der Statistischen
   Landesämter (`UIDENTSTLAE`, 20-stellig). Wo die fehlt oder nicht eindeutig ist, steht dort
   `o` und die laufende Nummer der Jahresdatei (`OBJECTID`), etwa `05315000-2019-o121928`.
   Das betrifft
   {{id_ersatz}}
   (`id_ersatz` in `latest.json`). Veröffentlichen die Statistischen Ämter ein Jahr neu,
   können sich diese Nummern ändern. Für eine nachvollziehbare Auswertung nennst du deshalb
   ID **und** Dateinamen mit Stand.

---

## Daten beziehen

### Ganze Datei herunterladen

```bash
curl -O {{base_url}}SHA256SUMS
curl -O {{base_url}}{{alias}}
sha256sum -c --ignore-missing SHA256SUMS
```

<!-- karten-export -->
Ohne Programmieren geht es auch: In der [Unfallkarte](https://vizsim.de/unfallkarte/) zum Gebiet
zoomen und über das Download-Symbol unten in der Legende die Unfälle im Ausschnitt als GeoJSON
(für QGIS, uMap) oder CSV (für Excel) laden.
<!-- /karten-export -->

### Vorbereitung

Die Beispiele brauchen Python 3.10 oder neuer und diese Pakete:

```bash
pip install duckdb pandas geopandas
```

Zuerst die aktuelle Datei bestimmen. Alle folgenden Beispiele nutzen `URL`:

```python
import json
import urllib.request

BASE = "{{base_url}}"
URL = BASE + "{{alias}}"

# Stand, Schlüssel und Prüfsumme stehen in latest.json. Der eigene User-Agent ist nötig,
# weil manche Server die Standardkennung von Python ablehnen.
KOPF = {"User-Agent": "unfallorte-beispiel"}
with urllib.request.urlopen(urllib.request.Request(BASE + "latest.json", headers=KOPF)) as antwort:
    latest = json.load(antwort)

print(latest["version"], latest["zeilen"], "Unfälle")
```

DuckDB liest die Datei direkt aus dem Netz und lädt dabei nur die Teile, die zur Abfrage
passen. Das klappt, weil die Datei räumlich sortiert ist: Ein Filter auf `XGCSWGS84` und
`YGCSWGS84` überspringt den Rest von Deutschland. Für einen Stadtteil sind das meist ein
bis zwei MB. Beim ersten Mal lädt DuckDB dafür seine Erweiterung `httpfs` nach.

### Unfälle in einem Rechteck

```python
import duckdb

rechteck = duckdb.sql(f"""
    SELECT * EXCLUDE (geometry)
    FROM read_parquet('{URL}')
    WHERE XGCSWGS84 BETWEEN 13.390 AND 13.430   -- Länge (West–Ost)
      AND YGCSWGS84 BETWEEN 52.490 AND 52.510   -- Breite (Süd–Nord)
""").df()

print(len(rechteck), "Unfälle")
```

`EXCLUDE (geometry)` lässt die Geometrie weg. Für Tabellen brauchst du sie nicht, die Lage
steht in `XGCSWGS84` und `YGCSWGS84`.

### Unfälle im Umkreis eines Punkts (z. B. einer Kreuzung)

```python
import math


def umkreis(lon, lat, radius_m, url=None):
    """Unfälle im Umkreis von radius_m Metern, sortiert nach Abstand."""
    url = url or URL
    m_je_grad = 111_320
    dlat = radius_m / m_je_grad
    dlon = radius_m / (m_je_grad * math.cos(math.radians(lat)))
    df = duckdb.sql(f"""
        SELECT * EXCLUDE (geometry)
        FROM read_parquet('{url}')
        WHERE XGCSWGS84 BETWEEN {lon - dlon} AND {lon + dlon}
          AND YGCSWGS84 BETWEEN {lat - dlat} AND {lat + dlat}
    """).df()
    # Abstand in Metern; diese Näherung reicht für einige hundert Meter
    dx = (df["XGCSWGS84"] - lon) * m_je_grad * math.cos(math.radians(lat))
    dy = (df["YGCSWGS84"] - lat) * m_je_grad
    df["abstand_m"] = (dx**2 + dy**2) ** 0.5
    return df[df["abstand_m"] <= radius_m].sort_values("abstand_m")


kreuzung = umkreis(13.4183, 52.4990, 50)  # Kottbusser Tor, Berlin
print(len(kreuzung), "Unfälle im Umkreis von 50 m")
```

### Unfälle in einem Gebiet (Polygon)

Zeichne das Gebiet zum Beispiel auf [geojson.io](https://geojson.io) und speichere es als
`gebiet.geojson`. DuckDB holt die Unfälle im umschließenden Rechteck, GeoPandas schneidet
genau zu:

```python
import geopandas as gpd

gebiet = gpd.read_file("gebiet.geojson").to_crs(4326).union_all()
x0, y0, x1, y1 = gebiet.bounds

df = duckdb.sql(f"""
    SELECT * EXCLUDE (geometry)
    FROM read_parquet('{URL}')
    WHERE XGCSWGS84 BETWEEN {x0} AND {x1}
      AND YGCSWGS84 BETWEEN {y0} AND {y1}
""").df()

unfaelle = gpd.GeoDataFrame(
    df, geometry=gpd.points_from_xy(df["XGCSWGS84"], df["YGCSWGS84"]), crs=4326
)
unfaelle = unfaelle[unfaelle.within(gebiet)]
print(len(unfaelle), "Unfälle im Gebiet")
```

### Alle Unfälle einer Gemeinde, nach Jahr

Über den Gemeindeschlüssel `ags`, hier Köln (`05315000`). Den Schlüssel einer Gemeinde
findest du im [Gemeindeverzeichnis](https://www.destatis.de/DE/Themen/Laender-Regionen/Regionales/Gemeindeverzeichnis/_inhalt.html)
des Statistischen Bundesamts. Für Berlin und Hamburg nimm `ULAND` (Punkt 6 oben).

```python
koeln = duckdb.sql(f"""
    SELECT UJAHR AS jahr,
           count(*)                                AS unfaelle,
           count(*) FILTER (WHERE UKATEGORIE = 1)  AS mit_getoeteten,
           count(*) FILTER (WHERE UKATEGORIE = 2)  AS mit_schwerverletzten,
           count(*) FILTER (WHERE IstRad = 1)      AS mit_rad,
           count(*) FILTER (WHERE IstFuss = 1)     AS mit_fussgaengern
    FROM read_parquet('{URL}')
    WHERE ags = '05315000'
    GROUP BY UJAHR
    ORDER BY UJAHR
""").df()

print(koeln)
```

Nordrhein-Westfalen ist erst ab 2019 im Unfallatlas, die Tabelle beginnt deshalb mit 2019.

### Einen einzelnen Unfall

Über die `unfall_id`, etwa aus einer früheren Abfrage:

```python
unfall_id = kreuzung["unfall_id"].iloc[0]  # Beispiel: der erste Unfall von oben

unfall = duckdb.sql(f"""
    SELECT * EXCLUDE (geometry)
    FROM read_parquet('{URL}')
    WHERE unfall_id = '{unfall_id}'
""").df()

print(unfall.T)
```

Für `unfall_id` und `ags` enthält die Datei Bloom-Filter. DuckDB (ab Version 1.2) erkennt
damit die Teile der Datei, in denen der Wert sicher nicht vorkommt, und lädt sie nicht. Für eine
einzelne ID lädt DuckDB so meist nur ein bis zwei MB statt der ganzen Datei.

Du kennst nur den Ort, etwa aus einem Klick in der Karte? Dann nimm den nächstgelegenen Unfall:

```python
naechster = umkreis(13.4183, 52.4990, 30).head(1)
```

### Codes in Klartext

Die Bedeutungen stehen in `latest.json` (und in `schluessel.csv`):

```python
import pandas as pd


def mit_klartext(df):
    """Hängt für jede Schlüsselspalte eine Spalte <SPALTE>_text an."""
    for spalte, tabelle in latest["schluessel"].items():
        if spalte in df.columns:
            df[spalte + "_text"] = df[spalte].map(
                lambda v, t=tabelle: None if pd.isna(v)
                else t.get(v if isinstance(v, str) else str(int(v)))
            )
    return df


kreuzung = mit_klartext(kreuzung)
print(kreuzung[["UJAHR", "UKATEGORIE_text", "UART_text"]].head())
```

### Speichern für QGIS, uMap oder Excel

```python
unfaelle.to_file("unfaelle.gpkg", layer="unfaelle")      # QGIS
unfaelle.to_file("unfaelle.geojson", driver="GeoJSON")    # uMap, geojson.io
unfaelle.drop(columns="geometry").to_csv(                 # Excel (deutsch)
    "unfaelle.csv", sep=";", decimal=",", index=False, encoding="utf-8-sig"
)
```

Excel entfernt beim Öffnen führende Nullen, aus `05315000` wird `5315000`. Wenn du den
Gemeindeschlüssel brauchst, importiere die CSV über *Daten → Aus Text/CSV* und setze die
Spalte `ags` auf *Text*.

### Die ganze Datei lokal

Für viele Abfragen oder ganz Deutschland lohnt der Download ({{groesse}}):

```python
import hashlib
import shutil

anfrage = urllib.request.Request(BASE + latest["datei"], headers=KOPF)
with urllib.request.urlopen(anfrage) as antwort, open(latest["datei"], "wb") as f:
    shutil.copyfileobj(antwort, f)
with open(latest["datei"], "rb") as f:
    assert hashlib.sha256(f.read()).hexdigest() == latest["sha256"]

berlin = gpd.read_parquet(
    latest["datei"],
    columns=["unfall_id", "UJAHR", "UKATEGORIE", "IstRad", "geometry"],
    filters=[("ULAND", "=", "11")],
)
print(len(berlin), "Unfälle in Berlin")
```

Danach funktionieren alle DuckDB-Beispiele auch mit dem Dateinamen statt `URL`, nur schneller.

Ohne Python, mit der [DuckDB-Kommandozeile](https://duckdb.org/install/):

```sql
COPY (
    SELECT * EXCLUDE (geometry)
    FROM '{{base_url}}{{alias}}'
    WHERE ULAND = '11'
) TO 'berlin.csv';
```

---

## Quellenvermerk

Die Daten stehen unter der
[Datenlizenz Deutschland – Namensnennung – Version 2.0](https://www.govdata.de/dl-de/by-2-0).
Du darfst sie nutzen, verändern und weitergeben, wenn du die Quelle nennst und auf Änderungen
hinweist. Zum Kopieren:

> Datenquelle: Unfallatlas, © Statistische Ämter des Bundes und der Länder,
> Datenlizenz Deutschland – Namensnennung – Version 2.0 (www.govdata.de/dl-de/by-2-0),
> https://unfallatlas.statistikportal.de/. Daten aufbereitet von vizsim
> (zusammengeführt und vereinheitlicht), {{base_url}}.

Hast du die Daten selbst weiter verändert (gefiltert, ergänzt, zusammengefasst), sag das im
Quellenvermerk auch.

---

## Versionen

| Stand | Änderung |
|---|---|
{{versionen}}

Bei jedem Build übernehmen wir alle Jahre neu aus dem Original. Die Statistischen Ämter haben
einzelne Jahre schon nachträglich neu veröffentlicht, 2021 zum Beispiel im November 2024.
Ein neuer Stand kann deshalb auch ältere Jahre verändern.

Fehler gefunden? Bitte als [Issue im Repository der Unfallkarte](https://github.com/vizsim/unfallkarte/issues)
melden.

---

## English summary

All road accidents with personal injury from the German *Unfallatlas* (Statistical Offices of
the Federation and the Länder), {{jahr_von}}–{{jahr_bis}}, merged into one spatially sorted
GeoParquet file (WGS 84 points, zstd). Query an area remotely with DuckDB using range requests
(see the Python examples above), or download the whole file ({{groesse}}). Not all federal
states are included for all years (`coverage.csv`). License: Datenlizenz Deutschland –
Namensnennung – Version 2.0; please credit the source as shown under *Quellenvermerk*.
