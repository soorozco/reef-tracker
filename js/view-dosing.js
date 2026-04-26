// Vista: Dosificación — calcula consumo real (dKH, Ca, Mg) entre las 2
// últimas lecturas y sugiere ml/día por canal según volumen + concentración.

(function () {
  window.VIEW_DOSING = {
    init: function () {},
    refresh: function () { render(); }
  };

  var PARAMS = ['dkh', 'ca', 'mg'];
  var PARAM_LABEL = { dkh: 'Alcalinidad (dKH)', ca: 'Calcio (ppm)', mg: 'Magnesio (ppm)' };
  var PARAM_UNIT  = { dkh: 'dKH',               ca: 'ppm Ca',       mg: 'ppm Mg' };
  // Cuántos decimales mostrar para cada parámetro
  var PARAM_DEC   = { dkh: 3, ca: 2, mg: 2 };

  function render() {
    var container = document.getElementById('view-dosing-content');
    var aquarium  = window.STATE.getCurrentAquarium();
    if (!aquarium) {
      container.innerHTML = '<p class="muted">No hay acuario seleccionado.</p>';
      return;
    }

    container.innerHTML = '<div class="card"><h2>Cargando...</h2></div>';

    Promise.all([
      window.API.listParameters(aquarium.id, 10),
      window.API.listChannels(aquarium.id)
    ]).then(function (results) {
      var readings = results[0] || [];
      var channels = results[1] || [];

      var consumption = computeConsumption(readings, channels, aquarium);
      var suggestions = computeSuggestions(consumption, channels);

      var html = '';
      html += renderConsumptionCard(consumption, readings.length);
      html += renderSuggestionsCard(suggestions);
      html += renderInfoCard();

      container.innerHTML = html;
      bindHandlers(aquarium.id);
    })['catch'](function (err) {
      container.innerHTML = '<div class="card"><p class="muted">Error: ' +
        window.UTIL.escapeHtml(err.message) + '</p></div>';
    });
  }

  // ----------------------------------------------------------
  // Cálculo: consumo real por parámetro
  // ----------------------------------------------------------
  // Para cada parámetro:
  //   caída_aparente = (lectura_anterior - lectura_reciente) / días entre ambas
  //   aporte_diario  = Σ ml_per_day_canal × E × 100 / V_total   (solo canales daily con producto)
  //   consumo_real   = caída_aparente + aporte_diario
  function computeConsumption(readings, channels, aquarium) {
    var totalVolL = (Number(aquarium.display_volume_l) || 0) +
                    (Number(aquarium.sump_volume_l) || 0);

    var out = { totalVolL: totalVolL, data: {} };

    PARAMS.forEach(function (param) {
      var rows = readings.filter(function (r) {
        return r[param] !== null && r[param] !== undefined;
      });

      if (rows.length < 2) {
        out.data[param] = { hasData: false, reason: 'few_readings' };
        return;
      }

      var recent   = rows[0];
      var previous = rows[1];
      var deltaPpm = Number(previous[param]) - Number(recent[param]);
      var msBetween = new Date(recent.measured_at).getTime() - new Date(previous.measured_at).getTime();
      var daysBetween = msBetween / (1000 * 60 * 60 * 24);

      if (daysBetween <= 0) {
        out.data[param] = { hasData: false, reason: 'same_date' };
        return;
      }

      var apparentDrop = deltaPpm / daysBetween;

      // Aporte actual de canales daily que afectan este parámetro
      var dailyContribution = 0;
      var contributingChannels = [];
      channels.forEach(function (ch) {
        if (ch.mode !== 'daily') return;
        if (!ch.product_id) return;
        var p = window.STATE.findProductById(ch.product_id);
        if (!p) return;
        var effect = Number(p['affects_' + param + '_per_ml_per_100l']) || 0;
        if (effect <= 0) return;
        var ml = Number(ch.ml_per_day) || 0;
        if (ml <= 0 || totalVolL <= 0) return;

        var contrib = ml * effect * (100 / totalVolL);
        dailyContribution += contrib;
        contributingChannels.push({
          channelNumber: ch.channel_number,
          productName: p.name,
          contribution: contrib
        });
      });

      var realConsumption = apparentDrop + dailyContribution;

      out.data[param] = {
        hasData: true,
        recentValue:    Number(recent[param]),
        previousValue:  Number(previous[param]),
        recentDate:     recent.measured_at,
        previousDate:   previous.measured_at,
        daysBetween:    daysBetween,
        apparentDrop:   apparentDrop,
        dailyContribution: dailyContribution,
        realConsumption: realConsumption,
        contributingChannels: contributingChannels
      };
    });

    return out;
  }

  // ----------------------------------------------------------
  // Cálculo: sugerencia de ml/día por canal
  // ----------------------------------------------------------
  function computeSuggestions(consumption, channels) {
    var totalVolL = consumption.totalVolL;
    var suggestions = [];

    // Ordenar canales 1-4
    var sorted = channels.slice().sort(function (a, b) {
      return a.channel_number - b.channel_number;
    });

    sorted.forEach(function (ch) {
      var s = { channel: ch, channelNumber: ch.channel_number };

      if (ch.mode !== 'daily') {
        s.skip = true; s.reason = 'on_demand';
        suggestions.push(s); return;
      }
      if (!ch.product_id) {
        s.skip = true; s.reason = 'no_product';
        suggestions.push(s); return;
      }
      var product = window.STATE.findProductById(ch.product_id);
      s.product = product;
      if (!product) {
        s.skip = true; s.reason = 'unknown_product';
        suggestions.push(s); return;
      }

      // Determinar parámetro principal del producto (efecto más fuerte)
      var primaryParam = null;
      var primaryEffect = 0;
      PARAMS.forEach(function (p) {
        var e = Number(product['affects_' + p + '_per_ml_per_100l']) || 0;
        if (e > primaryEffect) { primaryEffect = e; primaryParam = p; }
      });
      if (!primaryParam) {
        s.skip = true; s.reason = 'no_effect';
        suggestions.push(s); return;
      }
      s.primaryParam = primaryParam;

      var consData = consumption.data[primaryParam];
      if (!consData || !consData.hasData) {
        s.skip = true; s.reason = 'no_consumption_data';
        suggestions.push(s); return;
      }
      s.consumption = consData.realConsumption;
      s.currentMl = Number(ch.ml_per_day) || 0;

      if (totalVolL <= 0) {
        s.skip = true; s.reason = 'no_volume';
        suggestions.push(s); return;
      }

      // ml/día requeridos para compensar el consumo real con este producto solo
      var requiredMlPerDay = (consData.realConsumption * totalVolL) / (primaryEffect * 100);

      // Si hay múltiples canales daily aportando al mismo parámetro,
      // repartir proporcionalmente según la cuota actual de este canal.
      if (consData.contributingChannels.length > 1 && consData.dailyContribution > 0) {
        var thisShareInPpm = s.currentMl * primaryEffect * (100 / totalVolL);
        var share = thisShareInPpm / consData.dailyContribution;
        if (!isNaN(share) && share > 0) {
          requiredMlPerDay = requiredMlPerDay * share;
        }
      }

      s.suggestedMl = Math.max(0, Math.round(requiredMlPerDay * 10) / 10);
      s.skip = false;
      suggestions.push(s);
    });

    return suggestions;
  }

  // ----------------------------------------------------------
  // Render
  // ----------------------------------------------------------
  function renderConsumptionCard(consumption, totalReadings) {
    if (totalReadings < 2) {
      return '<div class="card">' +
        '<h2>Consumo medido</h2>' +
        '<p class="muted">Necesitas al menos <strong>2 lecturas</strong> para calcular el consumo. ' +
        'Captura tus pruebas en la pestaña <strong>Parámetros</strong>.</p>' +
      '</div>';
    }

    var html = '<div class="card"><h2>Consumo medido</h2>';
    html += '<p class="muted small">Volumen total del sistema: <strong>' + consumption.totalVolL + ' L</strong></p>';

    PARAMS.forEach(function (param) {
      var d = consumption.data[param];
      if (!d) return;
      var dec = PARAM_DEC[param];
      var unit = PARAM_UNIT[param];

      html += '<div class="consumption-row">';
      html += '<div class="consumption-param">' + PARAM_LABEL[param] + '</div>';

      if (!d.hasData) {
        var msg = d.reason === 'few_readings'
          ? 'Faltan lecturas con este parámetro (mínimo 2).'
          : d.reason === 'same_date'
            ? 'Las dos últimas lecturas son del mismo momento.'
            : 'Sin datos.';
        html += '<div class="muted small">' + msg + '</div>';
      } else {
        var direction = d.apparentDrop >= 0 ? 'caída aparente' : 'subida aparente';
        var apparentAbs = Math.abs(d.apparentDrop).toFixed(dec);
        html += '<div class="consumption-detail">' +
          d.previousValue + ' → ' + d.recentValue +
          ' en ' + d.daysBetween.toFixed(1) + ' días · ' +
          direction + ' ~' + apparentAbs + ' ' + unit + '/día' +
        '</div>';

        if (d.dailyContribution > 0) {
          var chList = d.contributingChannels.map(function (c) {
            return 'Ch' + c.channelNumber;
          }).join(', ');
          html += '<div class="consumption-detail muted small">' +
            'Aporte actual de la bomba: +' + d.dailyContribution.toFixed(dec) +
            ' ' + unit + '/día (' + chList + ')</div>';
        }

        var realAbs = Math.abs(d.realConsumption).toFixed(dec);
        var realLabel = d.realConsumption >= 0 ? 'Consumo real' : 'Sobre-dosificación neta';
        var realClass = d.realConsumption >= 0 ? 'positive' : 'negative';
        html += '<div class="consumption-real ' + realClass + '">' +
          realLabel + ': <strong>~' + realAbs + ' ' + unit + '/día</strong></div>';
      }
      html += '</div>';
    });

    html += '</div>';
    return html;
  }

  function renderSuggestionsCard(suggestions) {
    var html = '<div class="card"><h2>Sugerencias por canal</h2>';

    suggestions.forEach(function (s) {
      var n = s.channelNumber;
      html += '<div class="suggestion-row">';
      var prodTxt = s.product
        ? window.UTIL.escapeHtml(s.product.brand + ' — ' + s.product.name)
        : '<span class="muted">sin producto</span>';
      html += '<div class="suggestion-header">Canal ' + n + ' · ' + prodTxt + '</div>';

      if (s.skip) {
        var reasonMsg = {
          'on_demand':         'Modo eventual — sin sugerencia automática.',
          'no_product':        'Sin producto asignado. Configúralo en Configuración.',
          'unknown_product':   'Producto no encontrado en el catálogo.',
          'no_effect':         'El producto no afecta dKH/Ca/Mg.',
          'no_consumption_data': 'Faltan lecturas para calcular el consumo de este parámetro.',
          'no_volume':         'Falta configurar el volumen del acuario.'
        }[s.reason] || 'No aplica.';
        html += '<div class="muted small">' + reasonMsg + '</div>';
      } else {
        var dec = PARAM_DEC[s.primaryParam];
        var unit = PARAM_UNIT[s.primaryParam];
        var diff = s.suggestedMl - s.currentMl;
        var diffSign = diff >= 0 ? '+' : '';
        var bigChange = s.currentMl > 0 && Math.abs(diff) > s.currentMl * 0.5;

        html += '<div class="suggestion-detail">' +
          'Consumo medido: <strong>~' + Math.abs(s.consumption).toFixed(dec) + ' ' + unit + '/día</strong></div>';
        html += '<div class="suggestion-current">Actual: <strong>' + s.currentMl + ' ml/día</strong></div>';
        html += '<div class="suggestion-new' + (bigChange ? ' big-change' : '') + '">' +
          'Sugerido: <strong>' + s.suggestedMl + ' ml/día</strong> ' +
          '<span class="suggestion-diff">(' + diffSign + diff.toFixed(1) + ')</span></div>';

        if (bigChange) {
          html += '<div class="muted small">⚠️ Cambio grande — ajusta gradualmente (≤50% por semana) para evitar shocks.</div>';
        }

        html += '<button class="btn-apply-suggestion" data-channel="' + n +
          '" data-ml="' + s.suggestedMl + '" type="button">Aplicar sugerencia</button>';
      }
      html += '</div>';
    });

    html += '</div>';
    return html;
  }

  function renderInfoCard() {
    return '<div class="card">' +
      '<h2>Notas</h2>' +
      '<ul class="info-list">' +
        '<li>Los cálculos asumen que preparas las soluciones siguiendo la <strong>receta estándar</strong> del fabricante (concentraciones del catálogo de productos).</li>' +
        '<li><strong>Consumo real</strong> = caída entre tus 2 últimas lecturas + aporte actual de los canales diarios.</li>' +
        '<li>Al aplicar una sugerencia se actualiza el ml/día del canal en la app. <strong>Recuerda actualizar también el programa de tu bomba dosificadora física.</strong></li>' +
        '<li>Si la sugerencia es muy distinta a la actual, ajusta gradualmente para evitar shocks en los corales.</li>' +
        '<li>Para subir un parámetro hacia el target (no solo mantenerlo), dosifica un poco más que la sugerencia y vuelve a medir en 24-48 h.</li>' +
      '</ul>' +
    '</div>';
  }

  // ----------------------------------------------------------
  // Handlers
  // ----------------------------------------------------------
  function bindHandlers(aquariumId) {
    Array.prototype.forEach.call(document.querySelectorAll('.btn-apply-suggestion'), function (btn) {
      btn.addEventListener('click', function () {
        var n = parseInt(btn.getAttribute('data-channel'), 10);
        var ml = parseFloat(btn.getAttribute('data-ml'));
        if (!confirm('¿Aplicar ' + ml + ' ml/día al Canal ' + n + '?\n\nRecuerda actualizar también el programa de tu bomba dosificadora física.')) return;
        btn.disabled = true;
        btn.textContent = 'Aplicando...';
        window.API.updateChannel(aquariumId, n, { ml_per_day: ml }).then(function () {
          window.UTIL.toast('Canal ' + n + ' actualizado a ' + ml + ' ml/día');
          render();
        })['catch'](function (err) {
          btn.disabled = false;
          btn.textContent = 'Aplicar sugerencia';
          window.UTIL.toast('Error: ' + err.message);
        });
      });
    });
  }
})();
