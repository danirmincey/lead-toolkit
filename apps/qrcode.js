/* ==========================================================================
   App | QR Creator (Class 3, but general-purpose)
   Encoding by assets/qr-lite.js (spec-verified, OpenCV-decoded 9/9).
   Defaults per Dani: color #1C7EB5, TRANSPARENT background, square modules,
   rounded eyes, CBS logo at 25% on a rounded white pad. No gradients.
   The CBS logo is EMBEDDED as a data URI | never load a logo via a file://
   <img src>, it taints the canvas and kills PNG/SVG export (learned live).
   Logo replaceable by upload, drag-drop, or ⌘V paste (like Companies).
   PNG (raster) and SVG (true vector) exports.
   ========================================================================== */

(function () {
  'use strict';

  var CBS_LOGO_DATAURL = 'data:image/png;base64,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';

  function mount(container) {
    var state = {
      text: 'https://',
      ec: 'H',
      dark: '#1C7EB5', light: '#FFFFFF', transparent: true,
      shape: 'square',             // square | rounded | dots
      eyeShape: 'rounded',         // square | rounded
      eyeColor: '', eyeMatch: true,
      logo: true, logoPct: 25, padShape: 'rounded',
      quiet: 4, exportPx: 1200
    };

    container.innerHTML = '' +
      '<div class="app-title"><h2>🔳🔗 QR Creator | Any Link</h2>' +
      '<span class="sub">Styled QR codes with the CBS logo in the middle, generated and exported entirely locally.</span></div>' +
      '<div class="app-layout">' +
      '  <div class="sidebar">' +

      '    <details class="step" open>' +
      '      <summary><span class="n">1</span> Content</summary>' +
      '      <div class="body">' +
      '        <label class="field">Link or text' +
      '          <textarea id="qs-text" rows="3" placeholder="https://columbia.qualtrics.com/…">https://</textarea></label>' +
      '        <div class="row"><button id="qs-demo" class="fixed">🎲 Demo data</button></div>' +
      '        <label class="field">Error correction <span class="sub">(H = sturdiest, needed for the logo)</span>' +
      '          <select id="qs-ec"><option>L</option><option>M</option><option>Q</option><option selected>H</option></select></label>' +
      '      </div>' +
      '    </details>' +

      '    <details class="step" open>' +
      '      <summary><span class="n">2</span> Colors & shapes</summary>' +
      '      <div class="body">' +
      '        <div class="row">' +
      '          <label class="field">Color<input type="color" id="qs-dark" value="#1C7EB5"></label>' +
      '          <label class="field">Background<input type="color" id="qs-light" value="#FFFFFF"></label>' +
      '        </div>' +
      '        <label class="check"><input type="checkbox" id="qs-transparent" checked> Transparent background</label>' +
      '        <div class="row">' +
      '          <label class="field">Modules' +
      '            <select id="qs-shape"><option value="square" selected>Squares</option><option value="rounded">Rounded</option><option value="dots">Dots</option></select></label>' +
      '          <label class="field">Eyes' +
      '            <select id="qs-eyeshape"><option value="square">Square</option><option value="rounded" selected>Rounded</option></select></label>' +
      '        </div>' +
      '        <div class="row">' +
      '          <label class="check fixed" style="align-self:end"><input type="checkbox" id="qs-eyematch" checked> Eyes match color</label>' +
      '          <label class="field">Eye color<input type="color" id="qs-eyecolor" value="#1C7EB5" disabled></label>' +
      '        </div>' +
      '      </div>' +
      '    </details>' +

      '    <details class="step" open>' +
      '      <summary><span class="n">3</span> Center logo</summary>' +
      '      <div class="body">' +
      '        <label class="check"><input type="checkbox" id="qs-logo" checked> Logo in the middle (CBS by default)</label>' +
      '        <div class="row">' +
      '          <button id="qs-logoupload" class="fixed">📁 Replace</button>' +
      '          <button id="qs-logoreset" class="fixed">↺ CBS logo</button>' +
      '        </div>' +
      '        <div class="small-note">…or copy any image and press <b>⌘V</b> right here, or drop a file on the preview.</div>' +
      '        <div class="slider-field"><div class="top">Logo size <output id="qs-lp-o">25%</output></div>' +
      '          <input type="range" id="qs-lp" min="12" max="30" step="1" value="25"></div>' +
      '        <label class="field">Logo pad' +
      '          <select id="qs-pad"><option value="rounded" selected>Rounded square</option><option value="circle">Circle</option></select></label>' +
      '        <div class="small-note" id="qs-logonote"></div>' +
      '      </div>' +
      '    </details>' +

      '    <details class="step" open>' +
      '      <summary><span class="n">4</span> Size</summary>' +
      '      <div class="body">' +
      '        <div class="row">' +
      '          <label class="field">Export size (px)' +
      '            <select id="qs-px"><option>800</option><option selected>1200</option><option>2000</option><option>3000</option></select></label>' +
      '          <label class="field">Quiet zone' +
      '            <select id="qs-quiet"><option>2</option><option selected>4</option><option>6</option></select></label>' +
      '        </div>' +
      '      </div>' +
      '    </details>' +
      '  </div>' +

      '  <div class="preview-panel">' +
      '    <div class="preview-toolbar">' +
      '      <button id="qs-png" class="primary" disabled>⬇ PNG</button>' +
      '      <button id="qs-ppt" disabled>⬇ PowerPoint</button>' +
      '      <button id="qs-svg" class="primary" disabled>⬇ SVG (vector)</button>' +
      '      <span class="status" id="qs-status"></span>' +
      '    </div>' +
      '    <div class="canvas-holder" id="qs-holder">' +
      '      <div class="empty-msg" id="qs-empty">output displayed HERE</div>' +
      '      <canvas id="qs-canvas" style="display:none;max-width:560px;margin:0 auto"></canvas>' +
      '    </div>' +
      '    <div class="small-note" id="qs-warn"></div>' +
      '  </div>' +
      '</div>';

    var $ = function (id) { return container.querySelector('#' + id); };
    var canvas = $('qs-canvas');
    var renderTimer = null;
    var logoImg = null;

    function setLogoFromSrc(src, note) {
      var img = new Image();
      img.onload = function () {
        logoImg = img;
        $('qs-logonote').textContent = note || '';
        scheduleRender();
      };
      img.onerror = function () { $('qs-logonote').textContent = 'could not load that image'; };
      img.src = src;
    }
    setLogoFromSrc(CBS_LOGO_DATAURL, '');

    /* ---------- rendering ---------- */

    function luminance(hex) {
      var r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16), b = parseInt(hex.slice(5, 7), 16);
      return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    }

    function inEye(r, c, size) {
      if (r < 7 && c < 7) return 1;
      if (r < 7 && c >= size - 7) return 2;
      if (r >= size - 7 && c < 7) return 3;
      return 0;
    }

    function roundRectPath(ctx, x, y, w, h, rad) {
      ctx.moveTo(x + rad, y);
      ctx.arcTo(x + w, y, x + w, y + h, rad);
      ctx.arcTo(x + w, y + h, x, y + h, rad);
      ctx.arcTo(x, y + h, x, y, rad);
      ctx.arcTo(x, y, x + w, y, rad);
      ctx.closePath();
    }

    function scheduleRender() {
      clearTimeout(renderTimer);
      renderTimer = setTimeout(render, 150);
    }

    function currentEc() {
      var ec = state.ec;
      if (state.logo && logoImg && (ec === 'L' || ec === 'M')) return 'H';
      return ec;
    }

    function render() {
      var text = state.text.trim();
      if (!text || !window.qrLite) {
        canvas.style.display = 'none';
        $('qs-empty').style.display = '';
        $('qs-png').disabled = true; $('qs-svg').disabled = true; $('qs-ppt').disabled = true;
        $('qs-status').textContent = '';
        return;
      }
      var ec = currentEc();
      var q;
      try {
        q = window.qrLite.encode(text, ec);
      } catch (e) {
        canvas.style.display = 'none';
        $('qs-empty').style.display = '';
        $('qs-status').textContent = e.message || String(e);
        $('qs-png').disabled = true; $('qs-svg').disabled = true; $('qs-ppt').disabled = true;
        return;
      }

      var size = q.size, quiet = state.quiet;
      var m = Math.max(4, Math.floor(state.exportPx / (size + 2 * quiet)));
      var W = m * (size + 2 * quiet);
      canvas.width = W; canvas.height = W;
      canvas.style.display = '';
      $('qs-empty').style.display = 'none';
      var ctx = canvas.getContext('2d');

      if (state.transparent) ctx.clearRect(0, 0, W, W);
      else { ctx.fillStyle = state.light; ctx.fillRect(0, 0, W, W); }

      var fill = state.dark;
      var eyeFill = state.eyeMatch ? fill : (state.eyeColor || fill);
      var off = quiet * m;

      ctx.fillStyle = fill;
      ctx.beginPath();
      for (var r = 0; r < size; r++) {
        for (var c = 0; c < size; c++) {
          if (!q.matrix[r][c] || inEye(r, c, size)) continue;
          var x = off + c * m, y = off + r * m;
          if (state.shape === 'dots') {
            ctx.moveTo(x + m / 2 + m * 0.44, y + m / 2);
            ctx.arc(x + m / 2, y + m / 2, m * 0.44, 0, 2 * Math.PI);
          } else if (state.shape === 'rounded') {
            roundRectPath(ctx, x + m * 0.04, y + m * 0.04, m * 0.92, m * 0.92, m * 0.3);
          } else {
            ctx.rect(x, y, m, m);
          }
        }
      }
      ctx.fill();

      function eye(rr, cc) {
        var x = off + cc * m, y = off + rr * m;
        var rad = state.eyeShape === 'rounded' ? m * 2 : 0;
        ctx.fillStyle = eyeFill;
        ctx.beginPath();
        roundRectPath(ctx, x, y, 7 * m, 7 * m, rad);
        roundRectPath(ctx, x + m, y + m, 5 * m, 5 * m, rad * 0.72);
        ctx.fill('evenodd');
        ctx.beginPath();
        roundRectPath(ctx, x + 2 * m, y + 2 * m, 3 * m, 3 * m, state.eyeShape === 'rounded' ? m * 0.9 : 0);
        ctx.fill();
      }
      eye(0, 0); eye(0, size - 7); eye(size - 7, 0);

      if (state.logo && logoImg) {
        var padSize = (size * m) * state.logoPct / 100;
        var cx = W / 2, cy = W / 2;
        ctx.fillStyle = state.light;
        ctx.beginPath();
        if (state.padShape === 'circle') ctx.arc(cx, cy, padSize / 2, 0, 2 * Math.PI);
        else roundRectPath(ctx, cx - padSize / 2, cy - padSize / 2, padSize, padSize, padSize * 0.22);
        ctx.fill();
        var inner = padSize * 0.76;
        var s = Math.min(inner / logoImg.naturalWidth, inner / logoImg.naturalHeight);
        var dw = logoImg.naturalWidth * s, dh = logoImg.naturalHeight * s;
        ctx.drawImage(logoImg, cx - dw / 2, cy - dh / 2, dw, dh);
      }

      $('qs-png').disabled = false;
      $('qs-ppt').disabled = false;
      $('qs-svg').disabled = false;
      $('qs-status').textContent = (ec !== state.ec ? 'EC raised to H for the logo · ' : '') +
        'v' + q.version + ' · ' + size + '×' + size + ' modules · EC ' + q.ecLevel + ' · ' + W + 'px';

      var warns = [];
      var lightLum = state.transparent ? 255 : luminance(state.light);
      if (lightLum - luminance(state.dark) < 80) warns.push('⚠ low contrast (scanners want dark modules on a light background)');
      if (state.logo && state.logoPct > 27) warns.push('⚠ big logo; test-scan before class');
      if (state.transparent) warns.push('transparent: whatever sits behind it becomes the background; keep it light');
      $('qs-warn').textContent = warns.join(' · ');
    }

    /* ---------- SVG export (true vector) ---------- */

    function buildSvg() {
      var q = window.qrLite.encode(state.text.trim(), currentEc());
      var size = q.size, quiet = state.quiet, m = 10;
      var W = m * (size + 2 * quiet), off = quiet * m;
      var fill = state.dark;
      var eyeRef = state.eyeMatch ? fill : (state.eyeColor || fill);
      var body = [];

      function rr(x, y, w, h, rad, f) {
        return '<rect x="' + x + '" y="' + y + '" width="' + w + '" height="' + h + '" rx="' + rad + '" fill="' + f + '"/>';
      }
      function roundRectD(x, y, w, h, rad) {
        if (!rad) return 'M' + x + ' ' + y + 'h' + w + 'v' + h + 'h-' + w + 'z';
        return 'M' + (x + rad) + ' ' + y +
          'h' + (w - 2 * rad) + 'a' + rad + ' ' + rad + ' 0 0 1 ' + rad + ' ' + rad +
          'v' + (h - 2 * rad) + 'a' + rad + ' ' + rad + ' 0 0 1 -' + rad + ' ' + rad +
          'h-' + (w - 2 * rad) + 'a' + rad + ' ' + rad + ' 0 0 1 -' + rad + ' -' + rad +
          'v-' + (h - 2 * rad) + 'a' + rad + ' ' + rad + ' 0 0 1 ' + rad + ' -' + rad + 'z';
      }

      for (var r = 0; r < size; r++) {
        for (var c = 0; c < size; c++) {
          if (!q.matrix[r][c] || inEye(r, c, size)) continue;
          var x = off + c * m, y = off + r * m;
          if (state.shape === 'dots') body.push('<circle cx="' + (x + m / 2) + '" cy="' + (y + m / 2) + '" r="' + m * 0.44 + '" fill="' + fill + '"/>');
          else if (state.shape === 'rounded') body.push(rr(x + 0.4, y + 0.4, m - 0.8, m - 0.8, m * 0.3, fill));
          else body.push(rr(x, y, m, m, 0, fill));
        }
      }
      function eyeSvg(rr0, cc0) {
        var x = off + cc0 * m, y = off + rr0 * m;
        var rad = state.eyeShape === 'rounded' ? m * 2 : 0;
        var radI = state.eyeShape === 'rounded' ? m * 0.9 : 0;
        return '<path fill-rule="evenodd" fill="' + eyeRef + '" d="' +
          roundRectD(x, y, 7 * m, 7 * m, rad) + ' ' + roundRectD(x + m, y + m, 5 * m, 5 * m, rad * 0.72) + '"/>' +
          rr(x + 2 * m, y + 2 * m, 3 * m, 3 * m, radI, eyeRef);
      }

      var logoPart = '';
      if (state.logo && logoImg) {
        var padSize = (size * m) * state.logoPct / 100;
        var cx = W / 2, cy = W / 2;
        var oc = document.createElement('canvas');
        oc.width = logoImg.naturalWidth; oc.height = logoImg.naturalHeight;
        oc.getContext('2d').drawImage(logoImg, 0, 0);
        var dataUrl = oc.toDataURL('image/png');
        var pad = state.padShape === 'circle'
          ? '<circle cx="' + cx + '" cy="' + cy + '" r="' + padSize / 2 + '" fill="' + state.light + '"/>'
          : rr(cx - padSize / 2, cy - padSize / 2, padSize, padSize, padSize * 0.22, state.light);
        var inner = padSize * 0.76;
        var s = Math.min(inner / logoImg.naturalWidth, inner / logoImg.naturalHeight);
        var dw = logoImg.naturalWidth * s, dh = logoImg.naturalHeight * s;
        logoPart = pad + '<image href="' + dataUrl + '" x="' + (cx - dw / 2) + '" y="' + (cy - dh / 2) +
          '" width="' + dw + '" height="' + dh + '"/>';
      }

      return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + W + ' ' + W + '">' +
        (state.transparent ? '' : '<rect width="' + W + '" height="' + W + '" fill="' + state.light + '"/>') +
        body.join('') + eyeSvg(0, 0) + eyeSvg(0, size - 7) + eyeSvg(size - 7, 0) + logoPart +
        '</svg>';
    }

    /* ---------- downloads ---------- */

    function downloadBlob(blob, fname) {
      var a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = fname;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(function () { URL.revokeObjectURL(a.href); }, 5000);
    }

    /* ---------- events ---------- */

    $('qs-text').addEventListener('input', function (e) { state.text = e.target.value; scheduleRender(); });
    $('qs-demo').addEventListener('click', function () {
      var demo = 'https://columbia.qualtrics.com/jfe/form/SV_demoKidney123';
      $('qs-text').value = demo;
      state.text = demo;
      scheduleRender();
    });
    $('qs-ec').addEventListener('change', function (e) { state.ec = e.target.value; scheduleRender(); });
    $('qs-dark').addEventListener('input', function (e) { state.dark = e.target.value; scheduleRender(); });
    $('qs-light').addEventListener('input', function (e) { state.light = e.target.value; scheduleRender(); });
    $('qs-transparent').addEventListener('change', function (e) { state.transparent = e.target.checked; scheduleRender(); });
    $('qs-shape').addEventListener('change', function (e) { state.shape = e.target.value; scheduleRender(); });
    $('qs-eyeshape').addEventListener('change', function (e) { state.eyeShape = e.target.value; scheduleRender(); });
    $('qs-eyematch').addEventListener('change', function (e) {
      state.eyeMatch = e.target.checked;
      $('qs-eyecolor').disabled = state.eyeMatch;
      scheduleRender();
    });
    $('qs-eyecolor').addEventListener('input', function (e) { state.eyeColor = e.target.value; scheduleRender(); });

    $('qs-logo').addEventListener('change', function (e) { state.logo = e.target.checked; scheduleRender(); });
    $('qs-logoupload').addEventListener('click', function () {
      var inp = document.createElement('input');
      inp.type = 'file'; inp.accept = 'image/*';
      inp.addEventListener('change', function () {
        if (inp.files[0]) setLogoFromSrc(URL.createObjectURL(inp.files[0]), '✓ using ' + inp.files[0].name);
      });
      inp.click();
    });
    $('qs-logoreset').addEventListener('click', function () { setLogoFromSrc(CBS_LOGO_DATAURL, ''); });
    $('qs-lp').addEventListener('input', function (e) {
      state.logoPct = +e.target.value;
      $('qs-lp-o').textContent = state.logoPct + '%';
      scheduleRender();
    });
    $('qs-pad').addEventListener('change', function (e) { state.padShape = e.target.value; scheduleRender(); });
    $('qs-px').addEventListener('change', function (e) { state.exportPx = +e.target.value; scheduleRender(); });
    $('qs-quiet').addEventListener('change', function (e) { state.quiet = +e.target.value; scheduleRender(); });

    // ⌘V pastes a logo (like the Companies app); drop a file on the preview too
    document.addEventListener('paste', function (e) {
      if (container.offsetParent === null) return;
      var items = (e.clipboardData && e.clipboardData.items) || [];
      for (var i = 0; i < items.length; i++) {
        if (items[i].type && items[i].type.indexOf('image/') === 0) {
          e.preventDefault();
          setLogoFromSrc(URL.createObjectURL(items[i].getAsFile()), '✓ pasted logo');
          state.logo = true;
          $('qs-logo').checked = true;
          return;
        }
      }
    });
    var holder = $('qs-holder');
    ['dragover', 'dragenter'].forEach(function (ev) {
      holder.addEventListener(ev, function (e) { e.preventDefault(); });
    });
    holder.addEventListener('drop', function (e) {
      e.preventDefault();
      var f = e.dataTransfer.files && e.dataTransfer.files[0];
      if (f && /image\//.test(f.type)) {
        setLogoFromSrc(URL.createObjectURL(f), '✓ using ' + f.name);
        state.logo = true;
        $('qs-logo').checked = true;
      }
    });

    $('qs-png').addEventListener('click', function () {
      try {
        canvas.toBlob(function (blob) {
          if (!blob) { $('qs-status').textContent = 'PNG export failed; try resetting the logo'; return; }
          downloadBlob(blob, 'LEADTK_QRC-ANY_' + new Date().toISOString().slice(0, 10) + '.png');
        }, 'image/png');
      } catch (e) { $('qs-status').textContent = e.message || String(e); }
    });
    $('qs-ppt').addEventListener('click', function () {
      try {
        window.LeadToolkit.downloadCanvasPptx(canvas, 'LEADTK_QRC-ANY_' + new Date().toISOString().slice(0, 10) + '.pptx');
      } catch (e) { $('qs-status').textContent = e.message || String(e); }
    });
    $('qs-svg').addEventListener('click', function () {
      try {
        downloadBlob(new Blob([buildSvg()], { type: 'image/svg+xml' }),
          'LEADTK_QRC-ANY_' + new Date().toISOString().slice(0, 10) + '.svg');
      } catch (e) { $('qs-status').textContent = e.message || String(e); }
    });

    render();
  }

  if (typeof window !== 'undefined' && window.LeadToolkit) {
    window.LeadToolkit.registerApp({
      id: 'qrcode',
      icon: '🔳🔗',
      group: 'Class 3 - Influence and Persuasion',
      name: 'QR Creator | Any Link',
      code: 'QRC-ANY',
      intro: { verb: 'Input', upload: 'a survey link (and optionally your own center logo)', to: 'a styled QR code with the CBS logo (PNG, SVG or PowerPoint)' },
      tags: ['kidney', 'survey link', 'qr code', 'cbs logo', 'grogan air', 'grogan'],
      description: 'Styled QR codes for survey links: CBS blue, transparent, CBS logo in the middle. PNG or true-vector SVG, any size. (Works for any class.)',
      mount: mount
    });
  }
})();
