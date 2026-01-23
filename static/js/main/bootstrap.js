/* =========================
   MAIN CONTEXT
   ========================= */
window.MainState = window.MainState || {};

(() => {
  const state = window.MainState;
  const PAGE_TICKET = window.PAGE_TICKET || null;
  const {
    map,
    basemapApi,
    mapOverlays,
    tekuisSource,
    tekuisLayer,
    necasSource,
    necasLayer,
    infoHighlightSource,
    topoErrorSource,
    topoFocusSource,
    topoFocusLayer,
    renderTopoErrorsOnMap,
    zoomAndHighlightTopoGeometry,
    pulseTopoHighlight,
    setInfoHighlight
  } = window.MapContext || {};

  Object.assign(state, {
    PAGE_TICKET,
    map,
    basemapApi,
    mapOverlays,
    tekuisSource,
    tekuisLayer,
    necasSource,
    necasLayer,
    infoHighlightSource,
    topoErrorSource,
    topoFocusSource,
    topoFocusLayer,
    renderTopoErrorsOnMap,
    zoomAndHighlightTopoGeometry,
    pulseTopoHighlight,
    setInfoHighlight,
    styleByGeom: window.styleByGeom,
    styleTicketDefault: window.styleTicketDefault,
    styleAttachDefault: window.styleAttachDefault,
    trackFeatureOwnership: window.FeatureOwnership?.trackFeatureOwnership,
    getFeatureOwner: window.FeatureOwnership?.getOwner,
    authFetchTicketStatus: window.fetchTicketStatus,
    authApplyEditPermissions: window.applyEditPermissions
  });

  if (typeof state.tekuisCount !== 'number') state.tekuisCount = 0;
  if (typeof state.necasCount !== 'number') state.necasCount = 0;

  window.map = map;
  window.basemapApi = basemapApi;
  window.mapOverlays = mapOverlays;

  window.tv = TekuisValidator.init({
    map,
    ticket: PAGE_TICKET || '',
    metaId: (typeof window.META_ID !== 'undefined' ? window.META_ID : null)
  });

  const applyNoDataCardState = (...args) => window.LayersPanel?.applyNoDataCardState?.(...args);
  const setCardDisabled = (...args) => window.LayersPanel?.setCardDisabled?.(...args);
  const updateTicketDeleteState = (...args) => window.LayersPanel?.updateTicketDeleteState?.(...args);
  const renderLayersPanel = (...args) => window.LayersPanel?.renderLayersPanel?.(...args);

  state.applyNoDataCardState = applyNoDataCardState;
  state.setCardDisabled = setCardDisabled;
  state.updateTicketDeleteState = updateTicketDeleteState;
  state.renderLayersPanel = renderLayersPanel;
  window.renderLayersPanel = renderLayersPanel;

  const {
    panelEl,
    panelBodyEl,
    indicatorEl,
    openPanel,
    closePanel,
    moveIndicatorToButton
  } = window.PanelUI || {};

  Object.assign(state, {
    panelEl,
    panelBodyEl,
    indicatorEl,
    openPanel,
    closePanel,
    moveIndicatorToButton
  });
})();