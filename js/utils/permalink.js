// Cleaned permalink.js

export const beteiligungMap = {
    IstRad: "1",
    IstPKW: "2",
    IstFuss: "3",
    IstKrad: "4",
    IstGkfz: "5",
    IstSonstig: "6"
};

export const yearMap = {
    2017: "17",
    2018: "18",
    2019: "19",
    2020: "20",
    2021: "21",
    2022: "22",
    2023: "23"
};

export const kontextKeys = {
    mapillary: "m",
    maxspeed: "s",
    hvs: "h",
    movebis: "b",
    schools: "k",
    health: "e",
    playgrounds: "p",
    terrain: "t",
    hillshade: "i",
    obs: "o",
    laerm1: "l",
    laerm2: "r",
    uspeed: "u",
};

const reverse = obj => Object.fromEntries(Object.entries(obj).map(([k, v]) => [v, k]));
const reverseBeteiligungMap = reverse(beteiligungMap);
const reverseYearMap = reverse(yearMap);
const reverseKontextKeys = reverse(kontextKeys);

const styleShortMap = {
    UKATEGORIE: "U",
    BETEILIGUNG: "B",
    UJAHR: "J",
    UTYP1: "T",
    UART: "A"
};
const reverseStyleMap = reverse(styleShortMap);

export const encodeList = (list, map) => list.map(item => map[item] || item).join("_");
const decodeList = (str, reverseMap) => (str || "").split("_").map(code => reverseMap[code]).filter(Boolean).join("_");

export const Permalink = {
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
        const [ukat, beteiligungRaw, ujahrRaw, utyp, uart] = filtersRaw?.split("|") || [];

        return {
            lat: parseFloat(latStr),
            lng: parseFloat(lngStr),
            zoom: parseFloat(zoomStr),
            style: reverseStyleMap[styleShort] || "UKATEGORIE",
            filters: [
                ukat,
                decodeList(beteiligungRaw, reverseBeteiligungMap),
                decodeList(ujahrRaw, reverseYearMap),
                utyp,
                uart
            ],
            scenarios: scenariosRaw.split("_").filter(Boolean),
            kontext: kontextRaw.split("").map(k => reverseKontextKeys[k]).filter(Boolean)
        };
    },

    stringify({ lat, lng, zoom, style, filters, scenarios, kontext = [] }) {
        const styleShort = styleShortMap[style] || "U";
        const filterParam = filters.join("|");
        const scenarioParam = scenarios.join("_") || "";
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

    isInitializingRef.value = true;
    const [ukat, beteiligung, ujahr, utyp, uart] = filters;

    if (!isNaN(lat) && !isNaN(lng)) map.setCenter([lng, lat]);
    if (!isNaN(zoom)) map.setZoom(zoom);
    if (style) document.querySelector(`input[name="color-style"][value="${style}"]`)?.click();

    document.querySelectorAll('.legend input[type=checkbox], .legend input[data-field]').forEach(cb => cb.checked = false);

    const checkInputs = (group, values) => values?.split("_").forEach(val => {
        document.querySelector(`input[data-group="${group}"][value="${val}"]`)?.click();
    });

    checkInputs("UKATEGORIE", ukat);
    checkInputs("UJAHR", ujahr);
    checkInputs("UART", uart);
    checkInputs("UTYP1", utyp);
    beteiligung?.split("_").forEach(field => {
        document.querySelector(`input[data-field="${field}"]`)?.click();
    });

    document.querySelectorAll('input[name="scenario"]').forEach(cb => cb.checked = false);
    scenarios.forEach(s => document.querySelector(`input[name="scenario"][value="${s}"]`)?.click());

    kontext.forEach(id => {
        const cb = document.getElementById(`toggle-${id}`);
        if (cb) {
            cb.checked = true;
            cb.dispatchEvent(new Event("change"));
        }
    });

    updateLayerFilter(false, true);
    updateVisibleFeatureCount();
    setTimeout(() => isInitializingRef.value = false, 0);
}

export function updatePermalink(map, isInitializingRef) {
    if (isInitializingRef.value) return;

    const getCheckedValues = selector => Array.from(document.querySelectorAll(selector))
        .filter(cb => cb.checked).map(cb => cb.value);

    const center = map.getCenter();
    const zoom = map.getZoom();
    const style = document.querySelector('input[name="color-style"]:checked')?.value;

    const filters = [
        encodeList(getCheckedValues('input[data-group="UKATEGORIE"]'), {}),
        encodeList(
            Array.from(document.querySelectorAll('input[data-field]'))
                .filter(cb => cb.checked)
                .map(cb => cb.dataset.field),
            beteiligungMap
        ),
        encodeList(getCheckedValues('input[data-group="UJAHR"]'), yearMap),
        encodeList(getCheckedValues('input[data-group="UTYP1"]'), {}),
        encodeList(getCheckedValues('input[data-group="UART"]'), {})
    ];

    const scenarios = getCheckedValues('input[name="scenario"]');
    const kontext = Object.keys(kontextKeys).filter(k => document.getElementById(`toggle-${k}`)?.checked);

    Permalink.stringify({
        lat: center.lat,
        lng: center.lng,
        zoom,
        style,
        filters,
        scenarios,
        kontext
    });
}


export function cleanupLegacyPermalink() {
  const url = new URL(window.location.href);
  const params = url.searchParams;

  const legacyParams = ["lat", "lng", "zoom", "style", "filters", "scenarios"];
  const hasLegacy = legacyParams.some(param => params.has(param));
  const hasCompact = params.has("p");

  if (!hasCompact && hasLegacy) {
    legacyParams.forEach(param => params.delete(param));
    url.search = params.toString();
    history.replaceState(null, "", url.toString());
  }
}