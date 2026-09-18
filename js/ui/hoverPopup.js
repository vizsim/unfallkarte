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
//   render    (props, feature) -> HTML des Karten-Bodys (ohne Klick-Hinweise!)
//   link?     (props) -> { href, label } | null: im fixierten Fenster als anklickbare
//             Fußzeile in der Karte; mit openOnClick: true öffnet ein Klick auf das
//             Objekt den Link direkt (neuer Tab) statt das Fenster zu fixieren
//   onClick?  (feature, e) -> eigene Klick-Aktion (z. B. Chart-Popup), mit clickHint
//   anchor?   (feature) -> { lngLat, offset }: Popup an einem Punkt statt am Cursor
//   onEnter?/onLeave?  Hooks, wenn ein Feature dieses Eintrags gehovert/verlassen wird

const MAX_HOVER_CARDS = 3;  // Hover zeigt max. so viele Karten; fixiert = alle
const MAX_WIDTH = "340px";
const KIND_LABEL = { accidents: "Unfallatlas", context: "Kontext", scenario: "Szenario" };

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

    const card = ({ entry, feature }, { pinned }) => {
        const eyebrow = [KIND_LABEL[entry.kind], entry.eyebrow].filter(Boolean).join(" · ");
        const link = pinned ? entry.link?.(feature.properties) : null;
        const foot = link
            ? `<div class="pop-foot"><a href="${link.href}" target="_blank" rel="noopener">${link.label} →</a></div>`
            : "";
        return `<div class="pop-card pop-card--${entry.kind}">`
            + `<div class="pop-eyebrow">${eyebrow}</div>`
            + entry.render(feature.properties, feature) + foot
            + `</div>`;
    };

    // Klick auf den obersten Treffer: Link direkt öffnen? (sonst eigene Aktion / Pin)
    const directLink = ({ entry, feature }) => (entry.openOnClick ? entry.link?.(feature.properties) : null);

    // Hinweiszeile unter der Hover-Vorschau: was passiert bei Klick?
    const hoverHint = (hits, hidden, html) => {
        const top = hits[0];
        const link = directLink(top);
        if (link) return `→ Klick öffnet ${link.label}`;
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
        const a = hits[0].entry.anchor?.(hits[0].feature);
        popup.setLngLat(a?.lngLat ?? e.lngLat).setOffset(a?.offset ?? 0);
    };

    const clear = () => {
        if (!current) return;
        for (const h of current.hits) h.entry.onLeave?.();
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
            for (const h of hits) if (prev.get(h.entry) !== featureKey(h.feature)) h.entry.onEnter?.(h.feature);
            for (const entry of prev.keys()) if (!hits.some((h) => h.entry === entry)) entry.onLeave?.();
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
        if (top.entry.onClick) { top.entry.onClick(top.feature, e); return; }

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
