/* ==========================================================================
   App | Plot Generator: Pareto Frontier (Class 6 - Negotiations)
   Recreates the Abhas-Bussan debrief: import the Negotiation Outcomes
   survey, pick your cluster, and every group lands in an EDITABLE table
   (the professor's own workbook warns outcomes have been entered wrong
   before, so check every row). Outcomes auto-compute from the five deal
   terms using the scoring tables derived from the DRRC workbook
   ("Negotiations Results Spreadsheet"), and can be typed over directly.
   Groups that hit the Pareto frontier stay plain; groups that miss it are
   highlighted yellow, like Rebecca's slide notes ask for.
   Outputs: the frontier plot (navy frontier + magenta group squares, PNG)
   and a 2-slide interpretation deck (plot + averages / % reached tables).
   Scoring checks (all reproduce her sheets exactly):
     (10y, yes, 40%, Canada, CAD) → 84 / 79      (Groups 1, 5, 8, 9, 10, 12)
     (10y, yes, 50%, Canada, CAD) → 79 / 89      (Group 2)
     (10y, yes, 30%, J. courts, CAD) → 89 / 62   (Group 7 on the slide)
     (0y, no, 50%, J. arbitration, CAD) → 19 / 105  (Efficient 1)
   ========================================================================== */

(function () {
  'use strict';

  /* ---------- pure logic (exported for tests) ---------- */

  // the case's Pareto-efficient outcomes (from the workbook + slide)
  var FRONTIER = [
    [19, 105], [29, 103], [59, 102], [64, 99], [74, 92], [79, 89], [84, 79],
    [94, 62], [99, 59], [104, 57], [109, 54], [114, 49], [119, 47], [124, 44], [125, 19]
  ];

  var TERM_KEYS = ['price', 'excl', 'profit', 'dispute', 'currency'];
  var TERMS = {
    price:    { label: 'Price', options: ['0', '5', '10'], show: { '0': '0 years', '5': '5 years', '10': '10 years' } },
    excl:     { label: 'Exclusivity', options: ['Y', 'N'], show: { Y: 'yes', N: 'no' } },
    profit:   { label: 'Profit sharing', options: ['10', '20', '30', '40', '50'], show: { '10': '10%', '20': '20%', '30': '30%', '40': '40%', '50': '50%' } },
    dispute:  { label: 'Dispute resolution', options: ['India', 'J. courts', 'J. arbitration', 'Canada'], show: {} },
    currency: { label: 'Currency', options: ['Yen', 'Rupee', 'CAD'], show: {} }
  };

  // payoff tables derived from the workbook's abhas/bussan sheets and
  // cross-checked against the slides; India / Yen / Rupee never appear in
  // her materials, so they default to 0 and are editable in the app
  function defaultPay() {
    return {
      A: {
        price: { '0': 0, '5': 10, '10': 40 },
        excl: { Y: 20, N: 5 },
        profit: { '10': 25, '20': 20, '30': 15, '40': 10, '50': 5 },
        dispute: { 'India': 0, 'J. courts': 7, 'J. arbitration': 2, 'Canada': 7 },
        currency: { 'Yen': 0, 'Rupee': 0, 'CAD': 7 }
      },
      B: {
        price: { '0': 5, '5': 3, '10': 2 },
        excl: { Y: 0, N: 10 },
        profit: { '10': 10, '20': 20, '30': 30, '40': 40, '50': 50 },
        dispute: { 'India': 0, 'J. courts': 5, 'J. arbitration': 15, 'Canada': 12 },
        currency: { 'Yen': 0, 'Rupee': 0, 'CAD': 25 }
      }
    };
  }

  function computeOutcome(terms, pay) {
    for (var i = 0; i < TERM_KEYS.length; i++) if (!terms[TERM_KEYS[i]]) return null;
    var a = 0, b = 0;
    TERM_KEYS.forEach(function (k) {
      a += pay.A[k][terms[k]] || 0;
      b += pay.B[k][terms[k]] || 0;
    });
    return { a: a, b: b };
  }

  function isOptimal(a, b) {
    return FRONTIER.some(function (p) { return p[0] === a && p[1] === b; });
  }

  // survey answers arrive as Qualtrics codes OR text; normalize both
  function normPrice(v) {
    var s = String(v || '').trim();
    if (/year/i.test(s)) { var m = /\d+/.exec(s); return m ? m[0] : ''; }
    return { 1: '0', 2: '5', 3: '10' }[s] || ({ 0: '0', 5: '5', 10: '10' }[s] || '');
  }
  function normExcl(v) {
    var s = String(v || '').trim();
    if (/^y(es)?$/i.test(s)) return 'Y';
    if (/^no?$/i.test(s)) return 'N';
    return { 1: 'Y', 2: 'N' }[s] || '';
  }
  function normProfit(v) {
    var s = String(v || '').trim();
    if (/%/.test(s)) { var m = /\d+/.exec(s); return m && TERMS.profit.options.indexOf(m[0]) !== -1 ? m[0] : ''; }
    if (TERMS.profit.options.indexOf(s) !== -1) return s;
    return { 1: '10', 2: '20', 3: '30', 4: '40', 5: '50' }[s] || '';
  }
  function normDispute(v) {
    var s = String(v || '').trim();
    if (/india/i.test(s)) return 'India';
    if (/court/i.test(s)) return 'J. courts';
    if (/arbitr/i.test(s)) return 'J. arbitration';
    if (/canada/i.test(s)) return 'Canada';
    return { 1: 'India', 2: 'J. courts', 3: 'J. arbitration', 4: 'Canada' }[s] || '';
  }
  function normCurrency(v) {
    var s = String(v || '').trim();
    if (/yen/i.test(s)) return 'Yen';
    if (/rup/i.test(s)) return 'Rupee';
    if (/cad|dollar|canad/i.test(s)) return 'CAD';
    return { 1: 'Yen', 2: 'Rupee', 3: 'CAD' }[s] || '';
  }

  // avg outcomes + floor'd percentages, matching the slide's 61% (8/13)
  function summarize(groups) {
    var a = [], b = [], reached = 0;
    groups.forEach(function (g) {
      var av = parseFloat(g.aOut), bv = parseFloat(g.bOut);
      if (isFinite(av) && isFinite(bv)) {
        a.push(av); b.push(bv);
        if (isOptimal(av, bv)) reached++;
      }
    });
    var mean = function (xs) { var s = 0; xs.forEach(function (x) { s += x; }); return xs.length ? s / xs.length : NaN; };
    var total = groups.length;
    return {
      n: a.length, total: total,
      avgA: mean(a), avgB: mean(b),
      reached: reached, missed: total - reached,
      pctReached: total ? Math.floor(100 * reached / total) : 0,
      pctMissed: total ? Math.floor(100 * (total - reached) / total) : 0
    };
  }

  /* ---------- UI ---------- */

  function mount(container) {
    var state = {
      headers: [], rows: [], fileName: null, _sheets: null,
      cols: null,                 // located survey columns
      clusterVals: [], cluster: '',
      clusterLabel: '', title: 'Abhas-Bussan Pareto Optimal Frontier',
      pay: defaultPay(),
      groups: []
    };

    container.innerHTML = '' +
      '<div class="app-title"><h2>📊📉 Plot Generator | Pareto Frontier</h2>' +
      '<span class="sub">Abhas-Bussan debrief: import the outcomes survey, verify every group in the editable table (outcomes have been wrong before!), export the frontier plot and the interpretation slides.</span></div>' +
      '<div class="app-layout">' +
      '  <div class="sidebar">' +

      '    <details class="step" open>' +
      '      <summary><span class="n">1</span> Load data <span class="hint" id="pf-fhint"></span></summary>' +
      '      <div class="body">' +
      '        <div class="dropzone" id="pf-drop"><strong>DROP DATA HERE</strong><ul class="drop-spec"><li><b>Type of file:</b> CSV or Excel (.xlsx)</li><li><b>What you\'re looking for:</b> the "07 Negotiation Outcomes" Qualtrics export (one response per negotiating group)</li></ul></div>' +
      '        <input type="file" id="pf-file" accept=".csv,.tsv,.txt,.xlsx,.xlsm,.xltx" style="display:none">' +
      '        <div id="pf-fileinfo"></div>' +
      '        <label class="field">Cluster<select id="pf-cluster"><option value="">- load the survey first -</option></select></label>' +
      '        <div class="row">' +
      '          <button id="pf-import" class="fixed" disabled>⤵ Import groups</button>' +
      '          <button id="pf-example" class="fixed">🎲 Demo data</button>' +
      '        </div>' +
      '        <div class="small-note">Importing replaces the table below. Codes are mapped best-effort; CHECK every row against the deal sheets.</div>' +
      '      </div>' +
      '    </details>' +

      '    <details class="step" open>' +
      '      <summary><span class="n">2</span> Labels</summary>' +
      '      <div class="body">' +
      '        <label class="field">Cluster label <span class="sub">(for the slide title)</span><input type="text" id="pf-label" placeholder="H"></label>' +
      '        <label class="field">Plot title<input type="text" id="pf-title" value="Abhas-Bussan Pareto Optimal Frontier"></label>' +
      '      </div>' +
      '    </details>' +

      '    <details class="step">' +
      '      <summary><span class="n">3</span> Scoring tables <span class="hint">(advanced)</span></summary>' +
      '      <div class="body">' +
      '        <div class="small-note">Derived from the DRRC workbook and verified against the slides. India / Yen / Rupee never appear in the materials, so they sit at 0; edit if a group picked them.</div>' +
      '        <div id="pf-pay"></div>' +
      '      </div>' +
      '    </details>' +
      '  </div>' +

      '  <div class="preview-panel">' +
      '    <div class="preview-toolbar">' +
      '      <button id="pf-png" class="primary" disabled>⬇ PNG</button>' +
      '      <button id="pf-deck" disabled>⬇ Slide deck</button>' +
      '      <button id="pf-copy" disabled>📋 Copy summary</button>' +
      '      <button id="pf-add" class="fixed">＋ Add group</button>' +
      '      <span class="status" id="pf-status"></span>' +
      '    </div>' +
      '    <div id="pf-tablewrap" class="grp-table" style="overflow:auto;max-height:44vh"></div>' +
      '    <div class="canvas-holder" style="background:#fff">' +
      '      <div class="empty-msg" id="pf-empty">output displayed HERE</div>' +
      '      <canvas id="pf-canvas" style="display:none"></canvas>' +
      '    </div>' +
      '  </div>' +
      '</div>';

    var $ = function (id) { return container.querySelector('#' + id); };
    var canvas = $('pf-canvas');
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
            var s = sheets[0];
            loadRaw(s.rows.map(function (r) {
              return r.map(function (c) { return c === null || c === undefined ? '' : String(c); });
            }), file.name);
          });
        }
        loadRaw(parseCSVText(new TextDecoder(sniffEncoding(buf)).decode(buf)), file.name);
      }).catch(function (err) {
        $('pf-fileinfo').innerHTML = '<span class="file-warn">Could not read file: ' + (err.message || err) + '</span>';
      });
    }

    function findCols(headers) {
      var f = function (re) { return headers.findIndex(function (h) { return re.test(String(h).trim()); }); };
      var many = function (re) {
        var out = [];
        headers.forEach(function (h, i) { if (re.test(String(h).trim())) out.push(i); });
        return out;
      };
      var cols = {
        cluster: f(/^cluster$/i),
        abhas: many(/^abhas_\d+$/i),
        bussan: many(/^bussan_\d+$/i),
        agree: f(/^agree/i),
        price: f(/^price$/i),
        excl: f(/^exclusivity$/i),
        profit: f(/^profit/i),
        dispute: f(/^dispute/i),
        currency: f(/^currency$/i)
      };
      return (cols.price !== -1 && cols.excl !== -1 && cols.abhas.length) ? cols : null;
    }

    function loadRaw(raw, name) {
      if (raw.length < 2) { $('pf-fileinfo').innerHTML = '<span class="file-warn">No data rows.</span>'; return; }
      var sq = stripJunkRows(raw);
      var headers = sq.headers.map(function (h) { return String(h || '').trim(); });
      var cols = findCols(headers);
      if (!cols) {
        $('pf-fileinfo').innerHTML = '<span class="file-warn">⚠ no Abhas_/Bussan_/price/exclusivity columns found. Is this the Negotiation Outcomes export?</span>';
        return;
      }
      state.headers = headers;
      state.rows = sq.rows;
      state.cols = cols;
      state.fileName = name;

      var uniq = new Map();
      if (cols.cluster !== -1) {
        state.rows.forEach(function (r) {
          var v = String(r[cols.cluster] === undefined ? '' : r[cols.cluster]).trim();
          if (v) uniq.set(v, (uniq.get(v) || 0) + 1);
        });
      }
      state.clusterVals = Array.from(uniq.keys()).sort(function (a, b) { return a.localeCompare(b, undefined, { numeric: true }); });
      $('pf-cluster').innerHTML = '<option value="">(all responses)</option>' + state.clusterVals.map(function (v) {
        return '<option value="' + escapeHtml(v) + '">' + escapeHtml(v) + ' (' + uniq.get(v) + ')</option>';
      }).join('');
      $('pf-import').disabled = false;
      $('pf-fileinfo').innerHTML = '<span class="file-info">✓ ' + escapeHtml(name) + ' · ' + state.rows.length + ' responses</span>';
      $('pf-fhint').textContent = name;
    }

    function importGroups() {
      var c = state.cols;
      if (!c) return;
      var rows = state.rows;
      if (state.cluster && c.cluster !== -1) {
        rows = rows.filter(function (r) { return String(r[c.cluster] === undefined ? '' : r[c.cluster]).trim() === state.cluster; });
      }
      var join = function (r, idxs) {
        return idxs.map(function (i) { return String(r[i] === undefined ? '' : r[i]).trim(); })
          .filter(Boolean).join('; ');
      };
      state.groups = rows.map(function (r) {
        var impasse = c.agree !== -1 && String(r[c.agree]).trim() === '2';
        var terms = impasse ? { price: '', excl: '', profit: '', dispute: '', currency: '' } : {
          price: normPrice(r[c.price]),
          excl: normExcl(r[c.excl]),
          profit: normProfit(r[c.profit]),
          dispute: normDispute(r[c.dispute]),
          currency: normCurrency(r[c.currency])
        };
        var g = {
          abhas: join(r, c.abhas), bussan: join(r, c.bussan),
          price: terms.price, excl: terms.excl, profit: terms.profit,
          dispute: terms.dispute, currency: terms.currency, aOut: '', bOut: ''
        };
        var out = computeOutcome(terms, state.pay);
        if (out) { g.aOut = String(out.a); g.bOut = String(out.b); }
        return g;
      });
      if (!state.clusterLabel && state.cluster) {
        state.clusterLabel = state.cluster;
        $('pf-label').value = state.cluster;
      }
      buildTable();
      scheduleRender();
    }

    // last year's Cluster H terms (real names replaced with the invented
    // sample names; the OUTCOMES still reproduce the corrected workbook)
    function loadExample() {
      var POOL = (window.LEAD_SAMPLE_NAMES || []);
      function NAMES(k) {
        var out = [];
        for (var i = 0; i < 3; i++) out.push(POOL[(k + i) % POOL.length] || 'Demo Person ' + (k + i + 1));
        return out.join('; ');
      }
      var ex = [
        [NAMES(0), NAMES(3), '10', 'Y', '40', 'Canada', 'CAD'],
        [NAMES(6), NAMES(9), '10', 'Y', '50', 'Canada', 'CAD'],
        [NAMES(12), NAMES(15), '10', 'N', '40', 'Canada', 'CAD'],
        [NAMES(18), NAMES(21), '5', 'Y', '50', 'Canada', 'CAD'],
        [NAMES(24), NAMES(27), '10', 'Y', '40', 'Canada', 'CAD'],
        [NAMES(30), NAMES(33), '', '', '', '', ''],
        [NAMES(36), NAMES(39), '10', 'Y', '30', 'J. courts', 'CAD'],
        [NAMES(42), NAMES(45), '10', 'Y', '40', 'Canada', 'CAD'],
        [NAMES(48), NAMES(51), '10', 'Y', '40', 'Canada', 'CAD'],
        [NAMES(54), NAMES(57), '10', 'Y', '40', 'Canada', 'CAD'],
        [NAMES(60), NAMES(63), '10', 'Y', '40', 'J. arbitration', 'CAD'],
        [NAMES(66), NAMES(69), '10', 'Y', '40', 'Canada', 'CAD'],
        [NAMES(72), NAMES(75), '10', 'N', '40', 'Canada', 'CAD']
      ];
      state.groups = ex.map(function (e) {
        var g = { abhas: e[0], bussan: e[1], price: e[2], excl: e[3], profit: e[4], dispute: e[5], currency: e[6], aOut: '', bOut: '' };
        var out = computeOutcome(g, state.pay);
        if (out) { g.aOut = String(out.a); g.bOut = String(out.b); }
        return g;
      });
      state.clusterLabel = state.clusterLabel || 'H';
      $('pf-label').value = state.clusterLabel;
      buildTable();
      scheduleRender();
    }

    /* ---------- editable table ---------- */

    function recomputeRow(gi) {
      var g = state.groups[gi];
      var out = computeOutcome(g, state.pay);
      g.aOut = out ? String(out.a) : '';
      g.bOut = out ? String(out.b) : '';
    }

    function rowTone(g) {
      var a = parseFloat(g.aOut), b = parseFloat(g.bOut);
      if (!isFinite(a) || !isFinite(b)) return '#FFF6DC';          // impasse / incomplete
      return isOptimal(a, b) ? '#EDF1F8' : '#FFE699';             // yellow = missed the frontier
    }

    function termSelect(gi, key) {
      var g = state.groups[gi];
      var t = TERMS[key];
      var html = '<select data-g="' + gi + '" data-k="' + key + '" style="width:100%"><option value=""></option>';
      t.options.forEach(function (o) {
        html += '<option value="' + o + '"' + (g[key] === o ? ' selected' : '') + '>' + (t.show[o] || o) + '</option>';
      });
      return html + '</select>';
    }

    function buildTable() {
      var wrap = $('pf-tablewrap');
      if (!state.groups.length) { wrap.innerHTML = ''; return; }
      var html = '<table><thead><tr><th></th><th>Abhas</th><th>Bussan</th>' +
        '<th>Price</th><th>Excl.</th><th>Profit</th><th>Dispute</th><th>Currency</th>' +
        '<th>Abhas out.</th><th>Bussan out.</th><th>Joint</th><th>Pareto</th><th></th></tr></thead><tbody>';
      state.groups.forEach(function (g, gi) {
        var a = parseFloat(g.aOut), b = parseFloat(g.bOut);
        var joint = (isFinite(a) && isFinite(b)) ? a + b : '';
        var opt = (isFinite(a) && isFinite(b)) ? (isOptimal(a, b) ? '✓' : '✗') : '';
        html += '<tr data-row="' + gi + '" style="background:' + rowTone(g) + '">' +
          '<td style="font-weight:700;white-space:nowrap">G' + String(gi + 1).padStart(2, '0') + '</td>' +
          '<td><input type="text" data-g="' + gi + '" data-k="abhas" value="' + escapeHtml(g.abhas) + '" style="width:150px"></td>' +
          '<td><input type="text" data-g="' + gi + '" data-k="bussan" value="' + escapeHtml(g.bussan) + '" style="width:150px"></td>' +
          '<td>' + termSelect(gi, 'price') + '</td>' +
          '<td>' + termSelect(gi, 'excl') + '</td>' +
          '<td>' + termSelect(gi, 'profit') + '</td>' +
          '<td>' + termSelect(gi, 'dispute') + '</td>' +
          '<td>' + termSelect(gi, 'currency') + '</td>' +
          '<td><input type="number" data-g="' + gi + '" data-k="aOut" value="' + escapeHtml(g.aOut) + '" style="width:64px"></td>' +
          '<td><input type="number" data-g="' + gi + '" data-k="bOut" value="' + escapeHtml(g.bOut) + '" style="width:64px"></td>' +
          '<td class="pf-joint" style="font-weight:700">' + joint + '</td>' +
          '<td class="pf-opt">' + opt + '</td>' +
          '<td><button class="fixed" data-del="' + gi + '" title="remove group">×</button></td>' +
          '</tr>';
      });
      wrap.innerHTML = html + '</tbody></table>';

      Array.prototype.forEach.call(wrap.querySelectorAll('select[data-g]'), function (sel) {
        sel.addEventListener('change', function () {
          var gi = +sel.getAttribute('data-g');
          state.groups[gi][sel.getAttribute('data-k')] = sel.value;
          recomputeRow(gi);
          refreshRow(gi);
          scheduleRender();
        });
      });
      Array.prototype.forEach.call(wrap.querySelectorAll('input[data-g]'), function (inp) {
        inp.addEventListener('input', function () {
          var gi = +inp.getAttribute('data-g');
          state.groups[gi][inp.getAttribute('data-k')] = inp.value;
          if (inp.type === 'number') refreshRow(gi);
          scheduleRender();
        });
      });
      Array.prototype.forEach.call(wrap.querySelectorAll('button[data-del]'), function (btn) {
        btn.addEventListener('click', function () {
          state.groups.splice(+btn.getAttribute('data-del'), 1);
          buildTable();
          scheduleRender();
        });
      });
    }

    function refreshRow(gi) {
      var tr = $('pf-tablewrap').querySelector('tr[data-row="' + gi + '"]');
      if (!tr) return;
      var g = state.groups[gi];
      var aIn = tr.querySelector('input[data-k="aOut"]'), bIn = tr.querySelector('input[data-k="bOut"]');
      if (document.activeElement !== aIn) aIn.value = g.aOut;
      if (document.activeElement !== bIn) bIn.value = g.bOut;
      var a = parseFloat(g.aOut), b = parseFloat(g.bOut);
      tr.querySelector('.pf-joint').textContent = (isFinite(a) && isFinite(b)) ? a + b : '';
      tr.querySelector('.pf-opt').textContent = (isFinite(a) && isFinite(b)) ? (isOptimal(a, b) ? '✓' : '✗') : '';
      tr.style.background = rowTone(g);
    }

    /* ---------- payoff editor ---------- */

    function buildPayEditor() {
      var box = $('pf-pay');
      var html = '';
      TERM_KEYS.forEach(function (k) {
        var t = TERMS[k];
        html += '<div class="small-note" style="margin-top:6px"><b>' + t.label + '</b> (Abhas / Bussan)</div>';
        t.options.forEach(function (o) {
          html += '<div class="row" style="align-items:center">' +
            '<span style="flex:1.4;font-size:12px">' + (t.show[o] || o) + '</span>' +
            '<input type="number" data-side="A" data-k="' + k + '" data-o="' + o + '" value="' + state.pay.A[k][o] + '" style="flex:1;min-width:0">' +
            '<input type="number" data-side="B" data-k="' + k + '" data-o="' + o + '" value="' + state.pay.B[k][o] + '" style="flex:1;min-width:0">' +
            '</div>';
        });
      });
      box.innerHTML = html;
      Array.prototype.forEach.call(box.querySelectorAll('input'), function (inp) {
        inp.addEventListener('input', function () {
          var v = parseFloat(inp.value);
          if (!isFinite(v)) return;
          state.pay[inp.getAttribute('data-side')][inp.getAttribute('data-k')][inp.getAttribute('data-o')] = v;
          state.groups.forEach(function (g, gi) { recomputeRow(gi); refreshRow(gi); });
          scheduleRender();
        });
      });
    }

    /* ---------- plot ---------- */

    function scheduleRender() {
      clearTimeout(renderTimer);
      renderTimer = setTimeout(render, 180);
    }

    function render() {
      if (!state.groups.length) return;
      var W = 1800, H = 1200;
      canvas.width = W; canvas.height = H;
      canvas.style.display = '';
      $('pf-empty').style.display = 'none';
      var ctx = canvas.getContext('2d');
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, W, H);

      var fBody = 'Candara, "Gill Sans", Calibri, sans-serif';
      var NAVY = '#1F3864', MAGENTA = '#FF00FF';
      var mL = 150, mR = 110, mT = 120, mB = 130;
      var plotW = W - mL - mR, plotH = H - mT - mB;
      var x0 = 10, x1 = 130, y0 = 7, y1 = 112;
      var sx = function (v) { return mL + (v - x0) / (x1 - x0) * plotW; };
      var sy = function (v) { return mT + plotH - (v - y0) / (y1 - y0) * plotH; };

      // title, underlined like the slide
      ctx.fillStyle = '#111';
      ctx.font = '34px ' + fBody;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'alphabetic';
      var title = state.title || '';
      if (title) {
        ctx.fillText(title, W / 2, 70);
        var tw = ctx.measureText(title).width;
        ctx.strokeStyle = '#111';
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(W / 2 - tw / 2, 78); ctx.lineTo(W / 2 + tw / 2, 78); ctx.stroke();
      }

      // axes + ticks
      ctx.strokeStyle = '#333';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(mL, mT); ctx.lineTo(mL, mT + plotH); ctx.lineTo(mL + plotW, mT + plotH);
      ctx.stroke();
      ctx.font = '26px ' + fBody;
      ctx.fillStyle = '#111';
      for (var xv = 10; xv <= 130; xv += 20) {
        ctx.textAlign = 'center'; ctx.textBaseline = 'top';
        ctx.fillText(String(xv), sx(xv), mT + plotH + 12);
        ctx.beginPath(); ctx.moveTo(sx(xv), mT + plotH); ctx.lineTo(sx(xv), mT + plotH + 6); ctx.stroke();
      }
      for (var yv = 7; yv <= 107; yv += 10) {
        ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
        ctx.fillText(String(yv), mL - 14, sy(yv));
        ctx.beginPath(); ctx.moveTo(mL - 6, sy(yv)); ctx.lineTo(mL, sy(yv)); ctx.stroke();
      }
      ctx.textAlign = 'center'; ctx.textBaseline = 'top';
      ctx.font = '28px ' + fBody;
      ctx.fillText('Abhas', mL + plotW / 2, H - 44);
      ctx.save();
      ctx.translate(44, mT + plotH / 2);
      ctx.rotate(-Math.PI / 2);
      ctx.fillText('Bussan', 0, 0);
      ctx.restore();

      // frontier polyline + diamonds + labels
      ctx.strokeStyle = NAVY;
      ctx.lineWidth = 3;
      ctx.beginPath();
      FRONTIER.forEach(function (p, i) {
        var x = sx(p[0]), y = sy(p[1]);
        if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y);
      });
      ctx.stroke();
      ctx.fillStyle = NAVY;
      FRONTIER.forEach(function (p) {
        var x = sx(p[0]), y = sy(p[1]);
        ctx.beginPath();
        ctx.moveTo(x, y - 7); ctx.lineTo(x + 7, y); ctx.lineTo(x, y + 7); ctx.lineTo(x - 7, y);
        ctx.closePath(); ctx.fill();
      });
      ctx.font = '26px ' + fBody;
      ctx.fillStyle = '#111';
      FRONTIER.forEach(function (p) {
        var x = sx(p[0]), y = sy(p[1]);
        var lab = p[0] + ',' + p[1];
        if (p[1] <= 30) { ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.fillText(lab, x + 14, y); }
        else { ctx.textAlign = 'left'; ctx.textBaseline = 'bottom'; ctx.fillText(lab, x + 10, y - 8); }
      });

      // group outcomes: magenta squares
      ctx.fillStyle = MAGENTA;
      state.groups.forEach(function (g) {
        var a = parseFloat(g.aOut), b = parseFloat(g.bOut);
        if (!isFinite(a) || !isFinite(b)) return;
        ctx.fillRect(sx(a) - 7, sy(b) - 7, 14, 14);
      });

      var s = summarize(state.groups);
      $('pf-png').disabled = false;
      $('pf-deck').disabled = false;
      $('pf-copy').disabled = false;
      $('pf-status').textContent = s.n + ' of ' + s.total + ' groups plotted · avg ' +
        (isFinite(s.avgA) ? s.avgA.toFixed(2) : '-') + ' / ' + (isFinite(s.avgB) ? s.avgB.toFixed(2) : '-') +
        ' · reached ' + s.reached + '/' + s.total;
    }

    /* ---------- exports ---------- */

    function buildDeck(cb) {
      var CW = 2560, CH = 1440;
      var BLUE = '#2E74B5', HEADER = '#4472C4', BAND = '#D9E2F3';
      var label = state.clusterLabel || state.cluster || '';
      var slideTitle = 'Results for Cluster ' + label;

      function title(text) {
        return { text: text, x: 200, y: 60, w: 2160, h: 120, fontPx: 56, color: BLUE, bold: false, font: 'Corbel', align: 'l' };
      }
      function hcell(text, size) {
        return { fill: HEADER, paras: [{ runs: [{ text: text, bold: true, color: '#FFFFFF' }], sizePx: size || 32, align: 'ctr' }] };
      }
      function vcell(text, size) {
        return { fill: BAND, paras: [{ runs: [{ text: text, bold: true, color: BLUE }], sizePx: size || 44, align: 'ctr' }] };
      }

      canvas.toBlob(function (blob) {
        if (!blob) return;
        blob.arrayBuffer().then(function (ab) {
          var img = new Uint8Array(ab);
          // contain the 1800×1200 plot inside a 2000×1180 region
          var boxW = 2000, boxH = 1180, scale = Math.min(boxW / canvas.width, boxH / canvas.height);
          var iw = canvas.width * scale, ih = canvas.height * scale;
          var s = summarize(state.groups);
          var slides = [
            {
              texts: [title(slideTitle)],
              images: [{ bytes: img, ext: 'png', x: (CW - iw) / 2, y: 200 + (boxH - ih) / 2, w: iw, h: ih, shape: 'rect', name: 'frontier' }]
            },
            {
              texts: [title(slideTitle)],
              tables: [
                {
                  x: (CW - 1500) / 2, y: 330, colWidths: [750, 750],
                  border: { color: '#FFFFFF', w: 2 }, font: 'Candara',
                  rows: [
                    { h: 120, cells: [hcell('Avg Abhas Outcome'), hcell('Avg Bussan Outcome')] },
                    { h: 130, cells: [vcell(isFinite(s.avgA) ? s.avgA.toFixed(2) : '-'), vcell(isFinite(s.avgB) ? s.avgB.toFixed(2) : '-')] }
                  ]
                },
                {
                  x: (CW - 1900) / 2, y: 800, colWidths: [950, 950],
                  border: { color: '#FFFFFF', w: 2 }, font: 'Candara',
                  rows: [
                    { h: 150, cells: [hcell('% Who Reached Pareto Frontier (Optimal Outcome)', 30), hcell('% Who Did Not Reach Pareto Frontier (Optimal Outcome)', 30)] },
                    { h: 130, cells: [vcell(s.pctReached + '% (' + s.reached + '/' + s.total + ')'), vcell(s.pctMissed + '% (' + s.missed + '/' + s.total + ')')] }
                  ]
                }
              ]
            }
          ];
          cb(window.pptxLite.makePptx({ canvasW: CW, canvasH: CH, background: '#FFFFFF', slides: slides }));
        });
      }, 'image/png');
    }

    $('pf-png').addEventListener('click', function () {
      window.LeadToolkit.downloadCanvasPng(canvas, 'LEADTK_PGN-PFR_plot_' + new Date().toISOString().slice(0, 10) + '.png');
    });
    $('pf-deck').addEventListener('click', function () {
      if (!window.pptxLite) return;
      buildDeck(function (bytes) {
        window.LeadToolkit.downloadBlob(
          new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation' }),
          'LEADTK_PGN-PFR_deck_' + new Date().toISOString().slice(0, 10) + '.pptx');
      });
    });
    $('pf-copy').addEventListener('click', function () {
      var s = summarize(state.groups);
      var L = ['ABHAS-BUSSAN | Cluster ' + (state.clusterLabel || state.cluster || '')];
      L.push('Avg Abhas outcome: ' + (isFinite(s.avgA) ? s.avgA.toFixed(2) : '-'));
      L.push('Avg Bussan outcome: ' + (isFinite(s.avgB) ? s.avgB.toFixed(2) : '-'));
      L.push('Reached Pareto frontier: ' + s.pctReached + '% (' + s.reached + '/' + s.total + ')');
      L.push('Did not reach: ' + s.pctMissed + '% (' + s.missed + '/' + s.total + ')');
      state.groups.forEach(function (g, gi) {
        var a = parseFloat(g.aOut), b = parseFloat(g.bOut);
        var tag = (isFinite(a) && isFinite(b)) ? (a + ' / ' + b + ' = ' + (a + b) + (isOptimal(a, b) ? '  ✓ optimal' : '  ✗') ) : 'no deal recorded';
        L.push('G' + String(gi + 1).padStart(2, '0') + ': ' + tag);
      });
      var txt = L.join('\n');
      (navigator.clipboard ? navigator.clipboard.writeText(txt) : Promise.reject()).then(function () {
        $('pf-status').textContent = 'copied ✓';
      }, function () {
        window.prompt('Copy:', txt);
      });
    });

    /* ---------- events ---------- */

    var drop = $('pf-drop'), fileInput = $('pf-file');
    drop.addEventListener('click', function () { fileInput.click(); });
    fileInput.addEventListener('change', function () { if (fileInput.files[0]) loadFile(fileInput.files[0]); });
    ['dragover', 'dragenter'].forEach(function (ev) {
      drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.add('drag'); });
    });
    ['dragleave', 'drop'].forEach(function (ev) {
      drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.remove('drag'); });
    });
    drop.addEventListener('drop', function (e) { if (e.dataTransfer.files[0]) loadFile(e.dataTransfer.files[0]); });

    $('pf-cluster').addEventListener('change', function (e) { state.cluster = e.target.value; });
    $('pf-import').addEventListener('click', importGroups);
    $('pf-example').addEventListener('click', loadExample);
    $('pf-add').addEventListener('click', function () {
      state.groups.push({ abhas: '', bussan: '', price: '', excl: '', profit: '', dispute: '', currency: '', aOut: '', bOut: '' });
      buildTable();
      scheduleRender();
    });
    $('pf-label').addEventListener('input', function (e) { state.clusterLabel = e.target.value.trim(); });
    $('pf-title').addEventListener('input', function (e) { state.title = e.target.value; scheduleRender(); });

    buildPayEditor();
  }

  if (typeof window !== 'undefined' && window.LeadToolkit) {
    window.LeadToolkit.registerApp({
      id: 'pareto',
      icon: '📊📉',
      group: 'Class 6 - Negotiations',
      name: 'Plot Generator | Pareto Frontier',
      code: 'PGN-PFR',
      intro: { upload: 'the Negotiation Outcomes survey', to: 'the Pareto frontier plot and the interpretation slides; every outcome editable' },
      tags: ['abhas', 'bussan', 'pareto', 'negotiation outcomes', 'frontier', 'optimal', 'joint outcome', 'debrief'],
      description: 'Abhas-Bussan debrief: import the Negotiation Outcomes survey, verify every group in an editable table, and export the Pareto frontier plot plus the two interpretation slides (averages, % who reached the frontier).',
      mount: mount
    });
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
      FRONTIER: FRONTIER, defaultPay: defaultPay, computeOutcome: computeOutcome,
      isOptimal: isOptimal, summarize: summarize,
      normPrice: normPrice, normExcl: normExcl, normProfit: normProfit,
      normDispute: normDispute, normCurrency: normCurrency
    };
  }
})();
