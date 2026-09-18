// hoverPopup.js — EIN Hover-Popup für die ganze Karte (Issue #30).
//
// Früher hatte jeder Layer sein eigenes Popup + eigene mouse-Listener. Lagen mehrere
// Objekte übereinander (Schule + Spielplatz + Szenario-Flächen), öffneten sich drei
// Popups, die sich gegenseitig verdeckten — und MapLibre fragte pro mousemove für
// JEDEN Layer-Listener separat queryRenderedFeatures ab (~40 Abfragen).
//
// Jetzt: ein map-weiter mousemove, EINE Abfrage über alle registrierten Layer, alle
// Treffer als Karten UNTEREINANDER in einem Popup — in Render-Reihenfolge (was oben
// gezeichnet ist, steht oben). Nur sichtbare Layer zählen (queryRenderedFeatures),
// deaktivierte Layer tauchen automatisch nicht auf.
//
// Klick: hat der oberste Treffer eine eigene Aktion (openOnClick-Link / onClick), läuft
// die — sonst wird das Fenster fixiert (bleibt stehen, mit Schließen-Button; Links/
// Info-Icons darin sind anklickbar). Klick ins Leere schließt das fixierte Fenster.
// Solange ein Fenster fixiert ist, zeigt die Hover-Vorschau nur Objekte, die nicht
// schon darin stehen.
//
// Eintrag (siehe popupHandlers.js):
//   id        eindeutiger Name
//   kind      "accidents" | "context" | "scenario" — Gruppe; bestimmt Eyebrow-Präfix und
//             Karten-Optik (Szenarien mit Akzentbalken), damit Analyse-Ergebnisse und
//             reine Kontext-Infos im Stapel unterscheidbar bleiben
//   layers    Layer-IDs, die zu dieser Karte gehören (je Eintrag zählt das oberste Feature)
//   multi?    true: mehrere (verschiedene) Features desselben Eintrags dürfen gestapelt
//             werden — z. B. drei überlappende Unfallhäufungs-Flächen (Issue #31)
//   eyebrow?  Zusatz zur Eyebrow (z. B. Szenario-Name, Datenquelle)
//   render    (props, feature) -> HTML des Karten-Bodys (ohne Klick-Hinweise!); props ist
//             die ESCAPED-Sicht (s. u.), feature.properties die Rohwerte
//   link?     (props) -> { href, label } | null: im fixierten Fenster als anklickbare
//             Fußzeile in der Karte; mit openOnClick: true öffnet ein Klick auf das
//             Objekt den Link direkt (neuer Tab) statt das Fenster zu fixieren
//   onClick?  (feature, e) -> eigene Klick-Aktion (z. B. Chart-Popup), mit clickHint
//   anchor?   (feature) -> { lngLat, offset }: Popup an einem Punkt statt am Cursor
//   onEnter?/onLeave?  Hooks, wenn ein Feature dieses Eintrags gehovert/verlassen wird

//
// Sicherheit/Robustheit:
// - render() bekommt die Properties als ESCAPED-Sicht: jeder String-Wert kommt HTML-escaped
//   heraus. OSM-Attribute (name, operator …) sind nutzergeneriert und landen in innerHTML —
//   so kann kein Eintrag das Escapen vergessen. Rohwerte: feature.properties (2. Argument),
//   z. B. für Lookups mit Sonderzeichen. link()/onClick/anchor/Hooks bekommen Rohwerte;
//   hrefs escaped die Engine selbst und lässt nur http(s) zu.
// - Jeder Eintrags-Callback läuft abgesichert: wirft ein render(), fehlt nur DIESE Karte
//   (Fallback-Zeile + einmaliges console.error), der Rest des Stapels bleibt stehen.

const MAX_HOVER_CARDS = 3;  // Hover zeigt max. so viele Karten; fixiert = alle
const MAX_WIDTH = "340px";
const KIND_LABEL = { accidents: "Unfallatlas", context: "Kontext", scenario: "Szenario" };

const ESC = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
export const esc = (v) => String(v).replace(/[&<>"']/g, (c) => ESC[c]);
const escapedView = (props) => new Proxy(props, {
    get: (target, key) => (typeof target[key] === "string" ? esc(target[key]) : target[key])
});
const safeHref = (href) => (/^https?:\/\//i.test(String(href)) ? String(href) : null);

export function setupHoverPopup(map, entries) {
    const hoverPopup = new maplibregl.Popup({ closeButton: false, closeOnClick: false, maxWidth: MAX_WIDTH });
    let pinPopup = null;
    let pinKeys = null; // Set der fixierten Treffer-Schlüssel
    let current = null; // { key, hits }

    const layerToEntry = new Map();
    for (const entry of entries) for (const l of entry.layers) layerToEntry.set(l, entry);
    const allLayers = [...layerToEntry.keys()];

    // Feature-Schlüssel über Tile-Grenzen hinweg stabil: dasselbe Polygon liegt in
    // mehreren Tiles als getrennte Features mit identischen Properties vor.
    const featureKey = (f) => f.id ?? JSON.stringify(f.properties);
    const hitKey = (h) => `${h.entry.id}:${featureKey(h.feature)}`;
    const keyOf = (hits) => hits.map(hitKey).join("|");

    // Treffer am Punkt: je Eintrag das oberste Feature (bei multi: alle verschiedenen),
    // Reihenfolge = Render-Reihenfolge.
    const collect = (point) => {
        const layers = allLayers.filter((l) => map.getLayer(l)); // sonst wirft queryRenderedFeatures
        if (!layers.length) return [];
        const hits = [];
        const seen = new Set();
        for (const f of map.queryRenderedFeatures(point, { layers })) {
            const entry = layerToEntry.get(f.layer.id);
            if (!entry) continue;
            const k = entry.multi ? `${entry.id}:${featureKey(f)}` : entry.id;
            if (seen.has(k)) continue;
            seen.add(k);
            hits.push({ entry, feature: f });
        }
        return hits;
    };

    // Eintrags-Callback abgesichert ausführen; Fehler je Eintrag+Hook nur EINMAL loggen
    // (mousemove würde die Konsole sonst fluten).
    const warned = new Set();
    const safe = (entry, what, fn, fallback = null) => {
        try {
            return fn();
        } catch (err) {
            const k = `${entry.id}.${what}`;
            if (!warned.has(k)) {
                warned.add(k);
                console.error(`[hoverPopup] ${k} fehlgeschlagen:`, err);
            }
            return fallback;
        }
    };

    // Link eines Treffers (Rohwerte rein, geprüfte href raus) oder null.
    const linkOf = ({ entry, feature }) => {
        const link = entry.link ? safe(entry, "link", () => entry.link(feature.properties)) : null;
        const href = link && safeHref(link.href);
        return href ? { href, label: link.label } : null;
    };

    const card = (hit, { pinned }) => {
        const { entry, feature } = hit;
        const eyebrow = [KIND_LABEL[entry.kind], entry.eyebrow].filter(Boolean).join(" · ");
        const link = pinned ? linkOf(hit) : null;
        const foot = link
            ? `<div class="pop-foot"><a href="${esc(link.href)}" target="_blank" rel="noopener">${esc(link.label)} →</a></div>`
            : "";
        const body = safe(entry, "render", () => entry.render(escapedView(feature.properties), feature),
            `<div class="pop-meta">Details nicht darstellbar</div>`);
        return `<div class="pop-card pop-card--${entry.kind}">`
            + `<div class="pop-eyebrow">${eyebrow}</div>`
            + body + foot
            + `</div>`;
    };

    // Klick auf den obersten Treffer: Link direkt öffnen? (sonst eigene Aktion / Pin)
    const directLink = (hit) => (hit.entry.openOnClick ? linkOf(hit) : null);

    // Hinweiszeile unter der Hover-Vorschau: was passiert bei Klick?
    const hoverHint = (hits, hidden, html) => {
        const top = hits[0];
        const link = directLink(top);
        if (link) return `→ Klick öffnet ${esc(link.label)}`;
        if (top.entry.onClick) return top.entry.clickHint ?? "";
        if (hidden > 0) return `+${hidden} weitere · Klick zeigt alle`;
        // Nur wenn im Fenster etwas Anklickbares steckt (Link / Info-Icon), lohnt der Hinweis.
        return /href=|data-tip=/.test(html) || hits.some((h) => h.entry.link) ? "→ Klick fixiert das Fenster" : "";
    };

    const buildHTML = (hits, { pinned }) => {
        const shown = pinned ? hits : hits.slice(0, MAX_HOVER_CARDS);
        const hidden = hits.length - shown.length;
        const header = hits.length > 1 ? `<div class="pop-multi">${hits.length} Objekte an diesem Punkt</div>` : "";
        let html = header + shown.map((h) => card(h, { pinned })).join("");
        if (!pinned) {
            const hint = hoverHint(hits, hidden, html);
            if (hint) html += `<div class="pop-pinhint">${hint}</div>`;
        }
        return html;
    };

    const place = (popup, hits, e) => {
        const { entry, feature } = hits[0];
        const a = entry.anchor ? safe(entry, "anchor", () => entry.anchor(feature)) : null;
        popup.setLngLat(a?.lngLat ?? e.lngLat).setOffset(a?.offset ?? 0);
    };

    const enter = (h) => { if (h.entry.onEnter) safe(h.entry, "onEnter", () => h.entry.onEnter(h.feature)); };
    const leave = (entry) => { if (entry.onLeave) safe(entry, "onLeave", () => entry.onLeave()); };

    const clear = () => {
        if (!current) return;
        for (const h of current.hits) leave(h.entry);
        current = null;
        hoverPopup.remove();
        map.getCanvas().style.cursor = "";
    };

    const unpin = () => {
        if (pinPopup) pinPopup.remove(); // feuert "close" -> setzt pinPopup/pinKeys zurück
    };

    map.on("mousemove", (e) => {
        let hits = collect(e.point);
        const anyHit = hits.length > 0;
        // Bei fixiertem Fenster zeigt die Vorschau nur, was NICHT schon darin steht —
        // sonst stünde neben dem Pin eine fast identische Kopie.
        if (pinKeys) hits = hits.filter((h) => !pinKeys.has(hitKey(h)));
        if (!hits.length) {
            clear();
            if (anyHit) map.getCanvas().style.cursor = "pointer";
            return;
        }
        const key = keyOf(hits);
        if (!current || current.key !== key) {
            // Enter/Leave-Hooks nur für Einträge, deren Treffer sich geändert hat
            const prev = new Map((current?.hits ?? []).map((h) => [h.entry, featureKey(h.feature)]));
            for (const h of hits) if (prev.get(h.entry) !== featureKey(h.feature)) enter(h);
            for (const entry of prev.keys()) if (!hits.some((h) => h.entry === entry)) leave(entry);
            current = { key, hits };
            hoverPopup.setHTML(buildHTML(hits, { pinned: false }));
            map.getCanvas().style.cursor = "pointer";
        }
        place(hoverPopup, hits, e);
        if (!hoverPopup.isOpen()) hoverPopup.addTo(map);
    });

    map.on("mouseout", clear);

    map.on("click", (e) => {
        const hits = collect(e.point);
        if (!hits.length) { unpin(); return; }
        const top = hits[0];
        const link = directLink(top);
        if (link) { window.open(link.href, "_blank", "noopener"); return; }
        if (top.entry.onClick) { safe(top.entry, "onClick", () => top.entry.onClick(top.feature, e)); return; }

        clear();
        unpin();
        pinKeys = new Set(hits.map(hitKey));
        pinPopup = new maplibregl.Popup({ closeButton: true, closeOnClick: false, maxWidth: MAX_WIDTH })
            .setHTML(buildHTML(hits, { pinned: true }));
        place(pinPopup, hits, e);
        pinPopup.addTo(map);
        pinPopup.on("close", () => { pinPopup = null; pinKeys = null; });
    });
}
