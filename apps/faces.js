/* ==========================================================================
   App 3 | Faces (bubble collage)
   Upload class headshots -> circular-bubble collage with an open middle
   space and optional center text, like the "YOU are all leaders!" slide.
   - Layout adapts to however many faces are loaded (area-based sizing,
     seeded rejection placement, no overlaps, keep-out ellipse in middle).
   - Grid mode: uniform squares in rows and columns sized to fill the
     canvas; partial last row is centered; optional corner radius.
   - Rudimentary auto face-centering: Chrome's FaceDetector API when
     available, otherwise a skin-tone-centroid heuristic; ALWAYS refinable
     by hand (drag inside a bubble to pan, editor panel to zoom/resize).
   - Cmd/Ctrl+V in the edit panel pastes a clipboard image, replacing the
     selected photo.
   - Exports PNG and real PPTX (each photo cropped + ellipse/rect geometry +
     border as native PowerPoint objects, editable afterwards).
   All processing stays in the browser; photos never leave the machine.
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

  /* Bubble layout: given per-photo size multipliers, place non-overlapping
     circles inside W×H, avoiding an optional central keep-out ellipse.
     Returns [{x, y, r}] aligned with the input order. Deterministic. */
  function layoutBubbles(mults, W, H, opts) {
    opts = opts || {};
    var n = mults.length;
    if (!n) return [];
    var margin = opts.margin !== undefined ? opts.margin : Math.round(0.015 * W);
    var gap = opts.gap !== undefined ? opts.gap : Math.round(0.006 * W);
    var fill = opts.fill || 0.40;
    var ko = opts.keepout || null;   // {cx, cy, rx, ry}
    var rnd = mulberry32(opts.seed || 1);

    var usableW = W - 2 * margin, usableH = H - 2 * margin;
    var area = usableW * usableH * fill;
    if (ko) area -= Math.min(Math.PI * ko.rx * ko.ry, usableW * usableH * 0.5) * fill;
    var sumSq = mults.reduce(function (s, m) { return s + m * m; }, 0);
    var rBase = Math.sqrt(area / (Math.PI * sumSq));

    var order = mults.map(function (m, i) { return i; })
      .sort(function (a, b) { return mults[b] - mults[a]; });

    var placed = [], result = new Array(n);
    order.forEach(function (idx) {
      var r = mults[idx] * rBase;
      var tries = 0, x, y, ok;
      while (true) {
        tries++;
        if (tries % 500 === 0) r *= 0.92;          // shrink stubborn bubbles
        if (tries > 6000) break;                    // give up: place anyway
        x = margin + r + rnd() * Math.max(1, usableW - 2 * r);
        y = margin + r + rnd() * Math.max(1, usableH - 2 * r);
        if (ko) {
          var ndx = (x - ko.cx) / (ko.rx + r + gap);
          var ndy = (y - ko.cy) / (ko.ry + r + gap);
          if (ndx * ndx + ndy * ndy < 1) continue;
        }
        ok = true;
        for (var i = 0; i < placed.length; i++) {
          var dx = placed[i].x - x, dy = placed[i].y - y;
          var min = placed[i].r + r + gap;
          if (dx * dx + dy * dy < min * min) { ok = false; break; }
        }
        if (ok) break;
      }
      var p = { x: x, y: y, r: r };
      placed.push(p);
      result[idx] = p;
    });
    return result;
  }

  /* Grid layout: place N photos as uniform squares filling W x H.
     Returns [{x, y, side, col, row}] aligned with input order; ALWAYS N
     entries, no photo is ever dropped.
     - cols = round(sqrt(N * W/H)) so the grid roughly matches the canvas
       aspect ratio; photo rows = ceil(N / cols).
     - opts.midRowStart / opts.midRowEnd: row indices (inclusive) reserved
       for the middle-text band. Reserved rows are EXTRA rows: the grid
       grows by that many rows and every photo still gets a cell.
     - square side = min over width/height so the whole block fits.
     - a partial row is centred horizontally.
     - opts.gapPx: pixel gap between squares (default 0). */
  function layoutGrid(N, W, H, opts) {
    opts = opts || {};
    var gap = opts.gapPx !== undefined ? opts.gapPx : 0;
    if (N <= 0) return [];
    var midStart = opts.midRowStart !== undefined ? opts.midRowStart : -1;
    var midEnd   = opts.midRowEnd   !== undefined ? opts.midRowEnd   : -2;
    var reserved = midStart >= 0 ? (midEnd - midStart + 1) : 0;
    // choose cols to roughly match the canvas aspect
    var cols = Math.max(1, Math.round(Math.sqrt(N * W / H)));
    var photoRows = Math.ceil(N / cols);
    var rows = photoRows + reserved;
    // square side such that the whole block (incl. reserved rows) fits
    var side = Math.min(
      (W - gap * (cols - 1)) / cols,
      (H - gap * (rows - 1)) / rows
    );
    // total grid block width/height (used for centring the whole grid)
    var blockW = cols * side + gap * (cols - 1);
    var blockH = rows * side + gap * (rows - 1);
    var originX = (W - blockW) / 2;
    var originY = (H - blockH) / 2;

    var result = [];
    var photoIdx = 0;
    for (var row = 0; row < rows && photoIdx < N; row++) {
      // rows reserved for the middle text band hold no photos
      if (reserved > 0 && row >= midStart && row <= midEnd) continue;
      // how many squares go in this row?
      var remaining = N - photoIdx;
      var inRow = Math.min(cols, remaining);
      // centre partial row horizontally
      var rowOffsetX = (cols - inRow) * (side + gap) / 2;
      for (var col = 0; col < inRow; col++) {
        result.push({
          x: originX + rowOffsetX + col * (side + gap),
          y: originY + row * (side + gap),
          side: side,
          col: col,
          row: row
        });
        photoIdx++;
      }
    }
    return result;
  }

  /* Middle band geometry for grid mode: returns {x,y,w,h} of the reserved
     strip (rows midRowStart..midRowEnd), computed with the SAME geometry
     as layoutGrid so the band lines up exactly with the skipped rows. */
  function gridGapRect(N, W, H, gapPx, midRowStart, midRowEnd) {
    var gap = gapPx || 0;
    if (N <= 0 || midRowStart < 0) return null;
    var reserved = midRowEnd - midRowStart + 1;
    var cols = Math.max(1, Math.round(Math.sqrt(N * W / H)));
    var rows = Math.ceil(N / cols) + reserved;
    var side = Math.min(
      (W - gap * (cols - 1)) / cols,
      (H - gap * (rows - 1)) / rows
    );
    var blockH = rows * side + gap * (rows - 1);
    var originY = (H - blockH) / 2;
    var blockW = cols * side + gap * (cols - 1);
    var originX = (W - blockW) / 2;
    var y0 = originY + midRowStart * (side + gap);
    var y1 = originY + midRowEnd * (side + gap) + side;
    return { x: originX, y: y0, w: blockW, h: y1 - y0 };
  }

  /* Default middle band for grid mode: one or two EXTRA rows nearest the
     vertical centre of the expanded grid. Returns {start, end}
     ({start: -1, end: -2} when a single photo row leaves no room). */
  function defaultMidRows(N, W, H) {
    var cols = Math.max(1, Math.round(Math.sqrt(N * W / H)));
    var photoRows = Math.ceil(N / cols);
    if (photoRows < 2) return { start: -1, end: -2 };  // no room
    var band = photoRows >= 6 ? 2 : 1;
    var rows = photoRows + band;
    var start = Math.floor((rows - band) / 2);
    return { start: start, end: start + band - 1 };
  }

  /* Wrap + scale text so it fits inside a rectangle (maxW x maxH), with
     at most maxLines lines (default 3). Returns {lines, fontSize} where
     lines is an array of strings. ctx must already have the right font
     family / weight set (the font string is mutated during measurement). */
  function fitText(ctx, text, maxW, maxH, startPx, minPx, fontPrefix, maxLines) {
    // fontPrefix e.g. "700 58px Corbel, sans-serif" -> we rebuild it
    var maxL = maxLines || 3;
    var px = startPx;
    var lines, fits;
    function measure(str, size) {
      ctx.font = fontPrefix.replace(/\d+px/, size + 'px');
      return ctx.measureText(str).width;
    }
    function wrapAt(size) {
      ctx.font = fontPrefix.replace(/\d+px/, size + 'px');
      var words = text.split(/\s+/);
      var out = [], cur = '';
      for (var i = 0; i < words.length; i++) {
        var test = cur ? cur + ' ' + words[i] : words[i];
        if (ctx.measureText(test).width > maxW && cur) {
          out.push(cur);
          cur = words[i];
        } else {
          cur = test;
        }
      }
      if (cur) out.push(cur);
      return out;
    }
    for (px = startPx; px >= minPx; px -= 2) {
      lines = wrapAt(px);
      var lineH = px * 1.25;
      var totalH = lines.length * lineH;
      var maxLineW = 0;
      for (var li = 0; li < lines.length; li++) {
        var lw = measure(lines[li], px);
        if (lw > maxLineW) maxLineW = lw;
      }
      if (maxLineW <= maxW && totalH <= maxH && lines.length <= maxL) { fits = true; break; }
    }
    if (!fits) { px = minPx; lines = wrapAt(px); }
    return { lines: lines, fontSize: px };
  }

  /* Skin-tone centroid heuristic on RGBA pixel data (w x h). Returns
     {fx, fy} normalized focus point, or null if not enough skin found. */
  function skinCentroid(data, w, h) {
    var sx = 0, sy = 0, count = 0, total = w * h;
    for (var y = 0; y < h; y++) {
      for (var x = 0; x < w; x++) {
        var o = (y * w + x) * 4;
        var r = data[o], g = data[o + 1], b = data[o + 2];
        var mx = Math.max(r, g, b), mn = Math.min(r, g, b);
        if (r > 95 && g > 40 && b > 20 && (mx - mn) > 15 && Math.abs(r - g) > 15 && r > g && r > b) {
          // weight upper part of the image more (faces sit high in portraits)
          var wgt = y < h * 0.55 ? 1.6 : 1;
          sx += x * wgt; sy += y * wgt; count += wgt;
        }
      }
    }
    if (count < total * 0.02) return null;
    return { fx: sx / count / w, fy: Math.min(0.62, sy / count / h) };
  }

  /* ======================================================================
     UI
     ====================================================================== */

  function mount(container) {
    var NATIVE_RANDOM = Math.random;
    var uid = 0;

    var state = {
      photos: [],            // {id, name, img, url, mult, jit, fx, fy, zoom}
      seed: 20260821,
      fill: 0.40, variety: 0.30,
      holePct: 0.34,
      showText: true, text: 'YOU are all leaders!', textDirty: false, _appliedSub: '',
      textPx: 58, textColor: '#2E75B6', textFont: 'Corbel',
      borderPct: 0.12, borderColor: '#2E75B6', borderAutoMatch: true, bg: '#FFFFFF',
      dims: '2560x1440',
      layoutStyle: 'bubbles',  // 'bubbles' | 'grid'
      gridCornerRadius: 0,      // px corner radius for squares
      gridGapPx: 4,             // gap between squares in grid mode
      gridShowText: false,      // grid: text gap on by default OFF
      selected: null,           // photo id being edited
      layout: {}                // photo id -> {x,y,r} or {x,y,side} from last render
    };

    container.innerHTML = '' +
      '<div class="app-title"><h2>🖼️🫧 Collage Generator | Cluster Faces</h2>' +
      '<span class="sub">Headshots in → bubble collage out (PNG or editable PowerPoint). Photos never leave this computer.</span></div>' +
      '<div class="app-layout">' +
      '  <div class="sidebar">' +

      '    <details class="step" open id="fc-step1">' +
      '      <summary><span class="n">1</span> Load data <span class="hint" id="fc-count"></span></summary>' +
      '      <div class="body">' +
      '        <div class="dropzone" id="fc-drop"><strong>DROP DATA HERE</strong><ul class="drop-spec"><li><b>Type of file:</b> photos: JPG, PNG or WEBP (multi-select and click-to-choose work; HEIC does not load in browsers)</li><li><b>What you\'re looking for:</b> the class headshots, one image per student</li></ul></div>' +
      '        <input type="file" id="fc-file" accept="image/*" multiple style="display:none">' +
      '        <div id="fc-fileinfo"></div>' +
      '        <div class="clusterblock" id="fc-clusterblock" style="display:none">' +
      '          <div class="clusterlabel">Select cluster(s)</div>' +
      '          <div class="small-note">(not applicable for photo uploads)</div>' +
      '        </div>' +
      '        <div class="row"><button id="fc-sample" class="fixed">🎲 Demo data</button></div>' +
      '      </div>' +
      '    </details>' +

      '    <details class="step" id="fc-photostep" style="display:none" open>' +
      '      <summary><span class="n">2</span> Photos loaded</summary>' +
      '      <div class="body">' +
      '        <div class="row"><button id="fc-clear" class="fixed">Clear all</button></div>' +
      '        <div class="word-list" id="fc-thumbs" style="display:none"></div>' +
      '        <div class="small-note">Click a photo (here or in the preview) to recenter it. Drag inside a bubble on the preview to pan. Select a photo and paste (⌘V) to replace it.</div>' +
      '      </div>' +
      '    </details>' +

      '    <details class="step" id="fc-editstep" style="display:none" open>' +
      '      <summary><span class="n">✎</span> Recenter photo <span class="hint" id="fc-editname"></span></summary>' +
      '      <div class="body">' +
      '        <div class="row">' +
      '          <canvas id="fc-editcanvas" width="180" height="180" class="fixed" style="border-radius:50%;border:1px solid var(--line);cursor:grab"></canvas>' +
      '          <div style="flex:1;display:flex;flex-direction:column;gap:8px">' +
      '            <div class="slider-field"><div class="top">Zoom <output id="fc-ez-o">1.0×</output></div>' +
      '              <input type="range" id="fc-ez" min="1" max="3" step="0.05" value="1"></div>' +
      '            <label class="field">Bubble size' +
      '              <select id="fc-esize"><option value="0.8">Small</option><option value="1" selected>Normal</option>' +
      '              <option value="1.3">Large</option><option value="1.6">Extra large</option></select></label>' +
      '            <div class="row">' +
      '              <button id="fc-eauto" class="fixed">Auto-center</button>' +
      '              <button id="fc-ereset" class="fixed">Reset</button>' +
      '              <button id="fc-eremove" class="fixed">Remove</button>' +
      '            </div>' +
      '          </div>' +
      '        </div>' +
      '        <div class="small-note">Drag the little preview to move the face inside the circle.</div>' +
      '        <div class="small-note">paste (⌘V) to replace this photo</div>' +
      '      </div>' +
      '    </details>' +

      '    <details class="step disabled" open id="fc-step-layout">' +
      '      <summary><span class="n">3</span> Layout style</summary>' +
      '      <div class="body">' +
      '        <label class="field">Style' +
      '          <select id="fc-layoutstyle">' +
      '            <option value="bubbles">Bubbles (classic)</option>' +
      '            <option value="grid">Grid (squares)</option>' +
      '          </select></label>' +
      '        <div id="fc-grid-opts" style="display:none">' +
      '          <div class="slider-field"><div class="top">Corner radius <output id="fc-gcr-o">0px</output></div>' +
      '            <input type="range" id="fc-gcr" min="0" max="80" step="2" value="0"></div>' +
      '        </div>' +
      '      </div>' +
      '    </details>' +

      '    <details class="step disabled" open id="fc-step2">' +
      '      <summary><span class="n">4</span> Middle space & text</summary>' +
      '      <div class="body">' +
      '        <div class="slider-field" id="fc-hole-field"><div class="top">Middle space size <output id="fc-hole-o">34%</output></div>' +
      '          <input type="range" id="fc-hole" min="0" max="80" step="2" value="34"></div>' +
      '        <label class="check"><input type="checkbox" id="fc-showtext" checked> Center text</label>' +
      '        <input type="text" id="fc-text" value="YOU are all leaders!">' +
      '        <div class="row">' +
      '          <div class="slider-field"><div class="top">Text size <output id="fc-tsize-o">58</output></div>' +
      '            <input type="range" id="fc-tsize" min="24" max="140" step="2" value="58"></div>' +
      '          <input type="color" id="fc-tcolor" value="#2E75B6" class="fixed" style="width:42px">' +
      '        </div>' +
      '        <label class="field">Text font' +
      '          <select id="fc-tfont">' +
      '            <option value="Corbel" selected>Corbel</option>' +
      '            <option value="Candara">Candara</option>' +
      '            <option value="Arial">Arial</option>' +
      '            <option value="Georgia">Georgia</option>' +
      '          </select></label>' +
      '      </div>' +
      '    </details>' +

      '    <details class="step disabled" open id="fc-step3">' +
      '      <summary><span class="n">5</span> Bubbles & style</summary>' +
      '      <div class="body">' +
      '        <div id="fc-bubble-opts">' +
      '          <div class="slider-field"><div class="top">Bubble size (density) <output id="fc-fill-o">40%</output></div>' +
      '            <input type="range" id="fc-fill" min="20" max="58" step="2" value="40"></div>' +
      '          <div class="slider-field"><div class="top">Size variety <output id="fc-var-o">30%</output></div>' +
      '            <input type="range" id="fc-var" min="0" max="60" step="5" value="30"></div>' +
      '        </div>' +
      '        <div class="slider-field"><div class="top">Ring thickness <output id="fc-bw-o">12%</output></div>' +
      '          <input type="range" id="fc-bw" min="0" max="25" step="1" value="12"></div>' +
      '        <div class="row">' +
      '          <label class="field">Ring color<input type="color" id="fc-bc" value="#2E75B6"></label>' +
      '          <label class="field">Background<input type="color" id="fc-bg" value="#FFFFFF"></label>' +
      '        </div>' +
      '        <label class="check"><input type="checkbox" id="fc-bc-automatch" checked> Ring color auto-matches text color</label>' +
      '        <label class="field">Image size' +
      '          <select id="fc-dims">' +
      '            <option value="2560x1440">2560 × 1440 (16:9, default)</option>' +
      '            <option value="2054x1164">2054 × 1164 (slide graphic)</option>' +
      '            <option value="1920x1080">1920 × 1080</option>' +
      '            <option value="3200x1800">3200 × 1800</option>' +
      '          </select></label>' +
      '        <div class="row"><button id="fc-autoall" class="fixed">Auto-center all faces</button></div>' +
      '      </div>' +
      '    </details>' +
      '  </div>' +

      '  <div class="preview-panel">' +
      '    <div class="preview-toolbar">' +
      '      <button id="fc-shuffle">⟳ Shuffle layout</button>' +
      '      <button id="fc-png" class="primary" disabled>⬇ PNG</button>' +
      '      <button id="fc-pptx" class="primary" disabled>⬇ PowerPoint</button>' +
      '      <span class="status" id="fc-status"></span>' +
      '    </div>' +
      '    <div class="canvas-holder" id="fc-holder">' +
      '      <div class="empty-msg" id="fc-empty">output displayed HERE</div>' +
      '      <canvas id="fc-canvas" style="display:none"></canvas>' +
      '      <div class="veil">Rendering…</div>' +
      '    </div>' +
      '  </div>' +
      '</div>';

    var $ = function (id) { return container.querySelector('#' + id); };
    var canvas = $('fc-canvas');
    var renderTimer = null;

    function escapeHtml(s) {
      return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    /* ---------- photo management ---------- */

    function addFiles(fileList) {
      var files = Array.prototype.slice.call(fileList).filter(function (f) {
        return /image\//.test(f.type) || /\.(png|jpe?g|webp|gif|bmp)$/i.test(f.name);
      });
      if (!files.length) return;
      var failed = [];
      var jobs = files.map(function (f) {
        return new Promise(function (resolve) {
          var url = URL.createObjectURL(f);
          var img = new Image();
          img.onload = function () {
            var p = {
              id: 'p' + (++uid), name: f.name, img: img, url: url,
              mult: 1, jit: hash01(f.name + f.size), fx: 0.5, fy: 0.44, zoom: 1
            };
            autoCenterPhoto(p).then(function () { resolve(p); });
          };
          img.onerror = function () { failed.push(f.name); URL.revokeObjectURL(url); resolve(null); };
          img.src = url;
        });
      });
      Promise.all(jobs).then(function (res) {
        res.forEach(function (p) { if (p) state.photos.push(p); });
        $('fc-fileinfo').innerHTML = failed.length
          ? '<span class="file-warn">Could not decode: ' + escapeHtml(failed.join(', ')) + '. Convert to JPG/PNG (HEIC is not supported by browsers).</span>'
          : '<span class="file-info">✓ ' + state.photos.length + ' photos loaded</span>';
        afterPhotosChanged();
      });
    }

    function hash01(s) {
      var h = 2166136261;
      for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
      return ((h >>> 0) % 1000) / 1000;
    }

    function afterPhotosChanged() {
      var n = state.photos.length;
      $('fc-count').textContent = n ? (n + ' photos') : '';
      $('fc-photostep').style.display = n ? '' : 'none';
      $('fc-clusterblock').style.display = n ? '' : 'none';
      ['fc-step-layout', 'fc-step2', 'fc-step3'].forEach(function (s) { $(s).classList.remove('disabled'); });
      $('fc-png').disabled = !n;
      $('fc-pptx').disabled = !n;
      renderThumbs();
      scheduleRender(true);
    }

    function renderThumbs() {
      var box = $('fc-thumbs');
      box.style.display = state.photos.length ? '' : 'none';
      box.innerHTML = '';
      state.photos.forEach(function (p) {
        var chip = document.createElement('span');
        chip.className = 'chip';
        chip.style.cursor = 'pointer';
        if (state.selected === p.id) chip.style.borderColor = 'var(--blue)';
        chip.innerHTML = '<img src="' + p.url + '" style="width:22px;height:22px;border-radius:50%;object-fit:cover"> ' +
          escapeHtml(p.name.length > 14 ? p.name.slice(0, 12) + '…' : p.name) +
          '<button title="remove">✕</button>';
        chip.addEventListener('click', function (e) {
          if (e.target.tagName === 'BUTTON') return;
          selectPhoto(p.id);
        });
        chip.querySelector('button').addEventListener('click', function () {
          removePhoto(p.id);
        });
        box.appendChild(chip);
      });
    }

    function removePhoto(id) {
      var p = photoById(id);
      if (p && p.url && p.name.indexOf('sample') !== 0) URL.revokeObjectURL(p.url);
      state.photos = state.photos.filter(function (q) { return q.id !== id; });
      if (state.selected === id) { state.selected = null; $('fc-editstep').style.display = 'none'; }
      afterPhotosChanged();
    }

    function photoById(id) {
      return state.photos.filter(function (p) { return p.id === id; })[0] || null;
    }

    /* ---------- auto face-centering ---------- */

    function autoCenterPhoto(p) {
      // 1) native FaceDetector when the browser has it
      if (typeof window.FaceDetector === 'function') {
        try {
          var fd = new window.FaceDetector({ fastMode: true, maxDetectedFaces: 1 });
          return fd.detect(p.img).then(function (faces) {
            if (faces && faces.length) {
              var b = faces[0].boundingBox;
              p.fx = (b.x + b.width / 2) / p.img.naturalWidth;
              p.fy = (b.y + b.height / 2) / p.img.naturalHeight;
              p.zoom = Math.min(2.4, Math.max(1, Math.min(p.img.naturalWidth, p.img.naturalHeight) / (b.height * 2.6)));
            } else { heuristicCenter(p); }
          }).catch(function () { heuristicCenter(p); });
        } catch (e) { heuristicCenter(p); return Promise.resolve(); }
      }
      heuristicCenter(p);
      return Promise.resolve();
    }

    function heuristicCenter(p) {
      try {
        var s = 48;
        var oc = document.createElement('canvas');
        oc.width = s; oc.height = s;
        var octx = oc.getContext('2d');
        octx.drawImage(p.img, 0, 0, s, s);
        var found = skinCentroid(octx.getImageData(0, 0, s, s).data, s, s);
        if (found) { p.fx = Math.min(0.75, Math.max(0.25, found.fx)); p.fy = Math.min(0.6, Math.max(0.2, found.fy)); }
        else { p.fx = 0.5; p.fy = 0.44; }
      } catch (e) { p.fx = 0.5; p.fy = 0.44; }
    }

    /* ---------- drawing ---------- */

    function faceDrawParams(p, r) {
      var d = 2 * r;
      var iw = p.img.naturalWidth, ih = p.img.naturalHeight;
      var s = d / Math.min(iw, ih) * p.zoom;
      var dw = iw * s, dh = ih * s;
      return { s: s, dw: dw, dh: dh };
    }

    function drawFace(ctx, p, cx, cy, r, ringPx, ringColor) {
      var g = faceDrawParams(p, r);
      var dx = cx - p.fx * g.dw, dy = cy - p.fy * g.dh;
      dx = Math.min(cx - r, Math.max(cx + r - g.dw, dx));
      dy = Math.min(cy - r, Math.max(cy + r - g.dh, dy));
      ctx.save();
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, 2 * Math.PI);
      ctx.closePath();
      ctx.clip();
      ctx.fillStyle = '#EEE';
      ctx.fill();
      ctx.drawImage(p.img, dx, dy, g.dw, g.dh);
      ctx.restore();
      if (ringPx > 0) {
        ctx.beginPath();
        ctx.arc(cx, cy, r + ringPx / 2, 0, 2 * Math.PI);
        ctx.strokeStyle = ringColor;
        ctx.lineWidth = ringPx;
        ctx.stroke();
      }
    }

    /* Draw a photo into a square cell (x,y,side) with optional corner radius.
       ringPx: border width; ringColor: border colour. */
    function drawFaceSquare(ctx, p, x, y, side, ringPx, ringColor, cornerRadius) {
      var half = side / 2;
      var cx = x + half, cy = y + half;
      var r = half;                         // use half-side as "radius" for faceDrawParams
      var g = faceDrawParams(p, r);
      var dx = cx - p.fx * g.dw, dy = cy - p.fy * g.dh;
      dx = Math.min(x, Math.max(x + side - g.dw, dx));
      dy = Math.min(y, Math.max(y + side - g.dh, dy));
      var cr = Math.min(cornerRadius || 0, half);
      ctx.save();
      // clip to rounded rectangle
      ctx.beginPath();
      if (cr > 0 && ctx.roundRect) {
        ctx.roundRect(x, y, side, side, cr);
      } else if (cr > 0) {
        // manual rounded rect for browsers without roundRect
        ctx.moveTo(x + cr, y);
        ctx.lineTo(x + side - cr, y); ctx.arcTo(x + side, y, x + side, y + cr, cr);
        ctx.lineTo(x + side, y + side - cr); ctx.arcTo(x + side, y + side, x + side - cr, y + side, cr);
        ctx.lineTo(x + cr, y + side); ctx.arcTo(x, y + side, x, y + side - cr, cr);
        ctx.lineTo(x, y + cr); ctx.arcTo(x, y, x + cr, y, cr);
        ctx.closePath();
      } else {
        ctx.rect(x, y, side, side);
      }
      ctx.clip();
      ctx.fillStyle = '#EEE';
      ctx.fill();
      ctx.drawImage(p.img, dx, dy, g.dw, g.dh);
      ctx.restore();
      if (ringPx > 0) {
        ctx.save();
        ctx.strokeStyle = ringColor;
        ctx.lineWidth = ringPx;
        ctx.beginPath();
        var inset = ringPx / 2;
        var ix = x + inset, iy = y + inset, is = side - ringPx;
        var icr = Math.max(0, cr - inset);
        if (icr > 0 && ctx.roundRect) {
          ctx.roundRect(ix, iy, is, is, icr);
        } else if (icr > 0) {
          ctx.moveTo(ix + icr, iy);
          ctx.lineTo(ix + is - icr, iy); ctx.arcTo(ix + is, iy, ix + is, iy + icr, icr);
          ctx.lineTo(ix + is, iy + is - icr); ctx.arcTo(ix + is, iy + is, ix + is - icr, iy + is, icr);
          ctx.lineTo(ix + icr, iy + is); ctx.arcTo(ix, iy + is, ix, iy + is - icr, icr);
          ctx.lineTo(ix, iy + icr); ctx.arcTo(ix, iy, ix + icr, iy, icr);
          ctx.closePath();
        } else {
          ctx.rect(ix, iy, is, is);
        }
        ctx.stroke();
        ctx.restore();
      }
    }

    function currentMults() {
      return state.photos.map(function (p) {
        return p.mult * (1 - state.variety / 2 + p.jit * state.variety);
      });
    }

    function keepoutSpec(W, H) {
      if (state.holePct <= 0) return null;
      return { cx: W / 2, cy: H / 2, rx: state.holePct * W / 2, ry: state.holePct * H / 2 };
    }

    function scheduleRender(immediate) {
      clearTimeout(renderTimer);
      renderTimer = setTimeout(render, immediate ? 0 : 150);
    }

    function drawMiddleText(ctx, W, H, textArea) {
      // textArea: {x,y,w,h} or null (use center of canvas with reasonable defaults)
      if (!state.showText || !state.text) return;
      var areaX, areaY, areaW, areaH;
      if (textArea) {
        areaX = textArea.x; areaY = textArea.y; areaW = textArea.w; areaH = textArea.h;
      } else {
        var ko2 = keepoutSpec(W, H) || { cx: W / 2, cy: H / 2, rx: W * 0.2, ry: H * 0.15 };
        areaX = ko2.cx - ko2.rx; areaY = ko2.cy - ko2.ry;
        areaW = 2 * ko2.rx; areaH = 2 * ko2.ry;
      }
      var basePx = Math.round(state.textPx * (W / 2560));
      var minPx = 12;
      var fontPrefix = '700 ' + basePx + 'px ' + state.textFont + ', sans-serif';
      var padding = Math.max(8, areaW * 0.04);
      var maxW = areaW - padding * 2;
      var maxH = areaH - padding * 2;
      if (maxW < 20 || maxH < 20) return;
      var fit = fitText(ctx, state.text, maxW, maxH, basePx, minPx, fontPrefix, 3);
      ctx.fillStyle = state.textColor;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = '700 ' + fit.fontSize + 'px ' + state.textFont + ', sans-serif';
      var lineH = fit.fontSize * 1.25;
      var totalH = fit.lines.length * lineH;
      var startY = areaY + areaH / 2 - totalH / 2 + lineH / 2;
      for (var li = 0; li < fit.lines.length; li++) {
        ctx.fillText(fit.lines[li], areaX + areaW / 2, startY + li * lineH);
      }
    }

    function render() {
      if (!state.photos.length) return;
      var d = state.dims.split('x');
      var W = parseInt(d[0], 10), H = parseInt(d[1], 10);
      canvas.style.display = '';
      $('fc-empty').style.display = 'none';
      canvas.width = W; canvas.height = H;
      var ctx = canvas.getContext('2d');
      ctx.fillStyle = state.bg;
      ctx.fillRect(0, 0, W, H);

      var ringColor = state.borderColor;
      state.layout = {};

      if (state.layoutStyle === 'grid') {
        // --- GRID MODE ---
        var N = state.photos.length;
        var gapPx = state.gridGapPx;
        var midRows = null, gapRect = null;
        if (state.gridShowText && state.showText && state.text) {
          midRows = defaultMidRows(N, W, H);
          if (midRows.start >= 0) {
            gapRect = gridGapRect(N, W, H, gapPx, midRows.start, midRows.end);
          }
        }
        var gridOpts = { gapPx: gapPx };
        if (midRows && midRows.start >= 0) {
          gridOpts.midRowStart = midRows.start;
          gridOpts.midRowEnd   = midRows.end;
        }
        var gridPos = layoutGrid(N, W, H, gridOpts);
        var cr = state.gridCornerRadius;
        state.photos.forEach(function (p, i) {
          var q = gridPos[i];
          if (!q) return;   // null = skipped (mid-gap row)
          state.layout[p.id] = q;
          var ringPx = Math.max(0, state.borderPct * q.side);
          drawFaceSquare(ctx, p, q.x, q.y, q.side, ringPx, ringColor, cr);
          if (state.selected === p.id) {
            ctx.save();
            ctx.strokeStyle = '#F59E0B';
            ctx.lineWidth = 5;
            ctx.setLineDash([14, 10]);
            ctx.strokeRect(q.x - 6, q.y - 6, q.side + 12, q.side + 12);
            ctx.setLineDash([]);
            ctx.restore();
          }
        });
        if (state.gridShowText) {
          drawMiddleText(ctx, W, H, gapRect || null);
        }
      } else {
        // --- BUBBLES MODE ---
        var ko = keepoutSpec(W, H);
        var pos = layoutBubbles(currentMults(), W, H, {
          seed: state.seed, fill: state.fill, keepout: ko
        });
        state.photos.forEach(function (p, i) {
          var q = pos[i];
          state.layout[p.id] = q;
          var ringPx = Math.max(0, state.borderPct * q.r);
          drawFace(ctx, p, q.x, q.y, q.r, ringPx, ringColor);
          if (state.selected === p.id) {
            ctx.beginPath();
            ctx.arc(q.x, q.y, q.r + ringPx + 6, 0, 2 * Math.PI);
            ctx.strokeStyle = '#F59E0B';
            ctx.lineWidth = 5;
            ctx.setLineDash([14, 10]);
            ctx.stroke();
            ctx.setLineDash([]);
          }
        });
        drawMiddleText(ctx, W, H, null);
      }

      $('fc-status').textContent = state.photos.length + ' faces · ' + W + 'x' + H + ' · ' + state.layoutStyle + ' layout';
      drawEditor();
    }

    /* ---------- selection + editor ---------- */

    function selectPhoto(id) {
      state.selected = id;
      var p = photoById(id);
      $('fc-editstep').style.display = p ? '' : 'none';
      if (p) {
        $('fc-editname').textContent = p.name;
        $('fc-ez').value = p.zoom;
        $('fc-ez-o').textContent = p.zoom.toFixed(2).replace(/0$/, '') + 'x';
        $('fc-esize').value = String(p.mult);
        $('fc-editstep').open = true;
      }
      renderThumbs();
      scheduleRender(true);
    }

    // Cmd/Ctrl+V in the edit panel replaces the selected photo
    function onEditPanelPaste(e) {
      var editStep = $('fc-editstep');
      if (!editStep || editStep.style.display === 'none') return;
      if (container.offsetParent === null) return;  // app not visible
      var p = photoById(state.selected);
      if (!p) return;
      var items = (e.clipboardData && e.clipboardData.items) || [];
      var blob = null;
      for (var i = 0; i < items.length; i++) {
        if (items[i].type && items[i].type.indexOf('image/') === 0) {
          blob = items[i].getAsFile();
          break;
        }
      }
      if (!blob) return;
      e.preventDefault();
      var url = URL.createObjectURL(blob);
      var img = new Image();
      img.onload = function () {
        if (p.url && p.name.indexOf('sample') !== 0) URL.revokeObjectURL(p.url);
        p.img = img;
        p.url = URL.createObjectURL(blob);
        p.name = 'pasted-image.png';
        p.fx = 0.5; p.fy = 0.44; p.zoom = 1;
        autoCenterPhoto(p).then(function () {
          URL.revokeObjectURL(url);
          selectPhoto(p.id);
        });
      };
      img.onerror = function () { URL.revokeObjectURL(url); };
      img.src = url;
    }
    document.addEventListener('paste', onEditPanelPaste);

    function drawEditor() {
      var p = photoById(state.selected);
      if (!p) return;
      var ec = $('fc-editcanvas');
      var ctx = ec.getContext('2d');
      ctx.clearRect(0, 0, 180, 180);
      drawFace(ctx, p, 90, 90, 88, 4, state.borderColor);
    }

    // drag-to-pan inside the editor circle
    (function () {
      var dragging = false, lastX = 0, lastY = 0;
      var ec = $('fc-editcanvas');
      ec.addEventListener('mousedown', function (e) { dragging = true; lastX = e.clientX; lastY = e.clientY; });
      window.addEventListener('mousemove', function (e) {
        if (!dragging) return;
        var p = photoById(state.selected);
        if (!p) return;
        var g = faceDrawParams(p, 88);
        p.fx = Math.min(1, Math.max(0, p.fx - (e.clientX - lastX) / g.dw));
        p.fy = Math.min(1, Math.max(0, p.fy - (e.clientY - lastY) / g.dh));
        lastX = e.clientX; lastY = e.clientY;
        drawEditor(); scheduleRender();
      });
      window.addEventListener('mouseup', function () { dragging = false; });
    })();

    // click/drag on the main preview canvas
    (function () {
      var dragging = null, moved = false, lastX = 0, lastY = 0;
      function canvasPoint(e) {
        var rect = canvas.getBoundingClientRect();
        return {
          x: (e.clientX - rect.left) * (canvas.width / rect.width),
          y: (e.clientY - rect.top) * (canvas.height / rect.height)
        };
      }
      function hit(pt) {
        for (var i = state.photos.length - 1; i >= 0; i--) {
          var p = state.photos[i], q = state.layout[p.id];
          if (!q) continue;
          if (q.side !== undefined) {
            // grid mode: rect hit-test
            if (pt.x >= q.x && pt.x <= q.x + q.side && pt.y >= q.y && pt.y <= q.y + q.side) return p;
          } else {
            // bubble mode: circle hit-test
            var dx = pt.x - q.x, dy = pt.y - q.y;
            if (dx * dx + dy * dy <= q.r * q.r) return p;
          }
        }
        return null;
      }
      canvas.addEventListener('mousedown', function (e) {
        var p = hit(canvasPoint(e));
        if (p) { dragging = p; moved = false; lastX = e.clientX; lastY = e.clientY; e.preventDefault(); }
      });
      window.addEventListener('mousemove', function (e) {
        if (!dragging) return;
        var q = state.layout[dragging.id];
        if (!q) return;
        var rect = canvas.getBoundingClientRect();
        var scaleX = canvas.width / rect.width;
        var dxPx = (e.clientX - lastX) * scaleX, dyPx = (e.clientY - lastY) * scaleX;
        if (Math.abs(dxPx) + Math.abs(dyPx) > 2) moved = true;
        var r = q.r !== undefined ? q.r : q.side / 2;
        var g = faceDrawParams(dragging, r);
        dragging.fx = Math.min(1, Math.max(0, dragging.fx - dxPx / g.dw));
        dragging.fy = Math.min(1, Math.max(0, dragging.fy - dyPx / g.dh));
        lastX = e.clientX; lastY = e.clientY;
        scheduleRender();
      });
      window.addEventListener('mouseup', function (e) {
        if (dragging && !moved) selectPhoto(dragging.id);
        dragging = null;
      });
    })();

    /* ---------- sample faces ---------- */

    function makeSampleFaces(n) {
      var skins = ['#F5D0B5', '#EAC086', '#D9A066', '#B08154', '#8C5A33', '#6E4423'];
      var shirts = ['#4472C4', '#70AD47', '#B45309', '#7C3AED', '#0EA5E9', '#DC2626', '#334155', '#0F766E'];
      var bgs = ['#EFF6FF', '#FEF3C7', '#ECFDF5', '#FDF2F8', '#F1F5F9', '#FAF5FF'];
      var hairs = ['#111827', '#3F2305', '#6B7280', '#7C2D12', '#0B0B0B'];
      var jobs = [];
      for (var i = 0; i < n; i++) {
        (function (i) {
          var oc = document.createElement('canvas');
          oc.width = 240; oc.height = 240;
          var c = oc.getContext('2d');
          c.fillStyle = bgs[i % bgs.length]; c.fillRect(0, 0, 240, 240);
          var skin = skins[(i * 7) % skins.length];
          c.fillStyle = hairs[(i * 3) % hairs.length];
          c.beginPath(); c.arc(120, 92, 52, Math.PI, 2 * Math.PI); c.fill();
          c.fillStyle = skin;
          c.beginPath(); c.arc(120, 100, 44, 0, 2 * Math.PI); c.fill();
          c.fillStyle = shirts[(i * 5) % shirts.length];
          c.beginPath(); c.ellipse(120, 218, 66, 52, 0, Math.PI, 2 * Math.PI); c.fill();
          jobs.push(new Promise(function (resolve) {
            var img = new Image();
            img.onload = function () {
              resolve({
                id: 'p' + (++uid), name: 'demo-' + (i + 1) + '.png', img: img, url: oc.toDataURL(),
                mult: 1, jit: ((i * 37) % 100) / 100, fx: 0.5, fy: 0.42, zoom: 1
              });
            };
            img.src = oc.toDataURL();
          }));
        })(i);
      }
      return Promise.all(jobs);
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
        downloadBlob(blob, 'LEADTK_' + (state._code || 'CLG-FAC') + '_' + new Date().toISOString().slice(0, 10) + '.png');
      }, 'image/png');
    }

    function cropSquareBytes(p, r) {
      var side = Math.max(256, Math.min(512, Math.round(2 * r)));
      var oc = document.createElement('canvas');
      oc.width = side; oc.height = side;
      var ctx = oc.getContext('2d');
      var g = faceDrawParams(p, side / 2);
      var dx = side / 2 - p.fx * g.dw, dy = side / 2 - p.fy * g.dh;
      dx = Math.min(0, Math.max(side - g.dw, dx));
      dy = Math.min(0, Math.max(side - g.dh, dy));
      ctx.fillStyle = '#EEE'; ctx.fillRect(0, 0, side, side);
      ctx.drawImage(p.img, dx, dy, g.dw, g.dh);
      return new Promise(function (resolve) {
        oc.toBlob(function (blob) {
          blob.arrayBuffer().then(function (ab) { resolve(new Uint8Array(ab)); });
        }, 'image/png');
      });
    }

    function cropSquareBytesForGrid(p, side) {
      var sz = Math.max(256, Math.min(512, Math.round(side)));
      var oc = document.createElement('canvas');
      oc.width = sz; oc.height = sz;
      var ctx = oc.getContext('2d');
      var g = faceDrawParams(p, sz / 2);
      var cx = sz / 2, cy = sz / 2;
      var dx = cx - p.fx * g.dw, dy = cy - p.fy * g.dh;
      dx = Math.min(0, Math.max(sz - g.dw, dx));
      dy = Math.min(0, Math.max(sz - g.dh, dy));
      ctx.fillStyle = '#EEE'; ctx.fillRect(0, 0, sz, sz);
      ctx.drawImage(p.img, dx, dy, g.dw, g.dh);
      return new Promise(function (resolve) {
        oc.toBlob(function (blob) {
          blob.arrayBuffer().then(function (ab) { resolve(new Uint8Array(ab)); });
        }, 'image/png');
      });
    }

    function exportPptx() {
      if (!window.pptxLite) { alert('pptx-lite failed to load'); return; }
      var d = state.dims.split('x');
      var W = parseInt(d[0], 10), H = parseInt(d[1], 10);
      $('fc-status').textContent = 'Building .pptx...';

      var jobs;
      if (state.layoutStyle === 'grid') {
        jobs = state.photos.map(function (p) {
          var q = state.layout[p.id];
          if (!q) return Promise.resolve(null);
          var ringPx = Math.max(0, state.borderPct * q.side);
          return cropSquareBytesForGrid(p, q.side).then(function (bytes) {
            return {
              bytes: bytes, ext: 'png',
              x: q.x, y: q.y, w: q.side, h: q.side,
              shape: 'rect', borderColor: state.borderColor, borderPx: ringPx,
              name: p.name
            };
          });
        });
      } else {
        jobs = state.photos.map(function (p) {
          var q = state.layout[p.id];
          return cropSquareBytes(p, q.r).then(function (bytes) {
            var ringPx = Math.max(0, state.borderPct * q.r);
            return {
              bytes: bytes, ext: 'png',
              x: q.x - q.r, y: q.y - q.r, w: 2 * q.r, h: 2 * q.r,
              shape: 'ellipse', borderColor: state.borderColor, borderPx: ringPx,
              name: p.name
            };
          });
        });
      }

      Promise.all(jobs).then(function (images) {
        images = images.filter(function (im) { return im !== null; });
        var texts = [];
        var showTxt = state.layoutStyle === 'grid' ? (state.gridShowText && state.showText) : state.showText;
        if (showTxt && state.text) {
          var textArea = null;
          if (state.layoutStyle === 'grid') {
            var midR = defaultMidRows(state.photos.length, W, H);
            if (midR.start >= 0) {
              textArea = gridGapRect(state.photos.length, W, H, state.gridGapPx, midR.start, midR.end);
            }
          }
          if (!textArea) {
            var ko = keepoutSpec(W, H) || { cx: W / 2, cy: H / 2, rx: W * 0.2, ry: H * 0.15 };
            textArea = { x: ko.cx - ko.rx, y: ko.cy - ko.ry / 2, w: 2 * ko.rx, h: ko.ry };
          }
          texts.push({
            text: state.text,
            x: textArea.x, y: textArea.y, w: textArea.w, h: textArea.h,
            fontPx: state.textPx * (W / 2560), color: state.textColor, bold: true, font: state.textFont
          });
        }
        var bytes = window.pptxLite.makePptx({
          canvasW: W, canvasH: H, background: state.bg, images: images, texts: texts
        });
        downloadBlob(new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation' }),
          'LEADTK_' + (state._code || 'CLG-FAC') + '_' + new Date().toISOString().slice(0, 10) + '.pptx');
        $('fc-status').textContent = state.photos.length + ' faces exported to PowerPoint';
      });
    }

    /* ---------- events ---------- */

    var drop = $('fc-drop'), fileInput = $('fc-file');
    drop.addEventListener('click', function () { fileInput.click(); });
    fileInput.addEventListener('change', function () { if (fileInput.files.length) { addFiles(fileInput.files); fileInput.value = ''; } });
    ['dragover', 'dragenter'].forEach(function (ev) {
      drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.add('drag'); });
    });
    ['dragleave', 'drop'].forEach(function (ev) {
      drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.remove('drag'); });
    });
    drop.addEventListener('drop', function (e) { if (e.dataTransfer.files.length) addFiles(e.dataTransfer.files); });

    $('fc-sample').addEventListener('click', function () {
      makeSampleFaces(75).then(function (ps) {
        state.photos = state.photos.concat(ps);
        $('fc-fileinfo').innerHTML = '<span class="file-info">✓ ' + state.photos.length + ' sample faces generated locally</span>';
        afterPhotosChanged();
      });
    });
    $('fc-clear').addEventListener('click', function () {
      state.photos = []; state.selected = null;
      $('fc-editstep').style.display = 'none';
      $('fc-photostep').style.display = 'none';
      $('fc-clusterblock').style.display = 'none';
      $('fc-fileinfo').innerHTML = '';
      $('fc-thumbs').style.display = 'none';
      canvas.style.display = 'none';
      $('fc-empty').style.display = '';
      $('fc-png').disabled = true; $('fc-pptx').disabled = true;
      $('fc-count').textContent = '';
    });

    $('fc-ez').addEventListener('input', function (e) {
      var p = photoById(state.selected);
      if (!p) return;
      p.zoom = parseFloat(e.target.value);
      $('fc-ez-o').textContent = p.zoom.toFixed(2).replace(/0$/, '') + '×';
      drawEditor(); scheduleRender();
    });
    $('fc-esize').addEventListener('change', function (e) {
      var p = photoById(state.selected);
      if (!p) return;
      p.mult = parseFloat(e.target.value);
      scheduleRender();
    });
    $('fc-eauto').addEventListener('click', function () {
      var p = photoById(state.selected);
      if (!p) return;
      autoCenterPhoto(p).then(function () { selectPhoto(p.id); });
    });
    $('fc-ereset').addEventListener('click', function () {
      var p = photoById(state.selected);
      if (!p) return;
      p.fx = 0.5; p.fy = 0.44; p.zoom = 1;
      selectPhoto(p.id);
    });
    $('fc-eremove').addEventListener('click', function () { if (state.selected) removePhoto(state.selected); });

    function bindSlider(id, outId, key, factor, fmt) {
      $(id).addEventListener('input', function (e) {
        state[key] = parseFloat(e.target.value) * factor;
        $(outId).textContent = fmt(e.target.value);
        scheduleRender();
      });
    }
    bindSlider('fc-hole', 'fc-hole-o', 'holePct', 0.01, function (v) { return v + '%'; });
    bindSlider('fc-fill', 'fc-fill-o', 'fill', 0.01, function (v) { return v + '%'; });
    bindSlider('fc-var', 'fc-var-o', 'variety', 0.01, function (v) { return v + '%'; });
    bindSlider('fc-bw', 'fc-bw-o', 'borderPct', 0.01, function (v) { return v + '%'; });
    bindSlider('fc-tsize', 'fc-tsize-o', 'textPx', 1, function (v) { return v; });

    // Layout style switcher
    $('fc-layoutstyle').addEventListener('change', function (e) {
      state.layoutStyle = e.target.value;
      var isGrid = (state.layoutStyle === 'grid');
      $('fc-grid-opts').style.display = isGrid ? '' : 'none';
      $('fc-bubble-opts').style.display = isGrid ? 'none' : '';
      // the middle-space slider only applies to bubbles mode
      $('fc-hole-field').style.display = isGrid ? 'none' : '';
      // grid defaults: text off; bubbles: use current showText state
      if (isGrid) {
        $('fc-showtext').checked = state.gridShowText;
        state.showText = state.gridShowText;
      } else {
        $('fc-showtext').checked = state.showText;
      }
      scheduleRender();
    });
    $('fc-gcr').addEventListener('input', function (e) {
      state.gridCornerRadius = parseFloat(e.target.value);
      $('fc-gcr-o').textContent = e.target.value + 'px';
      scheduleRender();
    });

    $('fc-showtext').addEventListener('change', function (e) {
      state.showText = e.target.checked;
      if (state.layoutStyle === 'grid') state.gridShowText = e.target.checked;
      scheduleRender();
    });
    $('fc-text').addEventListener('input', function (e) { state.text = e.target.value; state.textDirty = true; scheduleRender(); });

    // ring auto-match checkbox
    $('fc-bc-automatch').addEventListener('change', function (e) {
      state.borderAutoMatch = e.target.checked;
      if (state.borderAutoMatch) {
        state.borderColor = state.textColor;
        $('fc-bc').value = state.textColor;
      }
      scheduleRender();
    });

    // class presets via home-screen cards (#/faces vs #/faces/persuasion)

    // one code per persona: retitle the app + code chip when a preset applies
    function setIdentity(name, code) {
      state._code = code;
      var h2 = container.querySelector('.app-title h2');
      if (h2) {
        var k = name.indexOf(' | ');
        var icon = (h2.textContent.split(' ')[0] || '') + ' ';
        h2.innerHTML = k === -1 ? icon + name
          : icon + name.slice(0, k) + '<span class="name-light">' + name.slice(k) + '</span>';
      }
      var chip = container.querySelector('.app-title .app-code');
      if (chip) chip.textContent = 'LEADTK_' + code;
    }

    mountApi.applySub = function (sub) {
      setIdentity(sub === 'persuasion' ? 'Collage Generator | Persuasion' : 'Collage Generator | Cluster Faces',
        sub === 'persuasion' ? 'CLG-PER' : 'CLG-FAC');
      if (sub === state._appliedSub) return;
      state._appliedSub = sub;
      if (state.textDirty) return;       // never clobber a custom text
      state.text = sub === 'persuasion' ? 'Why would anyone listen to these people?' : 'YOU are all leaders!';
      $('fc-text').value = state.text;
      if (state.photos.length) scheduleRender();
    };
    $('fc-tcolor').addEventListener('input', function (e) {
      state.textColor = e.target.value;
      if (state.borderAutoMatch) {
        state.borderColor = state.textColor;
        $('fc-bc').value = state.textColor;
      }
      scheduleRender();
    });
    $('fc-tfont').addEventListener('change', function (e) { state.textFont = e.target.value; scheduleRender(); });
    $('fc-bc').addEventListener('input', function (e) {
      state.borderColor = e.target.value;
      // manually changing ring color turns off auto-match
      if (e.target.value !== state.textColor) {
        state.borderAutoMatch = false;
        $('fc-bc-automatch').checked = false;
      }
      scheduleRender();
    });
    $('fc-bg').addEventListener('input', function (e) { state.bg = e.target.value; scheduleRender(); });
    $('fc-dims').addEventListener('change', function (e) { state.dims = e.target.value; scheduleRender(); });
    $('fc-autoall').addEventListener('click', function () {
      Promise.all(state.photos.map(autoCenterPhoto)).then(function () { scheduleRender(true); });
    });

    $('fc-shuffle').addEventListener('click', function () {
      state.seed = Math.floor(NATIVE_RANDOM() * 2147483647);
      scheduleRender(true);
    });
    $('fc-png').addEventListener('click', exportPng);
    $('fc-pptx').addEventListener('click', exportPptx);
  }

  var mountApi = {};   // bridges registerApp.onRoute to the mounted instance

  /* ======================================================================
     REGISTER / EXPORT
     ====================================================================== */

  if (typeof window !== 'undefined' && window.LeadToolkit) {
    window.LeadToolkit.registerApp({
      id: 'faces',
      icon: '🖼️🫧',
      group: 'Class 1 - Heart of Leadership',
      name: 'Collage Generator | Cluster Faces',
      code: 'CLG-FAC',
      intro: { upload: 'class headshots (JPG/PNG, multi-select)', to: 'build the bubble collage with auto face-centering (PNG or PowerPoint)' },
      tags: ['headshots', 'collage', 'photos', 'bubble', 'faces'],
      description: 'Upload class headshots and build the bubble collage: auto face-centering, drag to recenter, middle text, PNG or editable PowerPoint export.',
      cards: [{
        group: 'Class 3 - Influence and Persuasion',
        name: 'Collage Generator | Persuasion',
        code: 'CLG-PER',
        intro: { upload: 'class headshots (JPG/PNG)', to: 'the same collage with "Why would anyone listen to these people?" in the middle' },
        description: 'The same collage, center text preset to "Why would anyone listen to these people?"',
        sub: 'persuasion'
      }],
      onRoute: function (sub) { if (mountApi.applySub) mountApi.applySub(sub); },
      mount: mount
    });
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
      mulberry32: mulberry32,
      layoutBubbles: layoutBubbles,
      skinCentroid: skinCentroid,
      layoutGrid: layoutGrid,
      gridGapRect: gridGapRect,
      defaultMidRows: defaultMidRows,
      fitText: fitText
    };
  }
})();
