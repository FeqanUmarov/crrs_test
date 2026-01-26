function setupTekuisSave(){
  const btnSaveTekuis = document.getElementById('btnSaveTekuis');
  if (!btnSaveTekuis) return;

  async function onSaveTekuisClick(){
      if (typeof window.tryValidateAndSaveTekuis === 'function') {
      await window.tryValidateAndSaveTekuis();

      return;
    }

    window.showToast?.('Topologiya modulu yüklənməyib. Səhifəni yeniləyin.');


  }

  btnSaveTekuis.addEventListener('click', onSaveTekuisClick);
}

window.setupTekuisSave = setupTekuisSave;