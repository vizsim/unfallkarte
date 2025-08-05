export function addSources(map, { MAPTILER_API_KEY, MAPILLARY_TOKEN }) {
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

  // addPMTilesSource("uspeed", "uber_movement_osm_q2_2019_18Uhr_osm200101.pmtiles");
  addPMTilesSource("uspeed", "uber_movement_osm_q2_2019_allHoures_osm200101.pmtiles");



  addPMTilesSource("obs", "OBS_data_2025-06-11.pmtiles");

  addPMTilesSource("laerm1", "laerm/laerm_hlq_den.pmtiles");
  addPMTilesSource("laerm2", "laerm/laerm_4120_hlq_night.pmtiles");


  addPMTilesSource("schools", "processed_schools_germany_250528.pmtiles"); 
  addPMTilesSource("health", "processed_health_germany_250528.pmtiles"); 
  addPMTilesSource("playgrounds", "processed_playgrounds_germany_250528.pmtiles"); 


  addPMTilesSource("accidents_single", "accidents_single.pmtiles");



  addPMTilesSource("accidents-cluster", "combined_may25_group.pmtiles");

  // Scenarios: new scenarios with dates are added into the folder "scenarios"
  addPMTilesSource("scenario1", "scenario1_cluster_accidents_ms100.pmtiles");

  addPMTilesSource("scenario2", "scenario2_accidents_close2schools.pmtiles");
  addPMTilesSource("scenario3", "scenario3_tempo30_conti.pmtiles");
  addPMTilesSource("scenario4", "scenarios/scenario4_tempo30missing_ger_osm250628_ml250607.pmtiles");
  addPMTilesSource("scenario5", "scenario5_crossing-missing.pmtiles");
  addPMTilesSource("scenario6", "scenario6_tempo50_30mbuffer_schulen.pmtiles");

  // addPMTilesSource("scenario7", "scenario7_missing-cw_bbb.pmtiles");
  //addPMTilesSource("scenario7", "scenarios/scenario7_trafficsigns_missing-cw_osm250528_ml250607.pmtiles");
  //addPMTilesSource("scenario7", "scenarios/scenario7_trafficsigns_missing-cw_osm250721_ml250607.pmtiles");
  //addPMTilesSource("scenario7", "scenarios/scenario7_trafficsigns_missing-cw_osm250721_ml250607_ml1y25_.pmtiles");
  addPMTilesSource("scenario7", "scenarios/scenario7_trafficsigns_missing-cw_osm250731_ml250730_ml1y25.pmtiles");
  



  addPMTilesSource("scenario8", "scenario8_laerm_schulen.pmtiles");




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


  // Mapillary traffic signs
  map.addSource("mapillary-traffic_signs", {
    type: "vector",
    tiles: [
      `https://tiles.mapillary.com/maps/vtp/mly_map_feature_traffic_sign/2/{z}/{x}/{y}?access_token=${MAPILLARY_TOKEN}`
    ],
    minzoom: 14,
    // maxzoom: 14.99
    maxzoom: 14,
  });



  // // Raster: Satellite
  // map.addSource("satellite", {
  //   type: "raster",
  //   tiles: [
  //     `https://api.maptiler.com/tiles/satellite-v2/{z}/{x}/{y}.jpg?key=${MAPTILER_API_KEY}`
  //   ],
  //   tileSize: 256,
  //   attribution: "© MapTiler"
  // });
  // Raster: Satellite ESRI
  map.addSource("satellite", {
    type: "raster",
    tiles: [
      "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
    ],
    tileSize: 256,
    attribution: "Tiles © Esri — Source: Esri, Maxar, Earthstar Geographics, and the GIS User Community"
  });

  // Raster: Hillshade
  map.addSource("hillshade", {
    type: "raster",
    url: `https://api.maptiler.com/tiles/hillshades/tiles.json?key=${MAPTILER_API_KEY}`,
    tileSize: 256,
    attribution: "© MapTiler"
  });
  // Raster-DEM: Terrain
  map.addSource("terrain", {
    type: "raster-dem",
    url: `https://api.maptiler.com/tiles/terrain-rgb-v2/tiles.json?key=${MAPTILER_API_KEY}`,
    tileSize: 256,
    encoding: "mapbox",
    attribution: "© MapTiler"
  });

  // on-the-fly-GeoJSON: Hover point
  map.addSource("hover-point", {
    type: "geojson",
    data: { type: "FeatureCollection", features: [] }
  });

}
