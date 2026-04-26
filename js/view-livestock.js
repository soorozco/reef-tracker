// Vista: Inventario — peces, corales e invertebrados del acuario activo.

(function () {
  var KIND_OPTIONS = [
    { value: 'fish',         label: 'Pez' },
    { value: 'coral',        label: 'Coral' },
    { value: 'invertebrate', label: 'Invertebrado' },
    { value: 'other',        label: 'Otro' }
  ];
  var STATUS_OPTIONS = [
    { value: 'active', label: 'Activo' },
    { value: 'dead',   label: 'Muerto' },
    { value: 'sold',   label: 'Vendido' },
    { value: 'moved',  label: 'Movido' }
  ];
  var KIND_LABEL = {};
  KIND_OPTIONS.forEach(function (k) { KIND_LABEL[k.value] = k.label; });
  var STATUS_LABEL = {};
  STATUS_OPTIONS.forEach(function (s) { STATUS_LABEL[s.value] = s.label; });

  window.VIEW_LIVESTOCK = {
    init: function () {},
    refresh: function () { render(); }
  };

  function render() {
    var container = document.getElementById('view-livestock-content');
    var aquarium = window.STATE.getCurrentAquarium();
    if (!aquarium) {
      container.innerHTML = '<p class="muted">No hay acuario seleccionado.</p>';
      return;
    }

    container.innerHTML = '<div class="card"><h2>Cargando...</h2></div>';

    window.API.listLivestock(aquarium.id).then(function (items) {
      items = items || [];
      var actives  = items.filter(function (i) { return i.status === 'active'; });
      var inactive = items.filter(function (i) { return i.status !== 'active'; });

      var html = '';
      html += renderAddCard();
      html += renderListCard('Activos (' + actives.length + ')', actives, false);
      html += renderListCard('Histórico (' + inactive.length + ')', inactive, true);

      container.innerHTML = html;
      bindHandlers(aquarium.id);
    })['catch'](function (err) {
      container.innerHTML = '<div class="card"><p class="muted">Error: ' +
        window.UTIL.escapeHtml(err.message) + '</p></div>';
    });
  }

  function renderAddCard() {
    var kindOpts = KIND_OPTIONS.map(function (k) {
      return '<option value="' + k.value + '">' + k.label + '</option>';
    }).join('');
    var todayIso = todayLocalIso();

    return '<div class="card">' +
      '<h2>Añadir al inventario</h2>' +
      '<form id="form-add-livestock" autocomplete="off">' +
        '<div class="grid">' +
          '<label>Tipo<select name="kind" required>' + kindOpts + '</select></label>' +
          '<label>Fecha<input type="date" name="added_at" value="' + todayIso + '"></label>' +
        '</div>' +
        '<label class="full">Nombre común<input type="text" name="common_name" required placeholder="Ej: Tang amarillo"></label>' +
        '<label class="full">Nombre científico (opcional)<input type="text" name="scientific_name" placeholder="Ej: Zebrasoma flavescens"></label>' +
        '<label class="full">URL de la foto (opcional)<input type="url" name="photo_url" placeholder="https://..."></label>' +
        '<label class="full">Notas<textarea name="notes" rows="2" placeholder="Tamaño, comportamiento, alimentación, etc."></textarea></label>' +
        '<button type="submit">Añadir</button>' +
      '</form>' +
    '</div>';
  }

  function renderListCard(title, items, isHistory) {
    if (!items || items.length === 0) {
      return '<div class="card"><h2>' + window.UTIL.escapeHtml(title) + '</h2>' +
        '<p class="muted">' + (isHistory ? 'Sin movimientos todavía.' : 'Aún no añades nada al acuario.') + '</p>' +
      '</div>';
    }
    var rows = items.map(function (it) { return renderItem(it, isHistory); }).join('');
    return '<div class="card"><h2>' + window.UTIL.escapeHtml(title) + '</h2>' + rows + '</div>';
  }

  function renderItem(it, isHistory) {
    var photoHtml = it.photo_url
      ? '<div class="livestock-photo"><img src="' + window.UTIL.escapeHtml(it.photo_url) + '" alt="" loading="lazy"></div>'
      : '<div class="livestock-photo placeholder">' + kindIcon(it.kind) + '</div>';

    var meta = [
      KIND_LABEL[it.kind] || it.kind,
      'desde ' + formatDateOnly(it.added_at)
    ];
    if (it.removed_at) {
      meta.push((STATUS_LABEL[it.status] || it.status).toLowerCase() + ' ' + formatDateOnly(it.removed_at));
    }

    var actions = '<div class="livestock-actions">';
    if (!isHistory) {
      actions += '<select class="livestock-status-select" data-id="' + it.id + '">';
      STATUS_OPTIONS.forEach(function (s) {
        var sel = (s.value === it.status) ? ' selected' : '';
        actions += '<option value="' + s.value + '"' + sel + '>' + s.label + '</option>';
      });
      actions += '</select>';
    }
    actions += '<button class="btn-edit-livestock" data-id="' + it.id + '" type="button" title="Editar">✎</button>';
    actions += '<button class="btn-delete-livestock" data-id="' + it.id + '" type="button" title="Eliminar">×</button>';
    actions += '</div>';

    var sciHtml = it.scientific_name
      ? '<div class="livestock-sci">' + window.UTIL.escapeHtml(it.scientific_name) + '</div>'
      : '';

    var notesHtml = it.notes
      ? '<div class="livestock-notes">' + window.UTIL.escapeHtml(it.notes) + '</div>'
      : '';

    return '<div class="livestock-row">' +
      photoHtml +
      '<div class="livestock-info">' +
        '<div class="livestock-name">' + window.UTIL.escapeHtml(it.common_name) + '</div>' +
        sciHtml +
        '<div class="livestock-meta">' + meta.join(' · ') + '</div>' +
        notesHtml +
      '</div>' +
      actions +
    '</div>';
  }

  function bindHandlers(aquariumId) {
    var addForm = document.getElementById('form-add-livestock');
    if (addForm) {
      addForm.addEventListener('submit', function (e) {
        e.preventDefault();
        var data = window.UTIL.readForm(addForm);
        if (!data.common_name || !data.kind) {
          window.UTIL.toast('Falta tipo o nombre común');
          return;
        }
        var payload = {
          aquarium_id:     aquariumId,
          kind:            data.kind,
          common_name:     data.common_name,
          scientific_name: data.scientific_name || null,
          added_at:        data.added_at || todayLocalIso(),
          photo_url:       data.photo_url || null,
          notes:           data.notes || null,
          status:          'active'
        };
        window.API.insertLivestock(payload).then(function () {
          window.UTIL.toast('Añadido al inventario');
          addForm.reset();
          render();
        })['catch'](function (err) {
          window.UTIL.toast('Error: ' + err.message);
        });
      });
    }

    // Cambio de estado (activo / muerto / vendido / movido)
    Array.prototype.forEach.call(document.querySelectorAll('.livestock-status-select'), function (sel) {
      sel.addEventListener('change', function () {
        var id = parseInt(sel.getAttribute('data-id'), 10);
        var newStatus = sel.value;
        var patch = { status: newStatus };
        if (newStatus !== 'active') {
          patch.removed_at = todayLocalIso();
        } else {
          patch.removed_at = null;
        }
        window.API.updateLivestock(id, patch).then(function () {
          window.UTIL.toast('Estado actualizado');
          render();
        })['catch'](function (err) {
          window.UTIL.toast('Error: ' + err.message);
          render();
        });
      });
    });

    // Editar
    Array.prototype.forEach.call(document.querySelectorAll('.btn-edit-livestock'), function (btn) {
      btn.addEventListener('click', function () {
        var id = parseInt(btn.getAttribute('data-id'), 10);
        // Buscar el item actual desde la API (más simple que cachearlo)
        window.API.listLivestock(window.STATE.currentAquariumId).then(function (items) {
          var item = (items || []).filter(function (i) { return i.id === id; })[0];
          if (!item) return;
          openEditModal(item);
        });
      });
    });

    // Eliminar
    Array.prototype.forEach.call(document.querySelectorAll('.btn-delete-livestock'), function (btn) {
      btn.addEventListener('click', function () {
        if (!confirm('¿Eliminar permanentemente del inventario? Esto no se puede deshacer.')) return;
        var id = parseInt(btn.getAttribute('data-id'), 10);
        window.API.deleteLivestock(id).then(function () {
          window.UTIL.toast('Eliminado');
          render();
        })['catch'](function (err) {
          window.UTIL.toast('Error: ' + err.message);
        });
      });
    });
  }

  // ----------------------------------------------------------
  // Modal de edición
  // ----------------------------------------------------------
  function openEditModal(item) {
    var overlay = document.createElement('div');
    overlay.className = 'modal-overlay';

    var kindOpts = KIND_OPTIONS.map(function (k) {
      return '<option value="' + k.value + '"' + (item.kind === k.value ? ' selected' : '') + '>' + k.label + '</option>';
    }).join('');
    var statusOpts = STATUS_OPTIONS.map(function (s) {
      return '<option value="' + s.value + '"' + (item.status === s.value ? ' selected' : '') + '>' + s.label + '</option>';
    }).join('');

    overlay.innerHTML =
      '<div class="modal">' +
        '<h2>Editar — ' + window.UTIL.escapeHtml(item.common_name) + '</h2>' +
        '<form id="modal-edit-livestock" autocomplete="off">' +
          '<div class="grid">' +
            '<label>Tipo<select name="kind">' + kindOpts + '</select></label>' +
            '<label>Estado<select name="status">' + statusOpts + '</select></label>' +
          '</div>' +
          '<label class="full">Nombre común<input type="text" name="common_name" value="' + window.UTIL.escapeHtml(item.common_name || '') + '"></label>' +
          '<label class="full">Nombre científico<input type="text" name="scientific_name" value="' + window.UTIL.escapeHtml(item.scientific_name || '') + '"></label>' +
          '<div class="grid">' +
            '<label>Fecha entrada<input type="date" name="added_at" value="' + (item.added_at || '') + '"></label>' +
            '<label>Fecha salida<input type="date" name="removed_at" value="' + (item.removed_at || '') + '"></label>' +
          '</div>' +
          '<label class="full">URL de foto<input type="url" name="photo_url" value="' + window.UTIL.escapeHtml(item.photo_url || '') + '"></label>' +
          '<label class="full">Notas<textarea name="notes" rows="3">' + window.UTIL.escapeHtml(item.notes || '') + '</textarea></label>' +
          '<div class="modal-actions">' +
            '<button type="button" class="btn-secondary" id="modal-edit-cancel">Cancelar</button>' +
            '<button type="submit">Guardar</button>' +
          '</div>' +
          '<div class="modal-error" id="modal-edit-error"></div>' +
        '</form>' +
      '</div>';

    document.body.appendChild(overlay);

    overlay.querySelector('#modal-edit-cancel').addEventListener('click', function () {
      document.body.removeChild(overlay);
    });

    overlay.querySelector('#modal-edit-livestock').addEventListener('submit', function (e) {
      e.preventDefault();
      var data = window.UTIL.readForm(e.target);
      var patch = {
        kind:            data.kind,
        status:          data.status,
        common_name:     data.common_name,
        scientific_name: data.scientific_name || null,
        added_at:        data.added_at || null,
        removed_at:      data.removed_at || null,
        photo_url:       data.photo_url || null,
        notes:           data.notes || null
      };
      window.API.updateLivestock(item.id, patch).then(function () {
        document.body.removeChild(overlay);
        window.UTIL.toast('Actualizado');
        render();
      })['catch'](function (err) {
        overlay.querySelector('#modal-edit-error').textContent = 'Error: ' + err.message;
      });
    });
  }

  // ----------------------------------------------------------
  // Helpers
  // ----------------------------------------------------------
  function kindIcon(kind) {
    if (kind === 'fish')         return '🐠';
    if (kind === 'coral')        return '🪸';
    if (kind === 'invertebrate') return '🦐';
    return '·';
  }

  function todayLocalIso() {
    var d = new Date();
    var pad = function (n) { return n < 10 ? '0' + n : '' + n; };
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }

  function formatDateOnly(iso) {
    if (!iso) return '';
    try {
      var d = new Date(iso + 'T12:00:00');
      var pad = function (n) { return n < 10 ? '0' + n : '' + n; };
      return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
    } catch (e) { return iso; }
  }
})();
