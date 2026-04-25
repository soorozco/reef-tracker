// Cliente HTTP para Supabase (PostgREST) usando XHR.
// Compatible con Safari 9 (iOS 9.3.5) — no usa fetch ni async/await.

(function () {
  function request(method, path, body, extraHeaders) {
    return new Promise(function (resolve, reject) {
      var xhr = new XMLHttpRequest();
      var url = window.CONFIG.SUPABASE_URL + '/rest/v1' + path;
      xhr.open(method, url, true);
      xhr.setRequestHeader('apikey', window.CONFIG.SUPABASE_ANON_KEY);
      xhr.setRequestHeader('Authorization', 'Bearer ' + window.CONFIG.SUPABASE_ANON_KEY);
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
        } else {
          reject(new Error('HTTP ' + xhr.status + ': ' + xhr.responseText));
        }
      };
      xhr.onerror = function () { reject(new Error('Error de red')); };
      xhr.send(body ? JSON.stringify(body) : null);
    });
  }

  window.API = {
    // Parámetros
    listParameters: function (limit) {
      var l = limit || 20;
      return request('GET', '/parameters?order=measured_at.desc&limit=' + l);
    },
    insertParameter: function (row) {
      return request('POST', '/parameters', row);
    },

    // Canales de dosificación
    listChannels: function () {
      return request('GET', '/dosing_channels?order=id.asc');
    },
    updateChannel: function (id, patch) {
      return request('PATCH', '/dosing_channels?id=eq.' + id, patch);
    },

    // Soluciones
    listSolutions: function (limit) {
      var l = limit || 20;
      return request('GET', '/solutions?order=prepared_at.desc&limit=' + l);
    },
    insertSolution: function (row) {
      return request('POST', '/solutions', row);
    },

    // Mantenimiento
    listMaintenance: function (limit) {
      var l = limit || 20;
      return request('GET', '/maintenance_log?order=performed_at.desc&limit=' + l);
    },
    insertMaintenance: function (row) {
      return request('POST', '/maintenance_log', row);
    }
  };
})();
