/* ==========================================================================
   App | QR: Stanley & Burke (Class 6 - Negotiations)
   Two survey links in, two QR codes out, side by side like the class slide:
   black modules, square eyes, and a solid square pad in the middle reading
   "Scan Here for STANLEY" (black pad) / "Scan Here for BURKE" (blue pad).
   Everything is editable but the defaults ARE the slide. Error correction
   H so the pad never breaks scanning. PNG (both, or each) + PowerPoint.
   ========================================================================== */

(function () {
  'use strict';

  /* ---------- pure logic (exported for tests) ---------- */

  // geometry for one QR tile: module grid + centered text pad, in pixels
  function tileLayout(size, tilePx, quietModules, padFrac) {
    var mod = tilePx / (size + 2 * quietModules);
    var padPx = Math.round(tilePx * padFrac);
    var padXY = Math.round((tilePx - padPx) / 2);
    return { mod: mod, quiet: quietModules * mod, padPx: padPx, padXY: padXY };
  }

  // which modules survive under the pad (true = drawn)
  function moduleVisible(r, c, size, layout) {
    var x0 = layout.quiet + c * layout.mod, y0 = layout.quiet + r * layout.mod;
    var x1 = x0 + layout.mod, y1 = y0 + layout.mod;
    var p0 = layout.padXY, p1 = layout.padXY + layout.padPx;
    return !(x0 >= p0 && x1 <= p1 && y0 >= p0 && y1 <= p1);
  }

  /* ---------- UI ---------- */

  function mount(container) {
    var state = {
      left:  { text: '', label: 'STANLEY', pad: '#000000' },
      right: { text: '', label: 'BURKE',  pad: '#2E75B6' },
      heading: 'Scan Here for',
      padFrac: 0.30
    };

    container.innerHTML = '' +
      '<div class="app-title"><h2>🔳🤝 QR Creator | Stanley & Burke</h2>' +
      '<span class="sub">Paste the two survey links; the two slide-style QR codes render side by side with "Scan Here for …" pads.</span></div>' +
      '<div class="app-layout">' +
      '  <div class="sidebar">' +

      '    <details class="step" open>' +
      '      <summary><span class="n">1</span> Stanley</summary>' +
      '      <div class="body">' +
      '        <label class="field">Link / text<input type="text" id="sb-ltext" placeholder="https://…"></label>' +
      '        <div class="row">' +
      '          <label class="field">Label<input type="text" id="sb-llabel" value="STANLEY"></label>' +
      '          <label class="field">Pad<input type="color" id="sb-lpad" value="#000000"></label>' +
      '        </div>' +
      '      </div>' +
      '    </details>' +

      '    <details class="step" open>' +
      '      <summary><span class="n">2</span> Burke</summary>' +
      '      <div class="body">' +
      '        <label class="field">Link / text<input type="text" id="sb-rtext" placeholder="https://…"></label>' +
      '        <div class="row">' +
      '          <label class="field">Label<input type="text" id="sb-rlabel" value="BURKE"></label>' +
      '          <label class="field">Pad<input type="color" id="sb-rpad" value="#2E75B6"></label>' +
      '        </div>' +
      '      </div>' +
      '    </details>' +

      '    <details class="step">' +
      '      <summary><span class="n">3</span> Style</summary>' +
      '      <div class="body">' +
      '        <div class="row"><button id="sb-demo" class="fixed">🎲 Demo data</button></div>' +
      '        <label class="field">Pad heading<input type="text" id="sb-heading" value="Scan Here for"></label>' +
      '        <div class="slider-field"><div class="top">Pad size <output id="sb-pf-o">30%</output></div>' +
      '          <input type="range" id="sb-pf" min="20" max="36" step="1" value="30"></div>' +
      '        <div class="small-note">Error correction is pinned to H, so the pad is safe at these sizes. Phone-test before class anyway.</div>' +
      '      </div>' +
      '    </details>' +
      '  </div>' +

      '  <div class="preview-panel">' +
      '    <div class="preview-toolbar">' +
      '      <button id="sb-png" class="primary" disabled>⬇ PNG (both)</button>' +
      '      <button id="sb-lpng" disabled>⬇ Stanley</button>' +
      '      <button id="sb-rpng" disabled>⬇ Burke</button>' +
      '      <button id="sb-ppt" disabled>⬇ PowerPoint</button>' +
      '      <span class="status" id="sb-status"></span>' +
      '    </div>' +
      '    <div class="canvas-holder" style="background:#fff">' +
      '      <div class="empty-msg" id="sb-empty">output displayed HERE</div>' +
      '      <canvas id="sb-canvas" style="display:none"></canvas>' +
      '    </div>' +
      '  </div>' +
      '</div>';

    var $ = function (id) { return container.querySelector('#' + id); };
    var canvas = $('sb-canvas');
    var renderTimer = null;
    var TILE = 1200, GAP = 140, QUIET = 3;

    function drawTile(ctx, x0, spec) {
      if (!spec.text.trim()) return false;
      var qr;
      try { qr = window.qrLite.encode(spec.text.trim(), 'H'); }
      catch (e) { $('sb-status').textContent = e.message || String(e); return false; }
      var lay = tileLayout(qr.size, TILE, QUIET, state.padFrac);

      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(x0, 0, TILE, TILE);
      ctx.fillStyle = '#000000';
      for (var r = 0; r < qr.size; r++) {
        for (var c = 0; c < qr.size; c++) {
          if (!qr.matrix[r][c]) continue;
          if (!moduleVisible(r, c, qr.size, lay)) continue;
          var px = x0 + lay.quiet + c * lay.mod, py = lay.quiet + r * lay.mod;
          ctx.fillRect(Math.floor(px), Math.floor(py), Math.ceil(lay.mod), Math.ceil(lay.mod));
        }
      }
      // the text pad
      ctx.fillStyle = spec.pad;
      ctx.fillRect(x0 + lay.padXY, lay.padXY, lay.padPx, lay.padPx);
      ctx.fillStyle = '#FFFFFF';
      ctx.textAlign = 'center';
      var cx = x0 + TILE / 2, cy = TILE / 2;
      var headPx = Math.round(lay.padPx * 0.135);
      var namePx = Math.round(lay.padPx * 0.19);
      ctx.font = headPx + 'px Corbel, Candara, "Gill Sans", sans-serif';
      ctx.textBaseline = 'alphabetic';
      ctx.fillText(state.heading, cx, cy - namePx * 0.35);
      ctx.font = 'bold ' + namePx + 'px Corbel, Candara, "Gill Sans", sans-serif';
      ctx.fillText(spec.label, cx, cy + namePx * 0.75);
      return true;
    }

    function scheduleRender() {
      clearTimeout(renderTimer);
      renderTimer = setTimeout(render, 200);
    }

    function render() {
      var any = state.left.text.trim() || state.right.text.trim();
      if (!any) return;
      canvas.width = TILE * 2 + GAP;
      canvas.height = TILE;
      canvas.style.display = '';
      $('sb-empty').style.display = 'none';
      var ctx = canvas.getContext('2d');
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      $('sb-status').textContent = '';
      var okL = drawTile(ctx, 0, state.left);
      var okR = drawTile(ctx, TILE + GAP, state.right);
      $('sb-png').disabled = !(okL || okR);
      $('sb-ppt').disabled = !(okL || okR);
      $('sb-lpng').disabled = !okL;
      $('sb-rpng').disabled = !okR;
      if (!$('sb-status').textContent) {
        $('sb-status').textContent = (okL ? '✓ ' + state.left.label + ' ' : '') + (okR ? '✓ ' + state.right.label : '');
      }
    }

    function tileCanvas(which) {
      var t = document.createElement('canvas');
      t.width = TILE; t.height = TILE;
      var ctx = t.getContext('2d');
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, TILE, TILE);
      drawTile(ctx, 0, state[which]);
      return t;
    }

    ['ltext', 'llabel', 'rtext', 'rlabel', 'heading'].forEach(function (k) {
      $('sb-' + k).addEventListener('input', function (e) {
        if (k === 'heading') state.heading = e.target.value;
        else {
          var side = k[0] === 'l' ? 'left' : 'right';
          state[side][k.slice(1) === 'text' ? 'text' : 'label'] = e.target.value;
        }
        scheduleRender();
      });
    });
    $('sb-lpad').addEventListener('input', function (e) { state.left.pad = e.target.value; scheduleRender(); });
    $('sb-rpad').addEventListener('input', function (e) { state.right.pad = e.target.value; scheduleRender(); });
    $('sb-pf').addEventListener('input', function (e) {
      state.padFrac = parseInt(e.target.value, 10) / 100;
      $('sb-pf-o').textContent = e.target.value + '%';
      scheduleRender();
    });

    $('sb-demo').addEventListener('click', function () {
      var l = 'https://columbia.qualtrics.com/jfe/form/SV_demoStanley123';
      var r = 'https://columbia.qualtrics.com/jfe/form/SV_demoBurke456';
      $('sb-ltext').value = l; state.left.text = l;
      $('sb-rtext').value = r; state.right.text = r;
      scheduleRender();
    });

    var stamp = function () { return new Date().toISOString().slice(0, 10); };
    $('sb-png').addEventListener('click', function () {
      window.LeadToolkit.downloadCanvasPng(canvas, 'LEADTK_QRC-SBK_' + stamp() + '.png');
    });
    $('sb-lpng').addEventListener('click', function () {
      window.LeadToolkit.downloadCanvasPng(tileCanvas('left'), 'LEADTK_QRC-SBK_' + state.left.label.toLowerCase() + '_' + stamp() + '.png');
    });
    $('sb-rpng').addEventListener('click', function () {
      window.LeadToolkit.downloadCanvasPng(tileCanvas('right'), 'LEADTK_QRC-SBK_' + state.right.label.toLowerCase() + '_' + stamp() + '.png');
    });
    $('sb-ppt').addEventListener('click', function () {
      window.LeadToolkit.downloadCanvasPptx(canvas, 'LEADTK_QRC-SBK_' + stamp() + '.pptx');
    });
  }

  if (typeof window !== 'undefined' && window.LeadToolkit) {
    window.LeadToolkit.registerApp({
      id: 'stanleyburke',
      icon: '🔳🤝',
      group: 'Class 6 - Negotiations',
      name: 'QR Creator | Stanley & Burke',
      code: 'QRC-SBK',
      intro: { verb: 'Input', upload: 'the two survey links', to: 'the two slide-style QR codes with "Scan Here for" pads (PNG or PowerPoint)' },
      tags: ['qr', 'stanley', 'burke', 'scan here', 'negotiations', 'links'],
      description: 'Two links in, two QR codes out, side by side like the slide: black modules with "Scan Here for STANLEY" (black pad) and "Scan Here for BURKE" (blue pad). PNG each or both, plus a PowerPoint slide.',
      mount: mount
    });
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { tileLayout: tileLayout, moduleVisible: moduleVisible };
  }
})();
