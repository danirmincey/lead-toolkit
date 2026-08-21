/* ==========================================================================
   App | Kidney Exercise (Class 3 - Influence and Persuasion)
   Replaces the manual DRRC "Kidney Exercise Calculation Example" workbook.
   Two inputs, joined automatically on uni:
     1. Kidney Outcomes export (in-class, post-advocacy): CANDIDATE A–H RANK
        columns + "Which candidate did you represent?" | gives Round 2.
     2. (optional) The nightly survey with initialrank_* | gives Round 1,
        and unlocks Persuasiveness + the full Advocacy effect.
   Output is pasteable text: Round 1 / Round 2 mean rankings + the kidney
   winner, Persuasiveness per candidate (non-advocates' T1−T2, like the old
   sheet), and the Advocacy effect (advocates vs everyone else). Rows whose
   uni looks like a test response are excluded and reported.
   All processing is local; nothing is uploaded.
   ========================================================================== */

(function () {
  'use strict';

  /* ======================================================================
     PURE LOGIC (exported for node tests)
     ====================================================================== */

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

  function normUni(u) {
    return String(u === null || u === undefined ? '' : u).trim().toLowerCase();
  }

  function isTestUni(u) {
    return /^test/i.test(String(u || '').trim());
  }

  // find candidate-rank columns: qtext "CANDIDATE - A - RANK" or names like
  // initialrank_3_1 / Q5_3_1 (the captured number maps to A..H by position)
  function findRankColumns(names, qtexts) {
    var out = [];
    names.forEach(function (nm, i) {
      var q = qtexts[i] || '';
      var m = /candidate\s*[-–]?\s*([A-H])\s*[-–]?\s*rank/i.exec(q);
      if (m) { out.push({ i: i, letter: m[1].toUpperCase() }); return; }
      var m2 = /^(initialrank|finalrank|rank)[_.](\d+)/i.exec(nm);
      if (m2) out.push({ i: i, letter: 'ABCDEFGH'[+m2[2] - 1] || ('#' + m2[2]) });
    });
    return out;
  }

  function findRepColumn(names, qtexts) {
    for (var i = 0; i < names.length; i++) {
      if (/which candidate did you represent/i.test(qtexts[i] || '') || /^represent/i.test(names[i])) return i;
    }
    return -1;
  }

  function findUniColumn(names, qtexts) {
    for (var i = 0; i < names.length; i++) {
      if (/^uni\b/i.test(String(names[i]).trim()) || /what is your (columbia )?uni/i.test(qtexts[i] || '')) return i;
    }
    return -1;
  }

  // rank value parser: 1..8 only (guards against junk)
  function parseRank(v) {
    var n = parseFloat(String(v).trim());
    return isFinite(n) && n >= 1 && n <= 20 ? n : null;
  }

  /* The whole analysis. Inputs:
       out: {rows, rankCols:[{i,letter}], repIdx, uniIdx}
       sv (optional): {rows, rankCols:[{i,letter}], uniIdx}
     Returns a structured result for the report builder. */
  function kidneyStats(out, sv, excludeTest) {
    var letters = out.rankCols.map(function (c) { return c.letter; });

    var outRows = out.rows.filter(function (r) {
      return !(excludeTest && out.uniIdx >= 0 && isTestUni(r[out.uniIdx]));
    });
    var excluded = out.rows.length - outRows.length;

    // round 2 means
    var r2 = {};
    out.rankCols.forEach(function (c) {
      var vals = outRows.map(function (r) { return parseRank(r[c.i]); }).filter(function (x) { return x !== null; });
      r2[c.letter] = { n: vals.length, mean: mean(vals), sd: sdSample(vals) };
    });
    var winner = letters.slice().sort(function (a, b) { return r2[a].mean - r2[b].mean; })[0];

    // advocates: rep column gives 1..8 (or a letter)
    var advocatesOf = {};   // letter -> Set of uni
    var repCounts = {};
    if (out.repIdx >= 0) {
      outRows.forEach(function (r) {
        var v = String(r[out.repIdx] === undefined ? '' : r[out.repIdx]).trim();
        if (!v) return;
        var letter = /^[A-H]$/i.test(v) ? v.toUpperCase() : 'ABCDEFGH'[parseInt(v, 10) - 1];
        if (!letter) return;
        repCounts[letter] = (repCounts[letter] || 0) + 1;
        if (out.uniIdx >= 0) {
          if (!advocatesOf[letter]) advocatesOf[letter] = {};
          advocatesOf[letter][normUni(r[out.uniIdx])] = 1;
        }
        r._rep = letter;
      });
    }

    // advocacy effect from round 2 alone: advocates' T2 vs others' T2
    var advocacy = null;
    if (out.repIdx >= 0) {
      advocacy = [];
      out.rankCols.forEach(function (c) {
        var adv = [], non = [];
        outRows.forEach(function (r) {
          var v = parseRank(r[c.i]);
          if (v === null) return;
          if (r._rep === c.letter) adv.push(v); else non.push(v);
        });
        if (adv.length) {
          advocacy.push({ letter: c.letter, advN: adv.length, advT2: mean(adv), nonT2: mean(non) });
        }
      });
      if (!advocacy.length) advocacy = null;
    }

    // round 1 + persuasiveness need the nightly survey, joined on uni
    var r1 = null, persuasion = null, joinN = 0, result_advDelta = null;
    if (sv && sv.rankCols.length) {
      r1 = {};
      sv.rankCols.forEach(function (c) {
        var vals = sv.rows.map(function (r) { return parseRank(r[c.i]); }).filter(function (x) { return x !== null; });
        r1[c.letter] = { n: vals.length, mean: mean(vals), sd: sdSample(vals) };
      });

      if (out.uniIdx >= 0 && sv.uniIdx >= 0) {
        var svByUni = {};
        sv.rows.forEach(function (r) {
          var u = normUni(r[sv.uniIdx]);
          if (u) svByUni[u] = r;
        });
        var svColByLetter = {};
        sv.rankCols.forEach(function (c) { svColByLetter[c.letter] = c.i; });

        persuasion = [];
        out.rankCols.forEach(function (c) {
          if (!(c.letter in svColByLetter)) return;
          var diffs = [];
          outRows.forEach(function (r) {
            if (r._rep === c.letter) return;             // non-advocates only
            var u = normUni(out.uniIdx >= 0 ? r[out.uniIdx] : '');
            var s = u && svByUni[u];
            if (!s) return;
            var t1 = parseRank(s[svColByLetter[c.letter]]);
            var t2 = parseRank(r[c.i]);
            if (t1 === null || t2 === null) return;
            diffs.push(t1 - t2);                          // + = moved toward candidate
          });
          if (diffs.length) persuasion.push({ letter: c.letter, diff: mean(diffs), n: diffs.length });
        });
        persuasion.sort(function (a, b) { return b.diff - a.diff; });
        if (!persuasion.length) persuasion = null;

        // advocates' own-candidate movement (R1−R2), needs the join too
        var advDelta = {};
        out.rankCols.forEach(function (c) {
          var diffs = [];
          outRows.forEach(function (r) {
            if (r._rep !== c.letter) return;
            var u = normUni(out.uniIdx >= 0 ? r[out.uniIdx] : '');
            var s = u && svByUni[u];
            if (!s) return;
            var t1 = parseRank(s[svColByLetter[c.letter]]);
            var t2 = parseRank(r[c.i]);
            if (t1 === null || t2 === null) return;
            diffs.push(t1 - t2);
          });
          if (diffs.length) advDelta[c.letter] = { d: mean(diffs), n: diffs.length };
        });
        if (Object.keys(advDelta).length) result_advDelta = advDelta;

        // join size
        var seen = {};
        outRows.forEach(function (r) {
          var u = normUni(out.uniIdx >= 0 ? r[out.uniIdx] : '');
          if (u && svByUni[u]) seen[u] = 1;
        });
        joinN = Object.keys(seen).length;
      }
    }

    return {
      letters: letters, excludedTest: excluded, n2: outRows.length,
      r2: r2, winner: winner, r1: r1, advocacy: advocacy,
      persuasion: persuasion, joinN: joinN, repCounts: repCounts,
      advDelta: result_advDelta
    };
  }

  /* ======================================================================
     UI
     ====================================================================== */

  function mount(container) {
    var state = {
      out: null,   // {fileName, headers, qtexts, rows, rankCols, repIdx, uniIdx}
      sv: null,    // {fileName, headers, qtexts, rows, rankCols, uniIdx}
      excludeTest: true,
      clusterLabel: 'Cluster H',
      // defaults for the "Other clusters" comparison slide (last year's
      // numbers | no other-cluster data has been provided; fully editable)
      others: [
        { r1: 4.60, r2: 5.10 }, { r1: 3.31, r2: 4.59 }, { r1: 4.21, r2: 4.58 },
        { r1: 5.18, r2: 5.33 }, { r1: 3.79, r2: 4.81 }, { r1: 4.36, r2: 3.28 },
        { r1: 5.04, r2: 4.41 }, { r1: 5.58, r2: 3.83 }
      ]
    };

    container.innerHTML = '' +
      '<div class="app-title"><h2>🧮🫘 Data Extractor | Kidney Exercise</h2>' +
      '<span class="sub">Both rankings in → the whole debrief out (winner, persuasiveness, advocacy effect) as pasteable text. Replaces the old calculation spreadsheet. Nothing is uploaded.</span></div>' +
      '<div class="app-layout">' +
      '  <div class="sidebar">' +

      '    <details class="step" open>' +
      '      <summary><span class="n">1</span> Load data <span class="hint" id="kd-hint1"></span></summary>' +
      '      <div class="body">' +
      '        <div class="dropzone" id="kd-drop1"><strong>DROP DATA HERE</strong><ul class="drop-spec"><li><b>Type of file:</b> CSV or Excel (.xlsx)</li><li><b>What you\'re looking for:</b> the ad-hoc "Kidney Outcomes" export run in class (CANDIDATE - A - RANK … columns plus "Which candidate did you represent?")</li></ul></div>' +
      '        <input type="file" id="kd-file1" accept=".csv,.tsv,.txt,.xlsx,.xlsm,.xltx" style="display:none">' +
      '        <div id="kd-info1"></div>' +
      '      </div>' +
      '    </details>' +

      '    <details class="step" open>' +
      '      <summary><span class="n">2</span> Load data <span class="sub" style="font-weight:400">(optional, round 1)</span> <span class="hint" id="kd-hint2"></span></summary>' +
      '      <div class="body">' +
      '        <div class="small-note">Adds Round 1 ("Your First Round Rankings"), Persuasiveness, and the full Advocacy effect, joined to the outcomes by uni.</div>' +
      '        <div class="dropzone" id="kd-drop2"><strong>DROP DATA HERE</strong><ul class="drop-spec"><li><b>Type of file:</b> CSV or Excel (.xlsx)</li><li><b>What you\'re looking for:</b> the Class 3 nightly survey with initialrank_1 … initialrank_8 (NOT the roster, NOT the decision-making survey)</li></ul></div>' +
      '        <input type="file" id="kd-file2" accept=".csv,.tsv,.txt,.xlsx,.xlsm,.xltx" style="display:none">' +
      '        <div id="kd-info2"></div>' +
      '        <div class="row"><button id="kd-demo" class="fixed">🎲 Demo data</button></div>' +
      '      </div>' +
      '    </details>' +

      '    <details class="step" open>' +
      '      <summary><span class="n">3</span> Options</summary>' +
      '      <div class="body">' +
      '        <label class="check"><input type="checkbox" id="kd-test" checked> Exclude test responses (uni starts with "test")</label>' +
      '        <label class="field">This cluster\'s label (for the deck)<input type="text" id="kd-cluster" value="Cluster H"></label>' +
      '      </div>' +
      '    </details>' +

      '    <details class="step" open>' +
      '      <summary><span class="n">4</span> "Other clusters" slide</summary>' +
      '      <div class="body">' +
      '        <div class="small-note">No other-cluster ranking data was found in your files, so these default to last year\'s numbers. Edit freely (they only feed the comparison slide).</div>' +
      '        <div id="kd-others"></div>' +
      '      </div>' +
      '    </details>' +
      '  </div>' +

      '  <div class="preview-panel">' +
      '    <div class="preview-toolbar">' +
      '      <button id="kd-copy" class="primary" disabled>📋 Copy text</button>' +
      '      <button id="kd-deck" class="primary" disabled>⬇ Slide deck (.pptx)</button>' +
      '      <span class="status" id="kd-status"></span>' +
      '    </div>' +
      '    <div class="empty-msg" id="kd-empty">output displayed HERE</div>' +
      '    <textarea id="kd-out" readonly spellcheck="false" style="display:none;width:100%;min-height:560px;font:12.5px/1.5 ui-monospace, Menlo, Consolas, monospace;border:1px solid var(--line);border-radius:8px;padding:12px;background:#fff;color:var(--ink);resize:vertical"></textarea>' +
      '  </div>' +
      '</div>';

    var $ = function (id) { return container.querySelector('#' + id); };

    function escapeHtml(s) {
      return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    /* ---------- shared loading helpers (same pattern as other apps) ---------- */

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

    // Qualtrics raw exports: row0 = names, row1 = question text, row2 = ImportId
    function splitQualtrics(raw) {
      var names = raw[0].map(function (h, i) { return String(h || 'col' + i).trim(); });
      var qtexts = names.slice();
      var start = 1;
      if (raw.length > 2 && raw[2].some(function (c) { return String(c).indexOf('"ImportId"') !== -1; })) {
        qtexts = raw[1].map(String);
        start = 3;
      } else if (raw.length > 1 && raw[1].some(function (c) { return String(c).indexOf('"ImportId"') !== -1; })) {
        start = 2;
      }
      return { names: names, qtexts: qtexts, rows: raw.slice(start) };
    }

    function loadInto(which, file) {
      file.arrayBuffer().then(function (buf) {
        var bytes = new Uint8Array(buf);
        var next = function (raw) {
          var sq = splitQualtrics(raw);
          if (which === 1) {
            state.out = {
              fileName: file.name,
              rows: sq.rows,
              rankCols: findRankColumns(sq.names, sq.qtexts),
              repIdx: findRepColumn(sq.names, sq.qtexts),
              uniIdx: findUniColumn(sq.names, sq.qtexts)
            };
            var ok = state.out.rankCols.length >= 2;
            $('kd-info1').innerHTML = ok
              ? '<span class="file-info">✓ ' + escapeHtml(file.name) + ' · ' + sq.rows.length + ' responses · ' +
                state.out.rankCols.length + ' candidate columns (' + state.out.rankCols.map(function (c) { return c.letter; }).join('') + ')' +
                (state.out.repIdx >= 0 ? ' · advocate column found' : '') + '</span>'
              : '<span class="file-warn">⚠ no CANDIDATE … RANK columns found in that file. Is this the Kidney Outcomes export?</span>';
            $('kd-hint1').textContent = file.name;
          } else {
            state.sv = {
              fileName: file.name,
              rows: sq.rows,
              rankCols: findRankColumns(sq.names, sq.qtexts),
              uniIdx: findUniColumn(sq.names, sq.qtexts)
            };
            var ok2 = state.sv.rankCols.length >= 2;
            $('kd-info2').innerHTML = ok2
              ? '<span class="file-info">✓ ' + escapeHtml(file.name) + ' · ' + sq.rows.length + ' responses · round-1 columns (' +
                state.sv.rankCols.map(function (c) { return c.letter; }).join('') + ')</span>'
              : '<span class="file-warn">⚠ no initialrank columns found. Is this the nightly survey?</span>';
            $('kd-hint2').textContent = file.name;
          }
          refresh();
        };
        if (window.xlsxLite && window.xlsxLite.isZipFile(bytes)) {
          window.parseXlsx(buf).then(function (sheets) {
            sheets = sheets.filter(function (s) { return s.rows.length; });
            if (!sheets.length) throw new Error('empty workbook');
            next(sheets[0].rows.map(function (r) {
              return r.map(function (c) { return c === null || c === undefined ? '' : String(c); });
            }));
          }).catch(function (e) {
            (which === 1 ? $('kd-info1') : $('kd-info2')).innerHTML =
              '<span class="file-warn">Could not read file: ' + (e.message || e) + '</span>';
          });
          return;
        }
        next(parseCSVText(new TextDecoder(sniffEncoding(buf)).decode(buf)));
      });
    }

    /* ---------- "other clusters" editor ---------- */

    function renderOthers() {
      var box = $('kd-others');
      box.innerHTML = '';
      'ABCDEFGH'.split('').forEach(function (le, i) {
        var row = document.createElement('div');
        row.className = 'row';
        row.style.marginBottom = '4px';
        row.innerHTML = '<span class="small-note fixed" style="width:80px">Candidate ' + le + '</span>' +
          '<input type="number" step="0.01" value="' + state.others[i].r1 + '" title="Round 1">' +
          '<input type="number" step="0.01" value="' + state.others[i].r2 + '" title="Round 2">';
        var ins = row.querySelectorAll('input');
        ins[0].addEventListener('change', function (e) { state.others[i].r1 = parseFloat(e.target.value) || 0; });
        ins[1].addEventListener('change', function (e) { state.others[i].r2 = parseFloat(e.target.value) || 0; });
        box.appendChild(row);
      });
    }

    /* ---------- deck export ---------- */

    function buildDeck(res) {
      var CW = 2560, CH = 1440;
      var letters = 'ABCDEFGH'.split('');
      var GREY = '#EBEDF3', WHITE = '#FFFFFF', BLUE = '#2E74B5';

      function title(text) {
        return { text: text, x: 200, y: 60, w: 2160, h: 120, fontPx: 56, color: BLUE, bold: false, font: 'Corbel', align: 'l' };
      }
      function winnerText(text, color) {
        return { text: text, x: 380, y: 1270, w: 1800, h: 110, fontPx: 44, color: color || BLUE, bold: true, font: 'Corbel' };
      }
      function listTable(rows2col, x, y, wide) {
        return {
          x: x, y: y, colWidths: wide ? [520, 300, 300] : [520, 280],
          border: { color: '#FFFFFF', w: 2 }, font: 'Candara',
          rows: rows2col
        };
      }
      function cell(text, opts) {
        opts = opts || {};
        return {
          fill: opts.fill || WHITE,
          paras: [{ runs: [{ text: text, bold: opts.bold !== false, color: opts.color || '#000000' }], sizePx: opts.size || 30, align: opts.align || 'ctr' }]
        };
      }

      var slides = [];

      // 1 | Your First Round Rankings
      if (res.r1) {
        var rows1 = letters.map(function (le) {
          return { h: 108, cells: [cell('Candidate ' + le, { align: 'l' }), cell(f2(res.r1[le].mean), { color: BLUE })] };
        });
        var w1 = letters.slice().sort(function (a, b) { return res.r1[a].mean - res.r1[b].mean; })[0];
        slides.push({
          texts: [title('Your First Round Rankings'), winnerText('Candidate ' + w1 + ' would have received the kidney')],
          tables: [listTable(rows1, 850, 220)]
        });
      }

      // 2 | this cluster, Round 1 vs Round 2
      var head2 = { h: 90, cells: [cell('', {}), cell('Round 1', { color: BLUE, size: 36 }), cell('Round 2', { color: BLUE, size: 36 })] };
      var rows2 = [head2].concat(letters.map(function (le) {
        return {
          h: 100, cells: [cell('Candidate ' + le, { align: 'l' }),
            cell(res.r1 ? f2(res.r1[le].mean) : '-', { color: BLUE }),
            cell(f2(res.r2[le].mean), { color: BLUE })]
        };
      }));
      slides.push({
        texts: [title(state.clusterLabel), winnerText('Candidate ' + res.winner + ' would have received the kidney', '#C00000')],
        tables: [listTable(rows2, 720, 190, true)]
      });

      // 3 | other clusters (editable defaults)
      var head3 = { h: 90, cells: [cell('', {}), cell('Round 1', { color: BLUE, size: 36 }), cell('Round 2', { color: BLUE, size: 36 })] };
      var rows3 = [head3].concat(letters.map(function (le, i) {
        return {
          h: 100, cells: [cell('Candidate ' + le, { align: 'l' }),
            cell(f2(state.others[i].r1), { color: BLUE }),
            cell(f2(state.others[i].r2), { color: BLUE })]
        };
      }));
      var w3 = 0;
      state.others.forEach(function (o, i) { if (o.r2 < state.others[w3].r2) w3 = i; });
      slides.push({
        texts: [title('Other clusters'), winnerText('Candidate ' + letters[w3] + ' would have received the kidney')],
        tables: [listTable(rows3, 720, 190, true)]
      });

      // 4 | persuasiveness
      if (res.persuasion) {
        var pmap = {};
        res.persuasion.forEach(function (p) { pmap[p.letter] = p.diff; });
        var colW = 230;
        slides.push({
          texts: [title('How persuasive was your group? (higher is more persuasive)'),
            winnerText('Group ' + res.persuasion[0].letter + ' was the most persuasive!')],
          tables: [{
            x: (CW - colW * 8) / 2, y: 420, colWidths: letters.map(function () { return colW; }),
            border: { color: '#FFFFFF', w: 2 }, font: 'Candara',
            rows: [
              { h: 80, cells: [{ span: 8, fill: GREY, paras: [{ runs: [{ text: 'Persuasiveness', bold: true }], sizePx: 30 }] }]
                  .concat(letters.slice(1).map(function () { return { merged: true, fill: GREY, paras: [] }; })) },
              { h: 80, cells: letters.map(function (le) { return cell(le, { fill: GREY }); }) },
              { h: 80, cells: letters.map(function (le) { return cell(le in pmap ? f2(pmap[le]) : '-', { fill: GREY, bold: false }); }) }
            ]
          }]
        });
      }

      // 5 + 6 | advocacy effect
      if (res.advocacy) {
        var amap = {}, nmap = {};
        res.advocacy.forEach(function (a) { amap[a.letter] = a.advT2; nmap[a.letter] = a.nonT2; });
        var advVals = res.advocacy.map(function (a) { return a.advT2; });
        var nonVals = res.advocacy.map(function (a) { return a.nonT2; });
        var advAvg = mean(advVals), nonAvg = mean(nonVals);

        slides.push({
          texts: [title('Advocacy effect: Across all candidates'),
            { text: '"advocate" value < "non advocate" value = Advocacy Effect', x: 480, y: 240, w: 1600, h: 100, fontPx: 40, color: '#000000', bold: true, font: 'Candara' }],
          tables: [{
            x: 780, y: 560, colWidths: [660, 260],
            border: { color: '#FFFFFF', w: 2 }, font: 'Candara',
            rows: [
              { h: 100, cells: [cell('Advocate Average', { fill: GREY, align: 'l', bold: false }), cell(f2(advAvg), { fill: GREY })] },
              { h: 100, cells: [cell('Non Advocate Average', { fill: GREY, align: 'l', bold: false }), cell(f2(nonAvg), { fill: GREY })] }
            ]
          }]
        });

        var colW6 = 220, label6 = 560;
        function row6(label, map, fmt) {
          return {
            h: 84,
            cells: [cell(label, { fill: GREY, align: 'l', bold: false, size: 26 })].concat(letters.map(function (le) {
              return cell(le in map ? fmt(map[le]) : '-', { fill: GREY, bold: false, size: 26 });
            }))
          };
        }
        var dmapA = {};
        if (res.advDelta) Object.keys(res.advDelta).forEach(function (le) { dmapA[le] = res.advDelta[le].d; });
        var pmap2 = {};
        (res.persuasion || []).forEach(function (p) { pmap2[p.letter] = p.diff; });
        slides.push({
          texts: [title('Advocacy effect: By Candidate')],
          tables: [{
            x: (CW - (label6 + colW6 * 8)) / 2, y: 340,
            colWidths: [label6].concat(letters.map(function () { return colW6; })),
            border: { color: '#FFFFFF', w: 2 }, font: 'Candara',
            rows: [
              { h: 80, cells: [cell('Advocacy Effects', { fill: GREY, align: 'l' })].concat(letters.map(function (le) { return cell(le, { fill: GREY }); })) },
              row6('Advocates Δ (R1−R2)', dmapA, f2),
              row6('Non-advocates Δ (R1−R2)', pmap2, f2),
              row6('Advocate (R2 avg)', amap, f2),
              row6('Non Advocate (R2 avg)', nmap, f2)
            ]
          }]
        });
      }

      return { canvasW: CW, canvasH: CH, background: '#FFFFFF', slides: slides };
    }

    function exportDeck() {
      if (!window.pptxLite || !state.out) return;
      var res = kidneyStats(state.out, state.sv, state.excludeTest);
      var spec = buildDeck(res);
      var bytes = window.pptxLite.makePptx(spec);
      var blob = new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation' });
      var a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'LEADTK_DEX-KID_deck_' + new Date().toISOString().slice(0, 10) + '.pptx';
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(function () { URL.revokeObjectURL(a.href); }, 5000);
      $('kd-status').textContent = '✓ deck exported (' + spec.slides.length + ' slides)';
    }

    /* ---------- report ---------- */

    function f2(x) { return isNaN(x) ? '-' : x.toFixed(2); }

    function refresh() {
      if (!state.out || state.out.rankCols.length < 2) {
        $('kd-out').style.display = 'none';
        $('kd-empty').style.display = '';
        $('kd-copy').disabled = true;
        $('kd-deck').disabled = true;
        return;
      }
      $('kd-deck').disabled = false;
      var res = kidneyStats(state.out, state.sv, state.excludeTest);
      var L = [];
      L.push('=== KIDNEY EXERCISE | outcomes ===');
      L.push('Round 2 file: ' + state.out.fileName + ' (' + res.n2 + ' responses' +
        (res.excludedTest ? ', ' + res.excludedTest + ' test response(s) excluded' : '') + ')');
      if (state.sv) {
        L.push('Round 1 file: ' + state.sv.fileName + ' (' + state.sv.rows.length + ' responses)' +
          (res.joinN ? ' · ' + res.joinN + ' students matched across both files by uni' : ''));
      }
      L.push('Ranks: 1 = first in line for the kidney. Lower mean = better.');
      L.push('');

      if (res.r1) {
        L.push('ROUND 1 | individual rankings from the nightly survey ("Your First Round Rankings")');
        res.letters.forEach(function (le) {
          var s = res.r1[le];
          if (s) L.push('  Candidate ' + le + ':  mean ' + f2(s.mean) + '   (SD ' + f2(s.sd) + ', n ' + s.n + ')');
        });
        var w1 = res.letters.slice().sort(function (a, b) { return res.r1[a].mean - res.r1[b].mean; })[0];
        L.push('  → lowest mean: Candidate ' + w1 + ' (' + f2(res.r1[w1].mean) + '); would have received the kidney before the speeches');
        L.push('');
      }

      L.push('ROUND 2 | rankings after the advocacy speeches');
      res.letters.forEach(function (le) {
        var s = res.r2[le];
        L.push('  Candidate ' + le + ':  mean ' + f2(s.mean) + '   (SD ' + f2(s.sd) + ', n ' + s.n + ')');
      });
      L.push('  → CANDIDATE ' + res.winner + ' RECEIVES THE KIDNEY (lowest mean, ' + f2(res.r2[res.winner].mean) + ')');
      L.push('');

      if (res.persuasion) {
        L.push('PERSUASIVENESS | how far each group moved the room');
        L.push('(non-advocates only, mean of Round1 − Round2 per student; + = gained favor)');
        res.persuasion.forEach(function (p, i) {
          L.push('  ' + (i + 1) + '. Candidate ' + p.letter + ':  ' + (p.diff >= 0 ? '+' : '') + f2(p.diff) +
            '   (n ' + p.n + ')' + (i === 0 ? '   ← most persuasive group' : ''));
        });
        L.push('');
      }

      if (res.advocacy) {
        L.push('ADVOCACY EFFECT | do advocates fall for their own candidate?');
        L.push('(mean Round-2 rank of the candidate: their advocates vs everyone else)');
        var gaps = [];
        res.advocacy.forEach(function (a) {
          var gap = a.nonT2 - a.advT2;
          gaps.push(gap);
          L.push('  Candidate ' + a.letter + ':  advocates ' + f2(a.advT2) + ' (n ' + a.advN + ')  vs  others ' + f2(a.nonT2) +
            '   (advocates rank it ' + (gap >= 0 ? f2(gap) + ' better' : f2(-gap) + ' worse') + ')');
        });
        if (gaps.length) {
          L.push('  → on average, advocates rank their own candidate ' + f2(mean(gaps)) + ' positions better than the rest of the room');
        }
        L.push('');
      } else if (state.out.repIdx < 0) {
        L.push('(no "which candidate did you represent" column found; advocacy/persuasiveness need it)');
        L.push('');
      }

      if (!state.sv) {
        L.push('(add the nightly survey file to also get Round 1, Persuasiveness, and the full picture)');
        L.push('');
      }
      L.push('- generated by LEAD Toolkit · all processing local -');

      $('kd-out').value = L.join('\n');
      $('kd-out').style.display = '';
      $('kd-empty').style.display = 'none';
      $('kd-copy').disabled = false;
      $('kd-status').textContent = 'winner: Candidate ' + res.winner +
        (res.joinN ? ' · joined n=' + res.joinN : '');
    }

    /* ---------- events ---------- */

    function wireDrop(dropId, fileId, which) {
      var drop = $(dropId), input = $(fileId);
      drop.addEventListener('click', function () { input.click(); });
      input.addEventListener('change', function () { if (input.files[0]) loadInto(which, input.files[0]); });
      ['dragover', 'dragenter'].forEach(function (ev) {
        drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.add('drag'); });
      });
      ['dragleave', 'drop'].forEach(function (ev) {
        drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.remove('drag'); });
      });
      drop.addEventListener('drop', function (e) { if (e.dataTransfer.files[0]) loadInto(which, e.dataTransfer.files[0]); });
    }
    wireDrop('kd-drop1', 'kd-file1', 1);
    wireDrop('kd-drop2', 'kd-file2', 2);

    // demo: synthetic outcomes (R2 + advocates) AND nightly round-1 files
    $('kd-demo').addEventListener('click', function () {
      var letters = 'ABCDEFGH'.split('');
      var outHead = ['uni'].concat(letters.map(function (l, j) { return 'rank_' + (j + 1); })).concat(['represent']);
      var svHead = ['uni'].concat(letters.map(function (l, j) { return 'initialrank_' + (j + 1); }));
      var outRaw = [outHead], svRaw = [svHead];
      for (var i = 0; i < 48; i++) {
        var uni = 'demo' + (i + 1);
        var r2 = letters.map(function (l, j) { return j === 2 ? 1 + (i % 2) : 2 + ((j + i) % 7); });
        var r1 = letters.map(function (l, j) { return ((j + i) % 8) + 1; });
        outRaw.push([uni].concat(r2.map(String)).concat([letters[i % 8]]));
        svRaw.push([uni].concat(r1.map(String)));
      }
      var sq1 = splitQualtrics(outRaw);
      state.out = {
        fileName: 'demo data', rows: sq1.rows,
        rankCols: findRankColumns(sq1.names, sq1.qtexts),
        repIdx: findRepColumn(sq1.names, sq1.qtexts),
        uniIdx: findUniColumn(sq1.names, sq1.qtexts)
      };
      $('kd-info1').innerHTML = '<span class="file-info">✓ demo data · 48 responses</span>';
      var sq2 = splitQualtrics(svRaw);
      state.sv = {
        fileName: 'demo data', rows: sq2.rows,
        rankCols: findRankColumns(sq2.names, sq2.qtexts),
        uniIdx: findUniColumn(sq2.names, sq2.qtexts)
      };
      $('kd-info2').innerHTML = '<span class="file-info">✓ demo data · 48 responses</span>';
      refresh();
    });

    $('kd-test').addEventListener('change', function (e) { state.excludeTest = e.target.checked; refresh(); });
    $('kd-cluster').addEventListener('input', function (e) { state.clusterLabel = e.target.value || 'Cluster'; });
    $('kd-deck').addEventListener('click', exportDeck);
    renderOthers();
    $('kd-copy').addEventListener('click', function () {
      var out = $('kd-out');
      out.focus(); out.select();
      var ok = false;
      try { ok = document.execCommand('copy'); } catch (e) { }
      if (!ok && navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(out.value);
      }
      $('kd-status').textContent = '✓ copied';
      window.getSelection().removeAllRanges();
    });
  }

  /* ======================================================================
     REGISTER / EXPORT
     ====================================================================== */

  if (typeof window !== 'undefined' && window.LeadToolkit) {
    window.LeadToolkit.registerApp({
      id: 'kidney',
      icon: '🧮🫘',
      group: 'Class 3 - Influence and Persuasion',
      name: 'Data Extractor | Kidney Exercise',
      code: 'DEX-KID',
      intro: { upload: 'the Kidney Outcomes export (plus the nightly survey for Round 1)', to: 'rankings, persuasiveness, advocacy effect and the 6-slide debrief deck' },
      tags: ['kidney', 'rankings', 'persuasiveness', 'advocacy', 'deck', 'debrief', 'candidates', 'influence'],
      description: 'Drop the Kidney Outcomes export (+ the nightly survey) and get the whole debrief: pasteable numbers AND a ready-made slide deck (rankings, other clusters, persuasiveness, advocacy effect).',
      mount: mount
    });
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
      mean: mean, sdSample: sdSample, normUni: normUni, isTestUni: isTestUni,
      findRankColumns: findRankColumns, findRepColumn: findRepColumn,
      findUniColumn: findUniColumn, parseRank: parseRank, kidneyStats: kidneyStats
    };
  }
})();
