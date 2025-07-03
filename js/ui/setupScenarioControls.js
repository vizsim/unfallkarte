// setupScenarioControls.js

function applyClusterSizeFilter(minSize) {
  const value = parseInt(minSize, 10);
  const filter = [">=", ["to-number", ["get", "cluster_size"]], value];

  if (map.getLayer("scenario1-points")) map.setFilter("scenario1-points", filter);
  if (map.getLayer("scenario1-polys")) map.setFilter("scenario1-polys", filter);
}

function applyScenario2ClusterSizeFilter(minSize) {
  const value = parseInt(minSize, 10);
  const filter = [">=", ["to-number", ["get", "biped_counts"]], value];

  if (map.getLayer("scenario2-points")) map.setFilter("scenario2-points", filter);
  if (map.getLayer("scenario2-polys")) map.setFilter("scenario2-polys", filter);
}

export function setupScenarioControls(map) {
  const slider1 = document.getElementById("scenario1-slider");
  const sliderVal1 = document.getElementById("scenario1-slider-value");
  const sliderContainer1 = document.getElementById("scenario1-slider-container");

  slider1.addEventListener("input", () => {
    const val = parseInt(slider1.value, 10);
    sliderVal1.textContent = val;
    applyClusterSizeFilter(val);
    const percent = ((val - slider1.min) / (slider1.max - slider1.min)) * 100;
    slider1.style.setProperty("--progress", `${percent}%`);
  });

  document.getElementById("toggle-scenario1").addEventListener("change", function (e) {
    const checked = e.target.checked;
    map.setLayoutProperty("scenario1-points", "visibility", checked ? "visible" : "none");
    map.setLayoutProperty("scenario1-polys", "visibility", checked ? "visible" : "none");
    sliderContainer1.style.display = checked ? "block" : "none";
    if (checked) applyClusterSizeFilter(0);
  });

  const slider2 = document.getElementById("scenario2-slider");
  const sliderVal2 = document.getElementById("scenario2-slider-value");
  const sliderContainer2 = document.getElementById("scenario2-slider-container");

  slider2.addEventListener("input", () => {
    const val = parseInt(slider2.value, 10);
    sliderVal2.textContent = val;
    applyScenario2ClusterSizeFilter(val);
    const percent = ((val - slider2.min) / (slider2.max - slider2.min)) * 100;
    slider2.style.setProperty("--progress", `${percent}%`);
  });

  document.getElementById("toggle-scenario2").addEventListener("change", function (e) {
    const checked = e.target.checked;
    map.setLayoutProperty("scenario2-points", "visibility", checked ? "visible" : "none");
    map.setLayoutProperty("scenario2-polys", "visibility", checked ? "visible" : "none");
    sliderContainer2.style.display = checked ? "block" : "none";
    if (checked) applyScenario2ClusterSizeFilter(0);
  });



  function applyScenario8ClusterSizeFilter(minSize) {
    const value = parseInt(minSize, 10);
    const filter = [">=", ["to-number", ["get", "max_laerm_num"]], value];

    if (map.getLayer("scenario8-points")) map.setFilter("scenario8-points", filter);
    if (map.getLayer("scenario8-polys")) map.setFilter("scenario8-polys", filter);
  }

  const slider8 = document.getElementById("scenario8-slider");
  const sliderVal8 = document.getElementById("scenario8-slider-value");
  const sliderContainer8 = document.getElementById("scenario8-slider-container");

  slider8.addEventListener("input", () => {
    const val = parseInt(slider8.value, 10);
    sliderVal8.textContent = val;
    applyScenario8ClusterSizeFilter(val);
    const percent = ((val - slider8.min) / (slider8.max - slider8.min)) * 100;
    slider8.style.setProperty("--progress", `${percent}%`);
  });

  document.getElementById("toggle-scenario8").addEventListener("change", function (e) {
    const checked = e.target.checked;
    map.setLayoutProperty("scenario8-points", "visibility", checked ? "visible" : "none");
    map.setLayoutProperty("scenario8-polys", "visibility", checked ? "visible" : "none");
    sliderContainer8.style.display = checked ? "block" : "none";
    if (checked) applyScenario8ClusterSizeFilter(0);
  });



//   // Obacht: hier jetzt ein Kontext slider und kein Scenario slider, aber slider ist slider....
// document.getElementById("uspeed-slider").addEventListener("input", (e) => {
//   const hour = parseInt(e.target.value);
//   document.getElementById("uspeed-slider-value").textContent = hour;

//   // console.log("🎚️ Uspeed slider hour:", hour);

//   if (map.getLayer("uspeed")) {
//         map.setLayoutProperty("uspeed", "visibility", "visible"); // 👈 HIER EINBAUEN
//     const filter = ["==", ["to-number", ["get", "hour_of_day"]], hour]
//     // console.log("📦 Applying filter to uspeed:", filter);
//     map.setFilter("uspeed", filter);
//   } else {
//     console.warn("⚠️ 'uspeed' layer not found in map.");
//   }
// });

// let uspeedDebounceTimer = null;

// document.getElementById("uspeed-slider").addEventListener("input", (e) => {
//   const hour = parseInt(e.target.value, 10);
//   document.getElementById("uspeed-slider-value").textContent = hour;

//   // Clear previous timer if still running
//   if (uspeedDebounceTimer) {
//     clearTimeout(uspeedDebounceTimer);
//   }

//   // Set a new timer (e.g. 200 ms)
//   uspeedDebounceTimer = setTimeout(() => {
//     if (!map.getLayer("uspeed")) {
//       console.warn("⚠️ 'uspeed' layer not found in map.");
//       return;
//     }

//     // Ensure layer is visible
//     map.setLayoutProperty("uspeed", "visibility", "visible");

//     // Apply filtered hour
//     const filter = ["==", ["to-number", ["get", "hour_of_day"]], hour];
//     map.setFilter("uspeed", filter);
//   }, 200); // ← You can adjust this delay
// });



// let uspeedDebounceTimer = null;

// document.getElementById("uspeed-slider").addEventListener("input", (e) => {
//   const hour = parseInt(e.target.value, 10);
//   document.getElementById("uspeed-slider-value").textContent = hour;

//   if (uspeedDebounceTimer) {
//     clearTimeout(uspeedDebounceTimer);
//   }

//   uspeedDebounceTimer = setTimeout(() => {
//     const filter = ["==", ["to-number", ["get", "hour_of_day"]], hour];

//     for (const layer of ["uspeed-forward", "uspeed-reverse"]) {
//       if (map.getLayer(layer)) {
//         map.setLayoutProperty(layer, "visibility", "visible");
//         map.setFilter(layer, filter);
//       } else {
//         console.warn(`⚠️ Layer '${layer}' not found.`);
//       }
//     }
//   }, 200); // Debounce delay in ms
// });

let uspeedDebounceTimer = null;

document.getElementById("uspeed-slider").addEventListener("input", (e) => {
  const hour = parseInt(e.target.value, 10);
  document.getElementById("uspeed-slider-value").textContent = hour;

  if (uspeedDebounceTimer) {
    clearTimeout(uspeedDebounceTimer);
  }

  uspeedDebounceTimer = setTimeout(() => {
    const filters = {
      "uspeed-forward": [
        "all",
        ["==", ["to-number", ["get", "hour_of_day"]], hour],
        ["==", ["get", "reconstruction_direction"], "forward"]
      ],
      "uspeed-reverse": [
        "all",
        ["==", ["to-number", ["get", "hour_of_day"]], hour],
        ["==", ["get", "reconstruction_direction"], "reverse"]
      ]
    };

    for (const layer of ["uspeed-forward", "uspeed-reverse"]) {
      if (map.getLayer(layer)) {
        map.setLayoutProperty(layer, "visibility", "visible");
        map.setFilter(layer, filters[layer]);
      } else {
        console.warn(`⚠️ Layer '${layer}' not found.`);
      }
    }
  }, 200);
});





  // Other scenario toggles (3-8)
  for (let i = 3; i <= 8; i++) {
    const toggle = document.getElementById(`toggle-scenario${i}`);
    if (toggle) {
      toggle.addEventListener("change", function (e) {
        const checked = e.target.checked;
        map.setLayoutProperty(`scenario${i}-points`, "visibility", checked ? "visible" : "none");
        map.setLayoutProperty(`scenario${i}-polys`, "visibility", checked ? "visible" : "none");
        if (i === 6) {
          map.setLayoutProperty(`scenario6-polys2`, "visibility", checked ? "visible" : "none");
        }
      });
    }
  }






}
