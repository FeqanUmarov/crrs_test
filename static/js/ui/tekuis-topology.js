(() => {
// === Topologiya Modalı + TEKUİS: validate → (modal) → save =================
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
const DEFAULT_TOPO_OVERLAP_MIN_AREA_SQM = 0;

function resolveTopoMinAreaSqm(){
  const raw = (window.TOPO_MIN_AREA_SQM ?? window.TOPO_MAX_ERROR_SQM);
  if (Number.isFinite(+raw)) return Math.max(0, +raw);
  return DEFAULT_TOPO_MIN_AREA_SQM;
}
function resolveOverlapMinAreaSqm(){
  const raw = window.TOPO_MIN_OVERLAP_SQM;
  if (Number.isFinite(+raw)) return Math.max(0, +raw);
  return DEFAULT_TOPO_OVERLAP_MIN_AREA_SQM;
}


function syncTopoMinArea(){
  const minArea = resolveTopoMinAreaSqm();
  if (window.tv && typeof window.tv.setMinAreaSqm === 'function') {
    window.tv.setMinAreaSqm(minArea);
  }
  return minArea;
}

function formatAreaSqm(value){
  if (!Number.isFinite(+value)) return '—';
  const area = Math.max(0, +value);
  const digits = area >= 1 ? 2 : (area >= 0.01 ? 4 : 6);
  return Number(area.toFixed(digits)).toString();
}


// TEKUİS GeoJSON FeatureCollection (EPSG:4326) çıxarır
function getTekuisFeatureCollection() {
  const src = getTekuisSourceSmart();
  const features = (src?.getFeatures?.() || []);
  const gjFmt = new ol.format.GeoJSON();
  return gjFmt.writeFeaturesObject(features, {
    dataProjection: 'EPSG:4326',
    featureProjection: 'EPSG:3857'
  });
}


// --- Topologiya ikonları (istəyə görə dəyişin)
window.TOPO_ICONS = Object.assign({
  zoom:     '/static/icons/images/visual.svg',
  close:    '/static/icons/images/close.svg',
  ignore:   '/static/icons/images/eye-off.svg',
  unignore: '/static/icons/images/eye-off.svg'
}, window.TOPO_ICONS || {});

const TOPO_ICON_SVGS = {
  zoom: `
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M3.587 13.779C5.366 15.548 8.47 18 12 18c3.531 0 6.634-2.452 8.413-4.221.469-.467.705-.701.854-1.159.107-.327.107-.914 0-1.241-.149-.458-.385-.692-.854-1.159C18.634 8.452 15.531 6 12 6c-3.53 0-6.634 2.452-8.413 4.221-.47.467-.705.701-.854 1.159-.107.327-.107.914 0 1.241.149.458.384.692.854 1.159z" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="M10 12a2 2 0 1 0 4 0 2 2 0 0 0-4 0z" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>
  `,
  ignore: `
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M3.23 7.913 7.91 3.23c.15-.15.35-.23.57-.23h7.05c.21 0 .42.08.57.23l4.67 4.673c.15.15.23.35.23.57v7.054c0 .21-.08.42-.23.57L16.1 20.77c-.15.15-.35.23-.57.23H8.47a.81.81 0 0 1-.57-.23l-4.67-4.673a.793.793 0 0 1-.23-.57V8.473c0-.21.08-.42.23-.57v.01Z" fill="currentColor" fill-opacity=".12" stroke="currentColor" stroke-width="1.5" stroke-miterlimit="10" stroke-linejoin="round"/>
      <path d="M12 16h.008M12 8v5" fill="none" stroke="currentColor" stroke-width="1.5" stroke-miterlimit="10" stroke-linecap="round"/>
    </svg>
  `,
  unignore: `
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M9 7H4v5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="M4 12a8 8 0 1 0 8-8" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>
  `,
  close: `
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M18 6L6 18M6 6l12 12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>
  `
};


// --- Modal UI (dinamik yaradılır) ------------------------------------------
let _topoModal = null;
function ensureTopologyModal(){
  if (_topoModal) return _topoModal;

  const style = document.createElement('style');
  style.textContent = `
    .topo-overlay{
      position:fixed;
      inset:0;
      background:
        radial-gradient(circle at 18% 8%, rgba(59,130,246,.2), transparent 45%),
        radial-gradient(circle at 82% 92%, rgba(14,165,233,.18), transparent 42%),
        rgba(9, 14, 25, .26);
      backdrop-filter: blur(2px);
      z-index:9998;
      display:none;
      pointer-events:none; /* arxadakı xəritəyə kliklər keçsin */
    }
    .topo-modal{
      position:fixed;
      left:50%;
      top:72px;
      transform:translateX(-50%);
      width:min(820px,calc(100vw - 32px));
      max-height:calc(100vh - 120px);
      overflow:auto;
      background:rgba(250, 252, 255, .7);
      border:1px solid rgba(255,255,255,.45);
      border-radius:16px;
      box-shadow:0 24px 55px rgba(15, 23, 42, .28), inset 0 1px 0 rgba(255,255,255,.75);
      backdrop-filter: blur(20px) saturate(165%);
      -webkit-backdrop-filter: blur(20px) saturate(165%);
      z-index:9999;
      display:none;
      font-family:Inter, -apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Segoe UI', sans-serif;
      resize: both; /* diaqonal ölçü dəyiş */
            transform-origin:top center;
    }
    .topo-modal.topo-modal-open{
      animation: topoMacOpen .32s cubic-bezier(.2,.7,.25,1);
    }
    @keyframes topoMacOpen{
      from{ opacity:0; transform:translateX(-50%) translateY(-14px) scale(.97); }
      to{ opacity:1; transform:translateX(-50%) translateY(0) scale(1); }
    }
    .topo-head{
      position:sticky;top:0;display:flex;align-items:center;justify-content:space-between;
      padding:13px 16px;
      background:linear-gradient(180deg, rgba(255,255,255,.72) 0%, rgba(243,246,252,.6) 100%);
      color:#111827;
      border-top-left-radius:16px;
      border-top-right-radius:16px;
      cursor:move; user-select:none; /* başlıqdan tutub daşı */
      border-bottom:1px solid rgba(148,163,184,.28);
      position:sticky;
    }
    .topo-head::before{
      content:'';
      width:10px;
      height:10px;
      border-radius:50%;
      background:#ff5f57;
      box-shadow:16px 0 0 #febc2e, 32px 0 0 #28c840;
      margin-right:14px;
      flex:0 0 auto;
    }
    .topo-head-actions{display:flex;gap:8px;align-items:center;}
    .topo-title{font-weight:600;letter-spacing:.01em;}
    .topo-close{border:0;background:transparent;color:#374151;font-size:18px;cursor:pointer;border-radius:8px;padding:4px}
    .topo-close:hover{background:#e5e7eb}
    .topo-body{padding:14px 16px;display:grid;gap:10px}
    .topo-section{
      border:1px solid rgba(203,213,225,.7);
      border-radius:12px;
      padding:10px;
      background:rgba(255,255,255,.52);
      box-shadow:inset 0 1px 0 rgba(255,255,255,.7);
    }
    .topo-section h4{margin:0 0 8px 0;font-size:14px}
    .topo-list{display:grid;gap:8px}
    .topo-item{display:flex;align-items:center;justify-content:space-between;padding:10px 12px;border:1px dashed rgba(148,163,184,.65);border-radius:10px;background:linear-gradient(180deg,rgba(255,255,255,.78) 0%,rgba(248,250,252,.62) 100%)}
    .topo-actions{display:flex;gap:8px}
    .btn.link{background:transparent;border:0;color:#0b5ed7;text-decoration:underline}
    .topo-foot{display:flex;justify-content:flex-end;gap:8px;padding:10px 16px;border-top:1px solid rgba(148,163,184,.28);background:rgba(255,255,255,.35);border-bottom-left-radius:16px;border-bottom-right-radius:16px;}
    .topo-item.ignored{ opacity:.55; }
    .badge-ignored{ margin-left:8px;padding:2px 6px;border-radius:6px;background:#fef3c7;color:#92400e;font-size:12px; }
    .hidden{ display:none; }
    .btn .ico{ width:16px;height:16px;display:inline-flex;align-items:center;justify-content:center;vertical-align:middle;margin-right:6px; }
    .btn .ico svg{ width:16px;height:16px;display:block; }
    .btn.icon-only .ico{ margin-right:0; }
    .topo-close.icon-only{ padding:6px; }

    .topo-actions .btn,
    .topo-foot .btn,
    .topo-head-actions .btn {
      display:inline-flex;align-items:center;gap:6px;
      background:#fff;
      border:1px solid #d1d5db;
      color:#111827;
      padding:6px 10px;
      border-radius:8px;
      font-size:13px;
      line-height:1.2;
      cursor:pointer;
      transition:background .15s ease, border-color .15s ease, box-shadow .15s ease;
    }
    .topo-actions .btn.icon-only{
      width:34px;height:34px;padding:0;justify-content:center;
      border-radius:10px;
      background:transparent;
      box-shadow:none;
    }
    .topo-actions .btn.icon-only .ico,
    .topo-actions .btn.icon-only svg{
      width:18px;height:18px;
    }
    .topo-actions .btn.icon-only svg{
      fill:currentColor;stroke:currentColor;
    }
    .topo-actions .btn.icon-only:active{
      transform:translateY(1px);
      box-shadow:0 4px 8px rgba(15,23,42,.12);
    }
    .topo-actions .btn.icon-only.topo-action-zoom{
      color:#2563eb;
    }
    .topo-actions .btn.icon-only.topo-action-toggle{
      color:#0f766e;
    }
    .topo-actions .btn.icon-only.topo-action-toggle.is-ignored{
      color:#b45309;
    }
    .topo-foot .btn.icon-only{
      width:36px;height:36px;padding:0;justify-content:center;
    }
    .topo-foot .btn.icon-only.topo-action-close{
      color:#dc2626;
    }
    .topo-actions .btn:hover,
    .topo-foot .btn:hover {
      background:#f3f4f6;
      border-color:#9ca3af;
    }
    .topo-actions .btn:focus-visible,
    .topo-foot .btn:focus-visible {
      outline:2px solid #60a5fa;
      outline-offset:2px;
    }
    .topo-foot .btn.primary{
      background:#2563eb;border-color:#2563eb;color:#fff;
    }
    .topo-foot .btn.primary:hover{
      background:#1d4ed8;border-color:#1d4ed8;
    }

    .swal2-container{ z-index:11000 !important; }
    #btnValidateTekuis.topology-validate-reminder{
      animation: topoValidatePulse 1.2s ease-in-out infinite;
      box-shadow: 0 0 0 0 rgba(37, 99, 235, .55);
      border-radius: 10px;
    }
    @keyframes topoValidatePulse {
      0% {
        transform: scale(1);
        box-shadow: 0 0 0 0 rgba(37, 99, 235, .55);
      }
      70% {
        transform: scale(1.06);
        box-shadow: 0 0 0 10px rgba(37, 99, 235, 0);
      }
      100% {
        transform: scale(1);
        box-shadow: 0 0 0 0 rgba(37, 99, 235, 0);
      }
    }

    #btnSaveTekuis.tekuis-save-reminder{
      animation: topoSavePulse 1.2s ease-in-out infinite;
      box-shadow: 0 0 0 0 rgba(16, 185, 129, .55);
      border-radius: 10px;
    }
    @keyframes topoSavePulse {
      0% {
        transform: scale(1);
        box-shadow: 0 0 0 0 rgba(16, 185, 129, .55);
      }
      70% {
        transform: scale(1.06);
        box-shadow: 0 0 0 10px rgba(16, 185, 129, 0);
      }
      100% {
        transform: scale(1);
        box-shadow: 0 0 0 0 rgba(16, 185, 129, 0);
      }
    }

  `;

  document.head.appendChild(style);

  const overlay = document.createElement('div');
  overlay.className = 'topo-overlay';

  const modal = document.createElement('div');
  modal.className = 'topo-modal';
  modal.innerHTML = `
    <div class="topo-head">
      <div class="topo-title">Topologiya xətaları tapıldı</div>
      <div class="topo-head-actions">
        <button class="btn" id="btnValidateTekuisModal" disabled>Yoxla</button>
        <button class="topo-close ui-tooltip" data-tooltip="Bağla" aria-label="Bağla">✕</button>
      </div>
    </div>
    <div class="topo-body">
      <div class="topo-section">
        <h4>Ümumi məlumat</h4>
        <div id="topo-summary"></div>
      </div>
      <div class="topo-section" id="topo-overlaps-sec" style="display:none">
        <h4>Kəsişmələr (overlap)</h4>
        <div class="topo-list" id="topo-overlaps"></div>
      </div>
      <div class="topo-section" id="topo-gaps-sec" style="display:none">
        <h4>Boşluqlar (gap)</h4>
        <div class="topo-list" id="topo-gaps"></div>
      </div>
    </div>
    <div class="topo-foot">
      <button class="btn icon-only topo-action-close ui-tooltip" id="btnTopoClose" data-tooltip="Bağla" aria-label="Bağla">
        <span class="ico">${TOPO_ICON_SVGS.close}</span>
      </button>
    </div>
  `;
  modal.querySelector('.topo-close').addEventListener('click', () => requestCloseTopologyModal({ source: 'headerClose' }));
  modal.querySelector('#btnTopoClose').addEventListener('click', () => requestCloseTopologyModal({ source: 'footerClose' }));

  async function requestCloseTopologyModal({ source = 'unknown' } = {}) {
  const v = window._lastTopoValidation || {};
  const eff = computeEffective(v);
  
  // Əgər həll edilməmiş xətalar varsa xəbərdarlıq göstər
  if (eff.overlapsLeft > 0 || eff.gapsLeft > 0) {
    const ask = await Swal.fire(window.buildAppConfirmModal({
      title: 'Xətalar həll edilməyib',
      html: `Hələ də <b>${eff.overlapsLeft} overlap</b> və <b>${eff.gapsLeft} gap</b> xətası var.<br><br>Pəncərəni bağlasanız, növbəti dəfə <b>yenidən yoxlanacaq</b>. Pəncərə bağlansın?`,
      icon: 'warning',
      confirmButtonText: 'Bəli, bağla',
      cancelButtonText: 'Xeyr, geri qayıt',
      confirmButtonVariant: 'danger'
    }));
    if (!ask.isConfirmed) return;
  }

  if (eff.overlapsLeft === 0 && eff.gapsLeft === 0) {
    const msg = 'Topoloji xəta yoxdur. Məlumatları yadda saxlayın';
    if (window.Toast?.success) {
      window.Toast.success(msg, 'Uğurlu', 6000);
    } else {
      Swal.fire('Uğurlu', msg, 'success');
    }

    const validateBtn = document.getElementById('btnValidateTekuis');
    const saveBtn = document.getElementById('btnSaveTekuis');
    if (source === 'footerClose') {
      validateBtn?.classList.add('topology-validate-reminder');
      saveBtn?.classList.remove('tekuis-save-reminder');
    } else {
      validateBtn?.classList.remove('topology-validate-reminder');
      saveBtn?.classList.add('tekuis-save-reminder');
    }
  }
  
  closeTopologyModal();
}


  document.body.append(overlay, modal);
  _topoModal = { overlay, modal };
  return _topoModal;
}

// === Topologiya: "Bunu xəta kimi sayma" dəstəyi ===
window._ignoredTopo = window._ignoredTopo || { overlaps: new Set(), gaps: new Set() };

function _djb2(str){ let h=5381,i=str.length; while(i) h=(h*33) ^ str.charCodeAt(--i); return (h>>>0).toString(36); }
// Koordinatları/obyekti deterministik yuvarlaqlaşdır (6 rəqəm)
function roundDeep(x, d=6){
  if (Array.isArray(x)) return x.map(v => roundDeep(v, d));
  if (typeof x === 'number') return +x.toFixed(d);
  if (x && typeof x === 'object'){
    const out = {};
    Object.keys(x).sort().forEach(k => { out[k] = roundDeep(x[k], d); });
    return out;
  }
  return x;
}

// (Əvvəlki cavabda artıq var idisə) roundDeep-dən istifadə edirik
function normalizeFC(fc, d = 6){
  return roundDeep(fc, d);
}

// Stabil topo açarı: geom-u 6 rəqəm dəqiqliklə normallaşdırıb hashla
function topoKey(obj){
  try {
    const explicit = obj?.hash ?? obj?.key;
    if (explicit) return String(explicit);
    const g = obj?.geom ?? obj;                 // GeoJSON geometry və ya obyekt
    const norm = JSON.stringify(roundDeep(g, 6));
    return 'k' + _djb2(norm);
  } catch {
    return 'k' + Math.random().toString(36).slice(2);
  }
}


function computeEffective(validation){
  const ovs = validation?.overlaps || [];
  const gps = validation?.gaps || [];
  let ignoredO = 0, ignoredG = 0;
  for (const it of ovs) if (window._ignoredTopo.overlaps.has(topoKey(it))) ignoredO++;
  for (const it of gps) if (window._ignoredTopo.gaps.has(topoKey(it)))    ignoredG++;
  return {
    overlapsTotal: ovs.length, gapsTotal: gps.length,
    overlapsIgnored: ignoredO, gapsIgnored: ignoredG,
    overlapsLeft: ovs.length - ignoredO, gapsLeft: gps.length - ignoredG
  };
}

function getIgnoredGapKeys(){
  const gpSet = window._ignoredTopo?.gaps || new Set();

return Array.from(gpSet);
}

// --- Drag (title-dan tutub sürüşdür) ---
(() => {
  // modal/overlay DOM-da yoxdursa, yaradacaq; varsa, eyni obyektləri qaytaracaq
  const { modal } = ensureTopologyModal();
  const head = modal.querySelector('.topo-head');
  let dragging = false, sx=0, sy=0, sl=0, st=0;

  function clamp(v,min,max){ return Math.max(min, Math.min(max, v)); }

  head.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return;
    dragging = true;
    const rect = modal.getBoundingClientRect();
    modal.style.left = `${rect.left}px`;
    modal.style.top = `${rect.top}px`;
    sx = e.clientX; sy = e.clientY; sl = rect.left; st = rect.top;
    modal.style.transform = 'none';
    document.body.style.userSelect = 'none';
    e.preventDefault();
  });

  window.addEventListener('mousemove', (e) => {
    if (!dragging) return;
    const dx = e.clientX - sx;
    const dy = e.clientY - sy;
    const nw = modal.offsetWidth;
    const nh = modal.offsetHeight;
    const L = clamp(sl + dx, 0, window.innerWidth  - Math.min(nw, window.innerWidth));
    const T = clamp(st + dy, 0, window.innerHeight - Math.min(nh, window.innerHeight));
    modal.style.left = `${L}px`;
    modal.style.top  = `${T}px`;
  });

  window.addEventListener('mouseup', () => {
    if (!dragging) return;
    dragging = false;
    document.body.style.userSelect = '';
  });
})();



function openTopologyModal(validation){
  window._lastTopoValidation = validation;
  const { overlay, modal } = ensureTopologyModal();

  const s = validation?.stats || {};
  const eff = computeEffective(validation);
  const minArea = window.tv?.getMinAreaSqm?.() ?? resolveTopoMinAreaSqm();
  modal.querySelector('#topo-summary').innerHTML =
    `Feature sayı: <b>${s.n_features ?? 0}</b> &nbsp; | &nbsp; ` +
    `Overlap: <b>${eff.overlapsLeft}</b> / ${eff.overlapsTotal} (sayılmayan: ${eff.overlapsIgnored}) &nbsp; | &nbsp; ` +
    `Gap: <b>${eff.gapsLeft}</b> / ${eff.gapsTotal} (sayılmayan: ${eff.gapsIgnored}) &nbsp; | &nbsp; ` +
    `Min sahə: <b>${formatAreaSqm(minArea)}</b> m²`;

// Overlaps
  const ovSec  = modal.querySelector('#topo-overlaps-sec');
  const ovList = modal.querySelector('#topo-overlaps');
  ovList.innerHTML = '';
  const overlaps = validation?.overlaps || [];
  if (overlaps.length){
    ovSec.style.display = '';
    overlaps.forEach((o, i) => {
      const key = topoKey(o);
      const ignored = window._ignoredTopo.overlaps.has(key);
      const el = document.createElement('div');
      el.className = 'topo-item' + (ignored ? ' ignored' : '');
      el.dataset.kind = 'overlap';
      el.dataset.key  = key;
      el.innerHTML = `
        <div>
          #${i+1} — sahə: <b>${formatAreaSqm(o.area_sqm)}</b> m²
          <span class="badge-ignored ${ignored ? '' : 'hidden'}">sayılmır</span>
        </div>
        <div class="topo-actions">
          <button class="btn icon-only topo-action-zoom ui-tooltip" data-act="zoom" data-tooltip="Xəritədə göstər" aria-label="Xəritədə göstər">
            <span class="ico">${TOPO_ICON_SVGS.zoom}</span>
          </button>
        </div>`;
      // Zoom
      el.querySelector('[data-act=zoom]')?.addEventListener('click', () => {
        zoomAndHighlightTopoGeometry(o.geom);
      });
      ovList.appendChild(el);
    });
  } else {
    ovSec.style.display = 'none';
  }


// Gaps
  const gpSec  = modal.querySelector('#topo-gaps-sec');
  const gpList = modal.querySelector('#topo-gaps');
  gpList.innerHTML = '';
  const gaps = validation?.gaps || [];
  if (gaps.length){
    gpSec.style.display = '';
    gaps.forEach((g, i) => {
      const key = topoKey(g);
      const ignored = window._ignoredTopo.gaps.has(key);
      const el = document.createElement('div');
      el.className = 'topo-item' + (ignored ? ' ignored' : '');
      el.dataset.kind = 'gap';
      el.dataset.key  = key;
      el.innerHTML = `
        <div>
          #${i+1} — boşluq sahəsi: <b>${formatAreaSqm(g.area_sqm)}</b> m²
          <span class="badge-ignored ${ignored ? '' : 'hidden'}">sayılmır</span>
        </div>
        <div class="topo-actions">
         <button class="btn icon-only topo-action-zoom ui-tooltip" data-act="zoom" data-tooltip="Xəritədə göstər" aria-label="Xəritədə göstər">
            <span class="ico">${TOPO_ICON_SVGS.zoom}</span>
          </button>
          <button class="btn icon-only topo-action-toggle ui-tooltip ${ignored ? 'is-ignored' : ''}" data-act="toggleIgnore" data-tooltip="${ignored ? 'Xəta kimi qeyd et' : 'Xətanı sayma'}" aria-label="${ignored ? 'Xəta kimi qeyd et' : 'Xətanı sayma'}">
            <span class="ico">${ignored ? TOPO_ICON_SVGS.unignore : TOPO_ICON_SVGS.ignore}</span>
          </button>
        </div>`;
      // Zoom
      el.querySelector('[data-act=zoom]')?.addEventListener('click', () => {
        zoomAndHighlightTopoGeometry(g.geom);
      });
      // Gaps bölməsində
      el.querySelector('[data-act=toggleIgnore]')?.addEventListener('click', () => {
        const set = window._ignoredTopo.gaps;
        const nowIgnored = set.has(key);
        if (nowIgnored) set.delete(key); else set.add(key);
        
        // UI-ni yenilə
        el.classList.toggle('ignored', !nowIgnored);
        el.querySelector('.badge-ignored')?.classList.toggle('hidden', nowIgnored);
        const btn = el.querySelector('[data-act=toggleIgnore]');
        if (btn) {
          const nextTooltip = (!nowIgnored ? 'Xəta kimi qeyd et' : 'Xətanı sayma');
          btn.dataset.tooltip = nextTooltip;
          btn.setAttribute('aria-label', nextTooltip);
          btn.classList.toggle('is-ignored', !nowIgnored);
          btn.innerHTML = `
            <span class="ico">${!nowIgnored ? TOPO_ICON_SVGS.unignore : TOPO_ICON_SVGS.ignore}</span>
          `;
        }
      });
      gpList.appendChild(el);
    });
  } else {
    gpSec.style.display = 'none';
  }

  renderTopoErrorsOnMap(validation);
  
  overlay.style.display = 'block';
  modal.style.display   = 'block';
  modal.classList.remove('topo-modal-open');
  void modal.offsetWidth;
  modal.classList.add('topo-modal-open');
  window.TekuisValidationWorkflow?.bindButtons?.();

}


function closeTopologyModal(){
  if (!_topoModal) return;
  _topoModal.overlay.style.display = 'none';
  _topoModal.modal.style.display   = 'none';
  _topoModal.modal.classList.remove('topo-modal-open');


  try { topoFocusSource.clear(true); } catch {}
  try { topoErrorSource?.clear(true); } catch {}
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

// Xəritədə TEKUİS layını tap (başqa fayldan yaradılsa belə)
function findExternalTekuisLayer() {
  let found = null;
  map.getLayers().forEach(l => {
    if (found) return;
    if (!(l instanceof ol.layer.Vector)) return;
    const title = (l.get('title') || '').toString().toLowerCase();
    // bizim layda set etdiyimiz flag-lar da yoxlanır
    if (title.includes('tekuis') || l.get('isTekuisEditable') === true) {
      found = l;
    }
  });
  return found;
}

// TEKUİS mənbəyini ağıllı seç (əvvəl özümüzünkünü, yoxdursa xaricidən)
function getTekuisSourceSmart() {
    if (tekuisSource && tekuisSource.getFeatures &&
      tekuisSource.getFeatures().length > 0) {
    return tekuisSource;
  }

  const ext = findExternalTekuisLayer();
  return ext ? ext.getSource() : (tekuisSource || null);
}

function clearTopologyOverlay(){
  try { renderTopoErrorsOnMap?.({ overlaps: [], gaps: [], stats: {} }); } catch {}
  closeTopologyModal();
}

function resetIgnored(){
  window._ignoredTopo = { overlaps: new Set(), gaps: new Set() };
}

function setLastValidation(validation){
  window._lastTopoValidation = validation || null;
}

window.TekuisTopologyUI = {
  openModal: openTopologyModal,
  closeModal: closeTopologyModal,
  clearOverlay: clearTopologyOverlay,
  computeEffective,
  getIgnoredGapKeys,
  resetIgnored,
  setLastValidation,
  getTekuisFeatureCollection,
  getTekuisSourceSmart
};
})();