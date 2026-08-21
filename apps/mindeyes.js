/* ==========================================================================
   App | Mind the Eyes (Class 4 - Collective Intelligence)
   Reads the "Clusters Mind in Eyes" export (a Cluster column + one 0/1
   column per eyes item, e.g. Q2267 … Q2276) and draws the slide-style bar
   chart: "n (x.x%)" over blue bars, no axes.
   Two views: the score DISTRIBUTION for the ticked clusters (score = number
   of items correct per person) or CLUSTER AVERAGES side by side.
   Extracted numbers land in an editable table first. PNG + PowerPoint.
   ========================================================================== */

(function () {
  'use strict';

  /* ---------- pure logic (exported for tests) ---------- */

  // item columns hold 0/1 (plus blanks); a few stray text cells are fine,
  // because Qualtrics leaves question-text rows under the header
  function findItemColumns(headers, rows) {
    var out = [];
    headers.forEach(function (h, i) {
      if (/cluster/i.test(String(h))) return;
      var seen = 0, bad = 0;
      rows.forEach(function (r) {
        var v = String(r[i] === undefined || r[i] === null ? '' : r[i]).trim();
        if (v === '') return;
        if (v === '0' || v === '1') seen++;
        else bad++;
      });
      if (seen >= 3 && bad <= 3) out.push(i);
    });
    return out;
  }

  // keep only real respondent rows (at least one 0/1 in the item columns)
  function dataRows(rows, items) {
    return rows.filter(function (r) {
      return items.some(function (i) {
        var v = String(r[i] === undefined ? '' : r[i]).trim();
        return v === '0' || v === '1';
      });
    });
  }

  function scoreRow(row, items) {
    var s = 0;
    items.forEach(function (i) { if (String(row[i]).trim() === '1') s++; });
    return s;
  }

  // [[score, count], …] for every score 0..K (zeros kept inside the range)
  function scoreDistribution(rows, items) {
    var counts = {};
    rows.forEach(function (r) { var s = scoreRow(r, items); counts[s] = (counts[s] || 0) + 1; });
    var out = [];
    for (var s = 0; s <= items.length; s++) out.push([String(s), counts[s] || 0]);
    while (out.length && out[0][1] === 0) out.shift();
    while (out.length && out[out.length - 1][1] === 0) out.pop();
    return out;
  }

  // [[clusterValue, meanScore], …] sorted by cluster label
  function clusterMeans(rows, items, clusterCol) {
    var sums = new Map(), ns = new Map();
    rows.forEach(function (r) {
      var c = String(r[clusterCol] === undefined ? '' : r[clusterCol]).trim();
      if (!c) return;
      sums.set(c, (sums.get(c) || 0) + scoreRow(r, items));
      ns.set(c, (ns.get(c) || 0) + 1);
    });
    var out = [];
    sums.forEach(function (s, c) { out.push([c, s / ns.get(c)]); });
    out.sort(function (a, b) { return a[0].localeCompare(b[0], undefined, { numeric: true }); });
    return out;
  }

  function meanSd(xs) {
    if (!xs.length) return { mean: NaN, sd: NaN };
    var m = 0;
    xs.forEach(function (x) { m += x; });
    m /= xs.length;
    if (xs.length < 2) return { mean: m, sd: NaN };
    var v = 0;
    xs.forEach(function (x) { v += (x - m) * (x - m); });
    return { mean: m, sd: Math.sqrt(v / (xs.length - 1)) };
  }

  function pctLabel(n, total) {
    return n + ' (' + (100 * n / total).toFixed(1).replace(/\.0$/, '') + '%)';
  }

  /* ---------- UI ---------- */

  function mount(container) {
    var state = {
      headers: [], rows: [], items: [], fileName: null, _sheets: null,
      clusterCol: -1, includeValues: null,
      view: 'dist', override: null,
      barColor: '#4472C4', labelScale: 1, dims: '1600x1200'
    };

    container.innerHTML = '' +
      '<div class="app-title"><h2>📊👁️ Plot Generator | Mind the Eyes</h2>' +
      '<span class="sub">Eyes-test scores from the class export, drawn like the slide. Score distribution or cluster averages; numbers editable before export.</span></div>' +
      '<div class="app-layout">' +
      '  <div class="sidebar">' +

      '    <details class="step" open>' +
      '      <summary><span class="n">1</span> Load data <span class="hint" id="me-fhint"></span></summary>' +
      '      <div class="body">' +
      '        <div class="dropzone" id="me-drop"><strong>DROP DATA HERE</strong><ul class="drop-spec"><li><b>Type of file:</b> CSV or Excel (.xlsx)</li><li><b>What you\'re looking for:</b> the "Clusters Mind in Eyes" export: a Cluster column + one 0/1 column per eyes item</li></ul></div>' +
      '        <input type="file" id="me-file" accept=".csv,.tsv,.txt,.xlsx,.xlsm,.xltx" style="display:none">' +
      '        <div id="me-fileinfo"></div>' +
      '        <div class="row"><button id="me-demo" class="fixed">🎲 Demo data</button></div>' +
      '        <label class="field" id="me-sheetrow" style="display:none">Sheet<select id="me-sheet"></select></label>' +
      '        <label class="field">View' +
      '          <select id="me-view"><option value="dist" selected>Score distribution (ticked clusters)</option>' +
      '          <option value="clusters">Cluster averages</option></select></label>' +
      '        <div id="me-filtervals"></div>' +
      '      </div>' +
      '    </details>' +

      '    <details class="step disabled" open>' +
      '      <summary><span class="n">2</span> Numbers <span class="hint">(editable)</span></summary>' +
      '      <div class="body">' +
      '        <div id="me-nums"></div>' +
      '        <div class="row"><button id="me-addnum" class="fixed">＋ Add row</button>' +
      '        <button id="me-renum" class="fixed">↺ Re-extract</button></div>' +
      '      </div>' +
      '    </details>' +

      '    <details class="step disabled">' +
      '      <summary><span class="n">3</span> Style</summary>' +
      '      <div class="body">' +
      '        <label class="field">Bar color<input type="color" id="me-color" value="#4472C4"></label>' +
      '        <div class="slider-field"><div class="top">Label size <output id="me-ls-o">1.0×</output></div>' +
      '          <input type="range" id="me-ls" min="0.6" max="1.6" step="0.05" value="1"></div>' +
      '        <label class="field">Image size' +
      '          <select id="me-dims"><option value="1600x1200" selected>1600 × 1200</option>' +
      '          <option value="2000x1200">2000 × 1200 (wide)</option><option value="1200x1400">1200 × 1400 (tall)</option></select></label>' +
      '      </div>' +
      '    </details>' +
      '  </div>' +

      '  <div class="preview-panel">' +
      '    <div class="preview-toolbar">' +
      '      <button id="me-png" class="primary" disabled>⬇ PNG</button>' +
      '      <button id="me-ppt" disabled>⬇ PowerPoint</button>' +
      '      <button id="me-copy" disabled>📋 Copy text</button>' +
      '      <span class="status" id="me-status"></span>' +
      '    </div>' +
      '    <div class="canvas-holder" style="background:#fff">' +
      '      <div class="empty-msg" id="me-empty">output displayed HERE</div>' +
      '      <canvas id="me-canvas" style="display:none"></canvas>' +
      '    </div>' +
      '  </div>' +
      '</div>';

    var $ = function (id) { return container.querySelector('#' + id); };
    var canvas = $('me-canvas');
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

    function loadFile(file) {
      file.arrayBuffer().then(function (buf) {
        var bytes = new Uint8Array(buf);
        if (window.xlsxLite && window.xlsxLite.isZipFile(bytes)) {
          return window.parseXlsx(buf).then(function (sheets) {
            sheets = sheets.filter(function (s) { return s.rows.length; });
            if (!sheets.length) throw new Error('the workbook has no data');
            state._sheets = sheets; state.fileName = file.name;
            $('me-sheet').innerHTML = sheets.map(function (s, i) {
              return '<option value="' + i + '">' + escapeHtml(s.name) + '</option>';
            }).join('');
            $('me-sheetrow').style.display = sheets.length > 1 ? '' : 'none';
            useSheet(0);
          });
        }
        $('me-sheetrow').style.display = 'none';
        loadRaw(parseCSVText(new TextDecoder(sniffEncoding(buf)).decode(buf)), file.name);
      }).catch(function (err) {
        $('me-fileinfo').innerHTML = '<span class="file-warn">Could not read file: ' + (err.message || err) + '</span>';
      });
    }

    function useSheet(i) {
      var s = state._sheets[i];
      loadRaw(s.rows.map(function (r) {
        return r.map(function (c) { return c === null || c === undefined ? '' : String(c); });
      }), state.fileName + (state._sheets.length > 1 ? ' · ' + s.name : ''));
    }

    function loadRaw(raw, name) {
      if (raw.length < 2) { $('me-fileinfo').innerHTML = '<span class="file-warn">No data rows.</span>'; return; }
      var headers = raw[0].map(function (h, i) { return String(h || 'column ' + (i + 1)).trim(); });
      var body = raw.slice(1);
      var items = findItemColumns(headers, body);
      if (!items.length) {
        $('me-fileinfo').innerHTML = '<span class="file-warn">⚠ no 0/1 item columns found. Is this the Mind-in-Eyes export?</span>';
        return;
      }
      state.headers = headers;
      state.items = items;
      state.rows = dataRows(body, items);   // junk header rows fall out naturally
      state.fileName = name;
      state.clusterCol = headers.findIndex(function (h) { return /cluster/i.test(h); });
      state.includeValues = null;
      state.override = null;

      $('me-fileinfo').innerHTML = '<span class="file-info">✓ ' + escapeHtml(name) + ' · ' + state.rows.length +
        ' people · ' + items.length + ' items</span>';
      $('me-fhint').textContent = name;
      buildFilterValues();
      Array.prototype.forEach.call(container.querySelectorAll('details.step'), function (d) { d.classList.remove('disabled'); });
      scheduleRender();
    }

    function buildFilterValues() {
      var box = $('me-filtervals');
      box.innerHTML = '';
      if (state.clusterCol < 0 || !state.rows.length || state.view === 'clusters') return;
      var uniq = new Map();
      state.rows.forEach(function (r) {
        var v = String(r[state.clusterCol] === undefined ? '' : r[state.clusterCol]).trim();
        uniq.set(v, (uniq.get(v) || 0) + 1);
      });
      if (uniq.size > 40) { state.includeValues = null; return; }
      if (state.includeValues === null) state.includeValues = new Set(uniq.keys());
      var list = document.createElement('div');
      list.className = 'value-list';
      Array.from(uniq.keys()).sort(function (a, b) { return a.localeCompare(b, undefined, { numeric: true }); }).forEach(function (v) {
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
      if (state.clusterCol < 0 || state.includeValues === null || state.view === 'clusters') return state.rows;
      return state.rows.filter(function (r) {
        var v = String(r[state.clusterCol] === undefined ? '' : r[state.clusterCol]).trim();
        return state.includeValues.has(v);
      });
    }

    /* ---------- editable numbers ---------- */

    function currentData() {
      if (state.override) return state.override.filter(function (d) { return d[0] !== '' && isFinite(d[1]); });
      if (!state.rows.length) return [];
      if (state.view === 'clusters') {
        if (state.clusterCol < 0) return [];
        return clusterMeans(state.rows, state.items, state.clusterCol).map(function (d) {
          return [d[0], Math.round(d[1] * 100) / 100];
        });
      }
      return scoreDistribution(includedRows(), state.items);
    }

    function buildNums(data) {
      var box = $('me-nums');
      box.innerHTML = '';
      data.forEach(function (d, i) {
        var row = document.createElement('div');
        row.className = 'row';
        row.innerHTML = '<input type="text" value="' + escapeHtml(d[0]) + '" style="flex:2;min-width:0">' +
          '<input type="number" step="any" value="' + d[1] + '" style="flex:1;min-width:0">' +
          '<button class="fixed" data-del="' + i + '" title="remove">×</button>';
        box.appendChild(row);
      });
      Array.prototype.forEach.call(box.querySelectorAll('input'), function (inp) {
        inp.addEventListener('input', function () { state.override = readNums(); scheduleRender(); });
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
      Array.prototype.forEach.call($('me-nums').querySelectorAll('.row'), function (row) {
        var ins = row.querySelectorAll('input');
        out.push([ins[0].value.trim(), parseFloat(ins[1].value)]);
      });
      return out;
    }

    /* ---------- chart ---------- */

    function scheduleRender() {
      clearTimeout(renderTimer);
      renderTimer = setTimeout(render, 180);
    }

    function render() {
      var data = currentData();
      if (!data.length) { $('me-status').textContent = ''; return; }
      if (!state.override) buildNums(data);
      var isCounts = state.view === 'dist' || (state.override && state.view !== 'clusters');
      var total = data.reduce(function (s, d) { return s + d[1]; }, 0);

      var dm = state.dims.split('x');
      var W = parseInt(dm[0], 10), H = parseInt(dm[1], 10);
      canvas.width = W; canvas.height = H;
      canvas.style.display = '';
      $('me-empty').style.display = 'none';
      var ctx = canvas.getContext('2d');
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, W, H);

      var fBody = 'Candara, "Gill Sans", Calibri, sans-serif';
      var labPx = Math.round(0.026 * H * state.labelScale);
      var mL = 0.03 * W, mR = 0.03 * W, mT = 0.10 * H, mB = 0.16 * H;
      var plotW = W - mL - mR, plotH = H - mT - mB;
      var maxN = Math.max.apply(null, data.map(function (d) { return d[1]; }));
      var slot = plotW / data.length, barW = Math.min(slot * 0.72, 0.14 * W);

      data.forEach(function (d, i) {
        var h = maxN ? plotH * d[1] / maxN : 0;
        var x = mL + slot * i + (slot - barW) / 2;
        var y = mT + plotH - h;
        ctx.fillStyle = state.barColor;
        ctx.fillRect(x, y, barW, h);
        ctx.fillStyle = '#111';
        ctx.font = labPx + 'px ' + fBody;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        var lab = isCounts ? pctLabel(d[1], total) : String(Math.round(d[1] * 100) / 100);
        ctx.fillText(lab, x + barW / 2, y - 0.008 * H);
        ctx.textBaseline = 'top';
        ctx.fillText(d[0], mL + slot * i + slot / 2, mT + plotH + 0.02 * H);
      });

      $('me-png').disabled = false;
      $('me-ppt').disabled = false;
      $('me-copy').disabled = false;
      if (state.view === 'dist' && !state.override) {
        var ms = meanSd(includedRows().map(function (r) { return scoreRow(r, state.items); }));
        $('me-status').textContent = 'n = ' + total + ' · mean ' + ms.mean.toFixed(2) +
          (isFinite(ms.sd) ? ' (SD ' + ms.sd.toFixed(2) + ')' : '') + ' of ' + state.items.length;
      } else {
        $('me-status').textContent = (isCounts ? 'n = ' + total + ' · ' : '') + data.length + ' bars · ' + W + '×' + H;
      }
    }

    /* ---------- events ---------- */

    var drop = $('me-drop'), fileInput = $('me-file');
    drop.addEventListener('click', function () { fileInput.click(); });
    fileInput.addEventListener('change', function () { if (fileInput.files[0]) loadFile(fileInput.files[0]); });
    ['dragover', 'dragenter'].forEach(function (ev) {
      drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.add('drag'); });
    });
    ['dragleave', 'drop'].forEach(function (ev) {
      drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.remove('drag'); });
    });
    drop.addEventListener('drop', function (e) { if (e.dataTransfer.files[0]) loadFile(e.dataTransfer.files[0]); });

    $('me-sheet').addEventListener('change', function (e) { useSheet(+e.target.value); });
    $('me-view').addEventListener('change', function (e) {
      state.view = e.target.value; state.override = null;
      buildFilterValues(); scheduleRender();
    });
    $('me-addnum').addEventListener('click', function () {
      state.override = readNums();
      state.override.push(['New', 0]);
      buildNums(state.override);
      scheduleRender();
    });
    $('me-renum').addEventListener('click', function () { state.override = null; scheduleRender(); });
    $('me-color').addEventListener('input', function (e) { state.barColor = e.target.value; scheduleRender(); });
    $('me-ls').addEventListener('input', function (e) {
      state.labelScale = parseFloat(e.target.value);
      $('me-ls-o').textContent = state.labelScale.toFixed(2).replace(/0$/, '') + '×';
      scheduleRender();
    });
    $('me-dims').addEventListener('change', function (e) { state.dims = e.target.value; scheduleRender(); });

    // demo scores across two clusters (10 items, mean around 7)
    $('me-demo').addEventListener('click', function () {
      var head = ['Cluster'];
      for (var k = 1; k <= 10; k++) head.push('Q' + k);
      var raw = [head];
      for (var i = 0; i < 60; i++) {
        var target = 4 + ((i * 5) % 7);          // 4..10 correct
        var row = [i < 30 ? '7' : '8'];
        for (var j = 0; j < 10; j++) row.push(j < target ? '1' : '0');
        raw.push(row);
      }
      loadRaw(raw, 'demo data');
    });

    $('me-png').addEventListener('click', function () {
      window.LeadToolkit.downloadCanvasPng(canvas, 'LEADTK_PGN-MTE_' + new Date().toISOString().slice(0, 10) + '.png');
    });
    $('me-ppt').addEventListener('click', function () {
      window.LeadToolkit.downloadCanvasPptx(canvas, 'LEADTK_PGN-MTE_' + new Date().toISOString().slice(0, 10) + '.pptx');
    });
    $('me-copy').addEventListener('click', function () {
      var data = currentData();
      var total = data.reduce(function (s, d) { return s + d[1]; }, 0);
      var txt = 'Mind the Eyes (' + (state.view === 'clusters' ? 'cluster averages' : 'score distribution, n = ' + total) + ')\n' +
        data.map(function (d) {
          return d[0] + ': ' + (state.view === 'clusters' ? d[1] : pctLabel(d[1], total));
        }).join('\n');
      (navigator.clipboard ? navigator.clipboard.writeText(txt) : Promise.reject()).then(function () {
        $('me-status').textContent = 'copied ✓';
      }, function () {
        window.prompt('Copy:', txt);
      });
    });
  }

  if (typeof window !== 'undefined' && window.LeadToolkit) {
    window.LeadToolkit.registerApp({
      id: 'mindeyes',
      icon: '📊👁️',
      group: 'Class 4 - Collective Intelligence',
      name: 'Plot Generator | Mind the Eyes',
      code: 'PGN-MTE',
      appType: 'Plot Generator',
      intro: { upload: 'the "Clusters Mind in Eyes" export', to: 'score distribution or cluster averages, slide-style bars; numbers editable' },
      tags: ['eyes test', 'rmet', 'collective intelligence', 'bar chart', 'mind in eyes', 'theory of mind', 'scores'],
      description: 'Scores the Mind-in-Eyes export (0/1 item columns) and draws the slide-style bar chart: score distribution per cluster or cluster averages. Numbers editable. PNG + PowerPoint.',
      mount: mount
    });
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
      findItemColumns: findItemColumns, dataRows: dataRows, scoreRow: scoreRow,
      scoreDistribution: scoreDistribution, clusterMeans: clusterMeans, meanSd: meanSd, pctLabel: pctLabel
    };
  }
})();
