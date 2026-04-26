// Cliente HTTP para Supabase (PostgREST) usando XHR.
// Compatible con Safari 9 (iOS 9.3.5) — no usa fetch ni async/await.

(function () {
  // Devuelve el token de autorización a usar:
  //   - access_token del usuario si hay sesión activa
  //   - anon key si no hay sesión (usa solo para login screen)
  function getAuthToken() {
    if (window.AUTH && window.AUTH.isAuthenticated()) {
      return window.AUTH.getAccessToken();
    }
    return window.CONFIG.SUPABASE_ANON_KEY;
  }

  function request(method, path, body, extraHeaders) {
    return new Promise(function (resolve, reject) {
      var xhr = new XMLHttpRequest();
      var url = window.CONFIG.SUPABASE_URL + '/rest/v1' + path;
      xhr.open(method, url, true);
      xhr.setRequestHeader('apikey', window.CONFIG.SUPABASE_ANON_KEY);
      xhr.setRequestHeader('Authorization', 'Bearer ' + getAuthToken());
      xhr.setRequestHeader('Content-Type', 'application/json');
      xhr.setRequestHeader('Prefer', 'return=representation');
      if (extraHeaders) {
        for (var k in extraHeaders) {
          if (extraHeaders.hasOwnProperty(k)) xhr.setRequestHeader(k, extraHeaders[k]);
        }
      }
      xhr.onload = function () {
        if (xhr.status >= 200 && xhr.status < 300) {
          if (!xhr.responseText) { resolve(null); return; }
          try { resolve(JSON.parse(xhr.responseText)); }
          catch (e) { resolve(xhr.responseText); }
        } else if (xhr.status === 401 && window.AUTH && window.AUTH.isAuthenticated()) {
          // Token rechazado — limpiar sesión y forzar relogin
          window.AUTH.signOut();
          window.location.reload();
        } else {
          reject(new Error('HTTP ' + xhr.status + ': ' + xhr.responseText));
        }
      };
      xhr.onerror = function () { reject(new Error('Error de red')); };
      xhr.send(body ? JSON.stringify(body) : null);
    });
  }

  window.API = {
    // ---------------- Aquariums ----------------
    listAquariums: function () {
      return request('GET', '/aquariums?order=created_at.asc');
    },
    insertAquarium: function (row) {
      return request('POST', '/aquariums', row);
    },
    updateAquarium: function (id, patch) {
      return request('PATCH', '/aquariums?id=eq.' + id, patch);
    },

    // ---------------- Products ----------------
    listProducts: function () {
      return request('GET', '/products?order=brand.asc,name.asc');
    },
    insertProduct: function (row) {
      return request('POST', '/products', row);
    },
    updateProduct: function (id, patch) {
      return request('PATCH', '/products?id=eq.' + id, patch);
    },
    deleteProduct: function (id) {
      return request('DELETE', '/products?id=eq.' + id);
    },

    // ---------------- Livestock ----------------
    listLivestock: function (aquariumId, statusFilter) {
      var q = '/livestock?aquarium_id=eq.' + aquariumId + '&order=added_at.desc';
      if (statusFilter) q += '&status=eq.' + encodeURIComponent(statusFilter);
      return request('GET', q);
    },
    insertLivestock: function (row) {
      return request('POST', '/livestock', row);
    },
    updateLivestock: function (id, patch) {
      return request('PATCH', '/livestock?id=eq.' + id, patch);
    },
    deleteLivestock: function (id) {
      return request('DELETE', '/livestock?id=eq.' + id);
    },

    // ---------------- Dosing channels ----------------
    listChannels: function (aquariumId) {
      return request('GET', '/dosing_channels?aquarium_id=eq.' + aquariumId + '&order=channel_number.asc');
    },
    upsertChannel: function (row) {
      return request('POST', '/dosing_channels', row, {
        'Prefer': 'resolution=merge-duplicates,return=representation'
      });
    },
    updateChannel: function (aquariumId, channelNumber, patch) {
      return request('PATCH',
        '/dosing_channels?aquarium_id=eq.' + aquariumId + '&channel_number=eq.' + channelNumber,
        patch);
    },

    // ---------------- Parameters ----------------
    listParameters: function (aquariumId, limit) {
      var l = limit || 20;
      return request('GET', '/parameters?aquarium_id=eq.' + aquariumId + '&order=measured_at.desc&limit=' + l);
    },
    insertParameter: function (row) {
      return request('POST', '/parameters', row);
    },

    // ---------------- Solutions ----------------
    listSolutions: function (aquariumId, limit) {
      var l = limit || 20;
      return request('GET', '/solutions?aquarium_id=eq.' + aquariumId + '&order=prepared_at.desc&limit=' + l);
    },
    // Último lote por canal: trae los lotes con channel_number no nulo,
    // ordenados desc. El frontend agrupa para quedarse con el más reciente
    // por canal.
    listLatestSolutionsByChannel: function (aquariumId) {
      return request('GET',
        '/solutions?aquarium_id=eq.' + aquariumId +
        '&channel_number=not.is.null' +
        '&select=id,product_id,product_name,powder_grams,rodi_ml,prepared_at,channel_number,notes' +
        '&order=prepared_at.desc');
    },
    insertSolution: function (row) {
      return request('POST', '/solutions', row);
    },
    deleteSolution: function (id) {
      return request('DELETE', '/solutions?id=eq.' + id);
    },

    // ---------------- Maintenance log ----------------
    listMaintenance: function (aquariumId, limit) {
      var l = limit || 20;
      return request('GET', '/maintenance_log?aquarium_id=eq.' + aquariumId + '&order=performed_at.desc&limit=' + l);
    },
    insertMaintenance: function (row) {
      return request('POST', '/maintenance_log', row);
    },
    deleteMaintenance: function (id) {
      return request('DELETE', '/maintenance_log?id=eq.' + id);
    },

    // ---------------- Maintenance tasks (catálogo) ----------------
    listTasks: function (aquariumId) {
      return request('GET', '/maintenance_tasks?aquarium_id=eq.' + aquariumId + '&order=frequency_days.asc');
    },
    insertTask: function (row) {
      return request('POST', '/maintenance_tasks', row);
    },
    insertTasksBulk: function (rows) {
      return request('POST', '/maintenance_tasks', rows);
    },
    updateTask: function (id, patch) {
      return request('PATCH', '/maintenance_tasks?id=eq.' + id, patch);
    },
    deleteTask: function (id) {
      return request('DELETE', '/maintenance_tasks?id=eq.' + id);
    },
    // Última fecha hecha por tarea (para todas las tareas del acuario en una sola request)
    listLastDonePerTask: function (aquariumId) {
      // Trae los logs con task_id no nulo, ordenados desc.
      // El frontend agrupa por task_id y se queda con el más reciente.
      return request('GET',
        '/maintenance_log?aquarium_id=eq.' + aquariumId +
        '&task_id=not.is.null&select=task_id,performed_at&order=performed_at.desc');
    }
  };
})();
