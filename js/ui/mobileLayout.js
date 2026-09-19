// mobileLayout.js — Handy-Layout für die Legende.
//
// Auf schmalen Screens wandert die Legende per @media-Query (style.css, Abschnitt
// „Mobile") vom rechten Rand an den unteren und wird zum Bottom-Sheet: zugeklappt
// bleibt ein Streifen mit Titel und Unfallzähler stehen, aufgeklappt fährt sie über
// maximal 72 % der Höhe. Vorher verdeckte die 320-px-Legende oben rechts auf einem
// 360-px-Gerät fast die halbe Karte.
//
// Dasselbe für die Suche: sie belegte oben ein Band über die volle Breite, obwohl sie
// selten gebraucht wird. Auf dem Handy schrumpft sie zum Lupen-Knopf und fährt erst beim
// Antippen aus.
//
// Hier lebt nur, was CSS nicht kann:
//   1. beim ersten Laden zuklappen (auf dem Desktop bleibt alles wie bisher),
//   2. die tatsächliche Höhe des zugeklappten Sheets als `--legend-peek` melden,
//      damit die Bedienelemente unten links exakt darüber sitzen statt dahinter,
//   3. die Suche auf-/zuklappen samt Fokus und Tastatur.

import { setLegendCollapsed } from "./legendHandlers.js";

// Muss mit der Breakpoint-Breite in style.css übereinstimmen.
export const MOBILE_QUERY = "(max-width: 640px)";

export function setupMobileLayout() {
  const legend = document.querySelector(".legend");
  if (!legend || !window.matchMedia) return;

  const mql = window.matchMedia(MOBILE_QUERY);

  // Höhe des zugeklappten Sheets an CSS melden. Nur im zugeklappten Zustand messen:
  // aufgeklappt blendet das CSS die Bedienelemente ohnehin aus, und die dann viel
  // größere Höhe würde sie aus dem Bild schieben.
  const publishPeek = () => {
    if (!mql.matches || !legend.classList.contains("collapsed")) return;
    const height = Math.round(legend.getBoundingClientRect().height);
    if (height > 0) document.documentElement.style.setProperty("--legend-peek", `${height}px`);
  };

  if (window.ResizeObserver) new ResizeObserver(publishPeek).observe(legend);
  // Der Zähler wächst/schrumpft ohne Größenänderung des Sheets (z. B. „12.345" -> „8"),
  // die Klasse ändert sich beim Auf-/Zuklappen: beides über den Attribut-/Inhaltswechsel
  // mitnehmen.
  new MutationObserver(publishPeek).observe(legend, {
    attributes: true, attributeFilter: ["class"], childList: true, subtree: true, characterData: true,
  });

  const setGeocoderCollapsed = setupGeocoderToggle(mql);

  const applyBreakpoint = (matches) => {
    setLegendCollapsed(matches);
    setGeocoderCollapsed(matches);
    publishPeek();
  };

  if (mql.matches) applyBreakpoint(true);
  // Beim Drehen/Größenändern über die Grenze hinweg nachziehen — aber NICHT bei jeder
  // Größenänderung, sonst klappte das Sheet dem Nutzer unter den Fingern weg.
  mql.addEventListener("change", (e) => applyBreakpoint(e.matches));
}

/**
 * Suche auf dem Handy zum Lupen-Knopf falten. Liefert den Schalter zurück.
 * Der Knopf ist die vorhandene Eingabe-Umrandung — sie wird nur zusätzlich bedienbar
 * gemacht (Rolle, Tastatur, aria), statt ein zweites Element danebenzustellen.
 */
function setupGeocoderToggle(mql) {
  const geocoder = document.querySelector(".geocoder");
  const wrapper = geocoder?.querySelector(".geocoder-input-wrapper");
  const input = geocoder?.querySelector("#search");
  if (!geocoder || !wrapper || !input) return () => {};

  const setCollapsed = (collapsed) => {
    geocoder.classList.toggle("is-collapsed", collapsed);
    // Nur zugeklappt ist die Umrandung selbst ein Knopf; aufgeklappt gehört der Fokus
    // ins Eingabefeld, sonst stolpert die Tastaturbedienung über eine tote Station.
    if (collapsed) {
      wrapper.setAttribute("role", "button");
      wrapper.setAttribute("tabindex", "0");
      wrapper.setAttribute("aria-label", "Adresse suchen");
      wrapper.setAttribute("aria-expanded", "false");
    } else {
      wrapper.removeAttribute("role");
      wrapper.removeAttribute("tabindex");
      wrapper.removeAttribute("aria-label");
      wrapper.removeAttribute("aria-expanded");
    }
  };

  const expand = () => {
    if (!geocoder.classList.contains("is-collapsed")) return;
    setCollapsed(false);
    input.focus();
  };

  wrapper.addEventListener("click", expand);
  wrapper.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); expand(); }
  });

  // Wieder einklappen, sobald die Suche aus dem Blick ist — aber nur mit LEEREM Feld:
  // ein getippter Suchbegriff soll nicht unter dem Finger verschwinden.
  const collapseIfIdle = () => {
    if (mql.matches && !input.value.trim()) setCollapsed(true);
  };
  input.addEventListener("blur", () => setTimeout(collapseIfIdle, 150)); // Klick auf ein Ergebnis zuerst
  input.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    input.value = "";
    input.blur();
    collapseIfIdle();
  });

  return setCollapsed;
}
