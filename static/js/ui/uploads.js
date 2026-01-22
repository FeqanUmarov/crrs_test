function setupUploadHandlers({ ticket, uploadLayerApi, updateAllSaveButtons } = {}){
  const lastUploadState = (window.lastUploadState ??= {
    type: null,
    file: null,
    crs: null
  });

  async function uploadArchiveToBackend(file){
    if (!window.EDIT_ALLOWED) {
      Swal.fire('Diqqət', 'Bu əməliyyatları yalnız redaktə və ya qaralama rejimində edə bilərsiz!', 'warning');
      return;
    }

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
      Swal.fire('Xəta', (err && err.message) || 'Yükləmə və ya çevirmə alınmadı.', 'error');
    }
  }

  async function uploadPointsToBackend(file, crs){
    if (!window.EDIT_ALLOWED) {
      Swal.fire('Diqqət', 'Bu əməliyyatları yalnız redaktə və ya qaralama rejimində edə bilərsiz!', 'warning');
      return;
    }
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