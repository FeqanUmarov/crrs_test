(() => {
  const DEFAULT_ENDPOINTS = {
    validate: "/api/tekuis/validate/",
    save: "/api/save-tekuis-parcels/"
  };

  async function parseJsonResponse(resp) {
    const text = await resp.text();
    if (!text) return { ok: resp.ok, data: null };
    try {
      return { ok: resp.ok, data: JSON.parse(text) };
    } catch (e) {
      return { ok: resp.ok, data: { raw: text } };
    }
  }

  function create({ endpoints = {} } = {}) {
    const api = { ...DEFAULT_ENDPOINTS, ...endpoints };

    return {
      async validate({ geojson, ticket, metaId, ignoredGapKeys } = {}) {
        const headers = {
          "Content-Type": "application/json",
          Accept: "application/json"
        };
        if (ticket) headers["X-Ticket"] = String(ticket);
        if (Number.isFinite(+metaId)) headers["X-Meta-Id"] = String(+metaId);

        const body = {
          geojson,
          ...(ticket ? { ticket } : {}),
          ...(Number.isFinite(+metaId) ? { meta_id: +metaId } : {}),
          ...(Array.isArray(ignoredGapKeys) && ignoredGapKeys.length > 0
            ? { ignored_gap_keys: ignoredGapKeys }
            : {})
        };

        const resp = await fetch(api.validate, {
          method: "POST",
          headers,
          body: JSON.stringify(body)
        });

        const parsed = await parseJsonResponse(resp);
        return { ok: resp.ok, status: resp.status, data: parsed.data };
      },

      async save({ geojson, originalGeojson, ticket, metaId } = {}) {
        const headers = {
          "Content-Type": "application/json",
          Accept: "application/json"
        };
        if (ticket) headers["X-Ticket"] = String(ticket);

        const body = {
          geojson,
          original_geojson: originalGeojson,
          ...(ticket ? { ticket } : {}),
          ...(Number.isFinite(+metaId) ? { meta_id: +metaId } : {})
        };

        const resp = await fetch(api.save, {
          method: "POST",
          headers,
          body: JSON.stringify(body)
        });

        const parsed = await parseJsonResponse(resp);
        return { ok: resp.ok, status: resp.status, data: parsed.data };
      }
    };
  }

  window.TekuisValidationService = { create };
})();