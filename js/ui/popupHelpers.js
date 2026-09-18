// Kleine Bausteine für Popup-Karten (genutzt von js/layers/* und popupHandlers.js).

/** Tabellenzeile, nur wenn ein Wert da ist. `value` ist bereits HTML-escaped (siehe hoverPopup.js). */
export const row = (label, value) =>
    (value !== undefined && value !== null && value !== "" ? `<tr><td>${label}</td><td>${value}</td></tr>` : "");

/** link()-Fabrik: OSM-Objektseite aus `osm_id` (type = "node" | "way" | "relation"). */
export const osmLink = (type) => (p) =>
    (p.osm_id ? { href: `https://www.openstreetmap.org/${type}/${p.osm_id}`, label: "OpenStreetMap" } : null);
