// permalink.js

export const Permalink = {
    parse() {
        const params = new URLSearchParams(window.location.search);
        return {
            lat: parseFloat(params.get("lat")),
            lng: parseFloat(params.get("lng")),
            zoom: parseFloat(params.get("zoom")),
            style: params.get("style"),
            filters: params.get("filters")?.split("|") || []
        };
    },

    stringify({ lat, lng, zoom, style, filters }) {
        const params = new URLSearchParams({
            lat: Number(lat || 0).toFixed(5),
            lng: Number(lng || 0).toFixed(5),
            zoom: Number(zoom || 0).toFixed(2),
            style,
            filters: filters.join("|")
        });
        history.replaceState(null, "", `?${params.toString()}`);
    }
};


export function applyPermalink(map, paintStyles, updateLayerFilter, updateVisibleFeatureCount, isInitializingRef) {
    const { lat, lng, zoom, style, filters } = Permalink.parse();

    if (!lat && !lng && !zoom && !style && filters.length === 0) {
        const defaultFilters = [
            Object.keys(paintStyles.UKATEGORIE.colors).join("_"),
            Object.keys(paintStyles.BETEILIGUNG.colors).join("_"),
            Object.keys(paintStyles.UJAHR.colors).join("_"),
            Object.keys(paintStyles.UTYP1.colors).join("_"),
            Object.keys(paintStyles.UART.colors).join("_")
        ];

        Permalink.stringify({
            lat: 52.40709,
            lng: 12.54972,
            zoom: 12.00,
            style: "UKATEGORIE",
            filters: defaultFilters
        });

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

    updateLayerFilter(false, true);
    updateVisibleFeatureCount();

    setTimeout(() => {
        isInitializingRef.value = false;
    }, 0);
}


export function updatePermalink(map, isInitializingRef) {
    if (isInitializingRef.value) return;

    const center = map.getCenter();
    //const zoom = map.getZoom().toFixed(2);
    const zoom = map.getZoom(); // Rohwert, noch nicht .toFixed
    const style = document.querySelector('input[name="color-style"]:checked')?.value;

    const getCheckedValues = selector =>
        Array.from(document.querySelectorAll(selector))
            .filter(cb => cb.checked)
            .map(cb => cb.value)
            .join("_");

    const ukat = getCheckedValues('input[type=checkbox][data-group="UKATEGORIE"]');
    const ujahr = getCheckedValues('input[type=checkbox][data-group="UJAHR"]');
    const utyp = getCheckedValues('input[type=checkbox][data-group="UTYP1"]');
    const uart = getCheckedValues('input[type=checkbox][data-group="UART"]');
    const beteiligung = Array.from(document.querySelectorAll('input[data-field]'))
        .filter(cb => cb.checked)
        .map(cb => cb.dataset.field)
        .join("_");

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
        filters: filterParam.split("|")
    });
}
