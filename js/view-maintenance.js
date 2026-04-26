// Vista: Mantenimiento — catálogo de tareas con frecuencia esperada,
// estado (vencida/por vencer/al día), botón "marcar hecho", y bitácora libre.
// Algunas tareas piden datos extra al marcarse hechas (litros, gramos, etc).

(function () {
  // Tareas estándar para precarga inicial.
  // Si una tarea tiene `prompt_fields`, se pedirán esos datos al marcarse hecha.
  var DEFAULT_TASKS = [
    { name: 'Cambiar calcetín / filter sock', frequency_days: 4 },
    { name: 'Limpiar skimmer',                frequency_days: 7 },
    { name: 'Limpiar cristales',              frequency_days: 7 },
    { name: 'Cambio parcial de agua',         frequency_days: 14, prompt_fields: [
      { name: 'liters',     label: 'Litros cambiados', type: 'number', step: '1', required: true },
      { name: 'salt_brand', label: 'Sal usada',        type: 'text',   required: false, placeholder: 'Red Sea Coral Pro / Tropic Marin / etc.' }
    ]},
    { name: 'Recambio carbón activado',       frequency_days: 30, prompt_fields: [
      { name: 'grams', label: 'Gramos', type: 'number', step: '10', required: true }
    ]},
    { name: 'Recambio GFO',                   frequency_days: 30, prompt_fields: [
      { name: 'grams', label: 'Gramos', type: 'number', step: '10', required: true }
    ]},
    { name: 'Limpiar wavemakers / powerheads', frequency_days: 30 },
    { name: 'Pruebas ICP',                    frequency_days: 60, prompt_fields: [
      { name: 'lab', label: 'Laboratorio', type: 'text', required: true, placeholder: 'Triton / ATI / Fauna Marin / Oceamo' }
    ]},
    { name: 'Calibrar sondas (pH / salinidad)', frequency_days: 90 },
    { name: 'Limpiar bombas de retorno',        frequency_days: 90 },
    { name: 'Cambiar membranas RODI',           frequency_days: 365, prompt_fields: [
      { name: 'stages', label: 'Etapas cambiadas', type: 'checkbox_multi', required: true, options: [
        'Sedimento (1 micra)',
        'Carbón granular',
        'Carbón en bloque',
        'Membrana RO',
        'Post-carbón',
        'Resina DI'
      ]}
    ]}
  ];

  window.VIEW_MAINTENANCE = {
    init: function () {},
    refresh: function () { render(); }
  };

  function render() {
    var container = document.getElementById('view-maintenance-content');
    var aquarium = window.STATE.getCurrentAquarium();
    if (!aquarium) {
      container.innerHTML = '<p class="muted">No hay acuario seleccionado.</p>';
      return;
    }

    container.innerHTML = '<div class="card"><h2>Cargando...</h2></div>';

    Promise.all([
      window.API.listTasks(aquarium.id),
      window.API.listLastDonePerTask(aquarium.id),
      window.API.listMaintenance(aquarium.id, 30)
    ]).then(function (results) {
      var tasks      = results[0] || [];
      var doneRows   = results[1] || [];
      var logEntries = results[2] || [];

      var lastDoneByTask = {};
      doneRows.forEach(function (r) {
        if (lastDoneByTask[r.task_id] === undefined) {
          lastDoneByTask[r.task_id] = r.performed_at;
        }
      });

      var html = '';
      if (tasks.length === 0) {
        html += renderSeedCard();
      } else {
        html += renderTasksCard(tasks, lastDoneByTask, aquarium.id);
        html += renderAddTaskCard();
      }
      html += renderQuickLogCard();
      html += renderLogListCard(logEntries, tasks);

      container.innerHTML = html;
      bindHandlers(aquarium.id, tasks);
    })['catch'](function (err) {
      container.innerHTML = '<div class="card"><p class="muted">Error: ' +
        window.UTIL.escapeHtml(err.message) + '</p></div>';
    });
  }

  // ----------------------------------------------------------
  // Card: precarga de tareas
  // ----------------------------------------------------------
  function renderSeedCard() {
    var list = DEFAULT_TASKS.map(function (t) {
      var extra = t.prompt_fields ? ' <span class="muted small">+ datos</span>' : '';
      return '<li>' + window.UTIL.escapeHtml(t.name) +
        ' <span class="muted small">(cada ' + freqLabel(t.frequency_days) + ')</span>' + extra + '</li>';
    }).join('');
    return '<div class="card">' +
      '<h2>Precargar tareas estándar</h2>' +
      '<p class="muted">Tu catálogo de tareas está vacío. ¿Quieres precargar las tareas típicas de un reef?</p>' +
      '<p class="muted small">Las marcadas con <em>+ datos</em> te pedirán información adicional al marcarse hechas (ej: litros, gramos).</p>' +
      '<ul class="seed-list">' + list + '</ul>' +
      '<button id="seed-btn" type="button">Precargar ' + DEFAULT_TASKS.length + ' tareas</button>' +
    '</div>';
  }

  // ----------------------------------------------------------
  // Card: lista de tareas con estado
  // ----------------------------------------------------------
  function renderTasksCard(tasks, lastDoneByTask) {
    var rows = tasks.map(function (t) {
      var lastDone = lastDoneByTask[t.id] || null;
      var status   = computeStatus(lastDone, t.frequency_days);
      var lastTxt  = lastDone ? window.UTIL.formatDate(lastDone) : 'Nunca';
      var nextTxt  = lastDone ? formatRelative(status.daysToNext) : 'Pendiente';
      var hasFields = hasPromptFields(t);

      return '<div class="task-row task-' + status.level + '" data-task-id="' + t.id + '">' +
        '<div class="task-info">' +
          '<div class="task-name">' + window.UTIL.escapeHtml(t.name) +
            (hasFields ? ' <span class="task-badge">+ datos</span>' : '') + '</div>' +
          '<div class="task-meta">' +
            'Cada ' + freqLabel(t.frequency_days) + ' · ' +
            'Última: ' + lastTxt + ' · ' +
            '<span class="task-next">' + nextTxt + '</span>' +
          '</div>' +
        '</div>' +
        '<div class="task-actions">' +
          '<button class="btn-done" data-task-id="' + t.id + '" type="button">✓ Hecho</button>' +
          '<button class="btn-delete-task" data-task-id="' + t.id + '" type="button" title="Eliminar tarea">×</button>' +
        '</div>' +
      '</div>';
    }).join('');

    return '<div class="card">' +
      '<h2>Tareas (' + tasks.length + ')</h2>' +
      '<p class="muted small">Toca <strong>✓ Hecho</strong> cuando completes una tarea.</p>' +
      rows +
    '</div>';
  }

  // ----------------------------------------------------------
  // Card: añadir tarea personalizada
  // ----------------------------------------------------------
  function renderAddTaskCard() {
    return '<div class="card">' +
      '<h2>Añadir tarea</h2>' +
      '<form id="form-add-task" autocomplete="off">' +
        '<label class="full">Nombre de la tarea<input type="text" name="name" required></label>' +
        '<label class="full">Frecuencia (días)<input type="number" step="1" min="1" name="frequency_days" required value="7" inputmode="numeric"></label>' +
        '<button type="submit">Añadir tarea</button>' +
      '</form>' +
    '</div>';
  }

  // ----------------------------------------------------------
  // Card: bitácora libre
  // ----------------------------------------------------------
  function renderQuickLogCard() {
    return '<div class="card">' +
      '<h2>Anotar entrada libre</h2>' +
      '<p class="muted small">Para cosas no recurrentes (ej: "rescaté un pepino que se atoró en la rejilla").</p>' +
      '<form id="form-quick-log" autocomplete="off">' +
        '<label class="full">Qué hiciste<input type="text" name="task" required placeholder="Descripción breve"></label>' +
        '<label class="full">Notas<textarea name="notes" rows="2"></textarea></label>' +
        '<button type="submit">Guardar entrada</button>' +
      '</form>' +
    '</div>';
  }

  // ----------------------------------------------------------
  // Card: bitácora reciente (con detalles)
  // ----------------------------------------------------------
  function renderLogListCard(logEntries, tasks) {
    if (!logEntries || logEntries.length === 0) {
      return '<div class="card"><h2>Bitácora reciente</h2><p class="muted">Sin entradas todavía.</p></div>';
    }
    var taskById = {};
    tasks.forEach(function (t) { taskById[t.id] = t; });

    var rows = logEntries.map(function (e) {
      var label = e.task_id && taskById[e.task_id]
        ? taskById[e.task_id].name
        : e.task;
      var detailsHtml = renderDetails(e.details, e.task_id ? taskById[e.task_id] : null);
      return '<div class="log-row">' +
        '<div class="log-row-top">' +
          '<span class="log-task">' + window.UTIL.escapeHtml(label || '(sin descripción)') + '</span>' +
          '<span class="log-date">' + window.UTIL.formatDate(e.performed_at) + '</span>' +
        '</div>' +
        detailsHtml +
        (e.notes ? '<div class="log-notes">' + window.UTIL.escapeHtml(e.notes) + '</div>' : '') +
      '</div>';
    }).join('');

    return '<div class="card"><h2>Bitácora reciente</h2>' + rows + '</div>';
  }

  function renderDetails(details, task) {
    if (!details || typeof details !== 'object') return '';
    var fieldsByName = {};
    if (task && task.prompt_fields) {
      (task.prompt_fields || []).forEach(function (f) { fieldsByName[f.name] = f; });
    }
    var parts = [];
    for (var key in details) {
      if (!details.hasOwnProperty(key)) continue;
      var val = details[key];
      if (val === null || val === undefined || val === '') continue;
      var label = fieldsByName[key] ? fieldsByName[key].label : key;
      var valStr;
      if (Array.isArray(val))      valStr = val.join(', ');
      else if (typeof val === 'object') valStr = JSON.stringify(val);
      else                          valStr = String(val);
      parts.push('<span class="log-detail"><strong>' + window.UTIL.escapeHtml(label) +
                 ':</strong> ' + window.UTIL.escapeHtml(valStr) + '</span>');
    }
    if (parts.length === 0) return '';
    return '<div class="log-details">' + parts.join(' · ') + '</div>';
  }

  // ----------------------------------------------------------
  // Modal de captura de campos extra al marcar hecho
  // ----------------------------------------------------------
  function showDoneModal(task, onConfirm) {
    var overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML =
      '<div class="modal">' +
        '<h2>' + window.UTIL.escapeHtml(task.name) + '</h2>' +
        '<p class="muted small">Captura los datos antes de guardar.</p>' +
        '<form id="modal-form" autocomplete="off">' +
          renderPromptFields(task.prompt_fields || []) +
          '<div class="modal-actions">' +
            '<button type="button" class="btn-secondary" id="modal-cancel">Cancelar</button>' +
            '<button type="submit">Guardar como hecho</button>' +
          '</div>' +
          '<div class="modal-error" id="modal-error"></div>' +
        '</form>' +
      '</div>';
    document.body.appendChild(overlay);

    var form = overlay.querySelector('#modal-form');
    var cancelBtn = overlay.querySelector('#modal-cancel');
    var errorBox = overlay.querySelector('#modal-error');

    cancelBtn.addEventListener('click', function () {
      document.body.removeChild(overlay);
    });

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var details = readPromptFields(form, task.prompt_fields || []);
      var missing = checkRequired(details, task.prompt_fields || []);
      if (missing) {
        errorBox.textContent = 'Falta: ' + missing;
        return;
      }
      document.body.removeChild(overlay);
      onConfirm(details);
    });
  }

  function renderPromptFields(fields) {
    return fields.map(function (f) {
      if (f.type === 'checkbox_multi') {
        var opts = (f.options || []).map(function (opt, idx) {
          return '<label class="cb-option">' +
            '<input type="checkbox" name="' + f.name + '" value="' + window.UTIL.escapeHtml(opt) + '">' +
            '<span>' + window.UTIL.escapeHtml(opt) + '</span>' +
          '</label>';
        }).join('');
        return '<fieldset class="prompt-field">' +
          '<legend>' + window.UTIL.escapeHtml(f.label) + (f.required ? ' *' : '') + '</legend>' +
          opts +
        '</fieldset>';
      }
      var attrs = '';
      if (f.step)        attrs += ' step="' + f.step + '"';
      if (f.placeholder) attrs += ' placeholder="' + window.UTIL.escapeHtml(f.placeholder) + '"';
      if (f.type === 'number') attrs += ' inputmode="decimal"';
      var typeAttr = (f.type === 'number') ? 'number' : 'text';
      return '<label class="full">' + window.UTIL.escapeHtml(f.label) + (f.required ? ' *' : '') +
        '<input type="' + typeAttr + '" name="' + f.name + '"' + attrs + '>' +
      '</label>';
    }).join('');
  }

  function readPromptFields(form, fields) {
    var out = {};
    fields.forEach(function (f) {
      if (f.type === 'checkbox_multi') {
        var checked = [];
        var boxes = form.querySelectorAll('input[type="checkbox"][name="' + f.name + '"]');
        Array.prototype.forEach.call(boxes, function (cb) {
          if (cb.checked) checked.push(cb.value);
        });
        if (checked.length > 0) out[f.name] = checked;
      } else {
        var input = form.querySelector('[name="' + f.name + '"]');
        if (!input) return;
        var v = input.value;
        if (v === '' || v === null || v === undefined) return;
        if (f.type === 'number') {
          var n = parseFloat(v);
          if (!isNaN(n)) out[f.name] = n;
        } else {
          out[f.name] = v;
        }
      }
    });
    return out;
  }

  function checkRequired(details, fields) {
    for (var i = 0; i < fields.length; i++) {
      var f = fields[i];
      if (!f.required) continue;
      var v = details[f.name];
      if (v === undefined || v === null || v === '' || (Array.isArray(v) && v.length === 0)) {
        return f.label;
      }
    }
    return null;
  }

  function hasPromptFields(task) {
    return Array.isArray(task.prompt_fields) && task.prompt_fields.length > 0;
  }

  // ----------------------------------------------------------
  // Handlers
  // ----------------------------------------------------------
  function bindHandlers(aquariumId, tasks) {
    var taskById = {};
    tasks.forEach(function (t) { taskById[t.id] = t; });

    // Precargar
    var seedBtn = document.getElementById('seed-btn');
    if (seedBtn) {
      seedBtn.addEventListener('click', function () {
        seedBtn.disabled = true;
        seedBtn.textContent = 'Cargando...';
        var rows = DEFAULT_TASKS.map(function (t) {
          var row = {
            aquarium_id:    aquariumId,
            name:           t.name,
            frequency_days: t.frequency_days,
            active:         true
          };
          if (t.prompt_fields) row.prompt_fields = t.prompt_fields;
          return row;
        });
        window.API.insertTasksBulk(rows).then(function () {
          window.UTIL.toast('Tareas precargadas');
          render();
        })['catch'](function (err) {
          seedBtn.disabled = false;
          seedBtn.textContent = 'Precargar ' + DEFAULT_TASKS.length + ' tareas';
          window.UTIL.toast('Error: ' + err.message);
        });
      });
    }

    // Botones "Hecho"
    Array.prototype.forEach.call(document.querySelectorAll('.btn-done'), function (btn) {
      btn.addEventListener('click', function () {
        var taskId = parseInt(btn.getAttribute('data-task-id'), 10);
        var task = taskById[taskId];

        var saveDone = function (details) {
          btn.disabled = true;
          var payload = {
            aquarium_id:  aquariumId,
            task_id:      taskId,
            task:         task ? task.name : '(hecho desde catálogo)',
            performed_at: new Date().toISOString()
          };
          if (details && Object.keys(details).length > 0) payload.details = details;
          window.API.insertMaintenance(payload).then(function () {
            window.UTIL.toast('Marcado como hecho');
            render();
          })['catch'](function (err) {
            btn.disabled = false;
            window.UTIL.toast('Error: ' + err.message);
          });
        };

        if (task && hasPromptFields(task)) {
          showDoneModal(task, saveDone);
        } else {
          saveDone(null);
        }
      });
    });

    // Eliminar tarea
    Array.prototype.forEach.call(document.querySelectorAll('.btn-delete-task'), function (btn) {
      btn.addEventListener('click', function () {
        if (!confirm('¿Eliminar esta tarea del catálogo? La bitácora histórica se conserva.')) return;
        var taskId = parseInt(btn.getAttribute('data-task-id'), 10);
        window.API.deleteTask(taskId).then(function () {
          window.UTIL.toast('Tarea eliminada');
          render();
        })['catch'](function (err) {
          window.UTIL.toast('Error: ' + err.message);
        });
      });
    });

    // Añadir tarea
    var addForm = document.getElementById('form-add-task');
    if (addForm) {
      addForm.addEventListener('submit', function (e) {
        e.preventDefault();
        var data = window.UTIL.readForm(addForm);
        if (!data.name || !data.frequency_days) {
          window.UTIL.toast('Falta nombre o frecuencia');
          return;
        }
        window.API.insertTask({
          aquarium_id:    aquariumId,
          name:           data.name,
          frequency_days: data.frequency_days,
          active:         true
        }).then(function () {
          window.UTIL.toast('Tarea añadida');
          addForm.reset();
          render();
        })['catch'](function (err) {
          window.UTIL.toast('Error: ' + err.message);
        });
      });
    }

    // Bitácora libre
    var quickForm = document.getElementById('form-quick-log');
    if (quickForm) {
      quickForm.addEventListener('submit', function (e) {
        e.preventDefault();
        var data = window.UTIL.readForm(quickForm);
        if (!data.task) {
          window.UTIL.toast('Falta descripción');
          return;
        }
        window.API.insertMaintenance({
          aquarium_id:  aquariumId,
          task:         data.task,
          notes:        data.notes || null,
          performed_at: new Date().toISOString()
        }).then(function () {
          window.UTIL.toast('Entrada guardada');
          quickForm.reset();
          render();
        })['catch'](function (err) {
          window.UTIL.toast('Error: ' + err.message);
        });
      });
    }
  }

  // ----------------------------------------------------------
  // Helpers
  // ----------------------------------------------------------
  function computeStatus(lastDoneIso, frequencyDays) {
    if (!lastDoneIso) {
      return { level: 'pending', daysToNext: 0 };
    }
    var lastMs = new Date(lastDoneIso).getTime();
    var nowMs  = Date.now();
    var elapsedDays = (nowMs - lastMs) / (1000 * 60 * 60 * 24);
    var daysToNext  = frequencyDays - elapsedDays;
    var level;
    if (daysToNext < 0)             level = 'overdue';
    else if (daysToNext <= 1)       level = 'due-soon';
    else                            level = 'ok';
    return { level: level, daysToNext: daysToNext };
  }

  function freqLabel(days) {
    if (days === 1)        return '1 día';
    if (days < 7)          return days + ' días';
    if (days === 7)        return 'semana';
    if (days === 14)       return '2 semanas';
    if (days === 30)       return 'mes';
    if (days === 60)       return '2 meses';
    if (days === 90)       return '3 meses';
    if (days === 180)      return '6 meses';
    if (days === 365)      return 'año';
    return days + ' días';
  }

  function formatRelative(daysToNext) {
    if (daysToNext < 0) {
      var overdue = Math.ceil(-daysToNext);
      return 'Vencida hace ' + overdue + 'd';
    }
    if (daysToNext < 1) return 'Toca hoy';
    var d = Math.ceil(daysToNext);
    if (d === 1) return 'En 1 día';
    return 'En ' + d + ' días';
  }
})();
