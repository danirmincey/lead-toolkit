/* ==========================================================================
   App | Data Extractor: Culture Decision (Class 5 - Culture)
   Reads the Class 5 nightly survey (the "day 5" CSV with a culturedecision
   column: Assimilation / Separation / Integration) and draws the slide's
   bar chart: "n (x.x%)" over blue bars, category labels below, no axes.
   The extracted numbers land in an EDITABLE table first | tweak labels or
   counts and the chart follows. PNG + PowerPoint + pasteable text.
   Verified against the Cluster H slide: 2 (2.8%) / 16 (22.2%) / 54 (75.0%).
   ========================================================================== */

(function () {
  'use strict';

  /* ---------- pure logic (exported for tests) ---------- */

  var CANON = ['Assimilation', 'Separation', 'Integration'];

  // count a column's values; put the three canonical strategies first
  function cultureCounts(rows, ci) {
    var counts = new Map();
    rows.forEach(function (r) {
      var v = String(r[ci] === undefined || r[ci] === null ? '' : r[ci]).trim();
      if (!v || v === 'NA') return;
      counts.set(v, (counts.get(v) || 0) + 1);
    });
    var out = [];
    CANON.forEach(function (c) {
      var hit = null;
      counts.forEach(function (n, v) { if (v.toLowerCase() === c.toLowerCase()) hit = v; });
      if (hit !== null) { out.push([c, counts.get(hit)]); counts.delete(hit); }
    });
    var rest = [];
    counts.forEach(function (n, v) { rest.push([v, n]); });
    rest.sort(function (a, b) { return a[1] - b[1] || a[0].localeCompare(b[0]); });
    return out.concat(rest);
  }

  function findCultureColumn(headers, qtexts) {
    var i = headers.findIndex(function (h) { return /culture.*decision|^culturedecision$/i.test(String(h).trim()); });
    if (i !== -1) return i;
    return (qtexts || []).findIndex(function (q) { return /assimilation.*separation|separation.*integration/i.test(String(q)); });
  }

  function pctLabel(n, total) {
    return n + ' (' + (100 * n / total).toFixed(1).replace(/\.0$/, '') + '%)';
  }

  /* ---------- UI ---------- */

  function mount(container) {
    var state = {
      headers: [], rows: [], fileName: null, _sheets: null,
      filterCol: -1, includeValues: null,
      col: -1, override: null,
      barColor: '#4472C4', labelScale: 1, dims: '1600x1200'
    };

    container.innerHTML = '' +
      '<div class="app-title"><h2>🧮🧭 Data Extractor | Culture Decision</h2>' +
      '<span class="sub">Assimilation / Separation / Integration counts from the Class 5 nightly survey, drawn like the slide. Numbers are editable before you export.</span></div>' +
      '<div class="app-layout">' +
      '  <div class="sidebar">' +

      '    <details class="step" open>' +
      '      <summary><span class="n">1</span> Load data <span class="hint" id="cu-fhint"></span></summary>' +
      '      <div class="body">' +
      '        <div class="dropzone" id="cu-drop"><strong>DROP DATA HERE</strong><ul class="drop-spec"><li><b>Type of file:</b> CSV or Excel (.xlsx)</li><li><b>What you\'re looking for:</b> the Class 5 nightly survey with a culturedecision column (e.g. "cluster H day 5 survey.csv")</li></ul></div>' +
      '        <input type="file" id="cu-file" accept=".csv,.tsv,.txt,.xlsx,.xlsm,.xltx" style="display:none">' +
      '        <div id="cu-fileinfo"></div>' +
      '        <div class="row"><button id="cu-demo" class="fixed">🎲 Demo data</button></div>' +
      '        <label class="field" id="cu-sheetrow" style="display:none">Sheet<select id="cu-sheet"></select></label>' +
      '        <label class="field">Column<select id="cu-col"></select></label>' +
      '        <label class="field">Filter people <span class="sub">(e.g. your cluster)</span><select id="cu-filtercol"></select></label>' +
      '        <div id="cu-filtervals"></div>' +
      '      </div>' +
      '    </details>' +

      '    <details class="step disabled" open>' +
      '      <summary><span class="n">2</span> Numbers <span class="hint">(editable)</span></summary>' +
      '      <div class="body">' +
      '        <div id="cu-nums"></div>' +
      '        <div class="row"><button id="cu-addnum" class="fixed">＋ Add row</button>' +
      '        <button id="cu-renum" class="fixed">↺ Re-extract</button></div>' +
      '      </div>' +
      '    </details>' +

      '    <details class="step disabled">' +
      '      <summary><span class="n">3</span> Style</summary>' +
      '      <div class="body">' +
      '        <label class="field">Bar color<input type="color" id="cu-color" value="#4472C4"></label>' +
      '        <div class="slider-field"><div class="top">Label size <output id="cu-ls-o">1.0×</output></div>' +
      '          <input type="range" id="cu-ls" min="0.6" max="1.6" step="0.05" value="1"></div>' +
      '        <label class="field">Image size' +
      '          <select id="cu-dims"><option value="1600x1200" selected>1600 × 1200</option>' +
      '          <option value="2000x1200">2000 × 1200 (wide)</option><option value="1200x1400">1200 × 1400 (tall)</option></select></label>' +
      '      </div>' +
      '    </details>' +
      '  </div>' +

      '  <div class="preview-panel">' +
      '    <div class="preview-toolbar">' +
      '      <button id="cu-png" class="primary" disabled>⬇ PNG</button>' +
      '      <button id="cu-ppt" disabled>⬇ PowerPoint</button>' +
      '      <button id="cu-copy" disabled>📋 Copy text</button>' +
      '      <span class="status" id="cu-status"></span>' +
      '    </div>' +
      '    <div class="canvas-holder" style="background:#fff">' +
      '      <div class="empty-msg" id="cu-empty">output displayed HERE</div>' +
      '      <canvas id="cu-canvas" style="display:none"></canvas>' +
      '    </div>' +
      '  </div>' +
      '</div>';

    var $ = function (id) { return container.querySelector('#' + id); };
    var canvas = $('cu-canvas');
    var renderTimer = null;

    function escapeHtml(s) {
      return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    /* ---------- loading (same shape as the other extractors) ---------- */

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

    // drop Qualtrics question-text/ImportId rows (long in MOST cells)
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
            $('cu-sheet').innerHTML = sheets.map(function (s, i) {
              return '<option value="' + i + '">' + escapeHtml(s.name) + '</option>';
            }).join('');
            $('cu-sheetrow').style.display = sheets.length > 1 ? '' : 'none';
            useSheet(0);
          });
        }
        $('cu-sheetrow').style.display = 'none';
        loadRaw(parseCSVText(new TextDecoder(sniffEncoding(buf)).decode(buf)), file.name);
      }).catch(function (err) {
        $('cu-fileinfo').innerHTML = '<span class="file-warn">Could not read file: ' + (err.message || err) + '</span>';
      });
    }

    function useSheet(i) {
      var s = state._sheets[i];
      loadRaw(s.rows.map(function (r) {
        return r.map(function (c) { return c === null || c === undefined ? '' : String(c); });
      }), state.fileName + (state._sheets.length > 1 ? ' · ' + s.name : ''));
    }

    function loadRaw(raw, name) {
      if (raw.length < 2) { $('cu-fileinfo').innerHTML = '<span class="file-warn">No data rows.</span>'; return; }
      var sq = stripJunkRows(raw);
      state.headers = sq.headers.map(function (h, i) { return String(h || 'column ' + (i + 1)).trim(); });
      state.rows = sq.rows;
      state.fileName = name;
      state.filterCol = state.headers.findIndex(function (h) { return /cluster/i.test(h); });
      state.includeValues = null;
      state.override = null;
      state.col = findCultureColumn(state.headers, []);

      var opts = state.headers.map(function (h, i) { return '<option value="' + i + '">' + escapeHtml(h) + '</option>'; }).join('');
      $('cu-col').innerHTML = '<option value="-1">- pick a column -</option>' + opts;
      $('cu-col').value = String(state.col);
      $('cu-filtercol').innerHTML = '<option value="-1">- no filter -</option>' + opts;
      $('cu-filtercol').value = String(state.filterCol);
      buildFilterValues();

      $('cu-fileinfo').innerHTML = '<span class="file-info">✓ ' + escapeHtml(name) + ' · ' + state.rows.length + ' responses' +
        (sq.dropped ? ' · Qualtrics header rows removed' : '') + '</span>';
      $('cu-fhint').textContent = name;
      Array.prototype.forEach.call(container.querySelectorAll('details.step'), function (d) { d.classList.remove('disabled'); });
      scheduleRender();
    }

    function buildFilterValues() {
      var box = $('cu-filtervals');
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

    /* ---------- editable numbers ---------- */

    function currentData() {
      if (state.override) return state.override.filter(function (d) { return d[0] !== '' && isFinite(d[1]); });
      if (!state.rows.length || state.col < 0) return [];
      return cultureCounts(includedRows(), state.col);
    }

    function buildNums(data) {
      var box = $('cu-nums');
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
      Array.prototype.forEach.call($('cu-nums').querySelectorAll('.row'), function (row) {
        var ins = row.querySelectorAll('input');
        out.push([ins[0].value.trim(), parseFloat(ins[1].value)]);
      });
      return out;
    }

    /* ---------- chart (slide style: n (x.x%) over bars, no axes) ---------- */

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

    function render() {
      var data = currentData();
      if (!data.length) { $('cu-status').textContent = ''; return; }
      if (!state.override) buildNums(data);
      var total = data.reduce(function (s, d) { return s + d[1]; }, 0);

      var dm = state.dims.split('x');
      var W = parseInt(dm[0], 10), H = parseInt(dm[1], 10);
      canvas.width = W; canvas.height = H;
      canvas.style.display = '';
      $('cu-empty').style.display = 'none';
      var ctx = canvas.getContext('2d');
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, W, H);

      var fBody = 'Candara, "Gill Sans", Calibri, sans-serif';
      var labPx = Math.round(0.026 * H * state.labelScale);
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
        ctx.textBaseline = 'top';
        var lines = wrapText(ctx, d[0], slot * 0.95);
        lines.forEach(function (ln, li) {
          ctx.fillText(ln, mL + slot * i + slot / 2, mT + plotH + 0.02 * H + li * labPx * 1.2);
        });
      });

      $('cu-png').disabled = false;
      $('cu-ppt').disabled = false;
      $('cu-copy').disabled = false;
      $('cu-status').textContent = 'n = ' + total + ' · ' + data.length + ' categories · ' + W + '×' + H;
    }

    /* ---------- events ---------- */

    var drop = $('cu-drop'), fileInput = $('cu-file');
    drop.addEventListener('click', function () { fileInput.click(); });
    fileInput.addEventListener('change', function () { if (fileInput.files[0]) loadFile(fileInput.files[0]); });
    ['dragover', 'dragenter'].forEach(function (ev) {
      drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.add('drag'); });
    });
    ['dragleave', 'drop'].forEach(function (ev) {
      drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.remove('drag'); });
    });
    drop.addEventListener('drop', function (e) { if (e.dataTransfer.files[0]) loadFile(e.dataTransfer.files[0]); });

    $('cu-sheet').addEventListener('change', function (e) { useSheet(+e.target.value); });
    $('cu-col').addEventListener('change', function (e) {
      state.col = +e.target.value; state.override = null; scheduleRender();
    });
    $('cu-filtercol').addEventListener('change', function (e) {
      state.filterCol = +e.target.value; state.includeValues = null; state.override = null;
      buildFilterValues(); scheduleRender();
    });
    $('cu-addnum').addEventListener('click', function () {
      state.override = readNums();
      state.override.push(['New', 0]);
      buildNums(state.override);
      scheduleRender();
    });
    $('cu-renum').addEventListener('click', function () { state.override = null; scheduleRender(); });
    $('cu-color').addEventListener('input', function (e) { state.barColor = e.target.value; scheduleRender(); });
    $('cu-ls').addEventListener('input', function (e) {
      state.labelScale = parseFloat(e.target.value);
      $('cu-ls-o').textContent = state.labelScale.toFixed(2).replace(/0$/, '') + '×';
      scheduleRender();
    });
    $('cu-dims').addEventListener('change', function (e) { state.dims = e.target.value; scheduleRender(); });

    // demo answers matching the slide (2 / 16 / 54)
    $('cu-demo').addEventListener('click', function () {
      var raw = [['Cluster', 'uni', 'culturedecision']];
      var mix = [['Assimilation', 2], ['Separation', 16], ['Integration', 54]];
      var n = 0;
      mix.forEach(function (m) {
        for (var i = 0; i < m[1]; i++) raw.push(['Cluster H - Demo', 'demo' + (++n), m[0]]);
      });
      loadRaw(raw, 'demo data');
    });

    $('cu-png').addEventListener('click', function () {
      window.LeadToolkit.downloadCanvasPng(canvas, 'LEADTK_DEX-CUL_' + new Date().toISOString().slice(0, 10) + '.png');
    });
    $('cu-ppt').addEventListener('click', function () {
      window.LeadToolkit.downloadCanvasPptx(canvas, 'LEADTK_DEX-CUL_' + new Date().toISOString().slice(0, 10) + '.pptx');
    });
    $('cu-copy').addEventListener('click', function () {
      var data = currentData();
      var total = data.reduce(function (s, d) { return s + d[1]; }, 0);
      var txt = 'Culture decision (n = ' + total + ')\n' + data.map(function (d) {
        return d[0] + ': ' + pctLabel(d[1], total);
      }).join('\n');
      (navigator.clipboard ? navigator.clipboard.writeText(txt) : Promise.reject()).then(function () {
        $('cu-status').textContent = 'copied ✓';
      }, function () {
        window.prompt('Copy:', txt);
      });
    });
  }

  if (typeof window !== 'undefined' && window.LeadToolkit) {
    window.LeadToolkit.registerApp({
      id: 'culture',
      icon: '🧮🧭',
      group: 'Class 5 - Culture',
      name: 'Data Extractor | Culture Decision',
      code: 'DEX-CUL',
      intro: { upload: 'the Class 5 nightly survey (culturedecision column)', to: 'the Assimilation / Separation / Integration bar chart; numbers editable' },
      tags: ['culture decision', 'assimilation', 'separation', 'integration', 'bar chart', 'day 5', 'acculturation'],
      description: 'Counts the culturedecision answers from the Class 5 nightly survey and draws the slide\'s bar chart ("n (x.x%)" over blue bars). Extracted numbers are editable. PNG + PowerPoint.',
      mount: mount
    });
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { cultureCounts: cultureCounts, findCultureColumn: findCultureColumn, pctLabel: pctLabel };
  }
})();
