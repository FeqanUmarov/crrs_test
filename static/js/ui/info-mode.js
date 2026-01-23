window.setupInfoMode = ({
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
} = {}) => {
  let infoMode = false;
  let infoClickKey = null;

  function setLeftButtonActiveForInfo(){
    const btn = document.querySelector('.tool-btn[data-panel="info"]');
    document.querySelectorAll('.tool-btn').forEach(b=>b.classList.remove('active'));
    if (btn){
      btn.classList.add('active');
      moveIndicatorToButton?.(btn);
    }
  }

  function renderInfoPanelLoading(){
    openPanel?.('Məlumatlar', `
      <div class="card">
        <div class="small">Məlumat yüklənir...</div>
      </div>
    `);
    setLeftButtonActiveForInfo();
  }

  const INFO_LABELS_SINGLE = {
    REQUEST_NUMBER: "Müraciət nümrəsi",
    ORG_ID: "Qurum",
    RE_TYPE_ID: "Əmlakın tipi",
    RE_CATEGORY_ID: "Əmlakın kateqoriyası",
    RE_ADDRESS: "Əmlakın ünvanı",
    RE_FACTUAL_USE: "Faktiki istifadə",
    ILLEGAL_BUILDS: "Qanununsuz tikililər",
    NOTES: "Qeyd",
    CONCLUSION: "Nəticə",
    OPINION: "Rəy",
  };

  const INFO_LABELS_PAIRS = [
    { left: "LAND_AREA_D",  right: "LAND_AREA_F",  label: "Torpaq sahəsi" },
    { left: "TOTAL_AREA_D", right: "TOTAL_AREA_F", label: "Ümumi sahə" },
    { left: "MAIN_AREA_D",  right: "MAIN_AREA_F",  label: "Əsas sahə" },
    { left: "AUX_AREA_D",   right: "AUX_AREA_F",   label: "Köməkçi sahə" },
    { left: "ROOM_COUNT_D", right: "ROOM_COUNT_F", label: "Otaq sayı" }
  ];

  function recVal(rec, key){
    if (!rec) return null;
    const direct = rec[key];
    if (direct !== undefined) return direct;
    const k = Object.keys(rec).find(k => String(k).toUpperCase() === String(key).toUpperCase());
    return k ? rec[k] : null;
  }

  const TEKUIS_LABELS = {
    LAND_CATEGORY2ENUM: "Uqodiya",
    LAND_CATEGORY4ENUM: "Alt uqodiya",
    LAND_CATEGORY_ENUM: "Kateqoriya",
    LAND_CATEGORY3ENUM: "Alt kateqoriya",
    NAME:               "Qeyd",
    OWNER_TYPE_ENUM:    "Mülkiyyət",
    SUVARILMA_NOVU_ENUM:"Suvarma",
    EMLAK_NOVU_ENUM:    "Emlak növü",
    OLD_LAND_CATEGORY2ENUM: "İslahat uqodiyası",
    TERRITORY_NAME:     "Ünvan",
    RAYON_ADI:          "Rayonun adı",
    IED_ADI:            "İƏD adı",
    BELEDIYE_ADI:       "Bələdiyyə adı",
    AREA_HA:            "Sahə (hektarla)"
  };

  function renderTekuisInfo(props){
    if (!props) {
      openPanel?.('Məlumatlar', `<div class="card"><div class="small">Məlumat tapılmadı.</div></div>`);
      setLeftButtonActiveForInfo();
      return;
    }
    const rec = Object.assign({}, props);
    delete rec.geometry;

    const rows = Object.entries(TEKUIS_LABELS).map(([col, label]) => {
      const v = recVal(rec, col);
      if (v === null || v === undefined || v === '') return '';
      return `<div class="k">${label}</div><div class="v">${String(v)}</div>`;
    }).join('');

    openPanel?.('Məlumatlar', `
      <div class="card">
        <div class="kv">
          <div class="h">TEKUİS parsel məlumatları</div>
          <div class="sep"></div>
          ${rows || '<div class="small">Bu parsel üçün göstəriləcək atribut yoxdur.</div>'}
        </div>
      </div>
    `);
    setLeftButtonActiveForInfo();
  }

  const NECAS_LABELS = {
    CADASTER_NUMBER: "Kadastr nömrəsi",
    KATEQORIYA:      "Kateqoriya",
    UQODIYA:         "Uqodiyası"
  };

  function renderNecasInfo(props){
    if (!props){
      openPanel?.('Məlumatlar', `<div class="card"><div class="small">Məlumat tapılmadı.</div></div>`);
      setLeftButtonActiveForInfo();
      return;
    }
    const rec = Object.assign({}, props);
    delete rec.geometry;
    const rows = Object.entries(NECAS_LABELS).map(([col,label])=>{
      const v = recVal(rec, col);
      if (v===null || v===undefined || v==='') return '';
      return `<div class="k">${label}</div><div class="v">${String(v)}</div>`;
    }).join('');
    openPanel?.('Məlumatlar', `
      <div class="card">
        <div class="kv">
          <div class="h">NECAS parsel məlumatları</div>
          <div class="sep"></div>
          ${rows || '<div class="small">Bu parsel üçün atribut yoxdur.</div>'}
        </div>
      </div>
    `);
    setLeftButtonActiveForInfo();
  }

  function renderInfoPanel(record, fk){
    if (!record || Object.keys(record).length === 0){
      openPanel?.('Məlumatlar', `
        <div class="card"><div class="small">Məlumat tapılmadı.</div></div>
      `);
      setLeftButtonActiveForInfo();
      return;
    }

    const singleRows = Object.entries(INFO_LABELS_SINGLE).map(([k,label])=>{
      const v = recVal(record, k);
      if (v === null || v === undefined || v === '') return '';
      return `
        <div class="k">${label}</div>
        <div class="v">${String(v)}</div>
      `;
    }).join('');

    const pairRows = INFO_LABELS_PAIRS.map(p=>{
      const vL = recVal(record, p.left);
      const vR = recVal(record, p.right);
      if ((vL===null || vL===undefined || vL==='') &&
          (vR===null || vR===undefined || vR==='')) return '';
      return `
        <div class="pair">
          <div class="pair-label">${p.label}</div>
          <div class="pair-val">${vL===null||vL===undefined?'—':String(vL)}</div>
          <div class="pair-val">${vR===null||vR===undefined?'—':String(vR)}</div>
        </div>
      `;
    }).join('');

    openPanel?.('Məlumatlar', `
      <div class="card">
        <div class="small" style="margin-bottom:8px;"></div>

        <div class="kv">
          <div class="h">Torpaq məlumatları</div>
          <div class="sep"></div>
          ${singleRows}
        </div>

        <div class="kv kv-pairs" style="margin-top:10px;">
          <div class="pairs-header">
            <div class="ph-label">Texniki göstəricilər</div>
            <div class="ph-col">Sənəd</div>
            <div class="ph-col">Faktiki</div>
          </div>
          <div class="sep"></div>
          <div class="pairs-wrap">
            ${pairRows}
          </div>
        </div>
      </div>
    `);

    setLeftButtonActiveForInfo();
  }

  function getFkFromFeature(feature){
    const props = feature.getProperties() || {};
    const keys = Object.keys(props);
    const wanted = ['fk_metadata','fkmeta','metadata_id','rowid','fk','request_id'];
    for (const k of keys){
      const kk = k.toString().toLowerCase();
      if (wanted.includes(kk)) return props[k];
    }
    for (const k of keys){
      if (/^FK_?METADATA$/i.test(k)) return props[k];
      if (/^ROW_?ID$/i.test(k)) return props[k];
    }
    return null;
  }

  async function fetchFeatureInfoByFk(fk){
    const fki = parseInt(String(fk), 10);
    if (!Number.isFinite(fki)) {
      Swal.fire('Diqqət', 'Bu obyekt üçün etibarlı fk_metadata tapılmadı.', 'warning');
      return;
    }
    try {
      renderInfoPanelLoading();
      const resp = await fetch(`/api/info/by-fk/${encodeURIComponent(fki)}/`, {
        headers: { 'Accept':'application/json' }
      });
      if (resp.status === 404){
        renderInfoPanel(null, fki);
        return;
      }
      if (!resp.ok){
        throw new Error(await resp.text() || `HTTP ${resp.status}`);
      }
      const data = await resp.json();
      if (data && data.ok && data.data){
        renderInfoPanel(data.data, fki);
      } else {
        renderInfoPanel(null, fki);
      }
    } catch(err){
      console.error(err);
      Swal.fire('Xəta', (err && err.message) || 'Məlumatı almaq olmadı.', 'error');
    }
  }

  function onMapClickForInfo(evt){
    let hitFeature = null, hitLayer = null;
    map.forEachFeatureAtPixel(evt.pixel, (feat, layer) => {
      if (layer instanceof ol.layer.Vector && !layer.get('infoIgnore')) {
        hitFeature = feat;
        hitLayer = layer;
        return true;
      }
      return false;
    }, { hitTolerance: 5 });

    if (!hitFeature){
      Swal.fire('Diqqət', 'Obyekt tapılmadı. Zəhmət olmasa vektor obyektinin üzərinə klik edin.', 'info');
      return;
    }

    if (window._currentFlashCleanup) { try { window._currentFlashCleanup(); } catch {} }
    if (typeof window.flashFeature === 'function') {
      window._currentFlashCleanup = window.flashFeature(hitFeature, { duration: 1000, hz: 2.5, baseColor: '#60a5fa' });
    }
    setInfoHighlight?.(hitFeature);

    if (hitLayer === tekuisLayer){
      const props = hitFeature.getProperties() || {};
      renderTekuisInfo(props);
      return;
    }

    if (hitLayer === necasLayer){
      const props = hitFeature.getProperties() || {};
      renderNecasInfo(props);
      return;
    }

    const fk = getFkFromFeature(hitFeature);
    if (!fk && fk !== 0){
      Swal.fire('Diqqət', 'Bu obyekt üçün fk_metadata tapılmadı.', 'warning');
      return;
    }
    fetchFeatureInfoByFk(fk);
  }

  function enableInfoMode(){
    if (infoMode) return;
    infoMode = true;
    document.getElementById('rtInfo')?.classList.add('active');

    try { stopDraw?.(true); } catch {}
    try { selectAny?.getFeatures().clear(); } catch {}
    try { selectInteraction?.getFeatures().clear(); } catch {}

    pauseEditingInteractions?.();
    infoClickKey = map.on('singleclick', onMapClickForInfo);
    renderInfoPanelLoading();
  }

  function disableInfoMode(){
    if (!infoMode) return;
    infoMode = false;
    document.getElementById('rtInfo')?.classList.remove('active');
    if (infoClickKey) { ol.Observable.unByKey(infoClickKey); infoClickKey = null; }

    infoHighlightSource?.clear(true);
    if (window._currentFlashCleanup) { try { window._currentFlashCleanup(); } catch {} window._currentFlashCleanup = null; }

    resumeEditingInteractions?.();
  }

  function toggleInfoMode(){
    infoMode ? disableInfoMode() : enableInfoMode();
  }

  return {
    disableInfoMode,
    enableInfoMode,
    toggleInfoMode
  };
};