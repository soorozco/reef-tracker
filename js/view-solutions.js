// Vista: Soluciones — registro de lotes (polvo + RODI) y proyección de
// cuándo se va a acabar la solución activa de cada canal.

(function () {
  window.VIEW_SOLUTIONS = {
    init: function () {},
    refresh: function () { render(); }
  };

  function render() {
    var container = document.getElementById('view-solutions-content');
    var aquarium = window.STATE.getCurrentAquarium();
    if (!aquarium) {
      container.innerHTML = '<p class="muted">No hay acuario seleccionado.</p>';
      return;
    }

    container.innerHTML = '<div class="card"><h2>Cargando...</h2></div>';

    Promise.all([
      window.API.listChannels(aquarium.id),
      window.API.listLatestSolutionsByChannel(aquarium.id),
      window.API.listSolutions(aquarium.id, 20)
    ]).then(function (results) {
      var channels        = results[0] || [];
      var latestByChannel = pickLatestPerChannel(results[1] || []);
      var allSolutions    = results[2] || [];

      var html = '';
      html += renderActiveCard(channels, latestByChannel);
      html += renderNewBatchCard(channels);
      html += renderHistoryCard(allSolutions, channels);

      container.innerHTML = html;
      bindHandlers(aquarium.id, channels);
    })['catch'](function (err) {
      container.innerHTML = '<div class="card"><p class="muted">Error: ' +
        window.UTIL.escapeHtml(err.message) + '</p></div>';
    });
  }

  function pickLatestPerChannel(rows) {
    // rows ya viene ordenado desc por prepared_at
    var byCh = {};
    rows.forEach(function (r) {
      if (byCh[r.channel_number] === undefined) byCh[r.channel_number] = r;
    });
    return byCh;
  }

  // ----------------------------------------------------------
  // Card 1: lotes activos por canal con proyección
  // ----------------------------------------------------------
  function renderActiveCard(channels, latestByChannel) {
    var rows = '';
    for (var n = 1; n <= 4; n++) {
      var channel = findChannel(channels, n);
      var lot     = latestByChannel[n] || null;
      var product = channel && channel.product_id ? window.STATE.findProductById(channel.product_id) : null;

      rows += renderActiveRow(n, channel, product, lot);
    }
    return '<div class="card">' +
      '<h2>Lotes activos por canal</h2>' +
      '<p class="muted small">Proyección de cuándo se acabará la solución según el ml/día configurado.</p>' +
      rows +
    '</div>';
  }

  function renderActiveRow(channelNumber, channel, product, lot) {
    var productLabel = product
      ? window.UTIL.escapeHtml(product.brand + ' — ' + product.name)
      : '<span class="muted">sin producto asignado</span>';

    if (!lot) {
      return '<div class="active-row">' +
        '<div class="active-header">Canal ' + channelNumber + ' · ' + productLabel + '</div>' +
        '<div class="muted small">Sin lotes registrados todavía.</div>' +
      '</div>';
    }

    var preparedTxt = window.UTIL.formatDate(lot.prepared_at);
    var ml          = Number(lot.rodi_ml) || 0;
    var grams       = Number(lot.powder_grams) || 0;

    var projection = '';
    if (channel && channel.mode === 'daily' && Number(channel.ml_per_day) > 0 && ml > 0) {
      var mlPerDay = Number(channel.ml_per_day);
      var elapsedDays = (Date.now() - new Date(lot.prepared_at).getTime()) / (1000 * 60 * 60 * 24);
      var mlRemaining = ml - (mlPerDay * elapsedDays);
      var daysRemaining = mlRemaining / mlPerDay;
      var levelClass = '';
      var label;
      if (mlRemaining <= 0) {
        levelClass = ' lot-empty';
        label = 'Solución agotada (preparar nuevo lote)';
      } else if (daysRemaining < 7) {
        levelClass = ' lot-low';
        label = '~' + Math.round(mlRemaining) + ' ml restantes (~' + Math.ceil(daysRemaining) + ' días)';
      } else {
        levelClass = ' lot-ok';
        label = '~' + Math.round(mlRemaining) + ' ml restantes (~' + Math.ceil(daysRemaining) + ' días)';
      }
      projection = '<div class="lot-projection' + levelClass + '">' + label + '</div>';
    } else if (channel && channel.mode === 'on_demand') {
      projection = '<div class="muted small">Modo eventual — sin proyección.</div>';
    }

    return '<div class="active-row">' +
      '<div class="active-header">Canal ' + channelNumber + ' · ' + productLabel + '</div>' +
      '<div class="lot-detail">' +
        'Lote del ' + preparedTxt + ' · ' + grams + ' g + ' + ml + ' ml RODI' +
      '</div>' +
      projection +
    '</div>';
  }

  // ----------------------------------------------------------
  // Card 2: registrar nuevo lote
  // ----------------------------------------------------------
  function renderNewBatchCard(channels) {
    var products = window.STATE.products;
    var productOpts = '<option value="">— elige producto —</option>';
    products.forEach(function (p) {
      productOpts += '<option value="' + p.id + '">' +
        window.UTIL.escapeHtml(p.brand + ' — ' + p.name) + '</option>';
    });

    var channelOpts = '<option value="">— ninguno (lote suelto) —</option>';
    for (var n = 1; n <= 4; n++) {
      var ch = findChannel(channels, n);
      var prod = ch && ch.product_id ? window.STATE.findProductById(ch.product_id) : null;
      var label = 'Canal ' + n + (prod ? ' (' + prod.name + ')' : ' (sin producto)');
      channelOpts += '<option value="' + n + '">' + window.UTIL.escapeHtml(label) + '</option>';
    }

    var todayIso = todayLocalIso();

    return '<div class="card">' +
      '<h2>Registrar nuevo lote</h2>' +
      '<form id="form-new-batch" autocomplete="off">' +
        '<label class="full">Producto<select name="product_id" required>' + productOpts + '</select></label>' +
        '<div class="grid">' +
          '<label>Gramos polvo<input type="number" step="1" name="powder_grams" required inputmode="decimal"></label>' +
          '<label>Ml RODI<input type="number" step="1" name="rodi_ml" required inputmode="decimal"></label>' +
        '</div>' +
        '<label class="full">Asignar a canal<select name="channel_number">' + channelOpts + '</select></label>' +
        '<label class="full">Fecha de preparación<input type="date" name="prepared_at" value="' + todayIso + '"></label>' +
        '<label class="full">Notas<textarea name="notes" rows="2" placeholder="Opcional"></textarea></label>' +
        '<button type="submit">Registrar lote</button>' +
      '</form>' +
    '</div>';
  }

  // ----------------------------------------------------------
  // Card 3: histórico
  // ----------------------------------------------------------
  function renderHistoryCard(rows, channels) {
    if (!rows || rows.length === 0) {
      return '<div class="card"><h2>Histórico</h2><p class="muted">Sin lotes registrados.</p></div>';
    }
    var html = rows.map(function (r) {
      var product = r.product_id ? window.STATE.findProductById(r.product_id) : null;
      var label = product
        ? product.brand + ' — ' + product.name
        : (r.product_name || '(sin producto)');
      var chTxt = r.channel_number ? 'Canal ' + r.channel_number : 'Suelto';
      return '<div class="solution-row">' +
        '<div class="solution-top">' +
          '<span class="solution-name">' + window.UTIL.escapeHtml(label) + '</span>' +
          '<span class="solution-date">' + window.UTIL.formatDate(r.prepared_at) + '</span>' +
        '</div>' +
        '<div class="solution-meta">' +
          (Number(r.powder_grams) || 0) + ' g + ' + (Number(r.rodi_ml) || 0) + ' ml RODI · ' + chTxt +
        '</div>' +
        (r.notes ? '<div class="solution-notes">' + window.UTIL.escapeHtml(r.notes) + '</div>' : '') +
        '<button class="btn-delete-solution" data-id="' + r.id + '" type="button" title="Eliminar lote">×</button>' +
      '</div>';
    }).join('');
    return '<div class="card"><h2>Histórico</h2>' + html + '</div>';
  }

  // ----------------------------------------------------------
  // Handlers
  // ----------------------------------------------------------
  function bindHandlers(aquariumId, channels) {
    var form = document.getElementById('form-new-batch');
    if (form) {
      form.addEventListener('submit', function (e) {
        e.preventDefault();
        saveNewBatch(form, aquariumId);
      });
    }

    Array.prototype.forEach.call(document.querySelectorAll('.btn-delete-solution'), function (btn) {
      btn.addEventListener('click', function () {
        if (!confirm('¿Eliminar este lote del histórico?')) return;
        var id = parseInt(btn.getAttribute('data-id'), 10);
        window.API.deleteSolution(id).then(function () {
          window.UTIL.toast('Lote eliminado');
          render();
        })['catch'](function (err) {
          window.UTIL.toast('Error: ' + err.message);
        });
      });
    });
  }

  function saveNewBatch(form, aquariumId) {
    var data = window.UTIL.readForm(form);
    if (!data.product_id || !data.powder_grams || !data.rodi_ml) {
      window.UTIL.toast('Producto, gramos y ml RODI son obligatorios');
      return;
    }
    var product = window.STATE.findProductById(data.product_id);
    var preparedIso = data.prepared_at
      ? new Date(data.prepared_at + 'T12:00:00').toISOString()
      : new Date().toISOString();

    var payload = {
      aquarium_id:    aquariumId,
      product_id:     data.product_id,
      product_name:   product ? product.name : null,
      powder_grams:   data.powder_grams,
      rodi_ml:        data.rodi_ml,
      prepared_at:    preparedIso,
      channel_number: data.channel_number || null,
      notes:          data.notes || null
    };

    window.API.insertSolution(payload).then(function () {
      window.UTIL.toast('Lote registrado');
      form.reset();
      render();
    })['catch'](function (err) {
      window.UTIL.toast('Error: ' + err.message);
    });
  }

  // ----------------------------------------------------------
  // Helpers
  // ----------------------------------------------------------
  function findChannel(channels, n) {
    for (var i = 0; i < channels.length; i++) {
      if (channels[i].channel_number === n) return channels[i];
    }
    return null;
  }

  function todayLocalIso() {
    var d = new Date();
    var pad = function (n) { return n < 10 ? '0' + n : '' + n; };
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }
})();
