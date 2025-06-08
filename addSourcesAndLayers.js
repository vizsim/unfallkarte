export function addSourcesAndLayers(map, { MAPTILER_API_KEY, MAPILLARY_TOKEN }) {
  // SOURCES

  const pmtilesBaseURL = "https://f003.backblazeb2.com/file/unfallkarte-data/";

  const addPMTilesSource = (id, filename) => {
    if (!map.getSource(id)) {
      map.addSource(id, {
        type: "vector",
        url: `pmtiles://${pmtilesBaseURL}${filename}`
      });
    }
  };

  addPMTilesSource("movebis", "movebis_speed_germany_2020_min10cnt.pmtiles");
  addPMTilesSource("hvs", "Hauptverkehrstraßennetz.pmtiles");

  addPMTilesSource("maxspeed", "processed_major_highways_germany_250528.pmtiles");
  addPMTilesSource("maxspeed_minor", "processed_minor_highways_germany_250528.pmtiles");



  addPMTilesSource("schools", "processed_schools_germany_250528.pmtiles"); 
  addPMTilesSource("health", "processed_health_germany_250528.pmtiles"); 
  addPMTilesSource("playgrounds", "processed_playgrounds_germany_250528.pmtiles"); 


  addPMTilesSource("accidents_single", "accidents_single.pmtiles");



  addPMTilesSource("accidents-cluster", "combined_may25_group.pmtiles");
  addPMTilesSource("scenario1", "scenario1_cluster_accidents_ms100.pmtiles");

  addPMTilesSource("scenario2", "scenario2_accidents_close2schools.pmtiles");
  addPMTilesSource("scenario3", "scenario3_tempo30_conti.pmtiles");
  addPMTilesSource("scenario4", "scenario4_tempo30missing.pmtiles");




  // Mapillary
  map.addSource("mapillary-images", {
    type: "vector",
    tiles: [
      `https://tiles.mapillary.com/maps/vtp/mly1_public/2/{z}/{x}/{y}?access_token=${MAPILLARY_TOKEN}`
    ],
    minzoom: 14,
    // maxzoom: 14.99
    maxzoom: 14,
  });
  // Raster: Satellite
  map.addSource("satellite", {
    type: "raster",
    tiles: [
      `https://api.maptiler.com/tiles/satellite-v2/{z}/{x}/{y}.jpg?key=${MAPTILER_API_KEY}`
    ],
    tileSize: 256,
    attribution: "© MapTiler"
  });
  // Raster: Hillshade
  map.addSource("hillshade", {
    type: "raster",
    url: `https://api.maptiler.com/tiles/hillshades/tiles.json?key=${MAPTILER_API_KEY}`,
    tileSize: 256
  });
  // Raster-DEM: Terrain
  map.addSource("terrain", {
    type: "raster-dem",
    url: `https://api.maptiler.com/tiles/terrain-rgb-v2/tiles.json?key=${MAPTILER_API_KEY}`,
    tileSize: 256,
    encoding: "mapbox"
  });

  // on-the-fly-GeoJSON: Hover point
  map.addSource("hover-point", {
    type: "geojson",
    data: { type: "FeatureCollection", features: [] }
  });





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
          "text-size": 14,
          "text-offset": [0, 0],
          "text-anchor": "top",
          "text-allow-overlap": true,
          "text-ignore-placement": true,
          "visibility": "visible"
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
        "line-width": [
          "interpolate",
          ["linear"],
          ["get", "visits"],
          0, 0.5,
          10, 2,
          50, 4,
          100, 8,
          1000, 12
        ]
      }
    });
  }

  // and Verkehrsmengen layer
  function addHvsLayer(map) {
    map.addLayer({
      id: "hvs",
      type: "line",
      source: "hvs",
      "source-layer": "lines",
      layout: { visibility: "none" },
      paint: {
        "line-width": [
          "interpolate",
          ["linear"],
          ["to-number", ["get", "annualTrafficFlow"]],
          3000000, 2,
          10000000, 4,
          20000000, 8,
          30000000, 16
        ],
        "line-color": "#222"
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
      type: "symbol",
      source: "schools",
      "source-layer": "germany_osm_schools", // must match tippecanoe `-l` name
      filter: ["==", ["geometry-type"], "Point"],
      layout: {
        visibility: "none",
        "icon-image": "home",  // Maki-Icon
        "icon-size": [
          "interpolate",
          ["linear"],
          ["zoom"],
          10, 0.6,
          14, 1,
          16, 1.7
        ],
        "icon-allow-overlap": true //,
        // "icon-ignore-placement": true,
        // "icon-optional": true
      },
      paint: {
        "icon-color": [
          "match",
          ["get", "amenity"],
          "school", "#0074D9",       // blue
          "kindergarten", "#2ECC40", // green
          "#aaaaaa"                  // default/fallback
        ],
        "icon-opacity": 0.5
      }
    });

    // Schulen POLYGONS
    map.addLayer({
      id: "schools-polygons",
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


  // add health layer
  function addHealthLayer(map) {
    // health POINTS

    map.addLayer({
      id: "health-points",
      type: "symbol",
      source: "health",
      "source-layer": "germany_osm_health", // must match tippecanoe `-l` name
      filter: ["==", ["geometry-type"], "Point"],
      layout: {
        visibility: "none",
        "icon-image": "home",  // Maki-Icon
        "icon-size": [
          "interpolate",
          ["linear"],
          ["zoom"],
          10, 0.6,
          14, 1,
          16, 1.7
        ],
        "icon-allow-overlap": true //,
        // "icon-ignore-placement": true,
        // "icon-optional": true
      },
      paint: {
        "icon-color": [
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
        "icon-opacity": 0.5
      }
    });

    // health POLYGONS
    map.addLayer({
      id: "health-polygons",
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

          // Gruppe 2: Psychisch
          ["==", ["get", "healthcare:speciality"], "psychiatry"], "#9467BD",
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
      type: "symbol",
      source: "playgrounds",
      "source-layer": "germany_osm_playgrounds", // must match tippecanoe `-l` name
      filter: ["==", ["geometry-type"], "Point"],
      layout: {
        visibility: "none",
        "icon-image": "playground",  // Maki-Icon
        "icon-size": [
          "interpolate",
          ["linear"],
          ["zoom"],
          10, 0.6,
          14, 1,
          16, 1.7
        ],
        "icon-allow-overlap": true //,
        // "icon-ignore-placement": true,
        // "icon-optional": true
      },
      paint: {
        "icon-color": [
          "case",
          // playgrounds
          ["==", ["get", "amenity"], "playground"], "green",
          ["==", ["get", "leisure"], "playground"], "green",
          "#aaaaaa"
        ],
        "icon-opacity": 0.5
      }
    });

    // playgrounds POLYGONS
    map.addLayer({
      id: "playgrounds-polygons",
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
          ["==", ["get", "amenity"], "playground"], "green",
          ["==", ["get", "leisure"], "playground"], "green",
          "#aaaaaa"
        ],
        "fill-opacity": 0.5,
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


  // add Scenario4 layers (missing tempo30)
  function addScenario4Layers(map) {
    // Polygon Layer: zoom 14+
    map.addLayer({
      id: "scenario4-polys",
      type: "fill",
      source: "scenario4",
      "source-layer": "scenario4-polys",
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
      id: "scenario4-points",
      type: "circle",
      source: "scenario4",
      "source-layer": "scenario4-points",
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





  addAccidentLayersToMap(map);
  addAccidentClusterLayers(map);

  addMovebisLayer(map);
  addHvsLayer(map);

  addMaxspeedLayers(map);
  addMaxspeedMinorLayers(map);

  addSchoolsLayer(map);
  addHealthLayer(map);
  addPlaygroundsLayer(map);

  addScenario1Layers(map);
  addScenario2Layers(map);
  addScenario3Layers(map);
  addScenario4Layers(map);




  // function addMapillaryLayer(map) {
  //   // Mapillary image points
  //   map.addLayer({
  //     id: "mapillary-images-layer",
  //     type: "circle",
  //     source: "mapillary-images",
  //     "source-layer": "image",
  //     minzoom: 14,
  //     // maxzoom: 14.99
  //     maxzoom: 20,
  //     layout: {
  //       visibility: "none"
  //     },
  //     paint: {
  //       "circle-radius": 3,
  //       "circle-color": "#00b955"
  //     }
  //   });
  // }

  //   function addMapillaryLayer(map) {
  //   map.addLayer({
  //     id: "mapillary-images-layer",
  //     type: "circle",
  //     source: "mapillary-images",
  //     "source-layer": "image",
  //     minzoom: 14,
  //     maxzoom: 20,
  //     layout: {
  //       visibility: "none"
  //     },
  //     paint: {
  //       // Corrected color switch with to-string()
  //       "circle-color": [
  //         "match",
  //         ["to-string", ["get", "is_pano"]],
  //         "true", "#0077ff",   // pano
  //         "false", "#00b955",  // non-pano
  //         "#999999"            // fallback
  //       ],
  //       // Larger radius if zoom > 16
  //       "circle-radius": [
  //         "interpolate", ["linear"], ["zoom"],
  //         14, 3,
  //         16, 4,
  //         17, 5
  //       ]
  //     }
  //   });
  // }

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
  addMapillaryLayer(map);




  function addRasterLayers(map) {
    // Satellite layer (optional: insert below a specific layer)
    map.addLayer({
      id: "satellite-layer",
      type: "raster",
      source: "satellite",
      layout: { visibility: "none" }
    }, "accident-points"); // insert below accident points layer

    // Hillshade layer
    map.addLayer({
      id: "hillshade-layer",
      type: "raster",
      source: "hillshade",
      layout: { visibility: "none" }, // initial hidden
      paint: {
        "raster-opacity": 0.3
      }
    });

    // Disable terrain initially (can be enabled dynamically)
    map.setTerrain(null);
  }

  addRasterLayers(map);


}
