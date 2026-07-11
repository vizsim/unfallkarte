# TODO — Offene Punkte

Stand: 2026-07-11 (aus einem Projekt-Review). Ersetzt das frühere `WRAPUP.md`
(dessen Punkte sind alle erledigt). Historie des Notebook→Pipeline-Refactors:
[`REFACTORING_PLAN.md`](REFACTORING_PLAN.md).

## Stabilität

- [ ] **CI einrichten** — es gibt kein `.github/workflows/`; pytest + ruff laufen nur
      manuell. Minimal: uv sync → `uv run pytest` + `uvx ruff check` bei jedem Push.
- [x] JS-Libs vendoren statt unpkg (erledigt 2026-07, siehe `vendor/README.md`).

## Frontend / UX

- [ ] **Mobile-Breakpoint** — `style.css` hat keine einzige `@media`-Query; die
      320-px-Legende verdeckt auf Handys die halbe Karte. Idee: Legende auf kleinen
      Screens als einklappbares Bottom-Sheet.
- [ ] **Fehler-Banner** — sind Manifest/B2 nicht erreichbar, gibt es nur ein
      `console.warn` (`js/mapdata/resolveSources.js`); Nutzer sehen eine leere Karte
      ohne Erklärung.
- [x] **Tastatur/A11y (Klapp-Pfeile)** — erledigt 2026-07: alle 10 Pfeile sind
      `<button>` mit `aria-expanded` + `aria-label` und `:focus-visible`-Ring;
      per Enter/Space bedienbar (headless verifiziert). Offen bleibt A11y darüber
      hinaus (z. B. Kontrast-Audit, Screenreader-Test der Filterlisten).
- [x] **Inline-Styles abbauen** — erledigt 2026-07: 175 wiederkehrende `style="…"`
      durch Utility-Klassen ersetzt (`.row`, `.mt-*`, `.swatch-*` … am Ende von
      `style.css`), verifiziert per Computed-Style-Diff (811 Elemente, 0 Abweichungen).
      Bewusst inline geblieben: `display:none` (JS-gemanagter Zustand — Code setzt
      `el.style.display = ""` als Reset), Swatch-**Farben** (Dateninhalt je Layer)
      und Einzelfälle (~149 Reste).
- [ ] **Legende aus Config generieren** (langfristig) — die repetitiven
      Legenden-Blöcke in `index.html` sind Hauptquelle für Drift zwischen Layern
      und Legende.

## Sichtbarkeit / Auffindbarkeit

- [x] **Meta-Tags** — `<meta name="description">` + OpenGraph/Twitter-Cards ergänzt
      (erledigt 2026-07); `og:image` = `docs/screenshot.png`, absolute URLs auf
      `vizsim.de/unfallkarte/` (kanonisch; Crawler führen kein JS aus).
      Beim Erneuern des Screenshots mitdenken.
- [ ] **Favicon ersetzen** — aktuell `stationary-bike-gym-svgrepo-com.svg`
      (Heimtrainer-Icon).

## Deploy-Status klären

- [ ] **Telraam-Layer**: lokal gebaut, vermutlich noch nicht auf B2.
- [ ] **Neu getilte PMTiles** (schools/health/playgrounds/crossings mit minzoom 9,
      `movebis/movebis.pmtiles`): prüfen, ob der Stand im Bucket `unfallkarte-data-v2`
      aktuell ist (`b2 sync` + Manifest).

## Aufräumen

- [ ] `schrott/` (~810 MB, gitignored): OBS/Lärm/HVS sind inzwischen in die Pipeline
      migriert — deren Notebooks dort sind obsolet. Uber-Notebooks bleiben (uspeed
      läuft noch als Legacy-Layer vom alten Bucket).
- [ ] `preprocessing/` (~6,2 GB): nur noch Archiv für Uber-Movement + Lärm-Rohdaten;
      prüfen, was davon noch gebraucht wird.
- [ ] `preprocessing/uber_movement/prepare_uber_movement_allhours.ipynb` ist die
      einzige git-getrackte Datei unter `preprocessing/` — Absicht oder Versehen?
