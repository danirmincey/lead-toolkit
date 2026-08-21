/* ==========================================================================
   App | Demographics: Charts (Class 4, also carded in Class 1)
   Gender / race bar charts like the slides ("n (x.x%)" above blue bars,
   wrapped labels, no axes) with a chart-type dropdown (Bar / Pie).
   Sources: the roster if it carries the columns, otherwise the separate
   demographics export ("Demo Data …" | Gender + race_ethnicity_1…7
   checkbox columns, which get combined automatically like the R script).
   Cluster filter included. PNG export, full-resolution preview.
   ========================================================================== */

(function () {
  'use strict';

  /* ---------- pure logic (exported for tests) ---------- */

  // combine one column OR a set of checkbox columns into value counts
  function countValues(rows, colIdxs) {
    var counts = new Map();
    rows.forEach(function (r) {
      colIdxs.forEach(function (ci) {
        var v = String(r[ci] === undefined || r[ci] === null ? '' : r[ci]).trim();
        if (!v || v === 'NA') return;
        counts.set(v, (counts.get(v) || 0) + 1);
      });
    });
    var out = [];
    counts.forEach(function (n, v) { out.push([v, n]); });
    out.sort(function (a, b) { return a[1] - b[1] || a[0].localeCompare(b[0]); });   // ascending, like the slides
    return out;
  }

  // find checkbox groups: base name + _1.._K (excluding _TEXT)
  function findCheckboxGroup(headers, baseRe) {
    var idx = [];
    headers.forEach(function (h, i) {
      var m = /^(.*)_(\d+)$/.exec(String(h).trim());
      if (m && baseRe.test(m[1]) && !/text$/i.test(m[1])) idx.push(i);
    });
    return idx;
  }

  function pctLabel(n, total) {
    return n + ' (' + (100 * n / total).toFixed(1).replace(/\.0$/, '') + '%)';
  }

  /* ---------- UI ---------- */

  function mount(container) {
    var state = {
      raw: [], headers: [], qtexts: [], rows: [], fileName: null, _sheets: null,
      filterCol: -1, includeValues: null,
      mode: 'single', cols: [],          // selected column indices
      chart: 'bar',
      override: null,               // user-edited numbers win over extraction
      barColor: '#4472C4', labelScale: 1,
      dims: '1600x1200'
    };

    container.innerHTML = '' +
      '<div class="app-title"><h2>📊🥧 Plot Generator | Bars and Pies</h2>' +
      '<span class="sub">Gender / race bar charts like the slides (or pies): counts and %s, wrapped labels, no axes. PNG and PowerPoint export.</span></div>' +
      '<div class="app-layout">' +
      '  <div class="sidebar">' +

      '    <details class="step" open>' +
      '      <summary><span class="n">1</span> Load data <span class="hint" id="ch-fhint"></span></summary>' +
      '      <div class="body">' +
      '        <div class="dropzone" id="ch-drop"><strong>DROP DATA HERE</strong><ul class="drop-spec"><li><b>Type of file:</b> CSV or Excel (.xlsx)</li><li><b>What you\'re looking for:</b> the "Demo Data" export (Gender + race_ethnicity_1…7) or a roster carrying those columns</li></ul></div>' +
      '        <input type="file" id="ch-file" accept=".csv,.tsv,.txt,.xlsx,.xlsm,.xltx" style="display:none">' +
      '        <div id="ch-fileinfo"></div>' +
      '        <div class="row"><button id="ch-demo" class="fixed">🎲 Demo data</button></div>' +
      '        <label class="field" id="ch-sheetrow" style="display:none">Sheet<select id="ch-sheet"></select></label>' +
      '        <label class="field">Filter people <span class="sub">(e.g. your cluster)</span><select id="ch-filtercol"></select></label>' +
      '        <div id="ch-filtervals"></div>' +
      '      </div>' +
      '    </details>' +

      '    <details class="step disabled" open>' +
      '      <summary><span class="n">2</span> What to chart</summary>' +
      '      <div class="body">' +
      '        <div class="row">' +
      '          <button id="ch-gender" class="fixed">🚻 Gender</button>' +
      '          <button id="ch-race" class="fixed">🌍 Race / Ethnicity</button>' +
      '        </div>' +
      '        <div class="small-note" id="ch-presetnote"></div>' +
      '        <label class="field">…or any single column<select id="ch-col"></select></label>' +
      '      </div>' +
      '    </details>' +

      '    <details class="step disabled">' +
      '      <summary><span class="n">3</span> Numbers <span class="hint">(editable)</span></summary>' +
      '      <div class="body">' +
      '        <div id="ch-nums"></div>' +
      '        <div class="row"><button id="ch-addnum" class="fixed">＋ Add row</button>' +
      '        <button id="ch-renum" class="fixed">↺ Re-extract</button></div>' +
      '      </div>' +
      '    </details>' +

      '    <details class="step disabled" open>' +
      '      <summary><span class="n">4</span> Style</summary>' +
      '      <div class="body">' +
      '        <div class="row">' +
      '          <label class="field">Chart type' +
      '            <select id="ch-chart"><option value="bar" selected>Bar chart (like the slides)</option><option value="pie">Pie chart</option></select></label>' +
      '          <label class="field">Color<input type="color" id="ch-color" value="#4472C4"></label>' +
      '        </div>' +
      '        <div class="slider-field"><div class="top">Label size <output id="ch-ls-o">1.0×</output></div>' +
      '          <input type="range" id="ch-ls" min="0.6" max="1.6" step="0.05" value="1"></div>' +
      '        <label class="field">Image size' +
      '          <select id="ch-dims"><option value="1600x1200" selected>1600 × 1200</option>' +
      '          <option value="2000x1200">2000 × 1200 (wide)</option><option value="1200x1400">1200 × 1400 (tall)</option></select></label>' +
      '      </div>' +
      '    </details>' +
      '  </div>' +

      '  <div class="preview-panel">' +
      '    <div class="preview-toolbar">' +
      '      <button id="ch-png" class="primary" disabled>⬇ PNG</button>' +
      '      <button id="ch-ppt" disabled>⬇ PowerPoint</button>' +
      '      <span class="status" id="ch-status"></span>' +
      '    </div>' +
      '    <div class="canvas-holder" style="background:#fff">' +
      '      <div class="empty-msg" id="ch-empty">output displayed HERE</div>' +
      '      <canvas id="ch-canvas" style="display:none"></canvas>' +
      '    </div>' +
      '  </div>' +
      '</div>';

    var $ = function (id) { return container.querySelector('#' + id); };
    var canvas = $('ch-canvas');
    var renderTimer = null;

    function escapeHtml(s) {
      return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    /* ---------- loading ---------- */

    function sniffEncoding(buf) {
      var b = new Uint8Array(buf.slice(0, 2));
      if (b[0] === 0xFF && b[1] === 0xFE) return 'utf-16le';
      if (b[0] === 0xFE && b[1] === 0xFF) return 'utf-16be';
      return 'utf-8';
    }

    function parseCSVText(text) {
      if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);
      var rows = [], row = [], field = '', i = 0, inQ = false;
      while (i < text.length) {
        var c = text[i];
        if (inQ) {
          if (c === '"') { if (text[i + 1] === '"') { field += '"'; i += 2; continue; } inQ = false; i++; continue; }
          field += c; i++; continue;
        }
        if (c === '"') { inQ = true; i++; continue; }
        if (c === ',') { row.push(field); field = ''; i++; continue; }
        if (c === '\r') { if (text[i + 1] === '\n') i++; row.push(field); rows.push(row); row = []; field = ''; i++; continue; }
        if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; i++; continue; }
        field += c; i++;
      }
      if (field !== '' || row.length) { row.push(field); rows.push(row); }
      return rows.filter(function (r) { return r.some(function (x) { return x !== ''; }); });
    }

    // drop Qualtrics question-text and ImportId rows sitting under the header
    // (question-text rows are long in MOST cells; data rows only in a few)
    function stripJunkRows(rows) {
      var out = rows.slice(1), dropped = 0;
      while (out.length && dropped < 2) {
        var cells = out[0].filter(function (c) { return String(c).trim(); });
        var longs = cells.filter(function (c) { return String(c).length > 40; }).length;
        if (out[0].join(' ').indexOf('"ImportId"') !== -1 ||
            (cells.length >= 3 && longs / cells.length > 0.5)) { out.shift(); dropped++; }
        else break;
      }
      return { headers: rows[0], rows: out, dropped: dropped };
    }

    function loadFile(file) {
      file.arrayBuffer().then(function (buf) {
        var bytes = new Uint8Array(buf);
        if (window.xlsxLite && window.xlsxLite.isZipFile(bytes)) {
          return window.parseXlsx(buf).then(function (sheets) {
            sheets = sheets.filter(function (s) { return s.rows.length; });
            if (!sheets.length) throw new Error('the workbook has no data');
            state._sheets = sheets; state.fileName = file.name;
            $('ch-sheet').innerHTML = sheets.map(function (s, i) {
              return '<option value="' + i + '">' + escapeHtml(s.name) + '</option>';
            }).join('');
            $('ch-sheetrow').style.display = sheets.length > 1 ? '' : 'none';
            useSheet(0);
          });
        }
        $('ch-sheetrow').style.display = 'none';
        loadRaw(parseCSVText(new TextDecoder(sniffEncoding(buf)).decode(buf)), file.name);
      }).catch(function (err) {
        $('ch-fileinfo').innerHTML = '<span class="file-warn">Could not read file: ' + (err.message || err) + '</span>';
      });
    }

    function useSheet(i) {
      var s = state._sheets[i];
      loadRaw(s.rows.map(function (r) {
        return r.map(function (c) { return c === null || c === undefined ? '' : String(c); });
      }), state.fileName + (state._sheets.length > 1 ? ' · ' + s.name : ''));
    }

    function loadRaw(raw, name) {
      if (raw.length < 2) { $('ch-fileinfo').innerHTML = '<span class="file-warn">No data rows.</span>'; return; }
      var sq = stripJunkRows(raw);
      state.headers = sq.headers.map(function (h, i) { return String(h || 'column ' + (i + 1)).trim(); });
      state.rows = sq.rows;
      state.fileName = name;
      state.filterCol = state.headers.findIndex(function (h) { return /cluster/i.test(h); });
      state.includeValues = null;

      var opts = state.headers.map(function (h, i) { return '<option value="' + i + '">' + escapeHtml(h) + '</option>'; }).join('');
      $('ch-col').innerHTML = '<option value="-1">- pick a column -</option>' + opts;
      $('ch-filtercol').innerHTML = '<option value="-1">- no filter -</option>' + opts;
      $('ch-filtercol').value = String(state.filterCol);
      buildFilterValues();

      $('ch-fileinfo').innerHTML = '<span class="file-info">✓ ' + escapeHtml(name) + ' · ' + state.rows.length + ' responses' +
        (sq.dropped ? ' · Qualtrics header rows removed' : '') + '</span>';
      $('ch-fhint').textContent = name;
      Array.prototype.forEach.call(container.querySelectorAll('details.step'), function (d) { d.classList.remove('disabled'); });
      tryPreset('gender', true);
    }

    function buildFilterValues() {
      var box = $('ch-filtervals');
      box.innerHTML = '';
      if (state.filterCol < 0 || !state.rows.length) return;
      var uniq = new Map();
      state.rows.forEach(function (r) {
        var v = String(r[state.filterCol] === undefined ? '' : r[state.filterCol]).trim();
        uniq.set(v, (uniq.get(v) || 0) + 1);
      });
      if (uniq.size > 40) { state.includeValues = null; return; }
      if (state.includeValues === null) state.includeValues = new Set(uniq.keys());
      var list = document.createElement('div');
      list.className = 'value-list';
      Array.from(uniq.keys()).sort().forEach(function (v) {
        var lab = document.createElement('label');
        var on = state.includeValues.has(v);
        lab.className = on ? 'on' : '';
        lab.innerHTML = '<input type="checkbox" ' + (on ? 'checked' : '') + '> ' +
          (v === '' ? '(blank)' : escapeHtml(v)) + ' <span class="cnt">' + uniq.get(v) + '</span>';
        lab.querySelector('input').addEventListener('change', function (e) {
          if (e.target.checked) state.includeValues.add(v); else state.includeValues.delete(v);
          lab.className = e.target.checked ? 'on' : '';
          state.override = null;
          scheduleRender();
        });
        list.appendChild(lab);
      });
      box.appendChild(list);
    }

    function includedRows() {
      if (state.filterCol < 0 || state.includeValues === null) return state.rows;
      return state.rows.filter(function (r) {
        var v = String(r[state.filterCol] === undefined ? '' : r[state.filterCol]).trim();
        return state.includeValues.has(v);
      });
    }

    /* ---------- presets ---------- */

    function tryPreset(which, silent) {
      if (!state.headers.length) return;
      state.override = null;
      if (which === 'gender') {
        var gi = state.headers.findIndex(function (h) { return /^gender$/i.test(h.trim()) || (/gender/i.test(h) && !/text/i.test(h)); });
        if (gi === -1) { if (!silent) $('ch-presetnote').textContent = '⚠ no Gender column here (this file may be the roster; try the demographics export).'; return; }
        state.cols = [gi];
        $('ch-presetnote').textContent = '✓ Gender → ' + state.headers[gi];
      } else {
        var idx = findCheckboxGroup(state.headers, /race|ethnic/i);
        if (!idx.length) {
          var single = state.headers.findIndex(function (h) { return /race|ethnic/i.test(h) && !/text/i.test(h); });
          if (single === -1) { if (!silent) $('ch-presetnote').textContent = '⚠ no race/ethnicity columns here; try the demographics export.'; return; }
          idx = [single];
        }
        state.cols = idx;
        $('ch-presetnote').textContent = '✓ Race/Ethnicity → ' + idx.length + ' column(s) combined';
      }
      scheduleRender();
    }

    /* ---------- chart ---------- */

    function scheduleRender() {
      clearTimeout(renderTimer);
      renderTimer = setTimeout(render, 180);
    }

    function wrapText(ctx, text, maxW) {
      var words = String(text).split(/[\s/]+/), lines = [], cur = '';
      words.forEach(function (w) {
        var t = cur ? cur + ' ' + w : w;
        if (ctx.measureText(t).width <= maxW) cur = t;
        else { if (cur) lines.push(cur); cur = w; }
      });
      if (cur) lines.push(cur);
      return lines;
    }

    function currentData() {
      if (state.override) return state.override.filter(function (d) { return d[0] !== '' && isFinite(d[1]); });
      if (!state.rows.length || !state.cols.length) return [];
      return countValues(includedRows(), state.cols);
    }

    function buildNums(data) {
      var box = $('ch-nums');
      box.innerHTML = '';
      data.forEach(function (d, i) {
        var row = document.createElement('div');
        row.className = 'row';
        row.innerHTML = '<input type="text" data-i="' + i + '" data-k="0" value="' + escapeHtml(d[0]) + '" style="flex:2;min-width:0">' +
          '<input type="number" step="any" data-i="' + i + '" data-k="1" value="' + d[1] + '" style="flex:1;min-width:0">' +
          '<button class="fixed" data-del="' + i + '" title="remove">×</button>';
        box.appendChild(row);
      });
      Array.prototype.forEach.call(box.querySelectorAll('input'), function (inp) {
        inp.addEventListener('input', function () {
          state.override = readNums();
          scheduleRender();
        });
      });
      Array.prototype.forEach.call(box.querySelectorAll('button[data-del]'), function (btn) {
        btn.addEventListener('click', function () {
          state.override = readNums();
          state.override.splice(+btn.getAttribute('data-del'), 1);
          buildNums(state.override);
          scheduleRender();
        });
      });
    }

    function readNums() {
      var out = [];
      Array.prototype.forEach.call($('ch-nums').querySelectorAll('.row'), function (row) {
        var ins = row.querySelectorAll('input');
        out.push([ins[0].value.trim(), parseFloat(ins[1].value)]);
      });
      return out;
    }

    function render() {
      var data = currentData();
      if (!data.length) { $('ch-status').textContent = ''; return; }
      if (!state.override) buildNums(data);
      var total = data.reduce(function (s, d) { return s + d[1]; }, 0);

      var dm = state.dims.split('x');
      var W = parseInt(dm[0], 10), H = parseInt(dm[1], 10);
      canvas.width = W; canvas.height = H;
      canvas.style.display = '';
      $('ch-empty').style.display = 'none';
      var ctx = canvas.getContext('2d');
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, W, H);

      var fBody = 'Candara, "Gill Sans", Calibri, sans-serif';
      var labPx = Math.round(0.026 * H * state.labelScale);

      if (state.chart === 'bar') {
        var mL = 0.03 * W, mR = 0.03 * W, mT = 0.10 * H, mB = 0.24 * H;
        var plotW = W - mL - mR, plotH = H - mT - mB;
        var maxN = Math.max.apply(null, data.map(function (d) { return d[1]; }));
        var slot = plotW / data.length, barW = slot * 0.72;

        data.forEach(function (d, i) {
          var h = plotH * d[1] / maxN;
          var x = mL + slot * i + (slot - barW) / 2;
          var y = mT + plotH - h;
          ctx.fillStyle = state.barColor;
          ctx.fillRect(x, y, barW, h);
          ctx.fillStyle = '#111';
          ctx.font = labPx + 'px ' + fBody;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'bottom';
          ctx.fillText(pctLabel(d[1], total), x + barW / 2, y - 0.008 * H);
          // wrapped category label
          ctx.textBaseline = 'top';
          var lines = wrapText(ctx, d[0], slot * 0.95);
          lines.forEach(function (ln, li) {
            ctx.fillText(ln, mL + slot * i + slot / 2, mT + plotH + 0.02 * H + li * labPx * 1.2);
          });
        });
      } else {
        // pie
        var cx = W * 0.35, cy = H * 0.50, R = Math.min(W, H) * 0.34;
        var start = -Math.PI / 2;
        var ramp = ['#1F3864', '#2E74B5', '#4472C4', '#6B9BD2', '#9DC3E6', '#C5D9F1', '#8496B0', '#44546A'];
        var sorted = data.slice().sort(function (a, b) { return b[1] - a[1]; });
        sorted.forEach(function (d, i) {
          var ang = 2 * Math.PI * d[1] / total;
          ctx.beginPath();
          ctx.moveTo(cx, cy);
          ctx.arc(cx, cy, R, start, start + ang);
          ctx.closePath();
          ctx.fillStyle = ramp[i % ramp.length];
          ctx.fill();
          ctx.strokeStyle = '#FFFFFF';
          ctx.lineWidth = Math.max(2, 0.004 * W);
          ctx.stroke();
          start += ang;
        });
        // legend
        ctx.font = labPx + 'px ' + fBody;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        var ly = cy - (sorted.length - 1) * labPx * 0.9;
        sorted.forEach(function (d, i) {
          var y = ly + i * labPx * 1.8;
          ctx.fillStyle = ramp[i % ramp.length];
          ctx.fillRect(W * 0.66, y - labPx * 0.5, labPx, labPx);
          ctx.fillStyle = '#111';
          ctx.fillText(d[0] + '  ' + pctLabel(d[1], total), W * 0.66 + labPx * 1.4, y);
        });
      }

      $('ch-png').disabled = false;
      $('ch-ppt').disabled = false;
      $('ch-status').textContent = 'n = ' + total + ' · ' + data.length + ' categories · ' + W + '×' + H;
    }

    /* ---------- events ---------- */

    var drop = $('ch-drop'), fileInput = $('ch-file');
    drop.addEventListener('click', function () { fileInput.click(); });
    fileInput.addEventListener('change', function () { if (fileInput.files[0]) loadFile(fileInput.files[0]); });
    ['dragover', 'dragenter'].forEach(function (ev) {
      drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.add('drag'); });
    });
    ['dragleave', 'drop'].forEach(function (ev) {
      drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.remove('drag'); });
    });
    drop.addEventListener('drop', function (e) { if (e.dataTransfer.files[0]) loadFile(e.dataTransfer.files[0]); });

    $('ch-sheet').addEventListener('change', function (e) { useSheet(+e.target.value); });
    $('ch-filtercol').addEventListener('change', function (e) {
      state.filterCol = +e.target.value; state.includeValues = null; state.override = null; buildFilterValues(); scheduleRender();
    });
    $('ch-gender').addEventListener('click', function () { tryPreset('gender', false); });
    $('ch-race').addEventListener('click', function () { tryPreset('race', false); });
    $('ch-col').addEventListener('change', function (e) {
      var v = +e.target.value;
      if (v >= 0) { state.cols = [v]; state.override = null; $('ch-presetnote').textContent = ''; scheduleRender(); }
    });
    $('ch-addnum').addEventListener('click', function () {
      state.override = readNums();
      state.override.push(['New', 0]);
      buildNums(state.override);
      scheduleRender();
    });
    $('ch-renum').addEventListener('click', function () {
      state.override = null;
      scheduleRender();
    });
    $('ch-chart').addEventListener('change', function (e) { state.chart = e.target.value; scheduleRender(); });
    $('ch-color').addEventListener('input', function (e) { state.barColor = e.target.value; scheduleRender(); });
    $('ch-ls').addEventListener('input', function (e) {
      state.labelScale = parseFloat(e.target.value);
      $('ch-ls-o').textContent = state.labelScale.toFixed(2).replace(/0$/, '') + '×';
      scheduleRender();
    });
    $('ch-dims').addEventListener('change', function (e) { state.dims = e.target.value; scheduleRender(); });

    // deterministic demo roster (counts land close to the real slides)
    $('ch-demo').addEventListener('click', function () {
      var RACES = ['Black or African American', 'East Asian', 'Hispanic or Latino/a',
        'Middle Eastern or North African', 'South or Southeast Asian', 'White', 'Other'];
      var raceN = [2, 5, 7, 2, 30, 32, 2];
      var genderN = [['Woman', 40], ['Man', 39], ['Non-binary', 1]];
      var head = ['Cluster', 'Gender'];
      for (var k = 1; k <= 7; k++) head.push('race_ethnicity_' + k);
      var genders = [], races = [];
      genderN.forEach(function (g) { for (var i = 0; i < g[1]; i++) genders.push(g[0]); });
      raceN.forEach(function (n, ri) { for (var j = 0; j < n; j++) races.push(ri); });
      var raw = [head];
      for (var p = 0; p < genders.length; p++) {
        var row = ['Cluster H - Demo', genders[p], '', '', '', '', '', '', ''];
        row[2 + races[p]] = RACES[races[p]];
        raw.push(row);
      }
      loadRaw(raw, 'demo data');
    });

    $('ch-png').addEventListener('click', function () {
      window.LeadToolkit.downloadCanvasPng(canvas, 'LEADTK_PGN-BAP_' + new Date().toISOString().slice(0, 10) + '.png');
    });
    $('ch-ppt').addEventListener('click', function () {
      window.LeadToolkit.downloadCanvasPptx(canvas, 'LEADTK_PGN-BAP_' + new Date().toISOString().slice(0, 10) + '.pptx');
    });
  }

  if (typeof window !== 'undefined' && window.LeadToolkit) {
    window.LeadToolkit.registerApp({
      id: 'charts',
      icon: '📊🥧',
      group: 'Class 4 - Collective Intelligence',
      name: 'Plot Generator | Bars and Pies',
      code: 'PGN-BAP',
      intro: { upload: 'the "Demo Data" export (or a roster with those columns)', to: 'gender / race bar or pie charts like the slides; numbers editable' },
      tags: ['gender', 'race', 'ethnicity', 'bar chart', 'pie', 'demographics', 'demo data', 'checkbox'],
      description: 'Gender and race/ethnicity charts like the slides: "n (x.x%)" over blue bars (or a pie), wrapped labels, no axes. Reads the roster or the separate demographics export.',
      mount: mount
    });
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { countValues: countValues, findCheckboxGroup: findCheckboxGroup, pctLabel: pctLabel };
  }
})();
