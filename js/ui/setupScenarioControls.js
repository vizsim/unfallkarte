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


  // scenario9: Unfallhäufungen (Kriterien nach M Uko). Kombinierter Filter aus Min-Anzahl (n_max)
  // und Kriterium (rule). Beide Layer (Punkte/Polygone) teilen denselben Filter.
  function applyScenario9Filter(minN, rule) {
    const parts = [[">=", ["to-number", ["get", "n_max"]], parseInt(minN, 10)]];
    if (rule && rule !== "all") parts.push(["==", ["get", "rule"], rule]);
    const filter = ["all", ...parts];
    if (map.getLayer("scenario9-points")) map.setFilter("scenario9-points", filter);
    if (map.getLayer("scenario9-polys")) map.setFilter("scenario9-polys", filter);
  }

  const slider9 = document.getElementById("scenario9-slider");
  const sliderVal9 = document.getElementById("scenario9-slider-value");
  const select9 = document.getElementById("scenario9-rule");
  const controls9 = document.getElementById("scenario9-controls");

  function updateScenario9() {
    applyScenario9Filter(slider9.value, select9.value);
  }

  slider9.addEventListener("input", () => {
    const val = parseInt(slider9.value, 10);
    sliderVal9.textContent = val;
    updateScenario9();
    const percent = ((val - slider9.min) / (slider9.max - slider9.min)) * 100;
    slider9.style.setProperty("--progress", `${percent}%`);
  });

  select9.addEventListener("change", updateScenario9);

  document.getElementById("toggle-scenario9").addEventListener("change", function (e) {
    const checked = e.target.checked;
    map.setLayoutProperty("scenario9-points", "visibility", checked ? "visible" : "none");
    map.setLayoutProperty("scenario9-polys", "visibility", checked ? "visible" : "none");
    controls9.style.display = checked ? "block" : "none";
    if (checked) updateScenario9();
  });

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





  // Andere Szenario-Toggles (3-7). scenario8 hat oben einen eigenen Handler (inkl. Slider),
  // daher NICHT bis 8 laufen lassen -> sonst doppelte change-Bindung. (4/5/7 existieren
  // nicht -> werden durch das if(toggle) übersprungen.)
  for (let i = 3; i <= 7; i++) {
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
