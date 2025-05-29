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
