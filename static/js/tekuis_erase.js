/* TEKUİS → Tədqiqat daxilini kəsib sil və Tədqiqat obyektini TEKUİS layına əlavə et (frontend-only)
   Quraşdırma:
   - Bu faylı index.html-də main.js-dən SONRA və DEFER ilə qoşun:
     <script src="{% static 'js/tekuis_erase.js' %}?v=3" defer></script>
*/

(function(){
  'use strict';

  /* ------------------------------
   * Util-lər
   * ------------------------------ */
  const byId = (id)=>document.getElementById(id);
  const markFeatureModified = (feature) => {
    if (typeof window.markTekuisFeatureModified === 'function') {
      window.markTekuisFeatureModified(feature);
      return;
    }
    if (feature && typeof feature.set === 'function') {
      feature.set('is_modified', true);
    }
  };

  // turf dinamiki
  function ensureTurf(){
    return new Promise((resolve, reject)=>{
      if (window.turf) return resolve(window.turf);
      const s = document.createElement('script');
      s.src = 'https://cdn.jsdelivr.net/npm/@turf/turf@6/turf.min.js';
      s.async = true;
      s.onload = ()=>resolve(window.turf);
      s.onerror = ()=>reject(new Error('turf.js yüklənmədi'));
      document.head.appendChild(s);
    });
  }

  // xəritə hazır olana kimi gözlə
  function waitForMap(timeoutMs=10000, intervalMs=120){
    return new Promise((resolve, reject)=>{
      const t0 = Date.now();
      const timer = setInterval(()=>{
        if (window.ol && window.map && typeof map.getLayers === 'function'){
          clearInterval(timer); resolve(map);
        } else if (Date.now() - t0 > timeoutMs){
          clearInterval(timer); reject(new Error('Xəritə (map) hazır deyil.'));
        }
      }, intervalMs);
    });
  }


  // Redeem-dən tekuisId götür
async function _fetchTekuisIdFromRedeem(ticket) {
  const url = 'http://10.11.1.73:8080/api/requests/handoff/redeem';
  const body = new URLSearchParams({ ticket: String(ticket || '').trim() });
  try {
    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Accept':'application/json', 'Content-Type':'application/x-www-form-urlencoded' },
      body
    });
    const data = await resp.json().catch(()=>null);
    if (!resp.ok) { console.warn('redeem !ok', resp.status, data); return null; }
    if (data && data.valid !== false && data.tekuisId != null) {
      const idStr = String(data.tekuisId).trim();
      console.debug('redeem tekuisId=', idStr);
      return idStr;
    }
    console.warn('redeem: tekuisId tapılmadı', data);
    return null;
  } catch (e) {
    console.warn('redeem error', e);
    return null;
  }
}


// Backend lüğət endpoint-i ilə tekuis code → kateqoriya adı
async function _fetchKateqoriyaNameByCode(code) {
  const raw = (code ?? '').toString().trim();
  if (!raw) { console.warn('kateqoriya: code boşdur'); return null; }

  async function _once(c) {
    const url = `/api/dict/kateqoriya/by-tekuis-code?code=${encodeURIComponent(c)}`;
    try {
      const resp = await fetch(url, { method: 'GET', headers: { 'Accept': 'application/json' } });
      let data = null;
      try { data = await resp.json(); } catch(_) {}
      if (!resp.ok) {
        console.warn('kateqoriya GET !ok', resp.status, data);
        return { ok:false, status:resp.status, name:null };
      }
      return { ok:true, status:resp.status, name:(data && data.name) ? data.name : null };
    } catch (e) {
      console.warn('kateqoriya GET error', e);
      return { ok:false, status:0, name:null };
    }
  }

  // 1-ci cəhd: verilən kod
  let r = await _once(raw);
  if (r.ok && r.name) return r.name;

  // 2-ci cəhd: əgər 404 gəlibsə və uzunluq < 5 → soldan “0” ilə doldur
  if (r.status === 404 && raw.length < 5) {
    const padded = raw.padStart(5, '0');
    if (padded !== raw) {
      console.info('kateqoriya retry with padded code', padded);
      r = await _once(padded);
      if (r.ok && r.name) return r.name;
    }
  }

  return null;
}


// Ticket-i müxtəlif mənbələrdən tap və global-a yaz
function _resolvePageTicket() {
  // 1) Artıq globalda varsa, ondan istifadə et
  const cached = (window.PAGE_TICKET || '').trim();
  if (cached) return cached;

  let t = '';

  // 2) HTML içində data-ticket və ya input[name="ticket"] axtar
  const el = document.querySelector('[data-ticket], input[name="ticket"], #ticket');
  if (el) {
    t = (el.getAttribute('data-ticket') || el.value || '').trim();
  }

  // 3) URL query string: ?ticket=XXXX
  if (!t) {
    try {
      const params = new URLSearchParams(window.location.search);
      t = (params.get('ticket') || '').trim();
    } catch (_) {}
  }

  // Tapdısa global dəyişənə yaz
  if (t) {
    window.PAGE_TICKET = t;
  }
  return t;
}


// Ticket → backend → kateqoriya adı
async function _fetchKateqoriyaNameForCurrentTicket() {
  const ticket = _resolvePageTicket();   // <<< YENİ SƏTİR

  if (!ticket) {
    console.warn('Ticket tapılmadı; Kateqoriya üçün ticket yoxdur');
    return null;
  }

  try {
    const resp = await fetch(
      `/api/dict/kateqoriya/by-ticket?ticket=${encodeURIComponent(ticket)}`,
      {
        method: 'GET',
        headers: { 'Accept': 'application/json' },
      }
    );
    let data = null;
    try { data = await resp.json(); } catch (_) {}

    if (!resp.ok || !data || data.ok === false || !data.name) {
      console.warn('kateqoriya/by-ticket cavabı uğursuz:', resp.status, data);
      return null;
    }

    console.debug('Kateqoriya (ticket ilə):', data.code, '→', data.name);
    return data.name;
  } catch (e) {
    console.warn('kateqoriya/by-ticket fetch error', e);
    return null;
  }
}








  /* ------------------------------
   * Layları xəritədən tapmaq
   * ------------------------------ */
  function _flattenLayers(groupOrCollection){
    try{
      const arr = groupOrCollection.getArray
        ? groupOrCollection.getArray()
        : groupOrCollection.getLayers
          ? groupOrCollection.getLayers().getArray()
          : [];
      return arr.flatMap(l => (l instanceof ol.layer.Group) ? _flattenLayers(l.getLayers()) : [l]);
    }catch(_){ return []; }
  }
  function _allVectorLayers(){
    try{
      const all = _flattenLayers(map.getLayers());
      return all.filter(l => l instanceof ol.layer.Vector);
    }catch(_){ return []; }
  }
  function _findVectorByTitleFragments(fragments){
    const frags = (fragments||[]).map(s=>String(s).toLowerCase());
    const layers = _allVectorLayers();
    return layers.find(l=>{
      const title = (l.get && (l.get('title')||l.get('name'))) || '';
      const low = String(title).toLowerCase();
      return frags.some(f => low.includes(f));
    }) || null;
  }

  // TEKUİS layını təxmin et
  function _guessTekuisLayer(){
    try{ if (window.tekuisLayer instanceof ol.layer.Vector) return window.tekuisLayer; }catch(_){}
    let lyr = _findVectorByTitleFragments(['tekuis','parsel','parcel','m_g_parsel']);
    if (lyr) return lyr;

    // polygonlu və ən çox feature-li
    const cands = _allVectorLayers().filter(l=>{
      const src = l.getSource && l.getSource();
      const feats = (src && src.getFeatures && src.getFeatures()) || [];
      if (!feats.length) return false;
      const g = feats[0].getGeometry && feats[0].getGeometry();
      return !!g && /Polygon/i.test(g.getType());
    });
    if (!cands.length) return null;
    cands.sort((a,b)=> (b.getSource().getFeatures().length) - (a.getSource().getFeatures().length));
    return cands[0] || null;
  }

  // Tədqiqat layını təxmin et
  function _guessTicketLayer(){
    try{ if (window.ticketLayer instanceof ol.layer.Vector) return window.ticketLayer; }catch(_){}
    let lyr = _findVectorByTitleFragments(['tədqiqat','tedqiqat','ticket']);
    if (lyr) return lyr;

    // fk_metadata olan lay
    lyr = _allVectorLayers().find(l=>{
      const src = l.getSource && l.getSource();
      const feats = (src && src.getFeatures && src.getFeatures()) || [];
      return feats.some(f => f && (f.get('fk_metadata') != null || f.get('FK_METADATA') != null));
    });
    if (lyr) return lyr;

    // zIndex = 5
    lyr = _allVectorLayers().find(l=> (l.getZIndex && l.getZIndex()) === 5);
    if (lyr) return lyr;

    // fallback: polygonlu, TEKUİS deyil
    const tekuis = _guessTekuisLayer();
    const cands = _allVectorLayers().filter(l=>{
      if (tekuis && l === tekuis) return false;
      const src = l.getSource && l.getSource();
      const feats = (src && src.getFeatures && src.getFeatures()) || [];
      if (!feats.length) return false;
      const g = feats[0].getGeometry && feats[0].getGeometry();
      return !!g && /Polygon/i.test(g.getType());
    });
    if (!cands.length) return null;
    cands.sort((a,b)=> (b.getSource().getFeatures().length) - (a.getSource().getFeatures().length));
    return cands[0] || null;
  }

  function _getTekuisSource(){
    try{ if (window.tekuisSource && typeof window.tekuisSource.getFeatures === 'function') return window.tekuisSource; }catch(_){}
    const lyr = _guessTekuisLayer();
    return (lyr && lyr.getSource) ? lyr.getSource() : null;
  }
  function _getTicketSource(){
    try{ if (window.ticketLayerSource && typeof window.ticketLayerSource.getFeatures === 'function') return window.ticketLayerSource; }catch(_){}
    const lyr = _guessTicketLayer();
    return (lyr && lyr.getSource) ? lyr.getSource() : null;
  }

  // Seçilmiş poliqonlar varsa onları, yoxdursa bütün Tədqiqat poliqonlarını götür
  function _getTicketTurfPolys(gjFmt){
    const polys = [];
    const originalFeatures = []; // Orijinal feature-ları saxlayacağıq
    
    console.log('_getTicketTurfPolys çağırıldı');
    
    try{
      if (typeof getSelectedPolygons === 'function'){
        console.log('getSelectedPolygons funksiyası mövcuddur');
        const sel = getSelectedPolygons() || [];
        console.log('Seçilmiş poliqonlar:', sel.length);
        sel.forEach((f, idx)=>{
          const g = gjFmt.writeFeatureObject(f, {
            dataProjection: 'EPSG:4326',
            featureProjection: 'EPSG:3857'
          }).geometry;
          if (g && (g.type==='Polygon' || g.type==='MultiPolygon')) {
            polys.push(g);
            originalFeatures.push(f);
            console.log(`Seçilmiş feature ${idx} əlavə edildi`);
          }
        });
        if (polys.length) {
          console.log(`Seçilmiş ${polys.length} poliqon, ${originalFeatures.length} feature`);
          return { polys, originalFeatures };
        }
      }
    }catch(err){
      console.warn('getSelectedPolygons xətası:', err);
    }

    const src = _getTicketSource();
    console.log('Ticket source:', !!src);
    if (!src) return { polys, originalFeatures };
    
    const allFeats = src.getFeatures() || [];
    console.log(`Ticket layında cəmi ${allFeats.length} feature`);
    
    allFeats.forEach((f, idx)=>{
      const g = gjFmt.writeFeatureObject(f, {
        dataProjection: 'EPSG:4326',
        featureProjection: 'EPSG:3857'
      }).geometry;
      if (g && (g.type==='Polygon' || g.type==='MultiPolygon')) {
        polys.push(g);
        originalFeatures.push(f);
        console.log(`Ticket feature ${idx} əlavə edildi`);
      }
    });
    
    console.log(`Final: ${polys.length} poliqon, ${originalFeatures.length} feature`);
    return { polys, originalFeatures };
  }

  // Turf → OL geometry (Feature gəlirsə, içindəki geometry-ni çıxar)
  function _olGeometryFromTurf(gjFmt, turfOut){
    if (!turfOut) return null;
    let geom = turfOut;
    if (geom.type === 'Feature') geom = geom.geometry; // ƏSAS DÜZƏLİŞ
    if (!geom) return null;
    return gjFmt.readGeometry(geom, {
      dataProjection: 'EPSG:4326',
      featureProjection: 'EPSG:3857'
    });
  }

  // 🔹 Yeni obyekt üçün ən uyğun atribut-şablonu tap (kəsişmə sahəsinə görə)
function _pickAttrTemplateFor(newGeoJSON, templates, turf) {
  if (!newGeoJSON || !templates || !templates.length) return null;
  let best = null, bestArea = 0;
  for (const t of templates) {
    try {
      const isect = turf.intersect(newGeoJSON, t.gj);
      if (!isect || !isect.geometry) continue;
      // sahəni hesabla (geojson kv.metr deyil, nisbi müqayisə üçün turf.area uyğun deyil→ OL-də hesablayacağıq)
      const area = (isect && isect.geometry) ? turf.area(isect) : 0; // m² qaytarır
      if (area > bestArea) { bestArea = area; best = t; }
    } catch(_){}
  }
  return best ? best.props : null;
}

//  Sahə (hektar) hesabla
function _calcAreaHa(olGeom) {
  if (!olGeom) return '';
  try {
    const g4326 = olGeom.clone().transform('EPSG:3857','EPSG:4326');
    const m2 = Math.abs(ol.sphere.getArea(g4326)); // geodezik
    const ha = m2 / 10000.0;
    return Math.round(ha * 100) / 100; // 2 rəqəm
  } catch(_) { return ''; }
}

// 🔹 Atribut whitelist – yalnız bu sahələri köçürək
const _ATTR_KEYS_WHITELIST = [
  'LAND_CATEGORY_ENUM','LAND_CATEGORY2ENUM','LAND_CATEGORY3ENUM','LAND_CATEGORY4ENUM',
  'OWNER_TYPE_ENUM','SUVARILMA_NOVU_ENUM','EMLAK_NOVU_ENUM',
  'OLD_LAND_CATEGORY2ENUM','NAME','TERRITORY_NAME','RAYON_ADI','IED_ADI','BELEDIYE_ADI','AREA_HA','SOURCE'
];





// Tədqiqat obyektlərini TEKUİS layına əlavə et + atributları TEKUİS-dən mirəs al
async function _addTicketFeaturesToTekuis(tekuisSrc, ticketFeatures, gjFmt, templates, turf) {
  console.log('_addTicketFeaturesToTekuis çağırıldı:', {
    tekuisSrc: !!tekuisSrc,
    ticketFeatures: ticketFeatures?.length || 0,
    templates: templates?.length || 0
  });

  if (!tekuisSrc || !ticketFeatures || !ticketFeatures.length) {
    console.warn('TEKUİS source və ya ticket features yoxdur');
    return 0;
  }

  // 1) Ticket → backend → kateqoriya adı (yalnız 1 dəfə çəkirik və bütün obyektlərə yazırıq)
  let kateqName = null;
  try {
    kateqName = await _fetchKateqoriyaNameForCurrentTicket();
  } catch (e) {
    console.warn('Kateqoriya adı çəkilmədi:', e);
  }


  let added = 0;
  ticketFeatures.forEach((originalFeature, index) => {
    try {
      // 2) Orijinal Tədqiqat feature-ını GeoJSON (EPSG:4326) kimi çıxar
      const newGJ = gjFmt.writeFeatureObject(originalFeature, {
        dataProjection: 'EPSG:4326',
        featureProjection: 'EPSG:3857'
      });

      // 3) Ən yaxşı uyğun TEKUİS şablon atributlarını tap
      const bestProps = _pickAttrTemplateFor(newGJ.geometry, templates || [], turf);

      // 4) Yeni feature yarat və geometriyanı yaz
      const newFeature = new ol.Feature();
      const newOlGeom = gjFmt.readGeometry(newGJ.geometry, {
        dataProjection:'EPSG:4326', featureProjection:'EPSG:3857'
      });
      newFeature.setGeometry(newOlGeom);

      // 5) Baza atributları
      const calcHa = _calcAreaHa(newOlGeom);
      const baseProps = {
        _from_tedqiqat: true,
        _transfer_timestamp: Date.now(),
        SOURCE: 'TEKUIS',
        AREA_HA: calcHa,
        is_modified: true
      };

      // 6) Whitelist üzrə şablon atributlarını köçür
      const mergedProps = { ...baseProps };
      if (bestProps) {
        _ATTR_KEYS_WHITELIST.forEach(k => {
          if (k === 'AREA_HA') return;
          if (typeof bestProps[k] !== 'undefined' && bestProps[k] !== null) {
            mergedProps[k] = bestProps[k];
          }
        });
      } else {
        const pT = originalFeature.getProperties() || {};
        _ATTR_KEYS_WHITELIST.forEach(k => {
          if (k === 'AREA_HA') return;
          if (typeof pT[k] !== 'undefined' && pT[k] !== null) mergedProps[k] = pT[k];
        });
      }

      // 7) *** ƏSAS DƏYİŞİK: Kateqoriya dəyərini köhnədən gətirmə! ***
      //    Redeem → tekuisId → kateqoriya_tekuis_name çəkilibsə, onu yazırıq.
      //    UI və backend uyğun qalması üçün LAND_CATEGORY_ENUM sahəsinə set edirik.
      if (kateqName && String(kateqName).trim() !== '') {
        mergedProps['LAND_CATEGORY_ENUM'] = kateqName;
      } else {
        // Əgər ad tapılmadısa, köhnəni göstərməmək üçün ən azı təmizləyək:
        delete mergedProps['LAND_CATEGORY_ENUM'];
      }

      // 8) Properties yaz və TEKUİS-ə əlavə et
      newFeature.setProperties(mergedProps);
      tekuisSrc.addFeature(newFeature);
      added++;
    } catch (err) {
      console.error(`Feature ${index} əlavə edilərkən xəta:`, err, originalFeature);
    }
  });

  console.log(`Cəmi ${added} feature əlavə edildi`);
  return added;
}



  /* ------------------------------
   * Əsas əməliyyat
   * ------------------------------ */
  let _eraseFlowInProgress = false;

  async function runEraseFlow(){
    if (_eraseFlowInProgress) {
      window.Swal?.fire('Info', 'Kəsmə əməliyyatı artıq icra olunur. Zəhmət olmasa bitməsini gözləyin.', 'info');
      return;
    }

    _eraseFlowInProgress = true;
    try{
      const gjFmt = new ol.format.GeoJSON();
      const tekuisSrc = _getTekuisSource();
      const ticketResult = _getTicketTurfPolys(gjFmt);
      const ticketPolys = ticketResult.polys;
      const ticketFeatures = ticketResult.originalFeatures;

      if (!tekuisSrc){
        (window.Swal ? Swal.fire('Diqqət','TEKUİS layı tapılmadı.','info') : alert('TEKUİS layı tapılmadı.'));
        return;
      }
      if (!ticketPolys.length){
        (window.Swal ? Swal.fire('Diqqət','Tədqiqat poliqonu seçilməyib və ya mövcud deyil.','info') : alert('Tədqiqat poliqonu yoxdur.'));
        return;
      }
      if (tekuisSrc.getFeatures().length === 0){
        (window.Swal ? Swal.fire('Diqqət','TEKUİS layında obyekt yoxdur.','info') : alert('TEKUİS boşdur.'));
        return;
      }

      // təsdiq
      let proceed = true;
      if (window.Swal){
        const ask = await Swal.fire(
          window.buildAppConfirmModal?.({
            title: 'Əminsiniz?',
            html: 'Tədqiqat sərhədləri daxilində qalan <b>TEKUİS hissələri kəsilib silinəcək</b> və <b>Tədqiqat obyektləri TEKUİS layına əlavə ediləcək</b> (yalnız bu sessiyada).',
            icon: 'warning',
            confirmButtonText: 'Bəli, icra et',
            cancelButtonText: 'İmtina',
            confirmButtonVariant: 'primary'
          }) || {
            title: 'Əminsiniz?',
            html: 'Tədqiqat sərhədləri daxilində qalan <b>TEKUİS hissələri kəsilib silinəcək</b> və <b>Tədqiqat obyektləri TEKUİS layına əlavə ediləcək</b> (yalnız bu sessiyada).',
            icon: 'warning',
            showCancelButton: true,
            confirmButtonText: 'Bəli, icra et',
            cancelButtonText: 'İmtina'
          }
        );
        proceed = ask.isConfirmed;
      } else {
        proceed = confirm('Tədqiqat daxilində qalan TEKUİS hissələrini kəsib silmək və Tədqiqat obyektlərini TEKUİS layına əlavə etmək istəyirsiniz?');
      }
      if (!proceed) return;

      const turf = await ensureTurf();

      // maskanı (Tədqiqat) birləşdir
      let eraseGeom = ticketPolys[0];
      for (let i=1; i<ticketPolys.length; i++){
        try { eraseGeom = turf.union(eraseGeom, ticketPolys[i]); }
        catch(e){
          eraseGeom = turf.buffer(turf.union(turf.buffer(eraseGeom,0), turf.buffer(ticketPolys[i],0)),0);
        }
      }

      // TEKUİS → difference
      const feats = tekuisSrc.getFeatures().slice();


      const originalTemplates = [];
      for (const f0 of feats) {
        try {
          const g0 = gjFmt.writeFeatureObject(f0, {
            dataProjection: 'EPSG:4326',
            featureProjection: 'EPSG:3857'
          }).geometry;
          if (!g0 || !/Polygon|MultiPolygon/i.test(g0.type)) continue;
          // geometry-dən əvvəlki atributların dərin kopyası
          const p0 = { ...f0.getProperties() };
          delete p0.geometry;
          originalTemplates.push({ props: p0, gj: g0 });
        } catch(_){}
      }



      let removed = 0, modified = 0, skipped = 0;

      for (const f of feats){
        // Əgər bu feature əvvəlcədən Tədqiqatdan gəlibsə, onu toxunulmazlığa götür
        if (f.get('_from_tedqiqat')) continue;

        const g = gjFmt.writeFeatureObject(f, {
          dataProjection: 'EPSG:4326',
          featureProjection: 'EPSG:3857'
        }).geometry;

        if (!g || (g.type!=='Polygon' && g.type!=='MultiPolygon')) { skipped++; continue; }

        // kəsişmə?
        let isect = false;
        try { isect = turf.booleanIntersects(g, eraseGeom); }
        catch(_){
          try { isect = turf.booleanIntersects(turf.buffer(g,0), turf.buffer(eraseGeom,0)); }
          catch(__){ isect = false; }
        }
        if (!isect) continue;

        // fərq
        let diff = null;
        try { diff = turf.difference(g, eraseGeom); }
        catch(_){
          try { diff = turf.difference(turf.buffer(g,0), turf.buffer(eraseGeom,0)); }
          catch(__){ diff = null; }
        }

        // diff null-dursa: tam içəridə qalıb → sil
        if (!diff){
          tekuisSrc.removeFeature(f);
          removed++;
          continue;
        }

        // Turf Feature/Geometry → OL Geometry
        const newOlGeom = _olGeometryFromTurf(gjFmt, diff);

        // bəzən fərq nəticəsi boş koordinatlı ola bilər
        const isEmpty =
          !newOlGeom ||
          (newOlGeom.getType && /Polygon|MultiPolygon/.test(newOlGeom.getType()) &&
           (!newOlGeom.getCoordinates || !newOlGeom.getCoordinates().length));

        if (isEmpty){
          tekuisSrc.removeFeature(f);
          removed++;
        } else {
          f.setGeometry(newOlGeom);
          markFeatureModified(f);
          modified++;
        }
      }

      // Tədqiqat obyektlərini TEKUİS layına əlavə et
      console.log('Tədqiqat obyektlərini TEKUİS layına əlavə etmək üçün hazırlanır...');
      console.log('ticketFeatures:', ticketFeatures?.length || 0);
      console.log('tekuisSrc:', !!tekuisSrc);
      
      const addedCount = await _addTicketFeaturesToTekuis(tekuisSrc, ticketFeatures, gjFmt, originalTemplates, turf);
      console.log('Əlavə edilən obyekt sayı:', addedCount);

      // UI
      const remain = tekuisSrc.getFeatures().length;
      if (typeof window.tekuisCount !== 'undefined') window.tekuisCount = remain;

      if (typeof window.applyNoDataCardState === 'function'){
        const empty = remain === 0;
        const TEXT_TEKUIS_EMPTY = (window.TEXT_TEKUIS_EMPTY || 'TEKUİS məlumat bazasında heç bir məlumat tapılmadı.');
        const TEXT_TEKUIS_DEFAULT = (window.TEXT_TEKUIS_DEFAULT || '');
        window.applyNoDataCardState('cardTekuis', empty, TEXT_TEKUIS_EMPTY, TEXT_TEKUIS_DEFAULT);
      }

      const chk = byId('chkTekuisLayer');
      if (chk && remain === 0) chk.checked = false;
      if (window.tekuisLayer){
        window.tekuisLayer.setVisible(remain > 0 && (!chk || chk.checked));
        if (typeof window.flashLayer === 'function' && remain > 0){
          window.flashLayer(window.tekuisLayer);
        }
      }

      // --- Maskanı WKT kimi çıxart (backend üçün hazır) ---
      let maskWkt = null;
      try {
        const maskOlGeom = _olGeometryFromTurf(gjFmt, eraseGeom); // EPSG:3857
        if (maskOlGeom) {
          const g4326 = maskOlGeom.clone().transform('EPSG:3857','EPSG:4326');
          maskWkt = new ol.format.WKT().writeGeometry(g4326, { decimals: 8 });
        }
      } catch(_){ /* ignore */ }

      // Son nəticəni yadda saxla (persist üçün lazım olacaq)
      const _result = {
        maskWkt,
        stats: { modified, removed, skipped, remain, added: addedCount },
        ts: Date.now()
      };
      window._TEKUIS_ERASE_LAST = _result;

      // Əməliyyatdan sonra cari vəziyyəti LS-ə yazırıq ki,
      // sonradan yenidən yükləmələrdə köhnə TEKUİS vəziyyəti qayıtmasın.
      try { window.saveTekuisToLS?.(); } catch (_) {}

      const msg = `Kəsildi: ${modified}, Tam silindi: ${removed}${skipped?`, Ötüldü: ${skipped}`:''}. Əlavə edildi: ${addedCount}. Qalan: ${remain}.`;
      (window.Swal ? Swal.fire('Hazırdır', msg, 'success') : alert(msg));

    }catch(err){
      console.error(err);
      (window.Swal ? Swal.fire('Xəta', err?.message || 'Əməliyyat alınmadı.', 'error') : alert('Xəta: '+(err?.message || err)));
    } finally {
      _eraseFlowInProgress = false;
    }
  }

  /* ------------------------------
   * Publik API + Deleqasiya
   * ------------------------------ */
  // Gələcəkdə backend saxlanması üçün minimal API
  window.TEKUIS_ERASE = {
    run: (opts={}) => runEraseFlow(opts),
    last: () => window._TEKUIS_ERASE_LAST || null,
    // Stub: backend hazır olanda bu hissəni aktiv edəcəksiniz
    persist: async function({ ticket=window.PAGE_TICKET } = {}){
      const last = this.last();
      if (!last || !last.maskWkt) {
        window.Swal?.fire('Info','Yadda saxlanacaq mask tapılmadı. Əvvəl kəsmə əməliyyatını edin.','info');
        return { ok:false };
      }
      // const resp = await fetch('/api/tekuis/erase-inside/', {
      //   method: 'POST',
      //   headers: { 'Content-Type':'application/json','Accept':'application/json' },
      //   body: JSON.stringify({ ticket, mask_wkt: last.maskWkt })
      // });
      // if (!resp.ok) throw new Error(await resp.text() || `HTTP ${resp.status}`);
      // return { ok:true, data: await resp.json() };
      return { ok:true, data:null }; // hələlik frontend-only
    }
  };

  // Deleqasiya: kartdakı və (əgər varsa) sağ alətlərdəki silmə düymələri
  document.addEventListener('click', async (e) => {
    const btn = e.target.closest('#btnEraseTekuisInsideTicket, #rtErase');
    if (!btn) return;
    e.preventDefault();
    try {
      await waitForMap();
      await window.TEKUIS_ERASE.run({ persist:false }); // hələlik yalnız front
    } catch (err) {
      console.error(err);
      window.Swal?.fire('Xəta', err?.message || 'Əməliyyat alınmadı.','error');
    }
  }, true);

  /* ------------------------------
   * (İstəyə bağlı) Sağ toolbar-a Erase düyməsi əlavə et
   * ------------------------------ */
  function _injectRightToolsButton(){
    const host = byId('rightTools');
    if (!host || byId('rtErase')) return;
    const b = document.createElement('button');
    b.id = 'rtErase';
    b.className = 'rt-btn';
    b.classList.add('ui-tooltip', 'tooltip-left');
    b.dataset.tooltip = 'TEKUİS → Tədqiqat daxilini kəs və sil, Tədqiqat obyektlərini əlavə et';
    b.setAttribute('aria-label', 'TEKUİS → Tədqiqat daxilini kəs və sil, Tədqiqat obyektlərini əlavə et');
    b.innerHTML = `
      <svg class="rt-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M4 7l8 8M12 7L4 15" stroke="#ef4444" stroke-width="2" stroke-linecap="round"/>
        <circle cx="16.5" cy="7.5" r="2.5" stroke="#ef4444" stroke-width="2"/>
        <circle cx="16.5" cy="16.5" r="2.5" stroke="#ef4444" stroke-width="2"/>
        <path d="M8 16l4-4" stroke="#22c55e" stroke-width="2" stroke-linecap="round"/>
      </svg>`;
    host.appendChild(b);
  }

  // Başlat
  document.addEventListener('DOMContentLoaded', async ()=>{
    try{
      await waitForMap();
      _injectRightToolsButton(); // sağ paneldə görünməsi opsionaldır
    }catch(err){
      console.warn('Map gözlənərkən problem:', err.message);
    }
  });

})();