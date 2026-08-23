/* ==========================================================================
   App 1 | Wordcloud Generator
   Replicates the R pipeline used by the LEAD teaching team:
     read_csv -> pick text column(s) -> (optional row filter) ->
     unnest_tokens -> anti_join(stopwords) -> count ->
     colorRampPalette(Blues)(n) by frequency rank -> wordcloud2()
   The rendering engine (assets/vendor/wordcloud2.js) is the exact library the
   R wordcloud2 package embeds, extracted from a saved widget, so output
   matches the R word clouds.
   Everything happens in the browser. No data leaves the machine.
   ========================================================================== */

(function () {
  'use strict';

  /* ======================================================================
     PURE LOGIC (no DOM) | also exported for node-based tests
     ====================================================================== */

  // Snowball English stopword list | same lexicon as tidytext get_stopwords()
  var SNOWBALL_STOPWORDS = [
    'i', 'me', 'my', 'myself', 'we', 'our', 'ours', 'ourselves', 'you', 'your',
    'yours', 'yourself', 'yourselves', 'he', 'him', 'his', 'himself', 'she',
    'her', 'hers', 'herself', 'it', 'its', 'itself', 'they', 'them', 'their',
    'theirs', 'themselves', 'what', 'which', 'who', 'whom', 'this', 'that',
    'these', 'those', 'am', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
    'have', 'has', 'had', 'having', 'do', 'does', 'did', 'doing', 'would',
    'should', 'could', 'ought', "i'm", "you're", "he's", "she's", "it's",
    "we're", "they're", "i've", "you've", "we've", "they've", "i'd", "you'd",
    "he'd", "she'd", "we'd", "they'd", "i'll", "you'll", "he'll", "she'll",
    "we'll", "they'll", "isn't", "aren't", "wasn't", "weren't", "hasn't",
    "haven't", "hadn't", "doesn't", "don't", "didn't", "won't", "wouldn't",
    "shan't", "shouldn't", "can't", 'cannot', "couldn't", "mustn't", "let's",
    "that's", "who's", "what's", "here's", "there's", "when's", "where's",
    "why's", "how's", 'a', 'an', 'the', 'and', 'but', 'if', 'or', 'because',
    'as', 'until', 'while', 'of', 'at', 'by', 'for', 'with', 'about',
    'against', 'between', 'into', 'through', 'during', 'before', 'after',
    'above', 'below', 'to', 'from', 'up', 'down', 'in', 'out', 'on', 'off',
    'over', 'under', 'again', 'further', 'then', 'once', 'here', 'there',
    'when', 'where', 'why', 'how', 'all', 'any', 'both', 'each', 'few',
    'more', 'most', 'other', 'some', 'such', 'no', 'nor', 'not', 'only',
    'own', 'same', 'so', 'than', 'too', 'very', 'will'
  ];

  var PALETTES = {
    blues:   { name: 'Blues (R script)',  stops: ['#08306B', '#2171B9', '#6BAED6', '#C6DBEF', '#E3F2FD'] },
    reds:    { name: 'Reds (R script)',   stops: ['#6B0B0B', '#991B1B', '#C62828', '#D84315', '#FF7043', '#FFAB91'] },
    greens:  { name: 'Greens',            stops: ['#00441B', '#1B7837', '#5AAE61', '#A6DBA0', '#D9F0D3'] },
    purples: { name: 'Purples',           stops: ['#3F007D', '#54278F', '#807DBA', '#BCBDDC', '#EFEDF5'] },
    slate:   { name: 'Slate',             stops: ['#111827', '#374151', '#6B7280', '#9CA3AF', '#E5E7EB'] }
  };

  // Guess the delimiter from the first line (Qualtrics = comma).
  function detectDelimiter(text) {
    var line = text.slice(0, text.indexOf('\n') === -1 ? text.length : text.indexOf('\n'));
    var counts = { ',': 0, '\t': 0, ';': 0 };
    var inQ = false;
    for (var i = 0; i < line.length; i++) {
      var c = line[i];
      if (c === '"') inQ = !inQ;
      else if (!inQ && counts[c] !== undefined) counts[c]++;
    }
    if (counts['\t'] > counts[','] && counts['\t'] > counts[';']) return '\t';
    if (counts[';'] > counts[','] && counts[';'] > counts['\t']) return ';';
    return ',';
  }

  // Minimal, correct RFC-4180 parser (quoted fields, "" escapes, CR/LF, BOM).
  function parseCSV(text, delim) {
    delim = delim || ',';
    if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);
    var rows = [], row = [], field = '', i = 0, inQ = false;
    while (i < text.length) {
      var c = text[i];
      if (inQ) {
        if (c === '"') {
          if (text[i + 1] === '"') { field += '"'; i += 2; continue; }
          inQ = false; i++; continue;
        }
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

  // Qualtrics raw exports carry 2 extra header rows (question text + ImportId
  // JSON). Detect and drop them so both raw and cleaned CSVs work.
  function stripQualtrics(rows) {
    var drop = 0;
    for (var i = 1; i <= 2 && i < rows.length; i++) {
      var hasImport = rows[i].some(function (c) {
        return typeof c === 'string' && c.indexOf('"ImportId"') !== -1;
      });
      if (hasImport) drop = i;
    }
    if (!drop) return { rows: rows, stripped: 0 };
    return { rows: [rows[0]].concat(rows.slice(drop + 1)), stripped: drop };
  }

  function dedupeHeaders(headers) {
    var seen = {};
    return headers.map(function (h, idx) {
      var n = (h === null || h === undefined || h === '') ? 'column ' + (idx + 1) : String(h).trim();
      if (seen[n]) { seen[n]++; n = n + ' (' + seen[n] + ')'; } else { seen[n] = 1; }
      return n;
    });
  }

  // Word tokenizer matching tidytext::unnest_tokens defaults: lowercase,
  // punctuation stripped, numbers kept, intra-word apostrophes kept
  // ("don't", "friday's"). Curly apostrophes are normalized first (improves
  // on R, which counted friday's and friday's separately).
  function tokenize(text, opts) {
    opts = opts || {};
    var t = String(text === null || text === undefined ? '' : text).replace(/['']/g, "'");
    if (opts.lowercase !== false) t = t.toLowerCase();
    var m = t.match(/[\p{L}\p{N}]+(?:'[\p{L}\p{N}]+)*/gu) || [];
    var out = [];
    for (var i = 0; i < m.length; i++) {
      var w = m[i].replace(/^'+|'+$/g, '');
      if (!w) continue;
      if (opts.stripNumbers && /^\p{N}+$/u.test(w)) continue;
      out.push(w);
    }
    return out;
  }

  // R colorRampPalette(stops)(n): even linear RGB interpolation, n colors.
  function colorRamp(stops, n) {
    var rgb = stops.map(function (h) {
      return [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
    });
    var out = [];
    for (var i = 0; i < n; i++) {
      var t = (n === 1) ? 0 : i / (n - 1);
      var x = t * (rgb.length - 1);
      var k = Math.min(Math.floor(x), rgb.length - 2);
      var f = x - k;
      var hex = '#';
      for (var j = 0; j < 3; j++) {
        var v = Math.round(rgb[k][j] + (rgb[k + 1][j] - rgb[k][j]) * f);
        hex += ('0' + v.toString(16)).slice(-2);
      }
      out.push(hex);
    }
    return out;
  }

  // Count words/responses over the selected columns of the included rows.
  function buildCounts(rows, colIdxs, opts) {
    var counts = new Map();
    rows.forEach(function (r) {
      colIdxs.forEach(function (ci) {
        var cell = String(r[ci] === undefined || r[ci] === null ? '' : r[ci]).trim();
        if (!cell || cell === 'NA' || cell === 'N/A') return;
        if (opts.mode === 'whole') {
          var w = cell.replace(/\s+/g, ' ');
          if (opts.lowercase !== false) w = w.toLowerCase();
          counts.set(w, (counts.get(w) || 0) + 1);
        } else {
          tokenize(cell, opts).forEach(function (t) {
            counts.set(t, (counts.get(t) || 0) + 1);
          });
        }
      });
    });
    return counts;
  }

  // Stopwords + manual removals + min count + cap; returns [[word, n], ...]
  // sorted by n desc (ties alphabetical), like count() %>% arrange(desc(n)).
  function filterAndSort(counts, opts) {
    var stop = opts.useStopwords ? new Set(SNOWBALL_STOPWORDS) : new Set();
    var custom = opts.customStop || new Set();
    var manual = opts.manualRemoved || new Set();
    var list = [];
    counts.forEach(function (n, w) {
      var lw = w.toLowerCase();
      if (stop.has(lw) || custom.has(lw) || manual.has(w)) return;
      if (n < (opts.minCount || 1)) return;
      list.push([w, n]);
    });
    list.sort(function (a, b) { return b[1] - a[1] || a[0].localeCompare(b[0]); });
    if (opts.maxWords && list.length > opts.maxWords) list = list.slice(0, opts.maxWords);
    return list;
  }

  // applyTransform: 'linear' is the default (hardcoded); kept for completeness.
  function applyTransform(list, kind) {
    var f = kind === 'sqrt' ? Math.sqrt : (kind === 'log' ? function (x) { return Math.log(x + 1); } : function (x) { return x; });
    return list.map(function (d) { return [d[0], f(d[1])]; });
  }

  // Merge added-word overrides into a sorted count list.
  // overrides: plain object {word: count}. Overridden words replace their computed
  // count (or append as new if not already in the list). New words with count > 0
  // are appended. The result is re-sorted desc by count.
  function applyAddedWords(list, overrides) {
    var keys = Object.keys(overrides);
    if (!keys.length) return list;
    var out = list.filter(function (d) { return overrides[d[0]] === undefined; });
    keys.forEach(function (w) {
      var n = overrides[w];
      if (n > 0) out.push([w, n]);
    });
    out.sort(function (a, b) { return b[1] - a[1] || a[0].localeCompare(b[0]); });
    return out;
  }

  // Deterministic PRNG so preview, shuffle and reload are reproducible.
  function mulberry32(a) {
    return function () {
      a |= 0; a = a + 0x6D2B79F5 | 0;
      var t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }

  /* ======================================================================
     SAMPLE DATA (embedded so the demo works over file:// with no fetch)
     ====================================================================== */

  var SAMPLE_CSV = 'student,cluster,takeaway,one_word\n' +
    '1,H,"Writing things down before the meeting helped me speak up instead of agreeing by default.",preparation\n' +
    '2,W,"A good process beats a brilliant hunch; our group did best when we agreed on steps first.",process\n' +
    '3,X,"I noticed I stop listening once I have decided; slowing down changed the outcome.",listening\n' +
    '4,H,"Delegating the small stuff freed me to actually lead the discussion.",delegation\n' +
    '5,W,"Feedback lands better when it is specific and asked for, not dumped on people.",feedback\n' +
    '6,X,"Quiet teammates had the best ideas once we went around the table on purpose.",voice\n' +
    '7,H,"Deadlines made us decisive but also sloppier; the balance is the leader\'s job.",deadlines\n' +
    '8,W,"I default to consensus even when a call is needed; I want to practice deciding.",deciding\n' +
    '9,X,"Trust grew fastest when someone admitted a mistake first.",trust\n' +
    '10,H,"Our team norms were invisible until we broke one.",norms\n' +
    '11,W,"Asking one more question changed my read of the situation completely.",questions\n' +
    '12,X,"I underestimated how much energy the room takes from the leader\'s mood.",energy\n' +
    '13,H,"Structure is kindness: agendas and roles made the shy people participate.",structure\n' +
    '14,W,"We anchored on the first number said out loud; naming that helped us restart.",anchoring\n' +
    '15,X,"Disagreement felt personal until we wrote options on the board.",disagreement\n' +
    '16,H,"I want to give my team the why, not just the what.",purpose\n' +
    '17,W,"Rotating who speaks first surfaced ideas we would have missed.",rotation\n' +
    '18,X,"Being direct and being kind are not opposites.",directness\n' +
    '19,H,"The debrief taught me more than the exercise itself.",reflection\n' +
    '20,W,"I confuse confidence with correctness, in myself and in others.",confidence\n' +
    '21,X,"Small wins early made the group trust the plan.",momentum\n' +
    '22,H,"I plan to schedule thinking time before committing to answers.",thinking\n' +
    '23,W,"Roles removed the awkwardness of who does what.",roles\n' +
    '24,X,"We performed better when someone owned the clock.",timekeeping\n' +
    '25,H,"My instinct is to fill silence; letting it sit got others talking.",silence\n' +
    '26,W,"Naming the decision rule up front avoided a fight later.",rules\n' +
    '27,X,"I learned to separate the idea from the person proposing it.",objectivity\n' +
    '28,H,"Checking assumptions out loud felt slow and saved us twice.",assumptions\n' +
    '29,W,"A team of friends still needs explicit expectations.",expectations\n' +
    '30,X,"I lead better standing at the board than sitting with my laptop.",presence\n' +
    '31,H,"The recap email did more for alignment than the meeting itself.",alignment\n' +
    '32,W,"Curiosity de-escalated a conflict that authority would have inflamed.",curiosity\n' +
    '33,X,"I want to ask for help earlier instead of polishing alone.",help\n' +
    '34,H,"Celebrating the attempt, not just the result, changed how people took risks.",risk\n' +
    '35,W,"Leading is mostly noticing: who is in, who is lost, who is quiet.",noticing\n' +
    '36,H,NA,noticing\n';

  /* ======================================================================
     UI
     ====================================================================== */

  function mount(container) {
    var NATIVE_RANDOM = Math.random;

    var state = {
      headers: [], rows: [], fileName: null, strippedNote: '',
      col1: -1, col2: -1, mode: 'tokens',
      filterCol: -1, includeValues: null,     // null = include all
      useStopwords: true, manualRemoved: new Set(),
      addedWords: {},                          // word -> count overrides/additions
      minCount: 1, maxWords: 300, lowercase: true, stripNumbers: false,
      palette: 'blues', customDark: '#08306B', customLight: '#E3F2FD',
      size: 1.0, rotate: 30, rotDir: 'both',
      ellipticity: 0.65, shape: 'circle', gridSize: 0,
      font: 'sans-serif', bg: 'white', dims: '2600x1674',
      seed: 20260821
    };

    container.innerHTML = '' +
      '<div class="app-title"><h2>☁️ Wordcloud Generator</h2>' +
      '<span class="sub">CSV in → word cloud PNG out. Matches the R <code>wordcloud2</code> output. Nothing is uploaded.</span></div>' +
      '<div class="app-layout">' +
      '  <div class="sidebar">' +

      '    <details class="step" open id="wc-step1">' +
      '      <summary><span class="n">1</span> Load data <span class="hint" id="wc-fhint"></span></summary>' +
      '      <div class="body">' +
      '        <div class="dropzone" id="wc-drop"><strong>DROP DATA HERE</strong><ul class="drop-spec"><li><b>Type of file:</b> CSV or Excel (.xlsx)</li><li><b>What you\'re looking for:</b> a nightly survey with a takeaway column (raw Qualtrics exports are fine; usually: Cluster, uni, takeaway, …)</li></ul></div>' +
      '        <input type="file" id="wc-file" accept=".csv,.tsv,.txt,.xlsx,.xlsm,.xltx" style="display:none">' +
      '        <div id="wc-fileinfo"></div>' +
      '        <label class="field" id="wc-sheetrow" style="display:none">Sheet' +
      '          <select id="wc-sheet"></select></label>' +
      '        <div class="clusterblock" id="wc-clusterblock" style="display:none">' +
      '          <div class="clusterlabel">Select cluster(s)</div>' +
      '          <label class="field">Cluster column<select id="wc-filtercol"></select></label>' +
      '          <div id="wc-filtervals"></div>' +
      '        </div>' +
      '        <div class="row"><button id="wc-sample" class="fixed">🎲 Demo data</button></div>' +
      '      </div>' +
      '    </details>' +

      '    <details class="step disabled" open id="wc-step2">' +
      '      <summary><span class="n">2</span> Choose the text</summary>' +
      '      <div class="body">' +
      '        <label class="field">Column with the responses' +
      '          <select id="wc-col1"></select></label>' +
      '        <label class="field">Second column <span class="sub">(optional, combined with the first)</span>' +
      '          <select id="wc-col2"></select></label>' +
      '        <label class="field">How to count' +
      '          <select id="wc-mode">' +
      '            <option value="tokens">Split responses into words (sentences → words)</option>' +
      '            <option value="whole">Count whole responses (one-word answers)</option>' +
      '          </select></label>' +
      '      </div>' +
      '    </details>' +

      '    <details class="step disabled" open id="wc-step3">' +
      '      <summary><span class="n">3</span> Edit the words <span class="hint" id="wc-wordhint"></span></summary>' +
      '      <div class="body">' +
      '        <label class="check"><input type="checkbox" id="wc-stop" checked> Remove common English words (the, and, of …)</label>' +
      '        <div class="row">' +
      '          <label class="check fixed"><input type="checkbox" id="wc-lower" checked> Lowercase</label>' +
      '          <label class="check fixed"><input type="checkbox" id="wc-nonum"> Drop numbers</label>' +
      '        </div>' +
      '        <div class="row">' +
      '          <label class="field">Min. count<input type="number" id="wc-mincount" min="1" value="1"></label>' +
      '          <label class="field">Max words<input type="number" id="wc-maxwords" min="10" value="300"></label>' +
      '        </div>' +
      '        <div class="word-tools">' +
      '          <input type="text" id="wc-search" placeholder="find a word…">' +
      '          <span class="mini-links"><a id="wc-resetremoved">restore removed</a></span>' +
      '        </div>' +
      '        <div class="word-list" id="wc-words"></div>' +
      '        <div class="small-note">Click ✕ on a word to remove it from the cloud. Removed words show below; click to restore.</div>' +
      '        <div class="word-list" id="wc-removed" style="display:none"></div>' +
      '        <div style="margin-top:6px">' +
      '          <div class="row" style="align-items:center;gap:6px;flex-wrap:wrap">' +
      '            <input type="text" id="wc-addword" placeholder="add a word…" style="flex:2;min-width:80px">' +
      '            <input type="number" id="wc-addcount" placeholder="count" min="1" style="flex:1;min-width:60px">' +
      '            <button id="wc-addbtn" class="fixed">+ Add</button>' +
      '          </div>' +
      '        </div>' +
      '        <details id="wc-editcounts" style="margin-top:6px">' +
      '          <summary style="font-size:0.82em;cursor:pointer;color:var(--accent)">Edit word counts (top 30)</summary>' +
      '          <div id="wc-editlist" style="margin-top:4px"></div>' +
      '        </details>' +
      '      </div>' +
      '    </details>' +

      '    <details class="step disabled" open id="wc-step4">' +
      '      <summary><span class="n">4</span> Style</summary>' +
      '      <div class="body">' +
      '        <div class="palette-row" id="wc-palettes"></div>' +
      '        <div class="custom-colors">Custom:' +
      '          <input type="color" id="wc-cdark" value="#08306B" title="most frequent">' +
      '          <input type="color" id="wc-clight" value="#E3F2FD" title="least frequent">' +
      '          <span class="small-note">dark = frequent → light = rare</span></div>' +
      '        <div class="slider-field"><div class="top">Overall word size <output id="wc-size-o">1.0×</output></div>' +
      '          <input type="range" id="wc-size" min="0.3" max="3" step="0.05" value="1"></div>' +
      '        <div class="slider-field"><div class="top">Vertical words <output id="wc-rot-o">30%</output></div>' +
      '          <input type="range" id="wc-rot" min="0" max="100" step="5" value="30"></div>' +
      '        <label class="field">Vertical direction' +
      '          <select id="wc-rotdir">' +
      '            <option value="both">Both directions</option>' +
      '            <option value="one">One direction (↥)</option>' +
      '            <option value="onerev">One direction (↧)</option>' +
      '          </select></label>' +
      '        <div class="slider-field"><div class="top">Roundness <output id="wc-ell-o">0.65</output></div>' +
      '          <input type="range" id="wc-ell" min="0.3" max="1.3" step="0.05" value="0.65"></div>' +
      '        <label class="field">Shape' +
      '          <select id="wc-shape">' +
      '            <option value="circle">Ellipse / circle (R default)</option>' +
      '            <option value="cardioid">Cardioid</option>' +
      '            <option value="diamond">Diamond</option>' +
      '            <option value="triangle">Triangle</option>' +
      '            <option value="pentagon">Pentagon</option>' +
      '            <option value="star">Star</option>' +
      '          </select></label>' +
      '        <div class="slider-field"><div class="top">Word spacing <output id="wc-grid-o">auto</output></div>' +
      '          <input type="range" id="wc-grid" min="0" max="24" step="2" value="0"></div>' +
      '        <label class="field">Font' +
      '          <select id="wc-font">' +
      '            <option value="sans-serif">Sans-serif (R default)</option>' +
      '            <option value="Arial">Arial</option>' +
      '            <option value="Helvetica Neue">Helvetica Neue</option>' +
      '            <option value="Verdana">Verdana</option>' +
      '            <option value="Trebuchet MS">Trebuchet MS</option>' +
      '            <option value="Georgia">Georgia</option>' +
      '            <option value="Times New Roman">Times New Roman</option>' +
      '            <option value="Impact">Impact</option>' +
      '          </select></label>' +
      '        <div class="row">' +
      '          <label class="field">Background' +
      '            <select id="wc-bg"><option value="white">White</option><option value="transparent">Transparent</option></select></label>' +
      '          <label class="field">Image size' +
      '            <select id="wc-dims">' +
      '              <option value="2600x1674">2600 × 1674 (R export)</option>' +
      '              <option value="2560x1440">2560 × 1440 (16:9 slide)</option>' +
      '              <option value="2400x1800">2400 × 1800 (4:3)</option>' +
      '              <option value="2000x2000">2000 × 2000 (square)</option>' +
      '            </select></label>' +
      '        </div>' +
      '      </div>' +
      '    </details>' +
      '  </div>' +

      '  <div class="preview-panel">' +
      '    <div class="preview-toolbar">' +
      '      <button id="wc-shuffle">⟳ Shuffle layout</button>' +
      '      <button id="wc-download" class="primary" disabled>⬇ PNG</button>' +
      '      <button id="wc-ppt" disabled>⬇ PowerPoint</button>' +
      '      <span class="status" id="wc-status"></span>' +
      '    </div>' +
      '    <div class="canvas-holder" id="wc-holder">' +
      '      <div class="empty-msg" id="wc-empty">output displayed HERE</div>' +
      '      <canvas id="wc-canvas" style="display:none"></canvas>' +
      '      <div class="veil">Rendering…</div>' +
      '    </div>' +
      '  </div>' +
      '</div>';

    var $ = function (id) { return container.querySelector('#' + id); };
    var canvas = $('wc-canvas'), holder = $('wc-holder'), statusEl = $('wc-status');
    var drawnCount = 0, lastListLength = 0, renderTimer = null;

    if (typeof window.WordCloud !== 'function') {
      statusEl.textContent = 'wordcloud2.js failed to load; check assets/vendor/.';
      return;
    }

    /* ---------- palettes ---------- */

    function paletteStops() {
      if (state.palette === 'custom') return [state.customDark, state.customLight];
      return PALETTES[state.palette].stops;
    }

    function buildPaletteRow() {
      var rowEl = $('wc-palettes');
      rowEl.innerHTML = '';
      Object.keys(PALETTES).forEach(function (key) {
        var p = PALETTES[key];
        var sw = document.createElement('div');
        sw.className = 'swatch' + (state.palette === key ? ' on' : '');
        sw.style.background = 'linear-gradient(90deg,' + p.stops.join(',') + ')';
        sw.innerHTML = '<span>' + p.name + '</span>';
        sw.addEventListener('click', function () {
          state.palette = key; buildPaletteRow(); scheduleRender();
        });
        rowEl.appendChild(sw);
      });
      var cu = document.createElement('div');
      cu.className = 'swatch' + (state.palette === 'custom' ? ' on' : '');
      cu.style.background = 'linear-gradient(90deg,' + state.customDark + ',' + state.customLight + ')';
      cu.innerHTML = '<span>Custom</span>';
      cu.addEventListener('click', function () { state.palette = 'custom'; buildPaletteRow(); scheduleRender(); });
      rowEl.appendChild(cu);
    }

    /* ---------- data loading ---------- */

    function sniffEncoding(buf) {
      var b = new Uint8Array(buf.slice(0, 2));
      if (b[0] === 0xFF && b[1] === 0xFE) return 'utf-16le';
      if (b[0] === 0xFE && b[1] === 0xFF) return 'utf-16be';
      return 'utf-8';
    }

    function loadFile(file) {
      file.arrayBuffer().then(function (buf) {
        var bytes = new Uint8Array(buf);
        if (window.xlsxLite && window.xlsxLite.isZipFile(bytes)) {
          return window.parseXlsx(buf).then(function (sheets) {
            sheets = sheets.filter(function (s) { return s.rows.length; });
            if (!sheets.length) throw new Error('the workbook has no data');
            state._sheets = sheets;
            state._fileName = file.name;
            $('wc-sheet').innerHTML = sheets.map(function (s, i) {
              return '<option value="' + i + '">' + escapeHtml(s.name) + '</option>';
            }).join('');
            $('wc-sheetrow').style.display = sheets.length > 1 ? '' : 'none';
            useSheet(0);
          });
        }
        var text = new TextDecoder(sniffEncoding(buf)).decode(buf);
        $('wc-sheetrow').style.display = 'none';
        loadText(text, file.name);
      }).catch(function (err) {
        $('wc-fileinfo').innerHTML = '<span class="file-warn">Could not read file: ' + (err.message || err) + '</span>';
      });
    }

    function useSheet(i) {
      var s = state._sheets[i];
      var rows = s.rows.map(function (r) {
        return r.map(function (c) { return c === null || c === undefined ? '' : String(c); });
      });
      loadRows(rows, state._fileName + (state._sheets.length > 1 ? ' · ' + s.name : ''));
    }

    function loadText(text, name) {
      loadRows(parseCSV(text, detectDelimiter(text)), name);
    }

    function loadRows(raw, name) {
      if (raw.length < 2) {
        $('wc-fileinfo').innerHTML = '<span class="file-warn">That file has no data rows.</span>';
        return;
      }
      var res = stripQualtrics(raw);
      state.headers = dedupeHeaders(res.rows[0]);
      state.rows = res.rows.slice(1);
      state.fileName = name;
      state.strippedNote = res.stripped ? ' · Qualtrics header rows removed' : '';
      state.manualRemoved = new Set();
      state.addedWords = {};
      state.filterCol = -1; state.includeValues = null;

      $('wc-fileinfo').innerHTML = '<span class="file-info">✓ ' + name + ' | ' +
        state.rows.length + ' rows × ' + state.headers.length + ' columns' + state.strippedNote + '</span>';
      $('wc-fhint').textContent = name;

      guessColumns();
      populateColumnSelects();
      ['wc-step2', 'wc-step3', 'wc-step4'].forEach(function (s) { $(s).classList.remove('disabled'); });
      $('wc-download').disabled = false;
      $('wc-ppt').disabled = false;
      scheduleRender(true);
    }

    function guessColumns() {
      var re = /takeaway|inspir|infuriat|response|text|comment|reflection|word|answer/i;
      var idx = state.headers.findIndex(function (h) { return re.test(h); });
      if (idx === -1) {
        // fall back to the column with the longest average text
        var best = 0, bestLen = -1;
        state.headers.forEach(function (h, i) {
          var sum = 0, k = 0;
          for (var r = 0; r < Math.min(state.rows.length, 60); r++) { sum += String(state.rows[r][i] || '').length; k++; }
          var avg = k ? sum / k : 0;
          if (avg > bestLen) { bestLen = avg; best = i; }
        });
        idx = best;
      }
      state.col1 = idx; state.col2 = -1;
      // auto-select a cluster-ish filter column if present
      var fidx = state.headers.findIndex(function (h) { return /cluster/i.test(h); });
      state.filterCol = fidx; // -1 if none
      state.includeValues = null;
    }

    function populateColumnSelects() {
      var opts = state.headers.map(function (h, i) { return '<option value="' + i + '">' + escapeHtml(h) + '</option>'; }).join('');
      $('wc-col1').innerHTML = opts;
      $('wc-col2').innerHTML = '<option value="-1">- none -</option>' + opts;
      $('wc-filtercol').innerHTML = '<option value="-1">- no filter -</option>' + opts;
      $('wc-col1').value = String(state.col1);
      $('wc-col2').value = String(state.col2);
      $('wc-filtercol').value = String(state.filterCol);
      $('wc-clusterblock').style.display = '';
      buildFilterValues();
    }

    function escapeHtml(s) {
      return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    /* ---------- cluster-picker doctrine ---------- */

    function buildFilterValues() {
      var box = $('wc-filtervals');
      box.innerHTML = '';
      if (state.filterCol < 0) { updateRowCount(); return; }
      var uniq = new Map();
      state.rows.forEach(function (r) {
        var v = String(r[state.filterCol] === undefined ? '' : r[state.filterCol]).trim();
        uniq.set(v, (uniq.get(v) || 0) + 1);
      });
      if (uniq.size > 40) {
        box.innerHTML = '<div class="small-note">⚠ ' + uniq.size + ' different values in that column; pick a column with groups (like clusters).</div>';
        state.includeValues = null; updateRowCount(); return;
      }

      // cluster-picker: default NONE selected; if exactly one unique value auto-select it
      if (state.includeValues === null) {
        if (uniq.size === 1) {
          state.includeValues = new Set(uniq.keys());
        } else {
          state.includeValues = new Set(); // default: nothing selected
        }
      }

      var allSelected = state.includeValues.size === uniq.size;
      var noneSelected = state.includeValues.size === 0;

      var btns = document.createElement('div');
      btns.className = 'mini-links';
      btns.innerHTML = '<a id="wc-flt-all">Select all</a><a id="wc-flt-none">Clear all</a>';
      btns.querySelector('#wc-flt-all').addEventListener('click', function () {
        state.includeValues = new Set(uniq.keys());
        buildFilterValues(); scheduleRender();
      });
      btns.querySelector('#wc-flt-none').addEventListener('click', function () {
        state.includeValues = new Set();
        buildFilterValues(); scheduleRender();
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
          notice.textContent = state.includeValues.size === 0 ? 'tick your cluster(s) above to continue' : '';
          updateRowCount(); scheduleRender();
        });
        list.appendChild(lab);
      });
      box.appendChild(list);

      // show the "tick cluster" note if nothing is selected
      if (noneSelected && uniq.size > 1) {
        notice.textContent = 'tick your cluster(s) above to continue';
      }

      updateRowCount();
    }

    function includedRows() {
      if (state.filterCol < 0 || state.includeValues === null) return state.rows;
      return state.rows.filter(function (r) {
        var v = String(r[state.filterCol] === undefined ? '' : r[state.filterCol]).trim();
        return state.includeValues.has(v);
      });
    }

    function updateRowCount() {
      var inc = includedRows().length;
      var rc = document.getElementById('wc-rowspan');
      if (!rc && $('wc-fileinfo')) {
        rc = document.createElement('span');
        rc.id = 'wc-rowspan';
        rc.className = 'small-note';
        $('wc-fileinfo').appendChild(rc);
      }
      if (rc) rc.textContent = state.rows.length ? (' using ' + inc + ' of ' + state.rows.length + ' rows') : '';
    }

    /* ---------- word list computation ---------- */

    function currentList() {
      if (!state.rows.length || state.col1 < 0) return [];
      // if cluster filter is active and nothing selected, show nothing
      if (state.filterCol >= 0 && state.includeValues !== null && state.includeValues.size === 0) return [];
      var cols = [state.col1];
      if (state.col2 >= 0 && state.col2 !== state.col1) cols.push(state.col2);
      var counts = buildCounts(includedRows(), cols, {
        mode: state.mode, lowercase: state.lowercase, stripNumbers: state.stripNumbers
      });
      var list = filterAndSort(counts, {
        useStopwords: state.useStopwords,
        customStop: new Set(),
        manualRemoved: state.manualRemoved,
        minCount: state.minCount,
        maxWords: state.maxWords
      });
      return applyAddedWords(list, state.addedWords);
    }

    /* ---------- edit-count list (top 30) ---------- */

    function buildEditList(list) {
      var box = $('wc-editlist');
      box.innerHTML = '';
      var top = list.slice(0, 30);
      top.forEach(function (d) {
        var row = document.createElement('div');
        row.style.cssText = 'display:flex;align-items:center;gap:4px;margin-bottom:2px';
        var lbl = document.createElement('span');
        lbl.style.cssText = 'flex:2;font-size:0.82em;overflow:hidden;text-overflow:ellipsis;white-space:nowrap';
        lbl.textContent = d[0];
        var inp = document.createElement('input');
        inp.type = 'number';
        inp.min = '1';
        inp.style.cssText = 'flex:1;min-width:50px;font-size:0.82em';
        inp.value = String(d[1]);
        inp.addEventListener('change', function () {
          var v = parseInt(inp.value, 10);
          if (v > 0) {
            state.addedWords[d[0]] = v;
          } else {
            delete state.addedWords[d[0]];
          }
          scheduleRender();
        });
        row.appendChild(lbl);
        row.appendChild(inp);
        box.appendChild(row);
      });
    }

    function renderChips(list) {
      var box = $('wc-words');
      var q = $('wc-search').value.trim().toLowerCase();
      box.innerHTML = '';

      // "nothing selected" state
      if (state.filterCol >= 0 && state.includeValues !== null && state.includeValues.size === 0) {
        box.innerHTML = '<span class="small-note" style="padding:6px">tick your cluster(s) above to continue</span>';
        $('wc-removed').style.display = 'none';
        $('wc-wordhint').textContent = '';
        buildEditList([]);
        return;
      }

      var shown = 0;
      list.forEach(function (d) {
        if (q && d[0].toLowerCase().indexOf(q) === -1) return;
        if (shown >= 400) return;
        shown++;
        var chip = document.createElement('span');
        chip.className = 'chip';
        chip.innerHTML = escapeHtml(d[0]) + ' <span class="cnt">' + d[1] + '</span><button title="remove">✕</button>';
        chip.querySelector('button').addEventListener('click', function () {
          state.manualRemoved.add(d[0]);
          // also clear any addedWords override for this word
          delete state.addedWords[d[0]];
          refreshWords(); scheduleRender();
        });
        box.appendChild(chip);
      });
      if (!list.length) box.innerHTML = '<span class="small-note" style="padding:6px">No words yet.</span>';

      var rbox = $('wc-removed');
      rbox.innerHTML = '';
      if (state.manualRemoved.size) {
        rbox.style.display = '';
        state.manualRemoved.forEach(function (w) {
          var chip = document.createElement('span');
          chip.className = 'chip removed';
          chip.textContent = w;
          chip.title = 'click to restore';
          chip.addEventListener('click', function () {
            state.manualRemoved.delete(w);
            refreshWords(); scheduleRender();
          });
          rbox.appendChild(chip);
        });
      } else {
        rbox.style.display = 'none';
      }
      $('wc-wordhint').textContent = list.length ? (list.length + ' words') : '';
      buildEditList(list);
    }

    function refreshWords() { renderChips(currentList()); }

    /* ---------- rendering ---------- */

    function rotationSettings() {
      var R = Math.PI / 2;
      if (state.rotDir === 'one') return { minRotation: R, maxRotation: R, rotationSteps: 0 };
      if (state.rotDir === 'onerev') return { minRotation: -R, maxRotation: -R, rotationSteps: 0 };
      return { minRotation: -R, maxRotation: R, rotationSteps: 2 };
    }

    function scheduleRender(immediate) {
      clearTimeout(renderTimer);
      renderTimer = setTimeout(render, immediate ? 0 : 250);
    }

    function render() {
      var list = currentList();
      renderChips(list);
      // cluster filter active but nothing ticked: show the notice instead
      // of rendering (or keeping a stale cloud on screen)
      if (state.rows.length && state.filterCol >= 0 &&
          state.includeValues !== null && state.includeValues.size === 0) {
        canvas.style.display = 'none';
        var em0 = $('wc-empty');
        em0.textContent = 'tick your cluster(s) above to continue';
        em0.style.display = '';
        statusEl.textContent = '';
        return;
      }
      if (!list.length) return;

      var d = state.dims.split('x');
      var W = parseInt(d[0], 10), H = parseInt(d[1], 10);
      canvas.style.display = '';
      $('wc-empty').textContent = 'output displayed HERE';
      $('wc-empty').style.display = 'none';
      canvas.width = W; canvas.height = H;

      // colors by frequency rank, exactly like colorRampPalette(...)(n)
      var colors = colorRamp(paletteStops(), list.length);
      var colorMap = new Map();
      list.forEach(function (dd, i) { colorMap.set(dd[0], colors[i]); });

      // size mapping is always linear (the R default); the old contrast
      // select is gone, applyTransform stays for the node tests
      var tlist = applyTransform(list, 'linear');
      var tMax = tlist.length ? tlist[0][1] : 1;
      var maxPx = state.size * 0.125 * W;

      var rot = rotationSettings();
      drawnCount = 0; lastListLength = list.length;
      holder.classList.add('rendering');

      Math.random = mulberry32(state.seed);   // reproducible layout

      window.WordCloud(canvas, {
        list: tlist,
        fontFamily: state.font,
        fontWeight: 'bold',
        color: function (word) { return colorMap.get(word) || '#000000'; },
        minSize: 0,
        weightFactor: function (w) { return (w / tMax) * maxPx; },
        backgroundColor: state.bg === 'transparent' ? 'rgba(255,255,255,0)' : '#ffffff',
        gridSize: state.gridSize,
        minRotation: rot.minRotation,
        maxRotation: rot.maxRotation,
        rotationSteps: rot.rotationSteps,
        rotateRatio: state.rotate / 100,
        shuffle: true,
        shape: state.shape,
        ellipticity: state.ellipticity,
        clearCanvas: true
      });
    }

    canvas.addEventListener('wordclouddrawn', function () { drawnCount++; });
    canvas.addEventListener('wordcloudstop', function () {
      holder.classList.remove('rendering');
      var d = state.dims.split('x');
      statusEl.textContent = drawnCount + ' of ' + lastListLength + ' words placed · ' +
        d[0] + '×' + d[1] + ' px · layout #' + state.seed;
    });

    /* ---------- download ---------- */

    function download() {
      var col = state.headers[state.col1] || 'wordcloud';
      var fname = 'LEADTK_WCG_' + String(col).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') +
        '_' + new Date().toISOString().slice(0, 10) + '.png';
      canvas.toBlob(function (blob) {
        var a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = fname;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(function () { URL.revokeObjectURL(a.href); }, 5000);
      }, 'image/png');
    }

    /* ---------- wire up events ---------- */

    var drop = $('wc-drop'), fileInput = $('wc-file');
    drop.addEventListener('click', function () { fileInput.click(); });
    fileInput.addEventListener('change', function () { if (fileInput.files[0]) loadFile(fileInput.files[0]); });
    ['dragover', 'dragenter'].forEach(function (ev) {
      drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.add('drag'); });
    });
    ['dragleave', 'drop'].forEach(function (ev) {
      drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.remove('drag'); });
    });
    drop.addEventListener('drop', function (e) {
      if (e.dataTransfer.files[0]) loadFile(e.dataTransfer.files[0]);
    });
    $('wc-sample').addEventListener('click', function () {
      $('wc-sheetrow').style.display = 'none';
      loadText(SAMPLE_CSV, 'demo data');
    });
    $('wc-sheet').addEventListener('change', function (e) { useSheet(+e.target.value); });

    $('wc-col1').addEventListener('change', function (e) {
      state.col1 = +e.target.value; state.manualRemoved = new Set(); state.addedWords = {};
      refreshWords(); scheduleRender();
    });
    $('wc-col2').addEventListener('change', function (e) {
      state.col2 = +e.target.value; state.addedWords = {};
      refreshWords(); scheduleRender();
    });
    $('wc-mode').addEventListener('change', function (e) { state.mode = e.target.value; refreshWords(); scheduleRender(); });
    $('wc-filtercol').addEventListener('change', function (e) {
      state.filterCol = +e.target.value; state.includeValues = null; buildFilterValues(); scheduleRender();
    });

    $('wc-stop').addEventListener('change', function (e) { state.useStopwords = e.target.checked; scheduleRender(); });
    $('wc-lower').addEventListener('change', function (e) { state.lowercase = e.target.checked; scheduleRender(); });
    $('wc-nonum').addEventListener('change', function (e) { state.stripNumbers = e.target.checked; scheduleRender(); });
    $('wc-mincount').addEventListener('change', function (e) { state.minCount = Math.max(1, +e.target.value || 1); scheduleRender(); });
    $('wc-maxwords').addEventListener('change', function (e) { state.maxWords = Math.max(10, +e.target.value || 300); scheduleRender(); });
    $('wc-search').addEventListener('input', refreshWords);
    $('wc-resetremoved').addEventListener('click', function () { state.manualRemoved = new Set(); refreshWords(); scheduleRender(); });

    // add-a-word
    $('wc-addbtn').addEventListener('click', function () {
      var w = $('wc-addword').value.trim();
      var n = parseInt($('wc-addcount').value, 10);
      if (!w || !(n > 0)) return;
      state.addedWords[w] = n;
      // if it was in manualRemoved, restore it
      state.manualRemoved.delete(w);
      $('wc-addword').value = '';
      $('wc-addcount').value = '';
      refreshWords(); scheduleRender();
    });

    $('wc-cdark').addEventListener('input', function (e) { state.customDark = e.target.value; state.palette = 'custom'; buildPaletteRow(); scheduleRender(); });
    $('wc-clight').addEventListener('input', function (e) { state.customLight = e.target.value; state.palette = 'custom'; buildPaletteRow(); scheduleRender(); });

    function bindSlider(id, outId, key, fmt) {
      $(id).addEventListener('input', function (e) {
        state[key] = parseFloat(e.target.value);
        $(outId).textContent = fmt(state[key]);
        scheduleRender();
      });
    }
    bindSlider('wc-size', 'wc-size-o', 'size', function (v) { return v.toFixed(2).replace(/0$/, '') + '×'; });
    bindSlider('wc-rot', 'wc-rot-o', 'rotate', function (v) { return v + '%'; });
    bindSlider('wc-ell', 'wc-ell-o', 'ellipticity', function (v) { return v.toFixed(2); });
    bindSlider('wc-grid', 'wc-grid-o', 'gridSize', function (v) { return v === 0 ? 'auto' : v + ' px'; });

    $('wc-rotdir').addEventListener('change', function (e) { state.rotDir = e.target.value; scheduleRender(); });
    $('wc-shape').addEventListener('change', function (e) { state.shape = e.target.value; scheduleRender(); });
    $('wc-font').addEventListener('change', function (e) { state.font = e.target.value; scheduleRender(); });
    $('wc-bg').addEventListener('change', function (e) { state.bg = e.target.value; scheduleRender(); });
    $('wc-dims').addEventListener('change', function (e) { state.dims = e.target.value; scheduleRender(); });

    $('wc-shuffle').addEventListener('click', function () {
      state.seed = Math.floor(NATIVE_RANDOM() * 2147483647);
      scheduleRender(true);
    });
    $('wc-download').addEventListener('click', download);
    $('wc-ppt').addEventListener('click', function () {
      window.LeadToolkit.downloadCanvasPptx(canvas, 'LEADTK_WCG_' + new Date().toISOString().slice(0, 10) + '.pptx');
    });

    buildPaletteRow();
  }

  /* ======================================================================
     REGISTER / EXPORT
     ====================================================================== */

  if (typeof window !== 'undefined' && window.LeadToolkit) {
    window.LeadToolkit.registerApp({
      id: 'wordcloud',
      icon: '☁️',
      group: 'Class 2 - Decision Making',
      name: 'Wordcloud Generator',
      code: 'WCG',
      intro: { upload: 'the nightly survey (CSV or Excel), any class', to: 'draw the takeaways wordcloud for your cluster (PNG or PowerPoint)' },
      description: 'Upload the evening survey CSV, pick the takeaway column(s) and cluster, clean up words, and download a PNG that matches the R wordcloud2 output.',
      tags: ['takeaways', 'words', 'wordcloud', 'cloud', 'nightly survey'],
      cards: [
        { group: 'Class 3 - Influence and Persuasion', name: 'Wordcloud Generator', description: 'The same wordcloud app; point it at the Class 3 takeaways.', sub: '' },
        { group: 'Class 4 - Collective Intelligence', name: 'Wordcloud Generator', description: 'The same wordcloud app; point it at the Class 4 takeaways.', sub: '' },
        { group: 'Class 5 - Culture', name: 'Wordcloud Generator', description: 'The same wordcloud app; point it at the Class 5 takeaways.', sub: '' },
        { group: 'Class 6 - Negotiations', name: 'Wordcloud Generator', description: 'The same wordcloud app; point it at the Class 6 takeaways.', sub: '' }
      ],
      mount: mount
    });
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
      SNOWBALL_STOPWORDS: SNOWBALL_STOPWORDS,
      PALETTES: PALETTES,
      detectDelimiter: detectDelimiter,
      parseCSV: parseCSV,
      stripQualtrics: stripQualtrics,
      dedupeHeaders: dedupeHeaders,
      tokenize: tokenize,
      colorRamp: colorRamp,
      buildCounts: buildCounts,
      filterAndSort: filterAndSort,
      applyTransform: applyTransform,
      applyAddedWords: applyAddedWords,
      mulberry32: mulberry32,
      SAMPLE_CSV: SAMPLE_CSV
    };
  }
})();
