// permalink.js


const beteiligungMap = {
    IstRad: "1",
    IstPKW: "2",
    IstFuss: "3",
    IstKrad: "4",
    IstGkfz: "5",
    IstSonstig: "6"
};

const yearMap = {
    2017: "17",
    2018: "18",
    2019: "19",
    2020: "20",
    2021: "21",
    2022: "22",
    2023: "23"
};

const reverseBeteiligungMap = Object.fromEntries(Object.entries(beteiligungMap).map(([k, v]) => [v, k]));
const reverseYearMap = Object.fromEntries(Object.entries(yearMap).map(([k, v]) => [v, k]));


const kontextKeys = {
    mapillary: "m",
    maxspeed: "s",
    hvs: "h",
    movebis: "b",
    schools: "k",   // 'k' for kindergartens/schools
    health: "e",    // 'e' for health Einrichtungen
    playgrounds: "p",
    terrain: "t",
    hillshade: "i"
};
const reverseKontextKeys = Object.fromEntries(Object.entries(kontextKeys).map(([k, v]) => [v, k]));





export const Permalink = {
    // parse() {
    //     const params = new URLSearchParams(window.location.search);
    //     return {
    //         lat: parseFloat(params.get("lat")),
    //         lng: parseFloat(params.get("lng")),
    //         zoom: parseFloat(params.get("zoom")),
    //         style: params.get("style"),
    //         filters: params.get("filters")?.split("|") || [],
    //         scenarios: params.get("scenarios")?.split("_").filter(Boolean) || []
    //     };
    // },
    // parse() {
    //     const params = new URLSearchParams(window.location.search);
    //     const p = params.get("p");

    //     if (!p) {
    //         return {
    //             lat: undefined,
    //             lng: undefined,
    //             zoom: undefined,
    //             style: undefined,
    //             filters: [],
    //             scenarios: []
    //         };
    //     }

    //     const [latStr, lngStr, zoomStr, styleShort, filtersRaw, scenariosRaw] = p.split(",");

    //     const styleMap = {
    //         U: "UKATEGORIE",
    //         B: "BETEILIGUNG",
    //         J: "UJAHR",
    //         T: "UTYP1",
    //         A: "UART"
    //     };

    //     // return {
    //     //     lat: parseFloat(latStr),
    //     //     lng: parseFloat(lngStr),
    //     //     zoom: parseFloat(zoomStr),
    //     //     style: styleMap[styleShort] || "UKATEGORIE",
    //     //     filters: filtersRaw?.split("|") || [],
    //     //     scenarios: scenariosRaw?.split("_").filter(Boolean) || []
    //     // };
    //     const [ukat, beteiligungRaw, ujahrRaw, utyp, uart] = filtersRaw?.split("|") || [];

    //     const decodedBeteiligung = beteiligungRaw
    //         ?.split("_")
    //         .map(code => reverseBeteiligungMap[code])
    //         .filter(Boolean)
    //         .join("_");

    //     const decodedUjahr = ujahrRaw
    //         ?.split("_")
    //         .map(code => reverseYearMap[code])
    //         .filter(Boolean)
    //         .join("_");

    //     return {
    //         lat: parseFloat(latStr),
    //         lng: parseFloat(lngStr),
    //         zoom: parseFloat(zoomStr),
    //         style: styleMap[styleShort] || "UKATEGORIE",
    //         filters: [ukat, decodedBeteiligung, decodedUjahr, utyp, uart],
    //         scenarios: scenariosRaw?.split("_").filter(Boolean) || []
    //     };

    // },
    parse() {
        const params = new URLSearchParams(window.location.search);
        const p = params.get("p");

        if (!p) {
            return {
                lat: undefined,
                lng: undefined,
                zoom: undefined,
                style: undefined,
                filters: [],
                scenarios: [],
                kontext: []
            };
        }

        const [latStr, lngStr, zoomStr, styleShort, filtersRaw, scenariosRaw = "", kontextRaw = ""] = p.split(",");

        const styleMap = {
            U: "UKATEGORIE",
            B: "BETEILIGUNG",
            J: "UJAHR",
            T: "UTYP1",
            A: "UART"
        };

        const [ukat, beteiligungRaw, ujahrRaw, utyp, uart] = filtersRaw?.split("|") || [];

        const decodedBeteiligung = beteiligungRaw
            ?.split("_")
            .map(code => reverseBeteiligungMap[code])
            .filter(Boolean)
            .join("_");

        const decodedUjahr = ujahrRaw
            ?.split("_")
            .map(code => reverseYearMap[code])
            .filter(Boolean)
            .join("_");

        const kontext = kontextRaw.split("").map(char => reverseKontextKeys[char]).filter(Boolean);

        return {
            lat: parseFloat(latStr),
            lng: parseFloat(lngStr),
            zoom: parseFloat(zoomStr),
            style: styleMap[styleShort] || "UKATEGORIE",
            filters: [ukat, decodedBeteiligung, decodedUjahr, utyp, uart],
            scenarios: scenariosRaw?.split("_").filter(Boolean) || [],
            kontext
        };
    },


    // stringify({ lat, lng, zoom, style, filters, scenarios }) {
    //     const params = new URLSearchParams({
    //         lat: Number(lat || 0).toFixed(5),
    //         lng: Number(lng || 0).toFixed(5),
    //         zoom: Number(zoom || 0).toFixed(2),
    //         style,
    //         filters: filters.join("|"),
    //         scenarios: (scenarios && scenarios.length) ? scenarios.join("_") : ""
    //     });
    //     history.replaceState(null, "", `?${params.toString()}`);
    // }

    // stringify({ lat, lng, zoom, style, filters, scenarios }) {
    //     const styleShort = {
    //         UKATEGORIE: "U",
    //         BETEILIGUNG: "B",
    //         UJAHR: "J",
    //         UTYP1: "T",
    //         UART: "A"
    //     }[style] || "U"; // fallback

    //     const filterParam = filters.join("|");
    //     const scenarioParam = scenarios?.join("_") || "";

    //     const query = [
    //         Number(lat || 0).toFixed(5),
    //         Number(lng || 0).toFixed(5),
    //         Number(zoom || 0).toFixed(2),
    //         styleShort,
    //         filterParam,
    //         scenarioParam
    //     ].join(",");

    //     history.replaceState(null, "", `?p=${query}`);
    // }

    stringify({ lat, lng, zoom, style, filters, scenarios, kontext = [] }) {
        const styleShort = {
            UKATEGORIE: "U",
            BETEILIGUNG: "B",
            UJAHR: "J",
            UTYP1: "T",
            UART: "A"
        }[style] || "U";

        const filterParam = filters.join("|");
        const scenarioParam = scenarios?.join("_") || "";
        const kontextParam = kontext.map(k => kontextKeys[k]).join("") || "";

        const query = [
            Number(lat || 0).toFixed(5),
            Number(lng || 0).toFixed(5),
            Number(zoom || 0).toFixed(2),
            styleShort,
            filterParam,
            scenarioParam,
            kontextParam
        ].join(",");

        history.replaceState(null, "", `?p=${query}`);
    }


};


export function applyPermalink(map, paintStyles, updateLayerFilter, updateVisibleFeatureCount, isInitializingRef) {
    const { lat, lng, zoom, style, filters, scenarios, kontext } = Permalink.parse();

    // if (!lat && !lng && !zoom && !style && filters.length === 0 && scenarios.length === 0) {
    const params = new URLSearchParams(window.location.search);
    if (!params.has("p")) {
        // const defaultFilters = [
        //     Object.keys(paintStyles.UKATEGORIE.colors).join("_"),
        //     Object.keys(paintStyles.BETEILIGUNG.colors).join("_"),
        //     Object.keys(paintStyles.UJAHR.colors).join("_"),
        //     Object.keys(paintStyles.UTYP1.colors).join("_"),
        //     Object.keys(paintStyles.UART.colors).join("_")
        // ];

        const defaultFilters = [
    Object.keys(paintStyles.UKATEGORIE.colors).join("_"),
    Object.keys(paintStyles.BETEILIGUNG.colors)
        .map(field => beteiligungMap[field] || field)
        .join("_"),
    Object.keys(paintStyles.UJAHR.colors)
        .map(year => yearMap[year] || year)
        .join("_"),
    Object.keys(paintStyles.UTYP1.colors).join("_"),
    Object.keys(paintStyles.UART.colors).join("_")
];

        // Permalink.stringify({
        //     lat: 52.40709,
        //     lng: 12.54972,
        //     zoom: 12.00,
        //     style: "UKATEGORIE",
        //     filters: defaultFilters,
        //     scenarios: []
        // });

        // return;

        const defaultPermalink = {
            lat: 52.40709,
            lng: 12.54972,
            zoom: 12.00,
            style: "UKATEGORIE",
            filters: defaultFilters,
            scenarios: [],
            kontext: []
        };

        // Permalink.stringify(defaultPermalink);

        // // 🔥 Also apply it immediately
        // applyPermalink(map, paintStyles, updateLayerFilter, updateVisibleFeatureCount, isInitializingRef);

        Permalink.stringify(defaultPermalink);

// ⏳ wait one tick for URL to update
setTimeout(() => {
  applyPermalink(map, paintStyles, updateLayerFilter, updateVisibleFeatureCount, isInitializingRef);
}, 0);

        return;
    }

    isInitializingRef.value = true;

    const [ukat, beteiligung, ujahr, utyp, uart] = filters;

    if (!isNaN(lat) && !isNaN(lng)) map.setCenter([lng, lat]);
    if (!isNaN(zoom)) map.setZoom(zoom);
    if (style) {
        document.querySelector(`input[name="color-style"][value="${style}"]`)?.click();
    }

    document.querySelectorAll('.legend input[type=checkbox], .legend input[data-field]').forEach(cb => {
        cb.checked = false;
    });

    ukat?.split("_").forEach(val => {
        document.querySelector(`input[data-group="UKATEGORIE"][value="${val}"]`)?.click();
    });
    ujahr?.split("_").forEach(val => {
        document.querySelector(`input[data-group="UJAHR"][value="${val}"]`)?.click();
    });
    uart?.split("_").forEach(val => {
        document.querySelector(`input[data-group="UART"][value="${val}"]`)?.click();
    });
    utyp?.split("_").forEach(val => {
        document.querySelector(`input[data-group="UTYP1"][value="${val}"]`)?.click();
    });
    beteiligung?.split("_").forEach(field => {
        document.querySelector(`input[data-field="${field}"]`)?.click();
    });

    // Apply scenarios
    document.querySelectorAll('input[name="scenario"]').forEach(cb => {
        cb.checked = false;
    });
    scenarios.forEach(scenario => {
        document.querySelector(`input[name="scenario"][value="${scenario}"]`)?.click();
    });

    updateLayerFilter(false, true);
    updateVisibleFeatureCount();

    setTimeout(() => {
        isInitializingRef.value = false;
    }, 0);

    // kontext.forEach(id => {
    //     const cb = document.getElementById(`toggle-${id}`);
    //     if (cb) cb.checked = true;
    // });
    // Apply Kontext checkboxes
    kontext.forEach(id => {
        const cb = document.getElementById(`toggle-${id}`);
        if (cb) {
            cb.checked = true;
            cb.dispatchEvent(new Event("change")); // ✅ this line is crucial
        }
    });
}


export function updatePermalink(map, isInitializingRef) {
    if (isInitializingRef.value) return;

    const center = map.getCenter();
    const zoom = map.getZoom();
    const style = document.querySelector('input[name="color-style"]:checked')?.value;

    const getCheckedValues = selector =>
        Array.from(document.querySelectorAll(selector))
            .filter(cb => cb.checked)
            .map(cb => cb.value)
            .join("_");

    const ukat = getCheckedValues('input[type=checkbox][data-group="UKATEGORIE"]');
    // const ujahr = getCheckedValues('input[type=checkbox][data-group="UJAHR"]');
    const utyp = getCheckedValues('input[type=checkbox][data-group="UTYP1"]');
    const uart = getCheckedValues('input[type=checkbox][data-group="UART"]');
    // const beteiligung = Array.from(document.querySelectorAll('input[data-field]'))
    //     .filter(cb => cb.checked)
    //     .map(cb => cb.dataset.field)
    //     .join("_");

    const ujahr = getCheckedValues('input[type=checkbox][data-group="UJAHR"]')
        .split("_")
        .map(y => yearMap[y] || y)
        .join("_");

    // const beteiligung = Array.from(document.querySelectorAll('input[data-field]'))
    //     .filter(cb => cb.checked)
    //     .map(cb => beteiligungMap[cb.dataset.field])
    //     .join("_");

    // const beteiligung = Array.from(document.querySelectorAll('input[data-field]'))
    // .filter(cb => cb.checked)
    // .map(cb => cb.dataset.field)
    // .join("_");

    const beteiligung = Array.from(document.querySelectorAll('input[data-field]'))
    .filter(cb => cb.checked)
    .map(cb => beteiligungMap[cb.dataset.field] || cb.dataset.field)  // <-- apply mapping
    .join("_");

    // Get checked scenarios
    const scenarios = Array.from(document.querySelectorAll('input[name="scenario"]:checked'))
        .map(cb => cb.value);

    const kontext = Object.keys(kontextKeys).filter(key => {
        const el = document.getElementById(`toggle-${key}`);
        return el?.checked;
    });

    const filterParam = [
        ukat,
        beteiligung,
        ujahr,
        utyp,
        uart
    ].join("|");

    Permalink.stringify({
        lat: center.lat,
        lng: center.lng,
        zoom,
        style,
        filters: filterParam.split("|"),
        scenarios,
        kontext
    });
}
