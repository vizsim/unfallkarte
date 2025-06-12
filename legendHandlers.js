// legendHandlers.js

export function updateLegendVisibilityByZoom(map) {
  if (!map || typeof map.getZoom !== "function") return;
  const zoom = map.getZoom();
  const legend = document.querySelector(".legend");
  if (!legend || legend.classList.contains("collapsed")) return;

  const clusterLegendEl = document.getElementById("cluster-legend-section");
  const movebisLegend = document.getElementById("movebis-legend");
  const hvsLegend = document.getElementById("hvs-legend");
  const mapillaryLegend = document.getElementById("mapillary-legend");
  const maxspeedLegend = document.getElementById("maxspeed-legend");
  const obsLegend = document.getElementById("obs-legend");

  const movebisVisible = map.getLayoutProperty("movebis", "visibility") === "visible";
  const hvsVisible = map.getLayoutProperty("hvs", "visibility") === "visible";
  const mapillaryVisible =
    map.getLayoutProperty("mapillary-images-layer", "visibility") === "visible" ||
    map.getLayoutProperty("mapillary-images-halo", "visibility") === "visible";
  const maxspeedVisible =
    map.getLayoutProperty("maxspeed", "visibility") === "visible" ||
    map.getLayoutProperty("maxspeed_minor", "visibility") === "visible";
  const obsVisible = map.getLayoutProperty("obs", "visibility") === "visible";


  if (clusterLegendEl) clusterLegendEl.style.display = zoom < 11 ? "block" : "none";
  if (movebisLegend) movebisLegend.style.display = (movebisVisible && zoom >= 11) ? "block" : "none";
  if (hvsLegend) hvsLegend.style.display = (hvsVisible && zoom >= 11) ? "block" : "none";
  if (maxspeedLegend) maxspeedLegend.style.display = (maxspeedVisible && zoom >= 11) ? "block" : "none";
  if (mapillaryLegend) mapillaryLegend.style.display = (mapillaryVisible && zoom >= 14) ? "block" : "none";
  if (obsLegend) obsLegend.style.display = (obsVisible && zoom >= 11) ? "block" : "none";


  const clusterCheckbox = document.querySelector('.section-checkbox[data-section="cluster"]');
  if (clusterCheckbox) {
    const isVisible = map.getLayoutProperty("pie-clusters-fine-layer", "visibility") !== "none";
    clusterCheckbox.checked = isVisible;
  }

  Array.from(legend.children).forEach(el => {
    const isTitle = el.classList.contains("legend-title");
    const isFeatureCount = el.id === "feature-count-wrapper";
    const scenarioSections = Array.from(document.querySelectorAll(".scenario-legend-section"));
    const isSpecial = [
      clusterLegendEl,
      movebisLegend,
      hvsLegend,
      mapillaryLegend,
      maxspeedLegend,
      obsLegend,
      ...scenarioSections
    ].includes(el);

    if (zoom < 11) {
      el.style.display = (isTitle || isFeatureCount || isSpecial) ? "" : "none";
    } else {
      if (!isSpecial) el.style.display = "";
    }
  });
}

export function applyLegendVisibility() {
  const keys = [
    "schools", "health", "playgrounds",
    "hvs", "mapillary", "movebis", "maxspeed", "maxspeed_minor","obs",
    "scenario1", "scenario2", "scenario3", "scenario4", "scenario6"
  ];

  keys.forEach(key => {
    const toggle = document.getElementById(`toggle-${key}`);
    const legend = document.getElementById(`${key}-legend`);
    if (toggle && legend) {
      legend.style.display = toggle.checked ? "block" : "none";
    }
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
  document.querySelectorAll(".legend-header").forEach(header => {
    header.addEventListener("click", (e) => {
      if (e.target.tagName === "INPUT" || e.target.classList.contains("info-icon")) return;

      const key = header.dataset.toggle;
      const arrow = header.querySelector(`.toggle-arrow[data-arrow="${key}"]`);

      if (key === "legend-root") {
        const legend = document.querySelector(".legend");
        const collapsed = legend.classList.toggle("collapsed");

        //console.log("Legend root toggled:", collapsed); // <-- Add this


        Array.from(legend.children).forEach(el => {

          const zoom = map.getZoom();

          const clusterLegendEl = document.querySelector("#cluster-legend-section");
          const scenarioSections = Array.from(document.querySelectorAll(".scenario-legend-section"));
          const headers = document.querySelectorAll(".legend-header");

          const movebisLegend = document.getElementById("movebis-legend");
          const hvsLegend = document.getElementById("hvs-legend");
          const mapillaryLegend = document.getElementById("mapillary-legend");
          const maxspeedLegend = document.getElementById("maxspeed-legend");
          const obsLegend = document.getElementById("obs-legend");

          const isTitle = el.classList.contains("legend-title");
          const isFeatureCount = el.id === "feature-count-wrapper";

          // const scenarioSections = document.querySelectorAll(".scenario-legend-section");
          // const scenarioSections = Array.from(document.querySelectorAll(".scenario-legend-section"));
          const isScenario = scenarioSections.includes(el);

          // const clusterLegendEl = document.querySelector("#cluster-legend-section");
          const isClusterLegend = el === clusterLegendEl;
          const isOtherSpecial = [
            movebisLegend,
            hvsLegend,
            mapillaryLegend,
            maxspeedLegend,
            obsLegend
          ].includes(el);

          if (collapsed) {
            el.style.display =
              isTitle || isFeatureCount ? "" : "none";
          } else {
            if (zoom < 11) {
              el.style.display =
                isTitle || isFeatureCount || isClusterLegend || isScenario
                  ? ""
                  : "none";
            } else {
              if (isClusterLegend) {
                el.style.display = "none";
              } else if (!isOtherSpecial) {
                el.style.display = "";
              }
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
