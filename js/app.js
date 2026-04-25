// Orquestación de UI. Compatible con Safari 9: sin async/await, sin fetch,
// promesas con .then(), sin módulos ES6 (todo cargado por <script>).

(function () {
  document.addEventListener('DOMContentLoaded', function () {
    setupTabs();
    setupParametersForm();
    loadParameters();
  });

  // ----------------------------------------------------------
  // Navegación por pestañas
  // ----------------------------------------------------------
  function setupTabs() {
    var tabs = document.querySelectorAll('.tab');
    forEach(tabs, function (tab) {
      tab.addEventListener('click', function () {
        var name = tab.getAttribute('data-tab');
        forEach(document.querySelectorAll('.tab'), function (t) {
          t.classList.remove('active');
        });
        tab.classList.add('active');
        forEach(document.querySelectorAll('.view'), function (v) {
          v.classList.remove('active');
        });
        document.getElementById('view-' + name).classList.add('active');
      });
    });
  }

  // ----------------------------------------------------------
  // Vista: Parámetros
  // ----------------------------------------------------------
  function setupParametersForm() {
    var form = document.getElementById('form-parameters');
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var data = readForm(form);
      if (!hasAnyValue(data, ['dkh','ca','mg','no3','po4','salinity','temp_c','ph','notes'])) {
        toast('Captura al menos un valor');
        return;
      }
      window.API.insertParameter(data).then(function () {
        toast('Lectura guardada');
        form.reset();
        loadParameters();
      })['catch'](function (err) {
        toast('Error: ' + err.message);
      });
    });
  }

  function loadParameters() {
    var list = document.getElementById('list-parameters');
    list.textContent = 'Cargando...';
    window.API.listParameters(20).then(function (rows) {
      if (!rows || rows.length === 0) {
        list.textContent = 'Sin lecturas todavía.';
        return;
      }
      list.innerHTML = '';
      rows.forEach(function (r) {
        list.appendChild(renderParameterRow(r));
      });
    })['catch'](function (err) {
      list.textContent = 'Error cargando: ' + err.message;
    });
  }

  function renderParameterRow(r) {
    var fields = [
      { k: 'dkh',      label: 'dKH' },
      { k: 'ca',       label: 'Ca' },
      { k: 'mg',       label: 'Mg' },
      { k: 'no3',      label: 'NO3' },
      { k: 'po4',      label: 'PO4' },
      { k: 'salinity', label: 'Sal' },
      { k: 'temp_c',   label: 'T°C' },
      { k: 'ph',       label: 'pH' }
    ];
    var parts = [];
    fields.forEach(function (f) {
      if (r[f.k] !== null && r[f.k] !== undefined) {
        parts.push(f.label + ': ' + r[f.k]);
      }
    });
    var date = formatDate(r.measured_at);
    var div = document.createElement('div');
    div.className = 'item';
    div.innerHTML =
      '<div class="item-date">' + escapeHtml(date) + '</div>' +
      '<div class="item-values">' + (parts.join(' · ') || '<em>(sin valores)</em>') + '</div>' +
      (r.notes ? '<div class="item-notes">' + escapeHtml(r.notes) + '</div>' : '');
    return div;
  }

  // ----------------------------------------------------------
  // Utilidades
  // ----------------------------------------------------------
  function readForm(form) {
    var out = {};
    var inputs = form.querySelectorAll('input, textarea');
    forEach(inputs, function (input) {
      var v = input.value;
      if (v === '' || v === null || v === undefined) return;
      if (input.type === 'number') {
        var n = parseFloat(v);
        if (!isNaN(n)) out[input.name] = n;
      } else {
        out[input.name] = v;
      }
    });
    return out;
  }

  function hasAnyValue(obj, keys) {
    for (var i = 0; i < keys.length; i++) {
      if (obj[keys[i]] !== undefined && obj[keys[i]] !== null && obj[keys[i]] !== '') return true;
    }
    return false;
  }

  function formatDate(iso) {
    try {
      var d = new Date(iso);
      var pad = function (n) { return n < 10 ? '0' + n : '' + n; };
      return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) +
             ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
    } catch (e) { return iso; }
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c];
    });
  }

  function forEach(nodeList, fn) {
    Array.prototype.forEach.call(nodeList, fn);
  }

  function toast(msg) {
    var t = document.getElementById('toast');
    t.textContent = msg;
    t.className = 'toast show';
    setTimeout(function () { t.className = 'toast'; }, 3000);
  }
})();
