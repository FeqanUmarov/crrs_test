(() => {
  const DEFAULT_STATE = {
    loaded: false,
    localFinal: false,
    tekuisFinal: false,
    metaId: null,
    validating: false,
    saving: false,
    saved: false,
    needsValidation: false
  };
  const STORAGE_KEY_PREFIX = "tekuis-validation-state";

  function createState(initial = {}) {
    return {
      ...DEFAULT_STATE,
      loaded: Boolean(initial.loaded),
      localFinal: Boolean(initial.localFinal),
      tekuisFinal: Boolean(initial.tekuisFinal),
      metaId: Number.isFinite(+initial.metaId) ? +initial.metaId : null,
      saved: Boolean(initial.saved),
      needsValidation: Boolean(initial.needsValidation)
    };
  }

  function getButtons() {
    return {
      validateCard: document.getElementById("btnValidateTekuis"),
      validateModal: document.getElementById("btnValidateTekuisModal"),
      save: document.getElementById("btnSaveTekuis")
    };
  }

  function setDisabled(el, disabled) {
    if (!el) return;
    el.disabled = disabled;
    if (disabled) {
      el.setAttribute("aria-disabled", "true");
    } else {
      el.removeAttribute("aria-disabled");
    }
  }

  function applyButtonState(state) {
    const { validateCard, validateModal, save } = getButtons();
    if (!state.loaded) {
      setDisabled(validateCard, true);
      setDisabled(validateModal, true);
      setDisabled(save, true);
      return;
    }

    const validateDisabled = state.validating || state.saving || state.saved;
    setDisabled(validateCard, validateDisabled);
    setDisabled(validateModal, validateDisabled);

    const saveEnabled =
      state.localFinal &&
      state.tekuisFinal &&
      !state.needsValidation &&
      !state.validating &&
      !state.saving &&
      !state.saved;
    setDisabled(save, !saveEnabled);
  }
  function getStorageKey(metaId) {
    if (!Number.isFinite(+metaId)) return null;
    return `${STORAGE_KEY_PREFIX}:${metaId}`;
  }

  function readStoredState(metaId) {
    const key = getStorageKey(metaId);
    if (!key) return null;
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object") return null;
      return { saved: Boolean(parsed.saved) };
    } catch (e) {
      return null;
    }
  }

  function writeStoredState(metaId, saved) {
    const key = getStorageKey(metaId);
    if (!key) return;
    try {
      localStorage.setItem(key, JSON.stringify({ saved: Boolean(saved), updatedAt: Date.now() }));
    } catch (e) {
      /* ignore storage errors */
    }
  }

  function shouldRefreshState() {
    try {
      const nav = performance.getEntriesByType?.("navigation")?.[0];
      return nav?.type === "reload";
    } catch (e) {
      return false;
    }
  }

  function resolveSavedState(metaId, payloadSaved) {
    const isReload = shouldRefreshState();
    const stored = readStoredState(metaId);
    if (isReload || !stored) {
      if (Number.isFinite(+metaId)) {
        writeStoredState(metaId, payloadSaved);
      }
      return Boolean(payloadSaved);
    }
    return stored.saved;
  }

  function normalizeValidationState(payload = {}) {
    return {
      localFinal: Boolean(payload.local_final),
      tekuisFinal: Boolean(payload.tekuis_final),
      metaId: Number.isFinite(+payload.meta_id) ? +payload.meta_id : null
    };
  }

  function buildFeatureCollection(source) {
    const features = source?.getFeatures?.() || [];
    const formatter = new ol.format.GeoJSON();
    return formatter.writeFeaturesObject(features, {
      dataProjection: "EPSG:4326",
      featureProjection: "EPSG:3857"
    });
  }

  function syncAttributesPanel() {
    try {
      if (window.AttributesPanel && typeof window.AttributesPanel.applyUIToSelectedFeature === "function") {
        window.AttributesPanel.applyUIToSelectedFeature();
      }
    } catch (e) {
      console.warn("Attributes panel sync xətası:", e);
    }
  }

  function resolveOriginalTekuis(fc) {
    const cached = window.tekuisCache?.getOriginalTekuis?.();
    if (cached && cached.type === "FeatureCollection") return cached;
    if (fc && fc.type === "FeatureCollection") {
      window.tekuisCache?.saveOriginalTekuis?.(fc);
      return fc;
    }
    return null;
  }

  function readInitialState() {
    const payload = window.TEKUIS_VALIDATION_STATE;
    if (!payload || typeof payload !== "object") {
      return {
        loaded: false,
        localFinal: false,
        tekuisFinal: false,
        metaId: Number.isFinite(+window.META_ID) ? +window.META_ID : null,
        saved: resolveSavedState(Number.isFinite(+window.META_ID) ? +window.META_ID : null, false),
        needsValidation: false
      };
    }
    const metaId = Number.isFinite(+payload.meta_id)
      ? +payload.meta_id
      : Number.isFinite(+window.META_ID)
        ? +window.META_ID
        : null;
    const saved = resolveSavedState(metaId, payload.tekuis_saved);
    return {
      loaded: true,
      localFinal: Boolean(payload.local_final),
      tekuisFinal: Boolean(payload.tekuis_final),
      needsValidation: false,
      metaId,
      saved
    };
  }

  const workflow = {
    state: createState(),
    service: null,
    source: null,
    ticket: "",
    binded: false,

    init({ tekuisSource, ticket = "" } = {}) {
      this.service = window.TekuisValidationService?.create?.();
      this.source = tekuisSource || this.source;
      this.ticket = ticket || this.ticket || "";
      this.state = createState(readInitialState());
      applyButtonState(this.state);
      this.bindButtons();
      this.bindSourceEvents();
      return this;
    },

    bindButtons() {
      const { validateCard, validateModal, save } = getButtons();
      if (validateCard && !validateCard.dataset.bound) {
        validateCard.dataset.bound = "true";
        validateCard.addEventListener("click", () => this.handleValidateClick({ trigger: "card" }));
      }
      if (validateModal && !validateModal.dataset.bound) {
        validateModal.dataset.bound = "true";
        validateModal.addEventListener("click", () => this.handleValidateClick({ trigger: "modal" }));
      }
      if (save && !save.dataset.bound) {
        save.dataset.bound = "true";
        save.addEventListener("click", () => this.handleSaveClick());
      }
      applyButtonState(this.state);
    },

    bindSourceEvents() {
      const source = this.source;
      if (!source || source.__tekuisValidationBound) return;
      source.__tekuisValidationBound = true;

      const markDirty = () => {
        if (!this.state.loaded) return;
        this.state.localFinal = false;
        this.state.tekuisFinal = false;
        this.state.saved = false;
        this.state.needsValidation = true;
        window.TekuisTopologyUI?.resetIgnored?.();
        writeStoredState(this.state.metaId, false);
        applyButtonState(this.state);
      };

      source.on?.("addfeature", markDirty);
      source.on?.("removefeature", markDirty);
      source.on?.("changefeature", markDirty);
    },

    async handleValidateClick({ trigger = "card" } = {}) {
      if (!this.service || this.state.validating || this.state.saved) return;
      if (!window.EDIT_ALLOWED) {
        Swal.fire("Diqqət", "Bu əməliyyatlar yalnız redaktə və ya qaralama rejimində mümkündür.", "warning");
        return;
      }
      if (!this.state.needsValidation && this.state.localFinal && this.state.tekuisFinal) {
        Swal.fire("Uğurlu", "Xəta qalmayıb. Artıq yadda saxlaya bilərsiniz.", "success");
        return;
      }

      syncAttributesPanel();

      const source = this.source;
      const features = source?.getFeatures?.() || [];
      if (features.length === 0) {
        Swal.fire("Info", "Yoxlanılacaq TEKUİS parseli yoxdur.", "info");
        return;
      }

      this.state.validating = true;
      applyButtonState(this.state);

      try {
        const fc = buildFeatureCollection(source);
        const ignoredGapKeys = window.TekuisTopologyUI?.getIgnoredGapKeys?.() || [];
        const response = await this.service.validate({
          geojson: fc,
          ticket: this.ticket,
          metaId: this.state.metaId ?? window.META_ID ?? null,
          ignoredGapKeys
        });

        if (!response.ok) {
          Swal.fire("Xəta", response.data?.error || "Validasiya baş tutmadı.", "error");
          return;
        }

        const payload = response.data || {};
        const validation = payload.validation || {};
        window.TekuisTopologyUI?.setLastValidation?.(validation);

        const nextState = normalizeValidationState(payload);
        this.state.loaded = true;
        this.state.localFinal = nextState.localFinal;
        this.state.tekuisFinal = nextState.tekuisFinal;
        this.state.needsValidation = false;
        if (nextState.metaId) this.state.metaId = nextState.metaId;

        applyButtonState(this.state);
        const hasErrors =
          (validation.overlaps || []).length > 0 || (validation.gaps || []).length > 0;
        if (!this.state.localFinal && hasErrors) {
          window.TekuisTopologyUI?.openModal?.(validation);
        } else {
          window.TekuisTopologyUI?.closeModal?.();
        }
        if (trigger === "modal") {
          if (hasErrors) {
            Swal.fire("Diqqət", "Xətalar hələ də qalır. Zəhmət olmasa düzəliş edin.", "warning");
          } else {
            Swal.fire("Uğurlu", "Xəta qalmayıb. Artıq yadda saxlaya bilərsiniz.", "success");
          }
        } else if (!hasErrors) {
          Swal.fire("Uğurlu", "Xəta qalmayıb. Artıq yadda saxlaya bilərsiniz.", "success");
        }
      } catch (e) {
        Swal.fire("Xəta", e.message || "Şəbəkə xətası baş verdi.", "error");
      } finally {
        this.state.validating = false;
        applyButtonState(this.state);
      }
    },

    async handleSaveClick() {
      if (!this.service || this.state.saving || this.state.validating) return;
      if (this.state.needsValidation) {
        Swal.fire("Diqqət", "Yadda saxlamadan əvvəl dəyişikliklər üçün yenidən TEKUİS doğrulaması tələb olunur.", "warning");
        return;
      }
      if (!(this.state.localFinal && this.state.tekuisFinal)) {
        Swal.fire("Diqqət", "Saxlama üçün əvvəlcə LOCAL və TEKUİS doğrulaması tamamlanmalıdır.", "warning");
        return;
      }

      syncAttributesPanel();

      const source = this.source;
      const features = source?.getFeatures?.() || [];
      if (features.length === 0) {
        Swal.fire("Info", "Yadda saxlanacaq TEKUİS parseli yoxdur.", "info");
        return;
      }

      const ask = await Swal.fire({
        title: "Əminsiniz?",
        html: `<b>${features.length}</b> TEKUİS parseli bazaya yazılacaq.`,
        icon: "question",
        showCancelButton: true,
        confirmButtonText: "Bəli, yadda saxla",
        cancelButtonText: "İmtina"
      });

      if (!ask.isConfirmed) return;

      this.state.saving = true;
      applyButtonState(this.state);

      try {
        const fc = buildFeatureCollection(source);
        const originalFc = resolveOriginalTekuis(fc);
        if (!originalFc) {
          Swal.fire("Xəta", "Köhnə TEKUİS məlumatı tapılmadı.", "error");
          return;
        }

        const response = await this.service.save({
          geojson: fc,
          originalGeojson: originalFc,
          ticket: this.ticket,
          metaId: this.state.metaId ?? window.META_ID ?? null
        });

        if (!response.ok) {
          Swal.fire("Xəta", response.data?.error || "TEKUİS parselləri yadda saxlanılmadı.", "error");
          return;
        }

        window.tekuisCache?.clearTekuisCache?.();
        window.tekuisNecasApi?.markTekuisSaved?.(true);
        window.TekuisTopologyUI?.resetIgnored?.();
        window.TekuisTopologyUI?.clearOverlay?.();

        if (response.data?.meta_id != null) {
          window.CURRENT_META_ID = response.data.meta_id;
          this.state.metaId = response.data.meta_id;
        }
        this.state.saved = true;
        this.state.needsValidation = false;
        writeStoredState(this.state.metaId, true);
        applyButtonState(this.state);

        Swal.fire(
          "Uğurlu",
          `${response.data?.saved_count ?? features.length} TEKUİS parseli bazaya yazıldı.`,
          "success"
        );
      } catch (e) {
        Swal.fire("Xəta", e.message || "Şəbəkə xətası baş verdi.", "error");
      } finally {
        this.state.saving = false;
        applyButtonState(this.state);
      }
    }
  };

  window.TekuisValidationWorkflow = workflow;
  window.setupTekuisValidationWorkflow = (opts) => workflow.init(opts);
})();