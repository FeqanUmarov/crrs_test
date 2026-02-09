(function () {
  "use strict";

  const state = {
    loaded: false,
    localFinal: false,
    tekuisFinal: false,
    saved: false,
    validating: false,
    saving: false,
    metaId: null,
  };

  function hydrateInitialState() {
    const initial = window.TEKUIS_VALIDATION_STATE || {};
    state.loaded = true;
    state.localFinal = Boolean(initial.local_final);
    state.tekuisFinal = Boolean(initial.tekuis_final);
    state.metaId = initial.meta_id ?? null;
  }

  function getButtons() {
    return {
      validateCard: document.getElementById("btnValidateTekuis"),
      validateModal: document.getElementById("btnValidateTekuisModal"),
      save: document.getElementById("btnSaveTekuis"),
    };
  }

  function setButtonDisabled(btn, disabled) {
    if (!btn) return;
    btn.disabled = Boolean(disabled);
    btn.setAttribute("aria-disabled", disabled ? "true" : "false");
  }

  function syncButtons() {
    const { validateCard, validateModal, save } = getButtons();
    const canValidate = state.loaded && !state.saved && !state.validating && !state.saving;
    const canSave =
      state.loaded &&
      state.localFinal &&
      state.tekuisFinal &&
      !state.validating &&
      !state.saving &&
      !state.saved;

    setButtonDisabled(validateCard, !canValidate);
    setButtonDisabled(validateModal, !canValidate);
    setButtonDisabled(save, !canSave);
  }

  function setValidationState({ localFinal, tekuisFinal, metaId }) {
    if (localFinal !== undefined) state.localFinal = Boolean(localFinal);
    if (tekuisFinal !== undefined) state.tekuisFinal = Boolean(tekuisFinal);
    if (metaId !== undefined) state.metaId = metaId;
    state.loaded = true;
    syncButtons();
  }

  function getValidationPayload() {
    const topology = window.TekuisTopology;
    if (!topology?.getTekuisFeatureCollection) return null;
    const geojson = topology.getTekuisFeatureCollection();
    if (!geojson || geojson.type !== "FeatureCollection") return null;
    const ignoredGapKeys = topology.getIgnoredGapKeys?.() || [];
    return { geojson, ignoredGapKeys };
  }

  function syncAttributePanel() {
    try {
      if (window.AttributesPanel?.applyUIToSelectedFeature) {
        window.AttributesPanel.applyUIToSelectedFeature();
      }
    } catch (error) {
      console.warn("Attributes panel sync xətası:", error);
    }
    try {
      window.saveTekuisToLS?.();
    } catch (error) {
      console.warn("Local save xətası:", error);
    }
  }

  async function runValidation() {
    if (state.validating) return;
    if (!window.TekuisValidationApi) {
      window.showToast?.("Validate servisi yüklənməyib. Səhifəni yeniləyin.");
      return;
    }

    const payload = getValidationPayload();
    if (!payload) {
      Swal.fire("Diqqət", "Validate üçün TEKUİS məlumatı tapılmadı.", "warning");
      return;
    }

    syncAttributePanel();
    state.validating = true;
    syncButtons();

    try {
      const resp = await window.TekuisValidationApi.validateTekuisParcels({
        geojson: payload.geojson,
        metaId: state.metaId,
        ignoredGapKeys: payload.ignoredGapKeys,
      });

      if (!resp.ok) {
        Swal.fire("Xəta", resp.data?.error || "Validate xətası", "error");
        return;
      }

      const validation = resp.data?.validation || {};
      setValidationState({
        localFinal: resp.data?.local_final,
        tekuisFinal: resp.data?.tekuis_final,
        metaId: resp.data?.meta_id ?? state.metaId,
      });

      if ((validation.overlaps || []).length || (validation.gaps || []).length) {
        window.TekuisTopology?.openModal?.(validation);
      } else {
        window.TekuisTopology?.closeModal?.();
        window.showToast?.("Validate uğurla tamamlandı.");
      }
    } catch (error) {
      console.error("Validate error:", error);
      Swal.fire("Xəta", error?.message || "Validate zamanı xəta baş verdi.", "error");
    } finally {
      state.validating = false;
      syncButtons();
    }
  }

  async function runSave() {
    if (state.saving) return;
    if (!window.TekuisValidationApi) {
      window.showToast?.("Save servisi yüklənməyib. Səhifəni yeniləyin.");
      return;
    }

    const topology = window.TekuisTopology;
    const geojson = topology?.getTekuisFeatureCollection?.();
    const originalGeojson = topology?.resolveOriginalTekuis?.({ fallbackFc: geojson });
    if (!geojson || !originalGeojson) {
      Swal.fire("Xəta", "TEKUİS məlumatları tapılmadı.", "error");
      return;
    }

    syncAttributePanel();
    const ticket = window.PAGE_TICKET || window.APP?.ticket || "";
    if (!ticket) {
      Swal.fire("Diqqət", "Ticket tapılmadı.", "warning");
      return;
    }

    state.saving = true;
    syncButtons();

    try {
      const confirm = await Swal.fire({
        title: "Əminsiniz?",
        html: `<b>${geojson.features?.length ?? 0}</b> TEKUİS parseli bazaya yazılacaq.`,
        icon: "question",
        showCancelButton: true,
        confirmButtonText: "Bəli, yadda saxla",
        cancelButtonText: "İmtina",
      });

      if (!confirm.isConfirmed) return;

      const resp = await window.TekuisValidationApi.saveTekuisParcels({
        geojson,
        originalGeojson,
        ticket,
        metaId: state.metaId,
      });

      if (!resp.ok) {
        const msg = resp.data?.error || resp.data?.message || "Save xətası";
        if (resp.data?.validation_state) {
          setValidationState({
            localFinal: resp.data.validation_state.local_final,
            tekuisFinal: resp.data.validation_state.tekuis_final,
            metaId: resp.data.validation_state.meta_id ?? state.metaId,
          });
        }
        Swal.fire("Xəta", msg, "error");
        return;
      }

      state.saved = true;
      syncButtons();
      window.TekuisTopology?.resetIgnored?.();
      window.tekuisNecasApi?.markTekuisSaved?.(true);
      window.showToast?.("TEKUİS parsellər bazaya yazıldı.");

      try {
        const metaId = resp.data?.meta_id ?? state.metaId ?? null;
        await window.TekuisSwitch?.showSource?.("current", metaId);
      } catch (error) {
        console.warn("TEKUİS cari mənbə yenilənmədi:", error);
      }
    } catch (error) {
      console.error("Save error:", error);
      Swal.fire("Xəta", error?.message || "Save zamanı xəta baş verdi.", "error");
    } finally {
      state.saving = false;
      syncButtons();
    }
  }

  function bindButtons() {
    document.addEventListener("click", (event) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      if (target.closest("#btnValidateTekuis")) {
        runValidation();
        return;
      }
      if (target.closest("#btnValidateTekuisModal")) {
        runValidation();
      }
    });
  }

  function init() {
    hydrateInitialState();
    syncButtons();
    bindButtons();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }

  window.TekuisValidationUI = {
    syncButtons,
    setValidationState,
    runValidation,
    runSave,
  };
})();