/* ==========================================================================
   App 5 | Groups (Class 2 - Decision Making)
   Allot students into numbered groups across classrooms and export the
   seating slide as a NATIVE, fully editable PowerPoint table (like the
   "Kravis 680 / classroom" slide).
   Flow: load names (roster file or typed) → define classrooms and how many
   groups fit in each → pick an allotment rule (random / alphabetical /
   spread a column / keep a column together) → adjust by hand (click a name,
   click its new group; ✕ sends it to the unassigned pool) → download .pptx.
   Everything is local; nothing is uploaded.
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

  function seededShuffle(arr, seed) {
    var rnd = mulberry32(seed), a = arr.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(rnd() * (i + 1));
      var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }

  // balanced sizes: e.g. 27 people / 8 groups -> [4,4,4,3,3,3,3,3]
  function groupSizes(n, g) {
    var base = Math.floor(n / g), rem = n % g, out = [];
    for (var i = 0; i < g; i++) out.push(base + (i < rem ? 1 : 0));
    return out;
  }

  function lastNameKey(name) {
    var parts = String(name).trim().split(/\s+/);
    return (parts[parts.length - 1] || '').toLowerCase() + ' ' + String(name).toLowerCase();
  }

  /* Allot people (array of {name, key}) into g groups.
     mode: 'random' | 'alpha' | 'spread' | 'together'.
     Returns an array of g arrays of indices into `people`. */
  function allot(people, g, mode, seed) {
    var n = people.length;
    if (!g || g < 1) g = 1;
    var sizes = groupSizes(n, g);
    var idx = people.map(function (p, i) { return i; });

    if (mode === 'alpha') {
      idx.sort(function (a, b) { return lastNameKey(people[a].name).localeCompare(lastNameKey(people[b].name)); });
    } else if (mode === 'together' || mode === 'spread') {
      var jitter = {};
      seededShuffle(idx, seed).forEach(function (v, i) { jitter[v] = i; });
      idx.sort(function (a, b) {
        var ka = String(people[a].key || ''), kb = String(people[b].key || '');
        return ka.localeCompare(kb) || (jitter[a] - jitter[b]);
      });
    } else {
      idx = seededShuffle(idx, seed);
    }

    var groups = [];
    for (var i = 0; i < g; i++) groups.push([]);

    if (mode === 'spread') {
      // deal round-robin so equal key-values land in different groups
      var gi = 0;
      idx.forEach(function (person) {
        var guard = 0;
        while (groups[gi % g].length >= sizes[gi % g] && guard++ <= g) gi++;
        groups[gi % g].push(person);
        gi++;
      });
    } else {
      var at = 0;
      for (var k = 0; k < g; k++) {
        groups[k] = idx.slice(at, at + sizes[k]);
        at += sizes[k];
      }
    }
    return groups;
  }

  // expand rooms [{name, count}] -> per-group room index [0,0,0,1,1,…]
  function roomOfGroups(rooms) {
    var out = [];
    rooms.forEach(function (r, ri) {
      for (var i = 0; i < (r.count || 0); i++) out.push(ri);
    });
    return out;
  }

  /* how many groups an "auto" room takes: make as many teams of `target`
     as possible (extras become target+1), minus the fixed rooms' groups */
  function autoGroupsFor(nPeople, target, fixedSum) {
    var ideal = Math.max(1, Math.floor(nPeople / Math.max(1, target)));
    return Math.max(1, ideal - fixedSum);
  }

  // resolve auto rooms to concrete counts (only the first auto room flexes)
  function resolveRooms(rooms, nPeople, target) {
    var fixed = 0, firstAuto = -1;
    rooms.forEach(function (r, i) {
      if (r.auto && firstAuto === -1) firstAuto = i;
      else fixed += (r.count || 0);
    });
    return rooms.map(function (r, i) {
      if (i === firstAuto) return { name: r.name, count: autoGroupsFor(nPeople, target, fixed), auto: true };
      return { name: r.name, count: r.count || 0, auto: false };
    });
  }

  var ROOM_COLORS = ['#2E75B6', '#BF8F00', '#548235', '#C55A11', '#C00000', '#7030A0', '#0E7490', '#4D7C0F'];
  function roomColor(name, idx) {
    if (/class\s*room/i.test(name)) return '#1F3864';
    return ROOM_COLORS[idx % ROOM_COLORS.length];
  }

  /* ======================================================================
     UI
     ====================================================================== */

  function mount(container) {
    var NATIVE_RANDOM = Math.random;
    var uid = 0;

    // Class 2 default: 4 breakouts ×3 groups + ALT ×9 + MAIN auto-sized so
    // the class splits into as many teams of 3 as possible (extras → 4s)
    function class2Rooms() {
      return [
        { name: 'Kravis A [replace]', count: 3 }, { name: 'Kravis B [replace]', count: 3 },
        { name: 'Kravis C [replace]', count: 3 }, { name: 'Kravis D [replace]', count: 3 },
        { name: 'Kravis ALT [replace]', count: 9 },
        { name: 'Classroom', count: 0, auto: true }
      ];
    }
    // Class 3 (Influence), per Dani: 8 groups of ~9-10 people | three in the
    // main classroom, three in the alt classroom, one in each of two breakouts
    function class3Rooms() {
      return [
        { name: 'Classroom', count: 3 },
        { name: 'Kravis ALT [replace]', count: 3 },
        { name: 'Kravis A [replace]', count: 1 },
        { name: 'Kravis B [replace]', count: 1 }
      ];
    }

    var state = {
      headers: [], rows: [], fileName: null, _sheets: null,
      nameCol: -1, nameCol2: -1, keyCol: -1,
      filterCol: -1, includeValues: null,
      people: [],            // {id, name, key}
      rooms: class2Rooms(),
      teamTarget: 3,
      _appliedSub: '', _roomsTouched: false,
      mode: 'random', seed: 20260821,
      assignments: [],       // array per group of person ids
      pool: [],              // person ids not in any group
      selectedPerson: null,
      cols: 5, textScale: 1,
      headFill: '#C9CDEA', bodyFill: '#E9EAF6', borderColor: '#7E88C6'
    };

    container.innerHTML = '' +
      '<div class="app-title"><h2>👥🎲 Group Selector | Decision Making</h2>' +
      '<span class="sub">Names in → classroom groups out, as a real editable PowerPoint table. Nothing is uploaded.</span></div>' +
      '<div class="app-layout">' +
      '  <div class="sidebar">' +

      '    <details class="step" open id="gp-step1">' +
      '      <summary><span class="n">1</span> Load data <span class="hint" id="gp-count"></span></summary>' +
      '      <div class="body">' +
      '        <div class="dropzone" id="gp-drop"><strong>DROP DATA HERE</strong><ul class="drop-spec"><li><b>Type of file:</b> CSV or Excel (.xlsx)</li><li><b>What you\'re looking for:</b> any sheet with a name column (the roster works); or skip the file and type names below</li></ul></div>' +
      '        <input type="file" id="gp-file" accept=".csv,.tsv,.txt,.xlsx,.xlsm,.xltx" style="display:none">' +
      '        <div id="gp-fileinfo"></div>' +
      '        <label class="field" id="gp-sheetrow" style="display:none">Sheet<select id="gp-sheet"></select></label>' +
      '        <div id="gp-cols" style="display:none">' +
      '          <div class="row">' +
      '            <label class="field">Name column<select id="gp-namecol"></select></label>' +
      '            <label class="field">+ second <span class="sub">(e.g. Last)</span><select id="gp-namecol2"></select></label>' +
      '          </div>' +
      '          <label class="field">Filter people <span class="sub">(optional, e.g. clusters)</span><select id="gp-filtercol"></select></label>' +
      '          <div id="gp-filtervals"></div>' +
      '        </div>' +
      '        <div class="row">' +
      '          <input type="text" id="gp-addname" placeholder="add a name by hand…">' +
      '          <button id="gp-addbtn" class="fixed">＋ Add</button>' +
      '        </div>' +
      '        <div class="row"><button id="gp-sample" class="fixed">🎲 Demo data</button>' +
      '        <button id="gp-clear" class="fixed">Clear</button></div>' +
      '        <div class="word-list" id="gp-people" style="display:none"></div>' +
      '      </div>' +
      '    </details>' +

      '    <details class="step disabled" open id="gp-step2">' +
      '      <summary><span class="n">2</span> Classrooms <span class="hint" id="gp-roomhint"></span></summary>' +
      '      <div class="body">' +
      '        <div class="small-note">Which rooms, and how many groups fit in each. Tick <b>auto</b> on one room and it absorbs however many groups the class size needs. (Editing this re-deals the groups.)</div>' +
      '        <div id="gp-rooms"></div>' +
      '        <div class="row">' +
      '          <button id="gp-addroom" class="fixed">＋ Add classroom</button>' +
      '          <label class="field fixed" style="width:150px">Auto room: teams of' +
      '            <input type="number" id="gp-target" min="2" max="20" value="3" title="extras become teams of one more"></label>' +
      '        </div>' +
      '      </div>' +
      '    </details>' +

      '    <details class="step disabled" open id="gp-step3">' +
      '      <summary><span class="n">3</span> Allotment</summary>' +
      '      <div class="body">' +
      '        <label class="field">Rule' +
      '          <select id="gp-mode">' +
      '            <option value="random">Shuffle randomly</option>' +
      '            <option value="alpha">Alphabetical (by last name)</option>' +
      '            <option value="spread">Spread a column across groups (mix)</option>' +
      '            <option value="together">Keep same column together</option>' +
      '          </select></label>' +
      '        <label class="field" id="gp-keyrow" style="display:none">Column' +
      '          <select id="gp-keycol"></select></label>' +
      '        <div class="small-note" id="gp-sizenote"></div>' +
      '        <div class="small-note">To adjust by hand: click a name, then click its new group. ✕ sends a name to the unassigned pool.</div>' +
      '      </div>' +
      '    </details>' +

      '    <details class="step disabled" open id="gp-step4">' +
      '      <summary><span class="n">4</span> Look</summary>' +
      '      <div class="body">' +
      '        <div class="row">' +
      '          <label class="field">Columns per row' +
      '            <select id="gp-colsper"><option>4</option><option selected>5</option><option>6</option></select></label>' +
      '          <div class="slider-field"><div class="top">Text size <output id="gp-ts-o">1.0×</output></div>' +
      '            <input type="range" id="gp-ts" min="0.7" max="1.5" step="0.05" value="1"></div>' +
      '        </div>' +
      '        <div class="row">' +
      '          <label class="field">Header fill<input type="color" id="gp-headfill" value="#C9CDEA"></label>' +
      '          <label class="field">Cell fill<input type="color" id="gp-bodyfill" value="#E9EAF6"></label>' +
      '          <label class="field">Borders<input type="color" id="gp-bordercol" value="#7E88C6"></label>' +
      '        </div>' +
      '      </div>' +
      '    </details>' +
      '  </div>' +

      '  <div class="preview-panel">' +
      '    <div class="preview-toolbar">' +
      '      <button id="gp-shuffle">⟳ Re-deal</button>' +
      '      <button id="gp-pptx" class="primary" disabled>⬇ PowerPoint</button>' +
      '      <span class="status" id="gp-status"></span>' +
      '    </div>' +
      '    <div class="grp-wrap" id="gp-holder">' +
      '      <div class="empty-msg" id="gp-empty">output displayed HERE</div>' +
      '      <div id="gp-table"></div>' +
      '      <div class="grp-pool" id="gp-pool" style="display:none"></div>' +
      '    </div>' +
      '  </div>' +
      '</div>';

    var $ = function (id) { return container.querySelector(('#') + id); };

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
            $('gp-sheet').innerHTML = sheets.map(function (s, i) {
              return '<option value="' + i + '">' + escapeHtml(s.name) + '</option>';
            }).join('');
            $('gp-sheetrow').style.display = sheets.length > 1 ? '' : 'none';
            useSheet(0);
          });
        }
        $('gp-sheetrow').style.display = 'none';
        var text = new TextDecoder(sniffEncoding(buf)).decode(buf);
        loadRows(parseCSVText(text), file.name);
      }).catch(function (err) {
        $('gp-fileinfo').innerHTML = '<span class="file-warn">Could not read file: ' + (err.message || err) + '</span>';
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
        $('gp-fileinfo').innerHTML = '<span class="file-warn">That file has no data rows.</span>';
        return;
      }
      state.headers = dedupeHeaders(raw[0]);
      state.rows = raw.slice(1);
      state.filterCol = -1; state.includeValues = null;

      $('gp-fileinfo').innerHTML = '<span class="file-info">✓ ' + escapeHtml(name) + ' · ' + state.rows.length + ' rows</span>';
      $('gp-cols').style.display = '';

      var first = state.headers.findIndex(function (h) { return /first/i.test(h); });
      var last = state.headers.findIndex(function (h) { return /last/i.test(h); });
      var full = state.headers.findIndex(function (h) { return /name/i.test(h); });
      if (first !== -1 && last !== -1) { state.nameCol = first; state.nameCol2 = last; }
      else { state.nameCol = full !== -1 ? full : 0; state.nameCol2 = -1; }
      state.filterCol = state.headers.findIndex(function (h) { return /cluster/i.test(h); });
      state.keyCol = state.headers.findIndex(function (h) { return /gender|section|country|industry/i.test(h); });

      var opts = state.headers.map(function (h, i2) { return '<option value="' + i2 + '">' + escapeHtml(h) + '</option>'; }).join('');
      $('gp-namecol').innerHTML = opts;
      $('gp-namecol2').innerHTML = '<option value="-1">- none -</option>' + opts;
      $('gp-keycol').innerHTML = opts;
      $('gp-filtercol').innerHTML = '<option value="-1">- no filter -</option>' + opts;
      $('gp-namecol').value = String(state.nameCol);
      $('gp-namecol2').value = String(state.nameCol2);
      if (state.keyCol >= 0) $('gp-keycol').value = String(state.keyCol);
      $('gp-filtercol').value = String(state.filterCol);
      buildFilterValues();
      rebuildPeopleFromRows();
    }

    function buildFilterValues() {
      var box = $('gp-filtervals');
      box.innerHTML = '';
      if (state.filterCol < 0 || !state.rows.length) { return; }
      var uniq = new Map();
      state.rows.forEach(function (r) {
        var v = String(r[state.filterCol] === undefined ? '' : r[state.filterCol]).trim();
        uniq.set(v, (uniq.get(v) || 0) + 1);
      });
      if (uniq.size > 40) { box.innerHTML = '<div class="small-note">⚠ too many values in that column.</div>'; state.includeValues = null; return; }
      if (state.includeValues === null) state.includeValues = new Set(uniq.keys());
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
          rebuildPeopleFromRows();
        });
        list.appendChild(lab);
      });
      box.appendChild(list);
    }

    function includedRows() {
      if (state.filterCol < 0 || state.includeValues === null) return state.rows;
      return state.rows.filter(function (r) {
        var v = String(r[state.filterCol] === undefined ? '' : r[state.filterCol]).trim();
        return state.includeValues.has(v);
      });
    }

    function rebuildPeopleFromRows() {
      var manual = state.people.filter(function (p) { return p.manual; });
      state.people = includedRows().map(function (r) {
        var n1 = String(r[state.nameCol] === undefined ? '' : r[state.nameCol]).trim();
        var n2 = state.nameCol2 >= 0 ? String(r[state.nameCol2] === undefined ? '' : r[state.nameCol2]).trim() : '';
        var name = (n1 + ' ' + n2).trim();
        var key = state.keyCol >= 0 ? String(r[state.keyCol] === undefined ? '' : r[state.keyCol]).trim() : '';
        return name ? { id: 'p' + (++uid), name: name, key: key, manual: false } : null;
      }).filter(Boolean).concat(manual);
      afterPeopleChanged();
    }

    /* ---------- people list ---------- */

    function afterPeopleChanged() {
      $('gp-count').textContent = state.people.length ? state.people.length + ' people' : '';
      ['gp-step2', 'gp-step3', 'gp-step4'].forEach(function (s) { $(s).classList.remove('disabled'); });
      $('gp-pptx').disabled = !state.people.length;
      renderPeopleChips();
      renderRooms();          // auto room count depends on the class size
      reallot();
    }

    function renderPeopleChips() {
      var box = $('gp-people');
      box.style.display = state.people.length ? '' : 'none';
      box.innerHTML = '';
      state.people.forEach(function (p) {
        var chip = document.createElement('span');
        chip.className = 'chip';
        chip.innerHTML = escapeHtml(p.name) + '<button title="remove entirely">✕</button>';
        chip.querySelector('button').addEventListener('click', function () {
          state.people = state.people.filter(function (q) { return q.id !== p.id; });
          afterPeopleChanged();
        });
        box.appendChild(chip);
      });
    }

    /* ---------- rooms editor ---------- */

    function resolvedRooms() {
      return resolveRooms(state.rooms, state.people.length, state.teamTarget);
    }

    function renderRooms() {
      var box = $('gp-rooms');
      box.innerHTML = '';
      var resolved = resolvedRooms();
      state.rooms.forEach(function (r, i) {
        var row = document.createElement('div');
        row.className = 'row';
        row.style.marginBottom = '6px';
        row.innerHTML = '<input type="text" value="' + escapeHtml(r.name) + '" placeholder="room name">' +
          '<input type="number" class="fixed" style="width:64px" min="1" max="40" ' +
          (r.auto ? 'disabled value="' + resolved[i].count + '" title="auto-computed from class size"' :
            'value="' + r.count + '" title="groups in this room"') + '>' +
          '<label class="check fixed" title="this room absorbs the remaining groups"><input type="checkbox" ' +
          (r.auto ? 'checked' : '') + '> auto</label>' +
          '<button class="fixed" title="remove room">✕</button>';
        var inputs = row.querySelectorAll('input');
        inputs[0].addEventListener('change', function (e) {
          r.name = e.target.value.trim() || 'room';
          state._roomsTouched = true;
          reallot();
        });
        inputs[1].addEventListener('change', function (e) {
          r.count = Math.max(1, +e.target.value || 1);
          state._roomsTouched = true;
          reallot();
        });
        inputs[2].addEventListener('change', function (e) {
          if (e.target.checked) state.rooms.forEach(function (q) { q.auto = false; });
          r.auto = e.target.checked;
          state._roomsTouched = true;
          renderRooms(); reallot();
        });
        row.querySelector('button').addEventListener('click', function () {
          if (state.rooms.length <= 1) return;
          state.rooms.splice(i, 1);
          state._roomsTouched = true;
          renderRooms(); reallot();
        });
        box.appendChild(row);
      });
      var total = resolved.reduce(function (s, r) { return s + r.count; }, 0);
      $('gp-roomhint').textContent = total + ' groups';
    }

    /* ---------- allotment ---------- */

    function totalGroups() {
      return resolvedRooms().reduce(function (s, r) { return s + (r.count || 0); }, 0);
    }

    function reallot() {
      var g = totalGroups();
      if (!state.people.length || !g) {
        state.assignments = []; state.pool = state.people.map(function (p) { return p.id; });
        renderTable(); return;
      }
      var groups = allot(state.people, g, state.mode, state.seed);
      state.assignments = groups.map(function (grp) {
        return grp.map(function (i) { return state.people[i].id; });
      });
      state.pool = [];
      state.selectedPerson = null;
      renderTable();
    }

    function personById(id) {
      return state.people.filter(function (p) { return p.id === id; })[0] || null;
    }

    function movePerson(id, targetGroup) {   // targetGroup -1 = pool
      state.assignments = state.assignments.map(function (grp) {
        return grp.filter(function (x) { return x !== id; });
      });
      state.pool = state.pool.filter(function (x) { return x !== id; });
      if (targetGroup === -1) state.pool.push(id);
      else state.assignments[targetGroup].push(id);
      state.selectedPerson = null;
      renderTable();
    }

    /* ---------- preview table ---------- */

    function renderTable() {
      var g = totalGroups();
      var holder = $('gp-table');
      var rooms = resolvedRooms();
      var roomIdx = roomOfGroups(rooms);
      $('gp-empty').style.display = state.people.length && g ? 'none' : '';
      if (!state.people.length || !g) { holder.innerHTML = ''; $('gp-pool').style.display = 'none'; return; }

      holder.style.setProperty('--grp-head', state.headFill);
      holder.style.setProperty('--grp-body', state.bodyFill);
      holder.style.setProperty('--grp-border', state.borderColor);

      var fs = Math.round(13 * state.textScale);
      var html = '<table class="grp" style="font-size:' + fs + 'px">';
      for (var band = 0; band < Math.ceil(g / state.cols); band++) {
        var from = band * state.cols, to = Math.min(g, from + state.cols);
        html += '<tr>';
        for (var i = from; i < to; i++) {
          html += '<td class="grp-num' + (state.selectedPerson ? ' movable' : '') + '" data-g="' + i + '">' + (i + 1) + '</td>';
        }
        for (var pad = to; pad < from + state.cols; pad++) html += '<td style="border:none;background:none"></td>';
        html += '</tr><tr>';
        for (var i2 = from; i2 < to; i2++) {
          var ids = state.assignments[i2] || [];
          var room = rooms[roomIdx[i2]];
          html += '<td class="grp-cell' + (state.selectedPerson ? ' movable' : '') + '" data-g="' + i2 + '">';
          if (!ids.length) html += '<span class="small-note">-</span>';
          ids.forEach(function (id) {
            var p = personById(id);
            if (!p) return;
            html += '<div><span class="grp-name' + (state.selectedPerson === id ? ' sel' : '') + '" data-p="' + id + '">' +
              escapeHtml(p.name) + '<button data-x="' + id + '" title="send to unassigned">✕</button></span></div>';
          });
          html += '<div class="grp-room" style="color:' + roomColor(room.name, roomIdx[i2]) + '">(' + escapeHtml(room.name) + ')</div>';
          html += '</td>';
        }
        for (var pad2 = to; pad2 < from + state.cols; pad2++) html += '<td style="border:none;background:none"></td>';
        html += '</tr>';
      }
      html += '</table>';
      holder.innerHTML = html;

      // wiring: chips select / drag / remove; cells receive clicks AND drops
      Array.prototype.forEach.call(holder.querySelectorAll('.grp-name'), function (el) {
        el.addEventListener('click', function (e) {
          if (e.target.tagName === 'BUTTON') return;
          var id = el.getAttribute('data-p');
          state.selectedPerson = state.selectedPerson === id ? null : id;
          renderTable();
        });
        el.setAttribute('draggable', 'true');
        el.addEventListener('dragstart', function (e) {
          e.dataTransfer.setData('text/plain', el.getAttribute('data-p'));
          e.dataTransfer.effectAllowed = 'move';
        });
      });
      Array.prototype.forEach.call(holder.querySelectorAll('[data-x]'), function (el) {
        el.addEventListener('click', function () { movePerson(el.getAttribute('data-x'), -1); });
      });
      Array.prototype.forEach.call(holder.querySelectorAll('[data-g]'), function (el) {
        el.addEventListener('click', function (e) {
          if (e.target.closest('.grp-name')) return;
          if (state.selectedPerson) movePerson(state.selectedPerson, +el.getAttribute('data-g'));
        });
        el.addEventListener('dragover', function (e) {
          e.preventDefault();
          e.dataTransfer.dropEffect = 'move';
          el.style.outline = '2px solid var(--blue)';
        });
        el.addEventListener('dragleave', function () { el.style.outline = ''; });
        el.addEventListener('drop', function (e) {
          e.preventDefault();
          el.style.outline = '';
          var id = e.dataTransfer.getData('text/plain');
          if (id) movePerson(id, +el.getAttribute('data-g'));
        });
      });

      // unassigned pool
      var pool = $('gp-pool');
      if (state.pool.length) {
        pool.style.display = '';
        pool.innerHTML = '<b>Unassigned:</b> ';
        state.pool.forEach(function (id) {
          var p = personById(id);
          if (!p) return;
          var chip = document.createElement('span');
          chip.className = 'grp-name' + (state.selectedPerson === id ? ' sel' : '');
          chip.textContent = p.name;
          chip.addEventListener('click', function () {
            state.selectedPerson = state.selectedPerson === id ? null : id;
            renderTable();
          });
          pool.appendChild(chip);
        });
        pool.appendChild(Object.assign(document.createElement('span'),
          { className: 'small-note', textContent: ' | click a name, then click a group' }));
      } else {
        pool.style.display = 'none';
      }

      var sizes = state.assignments.map(function (a) { return a.length; });
      $('gp-sizenote').textContent = state.people.length + ' people → ' + g + ' groups of ' +
        (sizes.length ? Math.min.apply(null, sizes) + '–' + Math.max.apply(null, sizes) : '?') + '.';
      $('gp-status').textContent = state.people.length + ' people · ' + g + ' groups · ' +
        rooms.map(function (r) { return r.name + ' ×' + r.count + (r.auto ? ' (auto)' : ''); }).join(', ');
    }

    /* ---------- PPTX export ---------- */

    function exportPptx() {
      if (!window.pptxLite || !state.assignments.length) return;
      var g = totalGroups();
      var rooms = resolvedRooms();
      var roomIdx = roomOfGroups(rooms);
      var CW = 2560, CH = 1440;
      var margin = 70;
      var cols = state.cols;
      var colW = (CW - 2 * margin) / cols;
      var nameSize = 24 * state.textScale;
      var numSize = 26 * state.textScale;
      var lineH = nameSize * 1.5;

      var rows = [];
      for (var band = 0; band < Math.ceil(g / cols); band++) {
        var from = band * cols, to = Math.min(g, from + cols);
        var numCells = [], memCells = [], maxLines = 1;
        for (var i = from; i < from + cols; i++) {
          if (i < to) {
            numCells.push({
              fill: state.headFill,
              paras: [{ runs: [{ text: String(i + 1), color: '#000000' }], sizePx: numSize, align: 'ctr' }]
            });
            var ids = state.assignments[i] || [];
            var room = rooms[roomIdx[i]];
            var paras = ids.map(function (id) {
              var p = personById(id);
              return { runs: [{ text: p ? p.name : '', color: '#000000' }], sizePx: nameSize, align: 'ctr' };
            });
            paras.push({
              runs: [{ text: '(' + room.name + ')', bold: true, color: roomColor(room.name, roomIdx[i]) }],
              sizePx: nameSize, align: 'ctr'
            });
            maxLines = Math.max(maxLines, paras.length);
            memCells.push({ fill: state.bodyFill, paras: paras });
          } else {
            numCells.push({ fill: '#FFFFFF', paras: [] });
            memCells.push({ fill: '#FFFFFF', paras: [] });
          }
        }
        rows.push({ h: numSize * 2.0, cells: numCells });
        rows.push({ h: maxLines * lineH + 26, cells: memCells });
      }

      var bytes = window.pptxLite.makePptx({
        canvasW: CW, canvasH: CH, background: '#FFFFFF',
        tables: [{
          x: margin, y: margin,
          colWidths: Array.apply(null, Array(cols)).map(function () { return colW; }),
          border: { color: state.borderColor, w: 2.5 },
          font: 'Arial',
          rows: rows
        }]
      });
      var blob = new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation' });
      var a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'LEADTK_' + (state._code || 'GSL-DMK') + '_' + new Date().toISOString().slice(0, 10) + '.pptx';
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(function () { URL.revokeObjectURL(a.href); }, 5000);
    }

    /* ---------- sample names ---------- */

    var SAMPLE_NAMES = (typeof window !== 'undefined' && window.LEAD_SAMPLE_NAMES) ||
      ['Sample One', 'Sample Two', 'Sample Three'];

    /* ---------- events ---------- */

    var drop = $('gp-drop'), fileInput = $('gp-file');
    drop.addEventListener('click', function () { fileInput.click(); });
    fileInput.addEventListener('change', function () { if (fileInput.files[0]) loadFile(fileInput.files[0]); });
    ['dragover', 'dragenter'].forEach(function (ev) {
      drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.add('drag'); });
    });
    ['dragleave', 'drop'].forEach(function (ev) {
      drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.remove('drag'); });
    });
    drop.addEventListener('drop', function (e) { if (e.dataTransfer.files[0]) loadFile(e.dataTransfer.files[0]); });

    $('gp-sheet').addEventListener('change', function (e) { useSheet(+e.target.value); });
    $('gp-namecol').addEventListener('change', function (e) { state.nameCol = +e.target.value; rebuildPeopleFromRows(); });
    $('gp-namecol2').addEventListener('change', function (e) { state.nameCol2 = +e.target.value; rebuildPeopleFromRows(); });
    $('gp-filtercol').addEventListener('change', function (e) {
      state.filterCol = +e.target.value; state.includeValues = null; buildFilterValues(); rebuildPeopleFromRows();
    });

    function addManualName() {
      var v = $('gp-addname').value.trim();
      if (!v) return;
      state.people.push({ id: 'p' + (++uid), name: v, key: '', manual: true });
      $('gp-addname').value = '';
      $('gp-count').textContent = state.people.length + ' people';
      ['gp-step2', 'gp-step3', 'gp-step4'].forEach(function (s) { $(s).classList.remove('disabled'); });
      $('gp-pptx').disabled = false;
      renderPeopleChips();
      if (state.assignments.length) { state.pool.push(state.people[state.people.length - 1].id); renderTable(); }
      else reallot();
    }
    $('gp-addbtn').addEventListener('click', addManualName);
    $('gp-addname').addEventListener('keydown', function (e) { if (e.key === 'Enter') addManualName(); });

    $('gp-sample').addEventListener('click', function () {
      state.people = SAMPLE_NAMES.map(function (n, i) {
        return { id: 'p' + (++uid), name: n, key: ['A', 'B', 'C'][i % 3], manual: false };
      });
      $('gp-fileinfo').innerHTML = '<span class="file-info">✓ ' + state.people.length + ' sample names</span>';
      afterPeopleChanged();
    });
    $('gp-clear').addEventListener('click', function () {
      state.people = []; state.assignments = []; state.pool = [];
      $('gp-fileinfo').innerHTML = ''; $('gp-count').textContent = '';
      $('gp-people').style.display = 'none'; $('gp-cols').style.display = 'none';
      $('gp-table').innerHTML = ''; $('gp-pool').style.display = 'none';
      $('gp-empty').style.display = ''; $('gp-pptx').disabled = true;
    });

    $('gp-addroom').addEventListener('click', function () {
      state.rooms.push({ name: 'Kravis ', count: 1 });
      state._roomsTouched = true;
      renderRooms(); reallot();
    });
    $('gp-target').addEventListener('change', function (e) {
      state.teamTarget = Math.max(2, +e.target.value || 3);
      renderRooms(); reallot();
    });

    // pool accepts drops too (drag a name out of a group to unassign it)
    var poolEl = $('gp-pool');
    poolEl.addEventListener('dragover', function (e) {
      e.preventDefault();
      poolEl.style.borderColor = 'var(--blue)';
    });
    poolEl.addEventListener('dragleave', function () { poolEl.style.borderColor = ''; });
    poolEl.addEventListener('drop', function (e) {
      e.preventDefault();
      poolEl.style.borderColor = '';
      var id = e.dataTransfer.getData('text/plain');
      if (id) movePerson(id, -1);
    });

    $('gp-mode').addEventListener('change', function (e) {
      state.mode = e.target.value;
      $('gp-keyrow').style.display = (state.mode === 'spread' || state.mode === 'together') ? '' : 'none';
      reallot();
    });
    $('gp-keycol').addEventListener('change', function (e) {
      state.keyCol = +e.target.value;
      rebuildPeopleFromRows();
    });

    $('gp-colsper').addEventListener('change', function (e) { state.cols = +e.target.value; renderTable(); });
    $('gp-ts').addEventListener('input', function (e) {
      state.textScale = parseFloat(e.target.value);
      $('gp-ts-o').textContent = state.textScale.toFixed(2).replace(/0$/, '') + '×';
      renderTable();
    });
    $('gp-headfill').addEventListener('input', function (e) { state.headFill = e.target.value; renderTable(); });
    $('gp-bodyfill').addEventListener('input', function (e) { state.bodyFill = e.target.value; renderTable(); });
    $('gp-bordercol').addEventListener('input', function (e) { state.borderColor = e.target.value; renderTable(); });

    $('gp-shuffle').addEventListener('click', function () {
      state.seed = Math.floor(NATIVE_RANDOM() * 2147483647);
      reallot();
    });
    $('gp-pptx').addEventListener('click', exportPptx);


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

    // class presets via the nav menus (#/groups vs #/groups/influence)
    mountApi.applySub = function (sub) {
      setIdentity(sub === 'influence' ? 'Group Selector | Influence' : 'Group Selector | Decision Making',
        sub === 'influence' ? 'GSL-INF' : 'GSL-DMK');
      if (sub === state._appliedSub) return;
      if (state._roomsTouched) return;   // never clobber manual room edits
      state.rooms = sub === 'influence' ? class3Rooms() : class2Rooms();
      state._appliedSub = sub;
      renderRooms(); reallot();
    };

    renderRooms();
  }

  var mountApi = {};   // bridges registerApp.onRoute to the mounted instance

  /* ======================================================================
     REGISTER / EXPORT
     ====================================================================== */

  if (typeof window !== 'undefined' && window.LeadToolkit) {
    window.LeadToolkit.registerApp({
      id: 'groups',
      icon: '👥🎲',
      group: 'Class 2 - Decision Making',
      name: 'Group Selector | Decision Making',
      code: 'GSL-DMK',
      intro: { upload: 'the roster (or type/paste names)', to: 'deal students into classroom groups; editable PowerPoint table' },
      tags: ['groups', 'breakouts', 'kravis', 'classroom', 'teams'],
      description: 'Deal students into numbered classroom groups (breakouts + auto-sized main room, teams of 3 with extras in 4s), drag names around, export a real editable PowerPoint table.',
      cards: [{
        group: 'Class 3 - Influence and Persuasion',
        name: 'Group Selector | Influence',
        code: 'GSL-INF',
        intro: { upload: 'the roster (or type/paste names)', to: '8 discussion groups of 9-10 across Classroom, Kravis ALT and breakouts' },
        description: 'The same sorter, preset to 8 discussion groups of ~9-10: three in the main classroom, three in the alt classroom, one in each of two breakouts.',
        sub: 'influence'
      }],
      onRoute: function (sub) { if (mountApi.applySub) mountApi.applySub(sub); },
      mount: mount
    });
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
      mulberry32: mulberry32,
      seededShuffle: seededShuffle,
      groupSizes: groupSizes,
      lastNameKey: lastNameKey,
      allot: allot,
      roomOfGroups: roomOfGroups,
      autoGroupsFor: autoGroupsFor,
      resolveRooms: resolveRooms,
      roomColor: roomColor
    };
  }
})();
