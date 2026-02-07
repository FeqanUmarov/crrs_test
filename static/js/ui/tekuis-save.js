function setupTekuisSave({ tekuisSource } = {}){
  const btnSaveTekuis = document.getElementById('btnSaveTekuis');
  if (!btnSaveTekuis) return;

  function syncSaveState(){
    const fc = window.tryGetTekuisFeatureCollection?.() || null;
    const hash = window.TekuisValidationState?.fcHash?.(fc);
    btnSaveTekuis.disabled = !window.TekuisValidationState?.isSaveAllowed?.(hash);
  }

  async function onSaveTekuisClick(){
      if (typeof window.tryValidateAndSaveTekuis === 'function') {
      await window.tryValidateAndSaveTekuis();
      return;
    }

    window.showToast?.('Topologiya modulu yüklənməyib. Səhifəni yeniləyin.');
  }
  btnSaveTekuis.addEventListener('click', onSaveTekuisClick);
  if (tekuisSource && typeof tekuisSource.on === 'function') {
    const markDirty = () => {
      window.TekuisValidationState?.markDirty?.();
      window.TekuisValidationState?.clearIgnored?.();
      syncSaveState();
    };
    tekuisSource.on('addfeature', markDirty);
    tekuisSource.on('removefeature', markDirty);
    tekuisSource.on('changefeature', markDirty);


  }

  syncSaveState();
}

window.setupTekuisSave = setupTekuisSave;