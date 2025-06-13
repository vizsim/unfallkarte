
// setupLayerToggles.js

export function setupLayerToggles(map, applyZoomLock, applyLegendVisibility) {





// just a copy of the old code

document.getElementById("toggle-movebis").addEventListener("change", function (e) {
  const checked = e.target.checked;
  map.setLayoutProperty("movebis", "visibility", checked ? "visible" : "none");

  applyZoomLock();
  applyLegendVisibility();
});

document.getElementById("toggle-hvs").addEventListener("change", function (e) {
  const checked = e.target.checked;
  map.setLayoutProperty("hvs", "visibility", checked ? "visible" : "none");

  applyZoomLock();
  applyLegendVisibility();
});

document.getElementById("toggle-obs").addEventListener("change", function (e) {
  const checked = e.target.checked;
  map.setLayoutProperty("obs", "visibility", checked ? "visible" : "none");

  applyZoomLock();
  applyLegendVisibility();
});

document.getElementById("toggle-laerm1").addEventListener("change", function (e) {
  const checked = e.target.checked;
  map.setLayoutProperty("laerm1", "visibility", checked ? "visible" : "none");

  applyZoomLock();
  applyLegendVisibility();
});

document.getElementById("toggle-laerm2").addEventListener("change", function (e) {
  const checked = e.target.checked;
  map.setLayoutProperty("laerm2", "visibility", checked ? "visible" : "none");

  applyZoomLock();
  applyLegendVisibility();
});



document.getElementById("toggle-maxspeed").addEventListener("change", function (e) {
  const checked = e.target.checked;
  const visibility = checked ? "visible" : "none";

  const layerIds = [
    "maxspeed",
    "maxspeed-conditional",
    "maxspeed-forward",
    "maxspeed-backward",
    "maxspeed-conditional-forward",
    "maxspeed-conditional-backward",
    "maxspeed_minor",
    "maxspeed_minor-conditional",
    "maxspeed_minor-forward",
    "maxspeed_minor-backward",
    "maxspeed_minor-conditional-forward",
    "maxspeed_minor-conditional-backward"
  ];

  layerIds.forEach(id => {
    if (map.getLayer(id)) {
      map.setLayoutProperty(id, "visibility", visibility);
    }
  });

  applyZoomLock();
  applyLegendVisibility();
});



document.getElementById("toggle-schools").addEventListener("change", function (e) {
  const checked = e.target.checked;
  map.setLayoutProperty("schools-points", "visibility", checked ? "visible" : "none");
  map.setLayoutProperty("schools-polygons", "visibility", checked ? "visible" : "none");

  applyZoomLock();
  applyLegendVisibility();
});

document.getElementById("toggle-health").addEventListener("change", function (e) {
  const checked = e.target.checked;
  map.setLayoutProperty("health-points", "visibility", checked ? "visible" : "none");
  map.setLayoutProperty("health-polygons", "visibility", checked ? "visible" : "none");

  applyZoomLock();
  applyLegendVisibility();
});

document.getElementById("toggle-playgrounds").addEventListener("change", function (e) {
  const checked = e.target.checked;
  map.setLayoutProperty("playgrounds-points", "visibility", checked ? "visible" : "none");
  map.setLayoutProperty("playgrounds-polygons", "visibility", checked ? "visible" : "none");

  applyZoomLock();
  applyLegendVisibility();
});


    // new ??

//   const checkboxMap = {
//     "toggle-movebis": ["movebis"],
//     "toggle-hvs": ["hvs"],
//     "toggle-maxspeed": [
//       "maxspeed", "maxspeed-conditional", "maxspeed-forward", "maxspeed-backward",
//       "maxspeed-conditional-forward", "maxspeed-conditional-backward",
//       "maxspeed_minor", "maxspeed_minor-conditional", "maxspeed_minor-forward",
//       "maxspeed_minor-backward", "maxspeed_minor-conditional-forward", "maxspeed_minor-conditional-backward"
//     ],
//     "toggle-schools": ["schools-points", "schools-polygons"],
//     "toggle-health": ["health-points", "health-polygons"],
//     "toggle-playgrounds": ["playgrounds-points", "playgrounds-polygons"]
//   };

//   for (const [checkboxId, layerIds] of Object.entries(checkboxMap)) {
//     const checkbox = document.getElementById(checkboxId);
//     if (!checkbox) continue;

//     checkbox.addEventListener("change", (e) => {
//       const visibility = e.target.checked ? "visible" : "none";

//       layerIds.forEach(layerId => {
//         if (map.getLayer(layerId)) {
//           map.setLayoutProperty(layerId, "visibility", visibility);
//         }
//       });

//       applyZoomLock();
//       applyLegendVisibility();
//     });
//   }


}
