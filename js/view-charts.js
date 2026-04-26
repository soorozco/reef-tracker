// Vista: Tendencias — gráficas de evolución temporal de cada parámetro.

(function () {
  var PARAMS = [
    { key: 'dkh',      label: 'Alcalinidad',  unit: 'dKH',   decimals: 2, targetField: 'target_dkh' },
    { key: 'ca',       label: 'Calcio',       unit: 'ppm',   decimals: 0, targetField: 'target_ca' },
    { key: 'mg',       label: 'Magnesio',     unit: 'ppm',   decimals: 0, targetField: 'target_mg' },
    { key: 'no3',      label: 'Nitratos',     unit: 'ppm',   decimals: 1, targetField: 'target_no3' },
    { key: 'po4',      label: 'Fosfatos',     unit: 'ppm',   decimals: 2, targetField: 'target_po4' },
    { key: 'salinity', label: 'Salinidad',    unit: 'sg',    decimals: 3, targetField: 'target_salinity' },
    { key: 'temp_c',   label: 'Temperatura',  unit: '°C',    decimals: 1, targetField: 'target_temp_c' },
    { key: 'ph',       label: 'pH',           unit: '',      decimals: 2, targetField: 'target_ph' }
  ];

  window.VIEW_CHARTS = {
    init: function () {},
    refresh: function () { render(); }
  };

  function render() {
    var container = document.getElementById('view-charts-content');
    var aquarium = window.STATE.getCurrentAquarium();
    if (!aquarium) {
      container.innerHTML = '<p class="muted">No hay acuario seleccionado.</p>';
      return;
    }

    container.innerHTML = '<div class="card"><h2>Cargando...</h2></div>';

    // Trae más lecturas que en otras vistas para tener una buena tendencia
    window.API.listParameters(aquarium.id, 100).then(function (rows) {
      // listParameters viene desc; las gráficas necesitan ascendente
      var asc = (rows || []).slice().reverse();

      if (asc.length === 0) {
        container.innerHTML = '<div class="card">' +
          '<h2>Tendencias</h2>' +
          '<p class="muted">Aún no hay lecturas registradas. Captura algunas en la pestaña <strong>Parámetros</strong> y vuelve aquí.</p>' +
        '</div>';
        return;
      }

      var html = '<div class="card">' +
        '<h2>Tendencias</h2>' +
        '<p class="muted small">Últimas ' + asc.length + ' lecturas. Línea punteada = target. Puntos naranjas = fuera del 5% del target.</p>' +
      '</div>';

      html += '<div class="charts-grid">';
      PARAMS.forEach(function (p) {
        html += renderChartCard(p, asc, aquarium);
      });
      html += '</div>';

      container.innerHTML = html;
    })['catch'](function (err) {
      container.innerHTML = '<div class="card"><p class="muted">Error: ' +
        window.UTIL.escapeHtml(err.message) + '</p></div>';
    });
  }

  function renderChartCard(param, rows, aquarium) {
    var data = rows
      .filter(function (r) { return r[param.key] !== null && r[param.key] !== undefined; })
      .map(function (r) {
        return { x: new Date(r.measured_at).getTime(), y: Number(r[param.key]) };
      });

    var target = aquarium[param.targetField];
    target = (target === null || target === undefined || target === '') ? null : Number(target);

    var lastValue = data.length > 0 ? data[data.length - 1].y : null;

    var headerRight = '';
    if (lastValue !== null) {
      var lastTxt = lastValue.toFixed(param.decimals) + (param.unit ? ' ' + param.unit : '');
      var status = '';
      if (target !== null && target !== 0) {
        var diff = Math.abs(lastValue - target) / Math.abs(target);
        if (diff > 0.05) status = ' chart-last-off';
      }
      headerRight = '<span class="chart-last' + status + '">' + window.UTIL.escapeHtml(lastTxt) + '</span>';
    }

    var unitText = param.unit ? ' (' + param.unit + ')' : '';

    return '<div class="chart-card">' +
      '<div class="chart-header">' +
        '<span class="chart-title">' + window.UTIL.escapeHtml(param.label) + window.UTIL.escapeHtml(unitText) + '</span>' +
        headerRight +
      '</div>' +
      window.CHART.renderLineChart({
        data: data,
        target: target,
        yDecimals: param.decimals,
        width: 340,
        height: 180
      }) +
      (data.length === 0
        ? '<div class="chart-no-data">Sin lecturas con este parámetro</div>'
        : '<div class="chart-meta muted small">' + data.length + ' lectura' + (data.length === 1 ? '' : 's') + '</div>') +
    '</div>';
  }
})();
