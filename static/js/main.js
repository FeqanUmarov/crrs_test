/* =========================
   Main bootstrapper
   ========================= */
  (() => {
    const state = window.MainState || {};

    const editingApi = window.MainEditing?.init?.(state) || {};
    state.editing = editingApi;

    const uploadLayerApi = window.setupUploadedLayer?.({
    map: state.map,
    registerSnapSource: editingApi.registerSnapSource,
    onResetTekuis: () => {
      state.tekuisSource?.clear?.(true);
      state.tekuisCount = 0;
      const lblT = document.getElementById('lblTekuisCount');
      if (lblT) lblT.textContent = '(0)';
    }
  });
  state.uploadLayerApi = uploadLayerApi;

  const uploadHandlers = window.setupUploadHandlers?.({
    ticket: state.PAGE_TICKET,
    uploadLayerApi,
    updateAllSaveButtons: editingApi.updateAllSaveButtons

  });
  state.uploadHandlers = uploadHandlers;
  state.lastUploadState = uploadHandlers?.lastUploadState || window.lastUploadState;
  const layersApi = window.MainLayers?.init?.(state) || {};
  state.layers = layersApi;
})();