/* ==========================================================================
   App 4 | Companies (employer logo collage)
   1) Load the student CSV/Excel → employer column (+ cluster filter) →
      deduped company list.
   2) "Find logos online" auto-fills silently from true logo sources
      (Wikidata logo property → Clearbit by real domain → favicon), loading
      a few clickable alternates per company. Failures show NOTHING | no
      error prose. For any company still empty the flow is exactly:
      🌐 (opens Google Images) → copy an image → press ⌘V. Dropping an
      image file onto a card also works.
      All APIs are JSONP + <img> tags (fetch() dies on file:// pages), and
      every image is taint-tested so exports always work. Only company
      names are ever sent | student data never leaves the browser.
   3) Collage with center text ("70 Employers") → PNG or editable PPTX.
   ========================================================================== */

(function () {
  'use strict';

  /* ======================================================================
     PURE LOGIC (exported for node tests)
     ====================================================================== */

  function mulberry32(a) {
    return function () {
      a |= 0; a = a + 0x6D2B79F5 | 0;
      var t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }

  /* Rectangle collage layout with a densifying growth pass.
     items: [{aspect, mult}] → [{x, y, w, h}] aligned with input order.
     1) seeded rejection placement at a conservative starting size;
     2) repeated smallest-first growth: every rect inflates about its center
        until it hits a neighbour, the border, or the keep-out ellipse.
     The growth pass removes whitespace AND rescues rects that had to
     shrink to find a spot (fixes "some logos are way too small"). */
  function layoutRects(items, W, H, opts) {
    opts = opts || {};
    var n = items.length;
    if (!n) return [];
    var margin = opts.margin !== undefined ? opts.margin : Math.round(0.008 * W);
    var gap = opts.gap !== undefined ? opts.gap : Math.max(3, Math.round(0.0035 * W));
    var fill = opts.fill || 0.5;
    var ko = opts.keepout || null;
    var rnd = mulberry32(opts.seed || 1);

    var usableW = W - 2 * margin, usableH = H - 2 * margin;
    var area = usableW * usableH * fill;
    if (ko) area -= Math.min(Math.PI * ko.rx * ko.ry, usableW * usableH * 0.5) * fill;
    var sumSq = items.reduce(function (s, it) { return s + it.mult * it.mult; }, 0);
    var unit = Math.sqrt(area / sumSq) * 0.9;   // start small; growth densifies

    var rects = new Array(n);
    var targets = new Array(n);

    function overlapsAny(x, y, w, h, skip) {
      for (var i = 0; i < n; i++) {
        var p = rects[i];
        if (!p || i === skip) continue;
        if (x < p.x + p.w + gap && p.x < x + w + gap && y < p.y + p.h + gap && p.y < y + h + gap) return true;
      }
      return false;
    }
    function inKeepout(x, y, w, h) {
      if (!ko) return false;
      var cx = x + w / 2, cy = y + h / 2, cr = Math.sqrt(w * w + h * h) / 2;
      var ndx = (cx - ko.cx) / (ko.rx + cr), ndy = (cy - ko.cy) / (ko.ry + cr);
      return ndx * ndx + ndy * ndy < 1;
    }

    var order = items.map(function (it, i) { return i; })
      .sort(function (a, b) { return items[b].mult - items[a].mult; });

    order.forEach(function (idx) {
      // exact logo aspect (within sanity bounds) → no dead air inside slots
      var a = Math.min(8, Math.max(0.2, items[idx].aspect || 2));
      var s = unit * items[idx].mult;
      var w = s * Math.sqrt(a), h = s / Math.sqrt(a);
      targets[idx] = { w: w, h: h };
      var tries = 0, x, y;
      while (true) {
        tries++;
        if (tries % 400 === 0) { w *= 0.93; h *= 0.93; }
        if (tries > 12000) break;
        x = margin + rnd() * Math.max(1, usableW - w);
        y = margin + rnd() * Math.max(1, usableH - h);
        if (inKeepout(x, y, w, h)) continue;
        if (!overlapsAny(x, y, w, h, idx)) break;
      }
      rects[idx] = { x: x, y: y, w: w, h: h };
    });

    // growth pass: smallest first, so shrunken logos recover before the
    // big ones hog the remaining space; capped so nothing balloons
    var rounds = opts.growRounds !== undefined ? opts.growRounds : 30;
    for (var r = 0; r < rounds; r++) {
      var grew = false;
      var byArea = rects.map(function (t, i) { return i; })
        .sort(function (a2, b2) { return rects[a2].w * rects[a2].h - rects[b2].w * rects[b2].h; });
      byArea.forEach(function (idx) {
        var t = rects[idx];
        if (t.w >= targets[idx].w * 2.4) return;
        var k = r < 18 ? 1.05 : 1.015;   // coarse growth, then fine packing
        var nw = t.w * k, nh = t.h * k;
        var nx = t.x - (nw - t.w) / 2, ny = t.y - (nh - t.h) / 2;
        if (nx < margin) nx = margin;
        if (ny < margin) ny = margin;
        if (nx + nw > W - margin) nx = W - margin - nw;
        if (ny + nh > H - margin) ny = H - margin - nh;
        if (nw > usableW || nh > usableH) return;
        if (inKeepout(nx, ny, nw, nh)) return;
        if (overlapsAny(nx, ny, nw, nh, idx)) return;
        t.x = nx; t.y = ny; t.w = nw; t.h = nh;
        grew = true;
      });
      if (!grew) break;
    }
    return rects;
  }

  function dedupeCompanies(values) {
    var map = new Map();
    values.forEach(function (v) {
      var t = String(v === null || v === undefined ? '' : v).trim().replace(/\s+/g, ' ');
      if (!t || t === 'NA' || t === 'N/A') return;
      var k = t.toLowerCase();
      if (map.has(k)) map.get(k).count++;
      else map.set(k, { name: t, count: 1 });
    });
    var out = [];
    map.forEach(function (d) { out.push(d); });
    out.sort(function (a, b) { return b.count - a.count || a.name.localeCompare(b.name); });
    return out;
  }

  function strippedQuery(q) {
    return q.replace(/[,.]?\s*(inc|llc|llp|ltd|corp|corporation|co|group|plc)\.?$/i, '')
      .replace(/\s+/g, ' ').trim();
  }

  function claimValue(ent, prop) {
    try {
      var cl = ent.claims && ent.claims[prop];
      if (!cl || !cl.length) return null;
      var dv = cl[0].mainsnak && cl[0].mainsnak.datavalue;
      return dv ? dv.value : null;
    } catch (e) { return null; }
  }

  function domainFrom(website, name) {
    if (website) {
      var m = /^https?:\/\/([^\/]+)/i.exec(String(website).trim());
      if (m) return m[1].replace(/^www\./i, '');
    }
    if (!name) return null;
    var guess = String(name).toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]/g, '');
    return guess ? guess + '.com' : null;
  }

  // employer-ish description vs. definitely-not-an-employer
  var COMPANYISH = /compan|corporat|firm|business|enterprise|conglomerate|bank|consult|brand|retail|manufactur|invest|holding|agenc|provider|airline|insur|pharma|health|tech|software|services|organi[sz]ation|non-?profit|university|hospital|government|military|army|law/i;
  var NOT_COMPANYISH = /album|song|single|\bfilm\b|movie|episode|series|band\b|book|novel|painting|video game|building|skyscraper|headquarters|tower|station|vaccine|village|town|city|river|mountain|species|surname|given name/i;

  function scoreEntity(info) {
    var s = 0;
    if (info.logoFile) s += 2;
    if (info.website) s += 1;
    if (COMPANYISH.test(info.desc || '')) s += 3;
    if (NOT_COMPANYISH.test(info.desc || '')) s -= 4;
    return s;
  }

  /* CRITICAL CORS NOTE: commons.wikimedia.org/wiki/Special:FilePath/… is a
     REDIRECT, and the redirect response carries no CORS headers | so any
     crossOrigin image load through it fails silently. Only DIRECT
     upload.wikimedia.org URLs (obtained via the imageinfo API) are safe
     for canvas use. Never reintroduce Special:FilePath. */

  // swap the size inside a direct thumb URL (…/320px-Foo.svg.png → 640px-)
  function thumbUp(thumbUrl, px) {
    if (!/\/\d+px-/.test(thumbUrl)) return null;
    return thumbUrl.replace(/\/\d+px-/, '/' + px + 'px-');
  }

  // normalize a Commons file title for map lookups
  function normFile(s) {
    return String(s).replace(/^File:/i, '').replace(/_/g, ' ').trim().toLowerCase();
  }

  /* Clearbit + favicon candidates from the entities' domains (the Commons
     candidates are resolved separately through the imageinfo API). */
  function candidateUrls(infos, name) {
    var list = [], seen = {};
    function add(url, source, pri) {
      if (url && !seen[url]) { seen[url] = 1; list.push({ url: url, source: source, pri: pri }); }
    }
    var domains = [];
    infos.forEach(function (info) {
      var d = domainFrom(info.website, null);
      if (d) domains.push(d);
    });
    var guess = domainFrom(null, name);
    if (guess) domains.push(guess);
    domains = domains.filter(function (d, i) { return domains.indexOf(d) === i; }).slice(0, 3);
    domains.forEach(function (d, k) { add('https://logo.clearbit.com/' + d + '?size=400', 'Clearbit · ' + d, 10 + k); });
    if (domains.length) add('https://www.google.com/s2/favicons?domain=' + domains[0] + '&sz=128', 'favicon · ' + domains[0], 90);
    list.sort(function (a, b) { return a.pri - b.pri; });
    return list;
  }

  /* ======================================================================
     UI
     ====================================================================== */

  function mount(container) {
    var NATIVE_RANDOM = Math.random;
    var uid = 0;

    var state = {
      headers: [], rows: [], fileName: null, _sheets: null,
      companyCol: -1, filterCol: -1, includeValues: null,
      companies: [],   // {id,name,count,status,desc,img,bytes,url,candidates,website,mult,jit,include}
      selectedId: null,
      seed: 20260821, fill: 0.5,
      holePct: 0.34,
      showText: true, text: '', textDirty: false,
      textPx: 64, textColor: '#2E74B5', textFont: 'Corbel',
      bg: '#FFFFFF', dims: '2560x1440',
      searching: false
    };

    container.innerHTML = '' +
      '<div class="app-title"><h2>🖼️🏢 Collage Generator | Industry Searcher</h2>' +
      '<span class="sub">Employer column in → logo collage out. Auto-fills logos from the web (company names only, never student data).</span></div>' +
      '<div class="app-layout">' +
      '  <div class="sidebar">' +

      '    <details class="step" open id="co-step1">' +
      '      <summary><span class="n">1</span> Load data <span class="hint" id="co-fhint"></span></summary>' +
      '      <div class="body">' +
      '        <div class="dropzone" id="co-drop"><strong>DROP DATA HERE</strong><ul class="drop-spec"><li><b>Type of file:</b> CSV or Excel (.xlsx)</li><li><b>What you\'re looking for:</b> the main roster with an employer / company column</li></ul></div>' +
      '        <input type="file" id="co-file" accept=".csv,.tsv,.txt,.xlsx,.xlsm,.xltx" style="display:none">' +
      '        <div id="co-fileinfo"></div>' +
      '        <label class="field" id="co-sheetrow" style="display:none">Sheet<select id="co-sheet"></select></label>' +
            '        <div class="clusterblock" id="co-clusterblock" style="display:none">' +
      '          <div class="clusterlabel">Select cluster(s)</div>' +
      '          <label class="field">Cluster column<select id="co-filtercol"></select></label>' +
      '          <div id="co-filtervals"></div>' +
      '        </div>' +
      '        <div class="row"><button id="co-sample" class="fixed">🎲 Demo data</button></div>' +
      '      </div>' +
      '    </details>' +

      '    <details class="step disabled" open id="co-step2">' +
      '      <summary><span class="n">2</span> Column</summary>' +
      '      <div class="body">' +
      '        <label class="field">Company / employer column<select id="co-col"></select></label>' +
      '      </div>' +
      '    </details>' +

      '    <details class="step disabled" open>' +
      '      <summary><span class="n">3</span> Companies & logos <span class="hint" id="co-nhint"></span></summary>' +
      '      <div class="body">' +
      '        <div class="row">' +
      '          <button id="co-search" class="primary fixed">🔎 Find logos online</button>' +
      '          <span class="small-note" id="co-progress"></span>' +
      '          <label class="check fixed" style="margin-left:auto"><input type="checkbox" id="co-missing"> Missing only</label>' +
      '        </div>' +
      '        <div class="small-note">This is an automatic logo searcher. <b>WARNING: it CAN and WILL go wrong, especially for less famous companies. It requires your close supervision!</b>' +
      '          <ul class="drop-spec" style="margin:6px 0 0 0;padding-left:18px">' +
      '            <li><b>Step 1:</b> Click <b>Find logos online</b> and let it fill automatically (searches Wikidata and Wikipedia Commons).</li>' +
      '            <li><b>Step 2:</b> Wrong or ugly logo? Click the logo card; alternates appear, click one to swap (same sources).</li>' +
      '            <li><b>Step 3:</b> Still nothing? Click the 🌐 button on the card to open a Google image search in a new tab, copy an image there, come back, and press <b>Cmd or Ctrl V</b> to paste it into the selected card.</li>' +
      '          </ul>' +
      '        </div>' +
      '        <div id="co-cards" style="display:flex;flex-direction:column;gap:8px;max-height:520px;overflow:auto"></div>' +
      '      </div>' +
      '    </details>' +

      '    <details class="step disabled" open id="co-step3">' +
      '      <summary><span class="n">4</span> Style</summary>' +
      '      <div class="body">' +
      '        <div class="slider-field"><div class="top">Middle space size <output id="co-hole-o">34%</output></div>' +
      '          <input type="range" id="co-hole" min="0" max="80" step="2" value="34"></div>' +
      '        <label class="check"><input type="checkbox" id="co-showtext" checked> Center text</label>' +
      '        <div class="row">' +
      '          <input type="text" id="co-text" placeholder="70 Employers">' +
      '          <input type="color" id="co-tcolor" value="#2E74B5" class="fixed" style="width:42px">' +
      '        </div>' +
      '        <label class="field">Text font' +
      '          <select id="co-tfont">' +
      '            <option value="Corbel" selected>Corbel</option>' +
      '            <option value="Candara">Candara</option>' +
      '            <option value="Arial">Arial</option>' +
      '            <option value="Georgia">Georgia</option>' +
      '          </select></label>' +
      '        <div class="slider-field"><div class="top">Text size <output id="co-tsize-o">64</output></div>' +
      '          <input type="range" id="co-tsize" min="24" max="160" step="2" value="64"></div>' +
      '        <div class="slider-field"><div class="top">Logo size (density) <output id="co-fill-o">50%</output></div>' +
      '          <input type="range" id="co-fill" min="20" max="65" step="1" value="50"></div>' +
      '        <div class="row">' +
      '          <label class="field">Background<input type="color" id="co-bg" value="#FFFFFF"></label>' +
      '          <label class="field">Image size' +
      '            <select id="co-dims">' +
      '              <option value="2560x1440">2560 × 1440 (default)</option>' +
      '              <option value="2054x1164">2054 × 1164 (slide graphic)</option>' +
      '              <option value="1920x1080">1920 × 1080</option>' +
      '              <option value="3200x1800">3200 × 1800</option>' +
      '            </select></label>' +
      '        </div>' +
      '      </div>' +
      '    </details>' +
      '  </div>' +

      '  <div class="preview-panel">' +
      '    <div class="preview-toolbar">' +
      '      <button id="co-shuffle">⟳ Shuffle layout</button>' +
      '      <button id="co-png" class="primary" disabled>⬇ PNG</button>' +
      '      <button id="co-pptx" class="primary" disabled>⬇ PowerPoint</button>' +
      '      <span class="status" id="co-status"></span>' +
      '    </div>' +
      '    <div class="canvas-holder" id="co-holder">' +
      '      <div class="empty-msg" id="co-empty">output displayed HERE</div>' +
      '      <canvas id="co-canvas" style="display:none"></canvas>' +
      '      <div class="veil">Rendering…</div>' +
      '    </div>' +
      '  </div>' +
      '</div>';

    var $ = function (id) { return container.querySelector('#' + id); };
    var canvas = $('co-canvas'), statusEl = $('co-status');
    var renderTimer = null;

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
            $('co-sheet').innerHTML = sheets.map(function (s, i) {
              return '<option value="' + i + '">' + escapeHtml(s.name) + '</option>';
            }).join('');
            $('co-sheetrow').style.display = sheets.length > 1 ? '' : 'none';
            useSheet(0);
          });
        }
        $('co-sheetrow').style.display = 'none';
        var text = new TextDecoder(sniffEncoding(buf)).decode(buf);
        loadRows(parseCSVText(text), file.name);
      }).catch(function (err) {
        $('co-fileinfo').innerHTML = '<span class="file-warn">Could not read file: ' + (err.message || err) + '</span>';
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
        $('co-fileinfo').innerHTML = '<span class="file-warn">That file has no data rows.</span>';
        return;
      }
      state.headers = dedupeHeaders(raw[0]);
      state.rows = raw.slice(1);
      state.filterCol = -1; state.includeValues = null;
      state.textDirty = false;

      $('co-fileinfo').innerHTML = '<span class="file-info">✓ ' + escapeHtml(name) + ' · ' +
        state.rows.length + ' rows × ' + state.headers.length + ' columns</span>';
      $('co-fhint').textContent = name;

      var ci = state.headers.findIndex(function (h) { return /employer|company|organization|organisation|firm/i.test(h); });
      state.companyCol = ci === -1 ? 0 : ci;
      var fi = state.headers.findIndex(function (h) { return /cluster/i.test(h); });
      state.filterCol = fi;

      var opts = state.headers.map(function (h, i2) { return '<option value="' + i2 + '">' + escapeHtml(h) + '</option>'; }).join('');
      $('co-col').innerHTML = opts;
      $('co-col').value = String(state.companyCol);
      $('co-filtercol').innerHTML = '<option value="-1">- no filter -</option>' + opts;
      $('co-filtercol').value = String(state.filterCol);
      $('co-clusterblock').style.display = '';
      buildFilterValues();
      rebuildCompanies();
      ['co-step2', 'co-step3'].forEach(function (s) { $(s).classList.remove('disabled'); });
    }

    function buildFilterValues() {
      var box = $('co-filtervals');
      box.innerHTML = '';
      if (state.filterCol < 0) { rebuildCompanies(); return; }
      var uniq = new Map();
      state.rows.forEach(function (r) {
        var v = String(r[state.filterCol] === undefined ? '' : r[state.filterCol]).trim();
        uniq.set(v, (uniq.get(v) || 0) + 1);
      });
      if (uniq.size > 40) {
        box.innerHTML = '<div class="small-note">⚠ too many values; pick a grouping column.</div>';
        state.includeValues = null; return;
      }
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
          rebuildCompanies();
        });
        list.appendChild(lab);
      });
      box.appendChild(list);

      var note = document.createElement('div');
      note.id = 'co-clusternote';
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
        rebuildCompanies();
      });
      clrAll.addEventListener('click', function () {
        state.includeValues = new Set();
        refreshLabels();
        updateNote();
        rebuildCompanies();
      });
    }

    function includedRows() {
      if (state.filterCol < 0 || state.includeValues === null) return state.rows;
      return state.rows.filter(function (r) {
        var v = String(r[state.filterCol] === undefined ? '' : r[state.filterCol]).trim();
        return state.includeValues.has(v);
      });
    }

    /* ---------- company list ---------- */

    function rebuildCompanies() {
      if (state.companyCol < 0 || !state.rows.length) return;
      var values = includedRows().map(function (r) { return r[state.companyCol]; });
      var old = {};
      state.companies.forEach(function (c) { old[c.name.toLowerCase()] = c; });
      state.companies = dedupeCompanies(values).map(function (d) {
        var prev = old[d.name.toLowerCase()];
        if (prev) { prev.count = d.count; return prev; }
        return {
          id: 'c' + (++uid), name: d.name, count: d.count,
          status: 'idle', desc: '', img: null, bytes: null, url: null,
          candidates: [], website: null,
          mult: 1, jit: hash01(d.name), include: true
        };
      });
      $('co-nhint').textContent = state.companies.length + ' companies';
      renderCards();
      updateExportButtons();
      scheduleRender(true);
    }

    function hash01(s) {
      var h = 2166136261;
      for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
      return ((h >>> 0) % 1000) / 1000;
    }

    function updateExportButtons() {
      var any = state.companies.some(function (c) { return c.include; });
      $('co-png').disabled = !any;
      $('co-pptx').disabled = !any;
    }

    /* ---------- online logo search (silent, best-effort) ---------- */

    var jsonpCounter = 0;
    function jsonp(url) {
      return new Promise(function (resolve, reject) {
        var cb = '__leadJsonp' + (++jsonpCounter);
        var script = document.createElement('script');
        var timer = setTimeout(function () { cleanup(); reject(new Error('timeout')); }, 12000);
        function cleanup() {
          try { delete window[cb]; } catch (e) { window[cb] = undefined; }
          script.remove(); clearTimeout(timer);
        }
        window[cb] = function (data) { cleanup(); resolve(data); };
        script.onerror = function () { cleanup(); reject(new Error('network error')); };
        script.src = url + '&callback=' + cb;
        document.head.appendChild(script);
      });
    }

    function wikidataApi(params) {
      return jsonp('https://www.wikidata.org/w/api.php?format=json&' + params);
    }

    function loadLogoImage(url) {
      return new Promise(function (resolve, reject) {
        var img = new Image();
        img.crossOrigin = 'anonymous';
        var timer = setTimeout(function () { img.src = ''; reject(new Error('timeout')); }, 9000);
        img.onload = function () {
          clearTimeout(timer);
          if (!img.naturalWidth || !img.naturalHeight) { reject(new Error('empty image')); return; }
          try {
            var t = document.createElement('canvas'); t.width = 2; t.height = 2;
            var tc = t.getContext('2d'); tc.drawImage(img, 0, 0, 2, 2); tc.getImageData(0, 0, 1, 1);
            resolve(img);
          } catch (e) { reject(new Error('cors')); }
        };
        img.onerror = function () { clearTimeout(timer); reject(new Error('no image')); };
        img.src = url;
      });
    }

    function imageToPngBytes(img) {
      var w = img.naturalWidth, h = img.naturalHeight;
      var s = Math.min(1, 900 / Math.max(w, h));
      var oc = document.createElement('canvas');
      oc.width = Math.max(1, Math.round(w * s));
      oc.height = Math.max(1, Math.round(h * s));
      oc.getContext('2d').drawImage(img, 0, 0, oc.width, oc.height);
      return new Promise(function (resolve, reject) {
        try {
          oc.toBlob(function (blob) {
            if (!blob) { reject(new Error('image encode failed')); return; }
            blob.arrayBuffer().then(function (ab) {
              resolve({ bytes: new Uint8Array(ab), blob: blob });
            }, reject);
          }, 'image/png');
        } catch (e) { reject(e); }
      });
    }

    // Resolve Commons file titles to DIRECT upload.wikimedia.org URLs
    // (see the CORS note at the top: Special:FilePath redirects are unusable).
    function resolveCommonsFiles(files) {
      var titles = files.map(function (f) { return 'File:' + f; }).join('|');
      return jsonp('https://commons.wikimedia.org/w/api.php?format=json&action=query&prop=imageinfo&iiprop=url&iiurlwidth=500&titles=' +
        encodeURIComponent(titles))
        .then(function (res) {
          var map = {};
          var pages = (res.query && res.query.pages) || {};
          Object.keys(pages).forEach(function (k) {
            var p = pages[k];
            var ii = p.imageinfo && p.imageinfo[0];
            if (ii && (ii.thumburl || ii.url)) {
              map[normFile(p.title)] = { thumb: ii.thumburl || ii.url, orig: ii.url };
            }
          });
          return map;
        });
    }

    // Commons image search that returns direct, CORS-safe thumb URLs
    function commonsSearchApi(query) {
      return jsonp('https://commons.wikimedia.org/w/api.php?format=json&action=query&generator=search&gsrnamespace=6&gsrlimit=24&gsrsearch=' +
        encodeURIComponent(query + ' filetype:bitmap|drawing') +
        '&prop=imageinfo&iiprop=url&iiurlwidth=320')
        .then(function (res) {
          var pages = (res.query && res.query.pages) || {};
          var out = [];
          Object.keys(pages).forEach(function (k) {
            var p = pages[k];
            var ii = p.imageinfo && p.imageinfo[0];
            if (ii && ii.thumburl) {
              out.push({ index: p.index || 0, file: p.title.replace(/^File:/i, ''), thumb: ii.thumburl });
            }
          });
          out.sort(function (a, b) { return a.index - b.index; });
          return out;
        });
    }

    // pick a loaded candidate as THE logo
    function choose(c, cand) {
      return imageToPngBytes(cand.img).then(function (enc) {
        if (c.url) URL.revokeObjectURL(c.url);
        c.img = cand.img;
        c.url = URL.createObjectURL(enc.blob);
        c.bytes = enc.bytes;
        c.status = 'found';
        c.desc = cand.source || '';
        renderCard(c); scheduleRender();
      });
    }

    // apply a local blob (paste / drop / upload)
    function applyBlob(c, blob, label) {
      return new Promise(function (resolve, reject) {
        var url = URL.createObjectURL(blob);
        var img = new Image();
        img.onload = function () {
          imageToPngBytes(img).then(function (enc) {
            if (c.url) URL.revokeObjectURL(c.url);
            URL.revokeObjectURL(url);
            c.img = img;
            c.url = URL.createObjectURL(enc.blob);
            c.bytes = enc.bytes;
            c.status = 'manual';
            c.desc = label;
            c.candidates = c.candidates.slice(0, 3);
            c.candidates.unshift({ img: img, source: label });
            renderCard(c); scheduleRender();
            resolve();
          });
        };
        img.onerror = function () { URL.revokeObjectURL(url); reject(new Error('bad image')); };
        img.src = url;
      });
    }

    function tryLoadSome(cands, max) {
      var out = [];
      function step(i) {
        if (i >= cands.length || out.length >= max) return Promise.resolve(out);
        return loadLogoImage(cands[i].url).then(function (img) {
          out.push({ img: img, url: cands[i].url, source: cands[i].source });
        }).catch(function () { }).then(function () { return step(i + 1); });
      }
      return step(0);
    }

    function gatherFor(c) {
      c.status = 'searching';
      renderCard(c);
      var q = c.name;
      return wikidataApi('action=wbsearchentities&type=item&language=en&uselang=en&limit=5&search=' + encodeURIComponent(q))
        .then(function (res) {
          var hits = res.search || [];
          if (!hits.length && strippedQuery(q) !== q) {
            return wikidataApi('action=wbsearchentities&type=item&language=en&uselang=en&limit=5&search=' +
              encodeURIComponent(strippedQuery(q))).then(function (r2) { return r2.search || []; });
          }
          return hits;
        })
        .then(function (hits) {
          if (!hits.length) return [];
          var ids = hits.map(function (h) { return h.id; }).join('|');
          return wikidataApi('action=wbgetentities&props=claims%7Cdescriptions&languages=en&ids=' + ids)
            .then(function (res) {
              var infos = [];
              for (var i = 0; i < hits.length; i++) {
                var ent = res.entities && res.entities[hits[i].id];
                if (!ent) continue;
                var info = {
                  logoFile: claimValue(ent, 'P154'),
                  website: claimValue(ent, 'P856'),
                  desc: ent.descriptions && ent.descriptions.en ? ent.descriptions.en.value : ''
                };
                info.score = scoreEntity(info) - i * 0.1;
                if (info.score >= 2 && (info.logoFile || info.website)) infos.push(info);
              }
              infos.sort(function (a, b) { return b.score - a.score; });
              return infos.slice(0, 3);
            }).catch(function () { return []; });
        })
        .catch(function () { return []; })
        .then(function (infos) {
          if (infos.length && infos[0].website) c.website = infos[0].website;
          // resolve Wikidata logo files to direct CORS-safe URLs, then add
          // the Clearbit/favicon candidates
          var withLogos = infos.filter(function (i) { return i.logoFile; }).slice(0, 3);
          var resolveP = withLogos.length
            ? resolveCommonsFiles(withLogos.map(function (i) { return i.logoFile; })).catch(function () { return {}; })
            : Promise.resolve({});
          return resolveP.then(function (map) {
            var cands = [];
            withLogos.forEach(function (i) {
              var r = map[normFile(i.logoFile)];
              if (r) cands.push({ url: r.thumb, source: i.desc || 'Wikidata logo' });
            });
            candidateUrls(infos, c.name).forEach(function (d) { cands.push(d); });
            return tryLoadSome(cands, 4);
          });
        })
        .then(function (loaded) {
          if (loaded.length) { c.candidates = loaded; return choose(c, loaded[0]); }
          // primary sources came up empty → automatically try a Wikimedia
          // Commons image search and load the top hits as candidates
          return commonsSearchApi(c.name + ' logo').catch(function () { return []; })
            .then(function (results) {
              c.commonsResults = results;
              c.commonsDone = true;
              var out = [];
              function step(i) {
                if (i >= Math.min(results.length, 6) || out.length >= 4) return Promise.resolve(out);
                return loadLogoImage(results[i].thumb).then(function (img) {
                  out.push({ img: img, source: 'Commons · ' + results[i].file });
                }).catch(function () { }).then(function () { return step(i + 1); });
              }
              return step(0);
            })
            .then(function (extra) {
              c.candidates = extra;
              if (extra.length) return choose(c, extra[0]);
              c.status = 'none'; c.desc = '';
              renderCard(c);
            });
        });
    }

    function searchAll() {
      if (state.searching) return;
      state.searching = true;
      var queue = state.companies.filter(function (c) { return c.include && !c.img; });
      var total = queue.length, done = 0;
      $('co-progress').textContent = '0 / ' + total + '…';
      function wait(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
      function next() {
        if (!queue.length) {
          state.searching = false;
          var found = state.companies.filter(function (c) { return c.img; }).length;
          $('co-progress').textContent = '✓ ' + found + ' of ' + state.companies.length + ' filled';
          scheduleRender(true);
          return;
        }
        var c = queue.shift();
        // no single company may ever stall the run: hard 25 s cap + catch-all
        Promise.race([gatherFor(c), wait(25000)])
          .catch(function (e) { if (window.console) console.warn('logo search failed:', c.name, e); })
          .then(function () {
            if (c.status === 'searching') { c.status = 'none'; c.desc = ''; renderCard(c); }
            done++;
            $('co-progress').textContent = done + ' / ' + total + '…';
            setTimeout(next, 250);
          });
      }
      next();
    }

    /* ---------- company cards ---------- */

    function renderCards() {
      var box = $('co-cards');
      box.innerHTML = '';
      var shown = 0;
      state.companies.forEach(function (c) {
        if (state.missingOnly && c.img) return;
        box.appendChild(cardEl(c));
        shown++;
      });
      if (state.missingOnly && !shown) {
        box.innerHTML = '<div class="small-note" style="padding:8px">🎉 nothing missing: every company has a logo</div>';
      }
    }

    function renderCard(c) {
      if (state.missingOnly) { renderCards(); return; }
      var el = container.querySelector('[data-card="' + c.id + '"]');
      if (el) el.replaceWith(cardEl(c));
    }

    function selectCompany(c) {
      state.selectedId = c ? c.id : null;
      renderCards();
      if (c) {
        var el = container.querySelector('[data-card="' + c.id + '"]');
        if (el) el.scrollIntoView({ block: 'nearest' });
      }
    }

    /* In-card searcher: Wikimedia Commons image search with clickable
       results. Runs automatically the first time a card is opened. */
    function buildSearcher(c) {
      var box = document.createElement('div');
      box.style.cssText = 'width:100%;border-top:1px solid var(--line);padding-top:6px';
      box.addEventListener('click', function (e) { e.stopPropagation(); });
      box.innerHTML =
        '<div class="row">' +
        '  <input type="text" data-s="q">' +
        '  <button data-s="go" class="fixed">Search</button>' +
        '</div>' +
        '<div class="logo-grid" data-s="grid"></div>';
      var grid = box.querySelector('[data-s="grid"]');
      var input = box.querySelector('[data-s="q"]');
      input.value = c.query || (c.name + ' logo');

      function renderGrid() {
        grid.innerHTML = '';
        (c.commonsResults || []).forEach(function (r) {
          var d = document.createElement('div');
          d.className = 'logo-pick';
          d.style.opacity = '.45';   // until the thumb finishes loading
          d.innerHTML = '<img><span>' + escapeHtml(r.file.replace(/\.[a-z0-9]+$/i, '')) + '</span>';
          var im = d.querySelector('img');
          // direct upload.wikimedia.org URL, loaded in CORS mode: the cache
          // stays CORS-clean and this exact element becomes the logo on click
          im.crossOrigin = 'anonymous';
          im.onload = function () { d.style.opacity = '1'; };
          im.onerror = function () { d.remove(); };
          im.src = r.thumb;
          d.addEventListener('click', function () {
            if (!im.naturalWidth) return;              // still loading
            var cand = { img: im, source: 'Commons · ' + r.file };
            c.candidates = [cand].concat(c.candidates).slice(0, 5);
            choose(c, cand);                            // instant, guaranteed
            // silently upgrade to a sharper version when one exists
            var up = thumbUp(r.thumb, 640);
            if (up) {
              loadLogoImage(up).then(function (imgBig) {
                if (c.candidates[0] === cand && c.img === cand.img) {
                  cand.img = imgBig;
                  cand.thumbUrl = null;
                  choose(c, cand);
                }
              }).catch(function () { });
            }
          });
          grid.appendChild(d);
        });
        if (!grid.children.length) {
          grid.innerHTML = '<span class="small-note">no results. 🌐 then ⌘V</span>';
        }
      }

      function run() {
        c.query = input.value.trim() || (c.name + ' logo');
        grid.innerHTML = '<span class="small-note">searching…</span>';
        commonsSearchApi(c.query).then(function (results) {
          c.commonsResults = results;
          c.commonsDone = true;
          renderGrid();
        }).catch(function () {
          grid.innerHTML = '<span class="small-note">search unavailable. 🌐 then ⌘V</span>';
        });
      }

      input.addEventListener('keydown', function (e) { if (e.key === 'Enter') run(); });
      box.querySelector('[data-s="go"]').addEventListener('click', run);

      if (c.commonsResults && c.commonsResults.length) renderGrid();
      else run();
      return box;
    }

    function cardEl(c) {
      var el = document.createElement('div');
      el.setAttribute('data-card', c.id);
      var selected = state.selectedId === c.id;
      var filled = !!c.img;
      // filled = white card with a green edge; missing = amber, dashed
      el.style.cssText = 'display:flex;flex-wrap:wrap;gap:10px;align-items:center;border:1.5px ' +
        (selected ? 'solid var(--blue)' : (filled ? 'solid var(--line)' : 'dashed #F5C26B')) +
        ';box-shadow:inset 4px 0 0 ' + (filled ? '#16A34A' : '#F59E0B') +
        ';border-radius:8px;padding:7px 9px 7px 12px;background:' +
        (selected ? 'var(--blue-soft)' : (filled ? '#fff' : '#FFFBEB')) +
        ';cursor:pointer' + (c.include ? '' : ';opacity:.45');

      var logoHtml = c.url
        ? '<img src="' + c.url + '" style="width:54px;height:34px;object-fit:contain;flex:none;background:#fff">'
        : '<div style="width:54px;height:34px;flex:none;display:flex;align-items:center;justify-content:center;background:#FEF3C7;border-radius:4px;font-size:14px;color:#B45309">' +
          (c.status === 'searching' ? '⏳' : '?') + '</div>';

      // alternates strip: click to swap; ring marks the current one
      var alts = '';
      if (c.candidates.length > 1 || (c.candidates.length === 1 && !c.img)) {
        alts = '<div style="display:flex;gap:4px;margin-top:3px">' +
          c.candidates.map(function (cd, i) {
            var current = c.img === cd.img;
            return '<img data-alt="' + i + '" src="' + (cd.thumbUrl || '') + '" style="width:30px;height:20px;object-fit:contain;border-radius:3px;border:2px solid ' +
              (current ? 'var(--blue)' : 'var(--line)') + ';cursor:pointer;background:#fff" title="' + escapeHtml(cd.source || '') + '">';
          }).join('') + '</div>';
      }

      var hint = '';
      if (selected) {
        hint = '<div class="small-note" style="margin-top:2px">click a result below · or 🌐 → copy → <b>⌘V</b></div>';
      } else if (!c.img && c.status !== 'searching') {
        hint = '<div class="small-note" style="margin-top:2px">click to search</div>';
      }

      el.innerHTML = logoHtml +
        '<div style="flex:1;min-width:0">' +
        '  <div style="font-size:13px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' +
        escapeHtml(c.name) + ' <span style="color:var(--muted);font-weight:400;font-size:11px">×' + c.count + '</span></div>' +
        (c.desc ? '<div class="small-note" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + escapeHtml(c.desc) + '</div>' : '') +
        alts + hint +
        '</div>' +
        '<div style="display:flex;gap:5px;flex:none;align-items:center">' +
        (c.img ? '<button data-a="clear" title="remove this logo">✕</button>' : '') +
        '  <button data-a="web" title="open Google Images in a new tab, copy an image, come back, press ⌘V">🌐</button>' +
        '  <input data-a="include" type="checkbox" ' + (c.include ? 'checked' : '') + ' title="include in collage">' +
        '</div>';

      if (selected) el.appendChild(buildSearcher(c));

      // alt thumbs need object URLs | set after innerHTML
      var altImgs = el.querySelectorAll('[data-alt]');
      Array.prototype.forEach.call(altImgs, function (ai) {
        var cd = c.candidates[+ai.getAttribute('data-alt')];
        if (!cd) return;
        if (!cd.thumbUrl) {
          var oc = document.createElement('canvas');
          var s = Math.min(1, 60 / Math.max(cd.img.naturalWidth, cd.img.naturalHeight));
          oc.width = Math.max(1, Math.round(cd.img.naturalWidth * s));
          oc.height = Math.max(1, Math.round(cd.img.naturalHeight * s));
          oc.getContext('2d').drawImage(cd.img, 0, 0, oc.width, oc.height);
          cd.thumbUrl = oc.toDataURL();
        }
        ai.src = cd.thumbUrl;
        ai.addEventListener('click', function (e) {
          e.stopPropagation();
          choose(c, cd);
        });
      });

      el.addEventListener('click', function (e) {
        if (e.target.closest('button') || e.target.closest('input') || e.target.closest('[data-alt]')) return;
        selectCompany(state.selectedId === c.id ? null : c);   // toggle
      });
      var clearBtn = el.querySelector('[data-a="clear"]');
      if (clearBtn) clearBtn.addEventListener('click', function (e) {
        e.stopPropagation();
        if (c.url) URL.revokeObjectURL(c.url);
        c.img = null; c.bytes = null; c.url = null;
        c.status = 'none'; c.desc = '';
        renderCard(c); scheduleRender();
      });
      el.querySelector('[data-a="web"]').addEventListener('click', function (e) {
        e.stopPropagation();
        selectCompany(c);
        window.open('https://www.google.com/search?tbm=isch&q=' +
          encodeURIComponent(c.name + ' logo transparent png'), '_blank');
      });
      el.querySelector('[data-a="include"]').addEventListener('change', function (e) {
        c.include = e.target.checked;
        renderCard(c); updateExportButtons(); scheduleRender();
      });

      // drop an image file straight onto the card
      ['dragover', 'dragenter'].forEach(function (ev) {
        el.addEventListener(ev, function (e) { e.preventDefault(); el.style.borderColor = 'var(--blue)'; });
      });
      el.addEventListener('dragleave', function () { renderCard(c); });
      el.addEventListener('drop', function (e) {
        e.preventDefault(); e.stopPropagation();
        var f = e.dataTransfer.files && e.dataTransfer.files[0];
        if (f && /image\//.test(f.type)) applyBlob(c, f, 'dropped file');
      });

      return el;
    }

    // global ⌘V: paste into the selected (or 🌐-opened) company
    function onPaste(e) {
      if (container.offsetParent === null) return;       // app not visible
      var c = state.companies.filter(function (x) { return x.id === state.selectedId; })[0];
      if (!c) return;
      var items = (e.clipboardData && e.clipboardData.items) || [];
      for (var i = 0; i < items.length; i++) {
        if (items[i].type && items[i].type.indexOf('image/') === 0) {
          e.preventDefault();
          applyBlob(c, items[i].getAsFile(), 'pasted by you');
          return;
        }
      }
    }
    document.addEventListener('paste', onPaste);

    /* ---------- collage rendering ---------- */

    function collageItems() {
      return state.companies.filter(function (c) { return c.include; }).map(function (c) {
        var aspect = c.img ? (c.img.naturalWidth / c.img.naturalHeight) : 2.6;
        return { c: c, aspect: aspect, mult: c.mult * (0.95 + c.jit * 0.2) };
      });
    }

    function keepoutSpec(W, H) {
      if (state.holePct <= 0) return null;
      return { cx: W / 2, cy: H / 2, rx: state.holePct * W / 2, ry: state.holePct * H / 2 };
    }

    function autoText() {
      var n = state.companies.filter(function (c) { return c.include; }).length;
      return n + ' Employers';
    }

    function scheduleRender(immediate) {
      clearTimeout(renderTimer);
      renderTimer = setTimeout(render, immediate ? 0 : 180);
    }

    var lastPlacement = [];

    function render() {
      var items = collageItems();
      if (!items.length || !state.rows.length) return;
      var d = state.dims.split('x');
      var W = parseInt(d[0], 10), H = parseInt(d[1], 10);
      canvas.style.display = '';
      $('co-empty').style.display = 'none';
      canvas.width = W; canvas.height = H;
      var ctx = canvas.getContext('2d');
      ctx.fillStyle = state.bg;
      ctx.fillRect(0, 0, W, H);

      var pos = layoutRects(items.map(function (it) { return { aspect: it.aspect, mult: it.mult }; }),
        W, H, { seed: state.seed, fill: state.fill, keepout: keepoutSpec(W, H) });

      lastPlacement = [];
      items.forEach(function (it, i) {
        var q = pos[i];
        lastPlacement.push({ c: it.c, x: q.x, y: q.y, w: q.w, h: q.h });
        if (it.c.img) {
          var s = Math.min(q.w / it.c.img.naturalWidth, q.h / it.c.img.naturalHeight);
          var dw = it.c.img.naturalWidth * s, dh = it.c.img.naturalHeight * s;
          ctx.drawImage(it.c.img, q.x + (q.w - dw) / 2, q.y + (q.h - dh) / 2, dw, dh);
        } else {
          ctx.fillStyle = '#94A3B8';
          ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          var fs = Math.max(12, Math.min(q.h * 0.4, q.w / Math.max(4, it.c.name.length * 0.62)));
          ctx.font = '700 ' + Math.round(fs) + 'px Arial, sans-serif';
          ctx.fillText(it.c.name, q.x + q.w / 2, q.y + q.h / 2, q.w);
        }
      });

      if (state.showText) {
        var text = state.textDirty ? state.text : autoText();
        if (!state.textDirty) $('co-text').value = text;
        if (text) {
          ctx.fillStyle = state.textColor;
          ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          ctx.font = '700 ' + Math.round(state.textPx * (W / 2560)) + 'px ' + state.textFont + ', sans-serif';
          ctx.fillText(text, W / 2, H / 2);
        }
      }

      var withLogos = items.filter(function (it) { return it.c.img; }).length;
      statusEl.textContent = items.length + ' companies (' + withLogos + ' logos) · ' + W + '×' + H + ' · layout #' + state.seed;
    }

    /* ---------- exports ---------- */

    function downloadBlob(blob, fname) {
      var a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = fname;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(function () { URL.revokeObjectURL(a.href); }, 5000);
    }

    function exportPng() {
      canvas.toBlob(function (blob) {
        if (!blob) { statusEl.textContent = 'PNG export failed; replace the last-added logo and retry.'; return; }
        downloadBlob(blob, 'LEADTK_CLG-IND_' + new Date().toISOString().slice(0, 10) + '.png');
      }, 'image/png');
    }

    function exportPptx() {
      if (!window.pptxLite) return;
      var d = state.dims.split('x');
      var W = parseInt(d[0], 10), H = parseInt(d[1], 10);
      var images = [], texts = [];
      lastPlacement.forEach(function (p) {
        if (p.c.img && p.c.bytes) {
          var s = Math.min(p.w / p.c.img.naturalWidth, p.h / p.c.img.naturalHeight);
          var dw = p.c.img.naturalWidth * s, dh = p.c.img.naturalHeight * s;
          images.push({
            bytes: p.c.bytes, ext: 'png',
            x: p.x + (p.w - dw) / 2, y: p.y + (p.h - dh) / 2, w: dw, h: dh,
            shape: 'rect', borderColor: null, borderPx: 0, name: p.c.name
          });
        } else {
          texts.push({ text: p.c.name, x: p.x, y: p.y, w: p.w, h: p.h, fontPx: Math.min(p.h * 0.4, 28), color: '#94A3B8', bold: true, font: 'Arial' });
        }
      });
      if (state.showText) {
        var text = state.textDirty ? state.text : autoText();
        if (text) {
          var ko = keepoutSpec(W, H) || { cx: W / 2, cy: H / 2, rx: W * 0.2, ry: H * 0.15 };
          texts.push({
            text: text, x: ko.cx - ko.rx, y: ko.cy - ko.ry / 2, w: 2 * ko.rx, h: ko.ry,
            fontPx: state.textPx * (W / 2560), color: state.textColor, bold: true, font: state.textFont
          });
        }
      }
      var bytes = window.pptxLite.makePptx({ canvasW: W, canvasH: H, background: state.bg, images: images, texts: texts });
      downloadBlob(new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation' }),
        'LEADTK_CLG-IND_' + new Date().toISOString().slice(0, 10) + '.pptx');
    }

    /* ---------- sample data ---------- */

    var SAMPLE = 'Name,cluster,Job 1 Employer\n' + [
      ['Student 1', 'H', 'McKinsey & Company'], ['Student 2', 'H', 'Boston Consulting Group'],
      ['Student 3', 'H', 'Amazon'], ['Student 4', 'W', 'Goldman Sachs'], ['Student 5', 'W', 'Deloitte'],
      ['Student 6', 'W', 'J.P. Morgan'], ['Student 7', 'X', 'Morgan Stanley'], ['Student 8', 'X', 'Bain & Company'],
      ['Student 9', 'X', 'PwC'], ['Student 10', 'H', 'EY'], ['Student 11', 'H', 'Citi'],
      ['Student 12', 'W', 'Dell Technologies'], ['Student 13', 'W', 'Infosys'], ['Student 14', 'X', 'Best Buy'],
      ['Student 15', 'H', 'General Motors'], ['Student 16', 'W', 'Santander'], ['Student 17', 'X', 'KPMG'],
      ['Student 18', 'H', 'Gartner'], ['Student 19', 'W', 'Teva Pharmaceuticals'], ['Student 20', 'X', 'UNESCO']
    ].map(function (r) { return r.join(','); }).join('\n') + '\n';

    /* ---------- events ---------- */

    var drop = $('co-drop'), fileInput = $('co-file');
    drop.addEventListener('click', function () { fileInput.click(); });
    fileInput.addEventListener('change', function () { if (fileInput.files[0]) loadFile(fileInput.files[0]); });
    ['dragover', 'dragenter'].forEach(function (ev) {
      drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.add('drag'); });
    });
    ['dragleave', 'drop'].forEach(function (ev) {
      drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.remove('drag'); });
    });
    drop.addEventListener('drop', function (e) { if (e.dataTransfer.files[0]) loadFile(e.dataTransfer.files[0]); });
    $('co-sample').addEventListener('click', function () {
      $('co-sheetrow').style.display = 'none';
      loadRows(parseCSVText(SAMPLE), 'demo data');
    });
    $('co-sheet').addEventListener('change', function (e) { useSheet(+e.target.value); });
    $('co-col').addEventListener('change', function (e) { state.companyCol = +e.target.value; state.companies = []; rebuildCompanies(); });
    $('co-filtercol').addEventListener('change', function (e) {
      state.filterCol = +e.target.value; state.includeValues = null; buildFilterValues(); rebuildCompanies();
    });

    $('co-search').addEventListener('click', searchAll);
    $('co-missing').addEventListener('change', function (e) {
      state.missingOnly = e.target.checked;
      renderCards();
    });

    function bindSlider(id, outId, key, factor, fmt) {
      $(id).addEventListener('input', function (e) {
        state[key] = parseFloat(e.target.value) * factor;
        $(outId).textContent = fmt(e.target.value);
        scheduleRender();
      });
    }
    bindSlider('co-hole', 'co-hole-o', 'holePct', 0.01, function (v) { return v + '%'; });
    bindSlider('co-fill', 'co-fill-o', 'fill', 0.01, function (v) { return v + '%'; });
    bindSlider('co-tsize', 'co-tsize-o', 'textPx', 1, function (v) { return v; });

    $('co-showtext').addEventListener('change', function (e) { state.showText = e.target.checked; scheduleRender(); });
    $('co-text').addEventListener('input', function (e) { state.text = e.target.value; state.textDirty = true; scheduleRender(); });
    $('co-tcolor').addEventListener('input', function (e) { state.textColor = e.target.value; scheduleRender(); });
    $('co-tfont').addEventListener('change', function (e) { state.textFont = e.target.value; scheduleRender(); });
    $('co-bg').addEventListener('input', function (e) { state.bg = e.target.value; scheduleRender(); });
    $('co-dims').addEventListener('change', function (e) { state.dims = e.target.value; scheduleRender(); });

    $('co-shuffle').addEventListener('click', function () {
      state.seed = Math.floor(NATIVE_RANDOM() * 2147483647);
      scheduleRender(true);
    });
    $('co-png').addEventListener('click', exportPng);
    $('co-pptx').addEventListener('click', exportPptx);
  }

  /* ======================================================================
     REGISTER / EXPORT
     ====================================================================== */

  if (typeof window !== 'undefined' && window.LeadToolkit) {
    window.LeadToolkit.registerApp({
      id: 'companies',
      icon: '🖼️🏢',
      group: 'Class 1 - Heart of Leadership',
      name: 'Collage Generator | Industry Searcher',
      code: 'CLG-IND',
      intro: { upload: 'main roster with the employer column', to: 'build the company-logo collage; logos auto-found online (company names only)' },
      tags: ['logos', 'employers', 'collage', 'companies'],
      description: 'Extract employers from the roster, auto-fill logos from the web, patch the gaps with 🌐 + ⌘V, export the "N Employers" collage as PNG or PowerPoint.',
      mount: mount
    });
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
      mulberry32: mulberry32,
      layoutRects: layoutRects,
      dedupeCompanies: dedupeCompanies,
      strippedQuery: strippedQuery,
      claimValue: claimValue,
      domainFrom: domainFrom,
      candidateUrls: candidateUrls,
      thumbUp: thumbUp,
      normFile: normFile,
      scoreEntity: scoreEntity,
      COMPANYISH: COMPANYISH,
      NOT_COMPANYISH: NOT_COMPANYISH
    };
  }
})();
