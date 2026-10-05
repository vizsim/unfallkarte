export const paintStyles = {
  UKATEGORIE: {
    field: "UKATEGORIE",
    colors: {
      1: "#e41a1c",
      2: "#377eb8",
      3: "#4daf4a",
    }
  },
  UJAHR: {
    field: "UJAHR",
    colors: {
      2017: "#f7fbff",
      2018: "#deebf7",
      2019: "#c6dbef",
      2020: "#9ecae1",
      2021: "#6baed6",
      2022: "#4292c6",
      2023: "#2171b5",
      2024: "#08519c",
      2025: "#08306b",
    }
  },
  UART: {
    field: "UART",
    colors: {
      1: "#1b9e77",
      2: "#d95f02",
      3: "#7570b3",
      4: "#e7298a",
      5: "#66a61e",
      6: "#e6ab02",
      7: "#a6761d",
      8: "#666666",
      9: "#1f78b4",
      0: "#bbbbbb"
    }
  },
  UTYP1: {
    field: "UTYP1",
    colors: {
      1: "#8dd3c7",
      2: "#ffffb3",
      3: "#bebada",
      4: "#fb8072",
      5: "#80b1d3",
      6: "#fdb462",
      7: "#b3de69"
    }
  },
  BETEILIGUNG: {
    field: null,
    colors: {
      IstRad: "#1f78b4",
      IstPKW: "#33a02c",
      IstFuss: "#e31a1c",
      IstKrad: "#ff7f00",
      IstGkfz: "#a65628",
      IstSonstig: "#6a3d9a"
    }
  }
};

export function getCircleColorPaint(styleKey) {
  const style = paintStyles[styleKey];
  const matchExpr = ["case"];

  if (styleKey === "BETEILIGUNG") {
    for (const [field, color] of Object.entries(style.colors)) {
      matchExpr.push(["==", ["get", field], 1], color);
    }
    matchExpr.push("#aaaaaa");
    return matchExpr;
  }

  const match = ["match", ["get", style.field]];
  for (const [val, color] of Object.entries(style.colors)) {
    match.push(parseInt(val), color);
  }
  match.push("#aaaaaa");
  return match;
}

// Tempolimit-Farben (OSM maxspeed) als Stützstellen: die Karte (js/layers/traffic-speed.js)
// baut daraus ihren MapLibre-Ausdruck, die Report-Karte (js/report/render/svgMap.js) rechnet
// dieselbe Farbe in JS. Eine Quelle, damit beide nie auseinanderlaufen.
export const SPEED_COLOR_STOPS = [[10, "#006400"], [30, "#31a354"], [50, "#fdcc8a"], [100, "#e31a1c"], [140, "#8B0000"]];
export const SPEED_COLOR_SPECIAL = {
  none: "#000000",      // maxspeed=none (unbegrenzt)
  urban: "#fdcc8a",     // ohne Wert, maxspeed:type=DE:urban (≈ 50)
  rural: "#e31a1c",     // ohne Wert, maxspeed:type=DE:rural (≈ 100)
  unknown: "#ff69b4",   // keine Angabe in OSM
};

/** Farbe zu einem Tempo wie MapLibres lineare RGB-Interpolation über SPEED_COLOR_STOPS. */
export function speedColorOf(v) {
  const stops = SPEED_COLOR_STOPS;
  if (!Number.isFinite(v)) return SPEED_COLOR_SPECIAL.unknown;
  if (v <= stops[0][0]) return stops[0][1];
  if (v >= stops.at(-1)[0]) return stops.at(-1)[1];
  const i = stops.findIndex(([s]) => s >= v);
  const [s0, c0] = stops[i - 1];
  const [s1, c1] = stops[i];
  const t = (v - s0) / (s1 - s0);
  const rgb = (c) => [1, 3, 5].map((k) => parseInt(c.slice(k, k + 2), 16));
  const [a, b] = [rgb(c0), rgb(c1)];
  return `#${a.map((x, k) => Math.round(x + (b[k] - x) * t).toString(16).padStart(2, "0")).join("")}`;
}
