// legendHandlers.js

import { LAYER_REGISTRY } from "../layers/registry.js";

// Legenden-Blöcke, die noch nicht über die Layer-Registry laufen (js/layers/registry.js).
const LEGEND_KEYS = [
  "cluster-legend-section",
  "mapillary-legend"
];

// Registry-Einträge: Legende #<id>-legend folgt dem Toggle #toggle-<id> (der Toggle schaltet
// die Layer, also sind "Toggle an" und "Layer sichtbar" dasselbe).
function syncRegistryLegends() {
  for (const { id } of LAYER_REGISTRY) {
    const toggle = document.getElementById(`toggle-${id}`);
    const legend = document.getElementById(`${id}-legend`);
    if (toggle && legend) legend.style.display = toggle.checked ? "block" : "none";
  }
}

function getLegendElements() {
  const elements = Object.fromEntries(
    LEGEND_KEYS.map(id => [id, document.getElementById(id)])
  );
  elements.scenarioSections = Array.from(document.querySelectorAll(".scenario-legend-section"));
  return elements;
}

function isSpecialLegendElement(el, legends) {
  const legendElements = LEGEND_KEYS.map(id => legends[id]);
  return [...legendElements, ...legends.scenarioSections].includes(el);
}

export function applyLegendVisibility() {
  syncRegistryLegends();

  // noch nicht in der Registry:
  const keys = ["mapillary", "bikelanes"];

  keys.forEach(key => {
    const toggle = document.getElementById(`toggle-${key}`);
    const legend = document.getElementById(`${key}-legend`);
    if (toggle && legend) {
      legend.style.display = toggle.checked ? "block" : "none";
    }
  });
}

export function updateLegendVisibilityByZoom(map) {
  if (!map || typeof map.getZoom !== "function") return;

  const zoom = map.getZoom();

  const legend = document.querySelector(".legend");
  if (!legend || legend.classList.contains("collapsed")) return;

  const legends = getLegendElements();
  const {
    ["cluster-legend-section"]: clusterLegendEl,
    ["mapillary-legend"]: mapillaryLegend
  } = legends;

  // Defensiv: fehlt der Layer (noch nicht geladen / Add fehlgeschlagen), nicht werfen —
  // sonst crasht die ganze Legenden-Funktion in einer Render-Schleife.
  const visibilityCheck = (layerId) =>
    !!map.getLayer(layerId) && map.getLayoutProperty(layerId, "visibility") === "visible";

  if (clusterLegendEl) clusterLegendEl.style.display = zoom < 11 ? "block" : "none";
  // Kontext-Legenden folgen nur noch der Layer-/Toggle-Sichtbarkeit (kein zoom≥11-Gate mehr),
  // damit die Kontext-Layer auch unter z11 in der Legende sichtbar bleiben.
  syncRegistryLegends();
  if (mapillaryLegend) {
    const visible = visibilityCheck("mapillary-images-layer") || visibilityCheck("mapillary-images-halo");
    mapillaryLegend.style.display = (visible && zoom >= 14) ? "block" : "none";
  }


  const clusterCheckbox = document.querySelector('.section-checkbox[data-section="cluster"]');
  if (clusterCheckbox) {
    const isVisible = visibilityCheck("pie-clusters-fine-layer");
    clusterCheckbox.checked = isVisible;
  }

  const kontextSection = document.querySelector('.legend-section[data-section="kontext"]');

  Array.from(legend.children).forEach(el => {
    const isTitle = el.classList.contains("legend-title");
    const isFeatureCount = el.id === "feature-count-wrapper";
    const isSpecial = isSpecialLegendElement(el, legends);
    const isKontext = el === kontextSection;   // Kontext-Sektion bleibt immer sichtbar

    el.style.display = zoom < 11
      ? (isTitle || isFeatureCount || isSpecial || isKontext) ? "" : "none"
      : (!isSpecial ? "" : el.style.display);
  });

  // Kontext-Layer, die schon vor Zoom 11 nutzbar bleiben (Radinfra ab z9, Tempolimit ab z11):
  // Zeile + Legende auch unter Zoom 11 sichtbar halten, wenn aktiv (restlicher Kontext-Inhalt
  // bleibt aus), und je einen Zoom-Hinweis nur unter dataMinZoom zeigen (= Daten noch nicht da,
  // ersetzt den früheren Zoom-Lock).
  const EARLY_CONTEXT = [
    // noch nicht in der Layer-Registry (eigene Module):
    { toggleId: "toggle-bikelanes", legendId: "bikelanes-legend", dataMinZoom: 9 },
    // Mapillary bleibt technisch bei z14 (externe Live-Tiles) — nur Hinweis, kein Lock.
    { toggleId: "toggle-mapillary", legendId: "mapillary-zoomhint", dataMinZoom: 14 },
    { toggleId: "toggle-mapillary_ts", legendId: "mapillary-ts-zoomhint", dataMinZoom: 14 },
    // alle Registry-Einträge mit Daten-Zoomgrenze (Kontext ab z9, Tempolimit/Uber ab z11)
    ...LAYER_REGISTRY.filter((e) => e.dataMinZoom != null)
      .map((e) => ({ toggleId: `toggle-${e.id}`, legendId: `${e.id}-legend`, dataMinZoom: e.dataMinZoom })),
  ];
  // Die Kontext-Sektion bleibt unter z11 komplett sichtbar (siehe General-Loop oben) — die
  // Kontext-Layer reichen jetzt teils bis z9 herunter. Hier nur noch die Zoom-Hinweise je
  // Layer schalten: sichtbar, solange der Layer aktiv ist und die Daten noch nicht gerendert
  // werden (zoom < dataMinZoom, z. B. Radinfra <9, Tempolimit <11, Mapillary <14).
  for (const e of EARLY_CONTEXT) {
    const toggle = document.getElementById(e.toggleId);
    const legend = document.getElementById(e.legendId);
    const hint = legend && legend.querySelector(".zoom-hint");
    // indeterminate zählt als aktiv (z. B. nur "Panorama-Bilder" oder einzelne VZ-Gruppen an).
    const active = toggle && (toggle.checked || toggle.indeterminate);
    if (hint) hint.style.display = (active && zoom < e.dataMinZoom) ? "block" : "none";
  }
}

// "Zoomstufe X+" in den Zoom-Hinweisen ist ein Link: Klick zoomt die Karte auf die
// Stufe, ab der der Layer rendert (Hinweis verschwindet dann über zoomend-Handler).
export function setupZoomHintLinks(map) {
  document.querySelectorAll(".zoom-hint .zoom-link").forEach(a => {
    a.addEventListener("click", (ev) => {
      ev.preventDefault();
      map.easeTo({ zoom: Number(a.dataset.zoom) });
    });
  });
}



export function updateScenarioLegendVisibility() {
  const legendBox = document.querySelector(".legend");
  const isCollapsed = legendBox.classList.contains("collapsed");

  document.querySelectorAll(".scenario-legend-section").forEach(section => {
    section.style.display = isCollapsed ? "none" : "block";
  });
}



export function updateLegendColors(activeKey, paintStyles) {
  document.querySelectorAll(".legend-item").forEach(item => {
    const group = item.getAttribute("data-group");
    const value = item.getAttribute("data-value");
    const span = item.querySelector("span");
    if (!span) return;

    if (activeKey === "BETEILIGUNG" && group === "BETEILIGUNG") {
      const field = item.dataset.field;
      const color = paintStyles.BETEILIGUNG.colors[field] || "#aaaaaa";
      span.style.backgroundColor = color;
    } else if (group === activeKey) {
      const color = paintStyles[group]?.colors?.[value] || "#aaaaaa";
      span.style.backgroundColor = color;
    } else {
      span.style.backgroundColor = "#ffffff";
    }
  });
}

// Cluster-Sektion ("Unfälle-Cluster nach Schwere"): beim ersten Laden der Session
// aktiviert, danach merkt sich sessionStorage den zuletzt gewählten Zustand.
export const CLUSTER_SESSION_KEY = "clusterSectionOn";

export function isClusterSectionOn() {
  const stored = sessionStorage.getItem(CLUSTER_SESSION_KEY);
  return stored === null ? true : stored === "true";
}

export function setupLegendClusterCheckboxSync(map) {
  const clusterCheckbox = document.querySelector('.section-checkbox[data-section="cluster"]');
  if (!clusterCheckbox) return;

  const on = isClusterSectionOn();
  clusterCheckbox.checked = on;
  ["pie-clusters-fine-layer", "pie-clusters-coarse-layer"].forEach(layerId => {
    if (map.getLayer(layerId)) {
      map.setLayoutProperty(layerId, "visibility", on ? "visible" : "none");
    }
  });
}

/**
 * Legende auf Wurzel-Ebene zu-/aufklappen. Zugeklappt bleiben nur Titel und Unfallzähler
 * stehen. Ausgelagert aus dem Klick-Handler, weil das Handy-Layout die Legende beim Start
 * zuklappt (js/ui/mobileLayout.js) — dort ist sie ein Bottom-Sheet, und aufgeklappt läge
 * sie über der halben Karte.
 */
export function setLegendCollapsed(collapsed) {
  const legend = document.querySelector(".legend");
  if (!legend) return;

  const legends = getLegendElements();
  legend.classList.toggle("collapsed", collapsed);
  const zoom = window.map.getZoom();

  Array.from(legend.children).forEach(el => {
    const isTitle = el.classList.contains("legend-title");
    const isFeatureCount = el.id === "feature-count-wrapper";
    const isScenario = legends.scenarioSections.includes(el);
    const isClusterLegend = el === legends.clusterLegendEl;
    const isOtherSpecial = isSpecialLegendElement(el, legends);

    if (collapsed) {
      el.style.display = isTitle || isFeatureCount ? "" : "none";
    } else {
      if (zoom < 11) {
        el.style.display = isTitle || isFeatureCount || isClusterLegend || isScenario ? "" : "none";
      } else {
        el.style.display = !isOtherSpecial ? "" : el.style.display;
      }
    }
  });

  if (!collapsed) {
    updateLegendVisibilityByZoom(window.map);
    updateScenarioLegendVisibility();
  }

  const arrow = legend.querySelector('.toggle-arrow[data-arrow="legend-root"]');
  if (arrow) {
    arrow.classList.toggle("open", !collapsed);
    arrow.setAttribute("aria-expanded", String(!collapsed));
  }
}

export function setupLegendToggleHandlers() {
  document.querySelectorAll(".legend-header, .legend-section-allcontent").forEach(header => {
    header.addEventListener("click", (e) => {
      if (e.target.tagName === "INPUT" || e.target.classList.contains("info-icon")) return;

      const key = header.dataset.toggle;
      const arrow = header.querySelector(`.toggle-arrow[data-arrow="${key}"]`);

      if (key === "legend-root") {
        // Pfeil + aria setzt setLegendCollapsed selbst — darum hier raus.
        setLegendCollapsed(!document.querySelector(".legend").classList.contains("collapsed"));
        return;
      }

      const section =
        document.querySelector(`.legend-section-allcontent[data-section="${key}"]`) ||
        document.querySelector(`.legend-items[data-section="${key}"]`);
      if (section) section.classList.toggle("collapsed");

      if (arrow) {
        const open = arrow.classList.toggle("open");
        arrow.setAttribute("aria-expanded", String(open));
      }
    });
  });
}

export function setupLegendSectionCheckboxes(updateLayerFilter) {
  document.querySelectorAll('.section-checkbox').forEach(sectionCb => {
    const sectionId = sectionCb.dataset.section;
    const section = document.querySelector(`.legend-section[data-section="${sectionId}"]`);
    if (!section) return;

    const itemCheckboxes = section.querySelectorAll('input[type="checkbox"]:not(.section-checkbox):not(#toggle-details)');

    sectionCb.addEventListener('change', () => {
      const checked = sectionCb.checked;

      if (sectionId === "cluster") {
        const visibility = checked ? "visible" : "none";
        ["pie-clusters-fine-layer", "pie-clusters-coarse-layer"].forEach(layerId => {
          if (window.map.getLayer(layerId)) {
            window.map.setLayoutProperty(layerId, "visibility", visibility);
          }
        });
        sessionStorage.setItem(CLUSTER_SESSION_KEY, String(checked));
        return;
      }

      if (sectionId === "scenario") {
        itemCheckboxes.forEach(cb => {
          cb.checked = checked;
          cb.dispatchEvent(new Event("change"));
        });
        return;
      }

      itemCheckboxes.forEach(cb => cb.checked = checked);
      sectionCb.indeterminate = false;
      updateLayerFilter();
    });

    itemCheckboxes.forEach(cb => {
      cb.addEventListener('change', () => {
        const checkedCount = Array.from(itemCheckboxes).filter(c => c.checked).length;

        if (checkedCount === 0) {
          sectionCb.checked = false;
          sectionCb.indeterminate = false;
        } else if (checkedCount === itemCheckboxes.length) {
          sectionCb.checked = true;
          sectionCb.indeterminate = false;
        } else {
          sectionCb.checked = false;
          sectionCb.indeterminate = true;
        }

        updateLayerFilter();
      });
    });

    // Sektionen ohne eigene Item-Checkboxen (z. B. "cluster") NICHT aus – nicht
    // vorhandenen – Kindern ableiten, sonst wird die Checkbox fälschlich abgehakt.
    // Deren Zustand steuern setupLegendClusterCheckboxSync + der change-Handler.
    if (itemCheckboxes.length > 0) {
      const checkedCount = Array.from(itemCheckboxes).filter(c => c.checked).length;
      if (checkedCount === 0) {
        sectionCb.checked = false;
        sectionCb.indeterminate = false;
      } else if (checkedCount === itemCheckboxes.length) {
        sectionCb.checked = true;
        sectionCb.indeterminate = false;
      } else {
        sectionCb.checked = false;
        sectionCb.indeterminate = true;
      }
    }
  });
}

