(() => {
  "use strict";

  const API = {
    validate: "/api/tekuis/validate/",
    ignoreGap: "/api/tekuis/validate/ignore-gap/"
  };

  async function validateTopology({ geojson, ticket = "", metaId = null, ignoredGapKeys = [] } = {}){
    const headers = {
      "Content-Type": "application/json",
      Accept: "application/json"
    };
    if (ticket) headers["X-Ticket"] = String(ticket);
    if (Number.isFinite(+metaId)) headers["X-Meta-Id"] = String(+metaId);

    const body = {
      geojson,
      ticket: ticket || "",
      ...(Number.isFinite(+metaId) ? { meta_id: +metaId } : {}),
      ignored: { gap_keys: ignoredGapKeys }
    };

    const resp = await fetch(API.validate, {
      method: "POST",
      headers,
      body: JSON.stringify(body)
    });

    const text = await resp.text();
    let data = null;
    try { data = JSON.parse(text); } catch { data = { raw: text }; }

    if (!resp.ok) {
      return { ok: false, status: resp.status, error: data?.error || text || "HTTP error" };
    }

    return {
      ok: true,
      status: resp.status,
      validation: data?.validation || {},
      localOk: !!data?.local_ok,
      tekuisOk: !!data?.tekuis_ok,
      tekuis: data?.tekuis || null,
      metaId: data?.meta_id
    };
  }

  window.TekuisValidationService = {
    validateTopology,
    ignoreGap: async function ignoreGap({ hash, geom, ticket = "", metaId = null } = {}){
      if (!hash) {
        return { ok: false, status: 400, error: "hash required" };
      }
      const headers = {
        "Content-Type": "application/json",
        Accept: "application/json"
      };
      if (ticket) headers["X-Ticket"] = String(ticket);
      if (Number.isFinite(+metaId)) headers["X-Meta-Id"] = String(+metaId);

      const body = {
        hash: String(hash),
        ...(geom ? { geom } : {}),
        ticket: ticket || "",
        ...(Number.isFinite(+metaId) ? { meta_id: +metaId } : {})
      };

      const resp = await fetch(API.ignoreGap, {
        method: "POST",
        headers,
        body: JSON.stringify(body)
      });

      const text = await resp.text();
      let data = null;
      try { data = JSON.parse(text); } catch { data = { raw: text }; }
      if (!resp.ok) {
        return { ok: false, status: resp.status, error: data?.error || text || "HTTP error" };
      }
      return { ok: !!data?.ok, status: resp.status, data };
    }
  };
})();