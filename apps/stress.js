/* ==========================================================================
   App | Different Stress Mindsets (Class 3)
   States the cluster's mean stress-mindset score and draws the number-line
   illustration (reference groups + a red "Cluster H – YOU!!" arrow in the
   right ballpark). Faculty fine-tunes the arrow on the slide; this gets it
   close and states the number.
   NOTE (2026-08-21): none of the survey files seen so far contain a stress
   column | the app auto-detects /stress|mindset|smm/i when it exists, lets
   you pick any column, and ALSO accepts a typed-in mean so it works today.
   ========================================================================== */

(function () {
  'use strict';

  function mean(xs) { var s = 0; xs.forEach(function (x) { s += x; }); return xs.length ? s / xs.length : NaN; }
  function sdSample(xs) {
    if (xs.length < 2) return NaN;
    var m = mean(xs), s = 0;
    xs.forEach(function (x) { s += (x - m) * (x - m); });
    return Math.sqrt(s / (xs.length - 1));
  }

  /* Stress Mindset Scale (SMS_1…SMS_8): 5-point agree items; ODD items are
     stress-is-deteriorating and get reverse-coded. FIXED published 0-4
     scoring (Dani): labels map 0-4, numeric Qualtrics answers arrive 1-5
     and are shifted down by one. */
  var SMS_LABELS = { 'strongly disagree': 0, 'disagree': 1, 'neither agree nor disagree': 2, 'agree': 3, 'strongly agree': 4 };

  function smsScore(cells) {
    var vals = [];
    for (var k = 0; k < cells.length; k++) {
      var raw = String(cells[k] === undefined || cells[k] === null ? '' : cells[k]).trim();
      var v = SMS_LABELS[raw.toLowerCase()];
      if (v === undefined) {
        var n = parseFloat(raw);
        if (!isFinite(n)) return null;
        v = n >= 1 ? n - 1 : n;                 // 1-5 numeric -> 0-4
        if (v < 0 || v > 4) return null;
      }
      var reversed = (k % 2 === 0) ? (4 - v) : v;   // items 1,3,5,7 reverse
      vals.push(reversed);
    }
    return vals.length ? mean(vals) : null;
  }

  function findSmsColumns(headers) {
    var byK = {};
    headers.forEach(function (h, i) {
      var m = /^sms[_ ]?(\d+)(_num)?$/i.exec(String(h).trim());
      if (!m) return;
      var k = +m[1], isNum = !!m[2];
      if (!byK[k] || isNum) byK[k] = { i: i, k: k };   // _num wins over labels
    });
    return Object.keys(byK).map(Number).sort(function (a, b) { return a - b; })
      .map(function (k) { return byK[k].i; });
  }

  var DEFAULT_REFS = [
    { label: 'Columbia Undergraduate Average', value: 1.4, color: '#9FD5E8' },
    { label: 'UBS Bankers', value: 1.6, color: '#E959C8' },
    { label: 'Federal Reserve Employees', value: 1.9, color: '#2F6B2F' },
    { label: 'CBS Sr. Execs', value: 2.2, color: '#F2A03D' },
    { label: 'Columbia Medical School', value: 2.4, color: '#F2E63D' }
  ];

  function mount(container) {
    var state = {
      raw: [], headers: [], qtexts: [], rows: [], fileName: null, _sheets: null, headerRow: 0,
      filterCol: -1, includeValues: null,
      col: -1,
      smsCols: [],            // the ticked composite items
      manualMean: null,
      clusterLabel: 'Cluster H – YOU!!',
      min: 0, max: 4,         // published 0-4 scale, fixed (Dani)
      refs: DEFAULT_REFS.map(function (r) { return { label: r.label, value: r.value, color: r.color }; }),
      dims: '2200x900'
    };

    container.innerHTML = '' +
      '<div class="app-title"><h2>📊🧘 Plot Generator | Stress Mindsets</h2>' +
      '<span class="sub">States the cluster mean and places the arrow in the ballpark on the reference line. Faculty does the final nudge.</span></div>' +
      '<div class="app-layout">' +
      '  <div class="sidebar">' +

      '    <details class="step" open>' +
      '      <summary><span class="n">1</span> Load data <span class="hint" id="st-fhint"></span></summary>' +
      '      <div class="body">' +
      '        <div class="dropzone" id="st-drop"><strong>DROP DATA HERE</strong><ul class="drop-spec"><li><b>Type of file:</b> CSV or Excel (.xlsx)</li><li><b>What you\'re looking for:</b> a nightly survey with the 8 stress-mindset items (SMS_1 … SMS_8 or SMS_1_num …, labels or numbers; e.g. the Class 3 stress + self-esteem export); tick your cluster after loading</li></ul></div>' +
      '        <input type="file" id="st-file" accept=".csv,.tsv,.txt,.xlsx,.xlsm,.xltx" style="display:none">' +
      '        <div id="st-fileinfo"></div>' +
      '        <label class="field" id="st-sheetrow" style="display:none">Sheet<select id="st-sheet"></select></label>' +
      '        <div class="clusterblock" id="st-clusterblock" style="display:none">' +
      '          <div class="clusterlabel">Select cluster(s)</div>' +
      '          <label class="field">Cluster column<select id="st-filtercol"></select></label>' +
      '          <div id="st-filtervals"></div>' +
      '        </div>' +
      '        <div class="row"><button id="st-demo" class="fixed">🎲 Demo data</button></div>' +
      '      </div>' +
      '    </details>' +

      '    <details class="step" open>' +
      '      <summary><span class="n">2</span> Composite & mean</summary>' +
      '      <div class="body">' +
      '        <div class="small-note">Items in the composite (auto-detected; odd items reverse-coded, published 0-4 scoring):</div>' +
      '        <div id="st-items"></div>' +
      '        <label class="field" id="st-colrow" style="display:none">…or a single stress column<select id="st-col"></select></label>' +
      '        <label class="field">…or type the mean by hand<input type="number" id="st-manual" step="0.01" placeholder="e.g. 2.06"></label>' +
      '      </div>' +
      '    </details>' +

      '    <details class="step" open>' +
      '      <summary><span class="n">3</span> Line & references</summary>' +
      '      <div class="body">' +
      '        <label class="field">Cluster label<input type="text" id="st-label" value="Cluster H – YOU!!"></label>' +
      '        <div class="small-note">Reference groups (label · value · color):</div>' +
      '        <div id="st-refs"></div>' +
      '        <div class="row"><button id="st-addref" class="fixed">＋ Add reference</button></div>' +
      '      </div>' +
      '    </details>' +
      '  </div>' +

      '  <div class="preview-panel">' +
      '    <div class="preview-toolbar">' +
      '      <button id="st-png" class="primary" disabled>⬇ PNG</button>' +
      '      <button id="st-ppt" disabled>⬇ PowerPoint</button>' +
      '      <button id="st-copy" class="primary" disabled>📋 Copy text</button>' +
      '      <span class="status" id="st-status"></span>' +
      '    </div>' +
      '    <div class="canvas-holder" style="background:#fff">' +
      '      <div class="empty-msg" id="st-empty">output displayed HERE</div>' +
      '      <canvas id="st-canvas" style="display:none"></canvas>' +
      '    </div>' +
      '    <textarea id="st-out" readonly style="display:none;width:100%;min-height:90px;margin-top:10px;font:12.5px/1.5 ui-monospace,Menlo,monospace;border:1px solid var(--line);border-radius:8px;padding:10px;background:#fff"></textarea>' +
      '  </div>' +
      '</div>';

    var $ = function (id) { return container.querySelector('#' + id); };
    var canvas = $('st-canvas');
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
            $('st-sheet').innerHTML = sheets.map(function (s, i) {
              return '<option value="' + i + '">' + escapeHtml(s.name) + '</option>';
            }).join('');
            $('st-sheetrow').style.display = sheets.length > 1 ? '' : 'none';
            useSheet(0);
          });
        }
        $('st-sheetrow').style.display = 'none';
        loadRaw(parseCSVText(new TextDecoder(sniffEncoding(buf)).decode(buf)), file.name);
      }).catch(function (err) {
        $('st-fileinfo').innerHTML = '<span class="file-warn">Could not read file: ' + (err.message || err) + '</span>';
      });
    }

    function useSheet(i) {
      var s = state._sheets[i];
      loadRaw(s.rows.map(function (r) {
        return r.map(function (c) { return c === null || c === undefined ? '' : String(c); });
      }), state.fileName + (state._sheets.length > 1 ? ' · ' + s.name : ''));
    }

    function loadRaw(raw, name) {
      if (raw.length < 2) { $('st-fileinfo').innerHTML = '<span class="file-warn">No data rows.</span>'; return; }
      state.raw = raw;
      state.fileName = name;
      // header row can hide below qtext + ImportId rows (e.g. the LEAD25 C3
      // export has names in the THIRD row): pick the earliest of the first
      // four rows that looks like short variable names
      var bestScore = -1, best = 0, scores = [];
      for (var ri = 0; ri < Math.min(4, raw.length); ri++) {
        var sc = 0;
        raw[ri].forEach(function (c) {
          var s = String(c).trim();
          if (/ImportId/.test(s)) { sc -= 3; return; }
          if (/^[A-Za-z][\w .()-]{0,28}$/.test(s)) sc++;
          if (s.length > 60) sc -= 2;
        });
        scores.push(sc);
        if (sc > bestScore) bestScore = sc;
      }
      for (var rj = 0; rj < scores.length; rj++) {
        if (scores[rj] >= 0.9 * bestScore) { best = rj; break; }
      }
      state.headerRow = best;
      var hr = state.headerRow;
      state.headers = raw[hr].map(function (h, i) { return String(h || 'column ' + (i + 1)).trim(); });
      state.qtexts = hr > 0 ? raw[0].map(String) : state.headers.slice();
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

      state.smsCols = findSmsColumns(state.headers);
      var col = state.headers.findIndex(function (h, i) {
        return /stress|mindset|smm/i.test(h) || /stress/i.test(state.qtexts[i] || '');
      });
      state.col = col;
      buildItemPicker();

      var opts = state.headers.map(function (h, i) { return '<option value="' + i + '">' + escapeHtml(h) + '</option>'; }).join('');
      $('st-col').innerHTML = '<option value="-1">- pick a column -</option>' + opts;
      $('st-col').value = String(state.col);
      $('st-colrow').style.display = '';
      $('st-filtercol').innerHTML = '<option value="-1">- no filter -</option>' + opts;
      $('st-filtercol').value = String(state.filterCol);
      $('st-clusterblock').style.display = '';
      buildFilterValues();

      $('st-fileinfo').innerHTML = '<span class="file-info">✓ ' + escapeHtml(name) + ' · ' + state.rows.length + ' responses' +
        (col === -1 ? ' · <b>no stress column auto-found; pick one below or type the mean</b>' : '') + '</span>';
      $('st-fhint').textContent = name;
      scheduleRender();
    }

    function buildFilterValues() {
      var box = $('st-filtervals');
      box.innerHTML = '';
      if (state.filterCol < 0 || !state.rows.length) return;
      var uniq = new Map();
      state.rows.forEach(function (r) {
        var v = String(r[state.filterCol] === undefined ? '' : r[state.filterCol]).trim();
        uniq.set(v, (uniq.get(v) || 0) + 1);
      });
      if (uniq.size > 40) { state.includeValues = null; return; }
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
          updateNote();
          scheduleRender();
        });
        list.appendChild(lab);
      });
      box.appendChild(list);

      var note = document.createElement('div');
      note.id = 'st-clusternote';
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
        refreshLabels();
        updateNote();
        scheduleRender();
      });
      clrAll.addEventListener('click', function () {
        state.includeValues = new Set();
        refreshLabels();
        updateNote();
        scheduleRender();
      });
    }

    function includedRows() {
      if (state.filterCol < 0 || state.includeValues === null) return state.rows;
      return state.rows.filter(function (r) {
        var v = String(r[state.filterCol] === undefined ? '' : r[state.filterCol]).trim();
        return state.includeValues.has(v);
      });
    }

    /* ---------- references editor ---------- */

    function renderRefs() {
      var box = $('st-refs');
      box.innerHTML = '';
      state.refs.forEach(function (ref, i) {
        var row = document.createElement('div');
        row.className = 'row';
        row.style.marginBottom = '4px';
        row.innerHTML = '<input type="text" value="' + escapeHtml(ref.label) + '">' +
          '<input type="number" class="fixed" style="width:70px" step="0.1" value="' + ref.value + '">' +
          '<input type="color" class="fixed" style="width:40px" value="' + ref.color + '">' +
          '<button class="fixed">✕</button>';
        var ins = row.querySelectorAll('input');
        ins[0].addEventListener('input', function (e) { ref.label = e.target.value; scheduleRender(); });
        ins[1].addEventListener('change', function (e) { ref.value = parseFloat(e.target.value) || 0; scheduleRender(); });
        ins[2].addEventListener('input', function (e) { ref.color = e.target.value; scheduleRender(); });
        row.querySelector('button').addEventListener('click', function () {
          state.refs.splice(i, 1);
          renderRefs(); scheduleRender();
        });
        box.appendChild(row);
      });
    }

    /* ---------- stats + drawing ---------- */

    // composite item picker: detected SMS columns pre-ticked, any
    // stress/mindset-looking column offered
    function buildItemPicker() {
      var box = $('st-items');
      if (!box) return;
      box.innerHTML = '';
      var candidates = [];
      state.headers.forEach(function (h, i) {
        var hit = /sms|stress|mindset/i.test(h) || /stress/i.test(state.qtexts[i] || '');
        if (hit || state.smsCols.indexOf(i) !== -1) candidates.push(i);
      });
      if (!candidates.length) {
        box.innerHTML = '<span class="small-note">no stress-mindset columns found in this file</span>';
        return;
      }
      candidates.forEach(function (ci) {
        var lab = document.createElement('label');
        lab.className = 'value-list-item';
        var on = state.smsCols.indexOf(ci) !== -1;
        lab.innerHTML = '<input type="checkbox" ' + (on ? 'checked' : '') + '> ' + escapeHtml(state.headers[ci]);
        lab.style.display = 'inline-block';
        lab.style.marginRight = '10px';
        lab.querySelector('input').addEventListener('change', function (e) {
          if (e.target.checked) {
            if (state.smsCols.indexOf(ci) === -1) state.smsCols.push(ci);
          } else {
            state.smsCols = state.smsCols.filter(function (x) { return x !== ci; });
          }
          state.smsCols.sort(function (a, b) { return a - b; });
          scheduleRender();
        });
        box.appendChild(lab);
      });
    }

    function clusterStats() {
      if (state.manualMean !== null && isFinite(state.manualMean)) {
        return { mean: state.manualMean, n: null, sd: null, source: 'typed in by hand' };
      }
      if (!state.rows.length) return null;
      // preferred: the SMS_1…8 composite
      if (state.smsCols.length >= 4) {
        var scores = [];
        includedRows().forEach(function (r) {
          var s = smsScore(state.smsCols.map(function (ci) { return r[ci]; }));
          if (s !== null) scores.push(s);
        });
        if (scores.length) {
          return {
            mean: mean(scores), n: scores.length, sd: sdSample(scores),
            source: state.smsCols.length + '-item stress-mindset composite (odd items reversed, 0-4 scoring)'
          };
        }
      }
      if (state.col < 0) return null;
      var nums = [];
      includedRows().forEach(function (r) {
        var v = parseFloat(String(r[state.col] === undefined ? '' : r[state.col]).trim());
        if (isFinite(v)) nums.push(v);
      });
      if (!nums.length) return null;
      return { mean: mean(nums), n: nums.length, sd: sdSample(nums), source: state.headers[state.col] };
    }

    function scheduleRender() {
      clearTimeout(renderTimer);
      renderTimer = setTimeout(render, 180);
    }

    function render() {
      var st = clusterStats();
      if (!st) {
        canvas.style.display = 'none';
        $('st-out').style.display = 'none';
        $('st-empty').style.display = '';
        $('st-png').disabled = true; $('st-copy').disabled = true;
        return;
      }

      var d = state.dims.split('x');
      var W = parseInt(d[0], 10), H = parseInt(d[1], 10);
      canvas.width = W; canvas.height = H;
      canvas.style.display = '';
      $('st-empty').style.display = 'none';
      var ctx = canvas.getContext('2d');
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, W, H);

      var fBody = 'Candara, "Gill Sans", Calibri, sans-serif';
      var fHead = 'Corbel, "Segoe UI", Calibri, sans-serif';
      var mL = 0.05 * W, mR = 0.05 * W;
      var lineY = 0.32 * H;
      var lineW = W - mL - mR;
      var xFor = function (v) {
        return mL + lineW * (v - state.min) / Math.max(1e-9, state.max - state.min);
      };

      // main line + ticks
      ctx.strokeStyle = '#111';
      ctx.lineWidth = Math.max(3, 0.006 * H);
      ctx.beginPath();
      ctx.moveTo(mL, lineY);
      ctx.lineTo(mL + lineW, lineY);
      ctx.stroke();
      var tickCount = 4;
      for (var t = 0; t <= tickCount; t++) {
        var tx = mL + lineW * t / tickCount;
        var big = 0.06 * H;
        ctx.beginPath();
        ctx.moveTo(tx, lineY - big);
        ctx.lineTo(tx, lineY + big);
        ctx.stroke();
      }

      // reference arrows below the line, staggered labels
      var sorted = state.refs.slice().sort(function (a, b) { return a.value - b.value; });
      sorted.forEach(function (ref, i) {
        var x = xFor(ref.value);
        var tail = lineY + (0.20 + 0.075 * i) * H;
        ctx.strokeStyle = ref.color;
        ctx.fillStyle = ref.color;
        ctx.lineWidth = Math.max(4, 0.009 * H);
        ctx.beginPath();
        ctx.moveTo(x, tail);
        ctx.lineTo(x, lineY + 0.02 * H);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(x, lineY + 0.005 * H);
        ctx.lineTo(x - 0.008 * W, lineY + 0.045 * H);
        ctx.lineTo(x + 0.008 * W, lineY + 0.045 * H);
        ctx.closePath();
        ctx.fill();
        ctx.beginPath();
        ctx.arc(x, tail, 0.011 * H + 2, 0, 2 * Math.PI);
        ctx.fill();
        ctx.fillStyle = '#111';
        ctx.font = Math.round(0.045 * H) + 'px ' + fBody;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText(ref.label + ' (' + ref.value + ')', x + 0.014 * W, tail);
      });

      // the cluster arrow (red, short, just under the line) + blue label
      var cm = st.mean;
      var cx = xFor(cm);
      ctx.strokeStyle = '#C00000';
      ctx.fillStyle = '#C00000';
      ctx.lineWidth = Math.max(4, 0.01 * H);
      ctx.beginPath();
      ctx.moveTo(cx, lineY + 0.12 * H);
      ctx.lineTo(cx, lineY + 0.02 * H);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(cx, lineY + 0.005 * H);
      ctx.lineTo(cx - 0.009 * W, lineY + 0.05 * H);
      ctx.lineTo(cx + 0.009 * W, lineY + 0.05 * H);
      ctx.closePath();
      ctx.fill();
      ctx.beginPath();
      ctx.arc(cx, lineY + 0.12 * H, 0.013 * H + 2, 0, 2 * Math.PI);
      ctx.fill();
      ctx.fillStyle = '#2E74B5';
      ctx.font = '700 ' + Math.round(0.06 * H) + 'px ' + fHead;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(state.clusterLabel + ' (' + cm.toFixed(2) + ')', cx + 0.016 * W, lineY + 0.135 * H);

      // pasteable text
      var L = [];
      L.push('=== DIFFERENT STRESS MINDSETS ===');
      if (st.n !== null) {
        L.push('Cluster mean = ' + st.mean.toFixed(2) + '   (n = ' + st.n + ', SD = ' + st.sd.toFixed(2) + ', column "' + st.source + '")');
      } else {
        L.push('Cluster mean = ' + st.mean.toFixed(2) + '   (' + st.source + ')');
      }
      L.push('References: ' +
        sorted.map(function (r) { return r.label + ' ' + r.value; }).join(' · '));
      L.push('Arrow placed at ' + st.mean.toFixed(2) + '; nudge on the slide as needed.');
      $('st-out').value = L.join('\n');
      $('st-out').style.display = '';

      $('st-png').disabled = false;
      $('st-ppt').disabled = false;
      $('st-copy').disabled = false;
      $('st-status').textContent = 'mean ' + st.mean.toFixed(2) + (st.n ? ' · n ' + st.n : '') + ' · ' + W + '×' + H;
    }

    /* ---------- events ---------- */

    var drop = $('st-drop'), fileInput = $('st-file');
    drop.addEventListener('click', function () { fileInput.click(); });
    fileInput.addEventListener('change', function () { if (fileInput.files[0]) loadFile(fileInput.files[0]); });
    ['dragover', 'dragenter'].forEach(function (ev) {
      drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.add('drag'); });
    });
    ['dragleave', 'drop'].forEach(function (ev) {
      drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.remove('drag'); });
    });
    drop.addEventListener('drop', function (e) { if (e.dataTransfer.files[0]) loadFile(e.dataTransfer.files[0]); });

    $('st-sheet').addEventListener('change', function (e) { useSheet(+e.target.value); });
    $('st-col').addEventListener('change', function (e) {
      state.col = +e.target.value;
      state.smsCols = [];              // manual column choice overrides the composite
      scheduleRender();
    });
    $('st-filtercol').addEventListener('change', function (e) {
      state.filterCol = +e.target.value; state.includeValues = null; buildFilterValues(); scheduleRender();
    });
    $('st-manual').addEventListener('input', function (e) {
      var v = e.target.value.trim();
      state.manualMean = v === '' ? null : parseFloat(v);
      scheduleRender();
    });
    $('st-label').addEventListener('input', function (e) { state.clusterLabel = e.target.value; scheduleRender(); });
    $('st-addref').addEventListener('click', function () {
      state.refs.push({ label: 'New group', value: 2, color: '#7030A0' });
      renderRefs(); scheduleRender();
    });

    $('st-png').addEventListener('click', function () {
      window.LeadToolkit.downloadCanvasPng(canvas, 'LEADTK_PGN-SMS_' + new Date().toISOString().slice(0, 10) + '.png');
    });
    $('st-ppt').addEventListener('click', function () {
      window.LeadToolkit.downloadCanvasPptx(canvas, 'LEADTK_PGN-SMS_' + new Date().toISOString().slice(0, 10) + '.pptx');
    });
    // demo SMS answers (1-5, odd items reversed downstream)
    $('st-demo').addEventListener('click', function () {
      var head = ['Cluster'];
      for (var k = 1; k <= 8; k++) head.push('SMS_' + k);
      var raw = [head];
      for (var i = 0; i < 40; i++) {
        var row = ['Cluster H - Demo'];
        for (var j = 0; j < 8; j++) row.push(String(((i * 3 + j * 5) % 5) + 1));
        raw.push(row);
      }
      loadRaw(raw, 'demo data');
    });

    $('st-copy').addEventListener('click', function () {
      var out = $('st-out');
      out.focus(); out.select();
      try { document.execCommand('copy'); } catch (e) { }
      $('st-status').textContent = '✓ copied';
      window.getSelection().removeAllRanges();
    });

    renderRefs();
  }

  if (typeof window !== 'undefined' && window.LeadToolkit) {
    window.LeadToolkit.registerApp({
      id: 'stress',
      icon: '📊🧘',
      group: 'Class 3 - Influence and Persuasion',
      name: 'Plot Generator | Stress Mindsets',
      code: 'PGN-SMS',
      intro: { upload: '"Ponce de Leon DM Data" (SMS_1-8)', to: 'the stress-mindset number line with your cluster\'s arrow' },
      tags: ['stress', 'mindset', 'SMS', 'number line', 'composite', 'ponce de leon'],
      description: 'Scores the SMS_1…8 stress-mindset items (odd items reversed; reproduces the slide\'s 3.06), states the cluster mean, and draws the reference line with the arrow in the ballpark.',
      mount: mount
    });
  }
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { smsScore: smsScore, findSmsColumns: findSmsColumns, mean: mean };
  }
})();
