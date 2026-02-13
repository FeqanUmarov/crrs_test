function setupUploadHandlers({ ticket, uploadLayerApi, updateAllSaveButtons } = {}){
  const lastUploadState = (window.lastUploadState ??= {
    type: null,
    file: null,
    crs: null
  });


  const MAX_UPLOAD_SIZE_BYTES = 2 * 1024 * 1024;

  function clearUploadState(){
    lastUploadState.type = null;
    lastUploadState.file = null;
    lastUploadState.crs = null;
    uploadLayerApi?.clearUploadedLayer?.();
  }

  function validateFileSize(file){
    if (!file) return false;
    if (file.size > MAX_UPLOAD_SIZE_BYTES) {
      Swal.fire('Xəta', 'Faylın həcmi maksimum 2 MB ola bilər.', 'error');
      return false;
    }
    return true;
  }

  function ensureEditAllowed(title = 'Diqqət') {
    if (typeof window.ensureEditAllowed === 'function') {
      return window.ensureEditAllowed(title);
    }
    if (!window.EDIT_ALLOWED) {
      Swal.fire(title, 'Bu əməliyyatları yalnız redaktə və ya qaralama rejimində edə bilərsiz!', 'warning');
      return false;
    }
    return true;
  }

  async function uploadArchiveToBackend(file){
    if (!ensureEditAllowed()) return;
    if (!validateFileSize(file)) return;

    clearUploadState();
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('ticket', ticket || '');

      const resp = await fetch('/api/upload-shp/', { method: 'POST', body: fd });
      if (!resp.ok) {
        throw new Error((await resp.text()) || `HTTP ${resp.status}`);
      }
      const geojson = await resp.json();
      uploadLayerApi?.addGeoJSONToMap(geojson);
      lastUploadState.type = 'zip';
      lastUploadState.file = file;
      lastUploadState.crs  = null;
      Swal.fire('OK', 'Shapefile xəritəyə əlavə olundu.', 'success');
      updateAllSaveButtons?.();
    } catch (err) {
      console.error(err);
      clearUploadState();
      Swal.fire('Xəta', (err && err.message) || 'Yükləmə və ya çevirmə alınmadı.', 'error');
    }
  }

  async function uploadPointsToBackend(file, crs){
    if (!ensureEditAllowed()) return;
    if (!validateFileSize(file)) return;

    clearUploadState();
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('crs', crs);
      fd.append('ticket', ticket || '');

      const resp = await fetch('/api/upload-points/', { method: 'POST', body: fd });
      if (!resp.ok) {
        throw new Error((await resp.text()) || `HTTP ${resp.status}`);
      }
      const geojson = await resp.json();
      uploadLayerApi?.addGeoJSONToMap(geojson);
      lastUploadState.type = 'csvtxt';
      lastUploadState.file = file;
      lastUploadState.crs  = crs;
      Swal.fire('OK', 'Koordinatlar xəritəyə əlavə olundu.', 'success');
      updateAllSaveButtons?.();
    } catch (err) {
      console.error(err);
      clearUploadState();
      Swal.fire('Xəta', (err && err.message) || 'Yükləmə və ya çevirmə alınmadı.', 'error');
    }
  }

  return {
    lastUploadState,
    uploadArchiveToBackend,
    uploadPointsToBackend
  };
}

window.setupUploadHandlers = setupUploadHandlers;