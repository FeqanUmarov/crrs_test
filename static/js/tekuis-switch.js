// tekuis-switch.js
// TEKUİS mənbə rejimi: 'old' (tekuis_parcel_old) | 'current' (tekuis_parcel)
(function(){
  let TEKUIS_MODE = 'current';
  const DIFFERENCE_HIGHLIGHT_DURATION_MS = 2000;

  const TEKUIS_SOURCES = {
    old: {
      title: 'TEKUİS (köhnə) məlumatlarına keç',
      uiClass: 'is-old'
    },
    current: {
      title: 'TEKUİS (cari) məlumatlarına keç',
      uiClass: 'is-current'
    }
  };

  function setTekuisMode(mode){
    if (mode === 'old') {
      TEKUIS_MODE = 'old';
    } else {
      TEKUIS_MODE = 'current';
    }
    updateTekuisSwitchUI();
  }

  function updateTekuisSwitchUI(){
    const btn = document.getElementById('btnSwitchTekuis');
    const small = document.querySelector('#cardTekuis .small');
    if (!btn || !small) return;

    const source = TEKUIS_SOURCES[TEKUIS_MODE] || TEKUIS_SOURCES.current;
    const other = TEKUIS_MODE === 'old'
      ? TEKUIS_SOURCES.current
      : TEKUIS_SOURCES.old;

    btn.title = other.title;
    btn.classList.remove('is-old', 'is-current');
    btn.classList.add(source.uiClass);

    const description = TEKUIS_MODE === 'old'
      ? 'Köhnə TEKUİS məlumatları'
      : 'Tədqiqat nəticəsində dəyişdirilmiş TEKUİS Parselləri.';

    small.textContent = description;
  }

  function getNextTekuisMode(){
    if (TEKUIS_MODE === 'current') return 'old';
    if (TEKUIS_MODE === 'old') return 'current';
    return 'current';
  }


  // Ticket və ya meta_id tapmaq üçün yardımçı funksiya
  function getCurrentIdentifier(){
    // 1. window.CURRENT_META_ID yoxla (əgər sistemdə belə bir dəyişən varsa)
    if (window.CURRENT_META_ID) {
      return { type: 'meta_id', value: window.CURRENT_META_ID };
    }
    // 2. Səhifə meta_id-si varsa, onu istifadə et
    if (typeof window.META_ID !== 'undefined' && window.META_ID !== null && window.META_ID !== '') {
      return { type: 'meta_id', value: window.META_ID };
    }
    // 3. Attach list varsa, onun meta_id-sini götür
    if (window.attachListData && window.attachListData.length > 0) {
      const firstAttach = window.attachListData[0];
      if (firstAttach.meta_id) {
        return { type: 'meta_id', value: firstAttach.meta_id };
      }
    }
    
    // 4. GIS data obyektlərindən meta_id tapmağa çalış
    if (window.gisDataFeatures && window.gisDataFeatures.length > 0) {
      const firstFeature = window.gisDataFeatures[0];
      if (firstFeature.properties && firstFeature.properties.fk_metadata) {
        return { type: 'meta_id', value: firstFeature.properties.fk_metadata };
      }
    }
    
    // 5. Əvvəl window.PAGE_TICKET yoxla
    if (window.PAGE_TICKET) {
      return { type: 'ticket', value: window.PAGE_TICKET };
    }
    
    // 6. URL-dən ticket parametrini yoxla
    const urlParams = new URLSearchParams(window.location.search);
    const ticketFromUrl = urlParams.get('ticket');
    if (ticketFromUrl) {
      return { type: 'ticket', value: ticketFromUrl };
    }
    
    // 7. Form və ya DOM elementlərindən ticket tapmağa çalış
    const ticketInput = document.querySelector('input[name="ticket"]');
    if (ticketInput && ticketInput.value) {
      return { type: 'ticket', value: ticketInput.value };
    }
    
    return null;
  }

  function buildTekuisQuery({ metaId = null, source = null } = {}){
    let resolvedMetaId = metaId;
    if (!resolvedMetaId) {
      const identifier = getCurrentIdentifier();
      if (!identifier) {
        console.warn('TEKUİS DB: ticket və ya meta_id tapılmadı');
        Swal.fire('Diqqət', 'Bu səhifədə ticket və ya meta_id tapılmadı. Zəhmət olmasa əvvəlcə məlumat yükləyin.', 'warning');
        return null;
      }
      
      // identifier tipinə görə parametr hazırla
      if (identifier.type === 'meta_id') {
        resolvedMetaId = identifier.value;
      }
    }
    
    const qs = new URLSearchParams();
    if (resolvedMetaId) {
      qs.set('meta_id', resolvedMetaId);
    } else {
      const identifier = getCurrentIdentifier();
      if (identifier && identifier.type === 'ticket') {
        qs.set('ticket', identifier.value);
      } else {
        console.error('TEKUİS DB: nə ticket, nə də meta_id tapıldı');
        Swal.fire('Xəta', 'Məlumat identifikatoru tapılmadı.', 'error');
        return null;
      }
    }
    if (source) {
      qs.set('source', source);
    }

      return `/api/tekuis/parcels/by-db/?${qs.toString()}`;
  }

  async function fetchTekuisGeojsonFromDb({ metaId = null, source = null } = {}){
    const url = buildTekuisQuery({ metaId, source });
    if (!url) return null;
    console.log('TEKUİS DB sorğusu:', url);
    
    try {
      const resp = await fetch(url, { headers: { 'Accept':'application/json' } });
      if (!resp.ok) throw new Error(await resp.text() || `HTTP ${resp.status}`);
      const fc = await resp.json();
      

      if (!fc.features || fc.features.length === 0) {
        console.log('TEKUİS DB: heç bir parsel tapılmadı');
        Swal.fire('Məlumat', 'Database-də saxlanılmış parsel tapılmadı.', 'info');
        return null;
      }
      
      console.log(`TEKUİS DB: ${fc.features.length} parsel tapıldı`);

      return fc;
    } catch (e) {
      console.error('TEKUİS DB error:', e);
      Swal.fire('Xəta', e.message || 'DB-dən TEKUİS parsellərini almaq alınmadı.', 'error');
      return null;
    }
  }

  async function fetchTekuisFromDb({ metaId = null, source = null } = {}){
    const fc = await fetchTekuisGeojsonFromDb({ metaId, source });
    if (!fc) return null;
    window.showTekuis?.(fc);
    return fc;
  }

  function normalizeCoords(value){
    if (Array.isArray(value)) return value.map(normalizeCoords);
    if (typeof value === 'number') return Number(value.toFixed(6));
    return value;
  }

  function getTekuisIdFromProps(props = {}){
    const candKeys = ['tekuis_id', 'TEKUIS_ID', 'ID', 'OBJECTID', 'rid', 'RID'];
    for (const key of candKeys) {
      const val = props?.[key];
      if (val == null || String(val).trim() === '') continue;
      const parsed = Number(val);
      if (!Number.isNaN(parsed)) return parsed;
    }
    return null;
  }

  function getGeometrySignature(geometry){
    if (!geometry) return '';
    const normalized = {
      type: geometry.type,
      coordinates: normalizeCoords(geometry.coordinates)
    };
    return JSON.stringify(normalized);
  }

  function getOlGeometrySignature(feature){
    const geom = feature?.getGeometry?.();
    if (!geom) return '';
    const fmt = new ol.format.GeoJSON();
    const geojsonGeom = fmt.writeGeometryObject(geom, {
      dataProjection: 'EPSG:4326',
      featureProjection: 'EPSG:3857'
    });
    return getGeometrySignature(geojsonGeom);
  }

  function buildOldTekuisIndex(oldFc){
    const byId = new Map();
    const geomSet = new Set();
    (oldFc?.features || []).forEach((feature) => {
      const props = feature?.properties || {};
      const id = getTekuisIdFromProps(props);
      const geomSig = getGeometrySignature(feature?.geometry);
      if (id != null) {
        byId.set(id, geomSig);
      } else if (geomSig) {
        geomSet.add(geomSig);
      }
    });
    return { byId, geomSet };
  }

  function getDifferingCurrentFeatures(currentFeatures, oldIndex){
    const differing = [];
    currentFeatures.forEach((feature) => {
      const props = feature.getProperties?.() || {};
      const id = getTekuisIdFromProps(props);
      const geomSig = getOlGeometrySignature(feature);
      if (id != null) {
        const oldGeom = oldIndex.byId.get(id);
        if (!oldGeom || oldGeom !== geomSig) differing.push(feature);
        return;
      }
      if (!oldIndex.geomSet.has(geomSig)) differing.push(feature);
    });
    return differing;
  }

  function createDifferenceHighlightStyle(){
    return new ol.style.Style({
      fill: new ol.style.Fill({ color: 'rgba(245, 158, 11, 0.35)' }),
      stroke: new ol.style.Stroke({ color: '#f59e0b', width: 3 })
    });
  }

  function highlightTekuisDifferences(features, durationMs = DIFFERENCE_HIGHLIGHT_DURATION_MS){
    if (!features.length) return;
    const style = createDifferenceHighlightStyle();
    const previousStyles = new Map();
    features.forEach((feature) => {
      previousStyles.set(feature, feature.getStyle());
      feature.setStyle(style);
    });
    window.tekuisLayer?.changed?.();
    setTimeout(() => {
      features.forEach((feature) => {
        feature.setStyle(previousStyles.get(feature) || null);
      });
      window.tekuisLayer?.changed?.();
    }, durationMs);
  }

  async function highlightDifferencesWithOldTekuis(){
    const oldFc = await fetchTekuisGeojsonFromDb({ source: 'old' });
    if (!oldFc) return;
    const tekuisSource = window.tekuisSource;
    const currentFeatures = tekuisSource?.getFeatures?.() || [];
    if (!currentFeatures.length) return;
    const oldIndex = buildOldTekuisIndex(oldFc);
    const differing = getDifferingCurrentFeatures(currentFeatures, oldIndex);
    highlightTekuisDifferences(differing, DIFFERENCE_HIGHLIGHT_DURATION_MS);
  }


  async function showTekuisSource(mode, metaId = null){
    const normalizedMode = mode === 'old' ? 'old' : 'current';
    setTekuisMode(normalizedMode);
    await fetchTekuisFromDb({ source: normalizedMode, metaId });
  }

  // TEKUİS kartı DOM-a gələndə düyməni yerinə tik
  function ensureSwitchButton(){
    const card = document.getElementById('cardTekuis');
    if (!card) return;

    const actions = card.querySelector('.card-actions');
    if (!actions) return;

    if (!document.getElementById('btnSwitchTekuis')){
      const btn = document.createElement('button');
      btn.id = 'btnSwitchTekuis';
      btn.className = 'icon-btn ico-switch is-current';
      btn.title = 'Mənbəni dəyiş (tekuis_parcel ↔ tekuis_parcel_old)';
      actions.prepend(btn);

      btn.addEventListener('click', async ()=>{
        const nextMode = getNextTekuisMode();
        // Əvvəlcə identifier olub-olmadığını yoxla
        const identifier = getCurrentIdentifier();
        if (!identifier) {
          Swal.fire('Diqqət', 'Əvvəlcə məlumat yükləyin və ya ticket daxil edin.', 'warning');
          return;
        }

        setTekuisMode(nextMode);
        await fetchTekuisFromDb({ source: nextMode });
        if (nextMode === 'current') {
          await highlightDifferencesWithOldTekuis();
        }

        const chk = document.getElementById('chkTekuisLayer');
        const tekuisVisible = chk ? chk.checked : true;
        if (window.tekuisLayer && window.tekuisSource){
          window.tekuisLayer.setVisible(tekuisVisible && window.tekuisSource.getFeatures().length > 0);
          if (tekuisVisible && window.flashLayer) window.flashLayer(window.tekuisLayer);
        }
      });

      updateTekuisSwitchUI();
    }
  }

  // Panel render olduqca izləyək
  const mo = new MutationObserver(() => ensureSwitchButton());
  window.addEventListener('DOMContentLoaded', () => {
    ensureSwitchButton();
    const panelBody = document.querySelector('.panel-body') || document.body;
    mo.observe(panelBody, { childList:true, subtree:true });
  });
  
  // Global funksiyaları export et (debug üçün)
  window.TekuisSwitch = {
    setMode: setTekuisMode,
    getMode: () => TEKUIS_MODE,
    fetchFromDb: fetchTekuisFromDb,
    showSource: showTekuisSource,
    getCurrentIdentifier: getCurrentIdentifier
  };
})();