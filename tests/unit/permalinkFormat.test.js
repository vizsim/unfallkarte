// Format-Tests OHNE Browser: `npm run test:unit` (node --test).
// Das geht nur, weil js/utils/permalinkFormat.js rein ist — kein DOM, keine Karte.
// Der Roundtrip DURCH die App (Klicks -> URL -> Neuladen) steckt weiter in
// tests/web/permalink.spec.js; hier geht es um das Format selbst.
import { test } from "node:test";
import assert from "node:assert/strict";

import {
    CONTROLS, FILTER_GROUPS, kontextKeys, mergeState, parse, parseLegacy, serialize, styleShortMap,
} from "../../js/utils/permalinkFormat.js";

/** Der Zustand, mit dem die App startet (entspricht den Defaults in index.html). */
const defaults = () => ({
    view: { lat: 52.315, lng: 13.634, zoom: 12 },
    style: "UKATEGORIE",
    filters: {
        UKATEGORIE: ["1", "2", "3"],
        BETEILIGUNG: ["IstRad", "IstPKW", "IstFuss", "IstKrad", "IstGkfz", "IstSonstig"],
        UJAHR: ["2017", "2018", "2019", "2020", "2021", "2022", "2023", "2024", "2025"],
        UTYP1: ["1", "2", "3", "4", "5", "6", "7"],
        UART: ["1", "2", "3", "4", "5", "6", "7", "8", "9", "0"],
    },
    details: false,
    layers: [],
    scenarios: [],
    controls: { c1: "3", c2: "3", c8: "60", c9: "3", c9r: "all", uh: "14", vm: "dtv", vl: "1", vb: "1", tm: "bike" },
});

const roundtrip = (state, base = defaults()) => mergeState(base, parse(`?${serialize(state, base)}`));

test("Startansicht: nur Version + Ansicht, alles Default fällt weg", () => {
    assert.equal(serialize(defaults(), defaults()), "v=2&map=12.00/52.31500/13.63400");
});

test("Ansicht ist z/lat/lng wie bei OSM — und übersteht den Roundtrip", () => {
    const state = { ...defaults(), view: { lat: 52.52, lng: 13.405, zoom: 12.5 } };
    assert.match(serialize(state, defaults()), /(^|&)map=12\.50\/52\.52000\/13\.40500(&|$)/);
    assert.deepEqual(roundtrip(state).view, { lat: 52.52, lng: 13.405, zoom: 12.5 });
});

test("nur die abweichende Filter-Dimension landet in der URL", () => {
    const state = { ...defaults(), filters: { ...defaults().filters, UKATEGORIE: ["1", "2"] } };
    const query = serialize(state, defaults());
    assert.match(query, /uk=1_2/);
    for (const param of ["bet=", "jahr=", "typ=", "art="]) assert.ok(!query.includes(param), `${param} sollte fehlen`);
    assert.deepEqual(roundtrip(state).filters, state.filters);
});

test("leere Auswahl ist ein eigener Zustand — nicht dasselbe wie 'Parameter fehlt'", () => {
    const leer = { ...defaults(), filters: { ...defaults().filters, UKATEGORIE: [] } };
    assert.match(serialize(leer, defaults()), /uk=-/);
    assert.deepEqual(roundtrip(leer).filters.UKATEGORIE, []);
    // Gegenprobe: ohne den Parameter gilt der Default, NICHT "leer".
    assert.deepEqual(mergeState(defaults(), parse("?v=2&map=12.00/52.31500/13.63400")).filters.UKATEGORIE, ["1", "2", "3"]);
});

test("Jahre werden als Bereich gekürzt und exakt wiederhergestellt", () => {
    const jahre = ["2020", "2021", "2022", "2023", "2024", "2025"];
    const state = { ...defaults(), filters: { ...defaults().filters, UJAHR: jahre } };
    assert.match(serialize(state, defaults()), /jahr=20-25/);
    assert.deepEqual(roundtrip(state).filters.UJAHR, jahre);

    // Lücken bleiben Lücken (Bereich + Einzelwert nebeneinander)
    const mitLuecke = { ...defaults(), filters: { ...defaults().filters, UJAHR: ["2017", "2018", "2019", "2025"] } };
    assert.match(serialize(mitLuecke, defaults()), /jahr=17-19_25/);
    assert.deepEqual(roundtrip(mitLuecke).filters.UJAHR, ["2017", "2018", "2019", "2025"]);
});

test("ein neues Datenjahr braucht keine Tabellenpflege (v1 hätte 2026 verschluckt)", () => {
    const base = { ...defaults(), filters: { ...defaults().filters, UJAHR: [] } };
    const state = { ...base, filters: { ...base.filters, UJAHR: ["2026"] } };
    assert.deepEqual(roundtrip(state, base).filters.UJAHR, ["2026"]);
});

test("Kontext-Layer, Szenarien und Regler überleben den Roundtrip", () => {
    const state = {
        ...defaults(),
        layers: ["crossings", "telraam", "bikelanes"],
        scenarios: ["sc2", "sc9"],
        controls: { ...defaults().controls, c9: "7", c9r: "usp3_3y", uh: "8", vm: "sv", tm: "car" },
    };
    const query = serialize(state, defaults());
    assert.match(query, /n=2_9/);
    assert.match(query, /o=c9:7,c9r:usp3_3y,uh:8,vm:sv,tm:car/);

    const back = roundtrip(state);
    assert.deepEqual(back.layers.sort(), ["bikelanes", "crossings", "telraam"]);
    assert.deepEqual(back.scenarios.sort(), ["sc2", "sc9"]);
    assert.deepEqual(back.controls, state.controls);
});

test("Select-Werte mit Unterstrich bleiben heil (usp3_3y)", () => {
    const state = { ...defaults(), controls: { ...defaults().controls, c9r: "utyp5_3y" } };
    assert.equal(roundtrip(state).controls.c9r, "utyp5_3y");
});

test("Einfärbung überlebt den Roundtrip", () => {
    for (const style of Object.keys(styleShortMap)) {
        assert.equal(roundtrip({ ...defaults(), style }).style, style);
    }
});

test("Alles an: vollständiger Roundtrip über jede Dimension", () => {
    const state = {
        view: { lat: 48.13743, lng: 11.57549, zoom: 15.25 },
        style: "UART",
        filters: {
            UKATEGORIE: ["1"], BETEILIGUNG: ["IstRad", "IstFuss"], UJAHR: ["2023", "2024"],
            UTYP1: ["3"], UART: ["0", "9"],
        },
        details: true,
        layers: Object.keys(kontextKeys),
        scenarios: ["sc1", "sc3", "sc9"],
        controls: Object.fromEntries(CONTROLS.map((c) => [c.key, c.key === "c9r" ? "up5_3y" : "5"])),
    };
    const back = roundtrip(state);
    assert.deepEqual(back.view, state.view);
    assert.equal(back.style, state.style);
    assert.equal(back.details, true);
    for (const group of FILTER_GROUPS) assert.deepEqual(back.filters[group].sort(), [...state.filters[group]].sort());
    assert.deepEqual(back.layers.sort(), [...state.layers].sort());
    assert.deepEqual(back.scenarios.sort(), state.scenarios);
    assert.deepEqual(back.controls, state.controls);
});

test("alte ?p=-Links werden weiter gelesen", () => {
    const state = parse("?p=52.52000,13.40500,12.50,B,1_2|1_3|23_24|1_2|0,sc2_sc9,cz");
    assert.deepEqual(state.view, { lat: 52.52, lng: 13.405, zoom: 12.5 });
    assert.equal(state.style, "BETEILIGUNG");
    assert.deepEqual(state.filters.UKATEGORIE, ["1", "2"]);
    assert.deepEqual(state.filters.BETEILIGUNG, ["IstRad", "IstFuss"]);
    assert.deepEqual(state.filters.UJAHR, ["2023", "2024"]);
    assert.deepEqual(state.filters.UART, ["0"]);
    assert.deepEqual(state.scenarios, ["sc2", "sc9"]);
    assert.deepEqual(state.layers.sort(), ["crossings", "telraam"]);
});

test("v1 -> v2: ein alter Link wird beim Lesen auf das neue Format hochgeschrieben", () => {
    const alt = "?p=52.52000,13.40500,12.50,U,1_2_3|1_2_3_4_5_6|17_18_19_20_21_22_23_24_25|1_2_3_4_5_6_7|1_2_3_4_5_6_7_8_9_0,,cz";
    const state = mergeState(defaults(), parse(alt));
    const neu = serialize(state, defaults());
    // Alle Filter standen auf Default -> sie fallen weg; übrig bleiben Ansicht + Layer.
    assert.equal(neu, "v=2&map=12.50/52.52000/13.40500&l=cz");
    assert.deepEqual(mergeState(defaults(), parse(`?${neu}`)).layers.sort(), ["crossings", "telraam"]);
});

test("v1-Link ohne Kontext-/Szenario-Teil kippt nicht um", () => {
    const state = parseLegacy("52.31500,13.63400,12.00,U,1_2_3|1_2|17|1|1");
    assert.deepEqual(state.layers, []);
    assert.deepEqual(state.scenarios, []);
    assert.deepEqual(state.filters.UJAHR, ["2017"]);
});

test("URL ohne Permalink -> null (die App schreibt dann ihre Startansicht)", () => {
    assert.equal(parse(""), null);
    assert.equal(parse("?foo=bar"), null);
});

test("Unbekannte Kürzel aus einer neueren Version werden still verworfen", () => {
    const state = parse("?v=3&map=12.00/52.00/13.00&l=cz&o=c9:5,zz:99&unbekannt=1");
    assert.deepEqual(state.controls, { c9: "5" });
    assert.deepEqual(state.layers.sort(), ["crossings", "telraam"]);
});

test("Kaputte Ansicht macht den Rest des Links nicht kaputt", () => {
    const state = parse("?v=2&map=kaputt&l=cz");
    assert.equal(state.view, undefined);
    assert.deepEqual(state.layers.sort(), ["crossings", "telraam"]);
});

test("Zeichen-Vertrag: jede Kennung ist eindeutig vergeben", () => {
    const chars = Object.values(kontextKeys);
    assert.equal(new Set(chars).size, chars.length, "doppeltes Kontext-Zeichen");
    const keys = CONTROLS.map((c) => c.key);
    assert.equal(new Set(keys).size, keys.length, "doppeltes Regler-Kürzel");
    // Reserviert: t/i waren früher Terrain/Hillshade — nie neu vergeben.
    for (const reserved of ["t", "i"]) assert.ok(!chars.includes(reserved), `Zeichen "${reserved}" ist reserviert`);
});
