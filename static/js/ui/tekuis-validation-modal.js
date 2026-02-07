(() => {
  "use strict";

  const state = {
    modal: null,
    overlay: null,
    onValidate: null,
    onClose: null,
    context: {}
  };

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
    `,
    validate: `
      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path d="M5 12l4 4L19 6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
    `
  };

  function ensureModal(){
    if (state.modal) return { modal: state.modal, overlay: state.overlay };

    const style = document.createElement('style');
    style.textContent = `
      .topo-overlay{
        position:fixed;inset:0;background:rgba(0,0,0,.25);
        z-index:9998;display:none;pointer-events:none;
      }
      .topo-modal{
        position:fixed;left:50%;top:72px;transform:translateX(-50%);
        width:min(820px,calc(100vw - 32px));max-height:calc(100vh - 120px);
        overflow:auto;background:#fff;border-radius:12px;box-shadow:0 12px 40px rgba(0,0,0,.25);
        z-index:9999;display:none;font-family:sans-serif;
        resize: both;
      }
      .topo-head{
        position:sticky;top:0;display:flex;align-items:center;justify-content:space-between;
        padding:12px 16px;background:#f3f4f6;color:#111827;border-top-left-radius:12px;border-top-right-radius:12px;
        cursor:move; user-select:none;
        border-bottom:1px solid #e5e7eb;
      }
      .topo-title{font-weight:600}
      .topo-close{border:0;background:transparent;color:#374151;font-size:18px;cursor:pointer;border-radius:8px;padding:4px}
      .topo-close:hover{background:#e5e7eb}
      .topo-body{padding:14px 16px;display:grid;gap:10px}
      .topo-section{border:1px solid #e6e6e6;border-radius:10px;padding:10px}
      .topo-section h4{margin:0 0 8px 0;font-size:14px}
      .topo-list{display:grid;gap:8px}
      .topo-item{display:flex;align-items:center;justify-content:space-between;padding:10px 12px;border:1px dashed #d9d9d9;border-radius:10px;background:linear-gradient(180deg,#ffffff 0%,#f9fafb 100%)}
      .topo-actions{display:flex;gap:8px}
      .topo-foot{display:flex;justify-content:flex-end;gap:8px;padding:10px 16px;border-top:1px solid #eee}
      .topo-item.ignored{ opacity:.55; }
      .badge-ignored{ margin-left:8px;padding:2px 6px;border-radius:6px;background:#fef3c7;color:#92400e;font-size:12px; }
      .hidden{ display:none; }
      .btn .ico{ width:16px;height:16px;display:inline-flex;align-items:center;justify-content:center;vertical-align:middle;margin-right:6px; }
      .btn .ico svg{ width:16px;height:16px;display:block; }
      .btn.icon-only .ico{ margin-right:0; }
      .topo-close.icon-only{ padding:6px; }

      .topo-actions .btn,
      .topo-foot .btn {
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
      .topo-actions .btn.icon-only.topo-action-zoom{ color:#2563eb; }
      .topo-actions .btn.icon-only.topo-action-toggle{ color:#0f766e; }
      .topo-actions .btn.icon-only.topo-action-toggle.is-ignored{ color:#b45309; }
      .topo-foot .btn.icon-only{ width:36px;height:36px;padding:0;justify-content:center; }
      .topo-foot .btn.icon-only.topo-action-close{ color:#dc2626; }
      .topo-actions .btn:hover,
      .topo-foot .btn:hover { background:#f3f4f6; border-color:#9ca3af; }
      .topo-actions .btn:focus-visible,
      .topo-foot .btn:focus-visible { outline:2px solid #60a5fa; outline-offset:2px; }
      .topo-foot .btn.primary{ background:#2563eb;border-color:#2563eb;color:#fff; }
      .topo-foot .btn.primary:hover{ background:#1d4ed8;border-color:#1d4ed8; }

      .swal2-container{ z-index:11000 !important; }
    `;

    document.head.appendChild(style);

    const overlay = document.createElement('div');
    overlay.className = 'topo-overlay';

    const modal = document.createElement('div');
    modal.className = 'topo-modal';
    modal.innerHTML = `
      <div class="topo-head">
        <div class="topo-title">Topologiya nəticələri</div>
        <button class="topo-close ui-tooltip" data-tooltip="Bağla" aria-label="Bağla">✕</button>
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
        <button class="btn primary topo-action-validate ui-tooltip" id="btnTopoValidate" data-tooltip="Yenidən yoxla" aria-label="Yenidən yoxla">
          <span class="ico">${TOPO_ICON_SVGS.validate}</span>
          Validate
        </button>
        <button class="btn icon-only topo-action-close ui-tooltip" id="btnTopoClose" data-tooltip="Bağla" aria-label="Bağla">
          <span class="ico">${TOPO_ICON_SVGS.close}</span>
        </button>
      </div>
    `;

    modal.querySelector('.topo-close').addEventListener('click', close);
    modal.querySelector('#btnTopoClose').addEventListener('click', close);
    modal.querySelector('#btnTopoValidate').addEventListener('click', () => {
      if (typeof state.onValidate === 'function') state.onValidate();
    });

    document.body.append(overlay, modal);
    state.modal = modal;
    state.overlay = overlay;

    setupDrag(modal);

    return { modal, overlay };
  }

  function setupDrag(modal){
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
  }

  function formatAreaSqm(value){
    if (!Number.isFinite(+value)) return '—';
    const area = Math.max(0, +value);
    const digits = area >= 1 ? 2 : (area >= 0.01 ? 4 : 6);
    return Number(area.toFixed(digits)).toString();
  }

  function open(validation){
    const { overlay, modal } = ensureModal();
    const eff = window.TekuisValidationState?.computeEffective?.(validation) || {};
    const s = validation?.stats || {};
    const minArea = window.tv?.getMinAreaSqm?.() ?? 0;

    modal.querySelector('#topo-summary').innerHTML =
      `Feature sayı: <b>${s.n_features ?? 0}</b> &nbsp; | &nbsp; ` +
      `Overlap: <b>${eff.overlapsLeft ?? 0}</b> / ${eff.overlapsTotal ?? 0} &nbsp; | &nbsp; ` +
      `Gap: <b>${eff.gapsLeft ?? 0}</b> / ${eff.gapsTotal ?? 0} (sayılmayan: ${eff.gapsIgnored ?? 0}) &nbsp; | &nbsp; ` +
      `Min sahə: <b>${formatAreaSqm(minArea)}</b> m²`;

    const ovSec  = modal.querySelector('#topo-overlaps-sec');
    const ovList = modal.querySelector('#topo-overlaps');
    ovList.innerHTML = '';
    const overlaps = validation?.overlaps || [];
    if (overlaps.length){
      ovSec.style.display = '';
      overlaps.forEach((o, i) => {
        const el = document.createElement('div');
        el.className = 'topo-item';
        el.dataset.kind = 'overlap';
        el.innerHTML = `
          <div>
            #${i+1} — sahə: <b>${formatAreaSqm(o.area_sqm)}</b> m²
          </div>
          <div class="topo-actions">
            <button class="btn icon-only topo-action-zoom ui-tooltip" data-act="zoom" data-tooltip="Xəritədə göstər" aria-label="Xəritədə göstər">
              <span class="ico">${TOPO_ICON_SVGS.zoom}</span>
            </button>
          </div>`;
        el.querySelector('[data-act=zoom]')?.addEventListener('click', () => {
          state.context.zoomAndHighlightTopoGeometry?.(o.geom);
        });
        ovList.appendChild(el);
      });
    } else {
      ovSec.style.display = 'none';
    }

    const gpSec  = modal.querySelector('#topo-gaps-sec');
    const gpList = modal.querySelector('#topo-gaps');
    gpList.innerHTML = '';
    const gaps = validation?.gaps || [];
    if (gaps.length){
      gpSec.style.display = '';
      gaps.forEach((g, i) => {
        const key = window.TekuisValidationState?.topoKey?.(g);
        const ignored = window.TekuisValidationState?.isGapIgnored?.(key);
        const el = document.createElement('div');
        el.className = 'topo-item' + (ignored ? ' ignored' : '');
        el.dataset.kind = 'gap';
        el.dataset.key  = key;
        el.dataset.hash = g?.hash ? String(g.hash) : '';
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
        el.querySelector('[data-act=zoom]')?.addEventListener('click', () => {
          state.context.zoomAndHighlightTopoGeometry?.(g.geom);
        });
        el.querySelector('[data-act=toggleIgnore]')?.addEventListener('click', async () => {
          const isCurrentlyIgnored = window.TekuisValidationState?.isGapIgnored?.(key);
          const nowIgnored = !isCurrentlyIgnored;
          window.TekuisValidationState?.setGapIgnored?.(key, nowIgnored);
          window.TekuisValidationState?.markDirty?.();
          const applyIgnoreUi = (ignoredState) => {
            el.classList.toggle('ignored', ignoredState);
            el.querySelector('.badge-ignored')?.classList.toggle('hidden', !ignoredState);
            const btn = el.querySelector('[data-act=toggleIgnore]');
            if (btn) {
              const nextTooltip = (ignoredState ? 'Xəta kimi qeyd et' : 'Xətanı sayma');
              btn.dataset.tooltip = nextTooltip;
              btn.setAttribute('aria-label', nextTooltip);
              btn.classList.toggle('is-ignored', ignoredState);
              btn.innerHTML = `<span class="ico">${ignoredState ? TOPO_ICON_SVGS.unignore : TOPO_ICON_SVGS.ignore}</span>`;
            }
          };
          applyIgnoreUi(nowIgnored);
          if (nowIgnored && g?.hash) {
            const ticket = window.PAGE_TICKET || '';
            const metaId = window.META_ID ?? null;
            const resp = await window.TekuisValidationService?.ignoreGap?.({
              hash: g.hash,
              geom: g.geom,
              ticket,
              metaId
            });
            if (!resp?.ok) {
              window.TekuisValidationState?.setGapIgnored?.(key, false);
              applyIgnoreUi(false);
              window.showToast?.('Xəta: seçilən boşluğu saymama qeydi saxlanmadı.');
            }
          }
          if (typeof state.context.onIgnoredChange === 'function') {
            state.context.onIgnoredChange();
          }
        });
        gpList.appendChild(el);
      });
    } else {
      gpSec.style.display = 'none';
    }

    state.context.renderTopoErrorsOnMap?.(validation);
    overlay.style.display = 'block';
    modal.style.display = 'block';
  }

  function close(){
    if (!state.modal) return;
    state.overlay.style.display = 'none';
    state.modal.style.display = 'none';
    state.context.clearTopoErrors?.();
    if (typeof state.onClose === 'function') state.onClose();
  }

  function init(context = {}){
    state.context = { ...context };
    ensureModal();
  }

  function setOnValidate(fn){
    state.onValidate = fn;
  }

  function setOnClose(fn){
    state.onClose = fn;
  }

  window.TekuisValidationModal = {
    init,
    open,
    close,
    setOnValidate,
    setOnClose
  };
})();