// Handy-Layout: die Legende ist unter 640px ein Bottom-Sheet statt eines 320-px-Panels
// oben rechts. Gemessen wird, was zählt — wie viel Karte frei bleibt und ob die
// Bedienelemente erreichbar sind —, nicht einzelne CSS-Werte.
import { test, expect } from "@playwright/test";
import { openMap, expectNoErrors, settle } from "./helpers.js";

const PHONE = { width: 390, height: 844 };   // iPhone 14 quer zur Legende
const DESKTOP = { width: 1400, height: 900 };

/** Anteil der Kartenfläche, den ein Element verdeckt (0–1). */
const coverage = (page, selector) => page.evaluate((sel) => {
  const el = document.querySelector(sel);
  const map = document.getElementById("map").getBoundingClientRect();
  if (!el || getComputedStyle(el).display === "none") return 0;
  const r = el.getBoundingClientRect();
  const w = Math.max(0, Math.min(r.right, map.right) - Math.max(r.left, map.left));
  const h = Math.max(0, Math.min(r.bottom, map.bottom) - Math.max(r.top, map.top));
  return (w * h) / (map.width * map.height);
}, selector);

const isCollapsed = (page) => page.evaluate(() => document.querySelector(".legend").classList.contains("collapsed"));

test.describe("Handy", () => {
  test.use({ viewport: PHONE });

  test("Legende startet als schmales Sheet unten und lässt die Karte frei", async ({ page }) => {
    const errors = await openMap(page);

    expect(await isCollapsed(page), "Legende sollte auf dem Handy zugeklappt starten").toBe(true);

    // Der eigentliche Punkt aus docs/TODO.md: vorher verdeckte sie die halbe Karte.
    const covered = await coverage(page, ".legend");
    expect(covered, `Legende verdeckt ${(covered * 100).toFixed(0)} % der Karte`).toBeLessThan(0.25);

    // … und sie klebt unten, nicht oben rechts.
    const box = await page.locator(".legend").boundingBox();
    expect(box.x).toBeLessThan(10);                       // volle Breite
    expect(box.width).toBeGreaterThan(PHONE.width - 20);
    expect(box.y + box.height).toBeGreaterThanOrEqual(PHONE.height - 2);

    // Titel + Unfallzähler bleiben sichtbar (das ist der Sinn des Streifens).
    await expect(page.locator(".legend .legend-title")).toBeVisible();
    await expect(page.locator("#feature-count-wrapper")).toBeVisible();
    expectNoErrors(errors);
  });

  test("Bedienelemente unten links liegen über dem Streifen, nicht dahinter", async ({ page }) => {
    const errors = await openMap(page);

    const sheetTop = (await page.locator(".legend").boundingBox()).y;
    for (const sel of ["#map-settings-toggle", "#bottom-left-ui-container"]) {
      const box = await page.locator(sel).boundingBox();
      expect(box, `${sel} fehlt`).not.toBeNull();
      expect(box.y + box.height, `${sel} liegt hinter dem Sheet`).toBeLessThanOrEqual(sheetTop + 1);
    }

    // Anfassbar heißt: ein Klick landet wirklich dort (nicht auf dem Sheet darüber).
    await page.click("#map-settings-toggle");
    await expect(page.locator("#map-settings-panel")).not.toHaveClass(/is-collapsed/);
    expectNoErrors(errors);
  });

  test("Aufklappen zeigt die Filter und räumt die linken Bedienelemente weg", async ({ page }) => {
    const errors = await openMap(page);
    await page.click(".legend .legend-title");

    expect(await isCollapsed(page)).toBe(false);
    await expect(page.locator('.legend input[data-group="UKATEGORIE"]').first()).toBeVisible();
    // Aufgeklappt deckt das Sheet die linke Seite zu -> die Elemente sind ausgeblendet
    // statt darunter begraben.
    await expect(page.locator("#map-settings-toggle")).toBeHidden();

    // Das Sheet bleibt gedeckelt (72 dvh) — die Karte ist nie ganz weg.
    const covered = await coverage(page, ".legend");
    expect(covered, `aufgeklappt ${(covered * 100).toFixed(0)} % verdeckt`).toBeLessThan(0.78);

    // Zuklappen bringt sie zurück.
    await page.click(".legend .legend-title");
    expect(await isCollapsed(page)).toBe(true);
    await expect(page.locator("#map-settings-toggle")).toBeVisible();
    expectNoErrors(errors);
  });

  // Zieh-Geste (js/ui/mobileLayout.js): das Sheet folgt dem Finger, statt nur auf Tippen
  // umzuklappen. Gefahren wird sie hier mit der Maus — das sind dieselben Pointer-Events,
  // und Playwright kann keinen Finger über den Schirm ziehen.
  const dragTitle = async (page, dy) => {
    const box = await page.locator(".legend .legend-title").boundingBox();
    const x = box.x + box.width / 2;
    const y = box.y + box.height / 2;
    await page.mouse.move(x, y);
    await page.mouse.down();
    for (let i = 1; i <= 10; i++) await page.mouse.move(x, y + (dy * i) / 10);
    return { x, y };
  };

  test("Sheet lässt sich mit dem Finger hochziehen", async ({ page }) => {
    const errors = await openMap(page);
    const legend = page.locator(".legend");
    const topBefore = (await legend.boundingBox()).y;

    await dragTitle(page, -320);

    // Mitten in der Geste: noch nicht umgeklappt, aber schon mitgewandert — und der
    // Inhalt, der gleich stehen bleiben soll, ist bereits sichtbar.
    expect(await isCollapsed(page), "während der Geste bleibt der Zustand offen").toBe(true);
    await expect(legend).toHaveClass(/is-dragging/);
    expect((await legend.boundingBox()).y, "Sheet folgt dem Finger nicht").toBeLessThan(topBefore - 100);
    await expect(page.locator('.legend input[data-group="UKATEGORIE"]').first()).toBeVisible();

    await page.mouse.up();

    // Losgelassen: offen, und keine Reste der Geste (Transform/Klasse) bleiben hängen.
    await expect.poll(() => isCollapsed(page)).toBe(false);
    await expect(legend).not.toHaveClass(/is-dragging/);
    expect(await legend.evaluate((el) => el.style.transform)).toBe("");
    await expect(page.locator('.legend input[data-group="UKATEGORIE"]').first()).toBeVisible();
    expectNoErrors(errors);
  });

  test("Sheet lässt sich wieder zuschieben — und der Streifen sitzt wie vorher", async ({ page }) => {
    const errors = await openMap(page);
    const peekBefore = (await page.locator(".legend").boundingBox()).height;

    await page.click(".legend .legend-title");
    expect(await isCollapsed(page)).toBe(false);

    await dragTitle(page, 320);
    await page.mouse.up();

    await expect.poll(() => isCollapsed(page)).toBe(true);
    const peekAfter = (await page.locator(".legend").boundingBox()).height;
    expect(Math.abs(peekAfter - peekBefore), "Streifenhöhe nach der Geste verschoben").toBeLessThan(2);
    // Die Bedienelemente unten links müssen wieder über dem Streifen auftauchen.
    await expect(page.locator("#map-settings-toggle")).toBeVisible();
    expectNoErrors(errors);
  });

  // Attribution ist Lizenzpflicht (OSM/ODbL, OpenFreeMap, Mapterhorn, Unfallatlas) — und
  // lag vorher komplett hinter dem Sheet: gerendert, aber in keinem Zustand erreichbar.
  test("Attribution liegt über dem Streifen und nennt per Tipp Karte UND Daten", async ({ page }) => {
    const errors = await openMap(page);
    const attrib = page.locator(".maplibregl-ctrl-attrib");

    const sheetTop = (await page.locator(".legend").boundingBox()).y;
    const box = await attrib.boundingBox();
    expect(box.y + box.height, "Attribution liegt hinter dem Sheet").toBeLessThanOrEqual(sheetTop + 1);
    expect(box.width, "zugeklappt soll sie ein ⓘ-Knopf sein").toBeLessThan(60);

    // Sichtbar heißt: an ihrer Stelle liegt wirklich sie und nichts darüber.
    const onTop = await page.evaluate(() => {
      const r = document.querySelector(".maplibregl-ctrl-attrib").getBoundingClientRect();
      const el = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return !!el?.closest(".maplibregl-ctrl-attrib");
    });
    expect(onTop, "etwas liegt über dem ⓘ").toBe(true);

    await page.click(".maplibregl-ctrl-attrib-button");
    await expect(attrib).toContainText("OpenStreetMap");
    await expect(attrib).toContainText("Statistisches Bundesamt");

    // Ausgeklappt lief das Band über die volle Breite und damit unter die Bedienelemente
    // unten links. Es darf sich mit keinem davon überlappen.
    const open = await attrib.boundingBox();
    for (const sel of ["#map-settings-toggle", "#bottom-left-ui-container"]) {
      const b = await page.locator(sel).boundingBox();
      const überlappt = b.x < open.x + open.width && b.x + b.width > open.x
        && b.y < open.y + open.height && b.y + b.height > open.y;
      expect(überlappt, `${sel} liegt im ausgeklappten Attributions-Band`).toBe(false);
    }
    expectNoErrors(errors);
  });

  test("ⓘ zeigt den Quellenvermerk per Tipp — ohne das Sheet umzuklappen", async ({ page }) => {
    const errors = await openMap(page);
    // Auf Touch gibt es kein Hover: ohne Tipp-Unterstützung wäre das ⓘ ein totes Zeichen.
    await page.click(".legend .legend-title .info-icon");

    const tip = page.locator(".app-tooltip");
    await expect(tip).toHaveClass(/is-visible/);
    await expect(tip).toContainText("Statistisches Bundesamt");
    expect(await isCollapsed(page), "der Tipp aufs ⓘ darf nicht auch umklappen").toBe(true);

    // Zweiter Tipp schließt wieder.
    await page.click(".legend .legend-title .info-icon");
    await expect(tip).not.toHaveClass(/is-visible/);
    expectNoErrors(errors);
  });

  test("Suche ist nur ein Lupen-Knopf und fährt erst beim Antippen aus", async ({ page }) => {
    const errors = await openMap(page);
    const geocoder = page.locator(".geocoder");

    const collapsed = await geocoder.boundingBox();
    expect(collapsed.width, "zugeklappt soll die Suche ein Knopf sein").toBeLessThan(60);
    await expect(page.locator("#search")).toBeHidden();
    await expect(page.locator(".geocoder-input-wrapper")).toHaveAttribute("aria-expanded", "false");

    await page.click(".geocoder-input-wrapper");
    const open = await geocoder.boundingBox();
    expect(open.width, "aufgeklappt über die Breite").toBeGreaterThan(PHONE.width - 40);
    await expect(page.locator("#search")).toBeFocused();

    // Leer verlassen -> wieder zum Knopf. Mit Text drin bliebe sie offen.
    await page.locator("#search").blur();
    await expect.poll(async () => (await geocoder.boundingBox()).width).toBeLessThan(60);
    expectNoErrors(errors);
  });

  test("Suche mit eingetipptem Text klappt NICHT weg", async ({ page }) => {
    const errors = await openMap(page);
    await page.click(".geocoder-input-wrapper");
    await page.fill("#search", "Königs Wusterhausen");
    await page.locator("#search").blur();

    await page.waitForTimeout(400);  // der Einklapp-Timer wäre längst gelaufen
    expect((await page.locator(".geocoder").boundingBox()).width).toBeGreaterThan(PHONE.width - 40);
    await expect(page.locator("#search")).toHaveValue("Königs Wusterhausen");
    expectNoErrors(errors);
  });

  // Regression gegen doppelte Trennlinien: unter der Titelzeile folgte 12px später die
  // nächste Kante — zugeklappt die des Unfallzählers, aufgeklappt der Trenner vor dem
  // ersten Abschnitt, bei Cluster-Zoom der des Cluster-Blocks. Im schmalen Sheet las sich
  // das als Doppellinie. Der Trenner MUSS dabei bleiben (er trägt den Abstand); weg ist
  // die Kante an der Titelzeile.
  const headerLines = (page) => page.evaluate(() => {
    const legend = document.querySelector(".legend");
    const top = legend.getBoundingClientRect().top;
    const titleBottom = Math.round(legend.querySelector(".legend-title").getBoundingClientRect().bottom - top);
    const lines = [...legend.querySelectorAll("*")]
      // Gesucht sind Trennlinien über die Breite — runde Abzeichen (ⓘ, Status-Pille)
      // haben zwar einen Rahmen, sind aber keine.
      .filter((el) => el.getBoundingClientRect().height > 0
        && !el.classList.contains("info-icon") && !el.classList.contains("fc-badge"))
      .flatMap((el) => ["Top", "Bottom"].filter((side) => {
        const cs = getComputedStyle(el);
        return parseFloat(cs[`border${side}Width`]) > 0 && cs[`border${side}Style`] !== "none";
      }).map((side) => ({
        what: `${el.className}.${side}`,
        dy: Math.round(el.getBoundingClientRect()[side.toLowerCase()] - top),
      })))
      // Betrachtet wird nur das Feld direkt unter der Titelzeile — auch dieses Fenster
      // hängt an ihr, nicht an einer festen Pixelzahl.
      .filter((l) => l.dy < titleBottom + 60);
    return { lines, titleBottom };
  });

  test("unter dem Titel steht genau EINE Trennlinie — in jedem Zustand", async ({ page }) => {
    const errors = await openMap(page);

    const check = async (label) => {
      const { lines, titleBottom } = await headerLines(page);
      expect(lines.map((l) => l.what), `${label}: ${JSON.stringify(lines)}`).toHaveLength(1);
      // Der Abstand des Trenners muss erhalten bleiben — ihn auszublenden hätte den Titel
      // an den Inhalt geklebt (genau das war die erste, verworfene Lösung). Gemessen wird
      // der Abstand zur Titelzeile, nicht zum oberen Rand: sonst hinge der Test an der
      // Kopfhöhe und schlüge bei jeder Straffung an.
      expect(lines[0].dy - titleBottom, `${label}: Trenner klebt am Titel`).toBeGreaterThan(4);
      return lines[0];
    };

    await check("zugeklappt");
    await page.click(".legend .legend-title");
    await check("aufgeklappt, Einzelunfälle");

    // Unter z11 zeigt die Legende den Cluster-Block statt der Einzel-Filter — dort folgt
    // auf den Titel ein ANDERER Trenner.
    await page.evaluate(() => window.map.jumpTo({ center: [13.405, 52.52], zoom: 8 }));
    await settle(page);
    await check("aufgeklappt, Cluster-Zoom");
    expectNoErrors(errors);
  });

  test("Filter bedienen funktioniert im Sheet wie am Desktop", async ({ page }) => {
    const errors = await openMap(page);
    await page.click(".legend .legend-title");

    await page.click('.legend input[data-group="UKATEGORIE"][value="3"]', { force: true });
    // Der Permalink zieht sofort nach — Beleg, dass der echte Pfad lief.
    await expect
      .poll(() => page.evaluate(() => new URLSearchParams(location.search).get("uk")))
      .toBe("1_2");
    expectNoErrors(errors);
  });
});

test.describe("Desktop bleibt unverändert", () => {
  test.use({ viewport: DESKTOP });

  test("Legende steht weiter offen oben rechts", async ({ page }) => {
    const errors = await openMap(page);

    expect(await isCollapsed(page), "am Desktop darf nichts zuklappen").toBe(false);
    const box = await page.locator(".legend").boundingBox();
    // Schmales Panel (320px Inhalt + Innenabstand/Rahmen), nicht über die volle Breite.
    expect(box.width).toBeGreaterThan(280);
    expect(box.width).toBeLessThan(400);
    expect(box.y).toBeLessThan(100);                       // oben
    expect(box.x).toBeGreaterThan(DESKTOP.width / 2);      // rechts
    await expect(page.locator("#map-settings-toggle")).toBeVisible();
    expectNoErrors(errors);
  });
});
