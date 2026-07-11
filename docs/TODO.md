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
- [ ] `preprocessing/` (~6,2 GB): durch die Uber-Migration (2026-07-11) obsolet —
      die Roh-CSV ist nach `pipeline/data/raw/uber/` übernommen, `laerm_blr/` ist
      durch `laerm.py` (HLQ-Layer 4110/4120) überholt. Vor dem Löschen: Roh-CSV
      zusätzlich auf B2 sichern (Uber Movement ist abgeschaltet, unersetzlich!).
- [ ] `preprocessing/uber_movement/prepare_uber_movement_allhours.ipynb` ist die
      einzige git-getrackte Datei unter `preprocessing/` — nach der Migration
      (Logik lebt jetzt in `pipeline/src/unfallkarte/uber.py`) entfernbar.
- [ ] Altes B2-Bucket `unfallkarte-data` hat nach der Uber-Migration keinen
      Verbraucher mehr → stilllegbar (vorher kurz verifizieren, dass nichts
      Externes darauf zeigt).

## Uber-Speed-Layer (Folgeideen)

- [ ] **Wide-Format statt Long-Format:** aktuell 24 Features je Segment/Richtung
      (`hour_of_day`, Slider filtert). Ein Feature je Segment/Richtung mit
      `speed_0`…`speed_23` würde die Featurezahl auf 1/24 drücken (kleinere Tiles,
      schnelleres Rendering); das Alt-Notebook hatte den Wide-Stand (`df_final`)
      schon als Zwischenschritt. Braucht Frontend-Umbau: Slider per
      `setPaintProperty(["get", "speed_"+h])` statt `setFilter`, Popup-Chart liest
      die 24 Felder direkt (addLayers.js, setupLayerToggles.js, popupHandlers.js).
