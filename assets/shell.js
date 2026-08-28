/* ==========================================================================
   LEAD Toolkit | shell
   Registers apps, builds the home screen + nav, routes via location.hash.
   Add a new app by dropping a file in apps/ that calls
   LeadToolkit.registerApp({...}) and adding one <script> tag in index.html.
   ========================================================================== */

window.LeadToolkit = (function () {
  'use strict';

  var apps = [];            // registered apps
  var mounted = {};         // appId -> true once its UI has been built

  // Class sections, in display order. Apps declare `group` when registering;
  // unknown group names are appended at the end automatically.
  var GROUPS = [
    'Class 1 - Heart of Leadership',
    'Class 2 - Decision Making',
    'Class 3 - Influence and Persuasion',
    'Class 4 - Collective Intelligence',
    'Class 5 - Culture',
    'Class 6 - Negotiations'
  ];

  // Home-screen placeholders (each shows in its own class section).
  var PLANNED = [];

  var VERSION = '1.27';

  // Home: faculty is the TOP-LEVEL selector (Rebecca by default), then
  // sort by Class or by App type below it.
  var TYPES = ['Plot Generator', 'Wordcloud Generator', 'Group Selector', 'Data Extractor',
    'Collage Generator', 'QR Creator', 'Other'];
  var FACULTY = ['Rebecca Ponce de Leon', 'Modupe Akinola', 'Michael Morris', 'Ashli Carter', 'Adam Galinsky'];
  // Tabs arranged by 'class' (THE default) or 'type'. Fresh storage keys so
  // values saved by the older home-page versions can never leak in.
  var navView = 'class';
  var navFac = 'Rebecca Ponce de Leon';
  try {
    navView = localStorage.getItem('lead-nav-sort') || 'class';
    navFac = localStorage.getItem('lead-nav-fac') || navFac;
  } catch (e) { }
  if (navView !== 'class' && navView !== 'type') navView = 'class';
  if (FACULTY.indexOf(navFac) === -1) navFac = 'Rebecca Ponce de Leon';

  function escapeHtml(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function appTypeOf(a) {
    if (a.appType) return a.appType;
    var head = String(a.name || '').split(' | ')[0].trim();
    return TYPES.indexOf(head) !== -1 ? head : 'Other';
  }

  function facultyOf(a) {
    return a.faculty && a.faculty.length ? a.faculty : ['Rebecca Ponce de Leon'];
  }

  // "Group Selector | VP Roles" -> bold family, light qualifier
  function fmtName(name) {
    var s = String(name || '');
    var k = s.indexOf(' | ');
    if (k === -1) return escapeHtml(s);
    return escapeHtml(s.slice(0, k)) + '<span class="name-light">' + escapeHtml(s.slice(k)) + '</span>';
  }

  // two-line micro-intro: **Upload** … / **To** …
  function introHtml(entry) {
    var intro = entry.intro || entry.app.intro;
    if (!intro) return '<p class="intro">' + escapeHtml(entry.description || '') + '</p>';
    var verb = intro.verb || 'Upload';
    var h = '';
    if (intro.upload) h += '<p class="intro"><b>' + escapeHtml(verb) + '</b> ' + escapeHtml(intro.upload) + '</p>';
    if (intro.to) h += '<p class="intro"><b>To</b> ' + escapeHtml(intro.to) + '</p>';
    return h;
  }

  function registerApp(app) {
    // app: { id, icon, name, tagline, description, mount(containerEl) }
    apps.push(app);
  }

  function el(tag, attrs, html) {
    var e = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) { e.setAttribute(k, attrs[k]); });
    if (html !== undefined) e.innerHTML = html;
    return e;
  }

  function groupOrder(g) {
    var i = GROUPS.indexOf(g || '');
    return i === -1 ? GROUPS.length : i;
  }

  function sortedApps() {
    return apps.slice().sort(function (a, b) {
      return groupOrder(a.group) - groupOrder(b.group);
    });
  }

  // all entries (primary + extra cards) belonging to one class
  function entriesFor(g) {
    var entries = [];
    apps.forEach(function (a) {
      if ((a.group || 'More') === g) {
        entries.push({ app: a, name: a.name, description: a.description, sub: '' });
      }
      (a.cards || []).forEach(function (card) {
        if (card.group === g) {
          entries.push({
            app: a,
            name: card.name || a.name,
            description: card.description || a.description,
            sub: card.sub || '',
            code: card.code || a.code,
            intro: card.intro,
            cardTags: card.tags || []
          });
        }
      });
    });
    return entries;
  }

  function allGroupNames() {
    var names = GROUPS.slice();
    apps.forEach(function (a) {
      var g = a.group || 'More';
      if (names.indexOf(g) === -1) names.push(g);
      (a.cards || []).forEach(function (c) {
        if (names.indexOf(c.group) === -1) names.push(c.group);
      });
    });
    return names;
  }

  // click-to-copy for codes, everywhere they appear; the copied label is
  // CODE_vVERSION_timestamp so pasted references pin the exact build + moment
  function codeLabel(code) {
    var c = String(code || '');
    if (c.indexOf('LEADTK_') !== 0) c = 'LEADTK_' + c;
    var d = new Date();
    var pad = function (n) { return (n < 10 ? '0' : '') + n; };
    return c + '_v' + VERSION + '_' + d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) +
      '_' + pad(d.getHours()) + '.' + pad(d.getMinutes());
  }

  function copyCode(code, el0) {
    var text = codeLabel(code);
    var done = function () {
      if (!el0) return;
      var was = el0.textContent;
      el0.textContent = '✓ copied';
      setTimeout(function () { el0.textContent = was; }, 900);
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done, function () { fallbackCopy(text); done(); });
    } else {
      fallbackCopy(text);
      done();
    }
  }

  function fallbackCopy(text) {
    var ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); } catch (e) { }
    ta.remove();
  }

  function facApps() {
    return apps.filter(function (a) { return facultyOf(a).indexOf(navFac) !== -1; });
  }

  // every clickable entry for the current faculty (cards included)
  function allEntries() {
    var out = [];
    var mine = facApps();
    allGroupNames().forEach(function (g) {
      entriesFor(g).forEach(function (en) {
        if (mine.indexOf(en.app) !== -1) out.push({ entry: en, group: g });
      });
    });
    return out;
  }

  // the tab bubbles: one dropdown per class (or per app type)
  function buildNav() {
    var nav = document.getElementById('topnav');
    nav.innerHTML = '';
    var mine = facApps();

    var defs = [];
    if (navView === 'type') {
      TYPES.forEach(function (t) {
        var entries = mine.filter(function (a) { return appTypeOf(a) === t; })
          .map(function (a) { return { app: a, name: a.name, sub: '' }; });
        if (entries.length) defs.push({ label: t, full: t, entries: entries });
      });
    } else {
      GROUPS.forEach(function (g) {
        var entries = entriesFor(g).filter(function (en) { return mine.indexOf(en.app) !== -1; });
        if (entries.length) defs.push({ label: g.split(' - ')[0], full: g, entries: entries });
      });
    }

    if (!defs.length) {
      nav.appendChild(el('span', { 'class': 'nav-empty' }, 'No apps tagged to ' + escapeHtml(navFac) + ' yet.'));
      return;
    }

    defs.forEach(function (d) {
      var wrap = el('div', { 'class': 'navgroup', 'data-group': d.full });
      var head = el('a', { 'class': 'nav-head', title: d.full }, escapeHtml(d.label) + ' ▾');
      var menu = el('div', { 'class': 'nav-menu' });
      menu.appendChild(el('div', { 'class': 'nav-menu-title' }, escapeHtml(d.full)));
      d.entries.forEach(function (en) {
        var code = en.code || en.app.code || '';
        var a = el('a', {
          href: '#/' + en.app.id + (en.sub ? '/' + en.sub : ''),
          'data-app': en.app.id
        }, en.app.icon + '  <span class="menu-name">' + fmtName(en.name) + '</span>' +
           (code ? '<span class="menu-code" title="click to copy">' + escapeHtml(code) + '</span>' : ''));
        var chip = a.querySelector('.menu-code');
        if (chip) {
          chip.addEventListener('click', function (e) {
            e.preventDefault();
            e.stopPropagation();
            copyCode(code, chip);
          });
        }
        menu.appendChild(a);
      });
      head.addEventListener('click', function (e) {
        e.preventDefault();
        var was = wrap.classList.contains('open');
        Array.prototype.forEach.call(nav.querySelectorAll('.navgroup.open'), function (x) { x.classList.remove('open'); });
        if (!was) wrap.classList.add('open');
      });
      wrap.appendChild(head);
      wrap.appendChild(menu);
      nav.appendChild(wrap);
    });
  }

  // home is deliberately blank: the header is the whole navigation
  function buildHome() {
    document.getElementById('home').innerHTML =
      '<div class="home-blank">Pick a class above, or search.</div>';
  }

  /* ---------- search popover (works from anywhere, no page change) ---------- */

  function hideSearchPop() {
    var pop = document.getElementById('search-pop');
    if (pop) { pop.style.display = 'none'; pop.innerHTML = ''; }
  }

  function showSearchPop(q) {
    var pop = document.getElementById('search-pop');
    if (!pop) return;
    q = String(q || '').trim().toLowerCase();
    if (!q) { hideSearchPop(); return; }
    var hits = [];
    var seen = {};
    allEntries().forEach(function (x) {
      var en = x.entry, a = en.app;
      var intro = en.intro || a.intro || {};
      var hay = (en.name + ' ' + a.name + ' ' + (a.description || '') + ' ' +
        (intro.upload || '') + ' ' + (intro.to || '') + ' ' + x.group + ' ' +
        (en.code || a.code || '') + ' ' + appTypeOf(a) + ' ' +
        (a.tags || []).concat(en.cardTags || []).join(' ')).toLowerCase();
      if (hay.indexOf(q) === -1) return;
      var key = a.id + '/' + (en.sub || '');
      if (seen[key]) return;
      seen[key] = 1;
      hits.push({ en: en, group: x.group });
    });
    if (!hits.length) {
      pop.innerHTML = '<div class="search-none">no matches</div>';
      pop.style.display = 'block';
      return;
    }
    pop.innerHTML = '';
    hits.slice(0, 12).forEach(function (h) {
      var code = h.en.code || h.en.app.code || '';
      var a = el('a', { href: '#/' + h.en.app.id + (h.en.sub ? '/' + h.en.sub : '') },
        h.en.app.icon + '  ' + fmtName(h.en.name) +
        '<span class="search-where">' + escapeHtml(h.group.split(' - ')[0]) +
        (code ? ' · <span class="menu-code" title="click to copy">' + escapeHtml(code) + '</span>' : '') + '</span>');
      var chip = a.querySelector('.menu-code');
      if (chip) {
        chip.addEventListener('click', function (e) {
          e.preventDefault();
          e.stopPropagation();
          copyCode(code, chip);
        });
      }
      a.addEventListener('click', function (e) {
        if (e.target.closest('.menu-code')) return;
        hideSearchPop();
        document.getElementById('hdr-search').value = '';
      });
      pop.appendChild(a);
    });
    pop.style.display = 'block';
  }

  // ---- Head TA gate --------------------------------------------------------
  // The apps listed here open only after the Head TA password. It is the same
  // gate Social Networks has always used, now owned by the shell so there is
  // ONE implementation and ONE password. Unlocking any of them unlocks them
  // all for that page load; reloading the site locks them again.
  var GATE_PASSWORD = 'headta';
  var GATED = ['extractor', 'extractorlgs', 'extractorbta', 'kidney',
    'culture', 'pareto', 'socialnet'];
  var gateOpen = false;

  function checkGatePassword(input) {
    return String(input || '').trim().toLowerCase() === GATE_PASSWORD;
  }

  function isLocked(app) {
    return !!app && GATED.indexOf(app.id) !== -1 && !gateOpen;
  }

  // The lock screen, mounted in place of the app: same markup Social Networks
  // used, so a gated app looks exactly like the gate Dani already knows.
  function renderGate(holder, app) {
    // route() runs again on a faculty or sort change, and a locked app is
    // never marked mounted, so guard against redrawing the lock screen and
    // wiping a password mid-type. Redraw only if it is genuinely gone.
    if (holder._gated && holder.querySelector('.gate-pass')) return;
    holder._gated = true;
    holder.innerHTML = '' +
      '<div class="app-title"><h2>' + escapeHtml(app.icon + ' ' + app.name) + '</h2></div>' +
      '<div style="display:flex;align-items:center;justify-content:center;min-height:50vh">' +
      '  <div style="text-align:center">' +
      '    <div style="font-size:44px;margin-bottom:14px">🔒</div>' +
      '    <div class="row" style="justify-content:center">' +
      '      <input type="password" class="gate-pass" placeholder="password" autocomplete="off" style="max-width:220px">' +
      '      <button class="primary gate-go">Enter</button>' +
      '    </div>' +
      '    <div class="small-note gate-msg" style="min-height:1.4em;margin-top:8px"></div>' +
      '  </div>' +
      '</div>';

    var pass = holder.querySelector('.gate-pass');
    var msg = holder.querySelector('.gate-msg');

    function tryEnter() {
      if (checkGatePassword(pass.value)) {
        gateOpen = true;
        holder.innerHTML = '';
        holder._gated = false;
        route();                       // now mounts the app for real
      } else {
        msg.textContent = 'nope';
        pass.value = '';
        pass.focus();
      }
    }

    holder.querySelector('.gate-go').addEventListener('click', tryEnter);
    pass.addEventListener('keydown', function (e) { if (e.key === 'Enter') tryEnter(); });
    setTimeout(function () { pass.focus(); }, 50);
  }

  function route() {
    var seg = location.hash.replace(/^#\//, '').split('/');
    var id = seg[0];
    var sub = seg[1] || '';
    var target = apps.filter(function (a) { return a.id === id; })[0] || null;

    document.getElementById('home').style.display = target ? 'none' : '';
    apps.forEach(function (a) {
      var holder = document.getElementById('app-' + a.id);
      holder.style.display = (target && target.id === a.id) ? '' : 'none';
    });

    if (target && !mounted[target.id]) {
      var host = document.getElementById('app-' + target.id);
      if (isLocked(target)) {
        renderGate(host, target);
      } else {
        if (host._gated) { host.innerHTML = ''; host._gated = false; }  // clear a lock screen left over from before the unlock
        mounted[target.id] = true;
        target.mount(host);
      }
    }
    if (target) {
      var holder = document.getElementById('app-' + target.id);
      enhanceLayout(holder);
      // the app's LEADTK code, shown next to the title and used in exports
      var titleBox = holder.querySelector('.app-title');
      if (titleBox && target.code && !titleBox.querySelector('.app-code')) {
        var chip = el('span', { 'class': 'app-code', title: 'click to copy' }, 'LEADTK_' + target.code);
        chip.addEventListener('click', function () { copyCode(chip.textContent, chip); });
        titleBox.appendChild(chip);
      }
      // demo + reset live NEXT TO THE TITLE, not inside the apps (the apps'
      // own demo buttons are hidden by CSS and clicked programmatically).
      // A lock screen gets neither: the only thing on it is the lock.
      if (titleBox && !isLocked(target) && !titleBox.querySelector('.title-actions')) {
        var act = el('span', { 'class': 'title-actions' });
        var demoBtn = holder.querySelector(
          'button[id$="-demo"], #wc-sample, #dm-sample, #fc-sample, #co-sample, #gp-sample, #ng-sample, #vp-sample, #pf-example');
        if (demoBtn) {
          var d = el('button', { 'class': 'title-btn', title: 'load demo data' }, '🎲 Demo data');
          d.addEventListener('click', function () {
            demoBtn.click();
            holder.classList.add('demo-on');   // big DEMO watermark on the viewer
          });
          act.appendChild(d);
        }
        var r = el('button', { 'class': 'title-btn', title: 'reset this app' }, '↺ Reset');
        r.addEventListener('click', function () {
          holder.classList.remove('demo-on');
          mounted[target.id] = false;
          holder.innerHTML = '';
          route();
        });
        // loading REAL data clears the DEMO watermark
        if (!holder._demoWatch) {
          holder._demoWatch = true;
          holder.addEventListener('drop', function () { holder.classList.remove('demo-on'); }, true);
          holder.addEventListener('change', function (e) {
            if (e.target && e.target.type === 'file') holder.classList.remove('demo-on');
          }, true);
        }
        act.appendChild(r);
        titleBox.appendChild(act);
      }
      if (typeof target.onRoute === 'function' && !isLocked(target)) target.onRoute(sub);
    }

    // highlight the tab whose menu holds the current app
    Array.prototype.forEach.call(document.querySelectorAll('#topnav .nav-menu a'), function (l) {
      l.classList.toggle('active', !!target && l.getAttribute('data-app') === target.id);
    });
    Array.prototype.forEach.call(document.querySelectorAll('#topnav .navgroup'), function (grp) {
      grp.classList.toggle('active', !!target && !!grp.querySelector('a.active'));
      grp.classList.remove('open');
    });
  }

  // Adds a draggable divider so the sidebar can be widened (persisted).
  // Also formats the app title (bold family, light qualifier) and removes
  // any long subtitle next to it (Dani: keep titles clean).
  function enhanceLayout(holder) {
    var h2 = holder && holder.querySelector('.app-title h2');
    if (h2 && !h2.querySelector('.name-light')) {
      var txt = h2.textContent, k = txt.indexOf(' | ');
      if (k !== -1) {
        h2.innerHTML = escapeHtml(txt.slice(0, k)) + '<span class="name-light">' + escapeHtml(txt.slice(k)) + '</span>';
      }
    }
    var sub = holder && holder.querySelector('.app-title .sub');
    if (sub) sub.remove();

    var layout = holder && holder.querySelector('.app-layout');
    if (!layout || layout.querySelector('.layout-resizer')) return;
    var saved = null;
    try { saved = localStorage.getItem('lead-sidebar-w'); } catch (e) { }
    if (saved) layout.style.setProperty('--sidebar-w', saved + 'px');

    var bar = el('div', { 'class': 'layout-resizer', title: 'Drag to widen the panel' });
    layout.insertBefore(bar, layout.children[1]);

    var dragging = false, startX = 0, startW = 0;
    bar.addEventListener('mousedown', function (e) {
      dragging = true; startX = e.clientX;
      startW = layout.children[0].getBoundingClientRect().width;
      bar.classList.add('dragging');
      document.body.style.userSelect = 'none';
      e.preventDefault();
    });
    window.addEventListener('mousemove', function (e) {
      if (!dragging) return;
      var w = Math.min(780, Math.max(300, startW + (e.clientX - startX)));
      layout.style.setProperty('--sidebar-w', w + 'px');
    });
    window.addEventListener('mouseup', function () {
      if (!dragging) return;
      dragging = false;
      bar.classList.remove('dragging');
      document.body.style.userSelect = '';
      try {
        localStorage.setItem('lead-sidebar-w',
          String(Math.round(layout.children[0].getBoundingClientRect().width)));
      } catch (e) { }
    });
  }

  function init() {
    buildNav();
    buildHome();

    // header: version + last-updated stamp (file mtime when served locally)
    var upd = document.getElementById('lt-updated');
    if (upd) {
      var d = new Date(document.lastModified || Date.now());
      upd.textContent = isNaN(d) ? '' : d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }
    var verEl = document.querySelector('.brand .ver');
    if (verEl) verEl.innerHTML = verEl.innerHTML.replace(/v[\d.]+/, 'v' + VERSION);

    var facSel = document.getElementById('hdr-fac');
    FACULTY.forEach(function (f) { facSel.appendChild(el('option', { value: f }, escapeHtml(f))); });
    facSel.value = navFac;
    facSel.addEventListener('change', function () {
      navFac = facSel.value;
      try { localStorage.setItem('lead-nav-fac', navFac); } catch (e) { }
      buildNav();
      route();
    });

    var sortSel = document.getElementById('hdr-sort');
    [['class', 'Sort by class'], ['type', 'Sort by app type']].forEach(function (o) {
      sortSel.appendChild(el('option', { value: o[0] }, o[1]));
    });
    sortSel.value = navView;
    sortSel.addEventListener('change', function () {
      navView = sortSel.value;
      try { localStorage.setItem('lead-nav-sort', navView); } catch (e) { }
      buildNav();
      route();
    });

    var search = document.getElementById('hdr-search');
    search.addEventListener('input', function (e) { showSearchPop(e.target.value); });
    search.addEventListener('focus', function () { if (search.value) showSearchPop(search.value); });
    search.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') { search.value = ''; hideSearchPop(); }
      if (e.key === 'Enter') {
        var first = document.querySelector('#search-pop a');
        if (first) { location.hash = first.getAttribute('href').slice(1); search.value = ''; hideSearchPop(); }
      }
    });
    document.addEventListener('click', function (e) {
      if (!e.target.closest('.hdr-search-wrap')) hideSearchPop();
      if (!e.target.closest('.navgroup')) {
        Array.prototype.forEach.call(document.querySelectorAll('.navgroup.open'), function (x) { x.classList.remove('open'); });
      }
    });

    // one holder div per app
    var root = document.getElementById('app-root');
    apps.forEach(function (a) {
      root.appendChild(el('div', { id: 'app-' + a.id, style: 'display:none' }));
    });

    window.addEventListener('hashchange', route);
    document.getElementById('brand').addEventListener('click', function () { location.hash = '#/'; });
    route();
  }

  document.addEventListener('DOMContentLoaded', init);

  /* shared download helpers (every chart app offers PNG + PowerPoint) */
  function downloadBlob(blob, fname) {
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = fname;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 5000);
  }

  function downloadCanvasPng(canvas, fname) {
    canvas.toBlob(function (b) { if (b) downloadBlob(b, fname); }, 'image/png');
  }

  // one 16:9 slide with the canvas centered on it, as a real pptx
  function downloadCanvasPptx(canvas, fname) {
    if (!window.pptxLite) return;
    canvas.toBlob(function (b) {
      if (!b) return;
      b.arrayBuffer().then(function (ab) {
        var bytes = window.pptxLite.makePptx({
          canvasW: canvas.width, canvasH: canvas.height, background: '#FFFFFF',
          images: [{ bytes: new Uint8Array(ab), ext: 'png', x: 0, y: 0, w: canvas.width, h: canvas.height, shape: 'rect', name: 'chart' }]
        });
        downloadBlob(new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation' }), fname);
      });
    }, 'image/png');
  }

  return {
    registerApp: registerApp, apps: apps,
    downloadBlob: downloadBlob, downloadCanvasPng: downloadCanvasPng, downloadCanvasPptx: downloadCanvasPptx
  };
})();
