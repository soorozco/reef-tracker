// Vista: Mantenimiento — catálogo de tareas con frecuencia esperada,
// estado (vencida/por vencer/al día), botón "marcar hecho", y bitácora libre.

(function () {
  // Tareas estándar para precarga inicial
  var DEFAULT_TASKS = [
    { name: 'Cambiar calcetín / filter sock',          frequency_days: 4   },
    { name: 'Limpiar skimmer',                         frequency_days: 7   },
    { name: 'Limpiar cristales',                       frequency_days: 7   },
    { name: 'Cambio parcial de agua',                  frequency_days: 14  },
    { name: 'Recambio carbón activado',                frequency_days: 30  },
    { name: 'Recambio GFO',                            frequency_days: 30  },
    { name: 'Limpiar wavemakers / powerheads',         frequency_days: 30  },
    { name: 'Pruebas ICP',                             frequency_days: 60  },
    { name: 'Calibrar sondas (pH / salinidad)',        frequency_days: 90  },
    { name: 'Limpiar bombas de retorno',               frequency_days: 90  },
    { name: 'Cambiar membranas RODI',                  frequency_days: 365 }
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

      // Agrupar última fecha hecha por task_id
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
      bindHandlers(aquarium.id);
    })['catch'](function (err) {
      container.innerHTML = '<div class="card"><p class="muted">Error: ' +
        window.UTIL.escapeHtml(err.message) + '</p></div>';
    });
  }

  // ----------------------------------------------------------
  // Card: precarga de tareas (cuando el catálogo está vacío)
  // ----------------------------------------------------------
  function renderSeedCard() {
    var list = DEFAULT_TASKS.map(function (t) {
      return '<li>' + window.UTIL.escapeHtml(t.name) +
        ' <span class="muted small">(cada ' + freqLabel(t.frequency_days) + ')</span></li>';
    }).join('');
    return '<div class="card">' +
      '<h2>Precargar tareas estándar</h2>' +
      '<p class="muted">Tu catálogo de tareas está vacío. ¿Quieres precargar las tareas típicas de un reef?</p>' +
      '<ul class="seed-list">' + list + '</ul>' +
      '<button id="seed-btn" type="button">Precargar ' + DEFAULT_TASKS.length + ' tareas</button>' +
    '</div>';
  }

  // ----------------------------------------------------------
  // Card: lista de tareas con estado
  // ----------------------------------------------------------
  function renderTasksCard(tasks, lastDoneByTask, aquariumId) {
    var rows = tasks.map(function (t) {
      var lastDone = lastDoneByTask[t.id] || null;
      var status   = computeStatus(lastDone, t.frequency_days);
      var lastTxt  = lastDone ? window.UTIL.formatDate(lastDone) : 'Nunca';
      var nextTxt  = lastDone ? formatRelative(status.daysToNext) : 'Pendiente';

      return '<div class="task-row task-' + status.level + '" data-task-id="' + t.id + '">' +
        '<div class="task-info">' +
          '<div class="task-name">' + window.UTIL.escapeHtml(t.name) + '</div>' +
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
  // Card: bitácora libre (no asociada a tarea)
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
  // Card: bitácora reciente
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
      return '<div class="log-row">' +
        '<div class="log-row-top">' +
          '<span class="log-task">' + window.UTIL.escapeHtml(label || '(sin descripción)') + '</span>' +
          '<span class="log-date">' + window.UTIL.formatDate(e.performed_at) + '</span>' +
        '</div>' +
        (e.notes ? '<div class="log-notes">' + window.UTIL.escapeHtml(e.notes) + '</div>' : '') +
      '</div>';
    }).join('');

    return '<div class="card"><h2>Bitácora reciente</h2>' + rows + '</div>';
  }

  // ----------------------------------------------------------
  // Handlers
  // ----------------------------------------------------------
  function bindHandlers(aquariumId) {
    var seedBtn = document.getElementById('seed-btn');
    if (seedBtn) {
      seedBtn.addEventListener('click', function () {
        seedBtn.disabled = true;
        seedBtn.textContent = 'Cargando...';
        var rows = DEFAULT_TASKS.map(function (t) {
          return { aquarium_id: aquariumId, name: t.name, frequency_days: t.frequency_days, active: true };
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
        btn.disabled = true;
        window.API.insertMaintenance({
          aquarium_id: aquariumId,
          task_id:     taskId,
          task:        '(hecho desde catálogo)',
          performed_at: new Date().toISOString()
        }).then(function () {
          window.UTIL.toast('Marcado como hecho');
          render();
        })['catch'](function (err) {
          btn.disabled = false;
          window.UTIL.toast('Error: ' + err.message);
        });
      });
    });

    // Botones eliminar tarea
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

    // Form añadir tarea
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

    // Form bitácora libre
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
  // status.level: 'overdue', 'due-soon', 'ok', 'pending' (nunca hecha)
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
