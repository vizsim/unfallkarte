import { applyZoomLock } from './zoomLock.js';


export function setupMapillary(map, {
  originalMinZoom,
  setCurrentZoomLock,
  applyLegendVisibility
}) {
  setupInteractivity(map);
  setupCheckboxHandlers(map, originalMinZoom, setCurrentZoomLock, applyLegendVisibility);
  updateMapillaryFilter(map, originalMinZoom, setCurrentZoomLock, applyLegendVisibility);
}


function setupInteractivity(map) {
  map.on("click", "mapillary-images-layer", (e) => {
    const feature = e.features?.[0];
    const imageId = feature?.properties?.id;
    if (imageId) {
      window.open(`https://www.mapillary.com/app/?pKey=${imageId}&focus=photo`, "_blank");
    }
  });

  map.on("mouseenter", "mapillary-images-layer", () => {
    map.getCanvas().style.cursor = "pointer";
  });
  map.on("mouseleave", "mapillary-images-layer", () => {
    map.getCanvas().style.cursor = "";
  });
}

function setupCheckboxHandlers(map, originalMinZoom, setCurrentZoomLock, applyLegendVisibility) {
  const toggleMapillary = document.getElementById("toggle-mapillary");
  const mapillaryFilterOptions = document.getElementById("mapillary-filter-options");
  const cbPano = document.getElementById("mapillary-pano");
  const cbNonPano = document.getElementById("mapillary-nonpano");

  toggleMapillary.addEventListener("change", () => {
    const checked = toggleMapillary.checked;
    mapillaryFilterOptions.style.display = checked ? "block" : "none";
    cbPano.checked = checked;
    cbNonPano.checked = checked;
    toggleMapillary.indeterminate = false;

    updateMapillaryFilter(map, originalMinZoom, setCurrentZoomLock, applyLegendVisibility);
  });

  [cbPano, cbNonPano].forEach(cb => {
    cb.addEventListener("change", () => {
      const both = cbPano.checked && cbNonPano.checked;
      const none = !cbPano.checked && !cbNonPano.checked;

      toggleMapillary.checked = both;
      toggleMapillary.indeterminate = !both && !none;

      updateMapillaryFilter(map, originalMinZoom, setCurrentZoomLock, applyLegendVisibility);
    });
  });
}


function updateMapillaryFilter(map, originalMinZoom, setCurrentZoomLock, applyLegendVisibility) {
  const cbPano = document.getElementById("mapillary-pano");
  const cbNonPano = document.getElementById("mapillary-nonpano");
  const filterOptions = document.getElementById("mapillary-filter-options");

  const showPano = cbPano.checked;
  const showNonPano = cbNonPano.checked;

  let baseFilter = ["any"];
  if (showPano) baseFilter.push(["==", ["to-string", ["get", "is_pano"]], "true"]);
  if (showNonPano) baseFilter.push(["==", ["to-string", ["get", "is_pano"]], "false"]);

  if (baseFilter.length === 1) baseFilter = ["==", "id", "__never__"];

  if (map.getLayer("mapillary-images-layer")) {
    map.setFilter("mapillary-images-layer", baseFilter);
  }

  if (map.getLayer("mapillary-images-halo")) {
    const haloFilter = showPano
      ? ["==", ["to-string", ["get", "is_pano"]], "true"]
      : ["==", "id", "__never__"];
    map.setFilter("mapillary-images-halo", haloFilter);
    map.setLayoutProperty("mapillary-images-halo", "visibility", showPano ? "visible" : "none");
  }

  const anyChecked = showPano || showNonPano;
  map.setLayoutProperty("mapillary-images-layer", "visibility", anyChecked ? "visible" : "none");
  filterOptions.style.display = anyChecked ? "block" : "none";

  applyZoomLock(map, originalMinZoom, setCurrentZoomLock);
  applyLegendVisibility();
}




//////////  Mapillary Traffic signs  //////////


export function setupMapillaryTS(map, {
  applyLegendVisibility
}) {
  setupMapillaryTSCheckboxHandlers(map, applyLegendVisibility);
  updateMapillaryTSFilter(map, applyLegendVisibility);
}

function setupMapillaryTSCheckboxHandlers(map, applyLegendVisibility) {
  const toggle = document.getElementById("toggle-mapillary_ts");
  const filterOptions = document.getElementById("mapillary-ts-filter-options");

  // Checkbox references
  const cbVZ1 = document.getElementById("mapillary-vz1");
  const cbVZ2 = document.getElementById("mapillary-vz2");
  const cbVZ3 = document.getElementById("mapillary-vz3");
  const cbVZ4 = document.getElementById("mapillary-vz4");
  const cbVZ5 = document.getElementById("mapillary-vz5");
  const cbVZ6 = document.getElementById("mapillary-vz6");
  const cbVZ7 = document.getElementById("mapillary-vz7");
  const cbVZ8 = document.getElementById("mapillary-vz8");
  const cbVZ9 = document.getElementById("mapillary-vz9");

  const groupRadverkehr = document.getElementById("ml-group-radverkehr");
  const groupGeschwindigkeit = document.getElementById("ml-group-geschwindigkeit");

  const checkboxesRadverkehr = [cbVZ1, cbVZ2, cbVZ3, cbVZ4];
  const checkboxesGeschwindigkeit = [cbVZ5, cbVZ6, cbVZ7, cbVZ8, cbVZ9];
  const allCheckboxes = [...checkboxesRadverkehr, ...checkboxesGeschwindigkeit];

  // Toggle master (top level)
  toggle.addEventListener("change", () => {
    const checked = toggle.checked;

    allCheckboxes.forEach(cb => cb.checked = checked);
    toggle.indeterminate = false;
    groupRadverkehr.checked = checked;
    groupRadverkehr.indeterminate = false;
    groupGeschwindigkeit.checked = checked;
    groupGeschwindigkeit.indeterminate = false;

    updateMapillaryTSFilter(map, applyLegendVisibility);
  });

  // Helper: Update group checkbox state
  function updateGroupCheckbox(groupCheckbox, checkboxes) {
    const all = checkboxes.every(cb => cb.checked);
    const none = checkboxes.every(cb => !cb.checked);
    groupCheckbox.checked = all;
    groupCheckbox.indeterminate = !all && !none;
  }

  // Per checkbox listener
  allCheckboxes.forEach(cb => {
    cb.addEventListener("change", () => {
      updateGroupCheckbox(groupRadverkehr, checkboxesRadverkehr);
      updateGroupCheckbox(groupGeschwindigkeit, checkboxesGeschwindigkeit);

      const all = allCheckboxes.every(c => c.checked);
      const none = allCheckboxes.every(c => !c.checked);
      toggle.checked = all;
      toggle.indeterminate = !all && !none;

      updateMapillaryTSFilter(map, applyLegendVisibility);
    });
  });

  // Group checkbox logic
  groupRadverkehr.addEventListener("change", () => {
    const checked = groupRadverkehr.checked;
    checkboxesRadverkehr.forEach(cb => cb.checked = checked);
    updateGroupCheckbox(groupRadverkehr, checkboxesRadverkehr);
    updateGroupCheckbox(groupGeschwindigkeit, checkboxesGeschwindigkeit);

    const all = allCheckboxes.every(c => c.checked);
    const none = allCheckboxes.every(c => !c.checked);
    toggle.checked = all;
    toggle.indeterminate = !all && !none;

    updateMapillaryTSFilter(map, applyLegendVisibility);
  });

  groupGeschwindigkeit.addEventListener("change", () => {
    const checked = groupGeschwindigkeit.checked;
    checkboxesGeschwindigkeit.forEach(cb => cb.checked = checked);
    updateGroupCheckbox(groupRadverkehr, checkboxesRadverkehr);
    updateGroupCheckbox(groupGeschwindigkeit, checkboxesGeschwindigkeit);

    const all = allCheckboxes.every(c => c.checked);
    const none = allCheckboxes.every(c => !c.checked);
    toggle.checked = all;
    toggle.indeterminate = !all && !none;

    updateMapillaryTSFilter(map, applyLegendVisibility);
  });

  // Zeit-Slider: filtert nach last_seen_at (letzte Bestätigung in Mapillary-Bildern).
  // max dynamisch aufs aktuelle Jahr setzen, damit der Regler nicht veraltet.
  const yearSlider = document.getElementById("mapillary-ts-year");
  if (yearSlider) {
    yearSlider.max = String(new Date().getFullYear());
    yearSlider.addEventListener("input", () => {
      updateMapillaryTSFilter(map, applyLegendVisibility);
    });
  }
}

function updateMapillaryTSFilter(map, applyLegendVisibility) {
  const cbVZ1 = document.getElementById("mapillary-vz1");
  const cbVZ2 = document.getElementById("mapillary-vz2");
  const cbVZ3 = document.getElementById("mapillary-vz3");
  const cbVZ4 = document.getElementById("mapillary-vz4");
  const cbVZ5 = document.getElementById("mapillary-vz5");
  const cbVZ6 = document.getElementById("mapillary-vz6");
  const cbVZ7 = document.getElementById("mapillary-vz7");
  const cbVZ8 = document.getElementById("mapillary-vz8");
  const cbVZ9 = document.getElementById("mapillary-vz9");

  const filterOptions = document.getElementById("mapillary-ts-filter-options");

  const selectedValues = [];

  if (cbVZ1.checked) selectedValues.push("regulatory--bicycles-only--g1"); // 237
  if (cbVZ2.checked) selectedValues.push("regulatory--shared-path-pedestrians-and-bicycles--g1"); // 240
  if (cbVZ3.checked) selectedValues.push("regulatory--dual-path-pedestrians-and-bicycles--g1"); // 241
  if (cbVZ4.checked) selectedValues.push("regulatory--dual-path-bicycles-and-pedestrians--g1"); // 241

  if (cbVZ5.checked) selectedValues.push("regulatory--maximum-speed-limit-30--g1"); // 274-30
  if (cbVZ6.checked) selectedValues.push("regulatory--maximum-speed-limit-50--g1"); // 274-50
  if (cbVZ7.checked) selectedValues.push("regulatory--maximum-speed-limit-70--g1"); // 274-70
  if (cbVZ8.checked) selectedValues.push("regulatory--maximum-speed-limit-80--g1"); // 274-80
  if (cbVZ9.checked) selectedValues.push("regulatory--maximum-speed-limit-100--g1"); // 274-100

  let baseFilter;

  if (selectedValues.length > 0) {
    baseFilter = ["in", ["get", "value"], ["literal", selectedValues]];
  } else {
    baseFilter = ["==", "value", "__never__"];
  }

  // Zeitfilter über last_seen_at (ms-Epoch). Slider am Minimum = "alle" (kein Zeitfilter).
  const yearSlider = document.getElementById("mapillary-ts-year");
  const yearLabel = document.getElementById("mapillary-ts-year-value");
  let filter = baseFilter;
  if (yearSlider) {
    const year = Number(yearSlider.value);
    const minYear = Number(yearSlider.min);
    if (yearLabel) yearLabel.textContent = year <= minYear ? "alle" : year;
    if (year > minYear) {
      const cutoffMs = Date.UTC(year, 0, 1);
      filter = ["all", baseFilter, [">=", ["to-number", ["get", "last_seen_at"]], cutoffMs]];
    }
  }

  if (map.getLayer("mapillary-ts")) {
    map.setFilter("mapillary-ts", filter);
    map.setLayoutProperty("mapillary-ts", "visibility", selectedValues.length > 0 ? "visible" : "none");
  }

  filterOptions.style.display = selectedValues.length > 0 ? "block" : "none";

  applyLegendVisibility();
}

