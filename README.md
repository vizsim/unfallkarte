![Status: Experimental](https://img.shields.io/badge/Status-Experimental-red)

# 🚧 Unfallkarte (Deutschland)

**Interaktive Webkarte** zur Darstellung und Erkundung von Verkehrsunfällen in Deutschland. Die Daten stammen aus dem [Unfallatlas des Statistischen Bundesamtes (Destatis)](https://unfallatlas.statistikportal.de/).

## 🚀 Online ansehen

👉 [Unfallkarte auf GitHub Pages](https://vizsim.github.io/unfallkarte/)

## ✨ Motivation

Mit diesem Projekt wollte ich...

- **PMTiles** kennenlernen und ausprobieren – ein modernes Format zur Bereitstellung von Vektor-Tiles über HTTP.
- **Tippecanoe** einsetzen, um große GeoJSON-Daten in performante Tiles zu verwandeln.
- Die Möglichkeiten von **Maplibre GL JS** nutzen – insbesondere Layer-Styling, Interaktionen und benutzerdefinierte Filter.
- **MapTilers Basemaps** verwenden – und für den Detailblick **Mapillary** integrieren.

Im Laufe der Weiterentwicklung wurden viele Komponenten weiterentwickelt und teilweise ersetzt.

## 🔄 Neuere Entwicklungen (Juni/Juli 2025)

Das Projekt hat sich in den letzten Monaten deutlich weiterentwickelt. Wichtige Neuerungen:

### ✅ Eigenes Hosting der Basemap

- **[Planetiler](https://github.com/onthegomap/planetiler)**: Erzeugt PMTiles direkt aus OpenStreetMap-Daten für die Hintergrundkarte.
- **[OpenMapTiles Style-Vorlage](https://github.com/openmaptiles/positron-gl-style)**: Verwendet als Ausgangspunkt für das Style-Design (inspiriert von *Positron Light*).
- **[Maputnik](https://github.com/maplibre/maputnik)**: Zum visuellen Editieren und Anpassen des Kartenstils (`style.json`).
- Die Basemap stammt **nicht mehr von MapTiler**, um API-Limits zu vermeiden.
- **Hillshade und 3D-Terrain** werden jedoch weiterhin über MapTiler bereitgestellt.

### ✅ Kontext durch zusätzliche Datenebenen

#### Straßen & Verkehr

- **Geschwindigkeitsbegrenzungen** (OpenStreetMap)
- **Gemessene Pkw-Geschwindigkeiten (nur Berlin)**  
  → Durchschnittsgeschwindigkeit je Tagesstunde aus *Uber Movement* (Q2 2019)
- **Verkehrsmengen deutschlandweit**  
  → Vom Umweltbundesamt (Lärmkartierung); nur Straßen mit >3 Mio. Fahrzeugen/Jahr (~10.000/Tag)
- **Stadtradeln-Daten 2020**  
  → Durchschnittsgeschwindigkeiten und Anzahl registrierter Fahrten
- **OpenBikeSensor (OBS)**  
  → Messungen zu Überholabständen aus dem OpenBikeSensor-Projekt

#### Sonstige

- **Lärmkarten (Tag/Nacht)**  des Umweltbundesamts (deutschlandweit!)
- **Schulen & Kindergärten** (OSM)
- **Gesundheitseinrichtungen** (OSM)
- **Spielplätze** (OSM)

### **Unterschiedliche Szenarien**

Sogenannte **Szenarien** kombinieren Unfalldaten mit ausgewählten Kontextinformationen  
(z. B. Unfallhäufung vor Schulen oder auf Straßen mit hoher Geschwindigkeit). 

Weitere Infos folgen.

## 🔍 Funktionen (Stand Mai 2025)

- **Filterung** der Unfälle nach:
  - Unfallschwere (Getötete, Schwerverletzte, Leichtverletzte)
  - Unfallart / -typ
  - Jahr (2017–2023, ab 2020 alle Bundesländer)
  - Beteiligte Verkehrsmittel (z. B. Fahrrad, Pkw, Fußgänger etc.)
- **Farbkodierung** nach gewähltem Kriterium
- **Mapillary-Integration**: Direkt zur Straßenansicht springen, wenn verfügbar
- **Cluster-Darstellung** bei niedrigem Zoom für bessere Übersicht
- Umschaltbare **Basemaps** (Standard/Satellit)

## 📦 Tools & Technologien

- **[Maplibre GL JS](https://maplibre.org/)**  
  Rendering-Engine für Webkarten mit Vektor-Tiles und Interaktionen.

- **[PMTiles](https://docs.protomaps.com/pmtiles/)**  
  Kompaktes, serverloses Tile-Format – wird direkt per HTTP gestreamt.

- **[Tippecanoe](https://github.com/mapbox/tippecanoe)**  
  CLI-Tool zur Konvertierung großer GeoJSON-Dateien in effiziente PMTiles.

- **[MapTiler](https://www.maptiler.com/)**  
  Ehemals für Basemaps genutzt – jetzt nur noch für Hillshade & 3D-Terrain.

- **[Mapillary](https://www.mapillary.com/)**  
  API-basierter Zugriff auf crowdsourcierte Straßenfotos (für kontextuelle Einblicke).

- **[Planetiler](https://github.com/onthegomap/planetiler)**  
  Generiert PMTiles direkt aus OpenStreetMap-Daten – ideal für selbst gehostete Basemaps.

- **[OpenMapTiles Style-Vorlage](https://github.com/openmaptiles/positron-gl-style)**  
  Style-Grundlage im Positron-Light-Stil für die Hintergrundkarte.

- **[Maputnik](https://github.com/maplibre/maputnik)**  
  Visueller Editor für das Anpassen von Vektor-Tile-Styles (`style.json`).

- **[pmtiles.io](https://pmtiles.io/)**  
  Praktisches Online-Tool zum Testen und Visualisieren von PMTiles-Dateien.

- **[Backblaze B2](https://www.backblaze.com/)**  
  Objekt-Storage für Hosting der PMTiles – wird aktuell genutzt, ggf. durch Alternative ersetzt.

