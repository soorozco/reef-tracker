// Gráficas de línea simples generadas con SVG vanilla.
// Compatible con Safari 9 — sin librerías, sin Canvas, sin templates literales raros.

(function () {
  // options:
  //   data:    [{ x: timestamp_ms, y: number }]
  //   target:  number (línea horizontal punteada) | null
  //   width:   number (default 320)
  //   height:  number (default 180)
  //   yLabel:  string (unidad)
  //   yDecimals: int (default 1)
  //   tolerance: number 0..1 (default 0.05) — colorea naranja si |valor-target|/target > tolerance
  //
  // Devuelve un string con el SVG.
  function renderLineChart(options) {
    var data    = options.data || [];
    var width   = options.width  || 320;
    var height  = options.height || 180;
    var target  = (options.target === null || options.target === undefined) ? null : Number(options.target);
    var yLabel  = options.yLabel || '';
    var yDecimals = (options.yDecimals === undefined) ? 1 : options.yDecimals;
    var tolerance = (options.tolerance === undefined) ? 0.05 : options.tolerance;

    // Padding interior del SVG
    var padL = 42, padR = 12, padT = 12, padB = 28;
    var plotW = width - padL - padR;
    var plotH = height - padT - padB;

    if (data.length === 0) {
      return '<svg width="' + width + '" height="' + height + '" class="chart-svg">' +
        '<text x="' + (width/2) + '" y="' + (height/2) + '" text-anchor="middle" class="chart-empty">Sin datos</text>' +
      '</svg>';
    }

    // Calcular dominios
    var xs = data.map(function (d) { return d.x; });
    var ys = data.map(function (d) { return d.y; });
    var xMin = Math.min.apply(null, xs);
    var xMax = Math.max.apply(null, xs);
    var yMin = Math.min.apply(null, ys);
    var yMax = Math.max.apply(null, ys);

    if (target !== null) {
      yMin = Math.min(yMin, target);
      yMax = Math.max(yMax, target);
    }

    // Margen vertical: 10% del rango, mínimo no-cero
    var yRange = yMax - yMin;
    if (yRange === 0) {
      var pad = Math.max(Math.abs(yMin) * 0.1, 1);
      yMin -= pad; yMax += pad;
    } else {
      yMin -= yRange * 0.10;
      yMax += yRange * 0.10;
    }

    // Si solo hay 1 punto, dar margen X artificial
    var xRange = xMax - xMin;
    if (xRange === 0) {
      xMin -= 86400000; xMax += 86400000; // ±1 día
    }

    function xPos(v) { return padL + ((v - xMin) / (xMax - xMin)) * plotW; }
    function yPos(v) { return padT + plotH - ((v - yMin) / (yMax - yMin)) * plotH; }

    var svg = '<svg viewBox="0 0 ' + width + ' ' + height + '" preserveAspectRatio="xMidYMid meet" class="chart-svg">';

    // Líneas de cuadrícula horizontales (3) + labels Y
    var gridSteps = 3;
    for (var i = 0; i <= gridSteps; i++) {
      var v = yMin + (yMax - yMin) * (i / gridSteps);
      var y = yPos(v);
      svg += '<line x1="' + padL + '" y1="' + y + '" x2="' + (width - padR) + '" y2="' + y + '" class="chart-grid"/>';
      svg += '<text x="' + (padL - 6) + '" y="' + (y + 3) + '" text-anchor="end" class="chart-axis-label">' +
             v.toFixed(yDecimals) + '</text>';
    }

    // Línea de target (punteada)
    if (target !== null) {
      var ty = yPos(target);
      svg += '<line x1="' + padL + '" y1="' + ty + '" x2="' + (width - padR) + '" y2="' + ty + '" class="chart-target"/>';
      svg += '<text x="' + (width - padR - 4) + '" y="' + (ty - 4) + '" text-anchor="end" class="chart-target-label">target ' +
             target.toFixed(yDecimals) + '</text>';
    }

    // Línea conectando puntos
    if (data.length >= 2) {
      var points = data.map(function (d) { return xPos(d.x) + ',' + yPos(d.y); }).join(' ');
      svg += '<polyline points="' + points + '" class="chart-line"/>';
    }

    // Puntos
    data.forEach(function (d) {
      var x = xPos(d.x);
      var y = yPos(d.y);
      var offTarget = false;
      if (target !== null && target !== 0) {
        offTarget = Math.abs(d.y - target) / Math.abs(target) > tolerance;
      }
      svg += '<circle cx="' + x + '" cy="' + y + '" r="3" class="chart-point' +
             (offTarget ? ' chart-point-off' : '') + '"/>';
    });

    // Eje X: fechas (primer y último, y uno intermedio si hay >=3 puntos)
    var xAxisDates = [];
    if (data.length === 1) {
      xAxisDates.push(data[0].x);
    } else {
      xAxisDates.push(data[0].x);
      if (data.length >= 3) xAxisDates.push(data[Math.floor(data.length / 2)].x);
      xAxisDates.push(data[data.length - 1].x);
    }
    xAxisDates.forEach(function (ts) {
      var d = new Date(ts);
      var label = (d.getMonth() + 1) + '/' + d.getDate();
      svg += '<text x="' + xPos(ts) + '" y="' + (height - 8) + '" text-anchor="middle" class="chart-axis-label">' +
             label + '</text>';
    });

    // Y label (abajo izquierda)
    if (yLabel) {
      svg += '<text x="' + 4 + '" y="' + (padT + 8) + '" class="chart-y-label">' + yLabel + '</text>';
    }

    svg += '</svg>';
    return svg;
  }

  window.CHART = { renderLineChart: renderLineChart };
})();
