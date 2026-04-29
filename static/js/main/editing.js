/* =========================
   EDITING & INTERACTIONS
   ========================= */
window.MainEditing = window.MainEditing || {};

window.MainEditing.init = function initEditing(state = {}) {
  const {
    map,
    tekuisSource,
    tekuisLayer,
    necasLayer,
    infoHighlightSource,
    openPanel,
    moveIndicatorToButton,
    setInfoHighlight,
    trackFeatureOwnership,
    getFeatureOwner
  } = state;

  if (!map) return {};

  /* =========================
     REDAKTƏ
     ========================= */
  const editSource = new ol.source.Vector();
  trackFeatureOwnership?.(editSource);
  const editLayer  = new ol.layer.Vector({
    source: editSource,
    style: new ol.style.Style({
      fill:   new ol.style.Fill({ color: 'rgba(245, 158, 11, 0.20)' }),
      stroke: new ol.style.Stroke({ color: '#f59e0b', width: 2 })
    })
  });
  map.addLayer(editLayer);
  const mergePulseCycleMs = 2200;

  const selectInteraction = new ol.interaction.Select({
    layers: (layer) => layer === editLayer,
    style: redSelectStyleFn
  });
  map.addInteraction(selectInteraction);

  const vertexStyle = new ol.style.Style({
    image: new ol.style.Circle({
      radius: 5,
      fill:   new ol.style.Fill({ color: '#ffffff' }),
      stroke: new ol.style.Stroke({ color: '#dc2626', width: 2 })
    })
  });
  const modifyInteraction = new ol.interaction.Modify({
    features: selectInteraction.getFeatures(),
    style: vertexStyle,
    insertVertexCondition: ol.events.condition.never
  });
  map.addInteraction(modifyInteraction);

  const mergeModalHighlightState = {
    isActive: false,
    previewFeature: null
  };
  function buildMergeModalYellowStyle(feature){
    const cycle = (Date.now() % mergePulseCycleMs) / mergePulseCycleMs;
    const pulse = 0.5 + 0.5 * Math.sin(cycle * Math.PI * 2);
    const softYellow = [254, 240, 138];
    const deepYellow = [234, 179, 8];
    const fillColor = [
      interpolateChannel(softYellow[0], deepYellow[0], pulse),
      interpolateChannel(softYellow[1], deepYellow[1], pulse),
      interpolateChannel(softYellow[2], deepYellow[2], pulse)
    ];
    const borderColor = [
      interpolateChannel(245, 158, pulse),
      interpolateChannel(158, 120, pulse),
      interpolateChannel(11, 35, pulse)
    ];
    const fillAlpha = 0.30 + (pulse * 0.35);
    const borderAlpha = 0.72 + (pulse * 0.24);
    const borderWidth = 2.8 + (pulse * 2.8);
    const t = feature.getGeometry().getType();
    if (t === 'Point' || t === 'MultiPoint'){
      return new ol.style.Style({
        image: new ol.style.Circle({
          radius: 6.5 + (pulse * 1.5),
          fill: new ol.style.Fill({ color: rgba(fillColor, Math.min(0.95, fillAlpha + 0.25)) }),
          stroke: new ol.style.Stroke({ color: rgba(borderColor, borderAlpha), width: 2.4 + (pulse * 1.2) })
        })
      });
    } else if (t === 'LineString' || t === 'MultiLineString'){
      return new ol.style.Style({
        stroke: new ol.style.Stroke({
          color: rgba(borderColor, borderAlpha),
          width: borderWidth
        })
      });
    }
    return new ol.style.Style({
      fill: new ol.style.Fill({ color: rgba(fillColor, fillAlpha) }),
      stroke: new ol.style.Stroke({
        color: rgba(borderColor, borderAlpha),
        width: borderWidth
      })
    });
  }

  function redSelectStyleFn(feature){
    if (mergeModalHighlightState.isActive) {
      if (mergeModalHighlightState.previewFeature === feature) {
        return buildMergeModalYellowStyle(feature);
      }
      const tMuted = feature.getGeometry().getType();
      if (tMuted === 'Point' || tMuted === 'MultiPoint'){
        return new ol.style.Style({
          image: new ol.style.Circle({
            radius: 5.5,
            fill: new ol.style.Fill({ color: 'rgba(245, 158, 11, 0.55)' }),
            stroke: new ol.style.Stroke({ color: 'rgba(180, 83, 9, 0.95)', width: 1.5 })
          })
        });
      } else if (tMuted === 'LineString' || tMuted === 'MultiLineString'){
        return new ol.style.Style({
          stroke: new ol.style.Stroke({ color: 'rgba(180, 83, 9, 0.95)', width: 2.8 })
        });
      }
      return new ol.style.Style({
        fill: new ol.style.Fill({ color: 'rgba(245, 158, 11, 0.20)' }),
        stroke: new ol.style.Stroke({ color: 'rgba(180, 83, 9, 0.95)', width: 2.8 })
      });
    }
    const t = feature.getGeometry().getType();
    if (t === 'Point' || t === 'MultiPoint'){
      return new ol.style.Style({
        image: new ol.style.Circle({
          radius: 6,
          fill: new ol.style.Fill({ color: 'rgba(220,38,38,0.9)' }),
          stroke: new ol.style.Stroke({ color: '#ffffff', width: 1.5 })
        })
      });
    } else if (t === 'LineString' || t === 'MultiLineString'){
      return new ol.style.Style({
        stroke: new ol.style.Stroke({ color: '#dc2626', width: 3 })
      });
    }
    return new ol.style.Style({
      fill: new ol.style.Fill({ color: 'rgba(220,38,38,0.15)' }),
      stroke: new ol.style.Stroke({ color: '#dc2626', width: 3 })
    });
  }
  const selectAny = new ol.interaction.Select({
    layers: (layer) => layer instanceof ol.layer.Vector && !layer.get('selectIgnore'),
    style: redSelectStyleFn,
    hitTolerance: 3
  });
  map.addInteraction(selectAny);

  // --- BÜTÜN SEÇİLƏ BİLƏN laylar üçün vertex modify (TEKUİS də daxil)
  const modifyAnyInteraction = new ol.interaction.Modify({
    features: selectAny.getFeatures(),
    style: vertexStyle,
    insertVertexCondition: ol.events.condition.never
  });
  map.addInteraction(modifyAnyInteraction);

  // --- INFO MODE üçün edit/select interaction-ları pauza/bərpa helperləri ---
  let _preInfoActive = null;
  function pauseEditingInteractions(){
    _preInfoActive = {
      selectAny:           selectAny.getActive?.() ?? true,
      selectInteraction:   selectInteraction.getActive?.() ?? true,
      modifyAny:           modifyAnyInteraction.getActive?.() ?? true,
      modifyInteraction:   modifyInteraction.getActive?.() ?? true
    };
    try { selectAny.setActive(false); } catch {}
    try { selectInteraction.setActive(false); } catch {}
    try { modifyAnyInteraction.setActive(false); } catch {}
    try { modifyInteraction.setActive(false); } catch {}
  }

  function resumeEditingInteractions(){
    if (_preInfoActive){
      try { selectAny.setActive(_preInfoActive.selectAny); } catch {}
      try { selectInteraction.setActive(_preInfoActive.selectInteraction); } catch {}
      try { modifyAnyInteraction.setActive(_preInfoActive.modifyAny); } catch {}
      try { modifyInteraction.setActive(_preInfoActive.modifyInteraction); } catch {}
      _preInfoActive = null;
    } else {
      // fallback
      try { selectAny.setActive(true); } catch {}
      try { selectInteraction.setActive(true); } catch {}
      try { modifyAnyInteraction.setActive(true); } catch {}
      try { modifyInteraction.setActive(true); } catch {}
    }
  }


  // TEKUİS dəyişirsə, LS-ə yaz və UI-ni yenilə
  ['addfeature','removefeature','changefeature'].forEach(ev => {
    tekuisSource?.on?.(ev, () => {
      window.saveTekuisToLS?.();
      // Geometriya dəyişdi → həm OK, həm də əvvəlki ignore-ları sıfırla
      window._topoLastOk = null;
      window._lastTopoValidation = null;
      window._ignoredTopo = { overlaps: new Set(), gaps: new Set() };
    });
  });


  /* ---------- SNAP ---------- */
  const snapState = { enabled: false, interactions: [] };
  const snapSources = new Set();

  function addSnapForSource(src){
    const snap = new ol.interaction.Snap({
      source: src, pixelTolerance: 12, edge: true, vertex: true
    });
    map.addInteraction(snap);
    snapState.interactions.push(snap);
  }

  /* NEW: Snap interaction-ları stack-in SONUNA at (Draw/Modify-dən sonra olsun) */
  function refreshSnapOrder(){
    if (!snapState.enabled) return;
    const snaps = snapState.interactions.slice();
    snaps.forEach(i => map.removeInteraction(i));
    snapState.interactions = [];
    snapSources.forEach(addSnapForSource);  // yenidən əlavə → ən sonda olurlar
  }

  function registerSnapSource(src){
    if (!src || snapSources.has(src)) return;
    snapSources.add(src);
    if (snapState.enabled){
      addSnapForSource(src);
      refreshSnapOrder(); // NEW: draw aktivdirsə sıra düzəlsin
    }
  }

  function enableSnap(){
    if (snapState.enabled) return;
    ensureTekuisSnapSources();
    snapState.enabled = true;
    snapSources.forEach(addSnapForSource);
    refreshSnapOrder();                   // NEW
    updateSnapBtnUI && updateSnapBtnUI();
  }

  function disableSnap(){
    if (!snapState.enabled && snapState.interactions.length === 0) return;
    snapState.enabled = false;
    snapState.interactions.forEach(i => map.removeInteraction(i));
    snapState.interactions = [];
    updateSnapBtnUI && updateSnapBtnUI();
  }

  function toggleSnap(){ snapState.enabled ? disableSnap() : enableSnap(); }

  registerSnapSource(editSource);

  if (tekuisSource) {
    registerSnapSource(tekuisSource);
  }


  // Draw (Polygon)
  let drawInteraction = null;

  function startDraw(){
    if (drawInteraction) return;


    drawInteraction = new ol.interaction.Draw({ source: editSource, type: 'Polygon' });
    map.addInteraction(drawInteraction);


    if (snapState.enabled) {
      refreshSnapOrder();
    } else {
      enableSnap();
    }

    drawInteraction.on('drawend', (e) => {
      const f = e.feature;
      const sel = selectInteraction.getFeatures();
      sel.clear(); sel.push(f);
      updateEditStatus && updateEditStatus('Yeni poliqon əlavə edildi. Bitirmək üçün double-click.');
      updateDeleteButtonState && updateDeleteButtonState();
      updateAllSaveButtons();
    });

    updateDrawBtnUI && updateDrawBtnUI(true);
    updateEditStatus && updateEditStatus('Çəkmə aktivdir. Snap açıqdır.');
  }

  function stopDraw(silent=false){
    if (drawInteraction) {
      map.removeInteraction(drawInteraction);
      drawInteraction = null;
    }
    disableSnap();
    updateDrawBtnUI && updateDrawBtnUI(false);
    if (!silent) {
      updateEditStatus && updateEditStatus('Çəkmə dayandırıldı. Snap bağlıdır.');
    }
  }



  /* =============== YADDA SAXLA (frontend) =============== */
  function getUnifiedSelectedFeatures(){
    const a = selectAny.getFeatures().getArray();
    const b = selectInteraction.getFeatures().getArray();
    const set = new Set([...a, ...b]);
    return Array.from(set);
  }

  // Seçilmiş feature hansı laydandır? (yalnız Vector laylar)
  function findVectorLayerAndSourceOfFeature(f){
    if (!f) return null;

    // 1) Əvvəlcə birbaşa ownership xəritəsindən götür
    const ownedSrc = getFeatureOwner?.(f);
    if (ownedSrc) {
      // Həmin source-u daşıyan layer-i tapırıq
      let ownedLayer = null;
      (map.getLayers()?.getArray?.() || []).forEach(layer => {
        if (ownedLayer || !(layer instanceof ol.layer.Vector)) return;
        if (layer.getSource && layer.getSource() === ownedSrc) ownedLayer = layer;
        if (!ownedLayer && layer instanceof ol.layer.Group) {
          (layer.getLayers()?.getArray?.() || []).forEach(l => {
            if (!ownedLayer && l instanceof ol.layer.Vector && l.getSource() === ownedSrc) ownedLayer = l;
          });
        }
      });
      return { layer: ownedLayer, source: ownedSrc };
    }

    // 2) Fallback: xəritədə skan et (köhnə məntiq)
    let hit = null;
    const scan = (layer) => {
      if (hit || !layer) return;
      if (layer instanceof ol.layer.Group) {
        const arr = layer.getLayers()?.getArray?.() || [];
        arr.forEach(scan);
        return;
      }
      if (!(layer instanceof ol.layer.Vector)) return;
      const src = layer.getSource && layer.getSource();
      if (!src?.hasFeature) return;
      if (src.hasFeature(f)) hit = { layer, source: src };
    };
    (map.getLayers()?.getArray?.() || []).forEach(scan);
    return hit;
  }



  function isTekuisLayer(layer){
    if (!(layer instanceof ol.layer.Vector)) return false;
    const title = (layer.get('title') || '').toString().toLowerCase();
    // Bizim marker: isTekuisEditable və ya adında "tekuis" keçməsi
    return layer.get('isTekuisEditable') === true || title.includes('tekuis');
  }

  function isTekuisSource(src){
    if (!src) return false;
    // Lokal tekuisSource-dursa
    if (typeof tekuisSource !== 'undefined' && src === tekuisSource) return true;

    // Xarici/yeni yaradılmış TEKUİS layını tapıb mənbə ilə müqayisə et
    try {
      const ext = findExternalTekuisLayer && findExternalTekuisLayer();
      return !!(ext && src === ext.getSource());
    } catch { return false; }
  }

  function markTekuisFeatureModified(feature) {
    if (!feature || typeof feature.set !== 'function') return;
    const src = resolveFeatureSource(feature);
    if (src && !isTekuisSource(src)) return;
    feature.set('is_modified', true);
  }

  function markTekuisFeaturesModified(features) {
    (features || []).forEach(markTekuisFeatureModified);
  }

  window.markTekuisFeatureModified = markTekuisFeatureModified;
  window.markTekuisFeaturesModified = markTekuisFeaturesModified;




  // --- YENİ: istənilən sayda poliqon seçimi
  function getSelectedPolygons(){
    const arr = getUnifiedSelectedFeatures();
    return arr.filter(f=>{
      const g = f.getGeometry();
      if (!g) return false;
      const t = g.getType();
      return t === 'Polygon' || t === 'MultiPolygon';
    });
  }

  function hasAtLeastOnePolygonSelected(){
    return getSelectedPolygons().length >= 1;
  }
  function cloneFeatureAttributes(feature) {
    const props = { ...(feature?.getProperties?.() || {}) };
    delete props.geometry;
    return props;
  }

  function getSingleSelectedPolygon() {
    const selected = getSelectedPolygons();
    if (selected.length === 0) {
      Swal.fire('Info', 'Hər hansı bir parcel məlumatı seçməlisiz.', 'info');
      return null;
    }
    if (selected.length > 1) {
      Swal.fire('Info', 'Cut üçün yalnız 1 poliqon seçilə bilər.', 'info');
      return null;
    }
    return selected[0];
  }

  async function ensureTurf() {
    if (window.turf) return window.turf;
    return new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'https://cdn.jsdelivr.net/npm/@turf/turf@6/turf.min.js';
      s.onload = () => resolve(window.turf);
      s.onerror = () => reject(new Error('turf.js yüklənmədi'));
      document.head.appendChild(s);
    });
  }

  async function ensureJsts() {
    if (window.jsts) return window.jsts;
    return new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'https://cdn.jsdelivr.net/npm/jsts@2.11.1/dist/jsts.min.js';
      s.onload = () => resolve(window.jsts);
      s.onerror = () => reject(new Error('jsts yüklənmədi'));
      document.head.appendChild(s);
    });
  }

  function createCutLineLayer() {
    const lineSource = new ol.source.Vector();
    const lineLayer = new ol.layer.Vector({
      source: lineSource,
      style: new ol.style.Style({
        stroke: new ol.style.Stroke({
          color: '#2563eb',
          width: 3,
          lineDash: [10, 8]
        })
      })
    });
    lineLayer.set('selectIgnore', true);
    lineLayer.set('infoIgnore', true);
    lineLayer.setZIndex(50);
    map.addLayer(lineLayer);
    return { lineSource, lineLayer };
  }

  function clearCutLine(lineSource) {
    if (lineSource) lineSource.clear(true);
  }

  function setCutButtonActive(on) {
    if (rtEditUI?.btnCut) {
      rtEditUI.btnCut.classList.toggle('active', !!on);
    }
  }

  function updateCutButtonState() {
    if (!rtEditUI?.btnCut) return;
    const selected = getSelectedPolygons();
    const hasSingle = selected.length === 1;
    rtEditUI.btnCut.disabled = false;
    rtEditUI.btnCut.classList.toggle('inactive', !hasSingle);
    rtEditUI.btnCut.title = hasSingle
      ? 'Poliqonu xətt ilə kəs'
      : 'Poliqonu kəsmək üçün əvvəlcə tək bir parsel seçin';
  }

  function updateMergeButtonState() {
    if (!rtEditUI?.btnMerge) return;
    const canMerge = getSelectedPolygons().length >= 2;
    rtEditUI.btnMerge.disabled = false;
    rtEditUI.btnMerge.classList.toggle('inactive', !canMerge);
    rtEditUI.btnMerge.title = canMerge
      ? 'Seçilən poliqonları birləşdir'
      : 'Birləşdirmək üçün ən azı 2 poliqon seçin';
  }

  function getFeatureDisplayId(feature) {
    const props = feature?.getProperties?.() || {};
    const candidates = ['id', 'ID', 'objectid', 'OBJECTID', 'parcel_id', 'PARCEL_ID', 'fid', 'FID'];
    for (const key of candidates) {
      if (props[key] !== undefined && props[key] !== null && props[key] !== '') return props[key];
    }
    return feature?.getId?.() ?? '-';
  }

  function getFeatureCategory(feature) {
    const props = feature?.getProperties?.() || {};
    const candidates = [
      'LAND_CATEGORY_ENUM',
      'land_category_enum',
      'category',
      'CATEGORY',
      'kateqoriya',
      'KATEQORIYA'
    ];
    for (const key of candidates) {
      if (props[key] !== undefined && props[key] !== null && props[key] !== '') return props[key];
    }
    return '-';
  }

  const mergePreviewSource = new ol.source.Vector();
  let mergePulseTimer = null;
  function interpolateChannel(from, to, ratio) {
    return Math.round(from + ((to - from) * ratio));
  }
  function rgba(color, alpha) {
    return `rgba(${color[0]}, ${color[1]}, ${color[2]}, ${alpha.toFixed(3)})`;
  }
  const mergePreviewLayer = new ol.layer.Vector({
    source: mergePreviewSource,
    style: () => {
      const cycle = (Date.now() % mergePulseCycleMs) / mergePulseCycleMs;
      const pulse = 0.5 + 0.5 * Math.sin(cycle * Math.PI * 2);
      const softYellow = [254, 240, 138];
      const deepYellow = [234, 179, 8];
      const fillColor = [
        interpolateChannel(softYellow[0], deepYellow[0], pulse),
        interpolateChannel(softYellow[1], deepYellow[1], pulse),
        interpolateChannel(softYellow[2], deepYellow[2], pulse)
      ];
      const borderColor = [
        interpolateChannel(245, 158, pulse),
        interpolateChannel(158, 120, pulse),
        interpolateChannel(11, 35, pulse)
      ];
      const fillAlpha = 0.42 + (pulse * 0.30);
      const borderAlpha = 0.68 + (pulse * 0.28);
      const borderWidth = 2.8 + (pulse * 3.9);
      const dashOffset = cycle * 30;
      return ([
        new ol.style.Style({
          fill: new ol.style.Fill({ color: rgba(fillColor, fillAlpha) }),
          stroke: new ol.style.Stroke({ color: rgba(borderColor, 0.98), width: borderWidth + 1.2 })
        }),
        new ol.style.Style({
          stroke: new ol.style.Stroke({
            color: rgba(deepYellow, borderAlpha),
            width: borderWidth,
            lineDash: [16, 10],
            lineDashOffset: dashOffset
          })
        }),
        new ol.style.Style({
          stroke: new ol.style.Stroke({ color: 'rgba(120, 53, 15, 0.95)', width: 1.6 })
        })
      ]);
    }
  });
  mergePreviewLayer.set('selectIgnore', true);
  map.addLayer(mergePreviewLayer);

  function startMergePreviewPulse() {
    if (mergePulseTimer !== null) return;
    mergePulseTimer = window.setInterval(() => {
      if (mergePreviewSource.getFeatures().length === 0) return;
      map.render();
    }, 120);
  }

  function stopMergePreviewPulse() {
    if (mergePulseTimer === null) return;
    window.clearInterval(mergePulseTimer);
    mergePulseTimer = null;
  }

  function clearMergePreview() {
    mergePreviewSource.clear();
    mergeModalHighlightState.previewFeature = null;
  }

  function previewMergeFeature(feature, { animateView = false } = {}) {
    if (!feature) return;
    clearMergePreview();
    mergeModalHighlightState.previewFeature = feature;
    const clone = feature.clone();
    mergePreviewSource.addFeature(clone);
    if (animateView) {
      const extent = clone.getGeometry?.()?.getExtent?.();
      if (extent && extent.every((n) => Number.isFinite(n))) {
        map.getView().fit(extent, {
          padding: [110, 110, 110, 110],
          duration: 550,
          maxZoom: 20
        });
      }
    }
  }

  function getAllFeatureAttributes(feature) {
    const props = { ...(feature?.getProperties?.() || {}) };
    delete props.geometry;
    const entries = Object.entries(props)
      .filter(([k]) => k !== '__ownerSource')
      .sort(([a], [b]) => a.localeCompare(b, 'az'));
    return entries;
  }
  const ATTRIBUTE_LABELS = {
    LAND_CATEGORY2ENUM: 'Uqodiya',
    LAND_CATEGORY4ENUM: 'Alt uqodiya',
    LAND_CATEGORY_ENUM: 'Kateqoriya',
    LAND_CATEGORY3ENUM: 'Alt kateqoriya',
    NAME: 'Qeyd',
    OWNER_TYPE_ENUM: 'Mülkiyyət',
    SUVARILMA_NOVU_ENUM: 'Suvarma',
    EMLAK_NOVU_ENUM: 'Emlak növü',
    OLD_LAND_CATEGORY2ENUM: 'İslahat uqodiyası',
    TERRITORY_NAME: 'Ünvan',
    RAYON_ADI: 'Rayonun adı',
    IED_ADI: 'İƏD adı',
    BELEDIYE_ADI: 'Bələdiyyə adı',
    AREA_HA: 'Sahə (hektarla)',
    CADASTER_NUMBER: 'Kadastr nömrəsi',
    KATEQORIYA: 'Kateqoriya',
    UQODIYA: 'Uqodiyası'
  };
  const ATTRIBUTE_LABELS_UPPER = Object.fromEntries(
    Object.entries(ATTRIBUTE_LABELS).map(([key, value]) => [String(key).toUpperCase(), value])
  );
  function getAttributeDisplayLabel(rawKey) {
    return ATTRIBUTE_LABELS_UPPER[String(rawKey).toUpperCase()] || rawKey;
  }

  function ensureMergeModal() {
    if (window.__rtMergeModal) return window.__rtMergeModal;
    const overlay = document.createElement('div');
    overlay.className = 'rt-merge-overlay';
    const modal = document.createElement('div');
    modal.className = 'rt-merge-modal';
    modal.innerHTML = `
      <div class="rt-merge-head">
        <h3 class="rt-merge-title">Poliqon birləşdirmə</h3>
        <button type="button" class="rt-merge-close" aria-label="Bağla">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"><path stroke-width="2" d="M18 6L6 18M6 6l12 12"/></svg>
        </button>
      </div>
      <div class="rt-merge-body">
        <div class="rt-merge-hint">Atributların saxlanacağı poliqonu seçin.</div>
        <div class="rt-merge-table-wrap">
          <table class="rt-merge-table">
            <thead><tr><th>ID</th><th>Kateqoriya</th><th class="rt-merge-eye-col">Detallar</th></tr></thead>
            <tbody></tbody>
          </table>
        </div>
      </div>
      <div class="rt-merge-foot">
        <div class="rt-merge-foot-note">Sətrə klik: xəritədə poliqonu vurğula</div>
        <button type="button" class="btn btn--ghost rt-merge-cancel">Ləğv et</button>
        <button type="button" class="btn btn--primary rt-merge-apply">Tətbiq et</button>
      </div>`;
    const attrModal = document.createElement('div');
    attrModal.className = 'rt-attr-modal';
    attrModal.innerHTML = `
      <div class="rt-merge-head">
        <h3 class="rt-merge-title">Obyekt atributları</h3>
        <button type="button" class="rt-merge-close rt-attr-close" aria-label="Bağla">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"><path stroke-width="2" d="M18 6L6 18M6 6l12 12"/></svg>
        </button>
      </div>
      <div class="rt-merge-body rt-attr-body"></div>
      <div class="rt-merge-foot">
        <div class="rt-merge-foot-note">Bütün atributlar burada göstərilir</div>
        <button type="button" class="btn btn--primary rt-attr-close">Bağla</button>
      </div>
    `;
    document.body.append(overlay, modal, attrModal);

    const renderAttrModal = (feature) => {
      const body = attrModal.querySelector('.rt-attr-body');
      const attrs = getAllFeatureAttributes(feature);
      if (!attrs.length) {
        body.innerHTML = '<div class="rt-attr-empty">Atribut məlumatı tapılmadı.</div>';
        return;
      }
      body.innerHTML = `
        <div class="rt-attr-grid">
          ${attrs.map(([k, v]) => `
            <div class="rt-attr-row">
              <div class="rt-attr-key">${getAttributeDisplayLabel(k)}</div>
              <div class="rt-attr-val">${v === null || v === undefined || v === '' ? '—' : String(v)}</div>
            </div>
          `).join('')}
        </div>
      `;
    };

    const close = () => {
      overlay.style.display = 'none';
      modal.style.display = 'none';
      attrModal.style.display = 'none';
      modal.classList.remove('rt-merge-open');
      modal.dataset.baseIndex = '';
      modal.querySelector('tbody').innerHTML = '';
      mergeModalHighlightState.isActive = false;
      mergeModalHighlightState.previewFeature = null;
      stopMergePreviewPulse();
      clearMergePreview();
      map.render();
    };
    const closeAttr = () => {
      attrModal.style.display = 'none';
    };
    overlay.addEventListener('click', close);
    modal.querySelector('.rt-merge-close').addEventListener('click', close);
    modal.querySelector('.rt-merge-cancel').addEventListener('click', close);
    attrModal.querySelectorAll('.rt-attr-close').forEach((el) => el.addEventListener('click', closeAttr));

    const head = modal.querySelector('.rt-merge-head');
    let dragging = false, sx = 0, sy = 0, sl = 0, st = 0;
    head.addEventListener('mousedown', (e) => {
      if (e.target.closest('button')) return;
      dragging = true;
      const rect = modal.getBoundingClientRect();
      modal.style.left = `${rect.left}px`;
      modal.style.top = `${rect.top}px`;
      modal.style.transform = 'none';
      sx = e.clientX; sy = e.clientY; sl = rect.left; st = rect.top;
      document.body.style.userSelect = 'none';
    });
    window.addEventListener('mousemove', (e) => {
      if (!dragging) return;
      const ww = window.innerWidth, wh = window.innerHeight;
      const nw = modal.offsetWidth, nh = modal.offsetHeight;
      const L = Math.max(8, Math.min(ww - nw - 8, sl + (e.clientX - sx)));
      const T = Math.max(8, Math.min(wh - nh - 8, st + (e.clientY - sy)));
      modal.style.left = `${L}px`;
      modal.style.top = `${T}px`;
    });
    window.addEventListener('mouseup', () => {
      if (!dragging) return;
      dragging = false;
      document.body.style.userSelect = '';
    });

    window.__rtMergeModal = { overlay, modal, attrModal, close, renderAttrModal };
    return window.__rtMergeModal;
  }

  function getMergeSelection() {
    return getSelectedPolygons().filter((feature) => {
      const src = resolveFeatureSource(feature);
      return !!src && (src === editSource || isTekuisSource(src));
    });
  }

  async function mergePolygonsByBase(selected, baseFeature) {
    const source = resolveFeatureSource(baseFeature);
    if (!source) return { ok: false, message: 'Seçilən obyektin mənbəyi tapılmadı.' };
    if (!selected.every((f) => resolveFeatureSource(f) === source)) {
      return { ok: false, message: 'Birləşdirmə üçün poliqonlar eyni laydan seçilməlidir.' };
    }
    const turf = await ensureTurf();
    const gjFmt = new ol.format.GeoJSON();
    const toGJ = (f) => gjFmt.writeFeatureObject(f, {
      dataProjection: 'EPSG:4326',
      featureProjection: 'EPSG:3857'
    });

    let merged = toGJ(selected[0]);
    for (let i = 1; i < selected.length; i += 1) {
      merged = turf.union(merged, toGJ(selected[i]));
      if (!merged) return { ok: false, message: 'Birləşdirmə nəticəsi alına bilmədi.' };
      const typ = merged.geometry?.type;
      if (typ === 'MultiPolygon') {
        return { ok: false, message: 'Poliqonlar yan-yana olmadıqda birləşdirmə aparıla bilməz.' };
      }
    }
    if (merged.geometry?.type !== 'Polygon') {
      return { ok: false, message: 'Yalnız poliqon həndəsələri birləşdirilə bilər.' };
    }

    const mergedFeature = gjFmt.readFeature(merged, {
      dataProjection: 'EPSG:4326',
      featureProjection: 'EPSG:3857'
    });
    mergedFeature.setProperties(cloneFeatureAttributes(baseFeature));
    const wasInAny = selected.some((f) => selectAny.getFeatures().getArray().includes(f));
    const wasInSelect = selected.some((f) => selectInteraction.getFeatures().getArray().includes(f));
    selected.forEach((f) => {
      try { source.removeFeature(f); } catch {}
      try { selectAny.getFeatures().remove(f); } catch {}
      try { selectInteraction.getFeatures().remove(f); } catch {}
    });
    source.addFeature(mergedFeature);
    if (wasInAny) selectAny.getFeatures().push(mergedFeature);
    if (wasInSelect) selectInteraction.getFeatures().push(mergedFeature);
    markTekuisFeaturesModified([...selected, mergedFeature]);
    try { window.saveTekuisToLS?.(); } catch {}
    updateDeleteButtonState();
    updateAllSaveButtons();
    return { ok: true };
  }

  async function openMergeModal() {
    const selected = getMergeSelection();
    if (selected.length < 2) {
      Swal.fire('Diqqət', 'Ən azı iki poliqon seçməlisiniz', 'warning');
      return;
    }
    const { overlay, modal, attrModal, close, renderAttrModal } = ensureMergeModal();
    const tbody = modal.querySelector('tbody');
    tbody.innerHTML = '';
    modal.dataset.baseIndex = '0';

    selected.forEach((feature, index) => {
      const row = document.createElement('tr');
      row.innerHTML = `
        <td>${getFeatureDisplayId(feature)}</td>
        <td>${getFeatureCategory(feature)}</td>
        <td class="rt-merge-eye-col">
          <button type="button" class="rt-row-eye" aria-label="Atributlara bax">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true">
              <path stroke-width="1.8" d="M2 12s3.8-6 10-6 10 6 10 6-3.8 6-10 6-10-6-10-6z"></path>
              <circle cx="12" cy="12" r="2.9" stroke-width="1.8"></circle>
            </svg>
          </button>
        </td>`;
      if (index === 0) row.classList.add('selected');
      row.addEventListener('click', () => {
        modal.dataset.baseIndex = String(index);
        tbody.querySelectorAll('tr').forEach((el) => el.classList.remove('selected'));
        row.classList.add('selected');
        previewMergeFeature(feature, { animateView: true });
      });
      row.querySelector('.rt-row-eye')?.addEventListener('click', (event) => {
        event.stopPropagation();
        renderAttrModal(feature);
        attrModal.style.display = 'flex';
        attrModal.style.left = '50%';
        attrModal.style.top = '104px';
        attrModal.style.transform = 'translateX(-50%)';
      });
      tbody.appendChild(row);
    });

    const applyBtn = modal.querySelector('.rt-merge-apply');
    applyBtn.onclick = async () => {
      const idx = Number.parseInt(modal.dataset.baseIndex || '0', 10);
      const baseFeature = selected[idx] || selected[0];
      const result = await mergePolygonsByBase(selected, baseFeature);
      if (!result.ok) {
        Swal.fire('Diqqət', result.message || 'Birləşdirmə alınmadı.', 'warning');
        return;
      }
      close();
      Swal.fire('Uğurlu', 'Poliqonlar birləşdirildi.', 'success');
    };

    overlay.style.display = 'block';
    modal.style.display = 'flex';
    modal.style.left = '50%';
    modal.style.top = '84px';
    modal.style.transform = 'translateX(-50%)';
    modal.classList.add('rt-merge-open');
    mergeModalHighlightState.isActive = true;
    startMergePreviewPulse();
    previewMergeFeature(selected[0], { animateView: false });
    map.render();
  }

  function normalizePolygonFeatures(polygonFeature) {
    const geom = polygonFeature?.geometry;
    if (!geom) return [];
    if (geom.type === 'Polygon') return [polygonFeature];
    if (geom.type !== 'MultiPolygon') return [];
    const props = polygonFeature.properties || {};
    return geom.coordinates.map(coords => ({
      type: 'Feature',
      properties: { ...props },
      geometry: { type: 'Polygon', coordinates: coords }
    }));
  }
  function expandPolygonsForSplit(turf, polygonFeature) {
    if (typeof turf.unkinkPolygon !== 'function') return [polygonFeature];
    try {
      const unkinked = turf.unkinkPolygon(polygonFeature);
      const features = unkinked?.features;
      if (!Array.isArray(features) || features.length === 0) {
        return [polygonFeature];
      }
      const props = polygonFeature.properties || {};
      return features.map((feature) => ({
        type: 'Feature',
        properties: { ...props, ...(feature.properties || {}) },
        geometry: feature.geometry
      }));
    } catch (error) {
      console.warn('unkinkPolygon failed, using original polygon.', error);
      return [polygonFeature];
    }
  }

  function collectPolygonLineFeatures(turf, polygonFeature) {
    if (typeof turf.polygonToLine !== 'function') return [];
    const polygonLine = turf.polygonToLine(polygonFeature);
    if (!polygonLine) return [];
    if (polygonLine.type === 'FeatureCollection') {
      return polygonLine.features || [];
    }
    if (polygonLine.type === 'Feature') return [polygonLine];
    return [{ type: 'Feature', geometry: polygonLine, properties: {} }];
  }


  function splitPolygonFallback(turf, polygonFeature, lineForSplit) {
    if (
      typeof turf.polygonToLine !== 'function' ||
      typeof turf.lineSplit !== 'function' ||
      typeof turf.polygonize !== 'function'
    ) {
      return { ok: false, reason: 'no-polygon-split' };
    }
    try {
      const boundaryLines = collectPolygonLineFeatures(turf, polygonFeature);
      if (boundaryLines.length === 0) {
        return { ok: false, reason: 'split-failed' };
      }

      const splitBoundary = [];
      boundaryLines.forEach((lineFeature) => {
        const split = turf.lineSplit(lineFeature, lineForSplit);
        if (split?.features?.length) {
          splitBoundary.push(...split.features);
        } else {
          splitBoundary.push(lineFeature);
        }
      });

      const polygonized = turf.polygonize(
        turf.featureCollection([...splitBoundary, lineForSplit])
      );
      const polygons = polygonized?.features || [];
      if (polygons.length < 2) {
        return { ok: true, split: false, features: [polygonFeature] };
      }

      let filtered = polygons;
      if (typeof turf.booleanPointInPolygon === 'function') {
        filtered = polygons.filter((feature) => {
          const center = turf.centroid(feature);
          return turf.booleanPointInPolygon(center, polygonFeature);
        });
      } else if (typeof turf.booleanWithin === 'function') {
        filtered = polygons.filter((feature) => turf.booleanWithin(feature, polygonFeature));
      }

      if (filtered.length < 2) {
        return { ok: true, split: false, features: [polygonFeature] };
      }
      return { ok: true, split: true, features: filtered };
    } catch (error) {
      console.error('polygonSplit fallback error', error);
      return { ok: false, reason: 'split-failed' };
    }
  }

  function splitPolygonFeature(turf, polygonFeature, lineForSplit) {
    try {
      if (typeof turf.booleanIntersects === 'function') {
        const intersects = turf.booleanIntersects(polygonFeature, lineForSplit);
        if (!intersects) {
          return { ok: true, split: false, features: +[polygonFeature] };
        }
      }
      if (typeof turf.polygonSplit !== 'function') {
        return splitPolygonFallback(turf, polygonFeature, lineForSplit);
      }
      const split = turf.polygonSplit(polygonFeature, lineForSplit);
      const splitFeatures = split?.features || [];
      if (splitFeatures.length < 2) {
        return { ok: true, split: false, features: [polygonFeature] };
      }
      return { ok: true, split: true, features: splitFeatures };
    } catch (error) {
      if (typeof turf.polygonSplit !== 'function') {
        return splitPolygonFallback(turf, polygonFeature, lineForSplit);
      }
      try {
        if (typeof turf.buffer === 'function') {
          const buffered = turf.buffer(polygonFeature, 0, { units: 'kilometers' });
          if (buffered?.geometry) {
            const split = turf.polygonSplit(buffered, lineForSplit);
            const splitFeatures = split?.features || [];
            if (splitFeatures.length >= 2) {
              return { ok: true, split: true, features: splitFeatures };
            }
          }
        }
      } catch (retryError) {
        console.error('polygonSplit retry error', retryError);
      }
      console.error('polygonSplit error', error);
      return { ok: false, reason: 'split-failed' };
    }
  }
  function stripZCoords(coords) {
    if (!Array.isArray(coords)) return coords;
    if (typeof coords[0] === 'number') return coords.slice(0, 2);
    return coords.map(stripZCoords);
  }

  function prepareFeatureForSplit(turf, feature) {
    if (!feature?.geometry?.coordinates) return feature;
    let cleaned = {
      ...feature,
      geometry: {
        ...feature.geometry,
        coordinates: stripZCoords(feature.geometry.coordinates)
      }
    };
    if (typeof turf.cleanCoords === 'function') {
      try {
        cleaned = turf.cleanCoords(cleaned);
      } catch {
        cleaned = cleaned;
      }
    }
    if (typeof turf.truncate === 'function') {
      try {
        cleaned = turf.truncate(cleaned, { precision: 6, coordinates: 2, mutate: false });
      } catch {
        cleaned = cleaned;
      }
    }
    return cleaned;
  }

  function resolveFeatureSource(feature) {
    const hit = findVectorLayerAndSourceOfFeature(feature);
    if (hit?.source) return hit.source;
    if (typeof tekuisSource !== 'undefined' && tekuisSource?.hasFeature?.(feature)) {
      return tekuisSource;
    }
    if (editSource?.hasFeature?.(feature)) return editSource;
    return null;
  }


  function splitPolygonGeometry(turf, polygonGJ, lineForSplit) {
    const cleanedPolygon = prepareFeatureForSplit(turf, polygonGJ);
    const cleanedLine = prepareFeatureForSplit(turf, lineForSplit);
    const polygons = normalizePolygonFeatures(cleanedPolygon)
      .flatMap(polygonFeature => expandPolygonsForSplit(turf, polygonFeature));
    if (polygons.length === 0) return { ok: false, reason: 'no-polygon' };

    let didSplit = false;
    const outFeatures = [];
    for (const polygonFeature of polygons) {
      const splitResult = splitPolygonFeature(turf, polygonFeature, cleanedLine);
      if (!splitResult.ok) return splitResult;
      if (splitResult.split) didSplit = true;
      outFeatures.push(...splitResult.features);
    }
    if (!didSplit) return { ok: false, reason: 'no-split' };
    return { ok: true, features: outFeatures };
  }

  function collectPolygonGeometries(geometry) {
    if (!geometry) return [];
    const type = geometry.getType?.();
    if (type === 'Polygon') return [geometry];
    if (type === 'MultiPolygon') {
      if (typeof geometry.getPolygons === 'function') return geometry.getPolygons();
      const coords = geometry.getCoordinates?.() || [];
      return coords.map((polyCoords) => new ol.geom.Polygon(polyCoords));
    }
    return [];
  }

  function buildJstsParser(jsts) {
    const parser = new jsts.io.OL3Parser();
    if (typeof parser.inject === 'function') {
      parser.inject(
        ol.geom.Point,
        ol.geom.LineString,
        ol.geom.LinearRing,
        ol.geom.Polygon,
        ol.geom.MultiPoint,
        ol.geom.MultiLineString,
        ol.geom.MultiPolygon
      );
    }
    return parser;
  }

  function toHolePolygon(parser, holeRing) {
    const coords = holeRing.getCoordinates().map((c) => [c.x, c.y]);
    return parser.read(new ol.geom.Polygon([coords]));
  }

  function splitPolygonWithJsts(parser, polygonGeom, lineGeom) {
    const polygonToSplit = parser.read(polygonGeom);
    const line = parser.read(lineGeom);
    const holes = [];
    const holeCount = polygonToSplit.getNumInteriorRing();
    for (let i = 0; i < holeCount; i += 1) {
      holes.push(polygonToSplit.getInteriorRingN(i));
    }

    const union = polygonToSplit.getExteriorRing().union(line);
    const polygonizer = new jsts.operation.polygonize.Polygonizer();
    polygonizer.add(union);
    const polygons = polygonizer.getPolygons();
    const polygonsArray = polygons.array || polygons.toArray?.() || [];

    if (polygonsArray.length < 2) {
      return { ok: true, split: false, geometries: [polygonToSplit] };
    }

    const splitGeometries = polygonsArray.map((geom) => {
      let updatedGeom = geom;
      holes.forEach((hole) => {
        const holePolygon = toHolePolygon(parser, hole);
        updatedGeom = updatedGeom.difference(holePolygon);
      });
      return updatedGeom;
    });

    return { ok: true, split: true, geometries: splitGeometries };
  }

  async function splitPolygonByLineUsingJsts(targetFeature, lineFeature) {
    const jsts = await ensureJsts();
    if (!jsts?.io?.OL3Parser) {
      return { ok: false, reason: 'no-jsts' };
    }

    const polygonGeom = targetFeature?.getGeometry?.();
    const lineGeom = lineFeature?.getGeometry?.();
    if (!polygonGeom || !lineGeom) {
      return { ok: false, reason: 'no-geometry' };
    }

    const parser = buildJstsParser(jsts);
    const polygons = collectPolygonGeometries(polygonGeom);
    if (polygons.length === 0) {
      return { ok: false, reason: 'no-polygon' };
    }

    const outGeometries = [];
    let didSplit = false;
    for (const polygon of polygons) {
      const splitResult = splitPolygonWithJsts(parser, polygon, lineGeom);
      if (!splitResult.ok) return splitResult;
      if (splitResult.split) didSplit = true;
      splitResult.geometries.forEach((geom) => {
        const olGeom = parser.write(geom);
        const collected = collectPolygonGeometries(olGeom);
        if (collected.length) {
          outGeometries.push(...collected);
        }
      });
    }

    if (!didSplit) {
      return { ok: false, reason: 'no-split' };
    }

    return { ok: true, geometries: outGeometries };
  }

  async function splitPolygonByLineUsingTurf(targetFeature, lineFeature) {



    const gjFmt = new ol.format.GeoJSON();
    const turf = await ensureTurf();
    const polygonGJ = gjFmt.writeFeatureObject(targetFeature, {
      dataProjection: 'EPSG:4326',
      featureProjection: 'EPSG:3857'
    });
    const lineGJ = gjFmt.writeFeatureObject(lineFeature, {
      dataProjection: 'EPSG:4326',
      featureProjection: 'EPSG:3857'
    });

    const lineForSplit = extendCutLineForSplit(turf, polygonGJ, lineGJ);
    const splitResult = splitPolygonGeometry(turf, polygonGJ, lineForSplit);
    if (!splitResult.ok) return splitResult;

    const newFeatures = gjFmt.readFeatures(
      { type: 'FeatureCollection', features: splitResult.features },
      { dataProjection: 'EPSG:4326', featureProjection: 'EPSG:3857' }
    );

    return { ok: true, geometries: newFeatures.map((feature) => feature.getGeometry()) };
  }

  async function splitPolygonByLine(targetFeature, lineFeature) {
    if (!targetFeature || !lineFeature) return { ok: false, reason: 'no-target' };
    const targetSource = resolveFeatureSource(targetFeature);
    if (!targetSource) return { ok: false, reason: 'no-source' };

    let splitResult;
    try {
      splitResult = await splitPolygonByLineUsingJsts(targetFeature, lineFeature);
    } catch (error) {
      console.warn('JSTS split failed, fallback to turf.', error);
      splitResult = { ok: false, reason: 'jsts-failed' };
    }
    if (!splitResult.ok && splitResult.reason !== 'no-split') {
      try {
        splitResult = await splitPolygonByLineUsingTurf(targetFeature, lineFeature);
      } catch (error) {
        console.warn('Turf split failed.', error);
      }
    }
    if (!splitResult.ok) return splitResult;

    const newFeatures = splitResult.geometries.map((geom) => new ol.Feature({ geometry: geom }));
    const baseProps = cloneFeatureAttributes(targetFeature);

    const selectAnyFeatures = selectAny.getFeatures();
    const selectInteractionFeatures = selectInteraction.getFeatures();
    const wasInSelectAny = selectAnyFeatures.getArray().includes(targetFeature);
    const wasInSelectInteraction = selectInteractionFeatures.getArray().includes(targetFeature);

    try { targetSource.removeFeature(targetFeature); } catch {}
    if (wasInSelectAny) { try { selectAnyFeatures.remove(targetFeature); } catch {} }
    if (wasInSelectInteraction) { try { selectInteractionFeatures.remove(targetFeature); } catch {} }

    newFeatures.forEach((feature) => {
      feature.setProperties(baseProps);
      targetSource.addFeature(feature);
    });
    markTekuisFeaturesModified(newFeatures);

    if (wasInSelectAny) {
      newFeatures.forEach(f => selectAnyFeatures.push(f));
    }
    if (wasInSelectInteraction) {
      newFeatures.forEach(f => selectInteractionFeatures.push(f));
    }

    try { window.saveTekuisToLS?.(); } catch {}
    updateDeleteButtonState();
    updateAllSaveButtons();
    updateCutButtonState();
    applyRightToolLocks();

    return { ok: true, createdCount: newFeatures.length };
  }

  const cutState = {
    enabled: false,
    targetFeature: null,
    draw: null,
    lineSource: null,
    lineLayer: null,
    wasSnapEnabled: false,
    escHandler: null
  };

  function getPolygonDiagonalKm(turf, polygonGJ) {
    const bbox = turf.bbox(polygonGJ);
    const sw = [bbox[0], bbox[1]];
    const ne = [bbox[2], bbox[3]];
    const diagonal = turf.distance(sw, ne, { units: 'kilometers' });
    return Math.max(diagonal, 0.01);
  }

  function extendCutLineForSplit(turf, polygonGJ, lineGJ) {
    try {
      const distance = getPolygonDiagonalKm(turf, polygonGJ);
      return turf.lineExtend(lineGJ, distance, distance, { units: 'kilometers' });
    } catch (error) {
      console.warn('Cut line extend failed, using original line.', error);
      return lineGJ;
    }
  }

  function ensureTekuisSnapSources() {
    const sources = new Set();
    if (typeof tekuisSource !== 'undefined' && tekuisSource) {
      sources.add(tekuisSource);
    }
    try {
      const extLayer = findExternalTekuisLayer?.();
      const extSource = extLayer?.getSource?.();
      if (extSource) sources.add(extSource);
    } catch (error) {
      console.warn('External TEKUİS snap source lookup failed.', error);
    }
    const scan = (layer) => {
      if (!layer) return;
      if (layer instanceof ol.layer.Group) {
        (layer.getLayers()?.getArray?.() || []).forEach(scan);
        return;
      }
      if (!isTekuisLayer(layer)) return;
      const source = layer.getSource?.();
      if (source) sources.add(source);
    };
    (map.getLayers()?.getArray?.() || []).forEach(scan);
    sources.forEach(registerSnapSource);
  }

  function disableCutMode({ silent = false } = {}) {
    if (cutState.draw) {
      try { map.removeInteraction(cutState.draw); } catch {}
      cutState.draw = null;
    }
    if (cutState.lineSource) {
      clearCutLine(cutState.lineSource);
    }
    if (!cutState.wasSnapEnabled) {
      disableSnap();
    }
    cutState.targetFeature = null;
    cutState.enabled = false;
    setCutButtonActive(false);
    resumeEditingInteractions();

    if (cutState.escHandler) {
      document.removeEventListener('keydown', cutState.escHandler);
      cutState.escHandler = null;
    }

    if (!silent) {
      updateCutButtonState();
    }
  }

  async function enableCutMode() {
    if (!ensureEditAllowed()) return;
    const targetFeature = getSingleSelectedPolygon();
    if (!targetFeature) return;

    cutState.targetFeature = targetFeature;
    cutState.enabled = true;
    setCutButtonActive(true);
    pauseEditingInteractions();
    const prevSnapEnabled = snapState.enabled;
    stopDraw(true);

    if (!cutState.lineSource || !cutState.lineLayer) {
      const layerInfo = createCutLineLayer();
      cutState.lineSource = layerInfo.lineSource;
      cutState.lineLayer = layerInfo.lineLayer;
    } else {
      clearCutLine(cutState.lineSource);
    }

    cutState.wasSnapEnabled = prevSnapEnabled;
    ensureTekuisSnapSources();
    if (!snapState.enabled) {
      enableSnap();
    } else {
      refreshSnapOrder();
    }

    cutState.draw = new ol.interaction.Draw({
      source: cutState.lineSource,
      type: 'LineString'
    });
    map.addInteraction(cutState.draw);
    if (snapState.enabled) {
      refreshSnapOrder();
    }

    cutState.draw.on('drawend', async (evt) => {
      const lineFeature = evt.feature;
      const result = await splitPolygonByLine(cutState.targetFeature, lineFeature);

      if (!result.ok) {
        if (result.reason === 'no-split') {
          Swal.fire('Info', 'Kəsilmə baş vermədi. Xətt poliqonu tam bölmədi.', 'info');
        } else {
          Swal.fire('Xəta', 'Cut əməliyyatı alınmadı.', 'error');
        }
      } else {
        if (window.showToast) {
          window.showToast(`Cut tamamlandı: ${result.createdCount} hissə yaradıldı`, 2400);
        } else {
          Swal.fire('Uğurlu', `Cut tamamlandı: ${result.createdCount} hissə yaradıldı`, 'success');
        }
      }

      disableCutMode({ silent: true });
    });

    cutState.escHandler = (e) => {
      if (e.key === 'Escape') {
        disableCutMode();
      }
    };
    document.addEventListener('keydown', cutState.escHandler);
  }

  function toggleCutMode() {
    if (cutState.enabled) {
      disableCutMode();
    } else {
      enableCutMode();
    }
  }



  function explodeSelectedMultiPolygons(){
    const unified = getUnifiedSelectedFeatures();
    if (unified.length === 0) {
      Swal.fire('Info', 'Seçilmiş obyekt yoxdur.', 'info');
      return;
    }

    let explodedCount = 0;
    let createdCount = 0;
    let skippedSingle = 0;
    let skippedNoSource = 0;

    const selectAnyFeatures = selectAny.getFeatures();
    const selectInteractionFeatures = selectInteraction.getFeatures();

    unified.forEach(feature => {
      const geom = feature?.getGeometry?.();
      if (!geom || geom.getType() !== 'MultiPolygon') return;

      const parts = geom.getCoordinates();
      if (!Array.isArray(parts) || parts.length < 2) {
        skippedSingle += 1;
        return;
      }

      const hit = findVectorLayerAndSourceOfFeature(feature);
      if (!hit || !hit.source) {
        skippedNoSource += 1;
        return;
      }

      const wasInSelectAny = selectAnyFeatures.getArray().includes(feature);
      const wasInSelectInteraction = selectInteractionFeatures.getArray().includes(feature);

      const baseProps = cloneFeatureAttributes(feature);

      try { hit.source.removeFeature(feature); } catch {}
      if (wasInSelectAny) { try { selectAnyFeatures.remove(feature); } catch {} }
      if (wasInSelectInteraction) { try { selectInteractionFeatures.remove(feature); } catch {} }

      const newFeatures = parts.map(partCoords => {
        const nf = new ol.Feature({ ...baseProps });
        nf.setGeometry(new ol.geom.Polygon(partCoords));
        hit.source.addFeature(nf);
        return nf;
      });

      if (wasInSelectAny) {
        newFeatures.forEach(f => selectAnyFeatures.push(f));
      }
      if (wasInSelectInteraction) {
        newFeatures.forEach(f => selectInteractionFeatures.push(f));
      }

      explodedCount += 1;
      createdCount += newFeatures.length;
    });

    if (explodedCount === 0) {
      Swal.fire(
        'Info',
        'Explode üçün ən azı 1 multipart (MultiPolygon) seçilməlidir.',
        'info'
      );
      return;
    }

    try { window.saveTekuisToLS?.(); } catch {}
    updateDeleteButtonState();
    updateAllSaveButtons();

    const noteParts = [];
    if (skippedSingle) noteParts.push(`${skippedSingle} ədəd tək hissəli poliqon atlandı`);
    if (skippedNoSource) noteParts.push(`${skippedNoSource} ədəd mənbəsiz obyekt atlandı`);
    const noteText = noteParts.length ? ` (${noteParts.join(', ')})` : '';

    if (window.showToast) {
      window.showToast(`Explode: ${explodedCount} multipart → ${createdCount} poliqon${noteText}`, 2600);
    } else {
      Swal.fire(
        'Uğurlu',
        `Explode tamamlandı: ${explodedCount} multipart → ${createdCount} poliqon${noteText}`,
        'success'
      );
    }
  }

  function updateAllSaveButtons(){
    const hasPoly = hasAtLeastOnePolygonSelected();
    const btn1 = document.getElementById('btnSaveDataPanel');
    if (btn1) btn1.disabled = !hasPoly;
    const btn2 = document.getElementById('btnSaveEditPanel');
    if (btn2) btn2.disabled = !hasPoly;

    if (rtEditUI && rtEditUI.btnSave) {
      rtEditUI.btnSave.disabled = !hasPoly;
    }
    updateCutButtonState();
    updateMergeButtonState();
  }

  const wktWriter = new ol.format.WKT();


  function composeSelectedPolygonsWKT(){
    const selected = getSelectedPolygons();
    if (selected.length === 0) return null;


    const polyCoords3857 = [];
    selected.forEach(f=>{
      const g = f.getGeometry();
      if (!g) return;
      const t = g.getType();
      if (t === 'Polygon'){
        polyCoords3857.push(g.getCoordinates());
      } else if (t === 'MultiPolygon'){
        const parts = g.getCoordinates();
        parts.forEach(rings => polyCoords3857.push(rings));
      }
    });

    if (polyCoords3857.length === 0) return null;

    let geom;
    if (polyCoords3857.length === 1){
      geom = new ol.geom.Polygon(polyCoords3857[0]);
    } else {
      geom = new ol.geom.MultiPolygon(polyCoords3857);
    }

    const geom4326 = geom.clone().transform('EPSG:3857','EPSG:4326');
    return wktWriter.writeGeometry(geom4326, { decimals: 8 });
  }


  async function uploadAttachmentToBackend(file, crs){
    if (!window.EDIT_ALLOWED) {
      return { ok:false, message:'Bu əməliyyatları yalnız redaktə və ya qaralama rejimində edə bilərsiz!' };
    }


    if (!file || !state.PAGE_TICKET) return { ok:false, message:'Fayl və ya ticket yoxdur' };
    try{
      const fd = new FormData();
      fd.append('file', file);
      fd.append('ticket', state.PAGE_TICKET);
      if (crs) fd.append('crs', crs); // Backend CSV/TXT üçün coordinate_system sütununa insanoxunan dəyəri yazacaq

      const resp = await fetch('/api/attach/upload/', {
        method: 'POST',
        headers: { 'X-CSRFToken': getCSRFToken?.() || '' },
        credentials: 'same-origin',
        body: fd
      });
      if (!resp.ok) throw new Error((await resp.text()) || `HTTP ${resp.status}`);
      const data = await resp.json();
      return { ok:true, data };
    }catch(e){
      console.error(e);
      return { ok:false, message: e && e.message ? e.message : 'Attach yükləmə alınmadı' };
    }
  }

  async function saveSelected({ alsoAttach=true } = {}){

    // <-- əvvəlcə sürətli pre-check-lər (overlay açmadan)
    if (!window.EDIT_ALLOWED) {
      Swal.fire('Diqqət', 'Bu əməliyyatları yalnız redaktə və ya qaralama rejimində edə bilərsiz!', 'warning');
      return;
    }

    const wkt = composeSelectedPolygonsWKT();
    if (!wkt) {
      Swal.fire('Diqqət', 'Mütləq bir poliqon seçilməlidir.', 'warning');
      return;
    }

    if (!state.PAGE_TICKET){
      Swal.fire('Diqqət', 'Ticket tapılmadı. Zəhmət olmasa Node tətbiqindən yenidən “Xəritəyə keç” edin.', 'warning');
      return;
    }

    // <-- indi overlay-i açırıq və HƏR HALDA bağlamaq üçün try/finally qoyuruq
    let hideLoading = () => {};
    try {
      hideLoading = (window.RTLoading ? RTLoading.show('Məlumat yadda saxlanır…') : () => {});

      // 1) Poliqonu saxla
      let polyId = null;
      try {
        const resp = await fetch('/api/save-polygon/', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Accept':'application/json',
            'X-CSRFToken': getCSRFToken?.() || ''
          },
          credentials: 'same-origin',
          body: JSON.stringify({ wkt: wkt, ticket: state.PAGE_TICKET })
        });

        if (resp.status === 409) {
          let msg = 'Məlumatlar artıq yadda saxlanılıb!';
          try { msg = (await resp.json())?.message || msg; } catch {}
          Swal.fire('Info', msg, 'info');
          return;
        }



        if (!resp.ok) throw new Error(await resp.text() || `HTTP ${resp.status}`);
        const data = await resp.json();
        polyId = data?.id ?? null;
      } catch (e) {
        console.error(e);
        Swal.fire('Xəta', e.message || 'Bazaya yazmaq alınmadı.', 'error');
        return; // finally işləyəcək və overlay bağlanacaq
      }

      // 2) Qoşmaları (varsə) yüklə
      let attachOk = false;
      if (alsoAttach && state.lastUploadState?.file){
        RTLoading.set('Qoşmalar saxlanır…'); // mətnini dəyiş
        try {
          const up = await uploadAttachmentToBackend(state.lastUploadState.file, state.lastUploadState.crs);
          attachOk = !!(up && up.ok);
          if (attachOk){
            await state.loadAttachLayer?.({ fit:false });
            state.updateTicketDeleteState?.();
          }
        } catch (e) {
          console.error(e);
          attachOk = false;
        }
      }

      // 3) Nəticə mesajı
      if (attachOk){
        Swal.fire('Uğurlu', `Poliqon və qoşmalar yadda saxlandı.`, 'success');
      } else if (!state.lastUploadState?.file){
        Swal.fire('Uğurlu', `Poliqon yadda saxlandı.`, 'success');
      } else {
        Swal.fire('Qismən uğurlu', `Poliqon yadda saxlandı, lakin qoşmalar saxlanmadı.`, 'warning');
      }

      updateAllSaveButtons();

    } finally {
      // OVERLAY-İ HƏR HALDA BAĞLA
      try { hideLoading(); } catch {}
    }
  }


  // Seçim event-ləri
  selectAny.getFeatures().on('add', updateAllSaveButtons);
  selectAny.getFeatures().on('remove', updateAllSaveButtons);
  selectInteraction.getFeatures().on('add', updateAllSaveButtons);
  selectInteraction.getFeatures().on('remove', updateAllSaveButtons);
  selectInteraction.getFeatures().on('add', updateDeleteButtonState);
  selectInteraction.getFeatures().on('remove', updateDeleteButtonState);

  selectAny.getFeatures().on('add',    updateDeleteButtonState);
  selectAny.getFeatures().on('remove', updateDeleteButtonState);


  map.on('click', updateAllSaveButtons);

  selectInteraction.on('select', () => { updateDeleteButtonState(); updateAllSaveButtons(); });

  /* =========================
     “Məlumatlar” – INFO MODE
     ========================= */
  const infoModeApi = window.setupInfoMode?.({
    map,
    tekuisLayer,
    necasLayer,
    infoHighlightSource,
    openPanel,
    moveIndicatorToButton,
    setInfoHighlight,
    stopDraw,
    selectAny,
    selectInteraction,
    pauseEditingInteractions,
    resumeEditingInteractions
  });
  const enableInfoMode = infoModeApi?.enableInfoMode;
  const disableInfoMode = infoModeApi?.disableInfoMode;
  const toggleInfoMode = infoModeApi?.toggleInfoMode;




  /* =========================
     Sağ toolbar: BÜTÜN düymələr
     ========================= */
  const rtEditUI = {
    btnInfo:   null,
    btnErase:  null,
    btnDraw:   null,
    btnSnap:   null,
    btnDelete: null,
    btnCut: null,
    btnMerge: null,
    btnExplode: null,
    btnSave:   null
  };

  function ensureEditAllowed(title = 'Diqqət') {
    if (!window.EDIT_ALLOWED) {
      Swal.fire(title, 'Bu əməliyyatları yalnız redaktə və ya qaralama rejimində edə bilərsiz!', 'info');
      return false;
    }
    return true;
  }
  window.ensureEditAllowed = ensureEditAllowed;

  function applyRightToolLocks(){
    const lockDrawSnap = !!window.RT_DRAW_SNAP_LOCKED;

    if (lockDrawSnap) {
      stopDraw(true);
    }

    if (rtEditUI.btnDraw) {
      rtEditUI.btnDraw.disabled = lockDrawSnap;
      rtEditUI.btnDraw.setAttribute('aria-disabled', lockDrawSnap ? 'true' : 'false');
      rtEditUI.btnDraw.title = lockDrawSnap
        ? 'Aktiv GIS məlumatı olduğu üçün çəkim bağlıdır.'
        : '';
    }

    if (rtEditUI.btnSnap) {
      rtEditUI.btnSnap.disabled = lockDrawSnap || !drawInteraction;
      rtEditUI.btnSnap.classList.toggle('active', !lockDrawSnap && !!snapState.enabled);
      rtEditUI.btnSnap.setAttribute('aria-disabled', rtEditUI.btnSnap.disabled ? 'true' : 'false');
      rtEditUI.btnSnap.title = lockDrawSnap
        ? 'Aktiv GIS məlumatı olduğu üçün snap bağlıdır.'
        : '';
    }
  }

  window.applyRightToolLocks = applyRightToolLocks;

  function injectRightEditButtons(){
    const host = document.getElementById('rightTools');
    if (!host) return;

    // Köməkçi: PNG ikonlu rt-btn yarat
    const applyTooltip = (btn, text) => {
      if (!btn) return;
      btn.classList.add('ui-tooltip', 'tooltip-left');
      if (text) {
        btn.dataset.tooltip = text;
        btn.setAttribute('aria-label', text);
      } else {
        btn.removeAttribute('data-tooltip');
      }
      btn.removeAttribute('title');
    };
    const mkBtn = (id, title, iconKey, colorKey = iconKey) => {
      if (document.getElementById(id)) return document.getElementById(id);
      const b = document.createElement('button');
      b.id = id;
      b.className = 'rt-btn';
      applyTooltip(b, title || '');
      if (colorKey) {
        b.dataset.color = colorKey;
      }
      const img = document.createElement('img');
      img.className = 'rt-icon-img';
      img.alt = title || id;
      img.src = (window.RT_ICONS && window.RT_ICONS[iconKey]) || '';
      b.appendChild(img);
      host.appendChild(b);
      return b;
    };


    rtEditUI.btnInfo   = mkBtn('rtInfo',      'İnformasiya (obyektə kliklə)', 'info');
    rtEditUI.btnDraw   = mkBtn('rtDraw',      'Poliqon çək / dayandır',       'draw');
    rtEditUI.btnSnap   = mkBtn('rtSnap',      'Snap aç/bağla',                'snap');
    rtEditUI.btnDelete = mkBtn('rtDeleteSel', 'Seçiləni sil',                 'deleteSel', 'delete');
    rtEditUI.btnExplode = mkBtn('rtExplode',  'Multipart poliqonu parçala',  'explode');
    rtEditUI.btnCut = mkBtn('rtCutPolygon', 'Poliqonu xətt ilə kəs', 'cutpolygon', 'cut');
    rtEditUI.btnMerge = mkBtn('rtMergePolygon', 'Poliqonları birləşdir', 'merge');
    rtEditUI.btnSave   = mkBtn('rtSave',      'Yadda saxla',                  'save');
    rtEditUI.btnErase  = mkBtn('rtErase',     'Tədqiqat daxilini kəs & sil',  'erase');

    // ===== EVENT LISTENER-LƏR =====

    // 1) Info düyməsi
    rtEditUI.btnInfo.addEventListener('click', toggleInfoMode);

    // 2) Erase düyməsi
    rtEditUI.btnErase.addEventListener('click', () => {
      if (!ensureEditAllowed()) return;
      const btn = document.getElementById('btnEraseTekuisInsideTicket');
      if (btn && typeof btn.click === 'function') {
        btn.click();
      } else {
        Swal.fire('Info', 'Erase funksiyası hazırda əlçatan deyil. "Laylar" panelini açın.', 'info');
      }
    });

    // 3) Draw düyməsi
    rtEditUI.btnDraw.addEventListener('click', () => {
      if (rtEditUI.btnDraw.disabled) return;
      if (!ensureEditAllowed()) return;
      if (drawInteraction) { stopDraw(); } else { startDraw(); }
    });

    // 4) Snap düyməsi
    rtEditUI.btnSnap.addEventListener('click', () => {
      if (rtEditUI.btnSnap.disabled) return;
      if (!ensureEditAllowed()) return;
      toggleSnap();
      rtEditUI.btnSnap.classList.toggle('active', !!snapState.enabled);
    });

    // 5) Delete düyməsi — Tədqiqat layı + TEKUİS layı üçün işləsin
    rtEditUI.btnDelete.addEventListener('click', async () => {
      if (!ensureEditAllowed()) return;

      // Hər iki selection-dan BİRGƏ siyahı (təkrarsız)
      const arrA = selectAny.getFeatures().getArray();
      const arrB = selectInteraction.getFeatures().getArray();
      const unified = Array.from(new Set([...arrA, ...arrB]));

      if (unified.length === 0) {
        Swal.fire('Info', 'Seçilmiş obyekt yoxdur.', 'info');
        return;
      }

      const confirmDelete = await Swal.fire(buildAppConfirmModal({
        title: 'Seçilən obyektlər silinsin?',
        html: 'TEKUİS Parselləri yaddaşa yazılanadək bu əməliyyatı "ctrl+z" geri ala bilərsiniz',
        icon: 'warning',
        confirmButtonText: 'Bəli, sil',
        cancelButtonText: 'İmtina',
        confirmButtonVariant: 'danger'
      }));

      if (!confirmDelete.isConfirmed) return;

      // Yalnız bu iki laydan silirik:
      // - Tədqiqat layı (editLayer/editSource)
      // - TEKUİS Parsellər (tekuisLayer/tekuisSource)
      let removed = 0;
      unified.forEach(f => {
        const hit = findVectorLayerAndSourceOfFeature(f);
        if (!hit) return;

        const isTicket = (hit.layer === editLayer || hit.source === editSource);
        const isTekuis = isTekuisLayer(hit.layer) || isTekuisSource(hit.source);


        if (isTicket || isTekuis) {
          try { hit.source.removeFeature(f); removed++; } catch {}
          try { selectInteraction.getFeatures().remove(f); } catch {}
          try { selectAny.getFeatures().remove(f); } catch {}
        }
      });

      if (removed > 0) {
        updateDeleteButtonState();
        updateEditStatus && updateEditStatus('Seçilmiş obyekt(lər) silindi.');
        updateAllSaveButtons();
      } else {
        Swal.fire('Info', 'Seçilənlər arasında silinə bilən obyekt yoxdur.', 'info');
      }
    });

        // 5.5) Explode düyməsi — Multipart poliqonu parçala
    rtEditUI.btnExplode.addEventListener('click', () => {
      if (!ensureEditAllowed()) return;
      explodeSelectedMultiPolygons();
    });

    rtEditUI.btnCut.addEventListener('click', () => {
      if (!ensureEditAllowed()) return;
      toggleCutMode();
    });
    rtEditUI.btnMerge.addEventListener('click', async () => {
      if (!ensureEditAllowed()) return;
      await openMergeModal();
    });


// 6) Save düyməsi
    rtEditUI.btnSave.addEventListener('click', () => {
      if (!ensureEditAllowed()) return;
      if (!hasAtLeastOnePolygonSelected()) {
        Swal.fire('Diqqət', 'Mütləq bir poliqon seçilməlidir.', 'warning');
        return;
      }
      saveSelected({ alsoAttach:true });
    });

    // Başlanğıc UI vəziyyəti
    rtEditUI.btnSnap.disabled = !drawInteraction;
    rtEditUI.btnSnap.classList.toggle('active', !!snapState.enabled);
    rtEditUI.btnDelete.disabled = (selectInteraction.getFeatures().getLength() === 0);
    rtEditUI.btnSave.disabled   = !hasAtLeastOnePolygonSelected();
    updateCutButtonState();
    updateMergeButtonState();
    applyRightToolLocks();
  }

  // Xəritə hazır olanda düymələri daxil et
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', injectRightEditButtons);
  } else {
    injectRightEditButtons();
  }

  // Çək düyməsinin aktivliyi
  function updateDrawBtnUI(isActive){
    const active = !!isActive;
    if (rtEditUI && rtEditUI.btnDraw) {
      rtEditUI.btnDraw.classList.toggle('active', active);
    }
    if (rtEditUI && rtEditUI.btnSnap) {
      rtEditUI.btnSnap.disabled = !!window.RT_DRAW_SNAP_LOCKED || !active;
      if (!active) {
        rtEditUI.btnSnap.classList.remove('active');
      }
    }
  }

  function updateDeleteButtonState(){
    // Birlikdə seçim: selectAny + selectInteraction
    const arrA = selectAny.getFeatures().getArray();
    const arrB = selectInteraction.getFeatures().getArray();
    const unified = Array.from(new Set([...arrA, ...arrB]));

    // Yalnız Tədqiqat və TEKUİS layına aid seçilmişlər sayılır
    const deletableCount = unified.filter(f => {
      const hit = findVectorLayerAndSourceOfFeature(f);
      if (!hit) return false;
      const isTicket = (hit.layer === editLayer || hit.source === editSource);
      const isTekuis = isTekuisLayer(hit.layer) || isTekuisSource(hit.source);
      return isTicket || isTekuis;

    }).length;

    if (rtEditUI && rtEditUI.btnDelete) {
      rtEditUI.btnDelete.disabled = (deletableCount === 0);
    }
    updateCutButtonState();
    updateMergeButtonState();
  }


  // Status mətni (sağ toolbar-da xətti status göstərmirik)
  function updateEditStatus(text){ /* no-op sağ toolbar üçün */ }

  // Snap düyməsi
  function updateSnapBtnUI(){
    const on = !!snapState.enabled;
    if (rtEditUI && rtEditUI.btnSnap) {
      rtEditUI.btnSnap.classList.toggle('active', on);
    }
  }

  modifyAnyInteraction.on('modifyend', () => {
    try { window.saveTekuisToLS?.(); } catch {}
    updateAllSaveButtons?.();
  });

  Object.assign(state, {
    editSource,
    editLayer,
    selectAny,
    selectInteraction,
    pauseEditingInteractions,
    resumeEditingInteractions,
    registerSnapSource,
    enableSnap,
    disableSnap,
    stopDraw,
    startDraw,
    updateAllSaveButtons,
    updateDeleteButtonState
  });

  window.updateAllSaveButtons = updateAllSaveButtons;
  window.updateDeleteButtonState = updateDeleteButtonState;
  window.saveSelected = saveSelected;

  return {
    registerSnapSource,
    updateAllSaveButtons,
    updateDeleteButtonState
  };
  
};