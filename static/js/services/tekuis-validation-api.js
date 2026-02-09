(function () {
  "use strict";

  const API = {
    validate: "/api/tekuis/validate/",
    save: "/api/save-tekuis-parcels/",
  };

  async function postJson(url, payload) {
    const resp = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(payload || {}),
    });

    let data = null;
    const text = await resp.text();
    try {
      data = JSON.parse(text);
    } catch {
      data = { raw: text };
    }

    return { ok: resp.ok, status: resp.status, data };
  }

  async function validateTekuisParcels({ geojson, metaId, ignoredGapKeys }) {
    const payload = { geojson };
    if (metaId !== undefined && metaId !== null && metaId !== "") {
      payload.meta_id = metaId;
    }
    if (Array.isArray(ignoredGapKeys) && ignoredGapKeys.length) {
      payload.ignored_gap_keys = ignoredGapKeys;
    }
    return postJson(API.validate, payload);
  }

  async function saveTekuisParcels({ geojson, originalGeojson, ticket, metaId }) {
    const payload = {
      geojson,
      original_geojson: originalGeojson,
      ticket,
    };
    if (metaId !== undefined && metaId !== null && metaId !== "") {
      payload.meta_id = metaId;
    }
    return postJson(API.save, payload);
  }

  window.TekuisValidationApi = {
    validateTekuisParcels,
    saveTekuisParcels,
  };
})();