// Autenticación con magic link (passwordless email) via la API REST de
// Supabase Auth. Compatible con Safari 9 — usa XHR + localStorage.
//
// Flujo:
//   1. Usuario ingresa su email → POST /auth/v1/otp envía magic link.
//   2. Click en el link → vuelve a la app con tokens en el hash de la URL.
//   3. consumeUrlTokens() los lee y guarda en localStorage.
//   4. Refresh automático cuando access_token está cerca de expirar.

(function () {
  var TOKEN_KEY = 'reef-tracker.auth';

  function loadSession() {
    try {
      var raw = localStorage.getItem(TOKEN_KEY);
      if (!raw) return null;
      var s = JSON.parse(raw);
      if (!s || !s.access_token) return null;
      return s;
    } catch (e) { return null; }
  }

  function saveSession(s) {
    try { localStorage.setItem(TOKEN_KEY, JSON.stringify(s)); } catch (e) {}
  }

  function clearSession() {
    try { localStorage.removeItem(TOKEN_KEY); } catch (e) {}
  }

  function authRequest(method, path, body, useToken) {
    return new Promise(function (resolve, reject) {
      var xhr = new XMLHttpRequest();
      var url = window.CONFIG.SUPABASE_URL + '/auth/v1' + path;
      xhr.open(method, url, true);
      xhr.setRequestHeader('apikey', window.CONFIG.SUPABASE_ANON_KEY);
      xhr.setRequestHeader('Content-Type', 'application/json');
      if (useToken) {
        var session = loadSession();
        if (session && session.access_token) {
          xhr.setRequestHeader('Authorization', 'Bearer ' + session.access_token);
        }
      }
      xhr.onload = function () {
        if (xhr.status >= 200 && xhr.status < 300) {
          if (!xhr.responseText) { resolve(null); return; }
          try { resolve(JSON.parse(xhr.responseText)); }
          catch (e) { resolve(xhr.responseText); }
        } else {
          var msg;
          try {
            var parsed = JSON.parse(xhr.responseText);
            msg = parsed.msg || parsed.error_description || parsed.error || xhr.responseText;
          } catch (e) { msg = xhr.responseText || 'HTTP ' + xhr.status; }
          reject(new Error(msg));
        }
      };
      xhr.onerror = function () { reject(new Error('Error de red')); };
      xhr.send(body ? JSON.stringify(body) : null);
    });
  }

  // Si la URL viene del callback del magic link, captura tokens y limpia la URL
  function consumeUrlTokens() {
    var hash = window.location.hash || '';
    if (hash.indexOf('access_token=') === -1) return null;

    var params = {};
    hash.replace(/^#/, '').split('&').forEach(function (pair) {
      var idx = pair.indexOf('=');
      if (idx > 0) params[pair.substring(0, idx)] = decodeURIComponent(pair.substring(idx + 1));
    });

    if (!params.access_token) return null;

    // expires_in viene en segundos relativos
    var expiresAt = params.expires_at
      ? parseInt(params.expires_at, 10)
      : Math.floor(Date.now() / 1000) + (parseInt(params.expires_in, 10) || 3600);

    var session = {
      access_token:  params.access_token,
      refresh_token: params.refresh_token || null,
      expires_at:    expiresAt,
      token_type:    params.token_type || 'bearer',
      user:          null
    };
    saveSession(session);

    // Limpiar la URL para que no se vea el hash con tokens
    try {
      history.replaceState(null, '', window.location.pathname + window.location.search);
    } catch (e) {
      window.location.hash = '';
    }

    return session;
  }

  function isExpired(session) {
    if (!session || !session.expires_at) return false;
    // 60 s de margen
    return (Date.now() / 1000) >= (session.expires_at - 60);
  }

  function refreshSession(session) {
    if (!session || !session.refresh_token) {
      return Promise.reject(new Error('Sin refresh token'));
    }
    return authRequest('POST', '/token?grant_type=refresh_token', {
      refresh_token: session.refresh_token
    }, false).then(function (resp) {
      if (!resp || !resp.access_token) throw new Error('Refresh falló');
      var newSession = {
        access_token:  resp.access_token,
        refresh_token: resp.refresh_token || session.refresh_token,
        expires_at:    Math.floor(Date.now() / 1000) + (resp.expires_in || 3600),
        token_type:    resp.token_type || 'bearer',
        user:          resp.user || session.user
      };
      saveSession(newSession);
      return newSession;
    });
  }

  // Carga el perfil del usuario para tener el email
  function fetchUser(session) {
    return authRequest('GET', '/user', null, true).then(function (user) {
      session.user = user;
      saveSession(session);
      return session;
    });
  }

  window.AUTH = {
    // Llamar al inicio de la app. Devuelve Promise resolved con la sesión
    // (o null si no hay).
    init: function () {
      consumeUrlTokens();
      var s = loadSession();
      if (!s) return Promise.resolve(null);

      if (isExpired(s)) {
        return refreshSession(s).then(function (newS) {
          if (!newS.user) return fetchUser(newS);
          return newS;
        })['catch'](function () { clearSession(); return null; });
      }

      if (!s.user) {
        return fetchUser(s)['catch'](function () { return s; });
      }
      return Promise.resolve(s);
    },

    isAuthenticated: function () {
      var s = loadSession();
      return !!(s && s.access_token && !isExpired(s));
    },

    getAccessToken: function () {
      var s = loadSession();
      if (!s) return null;
      return s.access_token;
    },

    getUserEmail: function () {
      var s = loadSession();
      return (s && s.user) ? s.user.email : null;
    },

    requestLogin: function (email) {
      // shouldCreateUser=false significa que el usuario debe existir antes
      // (creado manualmente desde el dashboard). Esto es deliberado para
      // evitar que cualquiera se registre solo.
      return authRequest('POST', '/otp', {
        email: email,
        create_user: false,
        options: {
          email_redirect_to: window.location.origin + window.location.pathname
        }
      }, false);
    },

    signOut: function () {
      var s = loadSession();
      clearSession();
      if (s && s.access_token) {
        return authRequest('POST', '/logout', null, true)['catch'](function () {});
      }
      return Promise.resolve();
    },

    // Para que api.js maneje refresh proactivo
    maybeRefresh: function () {
      var s = loadSession();
      if (s && isExpired(s)) {
        return refreshSession(s)['catch'](function () { clearSession(); return null; });
      }
      return Promise.resolve(s);
    }
  };
})();
