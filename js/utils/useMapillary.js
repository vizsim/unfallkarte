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
  const cbVZ1 = document.getElementById("mapillary-vz1");
  const cbVZ2 = document.getElementById("mapillary-vz2");
  const cbVZ3 = document.getElementById("mapillary-vz3");
  const cbVZ4 = document.getElementById("mapillary-vz4");

  toggle.addEventListener("change", () => {
    const checked = toggle.checked;
    filterOptions.style.display = checked ? "block" : "none";
    cbVZ1.checked = checked;
    cbVZ2.checked = checked;
    cbVZ3.checked = checked;
    cbVZ4.checked = checked;
    toggle.indeterminate = false;

    updateMapillaryTSFilter(map, applyLegendVisibility);
  });

[cbVZ1, cbVZ2, cbVZ3, cbVZ4].forEach(cb => {
  cb.addEventListener("change", () => {
    const all = cbVZ1.checked && cbVZ2.checked && cbVZ3.checked && cbVZ4.checked;
    const none = !cbVZ1.checked && !cbVZ2.checked && !cbVZ3.checked && !cbVZ4.checked;

    toggle.checked = all;
    toggle.indeterminate = !all && !none;

    updateMapillaryTSFilter(map, applyLegendVisibility);
  });
});

}


function updateMapillaryTSFilter(map, applyLegendVisibility) {
  const cbVZ1 = document.getElementById("mapillary-vz1");
  const cbVZ2 = document.getElementById("mapillary-vz2");
  const cbVZ3 = document.getElementById("mapillary-vz3");
  const cbVZ4 = document.getElementById("mapillary-vz4");
  const filterOptions = document.getElementById("mapillary-ts-filter-options");

  const selectedValues = [];
  if (cbVZ1.checked) selectedValues.push("regulatory--bicycles-only--g1");  // 237
  if (cbVZ2.checked) selectedValues.push("regulatory--shared-path-pedestrians-and-bicycles--g1"); // 240
  if (cbVZ3.checked) selectedValues.push("regulatory--dual-path-pedestrians-and-bicycles--g1"); // 241
  if (cbVZ4.checked) selectedValues.push("regulatory--dual-path-bicycles-and-pedestrians--g1"); // 241

  let baseFilter;

  if (selectedValues.length > 0) {
    baseFilter = ["in", ["get", "value"], ["literal", selectedValues]];
  } else {
    baseFilter = ["==", "value", "__never__"];
  }

  if (map.getLayer("mapillary-ts")) {
    map.setFilter("mapillary-ts", baseFilter);
    map.setLayoutProperty("mapillary-ts", "visibility", selectedValues.length > 0 ? "visible" : "none");
  }

  filterOptions.style.display = selectedValues.length > 0 ? "block" : "none";

  applyLegendVisibility();
}

