function setupTekuisSave({ tekuisSource } = {}){
  const btnSaveTekuis = document.getElementById('btnSaveTekuis');
  if (!btnSaveTekuis) {
    if (!window.__tekuisSaveObserver) {
      const observer = new MutationObserver(() => {
        const found = document.getElementById('btnSaveTekuis');
        if (found) {
          setupTekuisSave({ tekuisSource });
        }
      });
      observer.observe(document.body, { childList: true, subtree: true });
      window.__tekuisSaveObserver = observer;
    }
    return;
  }
  if (btnSaveTekuis.dataset.boundTekuisSave === 'true') {
    syncSaveState();
    return;
  }
  btnSaveTekuis.dataset.boundTekuisSave = 'true';

  function syncSaveState(){
    const fc = window.tryGetTekuisFeatureCollection?.() || null;
    const hash = window.TekuisValidationState?.fcHash?.(fc);
    btnSaveTekuis.disabled = !window.TekuisValidationState?.isSaveAllowed?.(hash);
  }

  async function onSaveTekuisClick(){
    const fc = window.tryGetTekuisFeatureCollection?.() || null;
    const hash = window.TekuisValidationState?.fcHash?.(fc);
    if (!window.TekuisValidationState?.isSaveAllowed?.(hash)) {
      await window.refreshTekuisValidationFinalState?.();
      const recheck = window.TekuisValidationState?.isSaveAllowed?.(hash);
      if (!recheck) {
        Swal.fire('Diqqət', 'Yadda saxlamaq üçün həm LOCAL, həm də TEKUİS validasiya tamamlanmalıdır.', 'warning');
        return;
      }
    }

    if (typeof window.tryValidateAndSaveTekuis === 'function') {
      await window.tryValidateAndSaveTekuis();
      return;
    }

    window.showToast?.('Topologiya modulu yüklənməyib. Səhifəni yeniləyin.');
  }
  btnSaveTekuis.addEventListener('click', onSaveTekuisClick);
  if (tekuisSource && typeof tekuisSource.on === 'function' && !tekuisSource.__tekuisSaveBound) {
    tekuisSource.__tekuisSaveBound = true;
    const markDirty = () => {
      window.TekuisValidationState?.markDirty?.();
      window.TekuisValidationState?.clearIgnored?.();
      const btnValidateTekuis = document.getElementById('btnValidateTekuis');
      if (btnValidateTekuis) {
        const isFinal = window.TekuisValidationState?.isServerFinalReady?.();
        btnValidateTekuis.disabled = !window.EDIT_ALLOWED || !!isFinal;
      }
      syncSaveState();
      window.refreshTekuisValidationFinalState?.();
    };
    tekuisSource.on('addfeature', markDirty);
    tekuisSource.on('removefeature', markDirty);
    tekuisSource.on('changefeature', markDirty);


  }

  syncSaveState();
  window.refreshTekuisValidationFinalState?.();
}

window.setupTekuisSave = setupTekuisSave;