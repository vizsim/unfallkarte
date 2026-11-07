// legendHandlers.js

import { LAYER_REGISTRY } from "../layers/registry.js";
import { FOCUS, clusterHintHtml, focusAverage, focusClassLabels } from "../map/clusterModes.js";

// ─────────────────────────────────────────────────────────────────────────────────────
// Sichtbarkeit: dieses Modul setzt nur ZUSTAND (Klassen / data-Attribute), über `display`
// entscheidet ausschließlich style.css ("Sichtbarkeit der Legende: EIN Eigentümer").
// Früher schrieben drei Mechanismen gleichzeitig inline `display` — eine Funktion musste
// reparieren, was eine andere überschrieben hatte, und zwei Bedingungen liefen dabei
// jahrelang unbemerkt ins Leere.
// ─────────────────────────────────────────────────────────────────────────────────────

// Legenden-Blöcke, die es zusätzlich zu den Registry-Einträgen gibt (eigene Module).
// `mapillary` steht bewusst NICHT hier: #mapillary-legend existiert nicht — die echte
// Mapillary-Legende heißt #mapillary-filter-options und gehört js/utils/useMapillary.js.
const EXTRA_LEGEND_IDS = ["bikelanes"];

/** Legende #<id>-legend folgt ihrem Toggle #toggle-<id> (Toggle an == Layer sichtbar). */
function syncLegendBlocks() {
  const ids = [...LAYER_REGISTRY.map((e) => e.id), ...EXTRA_LEGEND_IDS];
  for (const id of ids) {
    const toggle = document.getElementById(`toggle-${id}`);
    const legend = document.getElementById(`${id}-legend`);
    if (toggle && legend) legend.classList.toggle("is-on", toggle.checked);
  }
}

export function applyLegendVisibility() {
  syncLegendBlocks();
}

// Layer mit eigener Daten-Zoomgrenze: unterhalb davon rendern sie nichts, darum zeigt die
// Legende dort einen Hinweis (ersetzt den früheren harten Zoom-Lock).
const ZOOM_HINTS = () => [
  // noch nicht in der Layer-Registry (eigene Module):
  { toggleId: "toggle-bikelanes", legendId: "bikelanes-legend", dataMinZoom: 9 },
  // Mapillary bleibt technisch bei z14 (externe Live-Tiles) — nur Hinweis, kein Lock.
  { toggleId: "toggle-mapillary", legendId: "mapillary-zoomhint", dataMinZoom: 14 },
  { toggleId: "toggle-mapillary_ts", legendId: "mapillary-ts-zoomhint", dataMinZoom: 14 },
  // alle Registry-Einträge mit Daten-Zoomgrenze (Kontext ab z9, Tempolimit/Uber ab z11)
  ...LAYER_REGISTRY.filter((e) => e.dataMinZoom != null)
    .map((e) => ({ toggleId: `toggle-${e.id}`, legendId: `${e.id}-legend`, dataMinZoom: e.dataMinZoom })),
];

export function updateLegendVisibilityByZoom(map) {
  if (!map || typeof map.getZoom !== "function") return;

  const legend = document.querySelector(".legend");
  if (!legend) return;
  const zoom = map.getZoom();

  // Das Zoom-Band ist der einzige Zoom-Zustand, den die Legende kennt: unter z11 zeigt die
  // Karte Cluster statt Einzelunfällen. Welche Abschnitte das ein- oder ausblendet, steht
  // in style.css. Bewusst AUCH im zugeklappten Zustand nachgeführt (früher stieg die
  // Funktion dann aus) — so stimmt der Zustand schon, bevor jemand aufklappt, und niemand
  // muss hinterher reparieren.
  legend.dataset.zoom = zoom < 11 ? "cluster" : "single";

  syncLegendBlocks();

  // Das Häkchen spiegelt den gemerkten Zustand, nicht die Sichtbarkeit eines Layers: je nach
  // Merkmal sind Torten ODER Kreise sichtbar (js/map/clusterView.js).
  const clusterCheckbox = document.querySelector('.section-checkbox[data-section="cluster"]');
  if (clusterCheckbox) clusterCheckbox.checked = isClusterSectionOn();

  // Zoom-Hinweis je Layer: sichtbar, solange der Layer aktiv ist und seine Daten noch nicht
  // gerendert werden. indeterminate zählt als aktiv (z. B. nur "Panorama-Bilder" an).
  for (const e of ZOOM_HINTS()) {
    const toggle = document.getElementById(e.toggleId);
    const hint = document.getElementById(e.legendId)?.querySelector(".zoom-hint");
    const active = toggle && (toggle.checked || toggle.indeterminate);
    hint?.classList.toggle("is-due", !!active && zoom < e.dataMinZoom);
  }
}

// "Zoomstufe X+" in den Zoom-Hinweisen ist ein Link: Klick zoomt die Karte auf die
// Stufe, ab der der Layer rendert (Hinweis verschwindet dann über zoomend-Handler).
export function setupZoomHintLinks(map) {
  document.querySelectorAll(".zoom-hint .zoom-link").forEach(a => {
    a.addEventListener("click", (ev) => {
      ev.preventDefault();
      map.easeTo({ zoom: Number(a.dataset.zoom) });
    });
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

// Cluster-Sektion ("Unfälle-Cluster nach Schwere"): beim ersten Laden der Session
// aktiviert, danach merkt sich sessionStorage den zuletzt gewählten Zustand.
export const CLUSTER_SESSION_KEY = "clusterSectionOn";

export function isClusterSectionOn() {
  const stored = sessionStorage.getItem(CLUSTER_SESSION_KEY);
  return stored === null ? true : stored === "true";
}

// Nur das Häkchen setzen — welche Cluster-Layer sichtbar werden, entscheidet clusterView beim
// nächsten updateColorStyle (main.js ruft es direkt danach auf).
export function setupLegendClusterCheckboxSync() {
  const clusterCheckbox = document.querySelector('.section-checkbox[data-section="cluster"]');
  if (clusterCheckbox) clusterCheckbox.checked = isClusterSectionOn();
}

/**
 * Cluster-Legende an die Ansicht anpassen (Zustand setzen, CSS zeigt an):
 *  - data-view am Cluster-Block: "pie" (Torten nach Schwere) | "share" (Anteil einer Beteiligung);
 *  - Erklärtext; bei Beteiligung die fünf Stufen in ihrem Farbton + Bundesschnitt
 *    (alles aus js/map/clusterModes.js — eine Quelle für Karte und Legende).
 */
export function updateClusterLegend(focus) {
  const section = document.getElementById("cluster-legend-section");
  if (!section) return;
  const share = FOCUS[focus];
  section.dataset.view = share ? "share" : "pie";

  const hint = section.querySelector(".cluster-hint");
  if (hint) hint.innerHTML = clusterHintHtml(focus);
  if (!share) return;

  const name = section.querySelector(".cluster-share-name");
  if (name) name.textContent = share.noun;
  const key = section.querySelector(".cluster-share-key");
  if (key) {
    key.innerHTML = focusClassLabels(focus)
      .map((label, i) => `<li><span class="cluster-legend-dot" style="background:${share.colors[i]}"></span>${label}</li>`)
      .join("");
  }
  const avg = section.querySelector(".cluster-share-avg");
  if (avg) avg.textContent = `Ø Deutschland ${focusAverage(focus)} – mittlere Stufe`;
}

/**
 * Legende auf Wurzel-Ebene zu-/aufklappen. Zugeklappt bleiben nur Titel und Unfallzähler
 * stehen — was das heißt, steht in style.css; hier wird nur der Zustand gesetzt.
 *
 * Ausgelagert aus dem Klick-Handler, weil das Handy-Layout die Legende beim Start zuklappt
 * (js/ui/mobileLayout.js) — dort ist sie ein Bottom-Sheet, und aufgeklappt läge sie über
 * der halben Karte.
 */
export function setLegendCollapsed(collapsed) {
  const legend = document.querySelector(".legend");
  if (!legend) return;

  legend.classList.toggle("collapsed", collapsed);

  const arrow = legend.querySelector('.toggle-arrow[data-arrow="legend-root"]');
  if (arrow) {
    arrow.classList.toggle("open", !collapsed);
    arrow.setAttribute("aria-expanded", String(!collapsed));
  }
}

export function setupLegendToggleHandlers() {
  // Abschnitts-Pfeile (Unfälle einzeln / Szenarien / Kontext …). Stand früher in main.js —
  // also ein zweiter Klapp-Mechanismus neben dem darunter, an einer ganz anderen Stelle.
  document.querySelectorAll(".section-arrow").forEach(arrow => {
    arrow.addEventListener("click", () => {
      const section = document.querySelector(`.legend-section[data-section="${arrow.dataset.arrow}"]`);
      if (!section) return;
      const isOpen = arrow.classList.contains("open");
      arrow.classList.toggle("open", !isOpen);
      arrow.setAttribute("aria-expanded", String(!isOpen));
      section.classList.toggle("collapsed", isOpen);
    });
  });

  document.querySelectorAll(".legend-header, .legend-section-allcontent").forEach(header => {
    header.addEventListener("click", (e) => {
      if (e.target.tagName === "INPUT" || e.target.classList.contains("info-icon")) return;

      const key = header.dataset.toggle;
      const arrow = header.querySelector(`.toggle-arrow[data-arrow="${key}"]`);

      if (key === "legend-root") {
        // Pfeil + aria setzt setLegendCollapsed selbst — darum hier raus.
        setLegendCollapsed(!document.querySelector(".legend").classList.contains("collapsed"));
        return;
      }

      const section =
        document.querySelector(`.legend-section-allcontent[data-section="${key}"]`) ||
        document.querySelector(`.legend-items[data-section="${key}"]`);
      if (section) section.classList.toggle("collapsed");

      if (arrow) {
        const open = arrow.classList.toggle("open");
        arrow.setAttribute("aria-expanded", String(open));
      }
    });
  });
}

export function setupLegendSectionCheckboxes(updateLayerFilter, onClusterToggle = () => {}) {
  document.querySelectorAll('.section-checkbox').forEach(sectionCb => {
    const sectionId = sectionCb.dataset.section;
    const section = document.querySelector(`.legend-section[data-section="${sectionId}"]`);
    if (!section) return;

    const itemCheckboxes = section.querySelectorAll('input[type="checkbox"]:not(.section-checkbox):not(#toggle-details)');

    sectionCb.addEventListener('change', () => {
      const checked = sectionCb.checked;

      if (sectionId === "cluster") {
        sessionStorage.setItem(CLUSTER_SESSION_KEY, String(checked));
        onClusterToggle();   // clusterView entscheidet: Torten, Kreise oder nichts
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

    // Sektionen ohne eigene Item-Checkboxen (z. B. "cluster") NICHT aus – nicht
    // vorhandenen – Kindern ableiten, sonst wird die Checkbox fälschlich abgehakt.
    // Deren Zustand steuern setupLegendClusterCheckboxSync + der change-Handler.
    if (itemCheckboxes.length > 0) {
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
    }
  });
}

