
import { setDrawOrder, entryLayerIds } from "../layers/registry.js";

export function addLayers(map) {

  // LAYERS – ggf. aufräumen/splitten später (siehe vorherige Ideen)

  function addAccidentLayersToMap(map) {

    function add({ sourceId, minzoom, maxzoom }) {
      map.addLayer({
        id: `accident-points`,
        type: "circle",
        source: sourceId,
        "source-layer": "accidents",
        minzoom,
        maxzoom,
        // Start versteckt: erst updateLayerFilter() schaltet sichtbar, wenn eine Auswahl
        // existiert -> kein Laden der accidents_single-Tiles bei leerer Auswahl.
        layout: { visibility: "none" },
        paint: {
          "circle-radius": [
            "interpolate", // interpolate ciclesize based on zoom
            ["linear"],
            ["zoom"],
            0, 3,      // zoom 0: radius 3
            12, 4,     // zoom 12: radius 4
            14, 7,
            16, 10,
            18, 14,
            19, 30
          ],
          "circle-color": [
            "match",
            ["get", "UKATEGORIE"],
            1, "#e41a1c",
            2, "#377eb8",
            3, "#4daf4a",
            "#aaaaaa"
          ],
          "circle-opacity": 0.6,
          "circle-stroke-color": "#000",
          "circle-stroke-width": 0.1
        }
      });



      map.addLayer({
        id: `beteiligung-symbols`,
        type: "symbol",
        source: sourceId,
        "source-layer": "accidents",
        minzoom,
        maxzoom,
        layout: {
          "text-field": ["concat",
            ["case", ["==", ["get", "IstRad"], 1], "R", ""],
            ["case", ["all", ["==", ["get", "IstRad"], 1], ["==", ["get", "IstPKW"], 1]], ", ", ""],
            ["case", ["==", ["get", "IstPKW"], 1], "P", ""],
            ["case", ["any", ["all", ["==", ["get", "IstFuss"], 1], ["any", ["==", ["get", "IstRad"], 1], ["==", ["get", "IstPKW"], 1]]]], ", ", ""],
            ["case", ["==", ["get", "IstFuss"], 1], "F", ""],
            ["case", ["any", ["all", ["==", ["get", "IstKrad"], 1], ["any", ["==", ["get", "IstRad"], 1], ["==", ["get", "IstPKW"], 1], ["==", ["get", "IstFuss"], 1]]]], ", ", ""],
            ["case", ["==", ["get", "IstKrad"], 1], "K", ""],
            ["case", ["any", ["all", ["==", ["get", "IstGkfz"], 1], ["any", ["==", ["get", "IstRad"], 1], ["==", ["get", "IstPKW"], 1], ["==", ["get", "IstFuss"], 1], ["==", ["get", "IstKrad"], 1]]]], ", ", ""],
            ["case", ["==", ["get", "IstGkfz"], 1], "G", ""],
            ["case", ["any", ["all", ["==", ["get", "IstSonstig"], 1], ["any", ["==", ["get", "IstRad"], 1], ["==", ["get", "IstPKW"], 1], ["==", ["get", "IstFuss"], 1], ["==", ["get", "IstKrad"], 1], ["==", ["get", "IstGkfz"], 1]]]], ", ", ""],
            ["case", ["==", ["get", "IstSonstig"], 1], "S", ""]
          ],
          // OpenFreeMap-Glyphs liefern nur "Noto Sans Regular"; ohne explizites text-font
          // fällt MapLibre auf "Open Sans Regular" zurück -> Glyph-404 -> kein Text.
          "text-font": ["Noto Sans Regular"],
          "text-size": 14,
          "text-offset": [0, 0],
          "text-anchor": "top",
          "text-allow-overlap": true,
          "text-ignore-placement": true,
          "visibility": "none"
        },
        paint: {
          "text-color": "#000"
        }
      });
    }

    // add({ idSuffix: "11-12", sourceId: "accidents_11-12", minzoom: 11, maxzoom: 12 });
    // add({ idSuffix: "12-13", sourceId: "accidents_12-13", minzoom: 12, maxzoom: 20.1 });

    add({ sourceId: "accidents_single", minzoom: 11, maxzoom: 20.1 });



  }





  /// Pie Charts for AccidnetClusters

  function addAccidentClusterLayers(map) {
    const sharedIconSizeExpression = [
      "interpolate", ["linear"], [
        "+",
        ["get", "UKATEGORIE__1"],
        ["get", "UKATEGORIE__2"],
        ["get", "UKATEGORIE__3"]
      ],
      1, 0.1,
      4, 0.2,
      10, 0.35,
      50, 0.4,
      100, 0.5,
      500, 0.55,
      1000, 0.6,
      5000, 0.7,
      10000, 0.75,
      20000, 0.8,
      40000, 0.9
    ];

    const clusterLayers = [
      { id: "pie-clusters-fine-layer", sourceLayer: "clusters_9_11", minzoom: 9, maxzoom: 11 },
      { id: "pie-clusters-coarse-layer", sourceLayer: "clusters_6_8", minzoom: 6, maxzoom: 9 }
    ];

    for (const { id, sourceLayer, minzoom, maxzoom } of clusterLayers) {
      map.addLayer({
        id,
        type: "symbol",
        source: "accidents-cluster",
        "source-layer": sourceLayer,
        minzoom,
        maxzoom,
        layout: {
          "icon-image": [
            "concat",
            "pie-",
            ["to-string", ["get", "UKATEGORIE__1"]], "-",
            ["to-string", ["get", "UKATEGORIE__2"]], "-",
            ["to-string", ["get", "UKATEGORIE__3"]]
          ],
          "icon-size": sharedIconSizeExpression,
          "icon-allow-overlap": true,
          "symbol-sort-key": [
            "-",
            ["/", ["get", "UKATEGORIE__3"],
              ["+", ["get", "UKATEGORIE__1"],
                ["get", "UKATEGORIE__2"],
                ["get", "UKATEGORIE__3"]]]
          ]
        }
      });
    }

    map.addLayer({
      id: "hover-pie",
      type: "symbol",
      source: "hover-point",
      layout: {
        "icon-image": [
          "concat",
          "pie-",
          ["to-string", ["get", "UKATEGORIE__1"]], "-",
          ["to-string", ["get", "UKATEGORIE__2"]], "-",
          ["to-string", ["get", "UKATEGORIE__3"]]
        ],
        "icon-size": 1,
        "icon-allow-overlap": true
      }
    });
  }























  // // Maxspeed layers




  // // Maxspeed layers MINOR
















  /// LAERM























  function addMapillaryTSLayer(map) {
    map.addLayer({
      id: "mapillary-ts",
      type: "symbol",
      source: "mapillary-traffic_signs",
      "source-layer": "traffic_sign",
      minzoom: 14,
      maxzoom: 21,
      layout: {
        //visibility: "none",
        visibility: "visible",

        // 👇 switch icon based on amenity value
        "icon-image": [
          "match",
          ["get", "value"],

          // radverkehr
          "regulatory--bicycles-only--g1", "regulatory--bicycles-only--g1", // 237
          "regulatory--shared-path-pedestrians-and-bicycles--g1", "regulatory--shared-path-pedestrians-and-bicycles--g1",   // 240
          "regulatory--dual-path-pedestrians-and-bicycles--g1", "regulatory--dual-path-pedestrians-and-bicycles--g1",   // 241
          "regulatory--dual-path-bicycles-and-pedestrians--g1", "regulatory--dual-path-bicycles-and-pedestrians--g1",   // 241

          // speed limits
          "regulatory--maximum-speed-limit-30--g1", "regulatory--maximum-speed-limit-30--g1", // 274-30
          "regulatory--maximum-speed-limit-50--g1", "regulatory--maximum-speed-limit-50--g1", // 274-50
          "regulatory--maximum-speed-limit-70--g1", "regulatory--maximum-speed-limit-70--g1", // 274-70
          "regulatory--maximum-speed-limit-80--g1", "regulatory--maximum-speed-limit-80--g1", // 274-80
          "regulatory--maximum-speed-limit-100--g1", "regulatory--maximum-speed-limit-100--g1", // 274-100

          "home"                    // default fallback icon
        ],

        //"icon-image": ["get", "value"],  // 👈 Dynamisch
        "icon-size": [
          "interpolate",
          ["linear"],
          ["zoom"],
          10, 0.6,
          14, 1,
          16, 1.5
        ],
        "icon-allow-overlap": true //,
        // "icon-ignore-placement": true,
        // "icon-optional": true
      },
      filter: ["==", ["geometry-type"], "Point"],
    });
  }









  function addMapillaryLayer(map) {
    // ⬇️ Soft halo for pano
    map.addLayer({
      id: "mapillary-images-halo",
      type: "circle",
      source: "mapillary-images",
      "source-layer": "image",
      minzoom: 14,
      maxzoom: 21,
      layout: {
        visibility: "none"
      },
      filter: ["==", ["to-string", ["get", "is_pano"]], "true"],
      paint: {
        "circle-color": "#0077ff",
        "circle-radius": [
          "interpolate", ["linear"], ["zoom"],
          14, 6,
          15, 8,
          17, 10
        ],
        "circle-opacity": 0.3
      }
    });

    // ⬆️ Main circle on top
    map.addLayer({
      id: "mapillary-images-layer",
      type: "circle",
      source: "mapillary-images",
      "source-layer": "image",
      minzoom: 14,
      maxzoom: 21,
      layout: {
        visibility: "none"
      },
      paint: {
        "circle-color": [
          "match",
          ["to-string", ["get", "is_pano"]],
          "true", "#0077ff",
          "false", "#00b955",
          "#999999"
        ],
        "circle-radius": [
          "interpolate", ["linear"], ["zoom"],
          14, 3,
          16, 4,
          17, 5
        ]
      }
    });
  }

  // map.moveLayer("mapillary-images-halo", "mapillary-images-layer");




  // (Alte Raster-Layer satellite-layer/hillshade-layer entfernt — Basemaps/Terrain
  //  kommen jetzt keyless aus js/map/basemapTerrain.js.)






  // Zeichenreihenfolge (unten zuerst). Strings = Einträge der Layer-Registry (js/layers/):
  // sie werden hier NICHT angelegt, sondern lazy beim ersten Einschalten (ensureEntry) — ihr
  // Platz in der Reihenfolge steht aber fest. Funktionen = sofort angelegte Layer (Unfälle,
  // Cluster, Mapillary); ihre Layer-IDs dienen den Lazy-Layern als beforeId-Anker.
  // tests/web/golden.spec.js hält die resultierende Reihenfolge fest.
  const DRAW_ORDER = [
    "population", // Flächen ganz unten: alles andere liegt darüber
    "schools", "health", "playgrounds", "crossings", "platforms",
    addAccidentLayersToMap, addAccidentClusterLayers,
    "scenario1", "scenario2", "scenario3", "scenario6", "scenario8", "scenario9",
    "maxspeed", "movebis", "obs",
    "hvs", "svz", // SVZ-Verkehrsmengen ÜBER dem groben hvs-Fallback
    "laerm1", "laerm2", "uspeed", "telraam",
    addMapillaryLayer, addMapillaryTSLayer,
  ];
  setDrawOrder(DRAW_ORDER.map((step) => {
    if (typeof step === "string") return { entryId: step, layerIds: entryLayerIds(step) };
    const before = new Set(map.getLayersOrder());
    step(map);
    return { layerIds: map.getLayersOrder().filter((id) => !before.has(id)) };
  }));
}
