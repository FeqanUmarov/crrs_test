(() => {
  "use strict";

  const PAGE_TICKET = window.PAGE_TICKET || null;
  const mapContext = window.MapContext || {};
  const map = window.map || mapContext.map;
  const tekuisSource = mapContext.tekuisSource || window.tekuisSource;
  const topoErrorSource = mapContext.topoErrorSource;
  const topoFocusSource = mapContext.topoFocusSource;
  const renderTopoErrorsOnMap = mapContext.renderTopoErrorsOnMap || window.renderTopoErrorsOnMap;
  const zoomAndHighlightTopoGeometry = mapContext.zoomAndHighlightTopoGeometry || window.zoomAndHighlightTopoGeometry;
  const saveTekuisToLocal = () => window.saveTekuisToLS?.();
  const clearTekuisCache = () => window.tekuisCache?.clearTekuisCache?.();
  const DEFAULT_TOPO_MIN_AREA_SQM = 0;

  function resolveTopoMinAreaSqm(){
    const raw = (window.TOPO_MIN_AREA_SQM ?? window.TOPO_MAX_ERROR_SQM);
    if (Number.isFinite(+raw)) return Math.max(0, +raw);
    return DEFAULT_TOPO_MIN_AREA_SQM;

  }

  function syncTopoMinArea(){
    const minArea = resolveTopoMinAreaSqm();
    if (window.tv && typeof window.tv.setMinAreaSqm === 'function') {
      window.tv.setMinAreaSqm(minArea);
    }
    return minArea;

  }
  function isValidFeatureCollection(fc){
    return !!fc && fc.type === 'FeatureCollection' && Array.isArray(fc.features);

  }
  function resolveOriginalTekuis({ fallbackFc } = {}){
    const cached = window.tekuisCache?.getOriginalTekuis?.();
    if (isValidFeatureCollection(cached)) {
      return cached;

    }
    if (isValidFeatureCollection(fallbackFc) && (fallbackFc.features?.length ?? 0) > 0) {
      window.tekuisCache?.saveOriginalTekuis?.(fallbackFc);
      return fallbackFc;
  
    }
    return null;
  }

  function getTekuisFeatureCollection() {
    const src = getTekuisSourceSmart();
    const features = (src?.getFeatures?.() || []);
    const gjFmt = new ol.format.GeoJSON();
    return gjFmt.writeFeaturesObject(features, {
      dataProjection: 'EPSG:4326',
      featureProjection: 'EPSG:3857'

    });
  }

  async function saveTekuisOnServer(featureCollection, { skipValidation, originalGeojson } = {}) {
    const headers = { 'Content-Type': 'application/json', 'Accept': 'application/json' };
    const ticket = (typeof PAGE_TICKET !== 'undefined' && PAGE_TICKET) ? PAGE_TICKET : '';
    const metaRaw = (typeof window.META_ID !== 'undefined') ? window.META_ID : null;
    const metaInt = metaRaw != null && String(metaRaw).trim() !== '' ? parseInt(metaRaw, 10) : null;

    const originalFc = resolveOriginalTekuis({ fallbackFc: originalGeojson });
    if (!isValidFeatureCollection(originalFc)) {
      return {
        ok: false,
        status: 400,
        data: { error: 'original_geojson FeatureCollection tələb olunur' }
      };
    }
    const body = { geojson: featureCollection, original_geojson: originalFc, ticket };
    if (Number.isFinite(metaInt)) body.meta_id = metaInt;
    if (skipValidation) body.skip_validation = true;

    const resp = await fetch('/api/save-tekuis-parcels/', {
      method: 'POST',
      headers,
      body: JSON.stringify(body)
    });

    let data = null;
    const txt = await resp.text();
    try { data = JSON.parse(txt); } catch { data = { raw: txt }; }
    return { ok: resp.ok, status: resp.status, data };

  }
  function findExternalTekuisLayer() {
    let found = null;
    map?.getLayers?.().forEach(l => {
      if (found) return;
      if (!(l instanceof ol.layer.Vector)) return;
      const title = (l.get('title') || '').toString().toLowerCase();
      if (title.includes('tekuis') || l.get('isTekuisEditable') === true) {
        found = l;
      }

    });

    return found;
  }
  function getTekuisSourceSmart() {
    if (tekuisSource && tekuisSource.getFeatures && tekuisSource.getFeatures().length > 0) {
      return tekuisSource;
    }
    const ext = findExternalTekuisLayer();
    return ext ? ext.getSource() : (tekuisSource || null);
  }

  function clearTopoErrors(){
    try { topoFocusSource?.clear(true); } catch {}
    try { topoErrorSource?.clear(true); } catch {}
  }

  function updateSaveButtonState(){
    const btnSaveTekuis = document.getElementById('btnSaveTekuis');
    if (!btnSaveTekuis) return;
    const fc = getTekuisFeatureCollection();
    const currentHash = window.TekuisValidationState?.fcHash?.(fc);
    btnSaveTekuis.disabled = !window.TekuisValidationState?.isSaveAllowed?.(currentHash);
  }
  async function runTekuisValidation(){
    if (!window.EDIT_ALLOWED) {
      Swal.fire('Diqqət', 'Bu əməliyyatları yalnız redaktə və ya qaralama rejimində edə bilərsiz!', 'warning');
      return;
    }

    try {
      if (window.AttributesPanel && typeof window.AttributesPanel.applyUIToSelectedFeature === 'function') {
        window.AttributesPanel.applyUIToSelectedFeature();
      }
    } catch (e) {
      console.warn('Attributes panel sync xətası (davam edirik):', e);
    }

    try { saveTekuisToLocal(); } catch {}




    if (!PAGE_TICKET || !String(PAGE_TICKET).trim()){
      Swal.fire('Diqqət','Ticket tapılmadı. Node tətbiqindən yenidən "Xəritəyə keç" edin.','warning');
      return;
    }

    const src = getTekuisSourceSmart();
    const feats = src?.getFeatures?.() || [];
    if (feats.length === 0){
      Swal.fire('Info', 'Yoxlanılacaq TEKUİS parseli yoxdur.', 'info');
      return;
    }

    const fc = getTekuisFeatureCollection();
    const hash = window.TekuisValidationState?.fcHash?.(fc);
    syncTopoMinArea();

    window.TekuisValidationState?.setRunning?.();
    updateSaveButtonState();

    const ignoredGapKeys = window.TekuisValidationState?.getIgnoredGapKeys?.() || [];
    const resp = await window.TekuisValidationService?.validateTopology?.({
      geojson: fc,
      ticket: PAGE_TICKET,
      metaId: window.META_ID ?? null,
      ignoredGapKeys
    });

    if (!resp || resp.ok === false){
      window.TekuisValidationState?.markDirty?.();
      updateSaveButtonState();
      Swal.fire('Xəta', resp?.error || 'Validasiya zamanı xəta baş verdi.', 'error');
      return;
    }
    const validation = resp.validation || { stats: {}, overlaps: [], gaps: [] };
    window.TekuisValidationState?.clearIgnored?.();
    (validation.gaps || []).forEach((g) => {
      if (g?.is_ignored) {
        const key = window.TekuisValidationState?.topoKey?.(g);
        window.TekuisValidationState?.setGapIgnored?.(key, true);
      }
    });
    window.TekuisValidationState?.setResult?.({
      validation,
      localOk: resp.localOk,
      tekuisOk: resp.tekuisOk,
      hash,
      metaId: resp.metaId ?? window.META_ID
    });
    window.TekuisValidationModal?.open?.(validation);
    updateSaveButtonState();

    if (resp.localOk && resp.tekuisOk){
      window.showToast?.('Topologiya yoxlanıldı. Yadda saxlaya bilərsiniz.');
    }
  }
  async function tryValidateAndSaveTekuis(){
    if (!window.EDIT_ALLOWED) {
      Swal.fire('Diqqət', 'Bu əməliyyatları yalnız redaktə və ya qaralama rejimində edə bilərsiz!', 'warning');
      return;
    }

    const src = getTekuisSourceSmart();
    const feats = src?.getFeatures?.() || [];
    if (feats.length === 0){
      Swal.fire('Info', 'Yadda saxlanacaq TEKUİS parseli yoxdur.', 'info');
      return;
    }






    const fc = getTekuisFeatureCollection();
    const currentHash = window.TekuisValidationState?.fcHash?.(fc);
    if (!window.TekuisValidationState?.isSaveAllowed?.(currentHash)) {
      Swal.fire('Diqqət', 'Yadda saxlamaq üçün əvvəlcə validate etməlisiniz.', 'warning');
      return;
    }

    const originalFc = resolveOriginalTekuis({ fallbackFc: fc });
    if (!isValidFeatureCollection(originalFc)) {
      Swal.fire('Xəta', 'Köhnə TEKUİS məlumatı tapılmadı. Zəhmət olmasa tekuis_parcel_old məlumatını yeniləyin.', 'error');
      return;
    }
    const ask = await Swal.fire({
      title: 'Əminsiniz?',
      html: `<b>${feats.length}</b> TEKUİS parseli bazaya yazılacaq.`,
      icon: 'question',
      showCancelButton: true,
      confirmButtonText: 'Bəli, yadda saxla',
      cancelButtonText: 'İmtina'
    });
    if (!ask.isConfirmed) return;

    try {
      const s = await saveTekuisOnServer(fc, {
        skipValidation: true,
        originalGeojson: originalFc
      });

      if (!s.ok){
        Swal.fire('Xəta', s.data?.error || 'TEKUİS parsellərini yadda saxlanılmadı', 'error');
        return;

      }
      clearTopoErrors();
      clearTekuisCache();
      window.tekuisNecasApi?.markTekuisSaved?.(true);

      window.TekuisValidationState?.reset?.();
      updateSaveButtonState();
      const btnValidateTekuis = document.getElementById('btnValidateTekuis');
      if (btnValidateTekuis) {
        btnValidateTekuis.disabled = true;
      }

      if (s.data?.meta_id != null) {
        window.CURRENT_META_ID = s.data.meta_id;
      }

      try {
        const metaId = s.data?.meta_id ?? window.CURRENT_META_ID ?? null;
        await window.TekuisSwitch?.showSource?.('current', metaId);
      } catch (e) {
        console.warn('TEKUİS cari mənbə yenilənmədi:', e);
      }

      Swal.fire('Uğurlu', `${s.data?.saved_count ?? feats.length} TEKUİS parseli bazaya yazıldı.`, 'success');

      } catch(e) {
      console.error('Save error:', e);
      Swal.fire('Xəta', e.message || 'Şəbəkə xətası baş verdi.', 'error');
    }
  }
  
  function bindButtons(){
    const btnValidate = document.getElementById('btnValidateTekuis');
    if (btnValidate && btnValidate.dataset.boundTekuisValidate !== 'true') {
      btnValidate.dataset.boundTekuisValidate = 'true';
      btnValidate.addEventListener('click', runTekuisValidation);
      updateSaveButtonState();
    }
    if (!btnValidate && !window.__tekuisValidateObserver) {
      const observer = new MutationObserver(() => {
        const found = document.getElementById('btnValidateTekuis');
        if (found) {
          bindButtons();
        }
      });
      observer.observe(document.body, { childList: true, subtree: true });
      window.__tekuisValidateObserver = observer;
    }
  }

  function initModal(){
    window.TekuisValidationModal?.init?.({
      renderTopoErrorsOnMap,
      zoomAndHighlightTopoGeometry,
      clearTopoErrors,
      onIgnoredChange: updateSaveButtonState


    });
    window.TekuisValidationModal?.setOnValidate?.(runTekuisValidation);
    window.TekuisValidationModal?.setOnClose?.(updateSaveButtonState);
  }

  bindButtons();
  initModal();

  window.runTekuisValidation = runTekuisValidation;
  window.tryGetTekuisFeatureCollection = getTekuisFeatureCollection;
  window.tryValidateAndSaveTekuis = tryValidateAndSaveTekuis;
})();