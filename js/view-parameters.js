// Vista: Parámetros — captura y listado de lecturas para el acuario activo.

(function () {
  window.VIEW_PARAMETERS = {
    init: function () {
      var form = document.getElementById('form-parameters');
      form.addEventListener('submit', function (e) {
        e.preventDefault();
        save(form);
      });
    },
    refresh: function () {
      load();
    }
  };

  function save(form) {
    var aquarium = window.STATE.getCurrentAquarium();
    if (!aquarium) {
      window.UTIL.toast('Primero crea un acuario');
      return;
    }
    var data = window.UTIL.readForm(form);
    if (!hasAnyValue(data, ['dkh','ca','mg','no3','po4','salinity','temp_c','ph','notes'])) {
      window.UTIL.toast('Captura al menos un valor');
      return;
    }
    data.aquarium_id = aquarium.id;
    window.API.insertParameter(data).then(function () {
      window.UTIL.toast('Lectura guardada');
      form.reset();
      load();
    })['catch'](function (err) {
      window.UTIL.toast('Error: ' + err.message);
    });
  }

  function load() {
    var list = document.getElementById('list-parameters');
    var aquarium = window.STATE.getCurrentAquarium();
    if (!aquarium) {
      list.textContent = 'Selecciona un acuario.';
      return;
    }
    list.textContent = 'Cargando...';
    window.API.listParameters(aquarium.id, 20).then(function (rows) {
      if (!rows || rows.length === 0) {
        list.textContent = 'Sin lecturas todavía.';
        return;
      }
      list.innerHTML = '';
      rows.forEach(function (r) { list.appendChild(renderRow(r, aquarium)); });
    })['catch'](function (err) {
      list.textContent = 'Error cargando: ' + err.message;
    });
  }

  function renderRow(r, aquarium) {
    var fields = [
      { k: 'dkh',      label: 'dKH', target: aquarium.target_dkh },
      { k: 'ca',       label: 'Ca',  target: aquarium.target_ca },
      { k: 'mg',       label: 'Mg',  target: aquarium.target_mg },
      { k: 'no3',      label: 'NO3', target: aquarium.target_no3 },
      { k: 'po4',      label: 'PO4', target: aquarium.target_po4 },
      { k: 'salinity', label: 'Sal', target: aquarium.target_salinity },
      { k: 'temp_c',   label: 'T°C', target: aquarium.target_temp_c },
      { k: 'ph',       label: 'pH',  target: aquarium.target_ph }
    ];
    var parts = [];
    fields.forEach(function (f) {
      if (r[f.k] === null || r[f.k] === undefined) return;
      var cls = '';
      if (f.target) {
        var diff = Math.abs(r[f.k] - f.target);
        var pct = diff / f.target;
        if (pct > 0.05) cls = ' off-target';
      }
      parts.push('<span class="param' + cls + '">' + f.label + ': ' + r[f.k] + '</span>');
    });
    var date = window.UTIL.formatDate(r.measured_at);
    var div = document.createElement('div');
    div.className = 'item';
    div.innerHTML =
      '<div class="item-date">' + window.UTIL.escapeHtml(date) + '</div>' +
      '<div class="item-values">' + (parts.join(' ') || '<em>(sin valores)</em>') + '</div>' +
      (r.notes ? '<div class="item-notes">' + window.UTIL.escapeHtml(r.notes) + '</div>' : '');
    return div;
  }

  function hasAnyValue(obj, keys) {
    for (var i = 0; i < keys.length; i++) {
      if (obj[keys[i]] !== undefined && obj[keys[i]] !== null && obj[keys[i]] !== '') return true;
    }
    return false;
  }
})();
