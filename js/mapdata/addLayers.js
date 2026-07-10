
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




  // add Movebis layer
  function addMovebisLayer(map) {
    map.addLayer({
      id: "movebis",
      minzoom: 9,
      type: "line",
      source: "movebis",
      "source-layer": "links",
      layout: { visibility: "none" },
      paint: {
        "line-color": [
          "interpolate",
          ["linear"],
          ["get", "avg_speed_kmh"],
          12, "#e31a1c",
          18, "#fdcc8a",
          24, "#31a354"
        ],
        // Breite = visits-basiert, zusätzlich bei niedrigem Zoom global schmaler
        // (z9 ~35 % → z14 volle Breite). Zoom MUSS die äußerste Interpolate sein
        // (MapLibre erlaubt ["zoom"] nur top-level) → visits-Rampe je Zoom-Stop skaliert.
        "line-width": [
          "interpolate", ["linear"], ["zoom"],
          9, ["interpolate", ["linear"], ["get", "visits"], 0, 0.2, 10, 0.7, 50, 1.4, 100, 2.8, 1000, 4.2],
          14, ["interpolate", ["linear"], ["get", "visits"], 0, 0.5, 10, 2, 50, 4, 100, 8, 1000, 12]
        ]
      }
    });
  }


  // add OBS layer
  function addOBSLayer(map) {
    map.addLayer({
      id: "obs",
      minzoom: 9,
      type: "circle",
      source: "obs",
      "source-layer": "obs_data-points",
      layout: { visibility: "none" },
      filter: [">=", ["to-number", ["get", "distance_overtaker"]], 0.2],
      paint: {
        "circle-color": [
          "case",

          // --- Urban color ramp ---
          ["==", ["get", "zone"], "urban"],
          [
            "interpolate",
            ["linear"],
            ["to-number", ["get", "distance_overtaker"]],
            1.1, "#67000d",   // very dark red
            1.3, "#ef3b2c",   // red
            1.5, "#fdbf6f",   // yellow
            1.7, "#a1d99b",   // light green
            1.9, "#31a354"    // green
          ],

          // --- Rural color ramp ---
          ["==", ["get", "zone"], "rural"],
          [
            "interpolate",
            ["linear"],
            ["to-number", ["get", "distance_overtaker"]],
            1.6, "#67000d",   // very dark red
            1.8, "#ef3b2c",   // red
            2.0, "#fdbf6f",   // yellow
            2.2, "#a1d99b",   // light green
            2.4, "#31a354"    // green
          ],

          // --- Fallback color ---
          "#cccccc"
        ],
        "circle-radius": 4
      }
    });
  }






  // UBA-Hauptverkehrsstraßen (Verkehrsmengen): am SVZ ausgerichtet — schwarz, Größe =
  // Tages-DTV≈ (annualTrafficFlow ÷ 365), gleiche Schwellen -> teilt die SVZ-Legende.
  function addHvsLayer(map) {
    map.addLayer({
      id: "hvs",
      minzoom: 9,
      type: "line",
      source: "hvs",
      "source-layer": "lines",
      layout: { visibility: "none", "line-cap": "round", "line-join": "round" },
      paint: {
        "line-color": hvsColorExpr(),
        "line-opacity": 0.9,
        "line-width": hvsWidthExpr()
      }
    });
  }


  // add SVZ Verkehrsmengen layers (echte DTV der Länder + BASt-Backbone A+B).
  // Farbe UND Größe kodieren die Menge (svzColorExpr/svzWidthExpr/svzRadiusExpr,
  // Modus "dtv"|"sv"; setupSvzMode schaltet um). source-layer = Frontend-Vertrag aus
  // svz: svz_de.pmtiles -> `svz` (Linien) + `svz_points` (Punkte BW/SL),
  // svz_bast.pmtiles -> `bast` (Punkte A+B). Liegt ÜBER dem groben hvs-Fallback.
  function addSvzLayers(map) {
    // Länder-Segmente (Zählstellenbereiche, Linien).
    map.addLayer({
      id: "svz-lines",
      minzoom: 9,
      type: "line",
      source: "svz",
      "source-layer": "svz",
      layout: { visibility: "none", "line-cap": "round", "line-join": "round" },
      paint: {
        "line-color": svzColorExpr("dtv"),
        "line-opacity": 0.9,
        "line-width": svzWidthExpr("dtv")
      }
    });

    // Zählstellen-Punkte der Länder (BW/SL als Punkte).
    map.addLayer({
      id: "svz-points",
      minzoom: 9,
      type: "circle",
      source: "svz",
      "source-layer": "svz_points",
      layout: { visibility: "none" },
      paint: {
        "circle-color": svzColorExpr("dtv"),
        "circle-opacity": 0.9,
        "circle-stroke-color": "#ffffff",
        "circle-stroke-width": 0.7,
        "circle-radius": svzRadiusExpr("dtv")
      }
    });

    // BASt-Backbone (Bundesfernstraßen A+B, Punkte) — eigene Quelle svz_bast.
    map.addLayer({
      id: "bast-points",
      minzoom: 9,
      type: "circle",
      source: "svz_bast",
      "source-layer": "bast",
      layout: { visibility: "none" },
      paint: {
        "circle-color": svzColorExpr("dtv"),
        "circle-opacity": 0.9,
        "circle-stroke-color": "#ffffff",
        "circle-stroke-width": 0.7,
        "circle-radius": svzRadiusExpr("dtv")
      }
    });
  }


  function addUspeedLayer(map) {
    //     if (map.getLayer("uspeed")) {
    //   map.removeLayer("uspeed");
    // }

    // === Offset-Funktion (wie bei maxspeed)
    function getZoomBasedOffset_uspeed() {
      return [
        "interpolate", ["linear"], ["zoom"],
        10, 0.5,
        14, 4,
        18, 8,
        20, 12
      ];
    }

    const commonPaint = {
      "line-color": [
        "interpolate", ["linear"],
        ["to-number", ["get", "speed_kph_mean"]],
        10, "#006400",
        30, "#31a354",
        50, "#fdcc8a",
        100, "#e31a1c"
      ],
      "line-width": [
        "interpolate", ["linear"], ["zoom"],
        10, 0.5,
        12, 1.5,
        13, 2.5,
        16, 3.5,
        20, 5
      ]
    };

    // === Layer: forward (kein Offset)
    map.addLayer({
      id: "uspeed-forward",
      type: "line",
      source: "uspeed",
      "source-layer": "uber_movement_osm",
      layout: { visibility: "none" },
      filter: [
        "all",
        ["==", ["to-number", ["get", "hour_of_day"]], 14],
        ["==", ["get", "reconstruction_direction"], "forward2"]
      ],
      paint: {
        ...commonPaint,
        "line-offset": 0
      }
    });

    // === Layer: reverse (mit Zoom-Offset)
    map.addLayer({
      id: "uspeed-reverse",
      type: "line",
      source: "uspeed",
      "source-layer": "uber_movement_osm",
      layout: { visibility: "none" },
      filter: [
        "all",
        ["==", ["to-number", ["get", "hour_of_day"]], 14],
        ["==", ["get", "reconstruction_direction"], "reverse"]
      ],
      paint: {
        ...commonPaint,
        "line-offset": getZoomBasedOffset_uspeed()
      }
    });
  }







  // // Maxspeed layers

  function addMaxspeedLayers(map) {
    // const offsetForward = 3;
    // const offsetBackward = -3;


    function getZoomBasedOffset(direction) {
      const factor = direction === "forward" ? 1 : -1;

      return [
        "interpolate",
        ["linear"],
        ["zoom"],
        10, factor * 1,    // bei Zoom 10: kleiner Abstand
        14, factor * 2,    // mittlerer Zoom: mehr Abstand
        18, factor * 5,    // starker Zoom: mehr Abstand
        20, factor * 8     // maximaler Zoom: großer Abstand
      ];
    }


    // Create dynamic color expression based on the given property
    function makeLineColorExpression(property) {
      return [
        "case",
        ["==", ["get", property], "None"], "#000000",
        ["all", ["!", ["has", property]], ["==", ["get", "maxspeed_type"], "DE:urban"]], "#fdcc8a",
        ["all", ["!", ["has", property]], ["==", ["get", "maxspeed_type"], "DE:rural"]], "#e31a1c",
        ["!", ["has", property]], "#ff69b4",
        ["==", ["get", property], null], "#ff69b4",
        [
          "interpolate", ["linear"],
          ["to-number", ["get", property]],
          10, "#006400",   // dunkelgrün
          30, "#31a354",
          50, "#fdcc8a",
          100, "#e31a1c",
          140, "#8B0000"   // dunkelrot
        ]
      ];
    }

    // Create paint object with optional dash and offset
    function makePaint(property, isDashed, direction = null) {
      const paint = {
        "line-width": [
          "interpolate",
          ["linear"],
          ["zoom"],
          10, 2.5,
          17, 3,
          18, 6,
          20, 10
        ],
        "line-color": makeLineColorExpression(property)
      };

      if (isDashed) paint["line-dasharray"] = [2, 2];
      if (direction) paint["line-offset"] = getZoomBasedOffset(direction);

      return paint;
    }


    // --- Conditional lines (directional)
    map.addLayer({
      id: "maxspeed-conditional-forward",
      type: "line",
      source: "maxspeed",
      "source-layer": "highways",
      layout: { visibility: "none" },
      filter: ["all", ["has", "maxspeed_forward"], ["has", "maxspeed_conditional"]],
      paint: makePaint("maxspeed_forward", true, "forward")
    });

    map.addLayer({
      id: "maxspeed-conditional-backward",
      type: "line",
      source: "maxspeed",
      "source-layer": "highways",
      layout: { visibility: "none" },
      filter: ["all", ["has", "maxspeed_backward"], ["has", "maxspeed_conditional"]],
      paint: makePaint("maxspeed_backward", true, "backward")
    });

    // --- Regular lines (directional)
    map.addLayer({
      id: "maxspeed-forward",
      type: "line",
      source: "maxspeed",
      "source-layer": "highways",
      layout: { visibility: "none" },
      filter: ["all", ["has", "maxspeed_forward"], ["!", ["has", "maxspeed_conditional"]]],
      paint: makePaint("maxspeed_forward", false, "forward")
    });

    map.addLayer({
      id: "maxspeed-backward",
      type: "line",
      source: "maxspeed",
      "source-layer": "highways",
      layout: { visibility: "none" },
      filter: ["all", ["has", "maxspeed_backward"], ["!", ["has", "maxspeed_conditional"]]],
      paint: makePaint("maxspeed_backward", false, "backward")
    });

    // --- Default (centered, no directional tags)
    map.addLayer({
      id: "maxspeed",
      type: "line",
      source: "maxspeed",
      "source-layer": "highways",
      layout: { visibility: "none" },
      filter: [
        "all",
        ["!", ["has", "maxspeed_forward"]],
        ["!", ["has", "maxspeed_backward"]],
        ["!", ["has", "maxspeed_conditional"]]
      ],
      paint: makePaint("maxspeed", false, 0)
    });

    map.addLayer({
      id: "maxspeed-conditional",
      type: "line",
      source: "maxspeed",
      "source-layer": "highways",
      layout: { visibility: "none" },
      filter: [
        "all",
        ["!", ["has", "maxspeed_forward"]],
        ["!", ["has", "maxspeed_backward"]],
        ["has", "maxspeed_conditional"]
      ],
      paint: makePaint("maxspeed", true, 0)
    });

    // --- Ensure visibility priority (move conditionals above others)
    map.moveLayer("maxspeed-conditional-forward");
    map.moveLayer("maxspeed-conditional-backward");
  }



  // // Maxspeed layers MINOR

  function addMaxspeedMinorLayers(map) {
    const offsetForward = 2.5;
    const offsetBackward = -2.5;

    // Create dynamic color expression based on the given property
    function makeLineColorExpression(property) {
      return [
        "case",
        ["==", ["get", property], "None"], "#000000",
        ["all", ["!", ["has", property]], ["==", ["get", "maxspeed_type"], "DE:urban"]], "#fdcc8a",
        ["all", ["!", ["has", property]], ["==", ["get", "maxspeed_type"], "DE:rural"]], "#e31a1c",
        ["!", ["has", property]], "#ff69b4",
        ["==", ["get", property], null], "#ff69b4",
        [
          "interpolate", ["linear"],
          ["to-number", ["get", property]],
          10, "#006400",   // dunkelgrün
          30, "#31a354",
          50, "#fdcc8a",
          100, "#e31a1c",
          140, "#8B0000"   // dunkelrot
        ]
      ];
    }

    // Create paint object with optional dash and offset
    function makePaint(property, isDashed, offset) {
      const paint = {
        "line-width": 1.8,
        "line-color": makeLineColorExpression(property)
      };
      if (isDashed) paint["line-dasharray"] = [2, 2];
      if (offset !== 0) paint["line-offset"] = offset;
      return paint;
    }

    const minzoom_minor = 14.5; // minzoom for minor highways
    // --- Conditional lines (directional)
    map.addLayer({
      id: "maxspeed_minor-conditional-forward",
      type: "line",
      source: "maxspeed_minor",
      "source-layer": "highways_minor",
      layout: { visibility: "none" },
      filter: ["all", ["has", "maxspeed_forward"], ["has", "maxspeed_conditional"]],
      minzoom: minzoom_minor,
      paint: makePaint("maxspeed_forward", true, offsetForward)
    });

    map.addLayer({
      id: "maxspeed_minor-conditional-backward",
      type: "line",
      source: "maxspeed_minor",
      "source-layer": "highways_minor",
      layout: { visibility: "none" },
      filter: ["all", ["has", "maxspeed_backward"], ["has", "maxspeed_conditional"]],
      minzoom: minzoom_minor,
      paint: makePaint("maxspeed_backward", true, offsetBackward)
    });

    // --- Regular lines (directional)
    map.addLayer({
      id: "maxspeed_minor-forward",
      type: "line",
      source: "maxspeed_minor",
      "source-layer": "highways_minor",
      layout: { visibility: "none" },
      filter: ["all", ["has", "maxspeed_forward"], ["!", ["has", "maxspeed_conditional"]]],
      minzoom: minzoom_minor,
      paint: makePaint("maxspeed_forward", false, offsetForward)
    });

    map.addLayer({
      id: "maxspeed_minor-backward",
      type: "line",
      source: "maxspeed_minor",
      "source-layer": "highways_minor",
      layout: { visibility: "none" },
      filter: ["all", ["has", "maxspeed_backward"], ["!", ["has", "maxspeed_conditional"]]],
      minzoom: minzoom_minor,
      paint: makePaint("maxspeed_backward", false, offsetBackward)
    });

    // --- Default (centered, no directional tags)
    map.addLayer({
      id: "maxspeed_minor",
      type: "line",
      source: "maxspeed_minor",
      "source-layer": "highways_minor",
      layout: { visibility: "none" },
      filter: [
        "all",
        ["!", ["has", "maxspeed_forward"]],
        ["!", ["has", "maxspeed_backward"]],
        ["!", ["has", "maxspeed_conditional"]]
      ],
      minzoom: minzoom_minor,
      paint: makePaint("maxspeed", false, 0)
    });

    map.addLayer({
      id: "maxspeed_minor-conditional",
      type: "line",
      source: "maxspeed_minor",
      "source-layer": "highways_minor",
      layout: { visibility: "none" },
      filter: [
        "all",
        ["!", ["has", "maxspeed_forward"]],
        ["!", ["has", "maxspeed_backward"]],
        ["has", "maxspeed_conditional"]
      ],
      minzoom: minzoom_minor,
      paint: makePaint("maxspeed", true, 0)
    });

    // --- Ensure visibility priority (move conditionals above others)
    map.moveLayer("maxspeed_minor-conditional-forward");
    map.moveLayer("maxspeed_minor-conditional-backward");
  }






  // add Schools layer
  function addSchoolsLayer(map) {
    // Schulen POINTS


    map.addLayer({
      id: "schools-points",
      minzoom: 9,
      type: "symbol",
      source: "schools",
      "source-layer": "germany_osm_schools",
      filter: ["==", ["geometry-type"], "Point"],
      layout: {
        visibility: "none",

        // 👇 switch icon based on amenity value
        "icon-image": [
          "match",
          ["get", "amenity"],
          "school", "home_blue",         // matches to `home_blue.png`
          "kindergarten", "home_green",  // matches to `home_green.png`
          "home"                    // default fallback icon
        ],

        "icon-size": [
          "interpolate",
          ["linear"],
          ["zoom"],
          9, 0.3,
          10, 0.5,
          14, 1,
          16, 1.8
        ],
        "icon-allow-overlap": true
      },
      paint: {
        "icon-opacity": 0.5,
      }
    });




    // Schulen POLYGONS
    map.addLayer({
      id: "schools-polygons",
      minzoom: 9,
      type: "fill",
      source: "schools",
      "source-layer": "germany_osm_schools",
      filter: ["==", ["geometry-type"], "Polygon"],
      layout: {
        visibility: "none"
      },
      paint: {
        "fill-color": [
          "match",
          ["get", "amenity"],
          "school", "#0074D9",
          "kindergarten", "#2ECC40",
          "#aaaaaa"
        ],
        "fill-opacity": 0.5,
        "fill-outline-color": "#1B4D3E"
      }
    });
  }


  // add Crossings layer (OSM highway=crossing-Nodes + footway/cycleway/path=crossing-Ways)
  function addCrossingsLayer(map) {
    // Einfärbung nach crossing-Wert: Ampel (grün) / markiert (amber) / unmarkiert (rot)
    // / sonstige (grau). Erweiterbar: weitere crossing=*-Werte hier ergänzen.
    const crossingColor = [
      "match",
      ["get", "crossing"],
      "traffic_signals", "#2ECC40",
      ["marked", "uncontrolled", "zebra"], "#FF851B",
      "unmarked", "#FF4136",
      /* default */ "#9aa0a6"
    ];

    // Querungs-LINIEN (footway/cycleway/path=crossing) — zuerst, damit Punkte oben liegen
    map.addLayer({
      id: "crossings-lines",
      minzoom: 9,
      type: "line",
      source: "crossings",
      "source-layer": "germany_osm_crossings",
      filter: ["==", ["geometry-type"], "LineString"],
      layout: { visibility: "none", "line-cap": "round" },
      paint: {
        "line-color": crossingColor,
        "line-width": ["interpolate", ["linear"], ["zoom"], 9, 0.5, 12, 2, 16, 5],
        "line-opacity": 0.85
      }
    });

    // Querungs-PUNKTE (highway=crossing-Nodes)
    map.addLayer({
      id: "crossings-points",
      minzoom: 9,
      type: "circle",
      source: "crossings",
      "source-layer": "germany_osm_crossings",
      filter: ["==", ["geometry-type"], "Point"],
      layout: { visibility: "none" },
      paint: {
        "circle-color": crossingColor,
        "circle-radius": ["interpolate", ["linear"], ["zoom"], 9, 1.2, 11, 3, 14, 5, 16, 8],
        "circle-stroke-color": "#1B4D3E",
        "circle-stroke-width": 1,
        "circle-opacity": 0.85
      }
    });
  }


  // add health layer
  function addHealthLayer(map) {
    // health POINTS

    map.addLayer({
      id: "health-points",
      minzoom: 9,
      type: "symbol",
      source: "health",
      "source-layer": "germany_osm_health", // must match tippecanoe `-l` name
      filter: ["==", ["geometry-type"], "Point"],
      layout: {
        visibility: "none",
        "icon-image": [
          "case",

          // Gruppe 1: Medizinisch → 🔴 red
          ["any",
            ["==", ["get", "amenity"], "hospital"],
            ["==", ["get", "amenity"], "clinic"],
            ["==", ["get", "healthcare"], "rehabilitation"],
            ["==", ["get", "healthcare:speciality"], "psychiatry"]
          ], "home_red",

          // Gruppe 3: Pflege / Senioren → 🟦 türkis
          ["any",
            ["==", ["get", "social_facility"], "nursing_home"],
            ["==", ["get", "social_facility"], "assisted_living"],
            ["==", ["get", "social_facility_for"], "senior"]
          ], "home_turkis",

          // Gruppe 4: Behindertenhilfe → 🟨 yellow
          ["==", ["get", "social_facility_for"], "disabled"], "home_yellow",

          // Fallback
          // "home"
          "__none__" // default fallback icon
        ],
        "icon-size": [
          "interpolate",
          ["linear"],
          ["zoom"],
          9, 0.35,
          10, 0.6,
          14, 1,
          16, 1.7
        ],
        "icon-allow-overlap": true //,
        // "icon-ignore-placement": true,
        // "icon-optional": true
      },
      paint: {
        "icon-opacity": 0.5
      }
    });


    // health POLYGONS
    map.addLayer({
      id: "health-polygons",
      minzoom: 9,
      type: "fill",
      source: "health",
      "source-layer": "germany_osm_health",
      filter: ["==", ["geometry-type"], "Polygon"],
      layout: {
        visibility: "none"
      },
      paint: {
        "fill-color": [
          "case",
          // Gruppe 1: Medizinisch
          ["==", ["get", "amenity"], "hospital"], "#D62728",
          ["==", ["get", "amenity"], "clinic"], "#D62728",
          ["==", ["get", "healthcare"], "rehabilitation"], "#D62728",
          ["==", ["get", "healthcare:speciality"], "psychiatry"], "#D62728",

          // Gruppe 3: Pflege / Senioren
          ["==", ["get", "social_facility"], "nursing_home"], "#17BECF",
          ["==", ["get", "social_facility"], "assisted_living"], "#17BECF",  // NEU
          ["==", ["get", "social_facility_for"], "senior"], "#17BECF",

          // Gruppe 4: Behindertenhilfe
          ["==", ["get", "social_facility_for"], "disabled"], "#BCBD22",

          "#aaaaaa"
        ],
        "fill-opacity": 0.5,
        "fill-outline-color": "#1B4D3E"
      }
    });
  }



  // add playgrounds layer
  function addPlaygroundsLayer(map) {
    // playgrounds POINTS

    map.addLayer({
      id: "playgrounds-points",
      minzoom: 9,
      type: "symbol",
      source: "playgrounds",
      "source-layer": "germany_osm_playgrounds", // must match tippecanoe `-l` name
      filter: ["==", ["geometry-type"], "Point"],
      layout: {
        visibility: "none",
        // "icon-image": "playground_darkgreen",  // Maki-Icon

        "icon-image": [
          "case",

          ["any",
            ["==", ["get", "amenity"], "playground"],
            ["==", ["get", "leisure"], "playground"],

          ], "playground_darkgreen",

          // Fallback
          "__none__" // default fallback icon
        ],


        "icon-size": [
          "interpolate",
          ["linear"],
          ["zoom"],
          9, 0.35,
          10, 0.6,
          14, 1,
          16, 1.7
        ],
        "icon-allow-overlap": true //,
        // "icon-ignore-placement": true,
        // "icon-optional": true
      },
      paint: {
        "icon-opacity": 0.5
      }
    });




    // playgrounds POLYGONS
    map.addLayer({
      id: "playgrounds-polygons",
      minzoom: 9,
      type: "fill",
      source: "playgrounds",
      "source-layer": "germany_osm_playgrounds",
      filter: ["==", ["geometry-type"], "Polygon"],
      layout: {
        visibility: "none"
      },
      paint: {
        "fill-color": [
          "case",
          // playgrounds
          ["==", ["get", "amenity"], "playground"], "#008000",
          ["==", ["get", "leisure"], "playground"], "#008000",
          "#aaaaaa"
        ],
        "fill-opacity": 0.5,
        "fill-outline-color": "#1B4D3E"
      }
    });
  }


  /// LAERM

  // add playgrounds layer
  function addLaermLayer(map) {

    // laerm1 POLYGONS
    map.addLayer({
      id: "laerm1",
      minzoom: 9,
      type: "fill",
      source: "laerm1",
      "source-layer": "laerm_hlq_den-polys",
      filter: ["==", ["geometry-type"], "Polygon"],
      layout: {
        visibility: "none"
      },
      paint: {
        "fill-color": [
          "match",
          ["get", "Lärmpegelklasse"],
          "Lden5559", "#A6AD88",
          "Lden6064", "#B89C63",
          "Lden6569", "#994848",
          "Lden7074", "#4B244A",
          "LdenGreaterThan75", "#2F0037",
        /* default */ "#999999"
        ],
        "fill-opacity": 0.6,
        "fill-outline-color": "#1B4D3E"
      }
    });

    // laerm2 POLYGONS
    map.addLayer({
      id: "laerm2",
      minzoom: 9,
      type: "fill",
      source: "laerm2",
      "source-layer": "laerm_4120_hlq_night-polys",
      filter: ["==", ["geometry-type"], "Polygon"],
      layout: {
        visibility: "none"
      },
      paint: {
        "fill-color": [
          "match",
          ["get", "Lärmpegelklasse"],
          "Lnight5054", "#A6AD88",
          "Lnight5559", "#B89C63",
          "Lnight6064", "#994848",
          "Lnight6569", "#4B244A",
          "LnightGreaterThan70", "#2F0037",
        /* default */ "#999999"
        ],
        "fill-opacity": 0.6,
        "fill-outline-color": "#1B4D3E"
      }
    });
  }






  // add Scenario1 layers (tempo100)
  function addScenario1Layers(map) {
    // Polygon Layer: zoom 14+
    map.addLayer({
      id: "scenario1-polys",
      type: "fill",
      source: "scenario1",
      "source-layer": "scenario1-polys",
      filter: ["==", ["geometry-type"], "Polygon"],
      minzoom: 14,
      layout: {
        visibility: "none"
      },
      paint: {
        "fill-color": "orange",
        "fill-opacity": 0.8,
        "fill-outline-color": "#1B4D3E"
      }
    });

    // Points Layer: zoom 6–14
    map.addLayer({
      id: "scenario1-points",
      type: "circle",
      source: "scenario1",
      "source-layer": "scenario1-points",
      filter: ["all"], // placeholder for future filters
      minzoom: 6,
      maxzoom: 14,
      layout: {
        visibility: "none"
      },
      paint: {
        "circle-color": "orange",
        "circle-radius": [
          "interpolate", ["linear"], ["zoom"],
          6, 4,
          10, 8
        ],
        "circle-opacity": 0.8,
        "circle-stroke-color": "#1B4D3E",
        "circle-stroke-width": 1
      }
    });
  }


  // add Scenario2 layers (school)
  function addScenario2Layers(map) {
    // Polygon Layer: zoom 14+
    map.addLayer({
      id: "scenario2-polys",
      type: "fill",
      source: "scenario2",
      "source-layer": "scenario2-polys",
      // filter: ["==", ["geometry-type"], "Polygon"],
      filter: ["all",
        ["!", ["in", ["get", "biped_counts"], ["literal", ["0", "1", "2"]]]],
        ["==", ["geometry-type"], "Polygon"]
      ],
      minzoom: 14,
      layout: {
        visibility: "none"
      },
      paint: {
        "fill-color": "orange",
        "fill-opacity": 0.8,
        "fill-outline-color": "#1B4D3E"
      }
    });

    // Points Layer: zoom 6–14
    map.addLayer({
      id: "scenario2-points",
      type: "circle",
      source: "scenario2",
      "source-layer": "scenario2-points",
      filter: ["all",
        ["!", ["in", ["get", "biped_counts"], ["literal", ["0", "1", "2"]]]],
        ["==", ["geometry-type"], "Point"]
      ],
      minzoom: 6,
      maxzoom: 14,
      layout: {
        visibility: "none"
      },
      paint: {
        "circle-color": "orange",
        "circle-radius": [
          "interpolate", ["linear"], ["zoom"],
          6, 4,
          10, 8
        ],
        "circle-opacity": 0.8,
        "circle-stroke-color": "#1B4D3E",
        "circle-stroke-width": 1
      }
    });
  }


  // add Scenario3 layers (school)
  function addScenario3Layers(map) {
    // Polygon Layer: zoom 14+
    map.addLayer({
      id: "scenario3-polys",
      type: "fill",
      source: "scenario3",
      "source-layer": "scenario3-polys",
      // filter: ["==", ["geometry-type"], "Polygon"],
      filter: ["all"],
      minzoom: 14,
      layout: {
        visibility: "none"
      },
      paint: {
        "fill-color": "orange",
        "fill-opacity": 0.8,
        "fill-outline-color": "#1B4D3E"
      }
    });

    // Points Layer: zoom 6–14
    map.addLayer({
      id: "scenario3-points",
      type: "circle",
      source: "scenario3",
      "source-layer": "scenario3-points",
      filter: ["all"],
      minzoom: 6,
      maxzoom: 14,
      layout: {
        visibility: "none"
      },
      paint: {
        "circle-color": "orange",
        "circle-radius": [
          "interpolate", ["linear"], ["zoom"],
          6, 4,
          10, 8
        ],
        "circle-opacity": 0.8,
        "circle-stroke-color": "#1B4D3E",
        "circle-stroke-width": 1
      }
    });
  }


  // add Scenario6 layers (missing tempo30)
  function addScenario6Layers(map) {
    // Polygon Layer: zoom 14+
    map.addLayer({
      id: "scenario6-polys",
      type: "fill",
      source: "scenario6",
      "source-layer": "scenario6-polys",
      // filter: ["==", ["geometry-type"], "Polygon"],
      filter: ["all"],
      minzoom: 14,
      layout: {
        visibility: "none"
      },
      paint: {
        "fill-color": "orange",
        "fill-opacity": 0.4,
        "fill-outline-color": "#1B4D3E"
      }
    });

    // Points Layer: zoom 6–14
    map.addLayer({
      id: "scenario6-points",
      type: "circle",
      source: "scenario6",
      "source-layer": "scenario6-points",
      filter: ["all"],
      minzoom: 6,
      maxzoom: 14,
      layout: {
        visibility: "none"
      },
      paint: {
        "circle-color": "orange",
        "circle-radius": [
          "interpolate", ["linear"], ["zoom"],
          6, 4,
          10, 8
        ],
        "circle-opacity": 0.8,
        "circle-stroke-color": "#1B4D3E",
        "circle-stroke-width": 1
      }
    });


    // Polygon Layer LINKS: zoom 14+
    map.addLayer({
      id: "scenario6-polys2",
      type: "line",
      source: "scenario6",
      "source-layer": "scenario6-polys2",
      filter: ["all"],
      minzoom: 14,
      layout: {
        visibility: "none"
      },
      paint: {
        "line-color": "red",
        "line-width": 2
      }
      // }, "maxspeed"); // put below the maxspeed layer
    });

  }



  // add Scenario8 layers (laerm und schulen)
  function addScenario8Layers(map) {
    // Polygon Layer: zoom 14+
    map.addLayer({
      id: "scenario8-polys",
      type: "fill",
      source: "scenario8",
      "source-layer": "scenario8-polys",
      // filter: ["==", ["geometry-type"], "Polygon"],
      filter: ["all"],
      minzoom: 14,
      layout: {
        visibility: "none"
      },
      paint: {
        "fill-color": "orange",
        "fill-opacity": 0.8,
        "fill-outline-color": "#1B4D3E"
      }
    });

    // Points Layer: zoom 6–14
    map.addLayer({
      id: "scenario8-points",
      type: "circle",
      source: "scenario8",
      "source-layer": "scenario8-points",
      filter: ["all"],
      minzoom: 6,
      maxzoom: 14,
      layout: {
        visibility: "none"
      },
      paint: {
        "circle-color": "orange",
        "circle-radius": [
          "interpolate", ["linear"], ["zoom"],
          6, 4,
          10, 8
        ],
        "circle-opacity": 0.8,
        "circle-stroke-color": "#1B4D3E",
        "circle-stroke-width": 1
      }
    });
  }





  // add Scenario9 layers (Unfallschwerpunkte / M Uko, vereinfacht)
  function addScenario9Layers(map) {
    // Polygon Layer: zoom 14+
    map.addLayer({
      id: "scenario9-polys",
      type: "fill",
      source: "scenario9",
      "source-layer": "scenario9-polys",
      filter: ["all"],
      minzoom: 14,
      layout: {
        visibility: "none"
      },
      paint: {
        "fill-color": "#c0392b",
        "fill-opacity": 0.8,
        "fill-outline-color": "#1B4D3E"
      }
    });

    // Points Layer: zoom 6–14
    map.addLayer({
      id: "scenario9-points",
      type: "circle",
      source: "scenario9",
      "source-layer": "scenario9-points",
      filter: ["all"],
      minzoom: 6,
      maxzoom: 14,
      layout: {
        visibility: "none"
      },
      paint: {
        "circle-color": "#c0392b",
        "circle-radius": [
          "interpolate", ["linear"], ["zoom"],
          6, 4,
          10, 8
        ],
        "circle-opacity": 0.8,
        "circle-stroke-color": "#1B4D3E",
        "circle-stroke-width": 1
      }
    });
  }


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







  function addTelraamLayer(map) {
    // Telraam-Zählstellen (kurze Straßensegmente, CC BY-NC). Klick öffnet die
    // Telraam-Location-Seite (siehe setupTelraamLinks in popupHandlers.js).
    // source-layer + oidn = Frontend-Vertrag (siehe pipeline telraam.py / tiles.yaml).
    map.addLayer({
      id: "telraam",
      type: "line",
      source: "telraam_segments",
      "source-layer": "telraam_segments",
      minzoom: 9,
      layout: {
        visibility: "none",
        "line-cap": "round",
        "line-join": "round"
      },
      paint: {
        "line-color": telraamColorExpr("bike"),   // Default-Modus; setupTelraamMode schaltet um
        "line-opacity": 0.9,
        "line-width": [
          "interpolate", ["linear"], ["zoom"],
          9, 2,
          13, 4,
          16, 7
        ]
      }
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






  // change the map order


  addSchoolsLayer(map);
  addHealthLayer(map);
  addPlaygroundsLayer(map);
  addCrossingsLayer(map);


  addAccidentLayersToMap(map);
  addAccidentClusterLayers(map);

  addScenario1Layers(map);
  addScenario2Layers(map);
  addScenario3Layers(map);
  addScenario6Layers(map);
  addScenario8Layers(map);
  addScenario9Layers(map);

  addMaxspeedLayers(map);
  addMaxspeedMinorLayers(map);
  addMovebisLayer(map);
  addOBSLayer(map);
  addHvsLayer(map);
  addSvzLayers(map);   // SVZ-Verkehrsmengen ÜBER dem groben hvs-Fallback
  addLaermLayer(map);
  addUspeedLayer(map);
  addTelraamLayer(map);


  addMapillaryLayer(map);
  addMapillaryTSLayer(map);
}


// Telraam: Linienfarbe nach Modus (Auto/Rad), Skala = Ø/Tag (letzte 2 Wochen).
// Segmente ohne aggregierte Daten (Attribut fehlt) -> grau. Breakpoints aus den
// Daten-Perzentilen (siehe pipeline). Wird von addLayers (initial) und
// setupTelraamMode (Umschalter) genutzt -> eine Quelle.
export function telraamColorExpr(mode) {
  // Breakpoints ≈ Perzentile der 452 aktiven DE-Segmente (Auto-Median ~1040, Rad ~350).
  const scales = {
    car: {
      attr: "car_per_day",
      stops: [0, 300, 1000, 3500, 9000],
      colors: ["#ffffb2", "#fecc5c", "#fd8d3c", "#f03b20", "#bd0026"]
    },
    bike: {
      attr: "bike_per_day",
      stops: [0, 100, 350, 750, 1500],
      colors: ["#ffffcc", "#c2e699", "#78c679", "#31a354", "#006837"]
    }
  };
  const c = scales[mode] || scales.bike;
  const interp = ["interpolate", ["linear"], ["to-number", ["get", c.attr]]];
  for (let i = 0; i < c.stops.length; i++) interp.push(c.stops[i], c.colors[i]);
  return ["case", ["has", c.attr], interp, "#bbbbbb"];
}


// --- SVZ-Verkehrsmengen: Größen-Expressions (Modus "dtv" | "sv") --------------------
// MONOCHROM: alle Features schwarz — die MENGE steckt ALLEIN in der Größe
// (Linienbreite bzw. Kreisradius), damit stark befahrene Straßen/Stellen dick
// herausstechen. Der Modus (DTV bzw. SV-Anteil %) steuert, WELCHE Größe die Dicke
// kodiert. Genutzt von addLayers (initial) und setupSvzMode (Umschalter) -> eine
// Quelle. dtv_kfz/dtv_sv/sv_anteil landen z.T. als String im Tile -> immer to-number.
const SVZ_NODATA = "#b4b4b4";

// SV-Anteil je Feature: direkt sv_anteil (%), sonst aus dtv_sv/dtv_kfz berechnet.
const svzSvShare = [
  "case",
  ["has", "sv_anteil"], ["to-number", ["get", "sv_anteil"]],
  ["*", ["/", ["to-number", ["get", "dtv_sv"]], ["to-number", ["get", "dtv_kfz"]]], 100]
];
const svzHasSv = [
  "any",
  ["has", "sv_anteil"],
  ["all", ["has", "dtv_sv"], ["has", "dtv_kfz"], [">", ["to-number", ["get", "dtv_kfz"]], 0]]
];
const svzValue = (mode) => (mode === "sv" ? svzSvShare : ["to-number", ["get", "dtv_kfz"]]);
const svzHas = (mode) => (mode === "sv" ? svzHasSv : ["has", "dtv_kfz"]);

// Schwarz für alle Features mit Wert; no-data bleibt grau (unterscheidbar von klein).
const SVZ_INK = "#222";
// 5 Klassen-Schwellen je Modus (Reihenfolge = Legendenzeilen).
export const SVZ_BREAKS = { dtv: [0, 5000, 15000, 30000, 50000], sv: [0, 5, 10, 20, 30] };
// Größen-Rampen (px, vor Zoom-Faktor): Linienbreite bzw. Kreisradius je Klasse.
const SVZ_WIDTHS = [0.8, 1.5, 2.5, 4, 6];
const SVZ_RADII = [2.5, 3.5, 5, 7, 10];
export function svzColorExpr(mode) {
  // Monochrom: schwarz bei vorhandenem Wert, grau bei „keine Angabe". Keine Farbrampe.
  return ["case", svzHas(mode), SVZ_INK, SVZ_NODATA];
}

// Größe = Menge UND Zoom. MapLibre erlaubt "zoom" NUR ganz außen in interpolate/step;
// deshalb Zoom-Kurve außen, je Zoom-Stufe eine (skalierte) Daten-Größenrampe (value->px)
// als Output — die inneren Ausdrücke dürfen KEIN zoom enthalten. no-data -> kleinste
// Klasse. Generisch über valueExpr/hasExpr/breaks, damit SVZ (dtv_kfz / SV-Anteil) UND
// UBA (annualTrafficFlow ÷ 365) DIESELBE schwarze Größenkodierung + Legende teilen.
const SVZ_ZOOM_STOPS = [[6, 0.55], [11, 0.8], [14, 1.0], [16, 1.4], [18, 1.8]];
function sizeExpr(valueExpr, hasExpr, breaks, baseValues) {
  const zi = ["interpolate", ["linear"], ["zoom"]];
  for (const [z, f] of SVZ_ZOOM_STOPS) {
    const scaled = baseValues.map((v) => Math.round(v * f * 100) / 100);
    const ramp = ["interpolate", ["linear"], valueExpr];
    for (let i = 0; i < breaks.length; i++) ramp.push(breaks[i], scaled[i]);
    zi.push(z, ["case", hasExpr, ramp, scaled[0]]);
  }
  return zi;
}
const svzBreaks = (mode) => SVZ_BREAKS[mode === "sv" ? "sv" : "dtv"];

export function svzWidthExpr(mode) {
  return sizeExpr(svzValue(mode), svzHas(mode), svzBreaks(mode), SVZ_WIDTHS);
}
export function svzRadiusExpr(mode) {
  return sizeExpr(svzValue(mode), svzHas(mode), svzBreaks(mode), SVZ_RADII);
}

// UBA-Hauptverkehrsstraßen: annualTrafficFlow (Kfz/Jahr) -> Tages-DTV≈ (÷365), gleiche
// schwarze Größenkodierung + DTV-Schwellen wie SVZ -> passt in DIESELBE Legende.
const HVS_DAILY = ["/", ["to-number", ["get", "annualTrafficFlow"]], 365];
const HVS_HAS = ["has", "annualTrafficFlow"];
export function hvsColorExpr() {
  return ["case", HVS_HAS, SVZ_INK, SVZ_NODATA];
}
export function hvsWidthExpr() {
  return sizeExpr(HVS_DAILY, HVS_HAS, SVZ_BREAKS.dtv, SVZ_WIDTHS);
}