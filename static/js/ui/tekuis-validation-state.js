(() => {
  "use strict";

  const state = {
    status: "idle", // idle | running | success | error
    lastValidation: null,
    localOk: false,
    tekuisOk: false,
    lastHash: null,
    lastMetaId: null,
    ignoredGaps: new Set()
  };

  function _djb2(str){ let h=5381,i=str.length; while(i) h=(h*33) ^ str.charCodeAt(--i); return (h>>>0).toString(36); }
  function roundDeep(x, d=6){
    if (Array.isArray(x)) return x.map(v => roundDeep(v, d));
    if (typeof x === 'number') return +x.toFixed(d);
    if (x && typeof x === 'object'){
      const out = {};
      Object.keys(x).sort().forEach(k => { out[k] = roundDeep(x[k], d); });
      return out;
    }
    return x;
  }

  function topoKey(obj){
    try {
      const g = obj?.geom ?? obj;
      const norm = JSON.stringify(roundDeep(g, 6));
      return 'k' + _djb2(norm);
    } catch {
      return 'k' + Math.random().toString(36).slice(2);
    }
  }

  function fcHash(fc){
    try { return 'h' + _djb2(JSON.stringify(roundDeep(fc, 6))); }
    catch { return 'h' + Math.random().toString(36).slice(2); }
  }

  function computeEffective(validation){
    const ovs = validation?.overlaps || [];
    const gps = validation?.gaps || [];
    let ignoredG = 0;
    for (const it of gps) if (state.ignoredGaps.has(topoKey(it))) ignoredG++;
    return {
      overlapsTotal: ovs.length,
      gapsTotal: gps.length,
      overlapsIgnored: 0,
      gapsIgnored: ignoredG,
      overlapsLeft: ovs.length,
      gapsLeft: gps.length - ignoredG
    };
  }

  function setRunning(){
    state.status = "running";
    state.localOk = false;
    state.tekuisOk = false;
  }

  function setResult({ validation, localOk, tekuisOk, hash, metaId } = {}){
    state.status = (localOk && tekuisOk) ? "success" : "error";
    state.lastValidation = validation || null;
    state.localOk = !!localOk;
    state.tekuisOk = !!tekuisOk;
    state.lastHash = hash || null;
    state.lastMetaId = Number.isFinite(+metaId) ? +metaId : null;
  }

  function markDirty(){
    state.status = "idle";
    state.localOk = false;
    state.tekuisOk = false;
    state.lastHash = null;
    state.lastValidation = null;
  }

  function reset(){
    state.status = "idle";
    state.lastValidation = null;
    state.localOk = false;
    state.tekuisOk = false;
    state.lastHash = null;
    state.lastMetaId = null;
    state.ignoredGaps = new Set();
  }

  function isSaveAllowed(currentHash){
    if (state.status !== "success" || !state.localOk || !state.tekuisOk) return false;
    if (currentHash && state.lastHash && currentHash !== state.lastHash) return false;
    return true;
  }

  function toggleGapIgnored(key){
    if (!key) return false;
    if (state.ignoredGaps.has(key)) {
      state.ignoredGaps.delete(key);
      return false;
    }
    state.ignoredGaps.add(key);
    return true;
  }

  function setGapIgnored(key, val){
    if (!key) return;
    if (val) state.ignoredGaps.add(key);
    else state.ignoredGaps.delete(key);
  }

  function isGapIgnored(key){
    return key ? state.ignoredGaps.has(key) : false;
  }

  function clearIgnored(){
    state.ignoredGaps = new Set();
  }

  function getIgnoredGapKeys(){
    return Array.from(state.ignoredGaps || []);
  }

  function getState(){
    return { ...state, ignoredGaps: new Set(state.ignoredGaps) };
  }

  window.TekuisValidationState = {
    topoKey,
    fcHash,
    computeEffective,
    setRunning,
    setResult,
    markDirty,
    reset,
    isSaveAllowed,
    toggleGapIgnored,
    setGapIgnored,
    isGapIgnored,
    clearIgnored,
    getIgnoredGapKeys,
    getState
  };
})();