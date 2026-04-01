const LOGIN_APP_BASE = 'http://10.11.1.73:8085/login';

// --- Auth Guard (ilk açılış + periodik yoxlama)
function showAuthGateAndRedirect(msg){
  try {
    const div = document.createElement('div');
    div.style.cssText = 'position:fixed;inset:0;background:#0b102033;backdrop-filter:blur(3px);display:flex;align-items:center;justify-content:center;z-index:99999;';
    div.innerHTML = `<div style="background:#fff;padding:20px 24px;border-radius:10px;box-shadow:0 10px 30px rgba(0,0,0,.12);font-family:sans-serif;max-width:520px;text-align:center">
      <h3 style="margin:0 0 8px">Sessiya bitmişdir</h3>
      <p style="margin:0 0 12px;color:#374151">${msg || 'Token etibarsız və ya vaxtı keçib.'}</p>
      <p style="margin:0;color:#6b7280">Login səhifəsinə yönləndirilirsiniz…</p>
    </div>`;
    document.body.appendChild(div);
  } catch {}
  setTimeout(()=>{ window.location.replace(LOGIN_APP_BASE); }, 1200);
}

// 401 (Unauthorized) düşən kimi avtomatik login səhifəsinə yönləndir
(function hardAuthRedirect(){
  const _fetch = window.fetch;
  window.fetch = async (...args) => {
    const r = await _fetch(...args);
    if (r.status === 401) {
      showAuthGateAndRedirect('Sessiya bitdi və ya token etibarsızdır.');
      // axınları dayandırmaq üçün error atırıq:
      throw new Error('Unauthorized');
    }
    return r;
  };
})();

async function authGuardOnce(){
  // Ticket ümumiyyətlə yoxdursa → birbaşa geri
  if (!window.PAGE_TICKET) {
    showAuthGateAndRedirect('Ticket tapılmadı.');
    return false;
  }
  try{
    const r = await fetch(`/api/ticket-status/?ticket=${encodeURIComponent(window.PAGE_TICKET)}`, {
      headers: { 'Accept':'application/json' }
    });
    if (!r.ok) {
      const txt = await r.text().catch(()=> '');
      showAuthGateAndRedirect(txt || 'Giriş tələb olunur.');
      return false;
    }
    const data = await r.json();
    // mövcud dəyişənlərin yenilənməsi (səndə artıq var)
    window.CURRENT_STATUS_ID = data?.status_id ?? null;
    window.EDIT_ALLOWED = !!data?.allow_edit;
    window.RT_DRAW_SNAP_LOCKED = !!data?.draw_snap_locked;
    window.applyEditPermissions?.();
    window.applyStatusDrivenUI?.();
    window.applyRightToolLocks?.();
    window.updateTicketDeleteState?.();
    return true;
  }catch(e){
    console.warn('authGuard error:', e);
    showAuthGateAndRedirect('Şəbəkə xətası.');
    return false;
  }
}

// Səhifə açılan kimi yoxla:
authGuardOnce();

// Hər 30 saniyədən bir sessiyanı yoxla:
setInterval(() => { authGuardOnce(); }, 30000);

// === STATUS icazəsi (status_control.is_edit=true olan statuslar üçün) ===
window.EDIT_ALLOWED = typeof window.EDIT_ALLOWED === 'boolean' ? window.EDIT_ALLOWED : false;
window.CURRENT_STATUS_ID = Number.isInteger(window.CURRENT_STATUS_ID) ? window.CURRENT_STATUS_ID : null;
window.RT_DRAW_SNAP_LOCKED = !!window.RT_DRAW_SNAP_LOCKED;

async function fetchTicketStatus() {
  if (!window.PAGE_TICKET) return false;
  try {
    const resp = await fetch(`/api/ticket-status/?ticket=${encodeURIComponent(window.PAGE_TICKET)}`, {
      headers: { 'Accept':'application/json' }
    });
    if (!resp.ok) throw new Error(await resp.text());
    const data = await resp.json();
    window.CURRENT_STATUS_ID = data?.status_id ?? null;
    window.EDIT_ALLOWED = !!data?.allow_edit;
    window.RT_DRAW_SNAP_LOCKED = !!data?.draw_snap_locked;
    applyEditPermissions();
    window.applyStatusDrivenUI?.();
    window.applyRightToolLocks?.();
    window.updateTicketDeleteState?.();
    return window.EDIT_ALLOWED;
  } catch (e) {
    console.warn('ticket-status error:', e);
    window.EDIT_ALLOWED = false;
    window.RT_DRAW_SNAP_LOCKED = false;
    applyEditPermissions();
    window.applyStatusDrivenUI?.();
    window.applyRightToolLocks?.();
    return false;
  }
}

function applyEditPermissions(){
  const dataBtn = document.querySelector('.tool-btn[data-panel="contents"]');
  const editBtn = document.querySelector('.tool-btn[data-panel="catalog"]');
  [dataBtn, editBtn].forEach(btn=>{
    if (!btn) return;
    if (window.EDIT_ALLOWED){
      btn.classList.remove('locked');
      btn.removeAttribute('aria-disabled');
      btn.title = btn.dataset.title || btn.title || '';
    } else {
      btn.classList.add('locked');
      btn.setAttribute('aria-disabled','true');
      btn.title = 'Bu müraciətin statusuna görə bu bölmə bağlıdır.';
    }
  });
}

window.authGuardOnce = authGuardOnce;
window.fetchTicketStatus = fetchTicketStatus;
window.applyEditPermissions = applyEditPermissions;

function isFullStatusAccess(){
  return !!window.EDIT_ALLOWED;
}

function applyStatusDrivenUI(){
  const fullAccess = isFullStatusAccess();

  document.querySelectorAll('.tool-btn[data-show-only-status="15"]').forEach((btn) => {
    const hideBtn = !fullAccess;
    const isActive = btn.classList.contains('active');

    btn.style.display = hideBtn ? 'none' : '';
    btn.hidden = hideBtn;
    btn.setAttribute('aria-hidden', hideBtn ? 'true' : 'false');

    if (hideBtn && isActive) {
      window.PanelUI?.closePanel?.();
    }
  });

  const panelBody = document.querySelector('.panel-body');
  if (panelBody) {
    panelBody.querySelectorAll('.layer-card .card-actions button').forEach((btn) => {
      const keepVisible = fullAccess
        || btn.id === 'btnSwitchTekuis'
        || btn.classList.contains('zoombtn');
      btn.style.display = keepVisible ? '' : 'none';
    });
  }

  const rightTools = document.getElementById('rightTools');
  if (rightTools) {
    rightTools.querySelectorAll('.rt-btn').forEach((btn) => {
      const keepVisible = fullAccess || btn.id === 'rtInfo' || btn.hasAttribute('data-open-history');
      btn.style.display = keepVisible ? '' : 'none';
    });
  }
}

window.isFullStatusAccess = isFullStatusAccess;
window.applyStatusDrivenUI = applyStatusDrivenUI;

const statusUiObserver = new MutationObserver(() => applyStatusDrivenUI());
window.addEventListener('DOMContentLoaded', () => {
  const panelBody = document.querySelector('.panel-body');
  const rightTools = document.getElementById('rightTools');
  if (panelBody) statusUiObserver.observe(panelBody, { childList: true, subtree: true });
  if (rightTools) statusUiObserver.observe(rightTools, { childList: true, subtree: true });
  applyStatusDrivenUI();
});