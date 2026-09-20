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
//   3. die Suche auf-/zuklappen samt Fokus und Tastatur,
//   4. das Sheet mit dem Finger hochziehen/zuschieben (Tippen klappt weiter um).

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
  // Während einer Zieh-Geste ist das Sheet zwar noch `collapsed`, wird aber schon in
  // voller Höhe gerendert — die dann gemessene Höhe wäre keine Streifenhöhe.
  const publishPeek = () => {
    if (!mql.matches || !legend.classList.contains("collapsed")) return;
    if (legend.classList.contains("is-dragging")) return;
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
  setupSheetDrag(mql, legend, publishPeek);

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

// ── Zieh-Geste ──────────────────────────────────────────────────────────────────────
const DRAG_SLOP = 8;     // px — darunter ist es ein Tippen, keine Geste
const SNAP_MS = 180;     // Dauer der Schnapp-Animation beim Loslassen
const FLING = 0.4;       // px/ms — darüber entscheidet die Wurfrichtung, nicht der Weg

/**
 * Das Sheet mit dem Finger hochziehen bzw. zuschieben.
 *
 * Der Kniff: zugeklappt blendet CSS alles außer dem Streifen aus — zum Ziehen muss der
 * Inhalt aber schon da sein. Während der Geste trägt die Legende darum `is-dragging`,
 * rendert also in voller Höhe, und wird per `transform` so weit nach unten geschoben,
 * dass genau der Streifen stehen bleibt. Der Finger verkleinert diesen Versatz; beim
 * Loslassen schnappt das Sheet in den näheren Zustand — oder in den, in den geworfen
 * wurde (Geschwindigkeit schlägt Weg).
 *
 * Kurzes Tippen (< DRAG_SLOP) ist KEINE Geste: bis der Finger die Schwelle reißt, rührt
 * dieser Code das DOM nicht an, und der vorhandene Klick-Handler klappt um wie bisher.
 * (Früher Anfassen — Klasse, transform, setPointerCapture schon beim `pointerdown` —
 * verschluckte genau diesen Klick: mit aktivem Capture landet er auf der Legende statt
 * auf der Titelzeile.) Umgekehrt darf nach einer echten Geste kein Klick mehr
 * durchrutschen, sonst klappte das Sheet sofort wieder zu.
 *
 * Bewusst ohne Filter auf `pointerType`: die Geste funktioniert im schmalen Fenster auch
 * mit der Maus — nur so lässt sie sich im Test fahren.
 */
function setupSheetDrag(mql, legend, publishPeek) {
  let drag = null;
  let settleTimer = null;

  const peekHeight = () =>
    parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--legend-peek")) || 0;

  /** Nach einer echten Geste darf der Tipp-Handler nicht auch noch umklappen. */
  const swallowClick = () => {
    const stop = (ev) => { ev.stopPropagation(); ev.preventDefault(); };
    legend.addEventListener("click", stop, { capture: true, once: true });
    setTimeout(() => legend.removeEventListener("click", stop, { capture: true }), 400);
  };

  const settle = (open, span) => {
    legend.style.transition = `transform ${SNAP_MS}ms ease-out`;
    legend.style.transform = `translateY(${open ? 0 : span}px)`;
    // Kein `transitionend`: steht das Sheet schon am Ziel, käme es nie.
    settleTimer = setTimeout(() => {
      settleTimer = null;
      legend.style.transition = "";
      legend.style.transform = "";
      legend.classList.remove("is-dragging");
      setLegendCollapsed(!open);
      if (!open) legend.scrollTop = 0;
      publishPeek();
    }, SNAP_MS);
  };

  legend.addEventListener("pointerdown", (e) => {
    if (!mql.matches || e.button > 0) return;
    const collapsed = legend.classList.contains("collapsed");
    // Griff ist die Titelzeile, zugeklappt zusätzlich die Zählerzeile daneben.
    // Aufgeklappt muss der Inhalt darunter ganz normal scrollen dürfen.
    const onHandle = e.target.closest(".legend-title")
      || (collapsed && e.target.closest("#feature-count-wrapper"));
    if (!onHandle) return;

    if (settleTimer) { clearTimeout(settleTimer); settleTimer = null; }

    // Nur merken. Angefasst wird erst, wenn aus dem Tippen eine Bewegung wird.
    drag = { id: e.pointerId, startY: e.clientY, collapsed, active: false, t: e.timeStamp, v: 0 };
    // Die Bewegung MUSS am Fenster hängen: der Finger zieht das Sheet unter sich weg und
    // steht dann über der Karte — an der Legende kämen die Ereignisse nicht mehr an.
    addEventListener("pointermove", onMove);
    addEventListener("pointerup", end);
    addEventListener("pointercancel", end);
  });

  /** Aus dem Tippen ist eine Geste geworden: Sheet in voller Höhe rendern, zurückschieben. */
  const startDrag = (e) => {
    const peek = peekHeight() || legend.getBoundingClientRect().height;
    legend.classList.add("is-dragging");            // jetzt rendert das Sheet voll …
    const span = Math.max(0, legend.getBoundingClientRect().height - peek);
    drag.span = span;
    drag.from = drag.collapsed ? span : 0;
    drag.offset = drag.from;
    // … und wird im selben Frame zurückgeschoben, sonst blitzt es offen auf.
    legend.style.transform = `translateY(${drag.from}px)`;
    if (drag.collapsed) legend.scrollTop = 0;
    drag.active = true;
    drag.startY = e.clientY;                        // ohne den Schwellen-Versatz
  };

  function onMove(e) {
    if (!drag || e.pointerId !== drag.id) return;
    if (!drag.active) {
      if (Math.abs(e.clientY - drag.startY) < DRAG_SLOP) return;
      startDrag(e);
    }
    const dy = e.clientY - drag.startY;

    const next = Math.min(drag.span, Math.max(0, drag.from + dy));
    const dt = e.timeStamp - drag.t;
    if (dt > 0) drag.v = (next - drag.offset) / dt;   // + = nach unten
    drag.t = e.timeStamp;
    drag.offset = next;
    legend.style.transform = `translateY(${next}px)`;
  }

  function end(e) {
    if (!drag || e.pointerId !== drag.id) return;
    const { active, offset, span, v, from } = drag;
    drag = null;
    removeEventListener("pointermove", onMove);
    removeEventListener("pointerup", end);
    removeEventListener("pointercancel", end);

    if (!active) return;                            // Tippen: der Klick macht den Rest
    swallowClick();
    const open = e.type === "pointercancel" ? from === 0
      : v < -FLING ? true
        : v > FLING ? false
          : offset < span / 2;
    settle(open, span);
  }
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
