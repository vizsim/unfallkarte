// legendHandlers.js



const LEGEND_KEYS = [
  "cluster-legend-section",
  "movebis-legend",
  "svz-legend",
  "mapillary-legend",
  "maxspeed-legend",
  "obs-legend",
  "laerm1-legend",
  "laerm2-legend",
  "uspeed-legend"
];

// Letzter beobachteter Zoom — für die Erkennung des Übergangs ≥11 → <11 (Cluster wieder an).
let _prevZoom = null;

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
  const keys = [
    "schools", "health", "playgrounds", "crossings",
    "svz", "mapillary", "movebis", "maxspeed", "maxspeed_minor", "obs", "laerm1", "laerm2", "uspeed", "telraam",
    "bikelanes",
    "scenario1", "scenario2", "scenario3", "scenario6"
  ];

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

  // Beim Wechsel von Zoom ≥11 (Einzelunfälle) nach <11 die geclusterten Unfälle wieder
  // standardmäßig einblenden + Sektions-Checkbox aktivieren. (Läuft vor dem evtl. frühen
  // Return, damit es auch bei eingeklappter Legende greift.)
  if (_prevZoom !== null && _prevZoom >= 11 && zoom < 11) {
    for (const id of ["pie-clusters-fine-layer", "pie-clusters-coarse-layer"]) {
      if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", "visible");
    }
    const clusterCb = document.querySelector('.section-checkbox[data-section="cluster"]');
    if (clusterCb) clusterCb.checked = true;
  }
  _prevZoom = zoom;

  const legend = document.querySelector(".legend");
  if (!legend || legend.classList.contains("collapsed")) return;

  const legends = getLegendElements();
  const {
    ["cluster-legend-section"]: clusterLegendEl,
    ["movebis-legend"]: movebisLegend,
    ["svz-legend"]: svzLegend,
    ["mapillary-legend"]: mapillaryLegend,
    ["maxspeed-legend"]: maxspeedLegend,
    ["obs-legend"]: obsLegend,
    ["laerm1-legend"]: laerm1Legend,
    ["laerm2-legend"]: laerm2Legend,
    ["uspeed-legend"]: uspeedLegend
  } = legends;

  // Defensiv: fehlt der Layer (noch nicht geladen / Add fehlgeschlagen), nicht werfen —
  // sonst crasht die ganze Legenden-Funktion in einer Render-Schleife.
  const visibilityCheck = (layerId) =>
    !!map.getLayer(layerId) && map.getLayoutProperty(layerId, "visibility") === "visible";

  if (clusterLegendEl) clusterLegendEl.style.display = zoom < 11 ? "block" : "none";
  // Kontext-Legenden folgen nur noch der Layer-/Toggle-Sichtbarkeit (kein zoom≥11-Gate mehr),
  // damit die Kontext-Layer auch unter z11 in der Legende sichtbar bleiben.
  if (movebisLegend) movebisLegend.style.display = visibilityCheck("movebis") ? "block" : "none";
  if (svzLegend) {
    // svz-Legende hängt am Master (#toggle-svz), nicht an einem einzelnen Layer —
    // so bleibt sie auch bei „nur BASt" (Länder aus) sichtbar.
    const svzMaster = document.getElementById("toggle-svz");
    svzLegend.style.display = (svzMaster && svzMaster.checked) ? "block" : "none";
  }
  if (maxspeedLegend) {
    const visible = visibilityCheck("maxspeed") || visibilityCheck("maxspeed_minor");
    maxspeedLegend.style.display = visible ? "block" : "none";
  }
  if (mapillaryLegend) {
    const visible = visibilityCheck("mapillary-images-layer") || visibilityCheck("mapillary-images-halo");
    mapillaryLegend.style.display = (visible && zoom >= 14) ? "block" : "none";
  }
  if (obsLegend) obsLegend.style.display = visibilityCheck("obs") ? "block" : "none";
  if (laerm1Legend) laerm1Legend.style.display = visibilityCheck("laerm1") ? "block" : "none";
  if (laerm2Legend) laerm2Legend.style.display = visibilityCheck("laerm2") ? "block" : "none";

  if (uspeedLegend) {
    const isVisible =
      visibilityCheck("uspeed-forward") || visibilityCheck("uspeed-reverse");
    uspeedLegend.style.display = isVisible ? "block" : "none";
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
    { toggleId: "toggle-bikelanes", legendId: "bikelanes-legend", dataMinZoom: 9 },
    { toggleId: "toggle-maxspeed", legendId: "maxspeed-legend", dataMinZoom: 11 },
    // Schwung 1: statt hartem Zoom-Lock ein Zoom-Hinweis (Tiles reichen bis z5–z9,
    // per-Layer minzoom:9 in addLayers). svz-Eintrag deckt Länder/BASt/UBA(hvs) ab.
    { toggleId: "toggle-svz", legendId: "svz-legend", dataMinZoom: 9 },
    { toggleId: "toggle-obs", legendId: "obs-legend", dataMinZoom: 9 },
    { toggleId: "toggle-laerm1", legendId: "laerm1-legend", dataMinZoom: 9 },
    { toggleId: "toggle-laerm2", legendId: "laerm2-legend", dataMinZoom: 9 },
    // Mapillary bleibt technisch bei z14 (externe Live-Tiles) — nur Hinweis, kein Lock.
    { toggleId: "toggle-mapillary", legendId: "mapillary-zoomhint", dataMinZoom: 14 },
    // Schwung 2: Orte & Einrichtungen ab z9 (PMTiles neu getilt, minzoom 9).
    { toggleId: "toggle-schools", legendId: "schools-legend", dataMinZoom: 9 },
    { toggleId: "toggle-health", legendId: "health-legend", dataMinZoom: 9 },
    { toggleId: "toggle-playgrounds", legendId: "playgrounds-legend", dataMinZoom: 9 },
    // Schwung 3a: Querungen ab z9 (osm_features neu getilt, minzoom 9).
    { toggleId: "toggle-crossings", legendId: "crossings-legend", dataMinZoom: 9 },
    // Schwung 3c: movebis in Pipeline migriert, ab z9 (gestufter visits-Filter im Tiling).
    { toggleId: "toggle-movebis", legendId: "movebis-legend", dataMinZoom: 9 },
  ];
  // Die Kontext-Sektion bleibt unter z11 komplett sichtbar (siehe General-Loop oben) — die
  // Kontext-Layer reichen jetzt teils bis z9 herunter. Hier nur noch die Zoom-Hinweise je
  // Layer schalten: sichtbar, solange der Layer aktiv ist und die Daten noch nicht gerendert
  // werden (zoom < dataMinZoom, z. B. Radinfra <9, Tempolimit <11, Mapillary <14).
  for (const e of EARLY_CONTEXT) {
    const toggle = document.getElementById(e.toggleId);
    const legend = document.getElementById(e.legendId);
    const hint = legend && legend.querySelector(".zoom-hint");
    if (hint) hint.style.display = (toggle && toggle.checked && zoom < e.dataMinZoom) ? "block" : "none";
  }
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

export function setupLegendClusterCheckboxSync(map) {
  const clusterCheckbox = document.querySelector('.section-checkbox[data-section="cluster"]');
  if (clusterCheckbox) {
    const layerId = "pie-clusters-fine-layer";
    map.once("idle", () => {
      if (map.getLayer(layerId)) {
        const isVisible = map.getLayoutProperty(layerId, "visibility") !== "none";
        clusterCheckbox.checked = isVisible;
      }
    });
  }
}

export function setupLegendToggleHandlers() {
  const legends = getLegendElements();

  document.querySelectorAll(".legend-header, .legend-section-allcontent").forEach(header => {
    header.addEventListener("click", (e) => {
      if (e.target.tagName === "INPUT" || e.target.classList.contains("info-icon")) return;

      const key = header.dataset.toggle;
      const arrow = header.querySelector(`.toggle-arrow[data-arrow="${key}"]`);

      if (key === "legend-root") {
        const legend = document.querySelector(".legend");
        const collapsed = legend.classList.toggle("collapsed");
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
      } else {
        // const section = document.querySelector(`.legend-items[data-section="${key}"]`);
        const section =
          document.querySelector(`.legend-section-allcontent[data-section="${key}"]`) ||
          document.querySelector(`.legend-items[data-section="${key}"]`);
        if (section) section.classList.toggle("collapsed");
      }

      if (arrow) arrow.classList.toggle("open");
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
  });
}

