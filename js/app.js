// Orquestación: navegación, carga inicial, selector de acuario, utilidades.
// Compatible con Safari 9: sin async/await, sin fetch, sin módulos ES6.

(function () {

  // ----------------------------------------------------------
  // Utilidades compartidas
  // ----------------------------------------------------------
  window.UTIL = {
    readForm: function (form) {
      var out = {};
      var inputs = form.querySelectorAll('input, textarea, select');
      Array.prototype.forEach.call(inputs, function (input) {
        var v = input.value;
        if (v === '' || v === null || v === undefined) return;
        if (input.type === 'number') {
          var n = parseFloat(v);
          if (!isNaN(n)) out[input.name] = n;
        } else if (input.tagName === 'SELECT' && /^\d+$/.test(v)) {
          out[input.name] = parseInt(v, 10);
        } else {
          out[input.name] = v;
        }
      });
      return out;
    },
    formatDate: function (iso) {
      try {
        var d = new Date(iso);
        var pad = function (n) { return n < 10 ? '0' + n : '' + n; };
        return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) +
               ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
      } catch (e) { return iso; }
    },
    escapeHtml: function (s) {
      return String(s).replace(/[&<>"']/g, function (c) {
        return { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c];
      });
    },
    toast: function (msg) {
      var t = document.getElementById('toast');
      t.textContent = msg;
      t.className = 'toast show';
      setTimeout(function () { t.className = 'toast'; }, 3000);
    }
  };

  // ----------------------------------------------------------
  // Boot
  // ----------------------------------------------------------
  document.addEventListener('DOMContentLoaded', function () {
    setupTabs();
    setupLogoutButton();
    boot();
  });

  function boot() {
    window.AUTH.init().then(function (session) {
      if (!session || !window.AUTH.isAuthenticated()) {
        showLoginScreen();
        return;
      }
      hideLoginScreen();
      renderUserBadge();
      loadAppData();
    })['catch'](function (err) {
      showLoginScreen();
      console.warn('Auth init error:', err);
    });
  }

  function loadAppData() {
    window.STATE.loadCurrentAquariumId();
    Promise.all([
      window.API.listAquariums(),
      window.API.listProducts()
    ]).then(function (results) {
      window.STATE.setAquariums(results[0] || []);
      window.STATE.setProducts(results[1] || []);

      if (window.STATE.aquariums.length === 0) {
        window.WIZARD.show(function (newAquarium) {
          window.STATE.aquariums.push(newAquarium);
          window.STATE.setCurrentAquariumId(newAquarium.id);
          finishBoot();
        });
        return;
      }

      // Resolver acuario actual
      var current = window.STATE.getCurrentAquarium();
      if (!current) {
        // Si el id guardado en localStorage ya no existe, tomar el primero activo
        var first = window.STATE.aquariums[0];
        window.STATE.setCurrentAquariumId(first.id);
      }
      finishBoot();
    })['catch'](function (err) {
      document.body.insertAdjacentHTML('afterbegin',
        '<div class="boot-error">Error al cargar: ' + window.UTIL.escapeHtml(err.message) +
        '<br><small>Verifica que la migración SQL esté aplicada en Supabase.</small></div>');
    });
  }

  function finishBoot() {
    renderAquariumSelector();
    window.VIEW_PARAMETERS.init();
    window.VIEW_AQUARIUM.init();
    window.VIEW_MAINTENANCE.init();
    window.VIEW_SOLUTIONS.init();
    window.VIEW_DOSING.init();
    refreshActiveView();
  }

  // ----------------------------------------------------------
  // Login screen
  // ----------------------------------------------------------
  function showLoginScreen() {
    document.body.classList.add('logged-out');
    var box = document.getElementById('login-screen');
    box.style.display = 'flex';

    var form = document.getElementById('login-form');
    var emailInput = document.getElementById('login-email');
    var passwordInput = document.getElementById('login-password');
    var statusEl = document.getElementById('login-status');
    var btn = document.getElementById('login-btn');
    var magicLink = document.getElementById('login-magic-link');

    // Pre-llenar con último email usado, si existe
    try {
      var last = localStorage.getItem('reef-tracker.last_email');
      if (last) emailInput.value = last;
    } catch (e) {}

    // Login con email + contraseña
    form.onsubmit = function (e) {
      e.preventDefault();
      var email    = emailInput.value.trim();
      var password = passwordInput.value;
      if (!email || !password) {
        statusEl.className = 'login-status error';
        statusEl.textContent = 'Ingresa correo y contraseña';
        return;
      }
      btn.disabled = true;
      btn.textContent = 'Entrando...';
      statusEl.className = 'login-status';
      statusEl.textContent = '';

      window.AUTH.signInWithPassword(email, password).then(function () {
        try { localStorage.setItem('reef-tracker.last_email', email); } catch (e) {}
        passwordInput.value = '';
        // Recarga para que el flujo normal de boot tome la sesión
        window.location.reload();
      })['catch'](function (err) {
        statusEl.className = 'login-status error';
        var msg = (err.message || '').toLowerCase();
        if (msg.indexOf('invalid login credentials') !== -1 ||
            msg.indexOf('invalid_grant') !== -1) {
          statusEl.textContent = 'Correo o contraseña incorrectos';
        } else if (msg.indexOf('email not confirmed') !== -1) {
          statusEl.textContent = 'Correo sin confirmar. En Supabase Dashboard, marca "Auto Confirm User" o desactiva "Confirm email".';
        } else {
          statusEl.textContent = 'Error: ' + (err.message || 'desconocido');
        }
        btn.disabled = false;
        btn.textContent = 'Entrar';
      });
    };

    // Fallback: enviar magic link si olvidó la contraseña
    if (magicLink) {
      magicLink.onclick = function (e) {
        e.preventDefault();
        var email = emailInput.value.trim();
        if (!email) {
          statusEl.className = 'login-status error';
          statusEl.textContent = 'Escribe tu correo arriba primero';
          return;
        }
        magicLink.style.pointerEvents = 'none';
        magicLink.textContent = 'Enviando...';
        window.AUTH.requestMagicLink(email).then(function () {
          statusEl.className = 'login-status success';
          statusEl.innerHTML = '✓ Te envié un link a <strong>' + window.UTIL.escapeHtml(email) +
            '</strong>. Revisa tu correo y haz click.';
          magicLink.style.pointerEvents = 'auto';
          magicLink.textContent = 'Reenviar link mágico';
        })['catch'](function (err) {
          statusEl.className = 'login-status error';
          statusEl.textContent = 'Error: ' + (err.message || 'desconocido');
          magicLink.style.pointerEvents = 'auto';
          magicLink.textContent = 'Enviar link mágico al correo';
        });
      };
    }
  }

  function hideLoginScreen() {
    document.body.classList.remove('logged-out');
    var box = document.getElementById('login-screen');
    if (box) box.style.display = 'none';
  }

  function renderUserBadge() {
    var badge = document.getElementById('user-badge');
    if (!badge) return;
    var email = window.AUTH.getUserEmail() || '';
    badge.innerHTML = '<span class="user-email" title="' + window.UTIL.escapeHtml(email) + '">' +
      window.UTIL.escapeHtml(email) + '</span>' +
      '<button id="logout-btn" type="button" title="Cerrar sesión">Salir</button>';
    badge.style.display = 'flex';

    var logoutBtn = document.getElementById('logout-btn');
    if (logoutBtn) {
      logoutBtn.addEventListener('click', function () {
        if (!confirm('¿Cerrar sesión?')) return;
        window.AUTH.signOut().then(function () {
          window.location.reload();
        });
      });
    }
  }

  function setupLogoutButton() {
    // Logout se enlaza dinámicamente en renderUserBadge() porque el botón
    // se crea ahí. Esta función queda como placeholder para futuras
    // extensiones del header.
  }

  // ----------------------------------------------------------
  // Selector de acuario
  // ----------------------------------------------------------
  function renderAquariumSelector() {
    var box = document.getElementById('aquarium-selector');
    var aquariums = window.STATE.aquariums;
    if (aquariums.length <= 1) {
      var name = aquariums[0] ? aquariums[0].name : '—';
      box.innerHTML = '<span class="aq-name">' + window.UTIL.escapeHtml(name) + '</span>';
      return;
    }
    var opts = aquariums.map(function (a) {
      var sel = a.id === window.STATE.currentAquariumId ? ' selected' : '';
      return '<option value="' + a.id + '"' + sel + '>' + window.UTIL.escapeHtml(a.name) + '</option>';
    }).join('');
    box.innerHTML = '<select id="aq-select">' + opts + '</select>';
    document.getElementById('aq-select').addEventListener('change', function (e) {
      window.STATE.setCurrentAquariumId(parseInt(e.target.value, 10));
      refreshActiveView();
    });
  }

  // ----------------------------------------------------------
  // Pestañas
  // ----------------------------------------------------------
  function setupTabs() {
    var tabs = document.querySelectorAll('.tab');
    Array.prototype.forEach.call(tabs, function (tab) {
      tab.addEventListener('click', function () {
        var name = tab.getAttribute('data-tab');
        Array.prototype.forEach.call(document.querySelectorAll('.tab'), function (t) {
          t.classList.remove('active');
        });
        tab.classList.add('active');
        Array.prototype.forEach.call(document.querySelectorAll('.view'), function (v) {
          v.classList.remove('active');
        });
        document.getElementById('view-' + name).classList.add('active');
        refreshActiveView();
      });
    });
  }

  function refreshActiveView() {
    var active = document.querySelector('.view.active');
    if (!active) return;
    var name = active.id.replace('view-', '');
    if (name === 'parameters') window.VIEW_PARAMETERS.refresh();
    else if (name === 'aquarium') window.VIEW_AQUARIUM.refresh();
    else if (name === 'maintenance') window.VIEW_MAINTENANCE.refresh();
    else if (name === 'solutions') window.VIEW_SOLUTIONS.refresh();
    else if (name === 'dosing') window.VIEW_DOSING.refresh();
  }
})();
