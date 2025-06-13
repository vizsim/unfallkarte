// legendHandlers.js



const LEGEND_KEYS = [
  "cluster-legend-section",
  "movebis-legend",
  "hvs-legend",
  "mapillary-legend",
  "maxspeed-legend",
  "obs-legend",
  "laerm1-legend",
  "laerm2-legend"
];

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
    "schools", "health", "playgrounds",
    "hvs", "mapillary", "movebis", "maxspeed", "maxspeed_minor", "obs", "laerm1", "laerm2",
    "scenario1", "scenario2", "scenario3", "scenario4", "scenario6", "scenario7"
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
  const legend = document.querySelector(".legend");
  if (!legend || legend.classList.contains("collapsed")) return;

  const legends = getLegendElements();
  const {
    ["cluster-legend-section"]: clusterLegendEl,
    ["movebis-legend"]: movebisLegend,
    ["hvs-legend"]: hvsLegend,
    ["mapillary-legend"]: mapillaryLegend,
    ["maxspeed-legend"]: maxspeedLegend,
    ["obs-legend"]: obsLegend,
    ["laerm1-legend"]: laerm1Legend,
    ["laerm2-legend"]: laerm2Legend
  } = legends;

  const visibilityCheck = (layerId) => map.getLayoutProperty(layerId, "visibility") === "visible";

  if (clusterLegendEl) clusterLegendEl.style.display = zoom < 11 ? "block" : "none";
  if (movebisLegend) movebisLegend.style.display = (visibilityCheck("movebis") && zoom >= 11) ? "block" : "none";
  if (hvsLegend) hvsLegend.style.display = (visibilityCheck("hvs") && zoom >= 11) ? "block" : "none";
  if (maxspeedLegend) {
    const visible = visibilityCheck("maxspeed") || visibilityCheck("maxspeed_minor");
    maxspeedLegend.style.display = (visible && zoom >= 11) ? "block" : "none";
  }
  if (mapillaryLegend) {
    const visible = visibilityCheck("mapillary-images-layer") || visibilityCheck("mapillary-images-halo");
    mapillaryLegend.style.display = (visible && zoom >= 14) ? "block" : "none";
  }
  if (obsLegend) obsLegend.style.display = (visibilityCheck("obs") && zoom >= 11) ? "block" : "none";
  if (laerm1Legend) laerm1Legend.style.display = (visibilityCheck("laerm1") && zoom >= 11) ? "block" : "none";
  if (laerm2Legend) laerm2Legend.style.display = (visibilityCheck("laerm2") && zoom >= 11) ? "block" : "none";



  const clusterCheckbox = document.querySelector('.section-checkbox[data-section="cluster"]');
  if (clusterCheckbox) {
    const isVisible = visibilityCheck("pie-clusters-fine-layer");
    clusterCheckbox.checked = isVisible;
  }

  Array.from(legend.children).forEach(el => {
    const isTitle = el.classList.contains("legend-title");
    const isFeatureCount = el.id === "feature-count-wrapper";
    const isSpecial = isSpecialLegendElement(el, legends);

    el.style.display = zoom < 11
      ? (isTitle || isFeatureCount || isSpecial) ? "" : "none"
      : (!isSpecial ? "" : el.style.display);
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

  document.querySelectorAll(".legend-header").forEach(header => {
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
        const section = document.querySelector(`.legend-items[data-section="${key}"]`);
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

