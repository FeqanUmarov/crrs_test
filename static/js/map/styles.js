(function setupMapStyles(){
  function styleByGeom(feature){
    const t = feature.getGeometry().getType();
    if (t === 'Point' || t === 'MultiPoint') {
      return new ol.style.Style({
        image: new ol.style.Circle({
          radius: 5,
          fill: new ol.style.Fill({ color: 'rgba(37,99,235,0.9)' }),
          stroke: new ol.style.Stroke({ color: '#ffffff', width: 1.5 })
        })
      });
    }
    if (t === 'LineString' || t === 'MultiLineString') {
      return new ol.style.Style({
        stroke: new ol.style.Stroke({ color: '#2563eb', width: 2 })
      });
    }
    return new ol.style.Style({
      fill: new ol.style.Fill({ color: 'rgba(37,99,235,0.25)' }),
      stroke: new ol.style.Stroke({ color: '#2563eb', width: 2 })
    });
  }

  function styleTicketDefault(feature){
    const t = feature.getGeometry().getType();
    if (t === 'Point' || t === 'MultiPoint') {
      return new ol.style.Style({
        image: new ol.style.Circle({
          radius: 5,
          fill: new ol.style.Fill({ color: 'rgba(16,185,129,0.9)' }),
          stroke: new ol.style.Stroke({ color: '#ffffff', width: 1.5 })
        })
      });
    }
    if (t === 'LineString' || t === 'MultiLineString') {
      return new ol.style.Style({
        stroke: new ol.style.Stroke({ color: '#10b981', width: 2 })
      });
    }
    return new ol.style.Style({
      fill: new ol.style.Fill({ color: 'rgba(16,185,129,0.25)' }),
      stroke: new ol.style.Stroke({ color: '#10b981', width: 2 })
    });
  }

  function styleAttachDefault(feature){
    const t = feature.getGeometry().getType();
    if (t === 'Point' || t === 'MultiPoint') {
      return new ol.style.Style({
        image: new ol.style.Circle({
          radius: 5,
          fill: new ol.style.Fill({ color: 'rgba(234,88,12,0.9)' }),
          stroke: new ol.style.Stroke({ color: '#ffffff', width: 1.5 })
        })
      });
    }
    if (t === 'LineString' || t === 'MultiLineString') {
      return new ol.style.Style({
        stroke: new ol.style.Stroke({ color: '#ea580c', width: 2 })
      });
    }
    return new ol.style.Style({
      fill: new ol.style.Fill({ color: 'rgba(234,88,12,0.25)' }),
      stroke: new ol.style.Stroke({ color: '#ea580c', width: 2 })
    });
  }

  window.styleByGeom = styleByGeom;
  window.styleTicketDefault = styleTicketDefault;
  window.styleAttachDefault = styleAttachDefault;
})();