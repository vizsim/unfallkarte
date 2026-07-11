
// setupLayerToggles.js

// export function setupLayerToggles(map, applyZoomLock, applyLegendVisibility) {



import { applyZoomLock } from "../utils/zoomLock.js";
import { updateLegendVisibilityByZoom } from "./legendHandlers.js";
import { telraamColorExpr, applyUspeedHour } from "../mapdata/addLayers.js";
import { svzColorExpr, svzWidthExpr, svzRadiusExpr } from "../mapdata/addLayers.js";



export function setupToggle(map, checkboxId, layerIds, applyZoomLock, applyLegendVisibility) {
  const checkbox = document.getElementById(checkboxId);
  if (!checkbox) return;

  checkbox.addEventListener("change", (e) => {
    const visibility = e.target.checked ? "visible" : "none";

    layerIds.forEach(layerId => {
      if (map.getLayer(layerId)) {
        map.setLayoutProperty(layerId, "visibility", visibility);
      }
    });

    applyZoomLock();
    applyLegendVisibility();
    updateLegendVisibilityByZoom(map);  // Legende/Hinweis sofort an Zoom anpassen (z. B. Tempolimit < z11)
  });
}



export function setupLayerToggles(map, originalMinZoom, setCurrentZoomLock, applyLegendVisibility) {
  const zoomLock = () => applyZoomLock(map, originalMinZoom, setCurrentZoomLock);


  // Einfachere Handhabung der Layer
  setupToggle(map, "toggle-movebis", ["movebis"], zoomLock, applyLegendVisibility);
  // Verkehrsmengen: 1 Master-Toggle + 3 Quellen-Unterhaken (Länder/BASt/UBA) + DTV/SV.
  setupVerkehrsmengen(map, zoomLock, applyLegendVisibility);
  setupToggle(map, "toggle-obs", ["obs"], zoomLock, applyLegendVisibility);
  setupToggle(map, "toggle-laerm1", ["laerm1"], zoomLock, applyLegendVisibility);
  setupToggle(map, "toggle-laerm2", ["laerm2"], zoomLock, applyLegendVisibility);
  setupToggle(map, "toggle-telraam", ["telraam"], zoomLock, applyLegendVisibility);
  setupTelraamMode(map);

  // Für "maxspeed" Layer mit mehreren Layern
  setupToggle(map, "toggle-maxspeed", [
    "maxspeed", "maxspeed-conditional", "maxspeed-forward", "maxspeed-backward",
    "maxspeed-conditional-forward", "maxspeed-conditional-backward",
    "maxspeed_minor", "maxspeed_minor-conditional", "maxspeed_minor-forward",
    "maxspeed_minor-backward", "maxspeed_minor-conditional-forward", "maxspeed_minor-conditional-backward"
  ], zoomLock, applyLegendVisibility);

  // Für "uspeed" mit zusätzlicher Filter-/Farblogik (Wide-Format: speed_<h>-Attribut)
  document.getElementById("toggle-uspeed").addEventListener("change", (e) => {
    const visible = e.target.checked ? "visible" : "none";
    const hour = parseInt(document.getElementById("uspeed-slider").value);

    for (const layer of ["uspeed-forward", "uspeed-reverse"]) {
      if (map.getLayer(layer)) {
        map.setLayoutProperty(layer, "visibility", visible);
      }
    }
    applyUspeedHour(map, hour);

    document.getElementById("uspeed-legend").style.display = visible === "visible" ? "block" : "none";
    document.getElementById("uspeed-slider-container").style.display = visible === "visible" ? "block" : "none";

    zoomLock();
    applyLegendVisibility();
  });

  // Weitere Layer-Toggles nach ähnlichem Muster
  setupToggle(map, "toggle-schools", ["schools-points", "schools-polygons"], zoomLock, applyLegendVisibility);
  setupToggle(map, "toggle-health", ["health-points", "health-polygons"], zoomLock, applyLegendVisibility);
  setupToggle(map, "toggle-playgrounds", ["playgrounds-points", "playgrounds-polygons"], zoomLock, applyLegendVisibility);
  setupToggle(map, "toggle-crossings", ["crossings-points", "crossings-lines"], zoomLock, applyLegendVisibility);
}


// Telraam-Umschalter Auto/Rad: setzt die Linienfarbe auf den gewählten Modus und
// zeigt die passende Farb-Rampe. Wird einmal beim Setup initialisiert.
function setupTelraamMode(map) {
  const radios = document.querySelectorAll('input[name="telraam-mode"]');
  if (!radios.length) return;

  const apply = (mode) => {
    if (map.getLayer("telraam")) {
      map.setPaintProperty("telraam", "line-color", telraamColorExpr(mode));
    }
    document.querySelectorAll(".telraam-ramp").forEach(el => {
      el.style.display = el.dataset.mode === mode ? "block" : "none";
    });
  };

  radios.forEach(r => r.addEventListener("change", () => {
    const sel = document.querySelector('input[name="telraam-mode"]:checked');
    apply(sel ? sel.value : "bike");
  }));

  const init = document.querySelector('input[name="telraam-mode"]:checked');
  apply(init ? init.value : "bike");
}


// Verkehrsmengen-Gruppe: 1 Master-Toggle (#toggle-svz) + 3 Quellen-Unterhaken
// (Länder / BASt / UBA) + DTV/SV-Umschalter in EINER Steuerung.
//   Master AUS  -> alle Layer aus, Unterhaken/Legende eingeklappt.
//   Master AN   -> je Unterhaken: Länder (svz-lines/points), BASt (bast-points),
//                  UBA (hvs; startet aus).
//   Modus       -> setzt Farbe/Größe der SVZ-Layer; UBA gibt es NUR im DTV-Modus
//                  (Hauptverkehrsstraßen haben keinen SV-Anteil) -> im SV-Modus wird
//                  der UBA-Layer ausgeblendet und der Unterhaken deaktiviert.
// Der UBA-Unterhaken behält die id toggle-hvs -> hvs-legend/permalink unverändert.
function setupVerkehrsmengen(map, zoomLock, applyLegendVisibility) {
  const master = document.getElementById("toggle-svz");
  if (!master) return;
  const kids = document.getElementById("svz-children");
  const ubaCb = document.getElementById("toggle-hvs");
  const groups = [
    { cb: document.getElementById("toggle-svz-laender"), layers: ["svz-lines", "svz-points"], dtvOnly: false },
    { cb: document.getElementById("toggle-svz-bast"), layers: ["bast-points"], dtvOnly: false },
    { cb: ubaCb, layers: ["hvs"], dtvOnly: true },
  ];
  let mode = "dtv";

  const applyLayers = () => {
    const on = master.checked;
    for (const g of groups) {
      const modeOk = !g.dtvOnly || mode === "dtv";
      const vis = (on && g.cb && g.cb.checked && modeOk) ? "visible" : "none";
      for (const id of g.layers) {
        if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", vis);
      }
    }
    if (kids) kids.style.display = on ? "block" : "none";
    // UBA hat keinen SV-Anteil -> im SV-Modus Unterhaken deaktivieren (+ Hinweis).
    if (ubaCb) {
      const off = mode !== "dtv";
      ubaCb.disabled = off;
      const lab = ubaCb.closest("label");
      if (lab) {
        lab.style.opacity = off ? "0.45" : "";
        lab.title = off ? "UBA-Hauptverkehrsstraßen haben keinen SV-Anteil — nur im DTV-Modus." : "";
      }
    }
    zoomLock();
    applyLegendVisibility();
    updateLegendVisibilityByZoom(map);
  };

  const applyMode = (m) => {
    mode = m;
    if (map.getLayer("svz-lines")) {
      map.setPaintProperty("svz-lines", "line-color", svzColorExpr(mode));
      map.setPaintProperty("svz-lines", "line-width", svzWidthExpr(mode));
    }
    for (const id of ["svz-points", "bast-points"]) {
      if (!map.getLayer(id)) continue;
      map.setPaintProperty(id, "circle-color", svzColorExpr(mode));
      map.setPaintProperty(id, "circle-radius", svzRadiusExpr(mode));
    }
    document.querySelectorAll(".svz-ramp").forEach(el => {
      el.style.display = el.dataset.mode === mode ? "block" : "none";
    });
    applyLayers(); // UBA-Sichtbarkeit + disabled-Status an den Modus anpassen
  };

  master.addEventListener("change", applyLayers);
  for (const g of groups) if (g.cb) g.cb.addEventListener("change", applyLayers);
  document.querySelectorAll('input[name="svz-mode"]').forEach(r =>
    r.addEventListener("change", () => {
      const sel = document.querySelector('input[name="svz-mode"]:checked');
      applyMode(sel ? sel.value : "dtv");
    })
  );

  const initMode = document.querySelector('input[name="svz-mode"]:checked');
  applyMode(initMode ? initMode.value : "dtv"); // ruft applyLayers()
}
