// views.js — HTML der vier Ansichten (Auswahl-Panel, Report, Brief, Druck) aus dem Zustand.
// Kein DOM-Zugriff hier: main.js setzt das Ergebnis ein. Werte aus OSM gehen durch esc().
import { esc, fmt, origin, stIcon, ST_ICON, pctOr, unavailable } from "./common.js";
import { chartYears, chartHBars, chartHours } from "./charts.js";
import { mapSVG, mapLegend } from "./svgMap.js";
import { BET, TYP, ART, WT, KAT, REGIOSTAR7, CROSSING_LABEL, STOP_LABEL } from "../model.js";
import { FAC, facLabel } from "../facilities.js";
import { REF_LABEL } from "../roads.js";
import { RW, TEXTVERSION, LAENDER, PROFILE, landName } from "../rules/params.js";
import { briefTypes, buildLetter } from "../texts.js";
import { BUNDESPORTAL } from "../addressee.js";
import { RADIUS } from "../reportLink.js";

const KIND_LABEL = { k: "Kreuzung", e: "Einrichtung" };

export function yearSelects(st, dataYears, pre) {
  const opt = (cur) => dataYears.map((y) => `<option ${y === cur ? "selected" : ""}>${y}</option>`).join("");
  return `<div class="field"><label for="${pre}-from">Jahre von</label><select id="${pre}-from" data-bind="from">${opt(st.years.from)}</select></div>`
    + `<div class="field"><label for="${pre}-to">bis</label><select id="${pre}-to" data-bind="to">${opt(st.years.to)}</select></div>`;
}

export function landSelect(id, st, autoLand) {
  const auto = autoLand ? `automatisch: ${landName(autoLand)}` : "automatisch (unbekannt)";
  return `<select id="${id}" data-bind="land"><option value="" ${!st.land ? "selected" : ""}>${esc(auto)}</option><option value="bund" ${st.land === "bund" ? "selected" : ""}>Bund (ohne Landesregeln)</option>${LAENDER.map(([k, n]) => `<option value="${k}" ${st.land === k ? "selected" : ""}>${n}${PROFILE[k] ? " · eigene Regeln" : ""}</option>`).join("")}</select>`;
}

// ------------------------------------------------------------------ Auswahl-Panel
export function renderPanel(V) {
  const { st, dataYears, preview, link, busy } = V;
  const lim = RADIUS[st.mode];
  const r = st.r[st.mode];
  const pv = preview;
  const hint = st.mode === "k" ? "Klick in die Karte setzt den Mittelpunkt; er rastet am nächsten Knoten ein (30 m)." : "Klick auf eine Schule, Kita, einen Spielplatz oder eine Gesundheits-/Pflegeeinrichtung.";
  let pvHtml = `<div class="empty">${busy ? "Lade Daten …" : "Noch keine Stelle gewählt."}</div>`;
  if (pv && !busy) {
    pvHtml = `<div class="preview">
      <div class="kv"><div class="v num">${pv.n}</div><div class="l">Unfälle mit Personenschaden ${st.years.from}–${st.years.to}</div></div>
      <div class="kv"><div class="v num">${pv.nSP}</div><div class="l">davon mit Getöteten oder Schwerverletzten</div></div>
      <div class="kv"><div class="v num">${pv.fr}</div><div class="l">mit Fuß- oder Radbeteiligung</div></div>
      <div class="kv"><div class="v">${pv.speed ?? "–"}</div><div class="l">${esc(pv.road ?? "keine Straße in den Daten")}</div></div>
    </div>${pv.fac ? `<p class="hint" style="margin:6px 0 0">Einrichtung: <b>${esc(pv.fac)}</b></p>` : ""}${pv.snap ? `<p class="hint" style="margin:6px 0 0">${esc(pv.snap)}</p>` : ""}`;
  }
  return `
    <div class="field search"><label for="sel-search">Ort suchen</label><input type="search" id="sel-search" placeholder="Adresse, Schule, Kreuzung …" autocomplete="off" value="${esc(st.search ?? "")}"><div class="search-results" id="sel-results" hidden></div></div>
    <div class="field"><span class="lbl">Was möchtest du untersuchen?</span><div class="chips">
      <button class="chip" data-mode="k" aria-pressed="${st.mode === "k"}">Kreuzung / Stelle</button>
      <button class="chip" data-mode="e" aria-pressed="${st.mode === "e"}">Einrichtung</button>
      <button class="chip" disabled title="kommt mit Stufe 2">Straßenzug</button>
      <button class="chip" disabled title="kommt mit Stufe 2">Gebiet</button></div>
      <p class="hint" style="margin:4px 0 0">${hint}</p></div>
    <div class="field"><label for="sel-r">${st.mode === "k" ? "Radius" : "Umfeld"}: <b class="num">${r} m</b></label><input type="range" id="sel-r" data-bind="r" min="${lim.min}" max="${lim.max}" step="5" value="${r}"></div>
    <div class="row2">${yearSelects(st, dataYears, "sel")}</div>
    <div><div class="eyebrow" style="margin-bottom:6px">Vorschau</div>${pvHtml}</div>
    <button class="btn primary" data-go="report" ${st.sel ? "" : 'aria-disabled="true"'}>Report öffnen →</button>
    ${link ? `<div class="field"><span class="lbl">Report-Link</span><div class="linkbox"><code id="replink">${esc(link)}</code><button class="btn" data-copy="#replink">Kopieren</button></div><p class="hint" style="margin:0">Eigene Eingaben (Rolle, Beobachtung, Name) stehen nie im Link.</p></div>` : ""}`;
}

// ------------------------------------------------------------------ Report
function wayBlock(title, norm, W, answers) {
  return `<div class="way"><div class="way-h"><div><h3>${title}</h3><div class="norm">${norm}</div></div><span class="verdict ${W.verdict.cls}">${esc(W.verdict.label)}</span></div><div class="rows">${W.steps.map((x) => stepRow(x, answers)).join("")}</div></div>`;
}
function stepRow(x, answers) {
  const ask = x.ask ? `<div class="ask"><span class="q">${esc(x.ask.q)}</span>${x.ask.opts.map(([v, l]) => `<button class="chip" data-ans="${x.ask.key}" data-val="${v}" aria-pressed="${(answers[x.ask.key] ?? "") === v && (v !== "" || x.ask.key in answers)}">${esc(l)}</button>`).join("")}</div>` : "";
  return `<div class="row">${stIcon(x.status)}<div><div class="title"><b>${x.id} · ${esc(x.t)}</b><span class="sl">${{ erfuellt: "erfüllt", unklar: "unklar", nicht_erfuellt: "nicht erfüllt", hinweis: "Hinweis", entfaellt: "entfällt" }[x.status]}</span>${x.nutz ? '<span class="nutz">NUTZ</span>' : ""}${x.mod ? '<span class="nutz">MOD</span>' : ""}</div><p class="txt">${esc(x.txt)}</p><div class="data mono">${esc(x.data || "")}</div>${x.hilfe ? `<div class="data">${esc(x.hilfe)}</div>` : ""}${ask}</div></div>`;
}

const whereTxt = (M) => (M.selection.kind === "k" ? `Radius ${M.selection.r} m` : `Umfeld ${M.selection.r} m um die Einrichtung`);
const vintage = (meta, id) => meta?.[id]?.vintage ?? null;

export function noticesHtml(V) {
  const { M, warnings = [] } = V;
  const n = [...warnings];
  if (M.selection.facMissing) n.push("Die Einrichtung aus dem Link ist in den aktuellen OSM-Kacheln nicht mehr zu finden. Ausgewertet wird ein Kreis um die gespeicherte Koordinate.");
  const bad = Object.entries(M.status).filter(([, s]) => s === "error").map(([k]) => k);
  if (bad.length) n.push(`Nicht geladen: ${bad.join(", ")}. Die betroffenen Angaben stehen als „nicht verfügbar“ im Report.`);
  const sus = M.accidents.suspicious.filter((y) => y >= V.st.years.from && y <= V.st.years.to);
  if (sus.length) n.push(`Im Umfeld gibt es ${sus.length > 1 ? "in den Jahren" : "im Jahr"} ${sus.join(", ")} keinen einzigen Unfall, in den anderen Jahren schon – vermutlich fehlt das Land dort im Unfallatlas. Zeitfenster prüfen.`);
  return n.map((t) => `<div class="notice">${esc(t)}</div>`).join("");
}

export function renderReport(V) {
  const { st, M, R, place, adr, title, meta, dataYears, mapLink } = V;
  const acc = M.accidents;
  const road = M.road;
  const A = R.A;
  const topTyp = Object.entries(acc.byTyp).filter(([, v]) => v).sort((a, b) => b[1] - a[1]).slice(0, 3);
  const betItems = Object.entries(BET).map(([k, l]) => ({ l, v: acc.bet[k] }));
  const hoursBlock = acc.n >= 10 ? chartHours(acc.hours) : `<div class="empty">Die Verteilung nach Stunde erscheint erst ab 10 Unfällen (hier ${acc.n}). Werktags zu Schulzeiten (7–9, 12–16 Uhr): <b>${acc.win.filter((a) => a.wt >= 2 && a.wt <= 6 && R.P.schulzeit.includes(a.h)).length}</b> von ${acc.n}.</div>`;
  const acList = acc.win.slice().sort((a, b) => b.j - a.j || b.m - a.m)
    .map((a) => `<tr><td class="num">${a.j}-${String(a.m).padStart(2, "0")}</td><td>${WT[a.wt] ?? ""}, ${a.h} Uhr</td><td>${KAT[a.kat]}</td><td>${TYP[a.typ] ?? "–"}</td><td>${ART[a.art] ?? "–"}</td><td>${a.bet.map((b) => BET[b]).join(", ")}</td></tr>`).join("");
  const facRows = M.facilities.slice(0, 12).map((f) => `<tr><td>${esc(facLabel(f))}</td><td>${stIcon(f.status, true)} ${esc(FAC[f.typ]?.nr6 ?? (f.status === "nicht_erfuellt" ? "nicht nach Nr. 6" : `${FAC[f.typ]?.noun ?? "Einrichtung"} (Art unklar)`))}</td><td class="r">${fmt(f.dSel)} m</td><td class="r">${f.dRoad != null ? `${fmt(f.dRoad)} m` : "–"}</td><td class="mono small">${esc(f.osm)}</td></tr>`).join("");
  const cz = M.census;
  const sp = A.sp ?? M.speed;
  const svz = M.traffic.svz;
  const hvs = M.traffic.hvs;
  const tel = M.traffic.telraam;
  const obs = M.obs;
  const noise = M.noise;
  const lanes = st.answers.lanes;
  const crossNear = M.crossings.filter((c) => c.d <= M.selection.r + 150);
  const stopNear = M.stops.filter((s) => s.d <= M.selection.r + 150);
  const autoLand = place?.land ?? null;
  const land = R.P.land;
  const roadChooser = M.roadCandidates.length > 1
    ? `<div class="field"><label for="rep-road">Straße für die Prüfung</label><select id="rep-road" data-bind="roadKey">${M.roadCandidates.map((c) => `<option value="${esc(c.key)}" ${road && c.key === road.key ? "selected" : ""}>${esc(c.label)} (${fmt(c.d)} m)</option>`).join("")}</select></div>` : "";

  return `
    <div class="panel controls">
      ${yearSelects(st, dataYears, "rep")}
      <div class="field"><label for="rep-land">Landesregeln und Zuständigkeit</label>${landSelect("rep-land", st, autoLand)}</div>
      ${roadChooser}
      <span style="flex:1"></span>
      <button class="btn" data-go="auswahl">← Auswahl</button>
      ${mapLink ? `<a class="btn" href="${esc(mapLink)}">In der Karte ↗</a>` : ""}
      <button class="btn primary" data-go="brief">Brief schreiben →</button>
    </div>
    ${noticesHtml(V)}
    <div class="grid-2">
      <div class="panel rhead">
        <div class="eyebrow">Analyse-Report · ${KIND_LABEL[M.selection.kind]} · ${esc(whereTxt(M))}</div>
        <h1>${esc(title.titel)}</h1>
        <div class="metaline">${title.ort ? `<span>${esc(title.ort)}</span>` : ""}${cz?.gemeinde ? `<span>Gemeinde (Zensus): ${esc(cz.gemeinde)}</span>` : ""}<span>${land && land !== "bund" ? `${esc(landName(land))}${!st.land && place?.landQuelle ? ` <span class="muted">(${esc(place.landQuelle)})</span>` : ""}` : "Land: Bund (ohne Landesregeln)"}</span><span>erstellt ${esc(V.today)}</span></div>
        <div class="stamp"><span>Datenbasierte Einschätzung</span><span>keine Rechtsberatung</span><span>kein Gutachten</span><span>keine amtliche Feststellung</span></div>
        <div class="metaline small"><span>Regelwerk ${RW.version} (Stand ${RW.stand})</span><span>Landesregeln: ${esc(R.P.label)}</span>${vintage(meta, "accidents") ? `<span>Unfallatlas bis ${esc(vintage(meta, "accidents"))}</span>` : ""}${vintage(meta, "roads") ? `<span>OSM ${esc(vintage(meta, "roads"))}</span>` : ""}</div>
        <div class="mapbox" id="map-report">${mapSVG(M, R, { width: V.mapWidth ?? 760, years: st.years })}${mapLegend()}</div>
      </div>
      <div class="panel glance">
        <div class="eyebrow">1 · Auf einen Blick</div>
        ${R.glance.map((f) => `<div class="finding">${stIcon(f.st)}<div><p><b>${esc(f.t)}</b></p><p class="norm">${esc(f.n)}</p></div></div>`).join("")}
        <div><div class="eyebrow" style="margin-bottom:6px">Maßnahmen-Kandidaten</div><div class="measures">${R.measures.slice(0, 4).map((m) => `<span>${esc(m.t)}</span>`).join("") || "<span>keine aus den Daten</span>"}</div></div>
        <div class="callout">Vermutlich zuständig: <b>${esc(adr.stelle)}</b>${adr.alt ? `<br><span class="small">oder: ${esc(adr.alt)}</span>` : ""}<br><span class="small">${esc(adr.basis)} · Beleg: ${esc(adr.sicher)} · <a href="${BUNDESPORTAL}" target="_blank" rel="noopener">Zuständigkeit prüfen ↗</a></span></div>
      </div>
    </div>

    <details class="sec" open><summary><span class="no">2</span><h2>Unfalllage</h2><span class="sum num">${acc.n} U(P) · ${acc.nSP} U(SP) · ${acc.fr} mit Fuß/Rad · ${st.years.from}–${st.years.to}</span></summary>
      <div class="body">
        ${M.status.accidents !== "ok" ? `<div class="notice">Unfalldaten ${esc(unavailable(M.status.accidents))}.</div>` : ""}
        <div class="charts">
          <div class="chart"><h3>Unfälle je Jahr und Schwere</h3><div class="legend"><span><i style="background:var(--sev1)"></i>Getötete</span><span><i style="background:var(--sev2)"></i>Schwerverletzte</span><span><i style="background:var(--sev3)"></i>Leichtverletzte</span><span class="muted">blass = außerhalb des Zeitfensters</span></div>${chartYears(acc.byYear, dataYears, st.years)}</div>
          <div class="chart"><h3>Beteiligung (${acc.n} Unfälle)</h3>${chartHBars(betItems, acc.n, (v) => (acc.n >= 20 ? `${Math.round((100 * v) / acc.n)} %` : v))}</div>
        </div>
        <div class="charts">
          <div class="chart"><h3>Tageszeit</h3>${hoursBlock}</div>
          <div class="chart"><h3>Häufigste Unfalltypen</h3>${acc.n >= 5 ? chartHBars(topTyp.map(([k, v]) => ({ l: TYP[k], v })), acc.n, (v) => v) : `<div class="empty">Top-Typen erst ab 5 Unfällen (hier ${acc.n}).</div>`}</div>
        </div>
        <div class="tablewrap"><table class="t"><thead><tr><th>M-Uko-Kriterium (rechnerisch, ${esc(R.U.window)})</th><th>Status</th><th>Ergebnis</th><th>Quelle</th></tr></thead><tbody>
          ${R.U.list.map((u) => `<tr><td>${esc(u.text)}</td><td>${stIcon(u.status, true)}</td><td>${esc(u.detail)}</td><td class="small">${esc(u.quelle)}</td></tr>`).join("")}
        </tbody></table></div>
        ${M.sc9?.length ? `<div class="callout">Szenario 9 der Karte markiert hier eine Unfallhäufung (${M.sc9.map((z) => `${esc(z.rule)}, bis ${esc(z.n_max)} Unfälle, ${esc(z.window_best)}`).join("; ")}) – vorberechnet nach M-Uko-Kriterien, keine amtliche Feststellung.</div>` : ""}
        <div class="empty">Vergleich mit Referenzwerten (erwartete Unfälle an vergleichbaren Stellen): kommt mit <span class="mono">report/baselines.json</span> aus der Pipeline. Bis dahin kein „x-mal so viele“.</div>
        <details><summary class="small">Einzelunfälle im Fenster (${acc.n}) – Tabelle</summary><div class="tablewrap"><table class="t"><thead><tr><th>Jahr-Monat</th><th>Zeit</th><th>Schwere</th><th>Typ</th><th>Art</th><th>Beteiligt</th></tr></thead><tbody>${acList || '<tr><td colspan="6">keine</td></tr>'}</tbody></table></div></details>
        <div class="srcline">${origin("AMT")} Unfallatlas der Statistischen Ämter (dl-de/by-2-0), nur Unfälle mit Personenschaden, ohne Ortslage und Datum · Anteile erst ab n = 20 · Lage auf das Straßennetz referenziert</div>
      </div>
    </details>

    <details class="sec"><summary><span class="no">3</span><h2>Schutzbedürftige Nutzungen</h2><span class="sum">${M.facilities.length === 1 ? "1 Einrichtung" : `${M.facilities.length} Einrichtungen`} · ${cz ? `${fmt(cz.ew)} EW im 300-m-Umfeld` : "Zensus nicht verfügbar"}</span></summary>
      <div class="body">
        ${M.facilities.length ? `<div class="tablewrap"><table class="t"><thead><tr><th>Einrichtung ${origin("OSM")}</th><th>Kategorie nach Nr. 6</th><th class="r">zur Auswahl</th><th class="r">zur Hauptstraße</th><th>OSM</th></tr></thead><tbody>${facRows}</tbody></table></div>` : `<div class="empty">Keine Schulen, Kitas, Spielplätze oder Gesundheits-/Pflegeeinrichtungen im Umfeld (laut OSM).</div>`}
        <div class="tablewrap"><table class="t"><thead><tr><th>Bevölkerung ${origin("AMT")}</th><th class="r">Einwohner</th><th class="r">unter 18</th><th class="r">ab 65</th><th>Raumtyp</th></tr></thead><tbody>
          ${cz ? `<tr><td>Umfeld 300 m (Zellen anteilig)${cz.secret ? ` · ${cz.secret} Zellen geheimgehalten → eher mehr` : ""}</td><td class="r">${fmt(cz.ew)}</td><td class="r">${fmt(cz.u18)}</td><td class="r">${fmt(cz.a65)}</td><td>${esc(REGIOSTAR7[cz.regiostar] ?? "–")}</td></tr>` : `<tr><td colspan="5">${esc(unavailable(M.status.census))}</td></tr>`}
        </tbody></table></div>
        <div class="srcline"><span>Querungen (≤ ${M.selection.r + 150} m): ${crossNear.length ? crossNear.slice(0, 8).map((c) => `${esc(CROSSING_LABEL[c.kind])} ${fmt(c.d)} m`).join(", ") : "keine laut OSM"}</span><span>Haltestellen: ${stopNear.length ? [...new Set(stopNear.map((s) => `${STOP_LABEL[s.mode]}${s.name ? ` „${s.name}“` : ""}`))].slice(0, 5).map(esc).join(", ") : "keine laut OSM"}</span><span>Krippen/Horte (amenity=childcare) und Eingänge fehlen noch in den Kacheln</span></div>
      </div>
    </details>

    <details class="sec"><summary><span class="no">4</span><h2>Straße und Verkehr</h2><span class="sum">${road ? `${esc(road.ref || road.highway)} · ${sp?.v != null ? `${sp.v} km/h` : "Tempo unbekannt"}` : "keine Straße"} · ${svz?.status === "ok" ? `DTV ${fmt(svz.kfz)}` : "keine Zählung"}</span></summary>
      <div class="body"><div class="tablewrap"><table class="t"><tbody>
        <tr><th>Straße ${origin("OSM")}</th><td>${road ? `${esc(M.streetName ?? road.label)} · ${road.ref ? `${esc(REF_LABEL[road.refClass] ?? "Nummer")} ${esc(road.ref)}` : "ohne Straßennummer"} · highway=${esc(road.highway)}` : "keine Straße in den Daten"}</td></tr>
        <tr><th>Tempo ${origin("OSM")}</th><td>${sp?.v != null ? `${sp.v} km/h${sp.derived ? " (abgeleitet aus der Ortslage)" : ""}${sp.zone ? " (Zone)" : ""}${sp.cond ? ` · zeitweise ${sp.cond.v} km/h (${esc(sp.cond.when)})` : ""}${sp.dir ? ` · ${esc(sp.dir)}` : ""}` : "nicht eingetragen"}${M.profile.length > 1 ? ` · entlang der Straße: ${M.profile.map((p) => (p.v != null ? p.v : "?")).filter((v, i, a) => a.indexOf(v) === i).join(" / ")} km/h` : ""}</td></tr>
        <tr><th>Ortslage ${origin("OSM")}</th><td>${sp?.urban === true ? "innerorts" : sp?.urban === false ? "außerorts" : "nicht in den Daten"}</td></tr>
        <tr><th>Fahrstreifen</th><td>nicht in den Kacheln (OSM lanes)${lanes ? ` · Angabe: ${lanes === "2" ? "zwei oder mehr" : "einer"} je Richtung ${origin("NUTZ")}` : ""}</td></tr>
        <tr><th>Verkehrsmenge ${origin("AMT")}</th><td>${svz?.status === "ok" ? `${fmt(svz.kfz)} Kfz/24 h${Number.isFinite(svz.sv) ? `, Schwerverkehr ${fmt(svz.sv, 1)} %` : ""} (SVZ ${esc(svz.year ?? "")}${svz.metric ? `, ${esc(svz.metric)}` : ""})` : svz?.status === "none" ? "keine Zählung an dieser Straße (SVZ)" : esc(unavailable(svz?.status))}${hvs?.status === "ok" ? ` · UBA-Hauptverkehrsstraßen: ≈ ${fmt(hvs.kfz)} Kfz/Tag` : ""}</td></tr>
        <tr><th>Telraam ${origin("MESS")}</th><td>${tel?.status === "ok" ? `${fmt(tel.car)} Kfz/Tag, ${fmt(tel.bike)} Räder/Tag (Ø der letzten 2 Wochen)` : tel?.status === "none" ? "keine Zählstelle in der Nähe" : esc(unavailable(tel?.status))}</td></tr>
        <tr><th>Überholabstände ${origin("MESS")}</th><td>${obs.status === "ok" ? (obs.n ? `${obs.n} Messungen am Abschnitt, ${obs.n >= 20 ? `${Math.round((100 * obs.k) / obs.n)} % unter dem Mindestabstand` : `${obs.k} unter dem Mindestabstand (Anteil erst ab 20)`}` : "keine Messungen am Abschnitt") : esc(unavailable(obs.status))} (OpenBikeSensor)</td></tr>
        <tr><th>Radinfrastruktur</th><td>im Report noch nicht ausgewertet – in der Karte als Layer „Radinfrastruktur“ (radinfra.de/TILDA)</td></tr>
      </tbody></table></div></div>
    </details>

    <details class="sec"><summary><span class="no">5</span><h2>Umwelt</h2><span class="sum">${noise.den?.status === "ok" ? (noise.den.v != null || noise.night.v != null ? `L_DEN ${esc(noise.den.txt ?? "< 55")} · L_Night ${esc(noise.night?.txt ?? "< 50")} dB(A)` : "keine Kartierung am Abschnitt") : "nicht verfügbar"}</span></summary>
      <div class="body"><div class="tablewrap"><table class="t"><tbody>
        <tr><th>Lärm ${origin("AMT")}</th><td>${noise.den?.status === "ok" ? (noise.den.v != null || noise.night.v != null ? `L_DEN ${esc(noise.den.txt ?? "unter 55")} dB(A), L_Night ${esc(noise.night?.txt ?? "unter 50")} dB(A) im 25-m-Band ±150 m um die Stelle – Kartierungswerte, keine Beurteilungspegel` : "keine Kartierung (nur Hauptverkehrsstraßen sind kartiert – das heißt nicht, dass es leise ist)") : esc(unavailable(noise.den?.status))}${noise.den?.atFac ? ` · an der Einrichtung: L_DEN ${esc(noise.den.atFac.txt)}` : ""}</td></tr>
        <tr><th>Wohnbevölkerung am Abschnitt ${origin("MOD")}</th><td>${cz?.band ? `rund ${fmt(cz.band.ew)} Einwohner im ${cz.band.width}-m-Band beidseits (Zelle ≠ Fassade)` : "–"}</td></tr>
        <tr><th>Luft</th><td>nicht verfügbar</td></tr>
      </tbody></table></div></div>
    </details>

    <details class="sec" open><summary><span class="no">6</span><h2>Rechtliche Einordnung</h2><span class="sum">Weg A: ${esc(A.verdict.label)} · Weg B: ${esc(R.B.verdict.label)}${R.Cw ? ` · Weg C: ${esc(R.Cw.verdict.label)}` : ""}</span></summary>
      <div class="body">
        <p class="small muted" style="margin:0">Hinweise nach den Daten, keine Feststellung. Gelb heißt: Datenlücke – beantworte die Frage, dann rechnet die Ampel neu. Rot aus den Daten wird nicht überschrieben.</p>
        ${wayBlock("Weg A · Tempo 30 vor Einrichtungen", "§ 45 Abs. 9 S. 4 Nr. 6 und Nr. 4 StVO · VwV zu Z. 274 Rn. 13–13b · ohne Gefahrenlage, Ermessen bleibt", A, st.answers)}
        ${wayBlock("Weg B · Gefahrenlage", "§ 45 Abs. 9 S. 3 StVO · BVerwG 3 C 37.09 · Feststellung ist Sache der Behörde", R.B, st.answers)}
        ${R.Cw ? wayBlock("Weg C · Lärm", "§ 45 Abs. 1 S. 2 Nr. 3 StVO · 16. BImSchV · LSR-StV 2007 · nur Indizien", R.Cw, st.answers) : ""}
      </div>
    </details>

    <details class="sec" open><summary><span class="no">7</span><h2>Mögliche Maßnahmen</h2><span class="sum">unverbindlich · ${R.measures.length} Kandidaten</span></summary>
      <div class="body"><div class="mcards">${R.measures.map((m) => `<div class="mcard"><h4>${m.sign ? '<span class="sign30">30</span> ' : ""}${esc(m.t)}</h4><p class="why">${esc(m.why)}</p><div class="who mono">${esc(m.norm)}</div><div class="who">${esc(m.who)}</div></div>`).join("") || '<div class="empty">Keine Kandidaten aus den Daten.</div>'}</div></div>
    </details>

    <details class="sec"><summary><span class="no">8</span><h2>Gegenargumente und Abwägung</h2><span class="sum">offen gezeigt</span></summary>
      <div class="body"><ul class="plain">${R.gegen.map((g) => `<li>${esc(g)}</li>`).join("")}</ul></div>
    </details>

    <details class="sec"><summary><span class="no">9</span><h2>Datengrundlage und Grenzen</h2><span class="sum">Quellen · Lizenzen · Anhang</span></summary>
      <div class="body">
        <ul class="plain small">${sourcesList(meta).map((s) => `<li>${s}</li>`).join("")}
          <li>Methode: lokale Tangentialebene um die Stelle (Abweichung zu EPSG:25832 &lt; 0,1 %); Unfälle je Kachel genau einmal gezählt; Einrichtungen über ihre Fläche, Umfeld als Puffer; Lärm und Bevölkerung am Abschnitt ±150 m entlang der Hauptstraße.</li>
          <li>Grenzen: keine Sachschäden im Unfallatlas; OSM ist nicht die Beschilderung vor Ort; Eingänge, Fahrstreifen, Vorfahrtstraßen und Krippen fehlen noch in den Kacheln; Lärm nur an Hauptverkehrsstraßen; Land aus Photon/OSM bzw. groben Landesgrenzen.</li>
          <li>Rechtsstand: ${esc(RW.stvo)}; ${esc(RW.vwv)}. Landesregeln: ${esc(R.P.quelle)}.</li>
        </ul>
        <details><summary class="small">Maschinenlesbarer Anhang (JSON)</summary><pre class="json" id="jsonout">${esc(JSON.stringify(annex(V), null, 2))}</pre><div class="actions" style="margin-top:8px"><button class="btn" data-copy="#jsonout">JSON kopieren</button></div></details>
      </div>
    </details>`;
}

function sourcesList(meta) {
  const line = (id, fallback) => {
    const m = meta?.[id];
    return m ? `${esc(m.attribution ?? m.label ?? fallback)}${m.vintage ? `, Stand ${esc(m.vintage)}` : ""}` : esc(fallback);
  };
  return [
    `${origin("AMT")} ${line("accidents", "Unfallatlas der Statistischen Ämter (dl-de/by-2-0)")} – nur Unfälle mit Personenschaden.`,
    `${origin("OSM")} ${line("roads", "© OpenStreetMap-Mitwirkende (ODbL)")} – Straßen, Tempo, Einrichtungen, Querungen, Haltestellen.`,
    `${origin("AMT")} ${line("census", "Zensus 2022 (Destatis, dl-de/by-2-0)")}.`,
    `${origin("AMT")} ${line("noiseDen", "UBA-Lärmkartierung (Hauptverkehrsstraßen)")} · ${line("svz", "Straßenverkehrszählung der Länder")}.`,
    `${origin("MESS")} ${line("telraam", "Telraam (CC BY-NC 4.0)")} · ${line("obs", "OpenBikeSensor-Portale")}.`,
    "Landesgrenzen: Natural Earth (gemeinfrei) · Ortsnamen: Photon/komoot (© OpenStreetMap-Mitwirkende).",
  ];
}

export function annex(V) {
  const { st, M, R, meta, link, place } = V;
  const acc = M.accidents;
  return {
    format: "unfallkarte-report", version: 1, erstellt: V.today, regelwerk: RW.version, texte: TEXTVERSION, link,
    auswahl: { art: M.selection.kind, radius_m: M.selection.r, einrichtung: M.selection.fac?.oid ?? null, jahre: [st.years.from, st.years.to], land: R.P.land, land_quelle: st.land ? "Nutzerwahl" : place?.landQuelle ?? null },
    strasse: M.road ? { name: M.streetName, ref: M.road.ref, highway: M.road.highway, tempo: (R.A.sp ?? M.speed)?.v ?? null } : null,
    unfaelle: { n: acc.n, u_sp: acc.nSP, getoetete: acc.nT, fuss_rad: acc.fr, je_jahr: acc.byYear, typen: acc.byTyp, beteiligung: acc.bet },
    uko: R.U.list.map((u) => ({ id: u.id, status: u.status, detail: u.detail })),
    weg_a: { urteil: R.A.verdict.key, schritte: R.A.steps.map((x) => ({ id: x.id, status: x.status, nutzerangabe: !!x.nutz })) },
    weg_b: { urteil: R.B.verdict.key, schritte: R.B.steps.map((x) => ({ id: x.id, status: x.status })) },
    ...(R.Cw ? { weg_c: { urteil: R.Cw.verdict.key, schritte: R.Cw.steps.map((x) => ({ id: x.id, status: x.status })) } } : {}),
    massnahmen: R.measures.map((m) => m.id),
    datenstaende: Object.fromEntries(Object.entries(meta ?? {}).filter(([, m]) => m?.vintage).map(([k, m]) => [k, m.vintage])),
    verfuegbarkeit: M.status,
  };
}

// ------------------------------------------------------------------ Brief
/** Briefvorschau, Zeichenzahl, mailto — auch einzeln aktualisierbar (main.js beim Tippen). */
export function letterParts(V) {
  const L = buildLetter(V.E);
  const len = (V.st.beob || "").trim().length;
  const to = (V.st.behoerdeMail || "").trim();
  const mailto = `mailto:${encodeURIComponent(to).replace(/%40/g, "@")}?subject=${encodeURIComponent(L.subject)}${(L.subject + L.body).length < 1800 ? `&body=${encodeURIComponent(L.body)}` : ""}`;
  const sheet = `${letterInner(V, L)}<div class="foot">Erstellt mit der Unfallkarte · Regelwerk ${RW.version} · Textbausteine ${TEXTVERSION} · Standardtext, keine Rechtsberatung</div>`;
  return { L, len, ready: len >= 80, mailto, sheet };
}

export function renderBrief(V) {
  const { st, adr, M } = V;
  const types = briefTypes(V.E);
  const { L, len: beobLen, ready, mailto, sheet } = letterParts(V);
  return `
    <div class="brief">
      <div class="panel form">
        <div class="field"><span class="lbl">Art des Schreibens</span><div class="radio">${types.map((t) => `<label class="opt ${t.ok ? "" : "off"}"><input type="radio" name="brieftyp" value="${t.id}" ${L.type === t.id ? "checked" : ""} ${t.ok ? "" : "disabled"}><span><b>${t.label}</b><span class="d">${esc(t.d)}</span></span></label>`).join("")}</div></div>
        ${L.type === "laerm" ? '<div class="callout warn">Ein Antrag führt zu einem Bescheid. Gegen eine Ablehnung sind Widerspruch oder Klage möglich; je nach Land können Gebühren anfallen. Wenn du das nicht möchtest, wähle „Anregung“.</div>' : ""}
        <div class="row2">
          <div class="field"><label for="b-role">Deine Rolle</label><select id="b-role" data-bind="role">${[["eltern", "Elternteil"], ["anwohner", "Anwohner:in"], ["initiative", "Initiative"], ["keine", "ohne Angabe"]].map(([v, l]) => `<option value="${v}" ${st.role === v ? "selected" : ""}>${l}</option>`).join("")}</select></div>
          <div class="field"><label for="b-tone">Ton</label><select id="b-tone" data-bind="tone"><option value="sachlich" ${st.tone === "sachlich" ? "selected" : ""}>sachlich-knapp</option><option value="persoenlich" ${st.tone === "persoenlich" ? "selected" : ""}>persönlich</option></select></div>
        </div>
        ${st.role === "initiative" ? `<div class="field"><label for="b-ini">Name der Initiative</label><input type="text" id="b-ini" data-bind="initiative" value="${esc(st.initiative)}"></div>` : ""}
        <div class="field"><label for="b-beob">Deine Beobachtung vor Ort (Pflicht, mindestens 80 Zeichen)</label><textarea id="b-beob" data-bind="beob" placeholder="Was erlebst du dort? Wann, wie oft, wer ist betroffen? Zum Beispiel: Morgens queren viele Kinder zwischen parkenden Autos …">${esc(st.beob)}</textarea><span class="counter ${ready ? "" : "bad"}" id="b-count">${beobLen} Zeichen${ready ? "" : " – noch zu kurz"}</span></div>
        <div class="row2">
          <div class="field"><label for="b-name">Name</label><input type="text" id="b-name" data-bind="name" value="${esc(st.name)}"></div>
          <div class="field"><label for="b-kontakt">E-Mail oder Telefon</label><input type="text" id="b-kontakt" data-bind="kontakt" value="${esc(st.kontakt)}"></div>
        </div>
        ${L.type === "laerm" ? `<div class="row2"><div class="field"><label for="b-hnr">Hausnummer an der ${esc(M.streetName ?? "Straße")}</label><input type="text" id="b-hnr" data-bind="hausnr" value="${esc(st.hausnr)}"></div><div class="field"><label for="b-anschrift">Anschrift für den Bescheid</label><textarea id="b-anschrift" data-bind="anschrift" style="min-height:58px">${esc(st.anschrift)}</textarea></div></div>` : ""}
        <div class="field"><span class="lbl">Adressat</span>
          <div class="addr"><b>Vorschlag: ${esc(adr.stelle)}</b>${adr.alt ? `<span class="sure">oder: ${esc(adr.alt)}</span>` : ""}<span class="sure">${esc(adr.basis)}</span><span class="sure">Beleg: ${esc(adr.sicher)} · ${esc(adr.quelle)}</span>
            <span class="sure">Zuständigkeit und Anschrift prüfen: <a href="${BUNDESPORTAL}" target="_blank" rel="noopener">Bundesportal – „Aufstellung von Verkehrszeichen anregen“ ↗</a></span></div>
          <div class="field" style="margin-top:8px"><label for="b-behoerde">Anschrift der Behörde (so steht sie im Brief)</label><textarea id="b-behoerde" data-bind="behoerde" style="min-height:70px" placeholder="${esc(adr.stelle)}&#10;Straße Nr.&#10;PLZ Ort">${esc(st.behoerde)}</textarea></div>
          <div class="row2" style="margin-top:6px"><div class="field"><label for="b-bmail">E-Mail der Behörde (für den Entwurf)</label><input type="text" id="b-bmail" data-bind="behoerdeMail" value="${esc(st.behoerdeMail)}"></div><div class="field"><span class="lbl">Nachrichtlich an</span><label class="small"><input type="checkbox" data-cc="polizei" ${st.cc.polizei ? "checked" : ""}> Polizei</label><label class="small"><input type="checkbox" data-cc="bv" ${st.cc.bv ? "checked" : ""}> Bezirks-/Gemeindevertretung</label></div></div>
        </div>
        ${L.type === "anregung" ? `<label class="small"><input type="checkbox" data-bind-check="ortstermin" ${st.ortstermin ? "checked" : ""}> Ortstermin anbieten</label>` : ""}
        <div class="callout">Standardtext aus Bausteinen, keine Prüfung deines Falls. Du entscheidest und versendest selbst – nichts wird gespeichert oder übertragen.</div>
        <div class="callout">Gibt es schon eine Planung oder einen Antrag? Frag vorher bei Gemeinde oder Bezirk nach.</div>
        <div class="actions">
          <button class="btn primary" id="b-copy" ${ready ? "" : 'aria-disabled="true"'}>Text kopieren</button>
          <a class="btn" id="b-mail" href="${ready ? esc(mailto) : "#"}" ${ready ? "" : 'aria-disabled="true"'}>E-Mail-Entwurf öffnen</a>
          <button class="btn" data-go="pdf">Report + Brief als PDF →</button>
        </div>
        <p class="hint" style="margin:0">„E-Mail-Entwurf öffnen“ nutzt einen mailto-Link; Anhänge sind so nicht möglich – das PDF bitte selbst anhängen.</p>
      </div>
      <div>
        <div class="eyebrow" style="margin-bottom:6px">Vorschau · Textbausteine ${TEXTVERSION} · juristisch zu prüfen</div>
        <article class="sheet" id="letter">${sheet}</article>
      </div>
    </div>`;
}

function letterInner(V, L) {
  const { st, adr, place, M } = V;
  const sender = [st.name || "[Name]", (L.type === "laerm" ? st.anschrift : st.kontakt || "").replace(/\n/g, ", ")].filter(Boolean).join(" · ");
  const recipient = (st.behoerde || "").trim() || `${adr.stelle}\n[Anschrift eintragen]`;
  const ort = place?.city || M.census?.gemeinde || "";
  return `<div class="sender">${esc(sender)}</div><div class="recipient">${esc(recipient)}</div><div class="date">${esc(ort ? `${ort}, ` : "")}${esc(V.today)}</div><div class="subject">${esc(L.subject)}</div><div class="body">${esc(L.body)}</div>`;
}

// ------------------------------------------------------------------ Druck
export function renderPrint(V, { framed = false } = {}) {
  return `
    <div class="panel pdfbar">
      <div class="small" style="max-width:70ch">So sieht der Report beim Drucken aus. „Drucken“ öffnet den Druckdialog des Browsers – dort „Als PDF speichern“ wählen. Hintergrundgrafiken einschalten, falls die Ampelfarben fehlen.</div>
      ${framed ? "" : '<button class="btn primary" id="doprint">Drucken / Als PDF speichern</button>'}
    </div>
    <div class="docstack">${printDoc(V)}</div>`;
}

export function printDoc(V) {
  const { st, M, R, adr, title, meta, link, dataYears } = V;
  const L = buildLetter(V.E);
  const acc = M.accidents;
  const amp = (k) => `<span class="amp ${k}">${ST_ICON[k]}</span>`;
  const wayT = (t, W) => `<h3>${t} — ${esc(W.verdict.label)}</h3><table><tbody>${W.steps.map((x) => `<tr class="keep"><td style="width:22px">${amp(x.status)}</td><td style="width:33%"><b>${x.id} · ${esc(x.t)}</b>${x.nutz ? " <i>(Nutzerangabe)</i>" : ""}</td><td>${esc(x.txt)}<br><span class="dmeta">${esc(x.data || "")}</span></td></tr>`).join("")}</tbody></table>`;
  const yearsRow = dataYears.map((y) => `<td class="r">${acc.byYear[y][1] + acc.byYear[y][2] + acc.byYear[y][3]}</td>`).join("");
  const sp = R.A.sp ?? M.speed;
  const cz = M.census;
  const svz = M.traffic.svz;
  const noise = M.noise;
  const typeLabel = briefTypes(V.E).find((t) => t.id === L.type).label;
  return `<article class="doc">
    <div class="dmeta">Unfallkarte · Analyse-Report · ${KIND_LABEL[M.selection.kind]} · ${esc(whereTxt(M))} · erstellt ${esc(V.today)}</div>
    <h1>${esc(title.titel)}</h1>
    <div class="dmeta">${esc([title.ort, cz?.gemeinde ? `Gemeinde ${cz.gemeinde}` : null, R.P.land !== "bund" ? landName(R.P.land) : null].filter(Boolean).join(" · "))} · Landesregeln: ${esc(R.P.label)} · Regelwerk ${RW.version} (Stand ${RW.stand})</div>
    <div class="dstamp">Datenbasierte Einschätzung · keine Rechtsberatung · kein Gutachten · keine amtliche Feststellung</div>
    <div class="map keep">${mapSVG(M, R, { width: 700, years: st.years, print: true, aspect: 1.5 })}</div>
    <p class="dmeta">Karte: Punkte = Unfälle mit Personenschaden ${st.years.from}–${st.years.to} (dunkelrot Getötete, rot Schwerverletzte, hell Leichtverletzte; hohl = außerhalb). Straßenband grün ≤ 30, gelb 50, rot &gt; 50 km/h (gestrichelt = abgeleitet). Gestrichelt mit Zeichen 274 = Vorschlag. © OpenStreetMap-Mitwirkende, Unfallatlas.</p>
    <h2>1 · Auf einen Blick</h2>
    <table class="glance"><tbody>${R.glance.map((f) => `<tr><td style="width:22px">${amp(f.st)}</td><td><b>${esc(f.t)}</b><br><span class="dmeta">${esc(f.n)}</span></td></tr>`).join("")}</tbody></table>
    <p><b>Maßnahmen-Kandidaten:</b> ${R.measures.map((m) => esc(m.t)).join(" · ") || "keine aus den Daten"}</p>
    <p><b>Vermutlich zuständig:</b> ${esc(adr.stelle)} <span class="dmeta">(${esc(adr.basis)} Beleg: ${esc(adr.sicher)})</span></p>
    <h2>2 · Unfalllage</h2>
    <table><thead><tr><th>Jahr</th>${dataYears.map((y) => `<th class="r">${y}</th>`).join("")}</tr></thead><tbody><tr><td>U(P) in der Auswahl</td>${yearsRow}</tr></tbody></table>
    <div class="twocol">
      <table><tbody><tr><td>Unfälle ${st.years.from}–${st.years.to}</td><td class="r">${acc.n}</td></tr><tr><td>davon Getötete / Schwerverletzte</td><td class="r">${acc.nT} / ${acc.nSP - acc.nT}</td></tr><tr><td>mit Fuß- oder Radbeteiligung</td><td class="r">${acc.fr}</td></tr>
      ${Object.entries(acc.byTyp).filter(([, v]) => v).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k, v]) => `<tr><td>Typ: ${TYP[k]}</td><td class="r">${v}</td></tr>`).join("")}</tbody></table>
      <table><tbody>${R.U.list.map((u) => `<tr><td style="width:22px">${amp(u.status)}</td><td>${esc(u.text)}<br><span class="dmeta">${esc(u.detail)}</span></td></tr>`).join("")}</tbody></table>
    </div>
    <p class="dmeta">Referenzvergleich (erwartete Unfälle an vergleichbaren Stellen) folgt mit einer späteren Stufe. Anteile erst ab 20 Fällen.</p>
    <h2>3 bis 5 · Nutzungen, Straße, Umwelt</h2>
    <table><tbody>
      ${M.facilities.slice(0, 8).map((f) => `<tr><td>${esc(facLabel(f))}</td><td>${esc(FAC[f.typ]?.nr6 ?? "nicht bzw. unklar nach Nr. 6")}</td><td class="r">${fmt(f.dSel)} m zur Auswahl${f.dRoad != null ? ` · ${fmt(f.dRoad)} m zur Hauptstraße` : ""}</td></tr>`).join("")}
      <tr><td>Bevölkerung</td><td colspan="2">${cz ? `${fmt(cz.ew)} EW im 300-m-Umfeld, davon ${fmt(cz.u18)} unter 18 und ${fmt(cz.a65)} ab 65 (Zensus 2022)` : "nicht verfügbar"}</td></tr>
      <tr><td>Straße</td><td colspan="2">${M.road ? `${esc(M.streetName ?? M.road.label)} · ${esc(M.road.ref || "ohne Nummer")} · ${sp?.v != null ? `${sp.v} km/h${sp.derived ? " (abgeleitet)" : ""}` : "Tempo unbekannt"} · ${svz?.status === "ok" ? `${fmt(svz.kfz)} Kfz/24 h (SVZ ${esc(svz.year ?? "")})` : "keine Zählung"}` : "keine Straße in den Daten"}</td></tr>
      <tr><td>Lärm</td><td colspan="2">${noise.den?.status === "ok" && (noise.den.v != null || noise.night.v != null) ? `L_DEN ${esc(noise.den.txt ?? "unter 55")} / L_Night ${esc(noise.night?.txt ?? "unter 50")} dB(A) (Kartierung, keine Beurteilungspegel)` : "keine Kartierung bzw. nicht verfügbar"}</td></tr>
    </tbody></table>
    <div class="pb"></div>
    <h2>6 · Rechtliche Einordnung</h2>
    <p class="dmeta">Hinweise nach den Daten, keine Feststellung. ✓ erfüllt · ? unklar (Datenlücke) · ✕ nicht erfüllt · i Hinweis · – entfällt.</p>
    ${wayT("Weg A · Tempo 30 vor Einrichtungen (§ 45 Abs. 9 S. 4 Nr. 6 StVO)", R.A)}
    ${wayT("Weg B · Gefahrenlage (§ 45 Abs. 9 S. 3 StVO)", R.B)}
    ${R.Cw ? wayT("Weg C · Lärm (§ 45 Abs. 1 S. 2 Nr. 3 StVO)", R.Cw) : ""}
    <h2>7 · Mögliche Maßnahmen (unverbindlich)</h2>
    <table><tbody>${R.measures.map((m) => `<tr class="keep"><td style="width:30%"><b>${esc(m.t)}</b></td><td>${esc(m.why)}<br><span class="dmeta">${esc(m.norm)} · ${esc(m.who)}</span></td></tr>`).join("") || "<tr><td>keine</td></tr>"}</tbody></table>
    <h2>8 · Gegenargumente und Abwägung</h2>
    <ul>${R.gegen.map((g) => `<li>${esc(g)}</li>`).join("")}</ul>
    <h2>9 · Datengrundlage und Grenzen</h2>
    <p class="dmeta">${sourcesList(meta).map((s) => s.replace(/<[^>]+>/g, "")).join(" · ")} · Rechtsstand: ${esc(RW.stvo)}; ${esc(RW.vwv)} · Landesregeln: ${esc(R.P.quelle)} · Report-Link: <span style="font-family:var(--font-mono)">${esc(link)}</span></p>
    <div class="pb"></div>
    <div class="letter">
      <div class="dmeta">Briefentwurf · ${esc(typeLabel)} · Textbausteine ${TEXTVERSION} · juristisch zu prüfen</div>
      ${letterInner(V, L)}
    </div>
    <div class="foot">Erstellt mit der Unfallkarte · Regelwerk ${RW.version} · Textbausteine ${TEXTVERSION} · Datenbasierte Einschätzung, keine Rechtsberatung, kein Gutachten.</div>
  </article>`;
}
