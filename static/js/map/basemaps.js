function setupBasemaps(map, googleImagery){
  if (!map || !googleImagery) return null;

  const osmStd = new ol.layer.Tile({
    source: new ol.source.OSM({ attributions: '© OpenStreetMap contributors' }),
    visible: false
  });
  map.addLayer(osmStd);

  const cartoDark = new ol.layer.Tile({
    source: new ol.source.XYZ({
      urls: [
        'https://a.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
        'https://b.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
        'https://c.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
        'https://d.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'
      ],
      attributions: '© OpenStreetMap contributors, © CARTO',
      maxZoom: 20
    }),
    visible: false
  });
  map.addLayer(cartoDark);

  const esriImagery = new ol.layer.Tile({
    source: new ol.source.XYZ({
      url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
      attributions: 'Tiles © Esri'
    }),
    visible: false
  });
  map.addLayer(esriImagery);

  const esriLabelsOverlay = new ol.layer.Tile({
    source: new ol.source.XYZ({
      url: 'https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}',
      attributions: '© Esri'
    }),
    visible: false,
    zIndex: 2
  });
  map.addLayer(esriLabelsOverlay);

  const esriStreets = new ol.layer.Tile({
    source: new ol.source.XYZ({
      url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}',
      attributions: '© Esri'
    }),
    visible: false
  });
  map.addLayer(esriStreets);

  const esriTopo = new ol.layer.Tile({
    source: new ol.source.XYZ({
      url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}',
      attributions: '© Esri'
    }),
    visible: false
  });
  map.addLayer(esriTopo);

  const esriNavigation = new ol.layer.Tile({
    source: new ol.source.XYZ({
      url: 'https://services.arcgisonline.com/ArcGIS/rest/services/Specialty/World_Navigation_Charts/MapServer/tile/{z}/{y}/{x}',
      attributions: '© Esri, NOAA'
    }),
    visible: false
  });
  map.addLayer(esriNavigation);

  let currentBasemap = 'google';

  function setBasemap(key){
    [googleImagery, osmStd, cartoDark, esriImagery, esriStreets, esriTopo, esriNavigation]
      .forEach(l => l.setVisible(false));
    esriLabelsOverlay.setVisible(false);

    switch(key){
      case 'google':         googleImagery.setVisible(true); break;
      case 'osm':            osmStd.setVisible(true); break;
      case 'streets':        esriStreets.setVisible(true); break;
      case 'streets_night':  cartoDark.setVisible(true); break;
      case 'imagery':        esriImagery.setVisible(true); break;
      case 'imagery_hybrid': esriImagery.setVisible(true); esriLabelsOverlay.setVisible(true); break;
      case 'topographic':    esriTopo.setVisible(true); break;
      case 'navigation':     esriNavigation.setVisible(true); break;
      default:               googleImagery.setVisible(true);
    }
    currentBasemap = key;
    highlightSelectedBasemap();
  }

  function highlightSelectedBasemap(){
    document.querySelectorAll('.basemap-item').forEach(it=>{
      if (it.dataset.key === currentBasemap){
        it.classList.add('selected');
        it.style.border = '2px solid #2563eb';
        it.style.boxShadow = '0 0 0 2px rgba(37,99,235,.35)';
        it.style.borderRadius = '5px';
      } else {
        it.classList.remove('selected');
        it.style.border = '2px solid transparent';
        it.style.boxShadow = 'none';
      }
    });
  }

  return {
    setBasemap,
    highlightSelectedBasemap
  };
}

window.setupBasemaps = setupBasemaps;