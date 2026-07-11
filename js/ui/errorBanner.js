// errorBanner.js
//
// Globales Fehler-Banner oben mittig über der Karte — für Fälle, in denen die
// Karte sonst kommentarlos leer bliebe (z.B. Manifest/B2 nicht erreichbar,
// s. resolveSources.js). Wird dynamisch erzeugt (kein festes Markup in
// index.html) und ist schließbar; optional mit "Neu laden"-Aktion.

export function showErrorBanner(message, { reload = true } = {}) {
  let banner = document.getElementById("error-banner");
  if (!banner) {
    banner = document.createElement("div");
    banner.id = "error-banner";
    banner.className = "error-banner";
    banner.setAttribute("role", "alert");
    document.body.appendChild(banner);
  }

  banner.innerHTML = `
    <span class="error-banner-icon" aria-hidden="true">⚠️</span>
    <span class="error-banner-text">${message}</span>
    ${reload ? '<a href="#" class="error-banner-reload">Neu laden</a>' : ""}
    <button type="button" class="error-banner-close" aria-label="Hinweis schließen">×</button>
  `;

  banner.querySelector(".error-banner-close").addEventListener("click", () => banner.remove());
  banner.querySelector(".error-banner-reload")?.addEventListener("click", (e) => {
    e.preventDefault();
    location.reload();
  });
}
