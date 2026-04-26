// Wizard de configuración inicial. Se muestra cuando no hay ningún acuario
// registrado. Captura: nombre, volúmenes, targets y asignación de canales.

(function () {
  window.WIZARD = {
    show: function (onDone) {
      var overlay = buildOverlay(onDone);
      document.body.appendChild(overlay);
    }
  };

  function buildOverlay(onDone) {
    var overlay = document.createElement('div');
    overlay.className = 'wizard-overlay';
    overlay.innerHTML =
      '<div class="wizard">' +
        '<h2>Configura tu primer acuario</h2>' +
        '<p class="muted">Solo te toma 1 minuto. Puedes editar todo después.</p>' +
        '<form id="wizard-form" autocomplete="off">' +
          renderStep1() +
          renderStep2() +
          renderStep3() +
          renderStep4() +
          '<button type="submit">Crear acuario</button>' +
          '<div class="wizard-error" id="wizard-error"></div>' +
        '</form>' +
      '</div>';

    var form = overlay.querySelector('#wizard-form');
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      submit(form, overlay, onDone);
    });

    return overlay;
  }

  function renderStep1() {
    return '<fieldset>' +
      '<legend>1. Identificación</legend>' +
      '<label class="full">Nombre del acuario' +
        '<input type="text" name="name" value="Reef principal" required>' +
      '</label>' +
    '</fieldset>';
  }

  function renderStep2() {
    return '<fieldset>' +
      '<legend>2. Volúmenes</legend>' +
      '<div class="grid">' +
        '<label>Display (L)<input type="number" step="1" name="display_volume_l" required inputmode="decimal"></label>' +
        '<label>Sump (L)<input type="number" step="1" name="sump_volume_l" value="0" inputmode="decimal"></label>' +
      '</div>' +
    '</fieldset>';
  }

  function renderStep3() {
    var t = [
      ['target_dkh',      'dKH objetivo',     '8.5',   '0.1'],
      ['target_ca',       'Ca objetivo',      '430',   '1'],
      ['target_mg',       'Mg objetivo',      '1350',  '1'],
      ['target_no3',      'NO3 objetivo',     '3',     '0.1'],
      ['target_po4',      'PO4 objetivo',     '0.03',  '0.01'],
      ['target_salinity', 'Salinidad (sg)',   '1.026', '0.001'],
      ['target_temp_c',   'Temp °C',          '25.5',  '0.1'],
      ['target_ph',       'pH',               '8.2',   '0.01']
    ];
    var html = '<fieldset><legend>3. Targets (corales mixtos)</legend><div class="grid">';
    t.forEach(function (row) {
      html += '<label>' + row[1] +
        '<input type="number" name="' + row[0] + '" value="' + row[2] + '" step="' + row[3] + '" inputmode="decimal">' +
      '</label>';
    });
    html += '</div></fieldset>';
    return html;
  }

  function renderStep4() {
    var products = window.STATE.products;
    function options(filterBrand, filterName) {
      var opts = '<option value="">— sin producto —</option>';
      for (var i = 0; i < products.length; i++) {
        var p = products[i];
        var selected = '';
        if (filterBrand && p.brand === filterBrand && p.name.indexOf(filterName) !== -1) selected = ' selected';
        opts += '<option value="' + p.id + '"' + selected + '>' + escapeHtml(p.brand + ' — ' + p.name) + '</option>';
      }
      return opts;
    }
    return '<fieldset>' +
      '<legend>4. Asignación de canales</legend>' +
      '<div class="channel-row">' +
        '<label>Canal 1<select name="ch1_product">' + options('Red Sea', 'Foundation A') + '</select></label>' +
      '</div>' +
      '<div class="channel-row">' +
        '<label>Canal 2<select name="ch2_product">' + options('Red Sea', 'Foundation B') + '</select></label>' +
      '</div>' +
      '<div class="channel-row">' +
        '<label>Canal 3<select name="ch3_product">' + options('Red Sea', 'Foundation C') + '</select></label>' +
      '</div>' +
      '<div class="channel-row">' +
        '<label>Canal 4<select name="ch4_product">' + options('Tropic Marin', 'All-For-Reef') + '</select></label>' +
        '<small class="muted">Por defecto en modo "eventual" (sin programa diario).</small>' +
      '</div>' +
    '</fieldset>';
  }

  function submit(form, overlay, onDone) {
    var btn = form.querySelector('button[type="submit"]');
    var errorBox = form.querySelector('#wizard-error');
    errorBox.textContent = '';
    btn.disabled = true;
    btn.textContent = 'Creando...';

    var data = readForm(form);
    var aquariumPayload = {
      name:             data.name,
      display_volume_l: data.display_volume_l,
      sump_volume_l:    data.sump_volume_l || 0,
      target_dkh:       data.target_dkh,
      target_ca:        data.target_ca,
      target_mg:        data.target_mg,
      target_no3:       data.target_no3,
      target_po4:       data.target_po4,
      target_salinity:  data.target_salinity,
      target_temp_c:    data.target_temp_c,
      target_ph:        data.target_ph,
      active:           true
    };

    window.API.insertAquarium(aquariumPayload).then(function (rows) {
      var aquarium = rows && rows[0];
      if (!aquarium) throw new Error('No se recibió el acuario creado');
      var aquariumId = aquarium.id;

      var channelDefs = [
        { ch: 1, productId: data.ch1_product, mode: 'daily' },
        { ch: 2, productId: data.ch2_product, mode: 'daily' },
        { ch: 3, productId: data.ch3_product, mode: 'daily' },
        { ch: 4, productId: data.ch4_product, mode: 'on_demand' }
      ];

      var inserts = channelDefs.map(function (c) {
        return window.API.upsertChannel({
          aquarium_id:    aquariumId,
          channel_number: c.ch,
          product_id:     c.productId || null,
          ml_per_day:     0,
          mode:           c.mode
        });
      });

      return Promise.all(inserts).then(function () { return aquarium; });
    }).then(function (aquarium) {
      document.body.removeChild(overlay);
      onDone(aquarium);
    })['catch'](function (err) {
      btn.disabled = false;
      btn.textContent = 'Crear acuario';
      errorBox.textContent = 'Error: ' + err.message;
    });
  }

  function readForm(form) {
    var out = {};
    var inputs = form.querySelectorAll('input, select');
    Array.prototype.forEach.call(inputs, function (input) {
      var v = input.value;
      if (v === '' || v === null || v === undefined) return;
      if (input.type === 'number') {
        var n = parseFloat(v);
        if (!isNaN(n)) out[input.name] = n;
      } else if (input.tagName === 'SELECT') {
        var n2 = parseInt(v, 10);
        if (!isNaN(n2)) out[input.name] = n2;
      } else {
        out[input.name] = v;
      }
    });
    return out;
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c];
    });
  }
})();
