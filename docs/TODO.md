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

- [x] Geklärt (2026-07-11): `unfallkarte deploy` (b2 sync) zeigte den Bucket als
      aktuell — Telraam, Crossings, movebis & Co. lagen schon auf B2; hochgeladen
      wurden nur die neu gebauten z6-hvs-Tiles + Manifest.

## Aufräumen

- [ ] `schrott/` (~810 MB, gitignored): OBS/Lärm/HVS/Uber sind inzwischen in die
      Pipeline migriert — die Notebooks dort sind obsolet.
- [x] `preprocessing/` (~6,2 GB): gelöscht (2026-07-11). Die unersetzliche
      Uber-Roh-CSV liegt in `pipeline/data/raw/uber/` UND als Backup auf B2
      (`unfallkarte-data-v2/raw/uber/…csv.zip`, manuell hochgeladen — der normale
      Deploy synct nur PMTiles+Manifest).
- [x] `preprocessing/uber_movement/prepare_uber_movement_allhours.ipynb` entfernt
      (Logik lebt in `pipeline/src/unfallkarte/uber.py`, Output war byte-identisch
      verifiziert).
- [ ] Altes B2-Bucket `unfallkarte-data` hat nach der Uber-Migration keinen
      Verbraucher mehr → stilllegbar (vorher kurz verifizieren, dass nichts
      Externes darauf zeigt).

## Uber-Speed-Layer

- [x] **Wide-Format** (2026-07-11): 1 Feature je Segment mit `speed_0`…`speed_23`
      statt 24 Long-Features — 33.480 statt 536.759 Features, PMTiles 12,9 statt
      31,3 MB. Stunden ohne Messwert fehlen als Attribut → Slider setzt Filter
      (`["has", "speed_<h>"]`) + line-color neu (`applyUspeedHour` in addLayers.js);
      Klick-Chart liest die 24 Werte direkt aus dem Feature (vorher
      querySourceFeatures über geladene Tiles — konnte Stunden unterschlagen).
