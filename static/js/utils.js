// === CSRF helper (Django default: csrftoken cookie) ===
function getCSRFToken(){
  const m = document.cookie.match(/(?:^|;)\s*csrftoken=([^;]+)/);
  return m ? decodeURIComponent(m[1]) : '';
}

// toast helper
function showToast(msg, ms=2600){
  try{
    const el = document.createElement('div');
    el.textContent = msg;
    el.style.cssText = `
      position: fixed; left: 50%; top: 20px; transform: translateX(-50%);
      background: #111827; color:#fff; padding:10px 14px; border-radius:10px;
      box-shadow:0 10px 30px rgba(0,0,0,.18); z-index:100000;
      font: 14px/1.35 system-ui,-apple-system,Segoe UI,Roboto;
    `;
    document.body.appendChild(el);
    setTimeout(()=>{ el.style.transition='opacity .4s'; el.style.opacity='0'; }, ms);
    el.addEventListener('transitionend', ()=> el.remove());
  }catch(e){ alert(msg); }
}

window.getCSRFToken = getCSRFToken;
window.showToast = showToast;

function buildAppConfirmModal({
  title = 'Əminsiniz?',
  html = '',
  icon = 'question',
  confirmButtonText = 'Təsdiq et',
  cancelButtonText = 'İmtina',
  confirmButtonVariant = 'primary'
} = {}) {
  return {
    title,
    html,
    icon,
    showCancelButton: true,
    confirmButtonText,
    cancelButtonText,
    reverseButtons: true,
    focusCancel: true,
    allowOutsideClick: false,
    allowEscapeKey: true,
    buttonsStyling: false,
    customClass: {
      popup: 'app-swal-modal',
      title: 'app-swal-title',
      htmlContainer: 'app-swal-content',
      icon: 'app-swal-icon',
      actions: 'app-swal-actions',
      confirmButton: `app-swal-btn app-swal-btn--${confirmButtonVariant}`,
      cancelButton: 'app-swal-btn app-swal-btn--ghost'
    },
    showClass: {
      popup: 'app-swal-show'
    },
    hideClass: {
      popup: 'app-swal-hide'
    }
  };
}

window.buildAppConfirmModal = buildAppConfirmModal;