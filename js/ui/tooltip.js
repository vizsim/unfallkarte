// tooltip.js — ein einziger, schneller Tooltip für die ganze App.
// Markup: beliebiges Element mit data-tip="Text". Delegiert auf document, damit
// auch dynamisch erzeugte Popup-Inhalte (data-tip) erfasst werden. Der Tooltip
// lebt auf document.body (position:fixed) und wird nie von scrollenden Panels
// oder Popups abgeschnitten. Erscheint nach 100 ms (statt ~1 s beim nativen title).

const DELAY_MS = 100;
const TOUCH_HIDE_MS = 6000;   // per Tap geöffnet: schließt sich von selbst wieder
const GAP = 8;

let tipEl = null;
let showTimer = null;
let current = null;

function ensureEl() {
  if (!tipEl) {
    tipEl = document.createElement("div");
    tipEl.className = "app-tooltip";
    tipEl.setAttribute("role", "tooltip");
    document.body.appendChild(tipEl);
  }
  return tipEl;
}

function place(target) {
  const el = ensureEl();
  const r = target.getBoundingClientRect();
  const tw = el.offsetWidth;
  const th = el.offsetHeight;

  let left = r.left + r.width / 2 - tw / 2;
  left = Math.max(GAP, Math.min(left, window.innerWidth - tw - GAP));

  let top = r.top - th - GAP;            // bevorzugt oberhalb
  if (top < GAP) top = r.bottom + GAP;   // kein Platz oben -> unterhalb

  el.style.left = `${Math.round(left)}px`;
  el.style.top = `${Math.round(top)}px`;
}

function show(target) {
  const text = target.getAttribute("data-tip");
  if (!text) return;
  const el = ensureEl();
  el.textContent = text;
  // erst unsichtbar messen, dann platzieren, dann einblenden
  el.style.visibility = "hidden";
  el.classList.add("is-visible");
  place(target);
  el.style.visibility = "";
}

function hide() {
  clearTimeout(showTimer);
  showTimer = null;
  current = null;
  if (tipEl) tipEl.classList.remove("is-visible");
}

function onEnter(target) {
  if (target === current) return;
  current = target;
  clearTimeout(showTimer);
  showTimer = setTimeout(() => { if (current === target) show(target); }, DELAY_MS);
}

export function setupTooltips() {
  document.addEventListener("mouseover", (e) => {
    const t = e.target.closest?.("[data-tip]");
    if (t) onEnter(t);
  });
  document.addEventListener("mouseout", (e) => {
    const t = e.target.closest?.("[data-tip]");
    // Nur ausblenden, wenn wir das aktuelle Ziel wirklich verlassen
    if (t && t === current && !t.contains(e.relatedTarget)) hide();
  });
  // Tastatur-Fokus (a11y)
  document.addEventListener("focusin", (e) => {
    const t = e.target.closest?.("[data-tip]");
    if (t) { current = t; show(t); }
  });
  document.addEventListener("focusout", hide);

  // Touch: es gibt kein Hover — ohne das hier war jedes ⓘ auf dem Handy ein totes
  // Zeichen, samt der Quellen-/Lizenzvermerke, die daran hängen. Ein Tipp öffnet den
  // Hinweis, der nächste (oder ein Tap daneben) schließt ihn.
  // In der CAPTURE-Phase und mit stopPropagation: das ⓘ steckt mal in der Titelzeile
  // des Sheets, mal in einem <label> mit Checkbox — ein Tap darauf soll den Hinweis
  // zeigen und NICHT das Sheet umklappen oder den Layer schalten. Alle data-tip-Träger
  // sind reine Hinweis-Zeichen, keine Bedienelemente; es geht also nichts verloren.
  document.addEventListener("click", (e) => {
    const t = e.target.closest?.("[data-tip]");
    if (!t) { hide(); return; }
    e.preventDefault();
    e.stopPropagation();
    // Gegen `current` prüfen reicht NICHT: auch auf Touch schickt der Browser vor dem Tap
    // ein synthetisches mouseover, das `current` bereits setzt — der erste Tipp hätte
    // damit "wieder zumachen" bedeutet und der Hinweis wäre nie aufgegangen.
    if (t === current && tipEl?.classList.contains("is-visible")) { hide(); return; }
    clearTimeout(showTimer);
    current = t;
    show(t);
    // Ohne Zeiger gibt es kein "verlassen" — nach ein paar Sekunden selbst zumachen.
    showTimer = setTimeout(hide, TOUCH_HIDE_MS);
  }, { capture: true });
  // Bei Scroll/Zoom/Resize verschwinden lassen (Position wäre sonst veraltet)
  window.addEventListener("scroll", hide, true);
  window.addEventListener("wheel", hide, { passive: true });
  window.addEventListener("resize", hide);
}
