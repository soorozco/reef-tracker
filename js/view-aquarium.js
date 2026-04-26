// Vista: Configuración — editar el acuario actual, ver/editar canales,
// ver catálogo de productos.

(function () {
  window.VIEW_AQUARIUM = {
    init: function () {
      // Listeners se enlazan dinámicamente al renderizar
    },
    refresh: function () {
      render();
    }
  };

  function render() {
    var container = document.getElementById('view-aquarium-content');
    var aquarium = window.STATE.getCurrentAquarium();
    if (!aquarium) {
      container.innerHTML = '<p class="muted">No hay acuario seleccionado.</p>';
      return;
    }

    container.innerHTML =
      renderAquariumCard(aquarium) +
      renderChannelsCard() +
      renderProductsCard();

    bindAquariumForm(aquarium);
    loadAndBindChannels(aquarium);
  }

  // ----------------------------------------------------------
  // Card: datos del acuario (volúmenes + targets)
  // ----------------------------------------------------------
  function renderAquariumCard(a) {
    var fields = [
      ['display_volume_l', 'Display (L)',   a.display_volume_l, '1'],
      ['sump_volume_l',    'Sump (L)',      a.sump_volume_l,    '1'],
      ['target_dkh',       'dKH target',    a.target_dkh,       '0.1'],
      ['target_ca',        'Ca target',     a.target_ca,        '1'],
      ['target_mg',        'Mg target',     a.target_mg,        '1'],
      ['target_no3',       'NO3 target',    a.target_no3,       '0.1'],
      ['target_po4',       'PO4 target',    a.target_po4,       '0.01'],
      ['target_salinity',  'Sal target',    a.target_salinity,  '0.001'],
      ['target_temp_c',    'T°C target',    a.target_temp_c,    '0.1'],
      ['target_ph',        'pH target',     a.target_ph,        '0.01']
    ];
    var inputs = fields.map(function (f) {
      var v = (f[2] === null || f[2] === undefined) ? '' : f[2];
      return '<label>' + f[1] +
        '<input type="number" name="' + f[0] + '" value="' + v + '" step="' + f[3] + '" inputmode="decimal">' +
      '</label>';
    }).join('');

    var totalLitros = (Number(a.display_volume_l) || 0) + (Number(a.sump_volume_l) || 0);

    return '<div class="card">' +
      '<h2>' + window.UTIL.escapeHtml(a.name) + '</h2>' +
      '<p class="muted">Volumen total del sistema: <strong>' + totalLitros + ' L</strong></p>' +
      '<form id="form-aquarium" autocomplete="off">' +
        '<label class="full">Nombre<input type="text" name="name" value="' + window.UTIL.escapeHtml(a.name) + '"></label>' +
        '<div class="grid">' + inputs + '</div>' +
        '<button type="submit">Guardar cambios</button>' +
      '</form>' +
    '</div>';
  }

  function bindAquariumForm(aquarium) {
    var form = document.getElementById('form-aquarium');
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var patch = window.UTIL.readForm(form);
      window.API.updateAquarium(aquarium.id, patch).then(function (rows) {
        var updated = rows && rows[0];
        if (updated) {
          for (var i = 0; i < window.STATE.aquariums.length; i++) {
            if (window.STATE.aquariums[i].id === updated.id) {
              window.STATE.aquariums[i] = updated;
            }
          }
        }
        window.UTIL.toast('Acuario actualizado');
        render();
      })['catch'](function (err) {
        window.UTIL.toast('Error: ' + err.message);
      });
    });
  }

  // ----------------------------------------------------------
  // Card: canales de dosificación
  // ----------------------------------------------------------
  function renderChannelsCard() {
    return '<div class="card">' +
      '<h2>Canales de la bomba</h2>' +
      '<p class="muted">Asigna producto y modo a cada canal. El "ml/día" se ajusta en la pestaña Dosificación.</p>' +
      '<div id="channels-container">Cargando...</div>' +
    '</div>';
  }

  function loadAndBindChannels(aquarium) {
    var container = document.getElementById('channels-container');
    window.API.listChannels(aquarium.id).then(function (channels) {
      // Asegurar las 4 filas en orden
      var byNumber = {};
      (channels || []).forEach(function (c) { byNumber[c.channel_number] = c; });

      var html = '';
      for (var n = 1; n <= 4; n++) {
        var c = byNumber[n] || { channel_number: n, product_id: null, mode: 'daily', ml_per_day: 0 };
        html += renderChannelRow(c);
      }
      container.innerHTML = html;
      bindChannelForms(aquarium);
    })['catch'](function (err) {
      container.textContent = 'Error: ' + err.message;
    });
  }

  function renderChannelRow(c) {
    var products = window.STATE.products;
    var options = '<option value="">— sin producto —</option>';
    for (var i = 0; i < products.length; i++) {
      var p = products[i];
      var sel = (c.product_id === p.id) ? ' selected' : '';
      options += '<option value="' + p.id + '"' + sel + '>' +
        window.UTIL.escapeHtml(p.brand + ' — ' + p.name) + '</option>';
    }
    var dailySel    = c.mode === 'daily'     ? ' selected' : '';
    var onDemandSel = c.mode === 'on_demand' ? ' selected' : '';

    return '<form class="channel-form" data-channel="' + c.channel_number + '">' +
      '<div class="channel-header">Canal ' + c.channel_number + '</div>' +
      '<label>Producto<select name="product_id">' + options + '</select></label>' +
      '<div class="grid">' +
        '<label>Modo<select name="mode">' +
          '<option value="daily"' + dailySel + '>Diario</option>' +
          '<option value="on_demand"' + onDemandSel + '>Eventual</option>' +
        '</select></label>' +
        '<label>ml/día<input type="number" step="0.1" name="ml_per_day" value="' + (c.ml_per_day || 0) + '" inputmode="decimal"></label>' +
      '</div>' +
      '<button type="submit">Guardar canal</button>' +
    '</form>';
  }

  function bindChannelForms(aquarium) {
    var forms = document.querySelectorAll('.channel-form');
    Array.prototype.forEach.call(forms, function (form) {
      form.addEventListener('submit', function (e) {
        e.preventDefault();
        var ch = parseInt(form.getAttribute('data-channel'), 10);
        var data = window.UTIL.readForm(form);
        var payload = {
          aquarium_id:    aquarium.id,
          channel_number: ch,
          product_id:     data.product_id || null,
          mode:           data.mode || 'daily',
          ml_per_day:     data.ml_per_day || 0
        };
        window.API.upsertChannel(payload).then(function () {
          window.UTIL.toast('Canal ' + ch + ' guardado');
        })['catch'](function (err) {
          window.UTIL.toast('Error: ' + err.message);
        });
      });
    });
  }

  // ----------------------------------------------------------
  // Card: catálogo de productos (read-only por ahora)
  // ----------------------------------------------------------
  function renderProductsCard() {
    var products = window.STATE.products;
    if (!products || products.length === 0) {
      return '<div class="card"><h2>Catálogo de productos</h2><p class="muted">Sin productos.</p></div>';
    }
    var rows = products.map(function (p) {
      var effects = [];
      if (Number(p.affects_dkh_per_ml_per_100l) > 0) effects.push('+' + p.affects_dkh_per_ml_per_100l + ' dKH');
      if (Number(p.affects_ca_per_ml_per_100l)  > 0) effects.push('+' + p.affects_ca_per_ml_per_100l  + ' Ca');
      if (Number(p.affects_mg_per_ml_per_100l)  > 0) effects.push('+' + p.affects_mg_per_ml_per_100l  + ' Mg');
      var efectoTxt = effects.length ? effects.join(' / ') + ' (1 ml/100 L)' : '—';
      return '<div class="product-row">' +
        '<div><strong>' + window.UTIL.escapeHtml(p.brand) + '</strong> — ' + window.UTIL.escapeHtml(p.name) + '</div>' +
        '<div class="muted small">' + efectoTxt + '</div>' +
      '</div>';
    }).join('');
    return '<div class="card">' +
      '<h2>Catálogo de productos</h2>' +
      '<p class="muted small">Concentraciones cuando se prepara según receta del fabricante.</p>' +
      rows +
    '</div>';
  }
})();
