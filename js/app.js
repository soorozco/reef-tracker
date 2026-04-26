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
    boot();
  });

  function boot() {
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
    refreshActiveView();
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
  }
})();
