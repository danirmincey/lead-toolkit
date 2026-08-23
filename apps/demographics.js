/* ==========================================================================
   App 2 | Demographics (treemaps)
   Replicates the treemap recipes in Dani's R script (FA2025 LEAD CH - DRM.R):
     count(column) -> squarified treemap (largest tile bottom-left, like
     treemapify) -> fill = sample(colorRampPalette(brewer.pal(9,"Blues"))(n))
     -> centered bold label (shrink to fit, hidden when too small) +
     "n (x.x%)" bottom-right -> black/white text via the script's exact
     luminance rule (0.2126R + 0.7152G + 0.0722B > 130).
   Two modes:
     • Single treemap | any column (College Majors, Job Roles, Industry, …).
     • Domestic vs International | two panels, widths proportional to the
       split, optional translucent "United States" veil (the overlay Dani
       used to add in PowerPoint) and optional headers, all toggleable.
   Everything is client-side; the canvas renders at export resolution.
   ========================================================================== */

(function () {
  'use strict';

  /* ======================================================================
     PURE LOGIC (exported for node tests)
     ====================================================================== */

  var BREWER_BLUES_9 = ['#F7FBFF', '#DEEBF7', '#C6DBEF', '#9ECAE1', '#6BAED6',
    '#4292C6', '#2171B5', '#08519C', '#08306B'];

  var DEMO_PALETTES = {
    blues:   { name: 'Blues (R script)', stops: BREWER_BLUES_9 },
    reds:    { name: 'Reds',    stops: ['#FFF5F0', '#FCBBA1', '#FB6A4A', '#CB181D', '#67000D'] },
    greens:  { name: 'Greens',  stops: ['#F7FCF5', '#C7E9C0', '#74C476', '#238B45', '#00441B'] },
    purples: { name: 'Purples', stops: ['#FCFBFD', '#DADAEB', '#9E9AC8', '#6A51A3', '#3F007D'] },
    greys:   { name: 'Greys',   stops: ['#FFFFFF', '#D9D9D9', '#969696', '#525252', '#000000'] }
  };

  // linear RGB interpolation over gradient stops = R colorRampPalette
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

  // the R script's exact label-contrast rule
  function textColorFor(hex) {
    var r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16), b = parseInt(hex.slice(5, 7), 16);
    return (0.2126 * r + 0.7152 * g + 0.0722 * b) > 130 ? '#000000' : '#FFFFFF';
  }

  // R: paste0(round(x, 1)) | drops trailing ".0"
  function fmtR(x) { return String(Math.round(x * 10) / 10); }

  function mulberry32(a) {
    return function () {
      a |= 0; a = a + 0x6D2B79F5 | 0;
      var t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }

  function seededShuffle(arr, seed) {
    var rnd = mulberry32(seed), a = arr.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(rnd() * (i + 1));
      var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }

  // colors for n ranked tiles (rank 0 = largest)
  function assignColors(n, stops, order, seed) {
    var ramp = colorRamp(stops, n);            // light -> dark
    if (order === 'desc') return ramp.slice().reverse();  // largest darkest
    if (order === 'asc') return ramp;                     // largest lightest
    return seededShuffle(ramp, seed);                     // R script default: sample()
  }

  // count non-empty values of a column; returns [[value, n], ...] sorted
  // desc, ties alphabetical (like count() %>% arrange(desc(n)))
  function countColumn(rows, ci, excluded) {
    var counts = new Map();
    rows.forEach(function (r) {
      var v = String(r[ci] === undefined || r[ci] === null ? '' : r[ci]).trim();
      if (!v || v === 'NA' || v === 'N/A') return;
      if (excluded && excluded.has(v)) return;
      counts.set(v, (counts.get(v) || 0) + 1);
    });
    var list = [];
    counts.forEach(function (n, v) { list.push([v, n]); });
    list.sort(function (a, b) { return b[1] - a[1] || a[0].localeCompare(b[0]); });
    return list;
  }

  /* Squarified treemap (Bruls et al.) with treemapify's bottom-left start.
     items: [[key, value], ...] sorted desc. Returns tiles
     {key, value, x, y, w, h} in canvas coordinates (y down). */
  function squarify(items, X, Y, W, H) {
    var total = items.reduce(function (s, d) { return s + d[1]; }, 0);
    if (!total || W <= 0 || H <= 0) return [];
    var scale = (W * H) / total;
    var rest = items.map(function (d) { return { key: d[0], value: d[1], area: d[1] * scale }; });
    var out = [];
    var rect = { x: 0, y: 0, w: W, h: H };   // math coords, flipped at the end

    function worst(row, side) {
      var sum = 0, i;
      for (i = 0; i < row.length; i++) sum += row[i].area;
      var max = 0;
      for (i = 0; i < row.length; i++) {
        var r = (side * side * row[i].area) / (sum * sum);
        r = Math.max(r, 1 / r);
        if (r > max) max = r;
      }
      return max;
    }

    function layoutRow(row) {
      var sum = 0, i;
      for (i = 0; i < row.length; i++) sum += row[i].area;
      if (rect.w >= rect.h) {           // vertical strip on the left edge
        var stripW = sum / rect.h;
        var yy = rect.y;
        for (i = 0; i < row.length; i++) {
          var hh = row[i].area / stripW;
          out.push({ key: row[i].key, value: row[i].value, x: rect.x, y: yy, w: stripW, h: hh });
          yy += hh;
        }
        rect = { x: rect.x + stripW, y: rect.y, w: rect.w - stripW, h: rect.h };
      } else {                          // horizontal strip on the top edge
        var stripH = sum / rect.w;
        var xx = rect.x;
        for (i = 0; i < row.length; i++) {
          var ww = row[i].area / stripH;
          out.push({ key: row[i].key, value: row[i].value, x: xx, y: rect.y, w: ww, h: stripH });
          xx += ww;
        }
        rect = { x: rect.x, y: rect.y + stripH, w: rect.w, h: rect.h - stripH };
      }
    }

    var row = [];
    for (var i = 0; i < rest.length;) {
      var side = Math.min(rect.w, rect.h);
      if (!row.length || worst(row.concat(rest[i]), side) <= worst(row, side)) {
        row.push(rest[i]); i++;
      } else {
        layoutRow(row); row = [];
      }
    }
    if (row.length) layoutRow(row);

    // flip vertically so the first (largest) tile sits bottom-left,
    // then translate into the requested rect
    return out.map(function (t) {
      return { key: t.key, value: t.value, x: X + t.x, y: Y + (H - t.y - t.h), w: t.w, h: t.h };
    });
  }

  // label wrapping helpers: break on spaces, and after "/" like the slides
  function splitLabelTokens(text) {
    var out = [];
    String(text).split(/\s+/).forEach(function (w) {
      var cur = '';
      for (var i = 0; i < w.length; i++) {
        cur += w[i];
        if (w[i] === '/') { out.push(cur); cur = ''; }
      }
      if (cur) out.push(cur);
    });
    return out.filter(Boolean);
  }

  /* ======================================================================
     SAMPLE DATA (synthetic roster, embedded for file:// demo)
     ====================================================================== */

  var SAMPLE_ROSTER =
    'Name,Address Country,Address City,UG School 1 Field,Job 1 Industry,Job 1 Function\n';
  (function () {
    var us = [['New York', 10], ['Brooklyn', 3], ['San Francisco', 3], ['Boston', 2], ['Chicago', 2],
      ['Atlanta', 1], ['Austin', 1], ['Miami', 1], ['Seattle', 1], ['Denver', 1], ['Houston', 1]];
    var intl = [['India', 4], ['United Kingdom', 3], ['China', 2], ['Brazil', 2], ['Israel', 2],
      ['Japan', 1], ['Singapore', 1], ['Colombia', 1], ['Australia', 1], ['Greece', 1]];
    var majors = ['Economics', 'Engineering', 'Finance', 'Accounting/Business Education', 'Mathematics',
      'Chemistry', 'Management', 'Other Science', 'English', 'Political Science', 'Law', 'Marketing',
      'International Business', 'Psychology', 'History'];
    var industries = ['Consulting', 'Financial Services', 'Technology', 'Healthcare', 'Consumer Goods',
      'Media/Entertainment', 'Energy', 'Real Estate', 'Education', 'Government'];
    var funcs = ['Consulting', 'Strategic Planning (Internal)', 'Venture Capital/Private Equity',
      'Brand/Product Management', 'Business Development/Product Development', 'General Management',
      'Sales', 'Advertising', 'Technology', 'Healthcare', 'Investment Banking/Brokerage', 'Other'];
    var k = 1, lines = [];
    function push(country, city) {
      lines.push('Student ' + k + ',' + country + ',' + city + ',' +
        '"' + majors[k % majors.length] + '","' + industries[k % industries.length] + '","' + funcs[k % funcs.length] + '"');
      k++;
    }
    us.forEach(function (d) { for (var i = 0; i < d[1]; i++) push('United States', d[0]); });
    intl.forEach(function (d) { for (var i = 0; i < d[1]; i++) push(d[0], ''); });
    SAMPLE_ROSTER += lines.join('\n') + '\n';
  })();

  /* ======================================================================
     UI
     ====================================================================== */

  function mount(container) {
    var NATIVE_RANDOM = Math.random;

    var state = {
      headers: [], rows: [], fileName: null, _sheets: null,
      mode: 'single',
      col: -1,                       // single-mode column
      countryCol: -1, cityCol: -1, domesticValue: 'United States',
      excluded: {},                  // colIndex -> Set of removed values
      palette: 'blues', customDark: '#08306B', customLight: '#F7FBFF',
      colorOrder: 'random', seed: 20260821,
      borderW: 2, borderC: '#FFFFFF',
      labelScale: 1, showCounts: true,
      headerFont: 'Corbel', bodyFont: 'Candara',
      headPctScale: 1, headLabScale: 1, countScale: 1,
      synth: {},                     // colIndex -> [[label, count], ...] added by hand
      filterCol: -1, includeValues: null,
      showTitle: true, titleText: '', titleDirty: false, titleColor: '#2E74B5',
      showHeaders: true, headL: '', headR: '', headLDirty: false, headRDirty: false,
      showVeil: true, veilLabel: 'United States', veilColor: '#0B2A5B', veilAlpha: 0.55,
      showTotals: true,
      dims: '2400x1260'
    };

    container.innerHTML = '' +
      '<div class="app-title"><h2>📊🌳 Plot Generator | Tree Plots</h2>' +
      '<span class="sub">Roster in (Excel or CSV) → Blues treemaps out, matching the R script. Nothing is uploaded.</span></div>' +
      '<div class="app-layout">' +
      '  <div class="sidebar">' +

      '    <details class="step" open id="dm-step1">' +
      '      <summary><span class="n">1</span> Load data <span class="hint" id="dm-fhint"></span></summary>' +
      '      <div class="body">' +
      '        <div class="dropzone" id="dm-drop"><strong>DROP DATA HERE</strong><ul class="drop-spec"><li><b>Type of file:</b> CSV or Excel (.xlsx)</li><li><b>What you\'re looking for:</b> the main roster / student info sheet (columns like College Major, Job Role, Country, City)</li></ul></div>' +
      '        <input type="file" id="dm-file" accept=".csv,.tsv,.txt,.xlsx,.xlsm,.xltx" style="display:none">' +
      '        <div id="dm-fileinfo"></div>' +
      '        <label class="field" id="dm-sheetrow" style="display:none">Sheet' +
      '          <select id="dm-sheet"></select></label>' +
      '        <div class="clusterblock" id="dm-clusterblock" style="display:none">' +
      '          <div class="clusterlabel">Select cluster(s)</div>' +
      '          <label class="field">Cluster column<select id="dm-filtercol"></select></label>' +
      '          <div id="dm-filtervals"></div>' +
      '        </div>' +
      '        <div class="row"><button id="dm-sample" class="fixed">🎲 Demo data</button></div>' +
      '      </div>' +
      '    </details>' +

      '    <details class="step disabled" open id="dm-step2">' +
      '      <summary><span class="n">2</span> What to plot</summary>' +
      '      <div class="body">' +
      '        <label class="field">Plot type' +
      '          <select id="dm-mode">' +
      '            <option value="single">Single treemap (majors, roles, industry, …)</option>' +
      '            <option value="duo">Domestic vs International (two panels)</option>' +
      '          </select></label>' +
      '        <div id="dm-singleopts">' +
      '          <label class="field">Column<select id="dm-col"></select></label>' +
      '        </div>' +
      '        <div id="dm-duoopts" style="display:none">' +
      '          <label class="field">Country column<select id="dm-country"></select></label>' +
      '          <label class="field">City column<select id="dm-city"></select></label>' +
      '          <label class="field">Domestic country<select id="dm-domestic"></select></label>' +
      '        </div>' +
      '        <div class="small-note" id="dm-datanote"></div>' +
      '      </div>' +
      '    </details>' +

      '    <details class="step disabled" id="dm-step3">' +
      '      <summary><span class="n">3</span> Edit categories <span class="hint" id="dm-cathint"></span></summary>' +
      '      <div class="body">' +
      '        <div id="dm-chips"></div>' +
      '        <div class="small-note">Click ✕ to drop a category from the plot; removed ones show struck-through; click to restore.</div>' +
      '      </div>' +
      '    </details>' +

      '    <details class="step disabled" open id="dm-step4">' +
      '      <summary><span class="n">4</span> Style</summary>' +
      '      <div class="body">' +
      '        <div class="palette-row" id="dm-palettes"></div>' +
      '        <div class="custom-colors">Custom:' +
      '          <input type="color" id="dm-cdark" value="#08306B">' +
      '          <input type="color" id="dm-clight" value="#F7FBFF">' +
      '        </div>' +
      '        <label class="field">Color arrangement' +
      '          <select id="dm-order">' +
      '            <option value="random">Random shuffle (R script default)</option>' +
      '            <option value="desc">Darkest = biggest</option>' +
      '            <option value="asc">Lightest = biggest</option>' +
      '          </select></label>' +
      '        <div class="row">' +
      '          <label class="field">Header font' +
      '            <select id="dm-hfont">' +
      '              <option selected>Corbel</option><option>Candara</option><option>Arial</option><option>Georgia</option><option>Calibri</option>' +
      '            </select></label>' +
      '          <label class="field">Body font' +
      '            <select id="dm-bfont">' +
      '              <option>Corbel</option><option selected>Candara</option><option>Arial</option><option>Georgia</option><option>Calibri</option>' +
      '            </select></label>' +
      '        </div>' +
      '        <div class="slider-field"><div class="top">Header % size <output id="dm-hpct-o">1.0×</output></div>' +
      '          <input type="range" id="dm-hpct" min="0.5" max="2" step="0.05" value="1"></div>' +
      '        <div class="slider-field"><div class="top">Header label size <output id="dm-hlab-o">1.0×</output></div>' +
      '          <input type="range" id="dm-hlab" min="0.5" max="2" step="0.05" value="1"></div>' +
      '        <div class="slider-field"><div class="top">Tile label size <output id="dm-lab-o">1.0×</output></div>' +
      '          <input type="range" id="dm-lab" min="0.5" max="2" step="0.05" value="1"></div>' +
      '        <div class="slider-field"><div class="top">"n (%)" size <output id="dm-cnt-o">1.0×</output></div>' +
      '          <input type="range" id="dm-cnt" min="0.5" max="2" step="0.05" value="1"></div>' +
      '        <label class="check"><input type="checkbox" id="dm-counts" checked> Show "n (x.x%)" labels</label>' +
      '        <div class="row">' +
      '          <label class="field">Border width<input type="number" id="dm-bw" min="0" max="12" value="2"></label>' +
      '          <label class="field">Border color<input type="color" id="dm-bc" value="#FFFFFF"></label>' +
      '        </div>' +
      '        <hr style="border:none;border-top:1px solid var(--line);margin:2px 0">' +
      '        <div id="dm-titleopts">' +
      '          <label class="check"><input type="checkbox" id="dm-title" checked> Title above the plot</label>' +
      '          <div class="row">' +
      '            <input type="text" id="dm-titletext" placeholder="e.g. College Majors">' +
      '            <input type="color" id="dm-titlecolor" value="#2E74B5" class="fixed" style="width:42px">' +
      '          </div>' +
      '        </div>' +
      '        <div id="dm-duostyle" style="display:none">' +
      '          <label class="check"><input type="checkbox" id="dm-headers" checked> Panel headers</label>' +
      '          <div class="row">' +
      '            <input type="text" id="dm-headl" placeholder="66% Domestic Students">' +
      '            <input type="text" id="dm-headr" placeholder="34% International Students">' +
      '          </div>' +
      '          <div class="mini-links"><a id="dm-headreset">reset header text</a></div>' +
      '          <label class="check"><input type="checkbox" id="dm-veil" checked> "United States" overlay veil (the PowerPoint effect)</label>' +
      '          <div class="row">' +
      '            <input type="text" id="dm-veiltext" value="United States">' +
      '            <input type="color" id="dm-veilcolor" value="#0B2A5B" class="fixed" style="width:42px">' +
      '          </div>' +
      '          <div class="slider-field"><div class="top">Veil opacity <output id="dm-veilo-o">55%</output></div>' +
      '            <input type="range" id="dm-veilo" min="0" max="100" step="5" value="55"></div>' +
      '          <label class="check"><input type="checkbox" id="dm-totals" checked> Corner total on the domestic panel ("51 (66.2%)")</label>' +
      '        </div>' +
      '        <label class="field">Image size' +
      '          <select id="dm-dims">' +
      '            <option value="2400x1260">2400 × 1260 (default)</option>' +
      '            <option value="2204x1086">2204 × 1086 (slide graphic)</option>' +
      '            <option value="2600x1360">2600 × 1360</option>' +
      '            <option value="1920x1010">1920 × 1010</option>' +
      '            <option value="2000x2000">2000 × 2000 (square)</option>' +
      '          </select></label>' +
      '      </div>' +
      '    </details>' +
      '  </div>' +

      '  <div class="preview-panel">' +
      '    <div class="preview-toolbar">' +
      '      <button id="dm-shuffle">⟳ Shuffle colors</button>' +
      '      <button id="dm-download" class="primary" disabled>⬇ PNG</button>' +
      '      <button id="dm-ppt" disabled>⬇ PowerPoint</button>' +
      '      <span class="status" id="dm-status"></span>' +
      '    </div>' +
      '    <div class="canvas-holder" id="dm-holder">' +
      '      <div class="empty-msg" id="dm-empty">output displayed HERE</div>' +
      '      <canvas id="dm-canvas" style="display:none"></canvas>' +
      '      <div class="veil">Rendering…</div>' +
      '    </div>' +
      '  </div>' +
      '</div>';

    var $ = function (id) { return container.querySelector('#' + id); };
    var canvas = $('dm-canvas'), statusEl = $('dm-status');
    var renderTimer = null;

    function escapeHtml(s) {
      return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    /* ---------- palettes ---------- */

    function paletteStops() {
      if (state.palette === 'custom') return [state.customLight, state.customDark];
      return DEMO_PALETTES[state.palette].stops;
    }

    function buildPaletteRow() {
      var rowEl = $('dm-palettes');
      rowEl.innerHTML = '';
      Object.keys(DEMO_PALETTES).forEach(function (key) {
        var p = DEMO_PALETTES[key];
        var sw = document.createElement('div');
        sw.className = 'swatch' + (state.palette === key ? ' on' : '');
        sw.style.background = 'linear-gradient(90deg,' + p.stops.join(',') + ')';
        sw.innerHTML = '<span>' + p.name + '</span>';
        sw.addEventListener('click', function () { state.palette = key; buildPaletteRow(); scheduleRender(); });
        rowEl.appendChild(sw);
      });
      var cu = document.createElement('div');
      cu.className = 'swatch' + (state.palette === 'custom' ? ' on' : '');
      cu.style.background = 'linear-gradient(90deg,' + state.customLight + ',' + state.customDark + ')';
      cu.innerHTML = '<span>Custom</span>';
      cu.addEventListener('click', function () { state.palette = 'custom'; buildPaletteRow(); scheduleRender(); });
      rowEl.appendChild(cu);
    }

    /* ---------- data loading (same pattern as App 1) ---------- */

    function sniffEncoding(buf) {
      var b = new Uint8Array(buf.slice(0, 2));
      if (b[0] === 0xFF && b[1] === 0xFE) return 'utf-16le';
      if (b[0] === 0xFE && b[1] === 0xFF) return 'utf-16be';
      return 'utf-8';
    }

    // minimal CSV fallback (mirrors App 1's parser)
    function parseCSVText(text) {
      if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);
      var line0 = text.slice(0, text.indexOf('\n') === -1 ? text.length : text.indexOf('\n'));
      var counts = { ',': 0, '\t': 0, ';': 0 }, inQ0 = false;
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
            state._sheets = sheets;
            state.fileName = file.name;
            $('dm-sheet').innerHTML = sheets.map(function (s, i) {
              return '<option value="' + i + '">' + escapeHtml(s.name) + '</option>';
            }).join('');
            $('dm-sheetrow').style.display = sheets.length > 1 ? '' : 'none';
            useSheet(0);
          });
        }
        $('dm-sheetrow').style.display = 'none';
        var text = new TextDecoder(sniffEncoding(buf)).decode(buf);
        loadRows(parseCSVText(text), file.name);
      }).catch(function (err) {
        $('dm-fileinfo').innerHTML = '<span class="file-warn">Could not read file: ' + (err.message || err) + '</span>';
      });
    }

    function useSheet(i) {
      var s = state._sheets[i];
      var rows = s.rows.map(function (r) {
        return r.map(function (c) { return c === null || c === undefined ? '' : String(c); });
      });
      loadRows(rows, state.fileName + (state._sheets.length > 1 ? ' · ' + s.name : ''));
    }

    function loadRows(raw, name) {
      if (raw.length < 2) {
        $('dm-fileinfo').innerHTML = '<span class="file-warn">That file has no data rows.</span>';
        return;
      }
      state.headers = dedupeHeaders(raw[0]);
      state.rows = raw.slice(1);
      state.excluded = {};
      state.synth = {};
      state.titleDirty = false; state.headLDirty = false; state.headRDirty = false;

      // cluster doctrine: detect the filter column, default NOTHING ticked
      state.filterCol = detectClusterCol();
      state.includeValues = null;
      $('dm-filtercol').innerHTML = '<option value="-1">- no filter -</option>' +
        state.headers.map(function (hh, i) {
          return '<option value="' + i + '">' + escapeHtml(hh) + '</option>';
        }).join('');
      $('dm-filtercol').value = String(state.filterCol);
      $('dm-clusterblock').style.display = '';
      buildFilterValues();

      $('dm-fileinfo').innerHTML = '<span class="file-info">✓ ' + escapeHtml(name) + ' · ' +
        state.rows.length + ' rows × ' + state.headers.length + ' columns</span>';
      $('dm-fhint').textContent = name;

      guessColumns();
      populateSelects();
      ['dm-step2', 'dm-step3', 'dm-step4'].forEach(function (s) { $(s).classList.remove('disabled'); });
      $('dm-download').disabled = false;
      $('dm-ppt').disabled = false;
      syncModeUI();
      scheduleRender(true);
    }

    function guessColumns() {
      var h = state.headers;
      function find(re) { var i = h.findIndex(function (x) { return re.test(x); }); return i; }
      var single = find(/field|major/i);
      if (single === -1) single = find(/function|role/i);
      if (single === -1) single = find(/industry/i);
      if (single === -1) single = h.length > 1 ? 1 : 0;
      state.col = single;
      state.countryCol = find(/country/i);
      state.cityCol = find(/city/i);
    }

    function populateSelects() {
      var opts = state.headers.map(function (hh, i) {
        return '<option value="' + i + '">' + escapeHtml(hh) + '</option>';
      }).join('');
      $('dm-col').innerHTML = opts;
      $('dm-country').innerHTML = opts;
      $('dm-city').innerHTML = opts;
      $('dm-col').value = String(state.col);
      if (state.countryCol >= 0) $('dm-country').value = String(state.countryCol);
      if (state.cityCol >= 0) $('dm-city').value = String(state.cityCol);
      populateDomesticSelect();
    }

    function populateDomesticSelect() {
      var sel = $('dm-domestic');
      if (state.countryCol < 0) { sel.innerHTML = ''; return; }
      var counts = countColumn(state.rows, state.countryCol, null);
      var best = null;
      counts.forEach(function (d) {
        if (/^(the )?united states( of america)?$|^usa$|^us$|^u\.s\.a?\.?$/i.test(d[0]) && !best) best = d[0];
      });
      state.domesticValue = best || (counts.length ? counts[0][0] : '');
      sel.innerHTML = counts.map(function (d) {
        return '<option' + (d[0] === state.domesticValue ? ' selected' : '') + '>' + escapeHtml(d[0]) + '</option>';
      }).join('');
    }

    /* ---------- exclusions (chips) ---------- */

    function excludedFor(ci) {
      if (!state.excluded[ci]) state.excluded[ci] = new Set();
      return state.excluded[ci];
    }

    /* ---------- cluster filter (rows are filtered BEFORE counting) ---------- */

    function includedRows() {
      if (state.filterCol < 0 || state.includeValues === null) return state.rows;
      return state.rows.filter(function (r) {
        var v = String(r[state.filterCol] === undefined ? '' : r[state.filterCol]).trim();
        return state.includeValues.has(v);
      });
    }

    function filterGateActive() {
      return state.filterCol >= 0 && state.includeValues !== null && state.includeValues.size === 0;
    }

    // header matching /cluster/i wins; else a column whose repeated values
    // suggest groups (2-8 uniques, each 5-150 rows, covering most rows)
    function detectClusterCol() {
      var i, h = state.headers;
      for (i = 0; i < h.length; i++) if (/cluster/i.test(h[i])) return i;
      var nRows = state.rows.length;
      if (nRows < 10) return -1;
      for (i = 0; i < h.length; i++) {
        var uniq = new Map(), filled = 0;
        for (var r = 0; r < nRows; r++) {
          var v = String(state.rows[r][i] === undefined || state.rows[r][i] === null ? '' : state.rows[r][i]).trim();
          if (!v) continue;
          filled++;
          uniq.set(v, (uniq.get(v) || 0) + 1);
        }
        if (uniq.size < 2 || uniq.size > 8) continue;
        if (filled < nRows * 0.9) continue;
        var ok = true;
        uniq.forEach(function (n) { if (n > 150 || n < 5) ok = false; });
        if (ok) return i;
      }
      return -1;
    }

    function buildFilterValues() {
      var box = $('dm-filtervals');
      box.innerHTML = '';
      if (state.filterCol < 0 || !state.rows.length) { state.includeValues = null; return; }
      var uniq = new Map();
      state.rows.forEach(function (r) {
        var v = String(r[state.filterCol] === undefined ? '' : r[state.filterCol]).trim();
        uniq.set(v, (uniq.get(v) || 0) + 1);
      });
      if (uniq.size > 40) {
        box.innerHTML = '<div class="small-note">⚠ too many values in that column.</div>';
        state.includeValues = null;
        return;
      }
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
        buildFilterValues(); refreshChips(); scheduleRender();
      });
      bs[1].addEventListener('click', function () {
        state.includeValues.clear();
        buildFilterValues(); refreshChips(); scheduleRender();
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
          refreshChips(); scheduleRender();
        });
        list.appendChild(lab);
      });
      box.appendChild(list);
    }

    // countColumn + any hand-added synthetic categories for that column
    function countWithSynth(rows, ci, excluded) {
      var list = countColumn(rows, ci, excluded);
      var extra = state.synth[ci] || [];
      extra.forEach(function (d) {
        if (excluded && excluded.has(d[0])) return;
        for (var i = 0; i < list.length; i++) {
          if (list[i][0] === d[0]) { list[i] = [list[i][0], list[i][1] + d[1]]; return; }
        }
        list.push([d[0], d[1]]);
      });
      list.sort(function (a, b) { return b[1] - a[1] || a[0].localeCompare(b[0]); });
      return list;
    }

    function chipGroup(labelText, ci) {
      var wrap = document.createElement('div');
      var lab = document.createElement('div');
      lab.className = 'small-note'; lab.style.fontWeight = '700';
      lab.textContent = labelText;
      wrap.appendChild(lab);
      var listEl = document.createElement('div');
      listEl.className = 'word-list';
      var ex = excludedFor(ci);
      countWithSynth(includedRows(), ci, null).forEach(function (d) {
        var chip = document.createElement('span');
        var removed = ex.has(d[0]);
        chip.className = 'chip' + (removed ? ' removed' : '');
        if (removed) {
          chip.textContent = d[0];
          chip.title = 'click to restore';
          chip.addEventListener('click', function () { ex.delete(d[0]); refreshChips(); scheduleRender(); });
        } else {
          chip.innerHTML = escapeHtml(d[0]) + ' <span class="cnt">' + d[1] + '</span><button title="remove">✕</button>';
          chip.querySelector('button').addEventListener('click', function () { ex.add(d[0]); refreshChips(); scheduleRender(); });
        }
        listEl.appendChild(chip);
      });
      wrap.appendChild(listEl);

      // add a synthetic category (label + count); cleared on new file/column
      var addRow = document.createElement('div');
      addRow.className = 'row';
      addRow.style.marginTop = '6px';
      addRow.innerHTML = '<input type="text" placeholder="add category" style="flex:1;min-width:0">' +
        '<input type="number" min="1" value="1" class="fixed" style="width:64px">' +
        '<button type="button" class="fixed" title="add this category to the plot">+ add</button>';
      var addLabel = addRow.querySelector('input[type=text]');
      var addCount = addRow.querySelector('input[type=number]');
      function doAdd() {
        var labelTxt = addLabel.value.trim();
        var n = Math.round(parseFloat(addCount.value));
        if (!labelTxt || isNaN(n) || n < 1) return;
        if (!state.synth[ci]) state.synth[ci] = [];
        state.synth[ci].push([labelTxt, n]);
        ex.delete(labelTxt);
        refreshChips(); scheduleRender();
      }
      addRow.querySelector('button').addEventListener('click', doAdd);
      addLabel.addEventListener('keydown', function (e) { if (e.key === 'Enter') doAdd(); });
      wrap.appendChild(addRow);
      return wrap;
    }

    function refreshChips() {
      var box = $('dm-chips');
      box.innerHTML = '';
      if (!state.rows.length) return;
      if (state.mode === 'single') {
        box.appendChild(chipGroup(state.headers[state.col] || '', state.col));
      } else {
        if (state.countryCol >= 0) box.appendChild(chipGroup('Countries (' + (state.headers[state.countryCol] || '') + ')', state.countryCol));
        if (state.cityCol >= 0) box.appendChild(chipGroup('Cities (' + (state.headers[state.cityCol] || '') + ')', state.cityCol));
      }
      var n = state.mode === 'single'
        ? countWithSynth(includedRows(), state.col, excludedFor(state.col)).length
        : countWithSynth(includedRows(), state.countryCol, excludedFor(state.countryCol)).length;
      $('dm-cathint').textContent = n ? n + ' categories' : '';
    }

    /* ---------- drawing ---------- */

    function drawTiles(ctx, tiles, opts) {
      var pad = Math.max(4, 0.004 * opts.canvasW);
      tiles.forEach(function (t, i) {
        ctx.fillStyle = opts.colors[i];
        ctx.fillRect(t.x, t.y, t.w, t.h);
        if (opts.borderW > 0) {
          ctx.strokeStyle = opts.borderC;
          ctx.lineWidth = opts.borderW;
          ctx.strokeRect(t.x + opts.borderW / 2, t.y + opts.borderW / 2, t.w - opts.borderW, t.h - opts.borderW);
        }
        var txtColor = textColorFor(opts.colors[i]);
        var maxW = t.w - 2 * pad, maxH = t.h - 2 * pad;
        if (maxW < 8 || maxH < 8) return;

        // centered bold name, shrink to fit, hide below min size
        var fitted = fitText(ctx, t.key, maxW, maxH * 0.82, opts.nameBase, opts.nameMin, '700', opts.font);
        if (fitted) {
          ctx.fillStyle = txtColor;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.font = '700 ' + fitted.size + 'px ' + opts.font;
          var lh = fitted.size * 1.12;
          var startY = t.y + t.h / 2 - lh * (fitted.lines.length - 1) / 2;
          fitted.lines.forEach(function (ln, li) {
            ctx.fillText(ln, t.x + t.w / 2, startY + li * lh);
          });
        }

        // "n (x.x%)" bottom-right, plain weight
        if (opts.showCounts) {
          var pct = 100 * t.value / opts.pctDenom;
          var label = t.value + ' (' + fmtR(pct) + '%)';
          var cSize = Math.round(opts.countBase);
          ctx.font = '400 ' + cSize + 'px ' + opts.font;
          if (cSize >= opts.countMin && ctx.measureText(label).width <= maxW && cSize * 1.2 <= maxH) {
            ctx.fillStyle = txtColor;
            ctx.textAlign = 'right';
            ctx.textBaseline = 'alphabetic';
            ctx.fillText(label, t.x + t.w - pad, t.y + t.h - pad);
          }
        }
      });
    }

    function fitText(ctx, text, maxW, maxH, baseSize, minSize, weight, font) {
      var tokens = splitLabelTokens(text);
      if (!tokens.length) return null;
      var size = baseSize;
      while (size >= minSize) {
        ctx.font = weight + ' ' + Math.round(size) + 'px ' + font;
        var lines = [], cur = '', ok = true;
        for (var i = 0; i < tokens.length; i++) {
          var candidate = cur ? cur + (cur.slice(-1) === '/' ? '' : ' ') + tokens[i] : tokens[i];
          if (ctx.measureText(candidate).width <= maxW) { cur = candidate; continue; }
          if (!cur) { ok = false; break; }          // single token too wide at this size
          lines.push(cur);
          cur = tokens[i];
          if (ctx.measureText(cur).width > maxW) { ok = false; break; }
        }
        if (ok) {
          lines.push(cur);
          if (lines.length * size * 1.12 <= maxH) return { size: Math.round(size), lines: lines };
        }
        size -= Math.max(1, size * 0.08);
      }
      return null;
    }

    function hexToRgba(hex, alpha) {
      var r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16), b = parseInt(hex.slice(5, 7), 16);
      return 'rgba(' + r + ',' + g + ',' + b + ',' + alpha + ')';
    }

    function scheduleRender(immediate) {
      clearTimeout(renderTimer);
      renderTimer = setTimeout(render, immediate ? 0 : 200);
    }

    function fontStack(name) {
      if (name === 'Georgia') return 'Georgia, "Times New Roman", serif';
      if (name === 'Arial') return 'Arial, Helvetica, sans-serif';
      return '"' + name + '", "Segoe UI", Arial, sans-serif';
    }

    function render() {
      if (!state.rows.length) return;
      if (filterGateActive()) {
        canvas.style.display = 'none';
        var em = $('dm-empty');
        em.textContent = 'tick your cluster(s) above to continue';
        em.style.display = '';
        statusEl.textContent = '';
        return;
      }
      var d = state.dims.split('x');
      var W = parseInt(d[0], 10), H = parseInt(d[1], 10);
      canvas.style.display = '';
      $('dm-empty').style.display = 'none';
      canvas.width = W; canvas.height = H;
      var ctx = canvas.getContext('2d');
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, W, H);

      var font = fontStack(state.bodyFont);
      var headerFont = fontStack(state.headerFont);
      var nameBase = 0.034 * H * state.labelScale;
      var nameMin = Math.max(7, 0.008 * H);
      var countBase = 0.034 * H * 0.6 * state.countScale;
      var countMin = Math.max(6, 0.006 * H);
      var common = {
        canvasW: W, font: font, headerFont: headerFont,
        borderW: state.borderW, borderC: state.borderC,
        showCounts: state.showCounts, nameBase: nameBase, nameMin: nameMin,
        countBase: countBase, countMin: countMin
      };

      if (state.mode === 'single') renderSingle(ctx, W, H, common);
      else renderDuo(ctx, W, H, common);
    }

    function renderSingle(ctx, W, H, common) {
      var items = countWithSynth(includedRows(), state.col, excludedFor(state.col));
      if (!items.length) { statusEl.textContent = 'No values in that column.'; return; }
      var total = items.reduce(function (s, dd) { return s + dd[1]; }, 0);

      var y0 = 0;
      if (state.showTitle) {
        var band = 0.11 * H;
        var text = state.titleText || autoTitle();
        ctx.fillStyle = state.titleColor;
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.font = '700 ' + Math.round(band * 0.52 * state.headLabScale) + 'px ' + common.headerFont;
        ctx.fillText(text, W / 2, band * 0.52);
        y0 = band;
      }

      var tiles = squarify(items, 0, y0, W, H - y0);
      var colors = assignColors(tiles.length, paletteStops(), state.colorOrder, state.seed);
      drawTiles(ctx, tiles, Object.assign({ colors: colors, pctDenom: total }, common));
      statusEl.textContent = total + ' counted · ' + items.length + ' categories · ' + W + '×' + canvas.height;
    }

    function autoTitle() {
      return state.headers[state.col] || '';
    }

    // duo header: the leading "NN%" and the label can be sized separately;
    // both share the header font and the LEAD blue (state.titleColor)
    function drawDuoHeader(ctx, text, cx, band, headerFont) {
      var pctSize = Math.max(6, Math.round(band * 0.46 * state.headPctScale));
      var labSize = Math.max(6, Math.round(band * 0.46 * state.headLabScale));
      var m = /^(\d+(?:\.\d+)?\s*%)\s+(.+)$/.exec(String(text).trim());
      ctx.fillStyle = state.titleColor;
      ctx.textBaseline = 'alphabetic';
      var baseY = band * 0.66;
      if (m) {
        ctx.font = '700 ' + pctSize + 'px ' + headerFont;
        var wp = ctx.measureText(m[1]).width;
        ctx.font = '700 ' + labSize + 'px ' + headerFont;
        var sp = ctx.measureText(' ').width;
        var wl = ctx.measureText(m[2]).width;
        var x0 = cx - (wp + sp + wl) / 2;
        ctx.textAlign = 'left';
        ctx.font = '700 ' + pctSize + 'px ' + headerFont;
        ctx.fillText(m[1], x0, baseY);
        ctx.font = '700 ' + labSize + 'px ' + headerFont;
        ctx.fillText(m[2], x0 + wp + sp, baseY);
      } else {
        ctx.textAlign = 'center';
        ctx.font = '700 ' + labSize + 'px ' + headerFont;
        ctx.fillText(String(text), cx, baseY);
      }
    }

    function renderDuo(ctx, W, H, common) {
      if (state.countryCol < 0 || state.cityCol < 0) {
        statusEl.textContent = 'Pick the country and city columns.'; return;
      }
      var rowsIn = includedRows();
      var exC = excludedFor(state.countryCol);
      var countryCounts = countWithSynth(rowsIn, state.countryCol, exC);
      var grand = countryCounts.reduce(function (s, dd) { return s + dd[1]; }, 0);
      var domEntry = countryCounts.filter(function (dd) { return dd[0] === state.domesticValue; })[0];
      var domTotal = domEntry ? domEntry[1] : 0;
      var intlItems = countryCounts.filter(function (dd) { return dd[0] !== state.domesticValue; });
      var intlTotal = grand - domTotal;
      if (!grand) { statusEl.textContent = 'No countries counted.'; return; }

      // domestic cities
      var domRows = rowsIn.filter(function (r) {
        return String(r[state.countryCol] === undefined ? '' : r[state.countryCol]).trim() === state.domesticValue;
      });
      var cityItems = countWithSynth(domRows, state.cityCol, excludedFor(state.cityCol));
      var citySum = cityItems.reduce(function (s, dd) { return s + dd[1]; }, 0);

      var domShare = domTotal / grand;
      var domPct = Math.round(domShare * 100);
      var intlPct = Math.round(100 - domShare * 100);

      // header band
      var y0 = 0;
      var gap = Math.round(0.012 * W);
      var leftW = Math.round((W - gap) * domShare);
      var rightW = W - gap - leftW;
      if (state.showHeaders) {
        var band = 0.11 * H;
        var hl = state.headLDirty ? state.headL : (domPct + '% Domestic Students');
        var hr = state.headRDirty ? state.headR : (intlPct + '% International Students');
        if (!state.headLDirty) $('dm-headl').value = hl;
        if (!state.headRDirty) $('dm-headr').value = hr;
        drawDuoHeader(ctx, hl, leftW / 2, band, common.headerFont);
        drawDuoHeader(ctx, hr, leftW + gap + rightW / 2, band, common.headerFont);
        y0 = band;
      }
      var panelH = H - y0;

      // left: domestic cities (% within domestic, like the R city treemap)
      var leftTiles = squarify(cityItems, 0, y0, leftW, panelH);
      var leftColors = assignColors(leftTiles.length, paletteStops(), state.colorOrder, state.seed);
      drawTiles(ctx, leftTiles, Object.assign({ colors: leftColors, pctDenom: citySum || 1 }, common));

      // right: international countries (% of grand total, like the R country treemap)
      var rightTiles = squarify(intlItems, leftW + gap, y0, rightW, panelH);
      var rightColors = assignColors(rightTiles.length, paletteStops(), state.colorOrder, state.seed + 101);
      drawTiles(ctx, rightTiles, Object.assign({ colors: rightColors, pctDenom: grand }, common));

      // the PowerPoint-style veil over the domestic panel; at 100% it is a
      // solid fill drawn AFTER the tiles, so nothing shows through
      if (state.showVeil) {
        ctx.fillStyle = state.veilAlpha >= 1 ? state.veilColor : hexToRgba(state.veilColor, state.veilAlpha);
        ctx.fillRect(0, y0, leftW, panelH);
        ctx.fillStyle = '#FFFFFF';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.font = '700 ' + Math.round(0.034 * leftW) + 'px ' + common.headerFont;
        ctx.fillText(state.veilLabel, leftW / 2, y0 + panelH / 2);
      }
      if (state.showTotals) {
        var pad = Math.max(6, 0.005 * W);
        ctx.fillStyle = state.showVeil ? '#FFFFFF' : '#0B2A5B';
        ctx.textAlign = 'right'; ctx.textBaseline = 'alphabetic';
        ctx.font = '400 ' + Math.round(common.countBase) + 'px ' + common.font;
        ctx.fillText(domTotal + ' (' + fmtR(100 * domShare) + '%)', leftW - pad, y0 + panelH - pad);
      }

      statusEl.textContent = 'Domestic ' + domTotal + ' (' + cityItems.length + ' cities) · International ' +
        intlTotal + ' (' + intlItems.length + ' countries) · ' + W + '×' + H;
    }

    /* ---------- download ---------- */

    function download() {
      var base = state.mode === 'duo' ? 'domestic-international'
        : (state.titleText || autoTitle() || 'treemap');
      var fname = 'LEADTK_PGN-TPL_' + String(base).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') +
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

    /* ---------- mode UI sync ---------- */

    function syncModeUI() {
      var duo = state.mode === 'duo';
      $('dm-singleopts').style.display = duo ? 'none' : '';
      $('dm-duoopts').style.display = duo ? '' : 'none';
      $('dm-duostyle').style.display = duo ? '' : 'none';
      $('dm-titleopts').style.display = duo ? 'none' : '';
      var note = '';
      if (duo && (state.countryCol < 0 || state.cityCol < 0)) {
        note = '⚠ Could not auto-find country/city columns; pick them above.';
      }
      $('dm-datanote').textContent = note;
      if (!state.titleDirty) $('dm-titletext').value = autoTitle();
      refreshChips();
    }

    /* ---------- events ---------- */

    var drop = $('dm-drop'), fileInput = $('dm-file');
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
    $('dm-sample').addEventListener('click', function () {
      $('dm-sheetrow').style.display = 'none';
      loadRows(parseCSVText(SAMPLE_ROSTER), 'demo data');
      state.mode = 'duo'; $('dm-mode').value = 'duo'; syncModeUI(); scheduleRender(true);
    });
    $('dm-sheet').addEventListener('change', function (e) { useSheet(+e.target.value); });

    $('dm-filtercol').addEventListener('change', function (e) {
      state.filterCol = +e.target.value; state.includeValues = null;
      buildFilterValues(); refreshChips(); scheduleRender();
    });

    $('dm-mode').addEventListener('change', function (e) { state.mode = e.target.value; syncModeUI(); scheduleRender(); });
    $('dm-col').addEventListener('change', function (e) {
      state.col = +e.target.value; state.titleDirty = false; state.synth = {}; syncModeUI(); scheduleRender();
    });
    $('dm-country').addEventListener('change', function (e) {
      state.countryCol = +e.target.value; populateDomesticSelect(); state.headLDirty = state.headRDirty = false;
      state.synth = {};
      refreshChips(); scheduleRender();
    });
    $('dm-city').addEventListener('change', function (e) { state.cityCol = +e.target.value; state.synth = {}; refreshChips(); scheduleRender(); });
    $('dm-domestic').addEventListener('change', function (e) {
      state.domesticValue = e.target.value; state.headLDirty = state.headRDirty = false; scheduleRender();
    });

    $('dm-cdark').addEventListener('input', function (e) { state.customDark = e.target.value; state.palette = 'custom'; buildPaletteRow(); scheduleRender(); });
    $('dm-clight').addEventListener('input', function (e) { state.customLight = e.target.value; state.palette = 'custom'; buildPaletteRow(); scheduleRender(); });
    $('dm-order').addEventListener('change', function (e) { state.colorOrder = e.target.value; scheduleRender(); });
    $('dm-lab').addEventListener('input', function (e) {
      state.labelScale = parseFloat(e.target.value);
      $('dm-lab-o').textContent = state.labelScale.toFixed(2).replace(/0$/, '') + '×';
      scheduleRender();
    });
    $('dm-hfont').addEventListener('change', function (e) { state.headerFont = e.target.value; scheduleRender(); });
    $('dm-bfont').addEventListener('change', function (e) { state.bodyFont = e.target.value; scheduleRender(); });
    $('dm-hpct').addEventListener('input', function (e) {
      state.headPctScale = parseFloat(e.target.value);
      $('dm-hpct-o').textContent = state.headPctScale.toFixed(2).replace(/0$/, '') + '×';
      scheduleRender();
    });
    $('dm-hlab').addEventListener('input', function (e) {
      state.headLabScale = parseFloat(e.target.value);
      $('dm-hlab-o').textContent = state.headLabScale.toFixed(2).replace(/0$/, '') + '×';
      scheduleRender();
    });
    $('dm-cnt').addEventListener('input', function (e) {
      state.countScale = parseFloat(e.target.value);
      $('dm-cnt-o').textContent = state.countScale.toFixed(2).replace(/0$/, '') + '×';
      scheduleRender();
    });
    $('dm-counts').addEventListener('change', function (e) { state.showCounts = e.target.checked; scheduleRender(); });
    $('dm-bw').addEventListener('change', function (e) { state.borderW = Math.max(0, +e.target.value || 0); scheduleRender(); });
    $('dm-bc').addEventListener('input', function (e) { state.borderC = e.target.value; scheduleRender(); });

    $('dm-title').addEventListener('change', function (e) { state.showTitle = e.target.checked; scheduleRender(); });
    $('dm-titletext').addEventListener('input', function (e) { state.titleText = e.target.value; state.titleDirty = true; scheduleRender(); });
    $('dm-titlecolor').addEventListener('input', function (e) { state.titleColor = e.target.value; scheduleRender(); });

    $('dm-headers').addEventListener('change', function (e) { state.showHeaders = e.target.checked; scheduleRender(); });
    $('dm-headl').addEventListener('input', function (e) { state.headL = e.target.value; state.headLDirty = true; scheduleRender(); });
    $('dm-headr').addEventListener('input', function (e) { state.headR = e.target.value; state.headRDirty = true; scheduleRender(); });
    $('dm-headreset').addEventListener('click', function () { state.headLDirty = state.headRDirty = false; scheduleRender(); });
    $('dm-veil').addEventListener('change', function (e) { state.showVeil = e.target.checked; scheduleRender(); });
    $('dm-veiltext').addEventListener('input', function (e) { state.veilLabel = e.target.value; scheduleRender(); });
    $('dm-veilcolor').addEventListener('input', function (e) { state.veilColor = e.target.value; scheduleRender(); });
    $('dm-veilo').addEventListener('input', function (e) {
      state.veilAlpha = (+e.target.value) / 100;
      $('dm-veilo-o').textContent = e.target.value + '%';
      scheduleRender();
    });
    $('dm-totals').addEventListener('change', function (e) { state.showTotals = e.target.checked; scheduleRender(); });
    $('dm-dims').addEventListener('change', function (e) { state.dims = e.target.value; scheduleRender(); });

    $('dm-shuffle').addEventListener('click', function () {
      state.seed = Math.floor(NATIVE_RANDOM() * 2147483647);
      scheduleRender(true);
    });
    $('dm-download').addEventListener('click', download);
    $('dm-ppt').addEventListener('click', function () {
      window.LeadToolkit.downloadCanvasPptx(canvas, 'LEADTK_PGN-TPL_' + new Date().toISOString().slice(0, 10) + '.pptx');
    });

    buildPaletteRow();
  }

  /* ======================================================================
     REGISTER / EXPORT
     ====================================================================== */

  if (typeof window !== 'undefined' && window.LeadToolkit) {
    window.LeadToolkit.registerApp({
      id: 'demographics',
      icon: '📊🌳',
      group: 'Class 1 - Heart of Leadership',
      name: 'Plot Generator | Tree Plots',
      code: 'PGN-TPL',
      intro: { upload: 'main roster, CSV or Excel', to: 'generate descriptive statistics of the class (College Majors, Job Roles, Domestic vs International)' },
      tags: ['treemap', 'majors', 'job roles', 'domestic', 'international', 'roster', 'demographics'],
      description: 'Upload the student info Excel/CSV and generate the Blues treemaps | College Majors, Job Roles, Domestic vs International | in the R script style.',
      mount: mount
    });
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
      BREWER_BLUES_9: BREWER_BLUES_9,
      DEMO_PALETTES: DEMO_PALETTES,
      colorRamp: colorRamp,
      textColorFor: textColorFor,
      fmtR: fmtR,
      mulberry32: mulberry32,
      seededShuffle: seededShuffle,
      assignColors: assignColors,
      countColumn: countColumn,
      squarify: squarify,
      splitLabelTokens: splitLabelTokens,
      SAMPLE_ROSTER: SAMPLE_ROSTER
    };
  }
})();
