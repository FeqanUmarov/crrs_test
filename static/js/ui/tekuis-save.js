function setupTekuisSave(){
  const btnSaveTekuis = document.getElementById('btnSaveTekuis');
  const btnValidateTekuis = document.getElementById('btnValidateTekuis');

  if (btnSaveTekuis && !btnSaveTekuis.dataset.boundTekuisSave) {
    btnSaveTekuis.dataset.boundTekuisSave = '1';
    btnSaveTekuis.addEventListener('click', async () => {
      if (typeof window.tryValidateAndSaveTekuis === 'function') {
        await window.tryValidateAndSaveTekuis();
        return;
      }
      window.showToast?.('TEKUİS Parsellər layı modulu yüklənməyib.');
    });


  }

  if (btnValidateTekuis && !btnValidateTekuis.dataset.boundTekuisValidate) {
    btnValidateTekuis.dataset.boundTekuisValidate = '1';
    btnValidateTekuis.addEventListener('click', async () => {
      if (typeof window.runTekuisValidationFlow === 'function') {
        await window.runTekuisValidationFlow();
        return;
      }
      window.showToast?.('TEKUİS Parsellər layı validasiya modulu yüklənməyib.');
    });
  }
}

window.setupTekuisSave = setupTekuisSave;