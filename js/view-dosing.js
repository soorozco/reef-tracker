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
      window.API.listChannels(aquarium.id),
      window.API.listSchedule(aquarium.id)
    ]).then(function (results) {
      var readings = results[0] || [];
      var channels = results[1] || [];
      var schedule = results[2] || [];

      var consumption = computeConsumption(readings, channels, aquarium);
      var suggestions = computeSuggestions(consumption, channels);

      var html = '';
      html += renderScheduleCard(schedule, channels);
      html += renderConsumptionCard(consumption, readings.length);
      html += renderSuggestionsCard(suggestions);
      html += renderInfoCard();

      container.innerHTML = html;
      bindHandlers(aquarium.id);
      bindScheduleHandlers(aquarium.id, channels);
    })['catch'](function (err) {
      container.innerHTML = '<div class="card"><p class="muted">Error: ' +
        window.UTIL.escapeHtml(err.message) + '</p></div>';
    });
  }

  // ----------------------------------------------------------
  // Card: Plan programado (eventos de dosificación con fecha y hora)
  // ----------------------------------------------------------
  function renderScheduleCard(schedule, channels) {
    var pending = schedule.filter(function (e) { return e.status === 'pending'; });
    var done    = schedule.filter(function (e) { return e.status === 'done'; });
    var skipped = schedule.filter(function (e) { return e.status === 'skipped'; });

    // Ordenar pendientes por fecha asc, hechos por fecha desc
    pending.sort(function (a, b) { return new Date(a.scheduled_at) - new Date(b.scheduled_at); });
    done.sort(function (a, b) { return new Date(b.scheduled_at) - new Date(a.scheduled_at); });

    var html = '<div class="card">' +
      '<h2>Plan programado</h2>' +
      '<p class="muted small">Dosis específicas con fecha y hora (loading dose, dosis eventuales). Diferente del ml/día constante de la bomba.</p>' +
      '<div class="schedule-toolbar">' +
        '<button id="btn-add-schedule" type="button">+ Añadir dosis</button>' +
        '<button id="btn-add-plan" type="button" class="btn-secondary">+ Plan multi-día</button>' +
      '</div>';

    if (pending.length === 0 && done.length === 0 && skipped.length === 0) {
      html += '<p class="muted small">Sin eventos programados.</p>';
    } else {
      html += renderScheduleList('Pendientes', pending, channels, 'pending');
      if (done.length > 0)    html += renderScheduleList('Hechas (últimas 10)', done.slice(0, 10), channels, 'done');
      if (skipped.length > 0) html += renderScheduleList('Saltadas', skipped.slice(0, 5), channels, 'skipped');
    }
    html += '</div>';
    return html;
  }

  function renderScheduleList(title, events, channels, kind) {
    if (!events || events.length === 0) return '';
    var rows = events.map(function (e) {
      return renderScheduleRow(e, channels, kind);
    }).join('');
    return '<h3 class="schedule-section-title">' + title + ' <span class="muted small">(' + events.length + ')</span></h3>' +
      '<div class="schedule-list">' + rows + '</div>';
  }

  function renderScheduleRow(e, channels, kind) {
    var dt = formatScheduleDateTime(e.scheduled_at);
    var channelLabel = 'Canal ' + (e.channel_number || '?');
    var product = e.product_id ? window.STATE.findProductById(e.product_id) : null;
    if (!product) {
      // Resolver vía canal
      var ch = findChannel(channels, e.channel_number);
      if (ch && ch.product_id) product = window.STATE.findProductById(ch.product_id);
    }
    if (product) channelLabel += ' · ' + product.brand + ' ' + product.name;

    var actions;
    if (kind === 'pending') {
      actions = '<div class="schedule-actions">' +
        '<button class="btn-schedule-done" data-id="' + e.id + '" data-ml="' + e.ml + '" type="button">✓ Hecho</button>' +
        '<button class="btn-schedule-skip" data-id="' + e.id + '" type="button" title="Saltar">⊘</button>' +
        '<button class="btn-schedule-delete" data-id="' + e.id + '" type="button" title="Eliminar">×</button>' +
      '</div>';
    } else {
      actions = '<div class="schedule-actions">' +
        '<button class="btn-schedule-restore" data-id="' + e.id + '" type="button" title="Restaurar a pendiente">↶</button>' +
        '<button class="btn-schedule-delete" data-id="' + e.id + '" type="button" title="Eliminar">×</button>' +
      '</div>';
    }

    var doneInfo = '';
    if (kind === 'done' && e.done_at) {
      var doneTxt = window.UTIL.formatDate(e.done_at);
      var doneMl  = (e.done_ml !== null && e.done_ml !== undefined) ? Number(e.done_ml) : Number(e.ml);
      doneInfo = '<div class="schedule-done-info muted small">Hecho ' + doneTxt + ' · ' + doneMl + ' ml</div>';
    }

    var statusClass = 'schedule-' + kind;
    return '<div class="schedule-row ' + statusClass + '">' +
      '<div class="schedule-info">' +
        '<div class="schedule-when">' + dt + '</div>' +
        '<div class="schedule-what">' + window.UTIL.escapeHtml(channelLabel) + ' · <strong>' + e.ml + ' ml</strong></div>' +
        (e.notes ? '<div class="schedule-notes muted small">' + window.UTIL.escapeHtml(e.notes) + '</div>' : '') +
        doneInfo +
      '</div>' +
      actions +
    '</div>';
  }

  function bindScheduleHandlers(aquariumId, channels) {
    // Añadir dosis individual
    var addBtn = document.getElementById('btn-add-schedule');
    if (addBtn) {
      addBtn.addEventListener('click', function () {
        openAddScheduleModal(aquariumId, channels);
      });
    }

    // Asistente plan multi-día
    var planBtn = document.getElementById('btn-add-plan');
    if (planBtn) {
      planBtn.addEventListener('click', function () {
        openMultiDayPlanModal(aquariumId, channels);
      });
    }

    // Marcar hecho
    Array.prototype.forEach.call(document.querySelectorAll('.btn-schedule-done'), function (btn) {
      btn.addEventListener('click', function () {
        var id = parseInt(btn.getAttribute('data-id'), 10);
        var ml = parseFloat(btn.getAttribute('data-ml'));
        // Pregunta si quiere ajustar la dosis real
        var input = prompt('¿Cuántos ml dosaste realmente? (Enter para usar ' + ml + ')');
        var realMl = (input === null || input.trim() === '') ? ml : parseFloat(input);
        if (isNaN(realMl) || realMl <= 0) {
          window.UTIL.toast('Dosis inválida');
          return;
        }
        btn.disabled = true;
        window.API.updateSchedule(id, {
          status: 'done',
          done_at: new Date().toISOString(),
          done_ml: realMl
        }).then(function () {
          window.UTIL.toast('Marcado como hecho');
          render();
        })['catch'](function (err) {
          btn.disabled = false;
          window.UTIL.toast('Error: ' + err.message);
        });
      });
    });

    // Saltar
    Array.prototype.forEach.call(document.querySelectorAll('.btn-schedule-skip'), function (btn) {
      btn.addEventListener('click', function () {
        if (!confirm('¿Marcar como saltada (no se dosa)?')) return;
        var id = parseInt(btn.getAttribute('data-id'), 10);
        window.API.updateSchedule(id, {
          status: 'skipped',
          done_at: new Date().toISOString()
        }).then(function () {
          window.UTIL.toast('Saltada');
          render();
        })['catch'](function (err) {
          window.UTIL.toast('Error: ' + err.message);
        });
      });
    });

    // Restaurar
    Array.prototype.forEach.call(document.querySelectorAll('.btn-schedule-restore'), function (btn) {
      btn.addEventListener('click', function () {
        var id = parseInt(btn.getAttribute('data-id'), 10);
        window.API.updateSchedule(id, {
          status: 'pending',
          done_at: null,
          done_ml: null
        }).then(function () {
          window.UTIL.toast('Restaurada');
          render();
        })['catch'](function (err) {
          window.UTIL.toast('Error: ' + err.message);
        });
      });
    });

    // Eliminar
    Array.prototype.forEach.call(document.querySelectorAll('.btn-schedule-delete'), function (btn) {
      btn.addEventListener('click', function () {
        if (!confirm('¿Eliminar esta dosis del plan?')) return;
        var id = parseInt(btn.getAttribute('data-id'), 10);
        window.API.deleteSchedule(id).then(function () {
          window.UTIL.toast('Eliminada');
          render();
        })['catch'](function (err) {
          window.UTIL.toast('Error: ' + err.message);
        });
      });
    });
  }

  // ----------------------------------------------------------
  // Modal: añadir dosis individual
  // ----------------------------------------------------------
  function openAddScheduleModal(aquariumId, channels) {
    var overlay = document.createElement('div');
    overlay.className = 'modal-overlay';

    var channelOpts = '<option value="">— elige canal —</option>';
    channels.forEach(function (ch) {
      var prod = ch.product_id ? window.STATE.findProductById(ch.product_id) : null;
      var label = 'Canal ' + ch.channel_number + (prod ? ' (' + prod.name + ')' : '');
      channelOpts += '<option value="' + ch.channel_number + '">' + window.UTIL.escapeHtml(label) + '</option>';
    });

    var nowIso = nowLocalIsoForInput();

    overlay.innerHTML =
      '<div class="modal">' +
        '<h2>Añadir dosis programada</h2>' +
        '<form id="modal-add-schedule" autocomplete="off">' +
          '<label class="full">Canal<select name="channel_number" required>' + channelOpts + '</select></label>' +
          '<div class="grid">' +
            '<label>Fecha y hora<input type="datetime-local" name="scheduled_at" required value="' + nowIso + '"></label>' +
            '<label>ml<input type="number" step="0.1" min="0.1" name="ml" required inputmode="decimal"></label>' +
          '</div>' +
          '<label class="full">Notas<textarea name="notes" rows="2" placeholder="Opcional"></textarea></label>' +
          '<div class="modal-actions">' +
            '<button type="button" class="btn-secondary" id="modal-cancel">Cancelar</button>' +
            '<button type="submit">Añadir</button>' +
          '</div>' +
          '<div class="modal-error" id="modal-err"></div>' +
        '</form>' +
      '</div>';
    document.body.appendChild(overlay);

    overlay.querySelector('#modal-cancel').addEventListener('click', function () {
      document.body.removeChild(overlay);
    });

    overlay.querySelector('#modal-add-schedule').addEventListener('submit', function (e) {
      e.preventDefault();
      var data = window.UTIL.readForm(e.target);
      if (!data.channel_number || !data.scheduled_at || !data.ml) {
        overlay.querySelector('#modal-err').textContent = 'Faltan datos';
        return;
      }
      var ch = findChannel(channels, parseInt(data.channel_number, 10));
      var payload = {
        aquarium_id:    aquariumId,
        channel_number: parseInt(data.channel_number, 10),
        product_id:     ch && ch.product_id ? ch.product_id : null,
        scheduled_at:   new Date(data.scheduled_at).toISOString(),
        ml:             data.ml,
        notes:          data.notes || null,
        status:         'pending'
      };
      window.API.insertSchedule(payload).then(function () {
        document.body.removeChild(overlay);
        window.UTIL.toast('Añadida');
        render();
      })['catch'](function (err) {
        overlay.querySelector('#modal-err').textContent = 'Error: ' + err.message;
      });
    });
  }

  // ----------------------------------------------------------
  // Modal: asistente plan multi-día
  // ----------------------------------------------------------
  function openMultiDayPlanModal(aquariumId, channels) {
    var overlay = document.createElement('div');
    overlay.className = 'modal-overlay';

    var channelOpts = '<option value="">— elige canal —</option>';
    channels.forEach(function (ch) {
      var prod = ch.product_id ? window.STATE.findProductById(ch.product_id) : null;
      var label = 'Canal ' + ch.channel_number + (prod ? ' (' + prod.name + ')' : '');
      channelOpts += '<option value="' + ch.channel_number + '">' + window.UTIL.escapeHtml(label) + '</option>';
    });

    var todayIso = todayLocalIso();

    overlay.innerHTML =
      '<div class="modal">' +
        '<h2>Plan multi-día</h2>' +
        '<p class="muted small">Genera varias dosis a la misma hora durante un rango de fechas.</p>' +
        '<form id="modal-plan" autocomplete="off">' +
          '<label class="full">Canal<select name="channel_number" required>' + channelOpts + '</select></label>' +
          '<div class="grid">' +
            '<label>Desde<input type="date" name="date_from" required value="' + todayIso + '"></label>' +
            '<label>Hasta<input type="date" name="date_to" required value="' + todayIso + '"></label>' +
          '</div>' +
          '<fieldset class="prompt-field">' +
            '<legend>Dosis 1</legend>' +
            '<div class="grid">' +
              '<label>Hora<input type="time" name="time1" value="10:00"></label>' +
              '<label>ml<input type="number" step="0.1" min="0" name="ml1" value="0" inputmode="decimal"></label>' +
            '</div>' +
          '</fieldset>' +
          '<fieldset class="prompt-field">' +
            '<legend>Dosis 2 (opcional)</legend>' +
            '<div class="grid">' +
              '<label>Hora<input type="time" name="time2" value="21:30"></label>' +
              '<label>ml<input type="number" step="0.1" min="0" name="ml2" value="0" inputmode="decimal"></label>' +
            '</div>' +
          '</fieldset>' +
          '<label class="full">Notas (se aplican a todas)<textarea name="notes" rows="2" placeholder="Opcional"></textarea></label>' +
          '<div class="modal-actions">' +
            '<button type="button" class="btn-secondary" id="modal-plan-cancel">Cancelar</button>' +
            '<button type="submit">Generar</button>' +
          '</div>' +
          '<div class="modal-error" id="modal-plan-err"></div>' +
        '</form>' +
      '</div>';
    document.body.appendChild(overlay);

    overlay.querySelector('#modal-plan-cancel').addEventListener('click', function () {
      document.body.removeChild(overlay);
    });

    overlay.querySelector('#modal-plan').addEventListener('submit', function (e) {
      e.preventDefault();
      var f = e.target;
      var channelNumber = parseInt(f.channel_number.value, 10);
      var dateFrom = f.date_from.value;
      var dateTo   = f.date_to.value;
      var time1    = f.time1.value;
      var ml1      = parseFloat(f.ml1.value) || 0;
      var time2    = f.time2.value;
      var ml2      = parseFloat(f.ml2.value) || 0;
      var notes    = f.notes.value || null;

      if (!channelNumber || !dateFrom || !dateTo) {
        overlay.querySelector('#modal-plan-err').textContent = 'Faltan canal o fechas';
        return;
      }
      if (ml1 <= 0 && ml2 <= 0) {
        overlay.querySelector('#modal-plan-err').textContent = 'Al menos una dosis debe ser > 0';
        return;
      }

      var ch = findChannel(channels, channelNumber);
      var productId = ch && ch.product_id ? ch.product_id : null;

      var rows = [];
      var d = new Date(dateFrom + 'T00:00:00');
      var end = new Date(dateTo + 'T00:00:00');
      while (d.getTime() <= end.getTime()) {
        if (ml1 > 0) {
          rows.push(makeScheduleRow(aquariumId, channelNumber, productId, d, time1, ml1, notes));
        }
        if (ml2 > 0) {
          rows.push(makeScheduleRow(aquariumId, channelNumber, productId, d, time2, ml2, notes));
        }
        d = new Date(d.getTime() + 86400000);
      }

      if (rows.length === 0) {
        overlay.querySelector('#modal-plan-err').textContent = 'Sin filas para crear';
        return;
      }

      window.API.insertScheduleBulk(rows).then(function () {
        document.body.removeChild(overlay);
        window.UTIL.toast(rows.length + ' dosis programadas');
        render();
      })['catch'](function (err) {
        overlay.querySelector('#modal-plan-err').textContent = 'Error: ' + err.message;
      });
    });
  }

  function makeScheduleRow(aquariumId, channelNumber, productId, dateObj, hhmm, ml, notes) {
    var parts = (hhmm || '00:00').split(':');
    var dt = new Date(dateObj.getFullYear(), dateObj.getMonth(), dateObj.getDate(),
                      parseInt(parts[0], 10) || 0, parseInt(parts[1], 10) || 0, 0);
    return {
      aquarium_id:    aquariumId,
      channel_number: channelNumber,
      product_id:     productId,
      scheduled_at:   dt.toISOString(),
      ml:             ml,
      notes:          notes || null,
      status:         'pending'
    };
  }

  function findChannel(channels, n) {
    for (var i = 0; i < channels.length; i++) {
      if (channels[i].channel_number === n) return channels[i];
    }
    return null;
  }

  function formatScheduleDateTime(iso) {
    try {
      var d = new Date(iso);
      var pad = function (n) { return n < 10 ? '0' + n : '' + n; };
      var dayNames = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
      return dayNames[d.getDay()] + ' ' + pad(d.getDate()) + '/' + pad(d.getMonth() + 1) +
             ' · ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
    } catch (e) { return iso; }
  }

  function todayLocalIso() {
    var d = new Date();
    var pad = function (n) { return n < 10 ? '0' + n : '' + n; };
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }

  function nowLocalIsoForInput() {
    var d = new Date();
    var pad = function (n) { return n < 10 ? '0' + n : '' + n; };
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) +
           'T' + pad(d.getHours()) + ':' + pad(d.getMinutes());
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
