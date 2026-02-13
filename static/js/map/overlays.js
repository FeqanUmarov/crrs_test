function initMapOverlays(map){
  if (!map) return null;

  const infoHighlightSource = new ol.source.Vector();
  const infoHighlightLayer = new ol.layer.Vector({
    source: infoHighlightSource,
    zIndex: 99,
    style: (feature) => {
      const t = feature.getGeometry().getType();
      const sky = '#60a5fa';
      if (/Point/i.test(t)) {
        return new ol.style.Style({
          image: new ol.style.Circle({
            radius: 6,
            fill: new ol.style.Fill({ color: 'rgba(96,165,250,0.25)' }),
            stroke: new ol.style.Stroke({ color: sky, width: 2 })
          })
        });
      }
      if (/LineString/i.test(t)) {
        return [
          new ol.style.Style({ stroke: new ol.style.Stroke({ color: 'rgba(96,165,250,0.35)', width: 8 }) }),
          new ol.style.Style({ stroke: new ol.style.Stroke({ color: sky, width: 3 }) })
        ];
      }
      return [
        new ol.style.Style({ fill: new ol.style.Fill({ color: 'rgba(96,165,250,0.10)' }) }),
        new ol.style.Style({ stroke: new ol.style.Stroke({ color: 'rgba(96,165,250,0.35)', width: 6 }) }),
        new ol.style.Style({ stroke: new ol.style.Stroke({ color: sky, width: 3 }) })
      ];
    }
  });
  infoHighlightLayer.set('infoIgnore', true);
  infoHighlightLayer.set('selectIgnore', true);
  map.addLayer(infoHighlightLayer);

  const topoErrorSource = new ol.source.Vector();
  const topoErrorLayer = new ol.layer.Vector({
    source: topoErrorSource,
    zIndex: 200,
    style: (feature) => {
      const t = feature.getGeometry().getType();
      const red = '#ef4444';
      if (/Point/i.test(t)) {
        return new ol.style.Style({
          image: new ol.style.Circle({
            radius: 6,
            fill: new ol.style.Fill({ color: 'rgba(239,68,68,0.12)' }),
            stroke: new ol.style.Stroke({ color: red, width: 3 })
          })
        });
      }
      if (/LineString/i.test(t)) {
        return [
          new ol.style.Style({ stroke: new ol.style.Stroke({ color: 'rgba(239,68,68,0.35)', width: 8 }) }),
          new ol.style.Style({ stroke: new ol.style.Stroke({ color: red, width: 3 }) })
        ];
      }
      return [
        new ol.style.Style({ fill: new ol.style.Fill({ color: 'rgba(239,68,68,0.08)' }) }),
        new ol.style.Style({ stroke: new ol.style.Stroke({ color: 'rgba(239,68,68,0.35)', width: 6 }) }),
        new ol.style.Style({ stroke: new ol.style.Stroke({ color: red, width: 3 }) })
      ];
    }
  });
  topoErrorLayer.set('infoIgnore', true);
  topoErrorLayer.set('selectIgnore', true);
  map.addLayer(topoErrorLayer);

  const multipartReminderSource = new ol.source.Vector();
  const multipartReminderLayer = new ol.layer.Vector({
    source: multipartReminderSource,
    zIndex: 202,
    style: (feature) => {
      const t = feature.getGeometry().getType();
      const orange = '#f97316';
      if (/Point/i.test(t)) {
        return new ol.style.Style({
          image: new ol.style.Circle({
            radius: 6,
            fill: new ol.style.Fill({ color: 'rgba(249,115,22,0.16)' }),
            stroke: new ol.style.Stroke({ color: orange, width: 3 })
          })
        });
      }
      if (/LineString/i.test(t)) {
        return [
          new ol.style.Style({ stroke: new ol.style.Stroke({ color: 'rgba(249,115,22,0.35)', width: 8 }) }),
          new ol.style.Style({ stroke: new ol.style.Stroke({ color: orange, width: 3 }) })
        ];
      }
      return [
        new ol.style.Style({ fill: new ol.style.Fill({ color: 'rgba(249,115,22,0.08)' }) }),
        new ol.style.Style({ stroke: new ol.style.Stroke({ color: 'rgba(249,115,22,0.35)', width: 6 }) }),
        new ol.style.Style({ stroke: new ol.style.Stroke({ color: orange, width: 3 }) })
      ];
    }
  });
  multipartReminderLayer.set('infoIgnore', true);
  multipartReminderLayer.set('selectIgnore', true);
  map.addLayer(multipartReminderLayer);

  function setInfoHighlight(feature){
    infoHighlightSource.clear(true);
    if (!feature || !feature.getGeometry) return;
    const f = new ol.Feature({ geometry: feature.getGeometry().clone() });
    infoHighlightSource.addFeature(f);
  }
  function setMultipartHighlight(features = []) {
    multipartReminderSource.clear(true);
    if (!Array.isArray(features) || features.length === 0) return;
    features.forEach((feature) => {
      const geometry = feature?.getGeometry?.();
      if (!geometry) return;
      multipartReminderSource.addFeature(new ol.Feature({ geometry: geometry.clone() }));
    });
  }

  return {
    infoHighlightSource,
    topoErrorSource,
    multipartReminderSource,
    setInfoHighlight,
    setMultipartHighlight
  };
}

window.initMapOverlays = initMapOverlays;