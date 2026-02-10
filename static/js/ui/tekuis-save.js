function setupTekuisSave(){
  const btnSaveTekuis = document.getElementById('btnSaveTekuis');
  if (!btnSaveTekuis) return;
  if (btnSaveTekuis.dataset.bound) return;

  async function onSaveTekuisClick(){
    if (typeof window.TekuisValidationWorkflow?.handleSaveClick === 'function') {
      await window.TekuisValidationWorkflow.handleSaveClick();
      return;
    }

    window.showToast?.('Validasiya modulu yüklənməyib. Səhifəni yeniləyin.');
  }

  btnSaveTekuis.dataset.bound = "true";
  btnSaveTekuis.addEventListener('click', onSaveTekuisClick);
}

window.setupTekuisSave = setupTekuisSave;