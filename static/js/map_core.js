(() => {
  // --- Basemap: Google imagery ---
  const googleImagery = new ol.layer.Tile({
    source: new ol.source.XYZ({
      url: 'https://mt1.google.com/vt/lyrs=s&x={x}&y={y}&z={z}',
      attributions: '© Google'
    })
  });

  const map = new ol.Map({
    target: 'map',
    layers: [googleImagery],
    view: new ol.View({ center: ol.proj.fromLonLat([47, 40]), zoom: 7 })
  });
  window.map = map;

  const basemapApi = window.setupBasemaps?.(map, googleImagery);
  window.basemapApi = basemapApi;

  const mapOverlays = window.mapOverlays || window.initMapOverlays?.(map);
  window.mapOverlays = mapOverlays;

  // === Feature ownership map (feature → source) ===
  const trackFeatureOwnership = window.FeatureOwnership?.trackFeatureOwnership;

  /* =========================
     TEKUİS (M_G_PARSEL) LAY
     ========================= */
  const tekuisSource = new ol.source.Vector();
  trackFeatureOwnership?.(tekuisSource);
  window.setupTekuisSave?.({ tekuisSource, ticket: window.PAGE_TICKET || '' });

  const TEKUIS_STYLE_CONFIG = {
    fillColor: 'rgba(72, 163, 133, 0.15)',
    fillModified: 'rgba(239, 68, 68, 0.25)',
    pointFillColor: 'rgba(72, 163, 133, 0.6)',
    pointFillModified: 'rgba(239, 68, 68, 0.7)',
    strokeDefault: '#4d9bb8',
    strokeModified: '#ef4444',
    strokeWidth: 2,
    pointRadius: 5
  };

  const TEKUIS_MODIFIED_VALUES = new Set([true, 1, '1']);

  function normalizeTekuisGeometryType(type){
    if (type === 'MultiPoint' || type === 'Point') return 'Point';
    if (type === 'MultiLineString' || type === 'LineString') return 'LineString';
    if (type === 'MultiPolygon' || type === 'Polygon') return 'Polygon';
    return 'Polygon';
  }

  function getTekuisModifiedFlag(feature){
    const raw = feature?.get?.('is_modified');
    const props = feature?.getProperties?.() || feature?.properties || {};
    const direct = raw ?? props.is_modified;
    const propKey = direct === undefined
      ? Object.keys(props).find((key) => String(key).toLowerCase() === 'is_modified')
      : null;
    const value = direct ?? (propKey ? props[propKey] : undefined);
    if (TEKUIS_MODIFIED_VALUES.has(value)) {
      return true;
    }
    if (typeof value === 'string') {
      const normalized = value.trim().toLowerCase();
      return normalized === 'true' || normalized === 't' || normalized === 'yes' || normalized === 'y';
    }
    return value === true;
  }

  function getCurrentTekuisMetaId(){
    const identifier = window.TekuisSwitch?.getCurrentIdentifier?.();
    if (identifier?.type === 'meta_id') return identifier.value;
    const fallback = window.CURRENT_META_ID ?? window.META_ID ?? null;
    return fallback;
  }

  function getFeatureMetaId(feature){
    const direct = feature?.get?.('meta_id');
    if (direct !== undefined && direct !== null && direct !== '') return direct;
    const props = feature?.getProperties?.() || feature?.properties || {};
    const candidates = ['meta_id', 'fk_metadata', 'META_ID', 'FK_METADATA'];
    for (const key of candidates) {
      if (props[key] !== undefined && props[key] !== null && props[key] !== '') {
        return props[key];
      }
    }
    const foundKey = Object.keys(props).find(
      (key) => String(key).toLowerCase() === 'meta_id' || String(key).toLowerCase() === 'fk_metadata'
    );
    return foundKey ? props[foundKey] : null;
  }

  function isTekuisFeatureFromCurrentTicket(feature){
    const currentMetaId = getCurrentTekuisMetaId();
    if (currentMetaId === null || currentMetaId === undefined || currentMetaId === '') return true;
    const featureMetaId = getFeatureMetaId(feature);
    if (featureMetaId === null || featureMetaId === undefined || featureMetaId === '') return true;
    return String(featureMetaId) === String(currentMetaId);
  }

  function buildTekuisStyle({ strokeColor, geomType, fillColor, pointFillColor }){
    if (geomType === 'Point') {
      return new ol.style.Style({
        image: new ol.style.Circle({
          radius: TEKUIS_STYLE_CONFIG.pointRadius,
          fill: new ol.style.Fill({ color: pointFillColor ?? TEKUIS_STYLE_CONFIG.pointFillColor }),
          stroke: new ol.style.Stroke({ color: strokeColor, width: TEKUIS_STYLE_CONFIG.strokeWidth })
        })
      });
    }

    if (geomType === 'LineString') {
      return new ol.style.Style({
        stroke: new ol.style.Stroke({ color: strokeColor, width: TEKUIS_STYLE_CONFIG.strokeWidth })
      });
    }

    return new ol.style.Style({
      fill: new ol.style.Fill({ color: fillColor ?? TEKUIS_STYLE_CONFIG.fillColor }),
      stroke: new ol.style.Stroke({ color: strokeColor, width: TEKUIS_STYLE_CONFIG.strokeWidth })
    });
  }

    let tekuisStyleCache = {};

  function rebuildTekuisStyleCache(){
    tekuisStyleCache = {
      Point: {
        default: buildTekuisStyle({ strokeColor: TEKUIS_STYLE_CONFIG.strokeDefault, geomType: 'Point' }),
        modified: buildTekuisStyle({ strokeColor: TEKUIS_STYLE_CONFIG.strokeModified, geomType: 'Point' }),
        modifiedCurrent: buildTekuisStyle({
          strokeColor: TEKUIS_STYLE_CONFIG.strokeModified,
          geomType: 'Point',
          pointFillColor: TEKUIS_STYLE_CONFIG.pointFillModified
        })
      },
      LineString: {
        default: buildTekuisStyle({ strokeColor: TEKUIS_STYLE_CONFIG.strokeDefault, geomType: 'LineString' }),
        modified: buildTekuisStyle({ strokeColor: TEKUIS_STYLE_CONFIG.strokeModified, geomType: 'LineString' }),
        modifiedCurrent: buildTekuisStyle({ strokeColor: TEKUIS_STYLE_CONFIG.strokeModified, geomType: 'LineString' })
      },
      Polygon: {
        default: buildTekuisStyle({ strokeColor: TEKUIS_STYLE_CONFIG.strokeDefault, geomType: 'Polygon' }),
        modified: buildTekuisStyle({ strokeColor: TEKUIS_STYLE_CONFIG.strokeModified, geomType: 'Polygon' }),
        modifiedCurrent: buildTekuisStyle({
          strokeColor: TEKUIS_STYLE_CONFIG.strokeModified,
          geomType: 'Polygon',
          fillColor: TEKUIS_STYLE_CONFIG.fillModified
        })
      }

    };
  }

  rebuildTekuisStyleCache();

  function isTekuisCurrentMode(){
    const mode = window.TekuisSwitch?.getMode?.();
    if (!mode) return true;
    return mode === 'current';
  }


  function getTekuisStyle(feature){
    const geomType = normalizeTekuisGeometryType(feature?.getGeometry?.().getType?.());
    const shouldHighlight = isTekuisCurrentMode()
      && getTekuisModifiedFlag(feature)
      && isTekuisFeatureFromCurrentTicket(feature);
    const variant = shouldHighlight ? 'modifiedCurrent' : 'default';
    return tekuisStyleCache[geomType][variant];
  }

  function hexToRgba(hex, alpha){
    const match = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex || '');
    if (!match) return null;
    const r = parseInt(match[1], 16);
    const g = parseInt(match[2], 16);
    const b = parseInt(match[3], 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }

  function setTekuisBaseColor(hex){
    if (!hex) return;
    TEKUIS_STYLE_CONFIG.strokeDefault = hex;
    const fillColor = hexToRgba(hex, 0.15);
    const pointFillColor = hexToRgba(hex, 0.6);
    if (fillColor) TEKUIS_STYLE_CONFIG.fillColor = fillColor;
    if (pointFillColor) TEKUIS_STYLE_CONFIG.pointFillColor = pointFillColor;
    rebuildTekuisStyleCache();
    if (tekuisLayer){
      tekuisLayer.setStyle(getTekuisStyle);
      tekuisLayer.changed?.();
    }
  }

  const tekuisLayer  = new ol.layer.Vector({
    source: tekuisSource,
    style: getTekuisStyle,
    zIndex: 4,
    visible: false
  });
  tekuisLayer.set('title', 'TEKUİS (M_G_PARSEL)');
  tekuisLayer.set('isTekuisEditable', true);
  tekuisLayer.set('selectIgnore', false);  // Seçim interaction-u bu layı GÖRSÜN
  map.addLayer(tekuisLayer);
  window.tekuisLayer = tekuisLayer;
  window.setTekuisBaseColor = setTekuisBaseColor;

  /* =========================
     NECAS (NECASMAPUSER.PARCEL) LAY
     ========================= */
  const necasSource = new ol.source.Vector();
  trackFeatureOwnership?.(necasSource);
  const necasLayer  = new ol.layer.Vector({
    source: necasSource,
    style: new ol.style.Style({
      fill:   new ol.style.Fill({ color: 'rgba(59,130,246,0.15)' }), // mavi ton
      stroke: new ol.style.Stroke({ color: '#3b82f6', width: 2 })
    }),
    zIndex: 4,
    visible: false
  });
  necasLayer.set('title', 'NECAS (PARCEL)');
  necasLayer.set('selectIgnore', true);
  map.addLayer(necasLayer);
  window.necasLayer = necasLayer;

  // === Info-highlight overlay (sabit seçim görünüşü) ===
  const infoHighlightSource = mapOverlays?.infoHighlightSource;
  const topoErrorSource = mapOverlays?.topoErrorSource;

  // Xətaları xəritədə qırmızı layda göstərən helper
  function renderTopoErrorsOnMap(validation){
    try{
      topoErrorSource?.clear(true);
      if (!validation) return;
      const gj = new ol.format.GeoJSON();
      const add = (arr=[]) => arr.forEach(it=>{
        if (!it?.geom) return;
        const g = gj.readGeometry(it.geom, {
          dataProjection: 'EPSG:4326',
          featureProjection: 'EPSG:3857'
        });
        topoErrorSource?.addFeature(new ol.Feature({ geometry: g }));
      });
      add(validation.overlaps);
      add(validation.gaps);
    }catch(e){ console.warn('renderTopoErrorsOnMap error:', e); }
  }

  // === Zoom edilən obyekt üçün FOKUS layı (xüsusi rəng) ===
  const topoFocusSource = new ol.source.Vector();
  const topoFocusLayer  = new ol.layer.Vector({
    source: topoFocusSource,
    zIndex: 201,
    style: (feature) => {
      const t = feature.getGeometry().getType();
      const fillCol = 'rgba(245,158,11,0.18)'; // yumşaq narıncı fill
      const glowCol = 'rgba(0,0,0,0.30)';      // kənarda yüngül “halo”
      const black   = '#111111';               // qara sərhəd

      if (/Point/i.test(t)) {
        return [
          new ol.style.Style({ // yumşaq halo
            image: new ol.style.Circle({
              radius: 9,
              fill:   new ol.style.Fill({ color: 'rgba(0,0,0,0.08)' }),
              stroke: new ol.style.Stroke({ color: glowCol, width: 8 })
            })
          }),
          new ol.style.Style({ // əsas marker
            image: new ol.style.Circle({
              radius: 7,
              fill:   new ol.style.Fill({ color: fillCol }),
              stroke: new ol.style.Stroke({ color: black, width: 3 })
            })
          })
        ];
      }

      if (/LineString/i.test(t)) {
        return [
          new ol.style.Style({ stroke: new ol.style.Stroke({ color: glowCol, width: 9 }) }), // halo
          new ol.style.Style({ stroke: new ol.style.Stroke({ color: black,   width: 3.5 }) }) // qara sərhəd
        ];
      }

      // Polygon / MultiPolygon
      return [
        new ol.style.Style({ fill:   new ol.style.Fill({ color: fillCol }) }),                  // fill
        new ol.style.Style({ stroke: new ol.style.Stroke({ color: glowCol, width: 7 }) }),      // halo
        new ol.style.Style({ stroke: new ol.style.Stroke({ color: black,   width: 3.5 }) })     // qara sərhəd
      ];
    }
  });

  topoFocusLayer.set('infoIgnore',   true);
  topoFocusLayer.set('selectIgnore', true);
  map.addLayer(topoFocusLayer);

  function zoomAndHighlightTopoGeometry(geom4326){
    try{
      const gj = new ol.format.GeoJSON();
      const geom3857 = gj.readGeometry(geom4326, {
        dataProjection: 'EPSG:4326',
        featureProjection: 'EPSG:3857'
      });

      // ⬇️ QIRMIZI layı təmizləmə! Orada bütün xətalar qala bilər.
      // topoErrorSource.clear(true);  // <-- bunu SİLİN

      // ⬇️ Bunun əvəzinə yalnız fokus layını yenilə
      topoFocusSource.clear(true);
      const feat = new ol.Feature({ geometry: geom3857 });
      topoFocusSource.addFeature(feat);

      // Extent + fit
      let ext = geom3857.getExtent();
      const w = ol.extent.getWidth(ext);
      const h = ol.extent.getHeight(ext);

      let padM = 0;
      if (w === 0 && h === 0) padM = 30;
      else if (w < 15 && h < 15) padM = 30;
      else if (w < 60 && h < 60) padM = 20;
      else if (w < 200 && h < 200) padM = 10;
      if (padM > 0) ext = ol.extent.buffer(ext, padM);

      map.getView().fit(ext, {
        padding: [24, 24, 24, 24],
        duration: 650,
        maxZoom: 20,
        nearest: false,
        constrainOnlyCenter: false
      });

      // Fokus obyektə yumşaq “pulse” — rəngi də fokus rəngi ilə uyğunlaşdıraq
      try{
        if (typeof flashFeature === 'function') {
          flashFeature(feat, { duration: 950, hz: 3, baseColor: '#f59e0b' }); // narıncı
        }
      }catch{}
    }catch(e){
      console.warn('zoom/highlight error geom', e);
    }
  }

  // Topologiya xətası üçün qısa “pulse” effekti (vizual diqqət üçün)
  function pulseTopoHighlight(feature, { duration = 950, hz = 3 } = {}){
    try{
      // Mövcud flashFeature-dən istifadə etmək istəsən:
      if (typeof flashFeature === 'function') {
        return flashFeature(feature, { duration, hz, baseColor: '#ef4444' });
      }
    }catch(e){ /* optional */ }
  }

  // Bir obyektin geometriyasını overlay-ə köçürüb “seçilmiş” göstər
  function setInfoHighlight(feature) {
    mapOverlays?.setInfoHighlight?.(feature);
  }

  window.MapContext = {
    basemapApi,
    infoHighlightSource,
    map,
    mapOverlays,
    necasLayer,
    necasSource,
    renderTopoErrorsOnMap,
    setInfoHighlight,
    tekuisLayer,
    tekuisSource,
    topoErrorSource,
    topoFocusLayer,
    topoFocusSource,
    zoomAndHighlightTopoGeometry,
    pulseTopoHighlight
  };
})();