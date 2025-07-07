import { applyZoomLock} from './zoomLock.js';


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

