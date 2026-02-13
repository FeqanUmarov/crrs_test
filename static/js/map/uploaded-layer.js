function setupUploadedLayer({ map, registerSnapSource, onResetTekuis } = {}){
  if (!map) return null;

  let uploadedLayer = null;

    function clearUploadedLayer(){
    if (!uploadedLayer) return;
    map.removeLayer(uploadedLayer);
    uploadedLayer = null;
  }

  function addGeoJSONToMap(geojson){
    const format = new ol.format.GeoJSON();
    const features = format.readFeatures(geojson, {
      dataProjection: 'EPSG:4326',
      featureProjection: 'EPSG:3857'
    });
    const source = new ol.source.Vector({ features });

    clearUploadedLayer();

    uploadedLayer = new ol.layer.Vector({
      source,
      style: window.styleByGeom
    });
    map.addLayer(uploadedLayer);

    registerSnapSource?.(source);

    const extent = source.getExtent();
    map.getView().fit(extent, { padding: [20,20,20,20], duration: 600, maxZoom: 18 });

    onResetTekuis?.();
  }

  return {
    addGeoJSONToMap,
    clearUploadedLayer,
    getUploadedLayer: () => uploadedLayer
  };
}

window.setupUploadedLayer = setupUploadedLayer;