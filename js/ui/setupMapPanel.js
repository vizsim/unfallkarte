// setupMapPanel.js — die Karten-Bedienelemente unten links.
//
// Zwei Dinge, die zusammengehören, weil sie dieselbe Ecke des Bildschirms bespielen:
// das einklappbare Panel (Basemap, Relief, 3D-Gebäude) und die Zoom-/Kompass-Steuerung
// darüber. Lag vorher in main.js zwischen Bootstrap und Filter-Logik.

import { NavigationControl } from "../lib/maplibre.js";
import { setBasemap, setBuildings, setRelief } from "../map/basemapTerrain.js";

/** Panel unten links: Basemap-Auswahl (Positron/OSM/Esri), Relief, 3D-Gebäude. */
export function setupMapPanel(map) {
  const panel = document.getElementById("map-settings-panel");
  const panelToggle = document.getElementById("map-settings-toggle");
  if (panelToggle && panel) {
    panelToggle.addEventListener("click", () => {
      const collapsed = panel.classList.toggle("is-collapsed");
      panelToggle.setAttribute("aria-expanded", String(!collapsed));
    });
  }

  document.querySelectorAll(".basemap-btn[data-basemap]").forEach((btn) => {
    btn.addEventListener("click", () => {
      setBasemap(map, btn.dataset.basemap);
      document.querySelectorAll(".basemap-btn").forEach((b) => b.classList.remove("selected"));
      btn.classList.add("selected");
    });
  });

  document.getElementById("toggle-relief")
    ?.addEventListener("change", (e) => setRelief(map, e.target.checked));
  document.getElementById("toggle-buildings")
    ?.addEventListener("change", (e) => setBuildings(map, e.target.checked));
}

/**
 * Zoom-/Kompass-Steuerung in den eigenen Container hängen.
 * Bewusst NICHT über map.addControl: die Steuerung soll in #bottom-left-ui-container
 * sitzen (über dem Panel-Button), nicht in MapLibres eigener Ecke. `nav.onAdd(map)`
 * ist dafür der API-konforme Weg.
 */
export function addNavigationControl(map) {
  const container = document.getElementById("custom-nav-control");
  if (!container) return;

  const nav = new NavigationControl();
  container.appendChild(nav.onAdd(map));

  // Klick auf den Kompass stellt zusätzlich die Neigung zurück (MapLibre setzt nur den
  // Bearing). Der Knopf entsteht erst beim Einhängen -> kurz warten.
  setTimeout(() => {
    container.querySelector(".maplibregl-ctrl-compass")?.addEventListener("click", () => {
      map.setPitch(0);
      map.easeTo({ bearing: 0 });
    });
  }, 100);
}
