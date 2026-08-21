/* ==========================================================================
   LEAD Toolkit | feedback widget
   A floating 💬 button (bottom-left, closed by default) that collects
   structured feedback and tabulates it into a shared Google Sheet:

     WRITE  -> a Google Form (CFG.formUrl + CFG.entries), POSTed silently.
               The Form's linked Sheet is the shared, always-online table
               Dani can open, filter and edit like any spreadsheet.
     READ   -> the same Sheet, "published to the web" as CSV (CFG.csvUrl),
               so the widget can SHOW everyone's notes for the current app.
     EDIT   -> identity is the CBS UNI you type (static sites cannot see
               IPs; the UNI is the consistent key). Your claims live in the
               Sheet under your UNI, so ANY device retrieves them by typing
               it; this browser also caches them for convenience. Editing
               submits a new row with the same claimId and rev+1; the Sheet
               keeps history, the widget shows the latest rev per claim.

   Until CFG is filled in (see DEPLOY.md), submissions are saved locally
   and the widget says the shared form is not connected yet; no email.

   The panel also POPS UP each time a ⬇ download button is clicked, with
   the current app's code attached, so "this worked / this is wrong" gets
   captured at the moment of use.
   ========================================================================== */

(function () {
  'use strict';

  /* ------------------- CONFIG (fill in when hosting) ------------------- */
  var CFG = {
    // Google Form "formResponse" URL, e.g.
    // 'https://docs.google.com/forms/d/e/1FAIpQL.../formResponse'
    formUrl: '',
    // entry IDs from the Form's prefilled link, e.g. { name: 'entry.111', ... }
    entries: {
      uni: '', name: '', faculty: '', type: '',
      message: '', appCode: '', version: '', claimId: '', rev: ''
    },
    // The linked Sheet, File > Share > Publish to web > CSV, e.g.
    // 'https://docs.google.com/spreadsheets/d/e/2PACX.../pub?output=csv'
    csvUrl: ''
  };

  var FACULTY = ['Rebecca Ponce de Leon', 'Modupe Akinola', 'Michael Morris', 'Ashli Carter', 'Adam Galinsky'];

  function appName(code) {
    if (code === 'GENERAL') return 'General (whole toolkit)';
    var apps = (window.LeadToolkit && window.LeadToolkit.apps) || [];
    for (var i = 0; i < apps.length; i++) {
      if (apps[i].code === code) return apps[i].name;
      var cards = apps[i].cards || [];
      for (var j = 0; j < cards.length; j++) if (cards[j].code === code) return cards[j].name;
    }
    return 'LEADTK_' + code;
  }
  var TYPES = ['👍 Worked great', '🎯 Adapt for my faculty', '🐛 Bug / wrong output', '🔧 Improvement', '✨ New app idea', '🧩 New functionality', '💬 Other'];

  /* ------------------- local claims (this browser) ------------------- */

  function loadClaims() {
    try { return JSON.parse(localStorage.getItem('lead-fb-claims') || '[]'); } catch (e) { return []; }
  }
  function saveClaims(cs) {
    try { localStorage.setItem('lead-fb-claims', JSON.stringify(cs)); } catch (e) { }
  }
  function remember(k, v) { try { localStorage.setItem('lead-fb-' + k, v); } catch (e) { } }
  function recall(k) { try { return localStorage.getItem('lead-fb-' + k) || ''; } catch (e) { return ''; } }

  function newClaimId() {
    return 'c' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  /* ------------------- context ------------------- */

  function currentCode() {
    var chip = document.querySelector('#app-root > div:not([style*="display:none"], [style*="display: none"]) .app-code');
    // fall back: any visible app holder
    if (!chip) {
      var holders = document.querySelectorAll('#app-root > div');
      for (var i = 0; i < holders.length; i++) {
        if (holders[i].style.display !== 'none') {
          chip = holders[i].querySelector('.app-code');
          break;
        }
      }
    }
    return chip ? chip.textContent.replace(/^LEADTK_/, '').replace('✓ copied', '') : '';
  }

  function version() {
    var m = /v([\d.]+)/.exec((document.querySelector('.brand .ver') || {}).textContent || '');
    return m ? m[1] : '';
  }

  /* ------------------- submission ------------------- */

  function submitRow(row, cb) {
    // row: {name, faculty, type, message, appCode, version, claimId, rev}
    if (!CFG.formUrl) {
      cb(true, 'saved on this device; the shared form is not connected yet');
      return;
    }
    var fd = new FormData();
    Object.keys(CFG.entries).forEach(function (k) {
      if (CFG.entries[k]) fd.append(CFG.entries[k], row[k] === undefined ? '' : String(row[k]));
    });
    fetch(CFG.formUrl, { method: 'POST', mode: 'no-cors', body: fd }).then(function () {
      cb(true, 'sent ✓');
    }, function () {
      cb(false, 'could not send; saved locally');
    });
  }

  /* ------------------- everyone's notes (published CSV) ------------------- */

  function parseCsv(text) {
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
    return rows;
  }

  // ALL sheet rows -> latest rev per claimId, with uni + appCode kept
  function sheetClaims(rows, headers) {
    var col = function (re) { return headers.findIndex(function (h) { return re.test(h); }); };
    var iTime = col(/timestamp/i), iUni = col(/^uni/i), iName = col(/name/i),
        iFac = col(/faculty/i), iType = col(/type/i), iMsg = col(/message/i),
        iApp = col(/app ?code/i), iClaim = col(/claim/i), iRev = col(/rev/i);
    var best = new Map();
    rows.forEach(function (r) {
      var id = iClaim !== -1 ? String(r[iClaim]).trim() : '';
      if (!id) return;
      var rev = iRev !== -1 ? parseInt(r[iRev], 10) || 0 : 0;
      if (!best.has(id) || rev >= best.get(id).rev) {
        best.set(id, {
          claimId: id, rev: rev,
          time: iTime !== -1 ? r[iTime] : '',
          uni: iUni !== -1 ? String(r[iUni]).trim().toLowerCase() : '',
          name: iName !== -1 ? r[iName] : '',
          faculty: iFac !== -1 ? r[iFac] : '',
          type: iType !== -1 ? r[iType] : '',
          message: iMsg !== -1 ? r[iMsg] : '',
          appCode: iApp !== -1 ? String(r[iApp]).trim() : 'GENERAL'
        });
      }
    });
    return Array.from(best.values()).reverse();
  }

  // kept for tests / compatibility: one app's latest claims
  function collapseClaims(rows, headers, appCode) {
    return sheetClaims(rows, headers).filter(function (c) { return c.appCode === appCode; });
  }

  /* ------------------- UI ------------------- */

  function el(tag, cls, html) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html !== undefined) e.innerHTML = html;
    return e;
  }
  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  var editing = null;   // claimId being edited, or null

  function build() {
    var backdrop = el('div', 'fb-backdrop');
    backdrop.style.display = 'none';
    document.body.appendChild(backdrop);

    var pill = el('button', 'fb-pill', '💬 Feedback');
    // the bubble is draggable anywhere; it STARTS bottom-right
    try {
      var saved = JSON.parse(localStorage.getItem('lead-fb-pos') || 'null');
      if (saved && isFinite(saved.x) && isFinite(saved.y)) {
        pill.style.left = Math.min(Math.max(saved.x, 0), window.innerWidth - 60) + 'px';
        pill.style.top = Math.min(Math.max(saved.y, 0), window.innerHeight - 40) + 'px';
        pill.style.right = 'auto';
        pill.style.bottom = 'auto';
      }
    } catch (e) { }

    var panel = el('div', 'fb-panel');
    panel.style.display = 'none';
    panel.innerHTML =
      '<div class="fb-head">💬 Feedback <span class="fb-ctx" id="fb-ctx"></span>' +
      '<button class="fb-x" id="fb-x" title="close">×</button></div>' +
      '<div class="fb-body">' +
      '  <div class="fb-row2">' +
      '    <input type="text" id="fb-uni" placeholder="your UNI (e.g. abc1234)" autocomplete="off">' +
      '    <input type="text" id="fb-name" placeholder="your name">' +
      '  </div>' +
      '  <div class="fb-row2">' +
      '    <select id="fb-fac"><option value="">your faculty…</option>' +
      FACULTY.map(function (f) { return '<option>' + esc(f) + '</option>'; }).join('') +
      '    <option>Other / staff</option></select>' +
      '  </div>' +
      '  <div class="fb-row2">' +
      '    <select id="fb-type">' + TYPES.map(function (t) { return '<option>' + esc(t) + '</option>'; }).join('') + '</select>' +
      '    <select id="fb-scope"></select>' +
      '  </div>' +
      '  <textarea id="fb-msg" rows="3" placeholder="what works, what broke, what to add…"></textarea>' +
      '  <div class="fb-hint" id="fb-hint"></div>' +
      '  <div class="fb-row2">' +
      '    <button id="fb-send" class="fb-send">Send</button>' +
      '    <span class="fb-status" id="fb-status"></span>' +
      '  </div>' +
      '  <div class="fb-lists">' +
      '    <div id="fb-mine"></div>' +
      '    <div id="fb-all"></div>' +
      '  </div>' +
      '</div>';
    document.body.appendChild(pill);
    document.body.appendChild(panel);

    var $ = function (id) { return document.getElementById(id); };

    $('fb-uni').value = recall('uni');
    $('fb-name').value = recall('name');
    $('fb-fac').value = recall('fac') || '';
    $('fb-uni').addEventListener('change', function () {
      remember('uni', $('fb-uni').value.trim().toLowerCase());
      loadSheet(function () { renderMine(); });
    });

    function buildScope(selected) {
      var code = currentCode();
      var opts = [];
      if (code) opts.push(['<option value="', esc(code), '">This app: ', esc(appName(code)), '</option>'].join(''));
      opts.push('<option value="GENERAL">General (whole toolkit)</option>');
      $('fb-scope').innerHTML = opts.join('');
      $('fb-scope').value = selected || code || 'GENERAL';
    }

    function placePanel() {
      var r = pill.getBoundingClientRect();
      var onLeft = r.left + r.width / 2 < window.innerWidth / 2;
      panel.style.left = onLeft ? '16px' : 'auto';
      panel.style.right = onLeft ? 'auto' : '16px';
      var onTop = r.top + r.height / 2 < window.innerHeight / 2;
      panel.style.top = onTop ? (r.bottom + 10) + 'px' : 'auto';
      panel.style.bottom = onTop ? 'auto' : (window.innerHeight - r.top + 10) + 'px';
    }

    var sheet = { at: 0, claims: [] };
    function loadSheet(cb) {
      if (!CFG.csvUrl) { cb(); return; }
      if (Date.now() - sheet.at < 30000) { cb(); return; }
      fetch(CFG.csvUrl).then(function (r) { return r.text(); }).then(function (text) {
        var rows = parseCsv(text);
        if (rows.length > 1) sheet = { at: Date.now(), claims: sheetClaims(rows.slice(1), rows[0]) };
        cb();
      }).catch(function () { cb(); });
    }

    function openPanel(prefillType) {
      placePanel();
      backdrop.style.display = '';
      panel.style.display = '';
      var code = currentCode();
      $('fb-ctx').textContent = code ? 'LEADTK_' + code + '_v' + version() : 'general';
      if (prefillType) $('fb-type').value = prefillType;
      buildScope();
      renderMine();
      renderAll();
      loadSheet(function () { renderMine(); renderAll(); });
    }
    function closePanel() {
      backdrop.style.display = 'none';
      panel.style.display = 'none';
      editing = null;
      $('fb-msg').value = '';
      $('fb-status').textContent = '';
    }

    $('fb-type').addEventListener('change', function () {
      var t = $('fb-type').value;
      $('fb-hint').textContent =
        t === '🎯 Adapt for my faculty' ? 'Say WHICH faculty and what needs to change (defaults, wording, rooms, slides…).'
        : '';
    });

    var drag = null;
    pill.addEventListener('mousedown', function (e) {
      var r = pill.getBoundingClientRect();
      drag = { x: e.clientX, y: e.clientY, left: r.left, top: r.top, moved: false };
      e.preventDefault();
    });
    window.addEventListener('mousemove', function (e) {
      if (!drag) return;
      var dx = e.clientX - drag.x, dy = e.clientY - drag.y;
      if (Math.abs(dx) + Math.abs(dy) > 6) drag.moved = true;
      if (!drag.moved) return;
      pill.style.left = Math.min(Math.max(drag.left + dx, 4), window.innerWidth - 60) + 'px';
      pill.style.top = Math.min(Math.max(drag.top + dy, 4), window.innerHeight - 40) + 'px';
      pill.style.right = 'auto';
      pill.style.bottom = 'auto';
      if (panel.style.display !== 'none') placePanel();
    });
    window.addEventListener('mouseup', function () {
      if (!drag) return;
      if (drag.moved) {
        var r = pill.getBoundingClientRect();
        try { localStorage.setItem('lead-fb-pos', JSON.stringify({ x: r.left, y: r.top })); } catch (e) { }
      } else {
        if (panel.style.display === 'none') openPanel(); else closePanel();
      }
      drag = null;
    });
    backdrop.addEventListener('click', closePanel);
    $('fb-x').addEventListener('click', closePanel);

    /* my claims: everything under MY UNI in the Sheet, merged with this
       browser's cache (higher rev wins), grouped by app name + General */
    var editable = {};   // claimId -> claim object shown in the list
    function renderMine() {
      var code = currentCode();
      var box = $('fb-mine');
      var uni = $('fb-uni').value.trim().toLowerCase();
      var byId = new Map();
      sheet.claims.forEach(function (c) { if (uni && c.uni === uni) byId.set(c.claimId, c); });
      loadClaims().forEach(function (c) {
        var prev = byId.get(c.claimId);
        if (!prev || (c.rev || 0) >= prev.rev) byId.set(c.claimId, c);
      });
      var mine = Array.from(byId.values());
      editable = {};
      mine.forEach(function (c) { editable[c.claimId] = c; });
      if (!mine.length) { box.innerHTML = ''; return; }
      var groups = new Map();
      mine.forEach(function (c) {
        var k = c.appCode || 'GENERAL';
        if (!groups.has(k)) groups.set(k, []);
        groups.get(k).push(c);
      });
      // current app first, General last, the rest alphabetically between
      var keys = Array.from(groups.keys()).sort(function (a, b) {
        if (a === code) return -1;
        if (b === code) return 1;
        if (a === 'GENERAL') return 1;
        if (b === 'GENERAL') return -1;
        return a.localeCompare(b);
      });
      var h = '';
      keys.forEach(function (k) {
        h += '<div class="fb-listtitle">Your notes · ' + esc(appName(k)) + '</div>';
        groups.get(k).forEach(function (c) {
          h += '<div class="fb-item"><span class="fb-itemtype">' + esc(c.type) + '</span> ' +
            esc(c.message).slice(0, 120) +
            ' <a href="#" data-edit="' + esc(c.claimId) + '">✏ edit</a></div>';
        });
      });
      box.innerHTML = h;
      Array.prototype.forEach.call(box.querySelectorAll('a[data-edit]'), function (a) {
        a.addEventListener('click', function (e) {
          e.preventDefault();
          var c = editable[a.getAttribute('data-edit')];
          if (!c) return;
          editing = c.claimId;
          $('fb-type').value = c.type;
          $('fb-msg').value = c.message;
          buildScope(c.appCode || 'GENERAL');
          $('fb-status').textContent = 'editing an earlier note; Send saves a new revision';
        });
      });
    }

    /* everyone's notes: this app first, then General (from the cached sheet) */
    function renderAll() {
      var box = $('fb-all');
      box.innerHTML = '';
      var code = currentCode();
      var h = '';
      var buckets = code ? [code, 'GENERAL'] : ['GENERAL'];
      buckets.forEach(function (k) {
        var claims = sheet.claims.filter(function (c) { return c.appCode === k; });
        if (!claims.length) return;
        h += '<div class="fb-listtitle">Everyone’s notes · ' + esc(appName(k)) + '</div>';
        claims.slice(0, 8).forEach(function (c) {
          h += '<div class="fb-item"><span class="fb-itemtype">' + esc(c.type) + '</span> ' +
            esc(c.message).slice(0, 140) + ' <span class="fb-who">' + esc(c.uni || c.name) + '</span></div>';
        });
      });
      box.innerHTML = h;
    }

    $('fb-send').addEventListener('click', function () {
      var uni = $('fb-uni').value.trim().toLowerCase();
      var name = $('fb-name').value.trim();
      var msg = $('fb-msg').value.trim();
      if (!uni) { $('fb-status').textContent = 'add your UNI first (it is how you retrieve and edit your notes)'; return; }
      if (!msg) { $('fb-status').textContent = 'write a note first'; return; }
      remember('uni', uni);
      remember('name', name);
      remember('fac', $('fb-fac').value);
      var scope = $('fb-scope').value || 'GENERAL';
      var claims = loadClaims();
      var row;
      if (editing) {
        var c = claims.filter(function (x) { return x.claimId === editing; })[0];
        if (!c) {                    // claim came from the Sheet (another device)
          c = editable[editing] || { claimId: editing, rev: 0 };
          claims.push(c);
        }
        c.type = $('fb-type').value;
        c.message = msg;
        c.appCode = scope;
        c.rev = (c.rev || 0) + 1;
        c.uni = uni;
        c.name = name;
        c.faculty = $('fb-fac').value;
        row = c;
      } else {
        row = {
          claimId: newClaimId(), rev: 0,
          uni: uni, name: name, faculty: $('fb-fac').value,
          type: $('fb-type').value,
          message: msg, appCode: scope, version: version()
        };
        claims.push(row);
      }
      saveClaims(claims);
      row.version = version();
      $('fb-status').textContent = 'sending…';
      submitRow(row, function (ok, note) {
        $('fb-status').textContent = note;
        editing = null;
        $('fb-msg').value = '';
        renderMine();
        sheet.at = 0;
        setTimeout(function () { loadSheet(function () { renderMine(); renderAll(); }); }, 1500);
      });
    });

    /* ---- supervision disclaimer: gates EVERY ⬇ / 📋 button ---- */
    var modal = el('div', 'fb-modal');
    modal.style.display = 'none';
    modal.innerHTML =
      '<div class="fb-modal-card">' +
      '  <h3>⚠️ Check before you use this</h3>' +
      '  <p>This toolkit is IN DEVELOPMENT and everything it produces needs close' +
      '  supervision. We work hard to make TA life easier, but mistakes are entirely' +
      '  possible. Proceed only if you have reviewed this output yourself and accept' +
      '  that it may contain errors.</p>' +
      '  <p><b>And please leave feedback every time you use something.</b> It is' +
      '  critical while we develop and update the toolkit for future runs. Thank you!</p>' +
      '  <div class="fb-modal-btns">' +
      '    <button id="fb-cancel">Cancel</button>' +
      '    <button id="fb-proceed" class="fb-send">I checked it, proceed</button>' +
      '  </div>' +
      '</div>';
    document.body.appendChild(modal);
    var pendingBtn = null;
    modal.querySelector('#fb-cancel').addEventListener('click', function () {
      modal.style.display = 'none';
      pendingBtn = null;
    });
    modal.querySelector('#fb-proceed').addEventListener('click', function () {
      modal.style.display = 'none';
      var b = pendingBtn;
      pendingBtn = null;
      if (b) {
        b._leadOk = true;
        b.click();
        setTimeout(function () { openPanel('👍 Worked great'); }, 700);
      }
    });

    document.addEventListener('click', function (e) {
      var b = e.target.closest('button');
      if (!b || panel.contains(b) || modal.contains(b)) return;
      var t = b.textContent.trim();
      if (t.indexOf('⬇') !== 0 && t.indexOf('📋') !== 0) return;
      if (b._leadOk) { b._leadOk = false; return; }   // approved re-click passes
      e.preventDefault();
      e.stopPropagation();
      pendingBtn = b;
      modal.style.display = '';
    }, true);
  }

  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', build);
    else build();
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { parseCsv: parseCsv, collapseClaims: collapseClaims, sheetClaims: sheetClaims, CFG: CFG };
  }
})();
