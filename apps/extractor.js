/* ==========================================================================
   App 6 | Data Extractor (Class 2 - Decision Making)
   Turns the class survey (CSV/xlsx) into PASTEABLE TEXT stats | no images,
   no slides. Handles both study designs:
     • "Compare separate columns": each column IS a condition (Qualtrics
       randomization, e.g. anchoring30k vs anchoring80k, or gainframe vs
       lossframe | each respondent answered only one).
     • "One column grouped by another": classic value × condition columns.
   Presets for the German Car anchoring exercise and the Loss-Gains framing
   exercise auto-find their columns by variable NAME and by QUESTION TEXT,
   so they keep working when names change across years.
   Reports n / mean / SD / median / min / max per condition and overall for
   numeric data; counts + % per condition for categorical data; plus a
   Welch t-test (2 numeric conditions) or chi-square (2×2) at the end.
   ========================================================================== */

(function () {
  'use strict';

  /* ======================================================================
     PURE LOGIC (exported for node tests)
     ====================================================================== */

  // "$60,000" / "60k" / " 35.5 " -> number; junk -> null
  function parseNum(v) {
    var s = String(v === null || v === undefined ? '' : v).trim();
    if (!s) return null;
    var k = /^[^\d\-]*(-?[\d.,]+)\s*[kK]\b/.exec(s);
    var m = /-?\d[\d,]*\.?\d*/.exec(s.replace(/\s/g, ''));
    if (!m) return null;
    var num = parseFloat(m[0].replace(/,/g, ''));
    if (isNaN(num)) return null;
    if (k) num *= 1000;
    return num;
  }

  function mean(xs) {
    var s = 0;
    xs.forEach(function (x) { s += x; });
    return xs.length ? s / xs.length : NaN;
  }

  function sdSample(xs) {
    if (xs.length < 2) return NaN;
    var m = mean(xs), s = 0;
    xs.forEach(function (x) { s += (x - m) * (x - m); });
    return Math.sqrt(s / (xs.length - 1));
  }

  function median(xs) {
    if (!xs.length) return NaN;
    var a = xs.slice().sort(function (x, y) { return x - y; });
    var mid = Math.floor(a.length / 2);
    return a.length % 2 ? a[mid] : (a[mid - 1] + a[mid]) / 2;
  }

  /* ---- distributions (for the optional significance lines) ---- */

  function lgamma(x) {
    var g = [676.5203681218851, -1259.1392167224028, 771.32342877765313,
      -176.61502916214059, 12.507343278686905, -0.13857109526572012,
      9.9843695780195716e-6, 1.5056327351493116e-7];
    if (x < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * x)) - lgamma(1 - x);
    x -= 1;
    var a = 0.99999999999980993, t = x + 7.5;
    for (var i = 0; i < 8; i++) a += g[i] / (x + i + 1);
    return 0.5 * Math.log(2 * Math.PI) + (x + 0.5) * Math.log(t) - t + Math.log(a);
  }

  function betacf(x, a, b) {
    var qab = a + b, qap = a + 1, qam = a - 1;
    var c = 1, d = 1 - qab * x / qap;
    if (Math.abs(d) < 1e-30) d = 1e-30;
    d = 1 / d;
    var h = d;
    for (var m = 1; m <= 200; m++) {
      var m2 = 2 * m;
      var aa = m * (b - m) * x / ((qam + m2) * (a + m2));
      d = 1 + aa * d; if (Math.abs(d) < 1e-30) d = 1e-30;
      c = 1 + aa / c; if (Math.abs(c) < 1e-30) c = 1e-30;
      d = 1 / d; h *= d * c;
      aa = -(a + m) * (qab + m) * x / ((a + m2) * (qap + m2));
      d = 1 + aa * d; if (Math.abs(d) < 1e-30) d = 1e-30;
      c = 1 + aa / c; if (Math.abs(c) < 1e-30) c = 1e-30;
      d = 1 / d;
      var del = d * c;
      h *= del;
      if (Math.abs(del - 1) < 3e-12) break;
    }
    return h;
  }

  function incBeta(x, a, b) {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    var bt = Math.exp(lgamma(a + b) - lgamma(a) - lgamma(b) + a * Math.log(x) + b * Math.log(1 - x));
    if (x < (a + 1) / (a + b + 2)) return bt * betacf(x, a, b) / a;
    return 1 - bt * betacf(1 - x, b, a) / b;
  }

  // two-tailed p for Student t with df degrees of freedom
  function tTwoTailP(t, df) {
    return incBeta(df / (df + t * t), df / 2, 0.5);
  }

  function erfc(z) {
    var t = 1 / (1 + 0.3275911 * Math.abs(z));
    var y = t * (0.254829592 + t * (-0.284496736 + t * (1.421413741 + t * (-1.453152027 + t * 1.061405429)))) * Math.exp(-z * z);
    return z >= 0 ? y : 2 - y;
  }

  // survival p for chi-square with 1 df
  function chi2P1(x) { return erfc(Math.sqrt(x / 2)); }

  function welch(a, b) {
    var n1 = a.length, n2 = b.length;
    if (n1 < 2 || n2 < 2) return null;
    var m1 = mean(a), m2 = mean(b);
    var v1 = Math.pow(sdSample(a), 2), v2 = Math.pow(sdSample(b), 2);
    var se2 = v1 / n1 + v2 / n2;
    if (!se2) return null;
    var t = (m1 - m2) / Math.sqrt(se2);
    var df = se2 * se2 / ((v1 / n1) * (v1 / n1) / (n1 - 1) + (v2 / n2) * (v2 / n2) / (n2 - 1));
    return { t: t, df: df, p: tTwoTailP(Math.abs(t), df) };
  }

  function chi2Test2xN(counts1, counts2) {   // {value: n} per condition
    var values = {};
    Object.keys(counts1).forEach(function (v) { values[v] = 1; });
    Object.keys(counts2).forEach(function (v) { values[v] = 1; });
    var keys = Object.keys(values);
    if (keys.length !== 2) return null;      // only clean 2×2
    var o = [[counts1[keys[0]] || 0, counts1[keys[1]] || 0],
             [counts2[keys[0]] || 0, counts2[keys[1]] || 0]];
    var rowT = [o[0][0] + o[0][1], o[1][0] + o[1][1]];
    var colT = [o[0][0] + o[1][0], o[0][1] + o[1][1]];
    var N = rowT[0] + rowT[1];
    if (!N || !rowT[0] || !rowT[1] || !colT[0] || !colT[1]) return null;
    var chi2 = 0;
    for (var r = 0; r < 2; r++) for (var c = 0; c < 2; c++) {
      var e = rowT[r] * colT[c] / N;
      chi2 += (o[r][c] - e) * (o[r][c] - e) / e;
    }
    return { chi2: chi2, p: chi2P1(chi2) };
  }

  /* which of the first FOUR rows holds the short variable names?
     Scores each row: +1 per cell matching short-name shape (no ImportId),
     -3 per cell containing ImportId, -2 per cell longer than 60 chars;
     header = earliest row scoring >= 0.9 * max. Accepts either the whole
     raw array of rows, or the legacy (row0, row1) call shape. */
  function detectVarNameRow(rows, legacyRow1) {
    if (!rows || !rows.length) return 0;
    if (!Array.isArray(rows[0])) rows = legacyRow1 ? [rows, legacyRow1] : [rows];
    var scores = [], max = -Infinity, ri, ci;
    var lim = Math.min(4, rows.length);
    for (ri = 0; ri < lim; ri++) {
      var row = rows[ri] || [], s = 0;
      for (ci = 0; ci < row.length; ci++) {
        var cell = String(row[ci] === undefined || row[ci] === null ? '' : row[ci]);
        var hasImport = cell.indexOf('ImportId') !== -1;
        if (!hasImport && /^[A-Za-z][\w .()-]{0,28}$/.test(cell)) s += 1;
        if (hasImport) s -= 3;
        if (cell.length > 60) s -= 2;
      }
      scores.push(s);
      if (s > max) max = s;
    }
    for (ri = 0; ri < scores.length; ri++) {
      if (scores[ri] >= 0.9 * max) return ri;
    }
    return 0;
  }

  // preset matchers: by variable name OR question text (robust across years)
  function findCarColumns(names, qtexts) {
    var out = [];
    names.forEach(function (nm, i) {
      var q = qtexts[i] || '';
      if (/anchor/i.test(nm) || /how much do you think the average german/i.test(q)) out.push(i);
    });
    return out;
  }

  function findFrameColumns(names, qtexts) {
    var out = [];
    names.forEach(function (nm, i) {
      var q = qtexts[i] || '';
      if (/^(loss|gain).*frame|frame.*(loss|gain)|^(loss|gain)frame$/i.test(nm) ||
          /which plan do you decide/i.test(q)) out.push(i);
    });
    return out;
  }

  // Better-than-Average items: bta_* names, or the percentile-slider questions
  var BTA_LABELS = {
    decmaking: 'Decision Making', bargaining: 'Bargaining Ability',
    intelligence: 'Intelligence', driving: 'Driving Ability',
    health: 'Your Health', charity: 'Contributions to Charity',
    physattrac: 'Attractiveness', goodfrnds: 'Number of Good Friends'
  };

  function findBtaColumns(names, qtexts) {
    var out = [];
    names.forEach(function (nm, i) {
      var q = qtexts[i] || '';
      if (/^bta[_.]/i.test(nm) ||
          /^(your|the number of good) .*(abilit|intelligence|health|charitable|attractiveness|friends)/i.test(q)) {
        out.push(i);
      }
    });
    return out;
  }

  function btaLabel(name, qtext) {
    var m = /^bta[_.](\w+)/i.exec(name);
    if (m && BTA_LABELS[m[1].toLowerCase()]) return BTA_LABELS[m[1].toLowerCase()];
    return String(qtext || name).replace(/\s+/g, ' ').trim().slice(0, 40) || name;
  }

  // number formatting: currency -> $ + thousands; else smart decimals
  function fmtNum(x, currency) {
    if (x === null || x === undefined || isNaN(x)) return '-';
    if (currency) {
      var r = Math.round(Math.abs(x));   // round half away from zero
      return (x < 0 ? '-$' : '$') + r.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    }
    var d = Math.abs(x) >= 1000 ? 0 : Math.abs(x) >= 100 ? 1 : 2;
    var s = x.toFixed(d);
    if (d > 0) s = s.replace(/\.?0+$/, '');
    return s.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  }

  function pct(n, total) {
    return total ? (100 * n / total).toFixed(1).replace(/\.0$/, '') + '%' : '-';
  }

  /* ======================================================================
     UI
     ====================================================================== */

  // three REAL apps share this machinery; each mounts with a FIXED preset
  var PRESETS = {
    car:    { name: 'Data Extractor | German Car', code: 'DEX-CAR', icon: '🧮🚗',
              want: 'a nightly survey with the anchoring columns (anchoring30k / anchoring80k, one answered per person)' },
    frames: { name: 'Data Extractor | Loss & Gains', code: 'DEX-LGS', icon: '🧮⚖️',
              want: 'a nightly survey with the framing columns (gainframe / lossframe, Plan A vs Plan B)' },
    bta:    { name: 'Data Extractor | Better than Average', code: 'DEX-BTA', icon: '🧮🏆',
              want: 'a nightly survey with the bta_ self-placement sliders (0-100)' }
  };

  function mountWith(container, preset) {
    var P = PRESETS[preset];
    var state = {
      _preset: preset,
      raw: [], headers: [], qtexts: [], rows: [], fileName: null, _sheets: null,
      headerRow: 0,
      filterCol: -1, includeValues: null,
      mode: 'split',              // 'split' | 'grouped'
      splitCols: [],              // indices, each column = a condition
      valueCol: -1, groupCol: -1, // grouped mode
      treat: 'auto',              // 'auto' | 'numeric' | 'cat'
      currency: false,
      pctAbove: null,             // e.g. 50 → report "% above 50" per condition
      condLabels: null,           // {colIndex: friendly label} set by presets
      presetName: null,
      _appliedSub: ''
    };

    container.innerHTML = '' +
      '<div class="app-title"><h2>' + P.icon + ' ' + P.name + '</h2>' +
      '<span class="sub">Survey in → pasteable stats out (mean, SD, n, %s per condition). German Car & Loss-Gains presets included. Nothing is uploaded.</span></div>' +
      '<div class="app-layout">' +
      '  <div class="sidebar">' +

      '    <details class="step" open id="dx-step1">' +
      '      <summary><span class="n">1</span> Load data <span class="hint" id="dx-fhint"></span></summary>' +
      '      <div class="body">' +
      '        <div class="dropzone" id="dx-drop"><strong>DROP DATA HERE</strong><ul class="drop-spec"><li><b>Type of file:</b> CSV or Excel (.xlsx)</li><li><b>What you\'re looking for:</b> ' + P.want + '</li></ul></div>' +
      '        <input type="file" id="dx-file" accept=".csv,.tsv,.txt,.xlsx,.xlsm,.xltx" style="display:none">' +
      '        <div id="dx-fileinfo"></div>' +
      '        <label class="field" id="dx-sheetrow" style="display:none">Sheet<select id="dx-sheet"></select></label>' +
      '        <div class="clusterblock" id="dx-filterblock" style="display:none">' +
      '          <div class="clusterlabel">Select cluster(s)</div>' +
      '          <label class="field">Cluster column<select id="dx-filtercol"></select></label>' +
      '          <div id="dx-filtervals"></div>' +
      '        </div>' +
      '        <div class="row"><button id="dx-demo" class="fixed">🎲 Demo data</button></div>' +
      '      </div>' +
      '    </details>' +

      '    <details class="step disabled" open id="dx-step2">' +
      '      <summary><span class="n">2</span> What to extract</summary>' +
      '      <div class="body">' +
      '        <div class="small-note" id="dx-presetnote"></div>' +
      '        <label class="field">Design' +
      '          <select id="dx-mode">' +
      '            <option value="split">Compare separate columns (each column = a condition)</option>' +
      '            <option value="grouped">One column, grouped by another</option>' +
      '          </select></label>' +
      '        <div id="dx-splitui">' +
      '          <div class="small-note">Tick the columns to compare:</div>' +
      '          <div class="value-list" id="dx-colpick" style="max-height:220px"></div>' +
      '        </div>' +
      '        <div id="dx-groupui" style="display:none">' +
      '          <label class="field">Value column (the numbers / answers)<select id="dx-valuecol"></select></label>' +
      '          <label class="field">Condition column (the groups)<select id="dx-groupcol"></select></label>' +
      '        </div>' +
      '        <div class="row">' +
      '          <label class="field">Treat values as' +
      '            <select id="dx-treat">' +
      '              <option value="auto">Auto-detect</option>' +
      '              <option value="numeric">Numbers (mean, SD…)</option>' +
      '              <option value="cat">Categories (counts, %)</option>' +
      '            </select></label>' +
      '          <label class="check fixed" style="align-self:end"><input type="checkbox" id="dx-currency"> $ format</label>' +
      '          <label class="field fixed" style="width:130px">Also: % above' +
      '            <input type="number" id="dx-pctabove" placeholder="e.g. 50"></label>' +
      '        </div>' +
      '      </div>' +
      '    </details>' +
      '  </div>' +

      '  <div class="preview-panel">' +
      '    <div class="preview-toolbar">' +
      '      <button id="dx-copy" class="primary" disabled>📋 Copy text</button>' +
      '      <span class="status" id="dx-status"></span>' +
      '    </div>' +
      '    <div class="empty-msg" id="dx-empty">output displayed HERE</div>' +
      '    <textarea id="dx-out" readonly spellcheck="false" style="display:none;width:100%;min-height:520px;font:12.5px/1.5 ui-monospace, Menlo, Consolas, monospace;border:1px solid var(--line);border-radius:8px;padding:12px;background:#fff;color:var(--ink);resize:vertical"></textarea>' +
      '  </div>' +
      '</div>';

    var $ = function (id) { return container.querySelector('#' + id); };

    function escapeHtml(s) {
      return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    /* ---------- file loading (same pattern as the other apps) ---------- */

    function sniffEncoding(buf) {
      var b = new Uint8Array(buf.slice(0, 2));
      if (b[0] === 0xFF && b[1] === 0xFE) return 'utf-16le';
      if (b[0] === 0xFE && b[1] === 0xFF) return 'utf-16be';
      return 'utf-8';
    }

    function parseCSVText(text) {
      if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);
      var nl = text.indexOf('\n') === -1 ? text.length : text.indexOf('\n');
      var line0 = text.slice(0, nl), counts = { ',': 0, '\t': 0, ';': 0 }, inQ0 = false;
      for (var q = 0; q < line0.length; q++) {
        var ch = line0[q];
        if (ch === '"') inQ0 = !inQ0;
        else if (!inQ0 && counts[ch] !== undefined) counts[ch]++;
      }
      var delim = counts['\t'] > counts[','] && counts['\t'] > counts[';'] ? '\t'
        : counts[';'] > counts[','] ? ';' : ',';
      var rows = [], row = [], field = '', i = 0, inQ = false;
      while (i < text.length) {
        var c = text[i];
        if (inQ) {
          if (c === '"') { if (text[i + 1] === '"') { field += '"'; i += 2; continue; } inQ = false; i++; continue; }
          field += c; i++; continue;
        }
        if (c === '"') { inQ = true; i++; continue; }
        if (c === delim) { row.push(field); field = ''; i++; continue; }
        if (c === '\r') { if (text[i + 1] === '\n') i++; row.push(field); rows.push(row); row = []; field = ''; i++; continue; }
        if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; i++; continue; }
        field += c; i++;
      }
      if (field !== '' || row.length) { row.push(field); rows.push(row); }
      return rows.filter(function (r) { return r.some(function (x) { return x !== ''; }); });
    }

    function dedupeHeaders(headers) {
      var seen = {};
      return headers.map(function (h, idx) {
        var n = (h === null || h === undefined || h === '') ? 'column ' + (idx + 1) : String(h).trim();
        if (seen[n]) { seen[n]++; n = n + ' (' + seen[n] + ')'; } else { seen[n] = 1; }
        return n;
      });
    }

    function loadFile(file) {
      file.arrayBuffer().then(function (buf) {
        var bytes = new Uint8Array(buf);
        if (window.xlsxLite && window.xlsxLite.isZipFile(bytes)) {
          return window.parseXlsx(buf).then(function (sheets) {
            sheets = sheets.filter(function (s) { return s.rows.length; });
            if (!sheets.length) throw new Error('the workbook has no data');
            state._sheets = sheets; state.fileName = file.name;
            $('dx-sheet').innerHTML = sheets.map(function (s, i) {
              return '<option value="' + i + '">' + escapeHtml(s.name) + '</option>';
            }).join('');
            $('dx-sheetrow').style.display = sheets.length > 1 ? '' : 'none';
            useSheet(0);
          });
        }
        $('dx-sheetrow').style.display = 'none';
        var text = new TextDecoder(sniffEncoding(buf)).decode(buf);
        loadRaw(parseCSVText(text), file.name);
      }).catch(function (err) {
        $('dx-fileinfo').innerHTML = '<span class="file-warn">Could not read file: ' + (err.message || err) + '</span>';
      });
    }

    function useSheet(i) {
      var s = state._sheets[i];
      var rows = s.rows.map(function (r) {
        return r.map(function (c) { return c === null || c === undefined ? '' : String(c); });
      });
      loadRaw(rows, state.fileName + (state._sheets.length > 1 ? ' · ' + s.name : ''));
    }

    function loadRaw(raw, name) {
      if (raw.length < 2) {
        $('dx-fileinfo').innerHTML = '<span class="file-warn">That file has no data rows.</span>';
        return;
      }
      state.raw = raw;
      state.fileName = name;
      state.headerRow = detectVarNameRow(raw);
      applyHeaderChoice();
      $('dx-filterblock').style.display = '';
      $('dx-fileinfo').innerHTML = '<span class="file-info">✓ ' + escapeHtml(name) + ' · ' +
        state.rows.length + ' responses × ' + state.headers.length + ' columns' +
        (state.headerRow > 0 ? ' · variable names taken from row ' + (state.headerRow + 1) : '') + '</span>';
      $('dx-fhint').textContent = name;
      $('dx-step2').classList.remove('disabled');
    }

    function applyHeaderChoice() {
      var hr = state.headerRow;
      state.headers = dedupeHeaders(state.raw[hr]);
      // question texts live in the longest-celled row ABOVE the header (if any)
      var qRow = -1, qAvg = 0;
      for (var ri = 0; ri < hr; ri++) {
        var s = 0, k = 0;
        state.raw[ri].forEach(function (c) {
          var t = String(c === undefined || c === null ? '' : c);
          if (t) { s += t.length; k++; }
        });
        var a = k ? s / k : 0;
        if (a > qAvg && state.raw[ri].join(' ').indexOf('ImportId') === -1) { qAvg = a; qRow = ri; }
      }
      state.qtexts = (qRow >= 0 ? state.raw[qRow] : state.raw[hr]).map(String);
      state.rows = state.raw.slice(hr + 1);
      // drop leftover Qualtrics rows under the header: any ImportId row, plus
      // qtext-like rows among the next 2 (>40% of non-empty cells over 40 chars)
      var dropped = 0;
      while (state.rows.length && dropped < 2) {
        if (state.rows[0].join(' ').indexOf('ImportId') !== -1) { state.rows.shift(); continue; }
        var cells = state.rows[0].filter(function (c) { return String(c).trim(); });
        var longs = cells.filter(function (c) { return String(c).length > 40; }).length;
        if (cells.length && longs / cells.length > 0.4) { state.rows.shift(); dropped++; }
        else break;
      }
      state.filterCol = state.headers.findIndex(function (h, i) {
        return /cluster/i.test(h) || /which cluster/i.test(state.qtexts[i] || '');
      });
      state.includeValues = null;
      state.splitCols = [];
      state.valueCol = -1; state.groupCol = -1;
      state.presetName = null;

      var opts = state.headers.map(function (h, i) { return '<option value="' + i + '">' + escapeHtml(h) + '</option>'; }).join('');
      $('dx-filtercol').innerHTML = '<option value="-1">- no filter -</option>' + opts;
      $('dx-filtercol').value = String(state.filterCol);
      $('dx-valuecol').innerHTML = opts;
      $('dx-groupcol').innerHTML = opts;
      buildFilterValues();
      buildColPick();
      tryPreset(state._preset, true);   // this app IS its preset
      refresh();
    }

    function buildFilterValues() {
      var box = $('dx-filtervals');
      box.innerHTML = '';
      if (state.filterCol < 0 || !state.rows.length) return;
      var uniq = new Map();
      state.rows.forEach(function (r) {
        var v = String(r[state.filterCol] === undefined ? '' : r[state.filterCol]).trim();
        uniq.set(v, (uniq.get(v) || 0) + 1);
      });
      if (uniq.size > 40) { box.innerHTML = '<div class="small-note">⚠ too many values in that column.</div>'; state.includeValues = null; return; }
      // cluster doctrine: NOTHING ticked by default; auto-tick a lone value
      if (state.includeValues === null) {
        state.includeValues = new Set();
        if (uniq.size === 1) uniq.forEach(function (n, v) { state.includeValues.add(v); });
      }
      var btns = document.createElement('div');
      btns.className = 'row';
      btns.innerHTML = '<button type="button" class="fixed">Select all</button>' +
        '<button type="button" class="fixed">Clear all</button>';
      var bs = btns.querySelectorAll('button');
      bs[0].addEventListener('click', function () {
        uniq.forEach(function (n, v) { state.includeValues.add(v); });
        buildFilterValues(); refresh();
      });
      bs[1].addEventListener('click', function () {
        state.includeValues.clear();
        buildFilterValues(); refresh();
      });
      box.appendChild(btns);
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
          refresh();
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

    /* ---------- column picking ---------- */

    function buildColPick() {
      var box = $('dx-colpick');
      box.innerHTML = '';
      state.headers.forEach(function (h, i) {
        var lab = document.createElement('label');
        var on = state.splitCols.indexOf(i) !== -1;
        lab.className = on ? 'on' : '';
        lab.title = (state.qtexts[i] || '').slice(0, 200);
        lab.innerHTML = '<input type="checkbox" ' + (on ? 'checked' : '') + '> ' + escapeHtml(h);
        lab.querySelector('input').addEventListener('change', function (e) {
          if (e.target.checked) { if (state.splitCols.indexOf(i) === -1) state.splitCols.push(i); }
          else state.splitCols = state.splitCols.filter(function (x) { return x !== i; });
          lab.className = e.target.checked ? 'on' : '';
          state.presetName = null;
          $('dx-presetnote').textContent = '';
          refresh();
        });
        box.appendChild(lab);
      });
    }

    function syncColPick() {
      Array.prototype.forEach.call($('dx-colpick').querySelectorAll('label'), function (lab, i) {
        var on = state.splitCols.indexOf(i) !== -1;
        lab.className = on ? 'on' : '';
        lab.querySelector('input').checked = on;
      });
    }

    function tryPreset(which, silentIfMissing) {
      if (!state.headers.length) return;
      var idx = which === 'car' ? findCarColumns(state.headers, state.qtexts)
        : which === 'frames' ? findFrameColumns(state.headers, state.qtexts)
        : findBtaColumns(state.headers, state.qtexts);
      if (!idx.length) {
        if (!silentIfMissing) $('dx-presetnote').textContent = '⚠ could not find those columns in this file; tick them by hand below.';
        return;
      }
      state.mode = 'split';
      $('dx-mode').value = 'split';
      state.splitCols = idx;
      state.treat = which === 'frames' ? 'cat' : 'numeric';
      $('dx-treat').value = state.treat;
      state.currency = which === 'car';
      $('dx-currency').checked = state.currency;
      state.pctAbove = which === 'bta' ? 50 : null;
      $('dx-pctabove').value = state.pctAbove === null ? '' : String(state.pctAbove);
      state.condLabels = null;
      if (which === 'bta') {
        state.condLabels = {};
        idx.forEach(function (i) { state.condLabels[i] = btaLabel(state.headers[i], state.qtexts[i]); });
      }
      state.presetName = which === 'car' ? 'German Car (anchoring)'
        : which === 'frames' ? 'Loss-Gains (framing)'
        : 'Better than Average (0-100 self-placement; the slide number is the MEAN)';
      $('dx-presetnote').textContent = '✓ ' + state.presetName.split(' (')[0] + ' → ' +
        idx.map(function (i) { return state.headers[i]; }).join(', ');
      syncModeUI();
      syncColPick();
      refresh();
    }

    /* ---------- report building ---------- */

    function isNumericSet(values) {
      var n = 0, num = 0;
      values.forEach(function (v) {
        var s = String(v).trim();
        if (!s) return;
        n++;
        if (parseNum(s) !== null && /\d/.test(s)) num++;
      });
      return n > 0 && num / n >= 0.7;
    }

    function conditionData() {
      var rows = includedRows();
      var conds = [];
      if (state.mode === 'split') {
        state.splitCols.forEach(function (ci) {
          conds.push({
            label: (state.condLabels && state.condLabels[ci]) || state.headers[ci],
            qtext: state.qtexts[ci] || '',
            values: rows.map(function (r) { return String(r[ci] === undefined ? '' : r[ci]).trim(); })
              .filter(function (v) { return v !== '' && v !== 'NA'; })
          });
        });
      } else {
        if (state.valueCol < 0 || state.groupCol < 0) return [];
        var byGroup = new Map();
        rows.forEach(function (r) {
          var g = String(r[state.groupCol] === undefined ? '' : r[state.groupCol]).trim();
          var v = String(r[state.valueCol] === undefined ? '' : r[state.valueCol]).trim();
          if (!g || !v || v === 'NA') return;
          if (!byGroup.has(g)) byGroup.set(g, []);
          byGroup.get(g).push(v);
        });
        Array.from(byGroup.keys()).sort().forEach(function (g) {
          conds.push({
            label: state.headers[state.groupCol] + ' = ' + g,
            qtext: state.qtexts[state.valueCol] || '',
            values: byGroup.get(g)
          });
        });
      }
      return conds;
    }

    function cleanQ(q) {
      return String(q).replace(/\s+/g, ' ').trim().slice(0, 110);
    }

    function buildReport() {
      var conds = conditionData();
      if (!conds.length || !conds.some(function (c) { return c.values.length; })) return null;

      var numeric = state.treat === 'numeric' ? true
        : state.treat === 'cat' ? false
        : isNumericSet(conds[0].values.concat(conds[1] ? conds[1].values : []));

      var cur = state.currency;
      var L = [];
      var title = state.presetName ||
        (state.mode === 'split'
          ? conds.map(function (c) { return c.label; }).join(' vs ')
          : state.headers[state.valueCol] + ' by ' + state.headers[state.groupCol]);
      L.push('=== ' + title + ' ===');
      L.push('File: ' + state.fileName);
      if (state.filterCol >= 0 && state.includeValues) {
        var all = new Set();
        state.rows.forEach(function (r) { all.add(String(r[state.filterCol] === undefined ? '' : r[state.filterCol]).trim()); });
        if (state.includeValues.size < all.size) {
          L.push('Filter: ' + state.headers[state.filterCol] + ' = ' + Array.from(state.includeValues).join(' / '));
        }
      }
      L.push('Responses in file: ' + state.rows.length + ' · after filter: ' + includedRows().length);
      L.push('');

      var numericSets = [];

      conds.forEach(function (c, k) {
        L.push('CONDITION ' + (k + 1) + ' | ' + c.label);
        if (c.qtext && c.qtext !== c.label) L.push('  question: "' + cleanQ(c.qtext) + '"');
        if (numeric) {
          var nums = [], junk = [];
          c.values.forEach(function (v) {
            var x = parseNum(v);
            if (x === null) junk.push(v); else nums.push(x);
          });
          numericSets.push(nums);
          L.push('  n = ' + nums.length + (junk.length ? '   (ignored ' + junk.length + ' non-numeric: ' + junk.slice(0, 4).map(function (j) { return '"' + j + '"'; }).join(', ') + (junk.length > 4 ? ', …' : '') + ')' : ''));
          L.push('  mean   = ' + fmtNum(mean(nums), cur));
          L.push('  SD     = ' + fmtNum(sdSample(nums), cur) + '   (sample, n-1)');
          L.push('  median = ' + fmtNum(median(nums), cur));
          if (nums.length) L.push('  min / max = ' + fmtNum(Math.min.apply(null, nums), cur) + ' / ' + fmtNum(Math.max.apply(null, nums), cur));
          if (state.pctAbove !== null && nums.length) {
            var above = nums.filter(function (x) { return x > state.pctAbove; }).length;
            L.push('  above ' + state.pctAbove + ' = ' + above + ' of ' + nums.length + ' (' + pct(above, nums.length) + ')');
          }
        } else {
          var counts = {};
          c.values.forEach(function (v) { counts[v] = (counts[v] || 0) + 1; });
          var total = c.values.length;
          L.push('  n = ' + total);
          Object.keys(counts).sort(function (a, b) { return counts[b] - counts[a] || a.localeCompare(b); })
            .forEach(function (v) {
              L.push('  ' + v + ': ' + counts[v] + ' (' + pct(counts[v], total) + ')');
            });
          c._counts = counts;
        }
        L.push('');
      });

      // combined
      if (numeric) {
        var allNums = [];
        numericSets.forEach(function (s) { allNums = allNums.concat(s); });
        L.push('ALL CONDITIONS COMBINED');
        L.push('  n = ' + allNums.length + '   mean = ' + fmtNum(mean(allNums), cur) +
          '   SD = ' + fmtNum(sdSample(allNums), cur) + '   median = ' + fmtNum(median(allNums), cur));
        if (numericSets.length === 2 && numericSets[0].length > 1 && numericSets[1].length > 1) {
          L.push('');
          L.push('COMPARISON (condition 1 vs condition 2)');
          L.push('  difference of means = ' + fmtNum(mean(numericSets[0]) - mean(numericSets[1]), cur));
          var w = welch(numericSets[0], numericSets[1]);
          if (w) L.push('  Welch t-test: t(' + w.df.toFixed(1) + ') = ' + w.t.toFixed(2) +
            ', two-tailed p ' + (w.p < 0.001 ? '< .001' : '= ' + w.p.toFixed(3).replace(/^0/, '')));
        }
      } else {
        var totalCounts = {}, grand = 0;
        conds.forEach(function (c) {
          Object.keys(c._counts || {}).forEach(function (v) {
            totalCounts[v] = (totalCounts[v] || 0) + c._counts[v];
            grand += c._counts[v];
          });
        });
        L.push('ALL CONDITIONS COMBINED (n = ' + grand + ')');
        Object.keys(totalCounts).sort(function (a, b) { return totalCounts[b] - totalCounts[a]; })
          .forEach(function (v) {
            L.push('  ' + v + ': ' + totalCounts[v] + ' (' + pct(totalCounts[v], grand) + ')');
          });
        if (conds.length === 2) {
          var x2 = chi2Test2xN(conds[0]._counts || {}, conds[1]._counts || {});
          if (x2) {
            L.push('');
            L.push('COMPARISON (2×2 chi-square)');
            L.push('  χ²(1) = ' + x2.chi2.toFixed(2) + ', p ' + (x2.p < 0.001 ? '< .001' : '= ' + x2.p.toFixed(3).replace(/^0/, '')));
          }
        }
      }
      L.push('');
      L.push('- generated by LEAD Toolkit -');
      return L.join('\n');
    }

    function refresh() {
      var empty = $('dx-empty');
      // cluster doctrine: with a filter column and nothing ticked, show the
      // nudge instead of stats
      if (state.rows.length && state.filterCol >= 0 &&
          state.includeValues !== null && state.includeValues.size === 0) {
        $('dx-out').style.display = 'none';
        empty.textContent = 'tick your cluster(s) above to continue';
        empty.style.display = '';
        $('dx-copy').disabled = true;
        $('dx-status').textContent = '';
        return;
      }
      empty.textContent = 'output displayed HERE';
      var report = null;
      try { report = buildReport(); } catch (e) { report = 'Something went wrong: ' + (e.message || e); }
      var out = $('dx-out');
      if (report) {
        out.style.display = '';
        $('dx-empty').style.display = 'none';
        out.value = report;
        $('dx-copy').disabled = false;
        var conds = state.mode === 'split' ? state.splitCols.length : 'grouped';
        $('dx-status').textContent = includedRows().length + ' responses · ' +
          (state.mode === 'split' ? state.splitCols.length + ' condition column(s)' : 'grouped design');
      } else {
        out.style.display = 'none';
        $('dx-empty').style.display = '';
        $('dx-copy').disabled = true;
        $('dx-status').textContent = '';
      }
    }

    function syncModeUI() {
      $('dx-splitui').style.display = state.mode === 'split' ? '' : 'none';
      $('dx-groupui').style.display = state.mode === 'grouped' ? '' : 'none';
    }

    /* ---------- events ---------- */

    var drop = $('dx-drop'), fileInput = $('dx-file');
    drop.addEventListener('click', function () { fileInput.click(); });
    fileInput.addEventListener('change', function () { if (fileInput.files[0]) loadFile(fileInput.files[0]); });
    ['dragover', 'dragenter'].forEach(function (ev) {
      drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.add('drag'); });
    });
    ['dragleave', 'drop'].forEach(function (ev) {
      drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.remove('drag'); });
    });
    drop.addEventListener('drop', function (e) { if (e.dataTransfer.files[0]) loadFile(e.dataTransfer.files[0]); });

    $('dx-sheet').addEventListener('change', function (e) { useSheet(+e.target.value); });
    $('dx-filtercol').addEventListener('change', function (e) {
      state.filterCol = +e.target.value; state.includeValues = null; buildFilterValues(); refresh();
    });

    // demo survey: anchoring split-columns + framing + bta sliders
    $('dx-demo').addEventListener('click', function () {
      var head = ['Cluster', 'anchoring30k', 'anchoring80k', 'gainframe', 'lossframe', 'bta_decmaking', 'bta_intelligence', 'bta_driving'];
      var raw = [head];
      // framing flip like the real slides, deterministic (index patterns):
      // gainframe ~72% Plan A / 28% Plan B; lossframe ~58% Plan B / 42% Plan A
      for (var i = 0; i < 60; i++) {
        var low = i % 2 === 0;          // even rows: 30k anchor + gainframe
        var half = Math.floor(i / 2);   // 0..29 within each frame
        var gainPick = ((half * 4) % 15) >= 11 ? 'Plan B' : 'Plan A';  // 22 A / 8 B
        var lossPick = ((half * 7) % 30) < 17 ? 'Plan B' : 'Plan A';   // 17 B / 13 A
        raw.push([
          'Cluster H - Demo',
          low ? String(28000 + (i % 7) * 2000) : '',
          low ? '' : String(52000 + (i % 7) * 5000),
          low ? gainPick : '',
          low ? '' : lossPick,
          String(40 + ((i * 7) % 55)), String(45 + ((i * 11) % 50)), String(50 + ((i * 5) % 45))
        ]);
      }
      loadRaw(raw, 'demo data');
      tryPreset(state._preset, true);
    });


    $('dx-pctabove').addEventListener('change', function (e) {
      var v = e.target.value.trim();
      state.pctAbove = v === '' ? null : parseFloat(v);
      if (isNaN(state.pctAbove)) state.pctAbove = null;
      refresh();
    });



    $('dx-mode').addEventListener('change', function (e) {
      state.mode = e.target.value; state.presetName = null; $('dx-presetnote').textContent = '';
      syncModeUI(); refresh();
    });
    $('dx-valuecol').addEventListener('change', function (e) { state.valueCol = +e.target.value; state.presetName = null; refresh(); });
    $('dx-groupcol').addEventListener('change', function (e) { state.groupCol = +e.target.value; state.presetName = null; refresh(); });
    $('dx-treat').addEventListener('change', function (e) { state.treat = e.target.value; refresh(); });
    $('dx-currency').addEventListener('change', function (e) { state.currency = e.target.checked; refresh(); });

    $('dx-copy').addEventListener('click', function () {
      var out = $('dx-out');
      out.focus();
      out.select();
      var ok = false;
      try { ok = document.execCommand('copy'); } catch (e) { }
      if (!ok && navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(out.value).then(function () {
          $('dx-status').textContent = '✓ copied';
        });
      } else {
        $('dx-status').textContent = ok ? '✓ copied' : 'select the text and copy manually';
      }
      window.getSelection().removeAllRanges();
    });
  }

  /* ======================================================================
     REGISTER / EXPORT
     ====================================================================== */

  if (typeof window !== 'undefined' && window.LeadToolkit) {
    window.LeadToolkit.registerApp({
      id: 'extractor',
      icon: '🧮🚗',
      group: 'Class 2 - Decision Making',
      name: 'Data Extractor | German Car',
      code: 'DEX-CAR',
      intro: { upload: 'the nightly survey (CSV or Excel)', to: 'German Car anchoring stats: n, means, SDs per condition, Welch t-test' },
      tags: ['anchoring', 'german car', 't-test', 'statistics'],
      description: 'The German Car anchoring debrief: per-condition means and the test, pasteable.',
      mount: function (c) { mountWith(c, 'car'); }
    });
    window.LeadToolkit.registerApp({
      id: 'extractorlgs',
      icon: '🧮⚖️',
      group: 'Class 2 - Decision Making',
      name: 'Data Extractor | Loss & Gains',
      code: 'DEX-LGS',
      intro: { upload: 'the nightly survey (CSV or Excel)', to: 'Loss-Gains framing counts and %s per plan, with the chi-square' },
      tags: ['framing', 'loss', 'gain', 'chi-square', 'plan a', 'plan b'],
      description: 'The Loss-Gains framing debrief: counts and %s per plan, pasteable.',
      mount: function (c) { mountWith(c, 'frames'); }
    });
    window.LeadToolkit.registerApp({
      id: 'extractorbta',
      icon: '🧮🏆',
      group: 'Class 3 - Influence and Persuasion',
      name: 'Data Extractor | Better than Average',
      code: 'DEX-BTA',
      intro: { upload: 'the nightly survey with the bta_ sliders', to: 'per-trait means and the % above 50, pasteable' },
      tags: ['better than average', 'bta', 'percentile', 'sliders'],
      description: 'The Better-than-Average debrief: per-trait means (the slide numbers) and % above 50.',
      mount: function (c) { mountWith(c, 'bta'); }
    });
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
      parseNum: parseNum,
      mean: mean,
      sdSample: sdSample,
      median: median,
      tTwoTailP: tTwoTailP,
      chi2P1: chi2P1,
      welch: welch,
      chi2Test2xN: chi2Test2xN,
      detectVarNameRow: detectVarNameRow,
      findCarColumns: findCarColumns,
      findFrameColumns: findFrameColumns,
      findBtaColumns: findBtaColumns,
      btaLabel: btaLabel,
      fmtNum: fmtNum,
      pct: pct
    };
  }
})();
