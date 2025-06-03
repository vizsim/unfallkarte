![Status: Experimental](https://img.shields.io/badge/Status-Experimental-red)

# 🚧 Unfallkarte (Deutschland)

**Interaktive Webkarte** zur Darstellung und Erkundung von Verkehrsunfällen in Deutschland. Die Daten stammen aus dem [Unfallatlas des Statistischen Bundesamtes (Destatis)](https://unfallatlas.statistikportal.de/).

## ✨ Motivation

Mit diesem Projekt wollte ich...

- **PMTiles** kennenlernen und ausprobieren – ein modernes Format zur Bereitstellung von Vektor-Tiles über HTTP.
- **Tippecanoe** einsetzen, um große GeoJSON-Daten in performante Tiles zu verwandeln.
- Die Möglichkeiten von **Maplibre GL JS** nutzen – insbesondere Layer-Styling, Interaktionen und benutzerdefinierte Filter.
- **MapTilers Basemaps** verwenden – und für den Detailblick **Mapillary** integrieren.

## 🔍 Funktionen

- **Filterung** der Unfälle nach:
  - Unfallschwere (Getötete, Schwerverletzte, Leichtverletzte)
  - Unfallart / -typ
  - Jahr (2017–2023, ab 2020 alle Bundesländer)
  - Beteiligte Verkehrsmittel (z. B. Fahrrad, Pkw, Fußgänger etc.)
- **Farbkodierung** nach gewähltem Kriterium
- **Mapillary-Integration**: Direkt zur Straßenansicht springen, wenn verfügbar
- **Cluster-Darstellung** bei niedrigem Zoom für bessere Übersicht
- Umschaltbare **Basemaps** (Standard/Satellit)

## 🚀 Online ansehen

👉 [unfallkarte auf GitHub Pages](https://vizsim.github.io/unfallkarte/)

## 📦 Tools & Technologien

- [**Maplibre GL JS**](https://maplibre.org/) – Rendering und Interaktion für Webkarten
- [**PMTiles**](https://docs.protomaps.com/pmtiles/) – Tiles direkt per HTTP streamen, effizient & serverlos
- [**Tippecanoe**](https://github.com/mapbox/tippecanoe) – CLI-Tool zur Umwandlung großer GeoJSONs in kompakte Vektor-Tiles (PMTiles)
- [**MapTiler**](https://www.maptiler.com/) – Schöne, vielseitige Basemaps
- [**Mapillary**](https://www.mapillary.com/) – Crowdgesourcte, fotobasierte Straßendaten mit API-Zugriff