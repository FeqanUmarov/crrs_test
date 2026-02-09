function setupTekuisSave(){
  const btnSaveTekuis = document.getElementById('btnSaveTekuis');
  if (!btnSaveTekuis) return;

  async function onSaveTekuisClick(){
    if (window.TekuisValidationUI?.runSave) {
      await window.TekuisValidationUI.runSave();
      return;
    }

    window.showToast?.('Topologiya modulu yüklənməyib. Səhifəni yeniləyin.');
  }

  btnSaveTekuis.addEventListener('click', onSaveTekuisClick);
}

window.setupTekuisSave = setupTekuisSave;