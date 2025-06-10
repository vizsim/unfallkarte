export function setupBaseLayerControls(map, isInitializingRef) {
  document.querySelectorAll('input[name="color-style"]').forEach(rb => {
    rb.addEventListener("change", () => {
      updatePermalink(map, isInitializingRef);
    });
  });

  document.querySelectorAll(".basemap-thumb").forEach(thumb => {
    thumb.addEventListener("click", () => {
      const selectedMap = thumb.dataset.map;
      const isSatellite = selectedMap === "satellite";

      map.setLayoutProperty("satellite-layer", "visibility", isSatellite ? "visible" : "none");

      document.querySelectorAll(".basemap-thumb").forEach(t => t.classList.remove("selected"));
      thumb.classList.add("selected");
    });
  });
}
