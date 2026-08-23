/* ==========================================================================
   App | Diversity in Self Esteem (Class 3)
   Likert bar chart matching the class slide: blue count bars over labeled
   scale anchors ("Strongly Disagree (1)" … "Strongly Agree (7)"), optional
   red mean-arrow with "Mean = 5.21 (SD = 1.15)" text. NO title inside the
   plot (the slide template provides it). Verified against Fall 2025 data:
   bars 0/1/8/7/14/25/7 and mean 5.21 reproduce the slide exactly.
   Fonts follow the house style (font picker in Style, Candara default);
   the mean text stays bold blue. Extracted counts land in an editable
   Numbers table first. Everything is local; PNG export at full resolution.
   ========================================================================== */

(function () {
  'use strict';

  /* ---------- pure logic (exported for tests) ---------- */

  var DEFAULT_ANCHORS = ['Strongly Disagree', 'Disagree', 'Somewhat Disagree',
    'Neither Agree nor Disagree', 'Somewhat Agree', 'Agree', 'Strongly Agree'];

  function mean(xs) { var s = 0; xs.forEach(function (x) { s += x; }); return xs.length ? s / xs.length : NaN; }
  function sdSample(xs) {
    if (xs.length < 2) return NaN;
    var m = mean(xs), s = 0;
    xs.forEach(function (x) { s += (x - m) * (x - m); });
    return Math.sqrt(s / (xs.length - 1));
  }

  /* count responses onto a 1..K scale; accepts numbers OR anchor-label text */
  function countScale(values, K, anchors) {
    var counts = new Array(K).fill(0), nums = [], skipped = 0;
    var labelMap = {};
    (anchors || []).forEach(function (a, i) { labelMap[String(a).trim().toLowerCase()] = i + 1; });
    values.forEach(function (v) {
      var s = String(v === null || v === undefined ? '' : v).trim();
      if (!s || s === 'NA') return;
      var n = parseFloat(s);
      if (!isFinite(n)) {
        var mapped = labelMap[s.toLowerCase()];
        if (mapped) n = mapped; else { skipped++; return; }
      }
      n = Math.round(n);
      if (n >= 1 && n <= K) { counts[n - 1]++; nums.push(n); }
      else skipped++;
    });
    return { counts: counts, nums: nums, skipped: skipped };
  }

  /* ---------- UI ---------- */

  function mount(container) {
    var state = {
      raw: [], headers: [], qtexts: [], rows: [], fileName: null, _sheets: null, headerRow: 0,
      filterCol: -1, includeValues: null,
      col: -1, K: 7,
      anchors: DEFAULT_ANCHORS.slice(),
      override: null,               // user-edited numbers win over extraction
      barColor: '#4472C4', showMean: true, meanColor: '#C00000', textBlue: '#2E74B5',
      showCounts: false, yMax: 0,   // 0 = auto
      dims: '2000x1100',
      fontFamily: 'Candara'
    };

    container.innerHTML = '' +
      '<div class="app-title"><h2>📊🪞 Plot Generator | Self Esteem</h2>' +
      '<span class="sub">Likert bar chart like the slide: counts per scale point, optional mean arrow. No title baked into the image.</span></div>' +
      '<div class="app-layout">' +
      '  <div class="sidebar">' +

      '    <details class="step" open>' +
      '      <summary><span class="n">1</span> Load data <span class="hint" id="lk-fhint"></span></summary>' +
      '      <div class="body">' +
      '        <div class="dropzone" id="lk-drop"><strong>DROP DATA HERE</strong><ul class="drop-spec"><li><b>Type of file:</b> CSV or Excel (.xlsx)</li><li><b>What you\'re looking for:</b> a nightly survey with the self-esteem item (quantselfesteem with numbers 1-7, or a selfesteem column with label answers)</li></ul></div>' +
      '        <input type="file" id="lk-file" accept=".csv,.tsv,.txt,.xlsx,.xlsm,.xltx" style="display:none">' +
      '        <div id="lk-fileinfo"></div>' +
      '        <label class="field" id="lk-sheetrow" style="display:none">Sheet<select id="lk-sheet"></select></label>' +
      '        <div class="clusterblock" id="lk-clusterblock" style="display:none">' +
      '          <div class="clusterlabel">Select cluster(s)</div>' +
      '          <label class="field">Cluster column<select id="lk-filtercol"></select></label>' +
      '          <div id="lk-filtervals"></div>' +
      '        </div>' +
      '        <div class="row"><button id="lk-demo" class="fixed">🎲 Demo data</button></div>' +
      '      </div>' +
      '    </details>' +

      '    <details class="step disabled" open>' +
      '      <summary><span class="n">2</span> What to chart</summary>' +
      '      <div class="body">' +
      '        <label class="field">Column to chart <span class="sub">(auto-finds the self-esteem item)</span><select id="lk-col"></select></label>' +
      '      </div>' +
      '    </details>' +

      '    <details class="step disabled" open>' +
      '      <summary><span class="n">3</span> Numbers <span class="hint">(editable)</span></summary>' +
      '      <div class="body">' +
      '        <div id="lk-nums"></div>' +
      '        <div class="row"><button id="lk-addnum" class="fixed">+ Add row</button>' +
      '        <button id="lk-renum" class="fixed">Re-extract</button></div>' +
      '      </div>' +
      '    </details>' +

      '    <details class="step disabled" open>' +
      '      <summary><span class="n">4</span> Scale & anchors</summary>' +
      '      <div class="body">' +
      '        <label class="field">Scale points' +
      '          <select id="lk-k"><option>5</option><option selected>7</option><option>9</option><option>10</option></select></label>' +
      '        <div id="lk-anchors"></div>' +
      '      </div>' +
      '    </details>' +

      '    <details class="step disabled" open>' +
      '      <summary><span class="n">5</span> Style</summary>' +
      '      <div class="body">' +
      '        <div class="row">' +
      '          <label class="field">Bars<input type="color" id="lk-barcolor" value="#4472C4"></label>' +
      '          <label class="field">Arrow<input type="color" id="lk-meancolor" value="#C00000"></label>' +
      '          <label class="field">Mean text<input type="color" id="lk-textblue" value="#2E74B5"></label>' +
      '        </div>' +
      '        <label class="check"><input type="checkbox" id="lk-showmean" checked> Mean arrow + "Mean = … (SD = …)"</label>' +
      '        <label class="check"><input type="checkbox" id="lk-showcounts"> Count labels on bars</label>' +
      '        <label class="field">Font' +
      '          <select id="lk-font"><option value="Candara" selected>Candara</option><option value="Corbel">Corbel</option><option value="Arial">Arial</option><option value="Georgia">Georgia</option><option value="Calibri">Calibri</option></select></label>' +
      '        <div class="row">' +
      '          <label class="field">Y max <span class="sub">(0 = auto)</span><input type="number" id="lk-ymax" min="0" value="0"></label>' +
      '          <label class="field">Image size' +
      '            <select id="lk-dims"><option value="2000x1100" selected>2000 × 1100</option>' +
      '            <option value="2600x1400">2600 × 1400</option><option value="1600x900">1600 × 900</option></select></label>' +
      '        </div>' +
      '      </div>' +
      '    </details>' +
      '  </div>' +

      '  <div class="preview-panel">' +
      '    <div class="preview-toolbar">' +
      '      <button id="lk-png" class="primary" disabled>⬇ PNG</button>' +
      '      <button id="lk-ppt" disabled>⬇ PowerPoint</button>' +
      '      <span class="status" id="lk-status"></span>' +
      '    </div>' +
      '    <div class="canvas-holder" style="background:#fff">' +
      '      <div class="empty-msg" id="lk-empty">output displayed HERE</div>' +
      '      <canvas id="lk-canvas" style="display:none"></canvas>' +
      '    </div>' +
      '  </div>' +
      '</div>';

    var $ = function (id) { return container.querySelector('#' + id); };
    var canvas = $('lk-canvas');
    var renderTimer = null;

    function escapeHtml(s) {
      return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    /* ---------- loading (same pattern as extractor) ---------- */

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

    function detectVarNameRow(row0, row1) {
      if (!row1) return 0;
      var avg = function (r) {
        var s = 0, k = 0;
        r.forEach(function (c) { if (c) { s += String(c).length; k++; } });
        return k ? s / k : 0;
      };
      var shortish = row1.filter(function (c) { return /^[\w.()\- ]{1,24}$/.test(String(c).trim()); }).length;
      return (avg(row0) > 35 && avg(row1) < 22 && shortish >= row1.length * 0.7) ? 1 : 0;
    }

    function loadFile(file) {
      file.arrayBuffer().then(function (buf) {
        var bytes = new Uint8Array(buf);
        if (window.xlsxLite && window.xlsxLite.isZipFile(bytes)) {
          return window.parseXlsx(buf).then(function (sheets) {
            sheets = sheets.filter(function (s) { return s.rows.length; });
            if (!sheets.length) throw new Error('the workbook has no data');
            state._sheets = sheets; state.fileName = file.name;
            $('lk-sheet').innerHTML = sheets.map(function (s, i) {
              return '<option value="' + i + '">' + escapeHtml(s.name) + '</option>';
            }).join('');
            $('lk-sheetrow').style.display = sheets.length > 1 ? '' : 'none';
            useSheet(0);
          });
        }
        $('lk-sheetrow').style.display = 'none';
        loadRaw(parseCSVText(new TextDecoder(sniffEncoding(buf)).decode(buf)), file.name);
      }).catch(function (err) {
        $('lk-fileinfo').innerHTML = '<span class="file-warn">Could not read file: ' + (err.message || err) + '</span>';
      });
    }

    function useSheet(i) {
      var s = state._sheets[i];
      loadRaw(s.rows.map(function (r) {
        return r.map(function (c) { return c === null || c === undefined ? '' : String(c); });
      }), state.fileName + (state._sheets.length > 1 ? ' · ' + s.name : ''));
    }

    function loadRaw(raw, name) {
      if (raw.length < 2) { $('lk-fileinfo').innerHTML = '<span class="file-warn">No data rows.</span>'; return; }
      state.raw = raw;
      state.fileName = name;
      var bestScore = -1, best = 0, scoresL = [];
      for (var ri = 0; ri < Math.min(4, raw.length); ri++) {
        var sc = 0;
        raw[ri].forEach(function (c) {
          var s = String(c).trim();
          if (/ImportId/.test(s)) { sc -= 3; return; }
          if (/^[A-Za-z][\w .()-]{0,28}$/.test(s)) sc++;
          if (s.length > 60) sc -= 2;
        });
        scoresL.push(sc);
        if (sc > bestScore) bestScore = sc;
      }
      for (var rj = 0; rj < scoresL.length; rj++) {
        if (scoresL[rj] >= 0.9 * bestScore) { best = rj; break; }
      }
      state.headerRow = best;
      var hr = state.headerRow;
      state.headers = raw[hr].map(function (h, i) { return String(h || 'column ' + (i + 1)).trim(); });
      state.qtexts = hr === 1 ? raw[0].map(String) : state.headers.slice();
      state.rows = raw.slice(hr + 1);
      // drop Qualtrics question-text / ImportId rows lurking under the header
      // (question-text rows are long in MOST cells; data rows only in a few)
      var dropped = 0;
      while (state.rows.length && dropped < 2) {
        var cells = state.rows[0].filter(function (c) { return String(c).trim(); });
        var longs = cells.filter(function (c) { return String(c).length > 40; }).length;
        if (state.rows[0].join(' ').indexOf('"ImportId"') !== -1 ||
            (cells.length >= 3 && longs / cells.length > 0.5)) { state.rows.shift(); dropped++; }
        else break;
      }
      state.filterCol = state.headers.findIndex(function (h, i) {
        return /cluster/i.test(h) || /which cluster/i.test(state.qtexts[i] || '');
      });
      state.includeValues = null;
      state.override = null;

      // auto-find: prefer the numeric quantselfesteem, else any self-esteem item
      var col = state.headers.findIndex(function (h) { return /quant.*esteem/i.test(h); });
      if (col === -1) col = state.headers.findIndex(function (h, i) {
        return /esteem/i.test(h) || /high self esteem/i.test(state.qtexts[i] || '');
      });
      state.col = col === -1 ? 0 : col;

      var opts = state.headers.map(function (h, i) { return '<option value="' + i + '">' + escapeHtml(h) + '</option>'; }).join('');
      $('lk-col').innerHTML = opts;
      $('lk-col').value = String(state.col);
      $('lk-filtercol').innerHTML = '<option value="-1">- no filter -</option>' + opts;
      $('lk-filtercol').value = String(state.filterCol);
      $('lk-clusterblock').style.display = '';
      buildFilterValues();

      $('lk-fileinfo').innerHTML = '<span class="file-info">✓ ' + escapeHtml(name) + ' · ' + state.rows.length + ' responses</span>';
      $('lk-fhint').textContent = name;
      Array.prototype.forEach.call(container.querySelectorAll('details.step'), function (d) { d.classList.remove('disabled'); });
      scheduleRender();
    }

    function buildFilterValues() {
      var box = $('lk-filtervals');
      box.innerHTML = '';
      if (state.filterCol < 0 || !state.rows.length) return;
      var uniq = new Map();
      state.rows.forEach(function (r) {
        var v = String(r[state.filterCol] === undefined ? '' : r[state.filterCol]).trim();
        uniq.set(v, (uniq.get(v) || 0) + 1);
      });
      if (uniq.size > 40) { box.innerHTML = '<div class="small-note">⚠ too many values.</div>'; state.includeValues = null; return; }

      // cluster-picker doctrine: default to NONE unless exactly one unique value
      if (state.includeValues === null) {
        if (uniq.size === 1) {
          state.includeValues = new Set(uniq.keys());
        } else {
          state.includeValues = new Set();
        }
      }

      var btnRow = document.createElement('div');
      btnRow.className = 'row';
      btnRow.style.marginBottom = '4px';
      var selAll = document.createElement('button');
      selAll.className = 'fixed';
      selAll.textContent = 'Select all';
      var clrAll = document.createElement('button');
      clrAll.className = 'fixed';
      clrAll.textContent = 'Clear all';
      btnRow.appendChild(selAll);
      btnRow.appendChild(clrAll);
      box.appendChild(btnRow);

      var list = document.createElement('div');
      list.className = 'value-list';

      function refreshLabels() {
        Array.prototype.forEach.call(list.querySelectorAll('label'), function (lab) {
          var inp = lab.querySelector('input');
          var v2 = inp.getAttribute('data-v');
          var on = state.includeValues.has(v2);
          inp.checked = on;
          lab.className = on ? 'on' : '';
        });
      }

      Array.from(uniq.keys()).sort().forEach(function (v) {
        var lab = document.createElement('label');
        var on = state.includeValues.has(v);
        lab.className = on ? 'on' : '';
        lab.innerHTML = '<input type="checkbox" data-v="' + escapeHtml(v) + '" ' + (on ? 'checked' : '') + '> ' +
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

      var note = document.createElement('div');
      note.className = 'small-note';
      note.style.marginTop = '4px';
      box.appendChild(note);

      function updateNote() {
        note.textContent = (state.includeValues && state.includeValues.size === 0 && uniq.size > 1)
          ? 'tick your cluster(s) to continue' : '';
      }
      updateNote();

      selAll.addEventListener('click', function () {
        state.includeValues = new Set(uniq.keys());
        state.override = null;
        refreshLabels();
        updateNote();
        scheduleRender();
      });
      clrAll.addEventListener('click', function () {
        state.includeValues = new Set();
        state.override = null;
        refreshLabels();
        updateNote();
        scheduleRender();
      });

      Array.prototype.forEach.call(list.querySelectorAll('input'), function (inp) {
        inp.addEventListener('change', updateNote);
      });
    }

    function includedRows() {
      if (state.filterCol < 0 || state.includeValues === null) return state.rows;
      return state.rows.filter(function (r) {
        var v = String(r[state.filterCol] === undefined ? '' : r[state.filterCol]).trim();
        return state.includeValues.has(v);
      });
    }

    /* ---------- editable numbers (same pattern as the culture extractor) ---------- */

    function extractData() {
      state._skipped = 0;
      if (!state.rows.length || state.col < 0) return [];
      var vals = includedRows().map(function (r) { return r[state.col]; });
      var res = countScale(vals, state.K, state.anchors);
      state._skipped = res.skipped;
      if (!res.nums.length) return [];
      var out = [];
      for (var i = 0; i < state.K; i++) out.push([String(i + 1), res.counts[i]]);
      return out;
    }

    function currentData() {
      if (state.override) return state.override.filter(function (d) { return d[0] !== '' && isFinite(d[1]); });
      return extractData();
    }

    function buildNums(data) {
      var box = $('lk-nums');
      box.innerHTML = '';
      data.forEach(function (d, i) {
        var row = document.createElement('div');
        row.className = 'row';
        row.innerHTML = '<input type="text" value="' + escapeHtml(d[0]) + '" style="flex:2;min-width:0">' +
          '<input type="number" step="any" value="' + d[1] + '" style="flex:1;min-width:0">' +
          '<button class="fixed" data-del="' + i + '" title="remove">x</button>';
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
      Array.prototype.forEach.call($('lk-nums').querySelectorAll('.row'), function (row) {
        var ins = row.querySelectorAll('input');
        out.push([ins[0].value.trim(), parseFloat(ins[1].value)]);
      });
      return out;
    }

    /* ---------- anchors editor ---------- */

    function defaultAnchorsFor(K) {
      if (K === 7) return DEFAULT_ANCHORS.slice();
      if (K === 5) return ['Strongly Disagree', 'Disagree', 'Neutral', 'Agree', 'Strongly Agree'];
      var out = [];
      for (var i = 1; i <= K; i++) out.push(String(i));
      return out;
    }

    function renderAnchors() {
      var box = $('lk-anchors');
      box.innerHTML = '';
      state.anchors.forEach(function (a, i) {
        var row = document.createElement('div');
        row.className = 'row';
        row.style.marginBottom = '4px';
        row.innerHTML = '<span class="small-note fixed" style="width:24px;text-align:right">' + (i + 1) + '</span>' +
          '<input type="text" value="' + escapeHtml(a) + '">';
        row.querySelector('input').addEventListener('input', function (e) {
          state.anchors[i] = e.target.value;
          state.override = null;     // anchors feed extraction, so re-extract
          scheduleRender();
        });
        box.appendChild(row);
      });
    }

    /* ---------- chart ---------- */

    function scheduleRender() {
      clearTimeout(renderTimer);
      renderTimer = setTimeout(render, 180);
    }

    function wrapText(ctx, text, maxW) {
      var words = String(text).split(/\s+/), lines = [], cur = '';
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
      var noTicks = state.filterCol >= 0 && state.includeValues !== null && state.includeValues.size === 0;
      if (!data.length) {
        canvas.style.display = 'none';
        var em = $('lk-empty');
        em.textContent = noTicks ? 'tick your cluster(s) above to continue' : 'output displayed HERE';
        em.style.display = '';
        $('lk-png').disabled = true;
        $('lk-ppt').disabled = true;
        $('lk-status').textContent = (!noTicks && state.rows.length && state.col >= 0)
          ? 'no usable responses in that column' : '';
        return;
      }
      if (!state.override) buildNums(data);

      // counts per scale point + weighted mean/SD from the numeric labels
      var counts = [], i0;
      for (i0 = 0; i0 < state.K; i0++) counts.push(0);
      var n = 0, sum = 0;
      data.forEach(function (p) {
        var lv = parseFloat(p[0]);
        if (!isFinite(lv) || !isFinite(p[1]) || p[1] <= 0) return;
        var k = Math.round(lv);
        if (k < 1 || k > state.K) return;
        counts[k - 1] += p[1];
        n += p[1];
        sum += lv * p[1];
      });
      if (!n) {
        canvas.style.display = 'none';
        var em2 = $('lk-empty');
        em2.textContent = 'output displayed HERE';
        em2.style.display = '';
        $('lk-png').disabled = true;
        $('lk-ppt').disabled = true;
        $('lk-status').textContent = 'no usable numbers on the 1-' + state.K + ' scale';
        return;
      }
      var m = sum / n, vsum = 0;
      data.forEach(function (p) {
        var lv = parseFloat(p[0]);
        if (!isFinite(lv) || !isFinite(p[1]) || p[1] <= 0) return;
        var k = Math.round(lv);
        if (k < 1 || k > state.K) return;
        vsum += p[1] * (lv - m) * (lv - m);
      });
      var sd = n > 1 ? Math.sqrt(vsum / (n - 1)) : NaN;

      var d = state.dims.split('x');
      var W = parseInt(d[0], 10), H = parseInt(d[1], 10);
      canvas.width = W; canvas.height = H;
      canvas.style.display = '';
      $('lk-empty').style.display = 'none';
      var ctx = canvas.getContext('2d');
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, W, H);

      var mL = 0.075 * W, mR = 0.03 * W, mT = 0.16 * H, mB = 0.22 * H;
      var plotW = W - mL - mR, plotH = H - mT - mB;
      var yMax = state.yMax > 0 ? state.yMax : Math.max(5, Math.ceil(Math.max.apply(null, counts) / 5) * 5 + 5);
      var step = yMax > 20 ? 5 : yMax > 10 ? 2 : 1;

      var fBody = state.fontFamily + ', Candara, "Gill Sans", sans-serif';
      var axisPx = Math.round(0.032 * H);

      // y axis + ticks (light, like the slide)
      ctx.strokeStyle = '#D9D9D9';
      ctx.lineWidth = Math.max(1, 0.002 * H);
      ctx.beginPath();
      ctx.moveTo(mL, mT - 0.02 * H);
      ctx.lineTo(mL, mT + plotH);
      ctx.stroke();
      ctx.fillStyle = '#333333';
      ctx.font = axisPx + 'px ' + fBody;
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      for (var yv = 0; yv <= yMax; yv += step) {
        var y = mT + plotH - plotH * yv / yMax;
        ctx.fillText(String(yv), mL - 0.012 * W, y);
      }

      // bars
      var slot = plotW / state.K;
      var barW = slot * 0.55;
      ctx.fillStyle = state.barColor;
      counts.forEach(function (cnt, i) {
        var x = mL + slot * i + (slot - barW) / 2;
        var h = plotH * cnt / yMax;
        ctx.fillRect(x, mT + plotH - h, barW, h);
        if (state.showCounts && cnt > 0) {
          ctx.fillStyle = '#333';
          ctx.font = axisPx + 'px ' + fBody;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'bottom';
          ctx.fillText(String(cnt), x + barW / 2, mT + plotH - h - 0.008 * H);
          ctx.fillStyle = state.barColor;
        }
      });

      // baseline
      ctx.strokeStyle = '#D9D9D9';
      ctx.beginPath();
      ctx.moveTo(mL, mT + plotH);
      ctx.lineTo(mL + plotW, mT + plotH);
      ctx.stroke();

      // anchor labels (wrapped, with "(n)" on its own line, like the slide)
      ctx.fillStyle = '#111';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.font = axisPx + 'px ' + fBody;
      var lh = axisPx * 1.18;
      for (var i2 = 0; i2 < state.K; i2++) {
        var cx = mL + slot * i2 + slot / 2;
        var lines = wrapText(ctx, state.anchors[i2] || '', slot * 0.92);
        lines.push('(' + (i2 + 1) + ')');
        lines.forEach(function (ln, li) {
          ctx.fillText(ln, cx, mT + plotH + 0.02 * H + li * lh);
        });
      }

      // mean arrow + text
      if (state.showMean) {
        var mx = mL + slot * (m - 1) + slot / 2;   // scale point k sits at slot center
        var topY = mT - 0.02 * H, botY = mT + plotH - 0.01 * H;
        ctx.strokeStyle = state.meanColor;
        ctx.fillStyle = state.meanColor;
        ctx.lineWidth = Math.max(3, 0.008 * H);
        ctx.beginPath();
        ctx.moveTo(mx, topY + 0.05 * H);
        ctx.lineTo(mx, botY - 0.03 * H);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(mx, botY);
        ctx.lineTo(mx - 0.012 * W, botY - 0.045 * H);
        ctx.lineTo(mx + 0.012 * W, botY - 0.045 * H);
        ctx.closePath();
        ctx.fill();
        // mean text: bold, blue, in the chosen font
        ctx.fillStyle = state.textBlue;
        ctx.font = '700 ' + Math.round(0.052 * H) + 'px ' + fBody;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        ctx.fillText('Mean = ' + m.toFixed(2), mx, topY - 0.005 * H);
        ctx.font = '700 ' + Math.round(0.042 * H) + 'px ' + fBody;
        ctx.textBaseline = 'top';
        ctx.fillText('(SD = ' + (isFinite(sd) ? sd.toFixed(2) : 'NA') + ')', mx, topY + 0.002 * H);
      }

      $('lk-png').disabled = false;
      $('lk-ppt').disabled = false;
      $('lk-status').textContent = 'n = ' + n +
        (!state.override && state._skipped ? ' (' + state._skipped + ' unusable skipped)' : '') +
        ' · mean ' + m.toFixed(2) + ' · SD ' + (isFinite(sd) ? sd.toFixed(2) : 'NA') + ' · ' + W + '×' + H;
    }

    /* ---------- events ---------- */

    var drop = $('lk-drop'), fileInput = $('lk-file');
    drop.addEventListener('click', function () { fileInput.click(); });
    fileInput.addEventListener('change', function () { if (fileInput.files[0]) loadFile(fileInput.files[0]); });
    ['dragover', 'dragenter'].forEach(function (ev) {
      drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.add('drag'); });
    });
    ['dragleave', 'drop'].forEach(function (ev) {
      drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.remove('drag'); });
    });
    drop.addEventListener('drop', function (e) { if (e.dataTransfer.files[0]) loadFile(e.dataTransfer.files[0]); });

    $('lk-sheet').addEventListener('change', function (e) { useSheet(+e.target.value); });
    $('lk-filtercol').addEventListener('change', function (e) {
      state.filterCol = +e.target.value; state.includeValues = null; state.override = null;
      buildFilterValues(); scheduleRender();
    });
    $('lk-col').addEventListener('change', function (e) {
      state.col = +e.target.value; state.override = null; scheduleRender();
    });
    $('lk-addnum').addEventListener('click', function () {
      state.override = readNums();
      state.override.push(['New', 0]);
      buildNums(state.override);
      scheduleRender();
    });
    $('lk-renum').addEventListener('click', function () { state.override = null; scheduleRender(); });
    $('lk-k').addEventListener('change', function (e) {
      state.K = +e.target.value;
      state.anchors = defaultAnchorsFor(state.K);
      state.override = null;
      renderAnchors(); scheduleRender();
    });
    $('lk-barcolor').addEventListener('input', function (e) { state.barColor = e.target.value; scheduleRender(); });
    $('lk-meancolor').addEventListener('input', function (e) { state.meanColor = e.target.value; scheduleRender(); });
    $('lk-textblue').addEventListener('input', function (e) { state.textBlue = e.target.value; scheduleRender(); });
    $('lk-showmean').addEventListener('change', function (e) { state.showMean = e.target.checked; scheduleRender(); });
    $('lk-showcounts').addEventListener('change', function (e) { state.showCounts = e.target.checked; scheduleRender(); });
    $('lk-ymax').addEventListener('change', function (e) { state.yMax = Math.max(0, +e.target.value || 0); scheduleRender(); });
    $('lk-font').addEventListener('change', function (e) { state.fontFamily = e.target.value; scheduleRender(); });
    $('lk-dims').addEventListener('change', function (e) { state.dims = e.target.value; scheduleRender(); });

    // demo answers shaped like the slide (0/1/8/7/14/25/7 across 1..7)
    $('lk-demo').addEventListener('click', function () {
      var counts = [0, 1, 8, 7, 14, 25, 7];
      var raw = [['Cluster', 'quantselfesteem']];
      counts.forEach(function (n, i) {
        for (var k = 0; k < n; k++) raw.push(['Cluster H - Demo', String(i + 1)]);
      });
      loadRaw(raw, 'demo data');
    });

    $('lk-png').addEventListener('click', function () {
      window.LeadToolkit.downloadCanvasPng(canvas, 'LEADTK_PGN-SES_' + new Date().toISOString().slice(0, 10) + '.png');
    });
    $('lk-ppt').addEventListener('click', function () {
      window.LeadToolkit.downloadCanvasPptx(canvas, 'LEADTK_PGN-SES_' + new Date().toISOString().slice(0, 10) + '.pptx');
    });

    renderAnchors();
  }

  if (typeof window !== 'undefined' && window.LeadToolkit) {
    window.LeadToolkit.registerApp({
      id: 'likert',
      icon: '📊🪞',
      group: 'Class 3 - Influence and Persuasion',
      name: 'Plot Generator | Self Esteem',
      code: 'PGN-SES',
      intro: { upload: 'a nightly survey with the self-esteem item', to: 'the Likert bar chart with counts and the mean arrow, like the slide' },
      tags: ['self esteem', 'likert', 'diversity', '7-point'],
      description: 'The Likert bar chart from the slide: counts per scale point, renameable anchors, optional red mean arrow with Mean/SD. PNG without a baked-in title.',
      mount: mount
    });
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { countScale: countScale, mean: mean, sdSample: sdSample, DEFAULT_ANCHORS: DEFAULT_ANCHORS };
  }
})();
