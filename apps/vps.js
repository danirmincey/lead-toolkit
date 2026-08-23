/* ==========================================================================
   App | Groups: VP Roles (Class 4 - Collective Intelligence)
   Every group fills ALL FIVE rows: VP HR, VP Finance, VP Operations,
   VP Sales, VP Marketing (role names editable). groups = floor(n/5);
   the n mod 5 extras DOUBLE UP on VP Marketing ("Name | Name") | no
   partial groups, ever. Rooms default to 6 groups in the classroom,
   5 in the alt classroom, and one breakout per remaining group.
   Drag-and-drop (or click-move) between any cells. Native PPTX table.
   ========================================================================== */

(function () {
  'use strict';

  /* ---------- pure logic (exported for tests) ---------- */

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

  /* n people → groups×5 roles; extras become co-VP-Marketing (role 4) in
     the LAST groups. Returns array[group][role] = array of people indices. */
  function allotVps(n, seed) {
    var g = Math.max(1, Math.floor(n / 5));
    var extras = n - g * 5;
    var order = seededShuffle(Array.apply(null, Array(n)).map(function (_, i) { return i; }), seed);
    var groups = [], at = 0;
    for (var gi = 0; gi < g; gi++) {
      var grp = [[], [], [], [], []];
      for (var role = 0; role < 5; role++) grp[role].push(order[at++]);
      groups.push(grp);
    }
    // extras double up on marketing in the last groups
    for (var e = 0; e < extras; e++) {
      groups[g - 1 - (e % g)][4].push(order[at++]);
    }
    return groups;
  }

  // default rooms per group index: classroom ×6, alt ×5, breakouts ×1 each
  function defaultRoomsFor(g) {
    var rooms = [];
    var classroom = Math.min(6, g);
    var alt = Math.min(5, Math.max(0, g - 6));
    var breakouts = Math.max(0, g - 11);
    if (classroom) rooms.push({ name: 'Classroom', count: classroom });
    if (alt) rooms.push({ name: 'Kravis ALT [replace]', count: alt });
    for (var b = 0; b < breakouts; b++) {
      rooms.push({ name: 'Kravis ' + String.fromCharCode(65 + b) + ' [replace]', count: 1 });
    }
    return rooms;
  }

  function roomOfGroups(rooms) {
    var out = [];
    rooms.forEach(function (r, ri) {
      for (var i = 0; i < (r.count || 0); i++) out.push(ri);
    });
    return out;
  }

  var ROOM_COLORS = ['#2E75B6', '#BF8F00', '#548235', '#C55A11', '#C00000', '#7030A0', '#0E7490', '#4D7C0F'];
  function roomColor(name, idx) {
    if (/class\s*room/i.test(name)) return '#1F3864';
    return ROOM_COLORS[idx % ROOM_COLORS.length];
  }

  /* ---------- UI ---------- */

  function mount(container) {
    var NATIVE_RANDOM = Math.random;
    var uid = 0;

    var state = {
      headers: [], rows: [], fileName: null, _sheets: null,
      nameCol: -1, nameCol2: -1, filterCol: -1, includeValues: null,
      people: [],
      roles: ['VP HR', 'VP Finance', 'VP Operations', 'VP Sales', 'VP Marketing'],
      roomsCustom: null,        // null = auto defaults for the group count
      seed: 20260821,
      groups: [],               // [group][role] = [person ids]
      pool: [],
      selectedPerson: null,
      headFill: '#1F3864', rowFillA: '#E8EAF2', rowFillB: '#DCE0EE',
      textScale: 1
    };

    container.innerHTML = '' +
      '<div class="app-title"><h2>👥🏛️ Group Selector | VP Roles</h2>' +
      '<span class="sub">Every group fills all five VP rows; extras double up on VP Marketing. Rooms: 6 in the classroom, 5 in the alt, the rest in breakouts. Real editable PowerPoint table.</span></div>' +
      '<div class="app-layout">' +
      '  <div class="sidebar">' +

      '    <details class="step" open>' +
      '      <summary><span class="n">1</span> Load data <span class="hint" id="vp-count"></span></summary>' +
      '      <div class="body">' +
      '        <div class="dropzone" id="vp-drop"><strong>DROP DATA HERE</strong><ul class="drop-spec"><li><b>Type of file:</b> CSV or Excel (.xlsx)</li><li><b>What you\'re looking for:</b> any sheet with a name column (the roster works)</li></ul></div>' +
      '        <input type="file" id="vp-file" accept=".csv,.tsv,.txt,.xlsx,.xlsm,.xltx" style="display:none">' +
      '        <div id="vp-fileinfo"></div>' +
      '        <label class="field" id="vp-sheetrow" style="display:none">Sheet<select id="vp-sheet"></select></label>' +
      '        <div class="clusterblock" id="vp-filterblock" style="display:none">' +
      '          <div class="clusterlabel">Select cluster(s)</div>' +
      '          <label class="field">Cluster column<select id="vp-filtercol"></select></label>' +
      '          <div id="vp-filtervals"></div>' +
      '        </div>' +
      '        <div class="row"><button id="vp-sample" class="fixed">🎲 Demo data</button></div>' +
      '      </div>' +
      '    </details>' +

      '    <details class="step" open>' +
      '      <summary><span class="n">2</span> Names</summary>' +
      '      <div class="body">' +
      '        <div id="vp-cols" style="display:none">' +
      '          <div class="row">' +
      '            <label class="field">Name column<select id="vp-namecol"></select></label>' +
      '            <label class="field">+ second<select id="vp-namecol2"></select></label>' +
      '          </div>' +
      '        </div>' +
      '        <div class="row">' +
      '          <input type="text" id="vp-addname" placeholder="add a name by hand…">' +
      '          <button id="vp-addbtn" class="fixed">＋</button>' +
      '        </div>' +
      '        <div class="small-note">Click a name then its new cell, or drag it. ✕ unassigns.</div>' +
      '      </div>' +
      '    </details>' +

      '    <details class="step disabled" open>' +
      '      <summary><span class="n">3</span> Roles & rooms</summary>' +
      '      <div class="body">' +
      '        <div id="vp-roles"></div>' +
      '        <div class="small-note">Rooms (per group, top to bottom). Edit names/counts; leftover groups get breakouts automatically.</div>' +
      '        <div id="vp-rooms"></div>' +
      '        <div class="row"><button id="vp-addroom" class="fixed">＋ Add room</button>' +
      '        <button id="vp-resetrooms" class="fixed">↺ Default rooms</button></div>' +
      '      </div>' +
      '    </details>' +

      '    <details class="step disabled" open>' +
      '      <summary><span class="n">4</span> Look</summary>' +
      '      <div class="body">' +
      '        <div class="row">' +
      '          <label class="field">Header fill<input type="color" id="vp-headfill" value="#1F3864"></label>' +
      '          <label class="field">Row fill A<input type="color" id="vp-fa" value="#E8EAF2"></label>' +
      '          <label class="field">Row fill B<input type="color" id="vp-fb" value="#DCE0EE"></label>' +
      '        </div>' +
      '        <div class="slider-field"><div class="top">Text size <output id="vp-ts-o">1.0×</output></div>' +
      '          <input type="range" id="vp-ts" min="0.7" max="1.5" step="0.05" value="1"></div>' +
      '      </div>' +
      '    </details>' +
      '  </div>' +

      '  <div class="preview-panel">' +
      '    <div class="preview-toolbar">' +
      '      <button id="vp-shuffle">⟳ Re-deal</button>' +
      '      <button id="vp-pptx" class="primary" disabled>⬇ PowerPoint</button>' +
      '      <span class="status" id="vp-status"></span>' +
      '    </div>' +
      '    <div class="grp-wrap">' +
      '      <div class="empty-msg" id="vp-empty">output displayed HERE</div>' +
      '      <div id="vp-table"></div>' +
      '      <div class="grp-pool" id="vp-pool" style="display:none"></div>' +
      '    </div>' +
      '  </div>' +
      '</div>';

    var $ = function (id) { return container.querySelector('#' + id); };

    function escapeHtml(s) {
      return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    /* ---------- loading ---------- */

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
            $('vp-sheet').innerHTML = sheets.map(function (s, i) {
              return '<option value="' + i + '">' + escapeHtml(s.name) + '</option>';
            }).join('');
            $('vp-sheetrow').style.display = sheets.length > 1 ? '' : 'none';
            useSheet(0);
          });
        }
        $('vp-sheetrow').style.display = 'none';
        loadRows(parseCSVText(new TextDecoder(sniffEncoding(buf)).decode(buf)), file.name);
      }).catch(function (err) {
        $('vp-fileinfo').innerHTML = '<span class="file-warn">Could not read file: ' + (err.message || err) + '</span>';
      });
    }

    function useSheet(i) {
      var s = state._sheets[i];
      loadRows(s.rows.map(function (r) {
        return r.map(function (c) { return c === null || c === undefined ? '' : String(c); });
      }), state.fileName + (state._sheets.length > 1 ? ' · ' + s.name : ''));
    }

    function loadRows(raw, name) {
      if (raw.length < 2) { $('vp-fileinfo').innerHTML = '<span class="file-warn">No data rows.</span>'; return; }
      state.headers = dedupeHeaders(raw[0]);
      state.rows = raw.slice(1);
      state.filterCol = -1; state.includeValues = null;
      $('vp-fileinfo').innerHTML = '<span class="file-info">✓ ' + escapeHtml(name) + ' · ' + state.rows.length + ' rows</span>';
      $('vp-cols').style.display = '';
      $('vp-filterblock').style.display = '';

      var first = state.headers.findIndex(function (h) { return /first/i.test(h); });
      var last = state.headers.findIndex(function (h) { return /last/i.test(h); });
      var full = state.headers.findIndex(function (h) { return /name/i.test(h); });
      if (first !== -1 && last !== -1) { state.nameCol = first; state.nameCol2 = last; }
      else { state.nameCol = full !== -1 ? full : 0; state.nameCol2 = -1; }
      state.filterCol = state.headers.findIndex(function (h) { return /cluster/i.test(h); });

      var opts = state.headers.map(function (h, i) { return '<option value="' + i + '">' + escapeHtml(h) + '</option>'; }).join('');
      $('vp-namecol').innerHTML = opts;
      $('vp-namecol2').innerHTML = '<option value="-1">- none -</option>' + opts;
      $('vp-filtercol').innerHTML = '<option value="-1">- no filter -</option>' + opts;
      $('vp-namecol').value = String(state.nameCol);
      $('vp-namecol2').value = String(state.nameCol2);
      $('vp-filtercol').value = String(state.filterCol);
      buildFilterValues();
      rebuildPeople();
    }

    function buildFilterValues() {
      var box = $('vp-filtervals');
      box.innerHTML = '';
      if (state.filterCol < 0 || !state.rows.length) return;
      var uniq = new Map();
      state.rows.forEach(function (r) {
        var v = String(r[state.filterCol] === undefined ? '' : r[state.filterCol]).trim();
        uniq.set(v, (uniq.get(v) || 0) + 1);
      });
      if (uniq.size > 40) { state.includeValues = null; return; }
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
          rebuildPeople();
        });
        list.appendChild(lab);
      });
      box.appendChild(list);

      var note = document.createElement('div');
      note.id = 'vp-clusternote';
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
        rebuildPeople();
      });
      clrAll.addEventListener('click', function () {
        state.includeValues = new Set();
        refreshLabels();
        updateNote();
        rebuildPeople();
      });
    }

    function rebuildPeople() {
      var manual = state.people.filter(function (p) { return p.manual; });
      var rows = state.rows;
      if (state.filterCol >= 0 && state.includeValues) {
        rows = rows.filter(function (r) {
          return state.includeValues.has(String(r[state.filterCol] === undefined ? '' : r[state.filterCol]).trim());
        });
      }
      state.people = rows.map(function (r) {
        var n1 = String(r[state.nameCol] === undefined ? '' : r[state.nameCol]).trim();
        var n2 = state.nameCol2 >= 0 ? String(r[state.nameCol2] === undefined ? '' : r[state.nameCol2]).trim() : '';
        var name = (n1 + ' ' + n2).trim();
        return name ? { id: 'p' + (++uid), name: name, manual: false } : null;
      }).filter(Boolean).concat(manual);
      afterPeopleChanged();
    }

    function afterPeopleChanged() {
      $('vp-count').textContent = state.people.length ? state.people.length + ' people' : '';
      Array.prototype.forEach.call(container.querySelectorAll('details.step'), function (d) { d.classList.remove('disabled'); });
      $('vp-pptx').disabled = !state.people.length;
      reallot();
    }

    /* ---------- roles + rooms editors ---------- */

    function renderRoles() {
      var box = $('vp-roles');
      box.innerHTML = '<div class="small-note">Role names (all five rows are always filled):</div>';
      state.roles.forEach(function (role, i) {
        var row = document.createElement('div');
        row.className = 'row';
        row.style.marginBottom = '4px';
        row.innerHTML = '<input type="text" value="' + escapeHtml(role) + '">';
        row.querySelector('input').addEventListener('input', function (e) {
          state.roles[i] = e.target.value || ('Role ' + (i + 1));
          renderTable();
        });
        box.appendChild(row);
      });
    }

    function currentRooms() {
      var g = state.groups.length || Math.max(1, Math.floor(state.people.length / 5));
      if (state.roomsCustom) {
        // top up with breakouts if the custom list covers fewer groups
        var sum = state.roomsCustom.reduce(function (s, r) { return s + r.count; }, 0);
        var rooms = state.roomsCustom.map(function (r) { return { name: r.name, count: r.count }; });
        var b = 0;
        while (sum < g) { rooms.push({ name: 'Kravis ' + String.fromCharCode(65 + b++) + ' [replace]', count: 1 }); sum++; }
        return rooms;
      }
      return defaultRoomsFor(g);
    }

    function renderRooms() {
      var box = $('vp-rooms');
      box.innerHTML = '';
      currentRooms().forEach(function (r, i) {
        var row = document.createElement('div');
        row.className = 'row';
        row.style.marginBottom = '4px';
        row.innerHTML = '<input type="text" value="' + escapeHtml(r.name) + '">' +
          '<input type="number" class="fixed" style="width:64px" min="1" value="' + r.count + '">' +
          '<button class="fixed">✕</button>';
        var ins = row.querySelectorAll('input');
        function commit() {
          state.roomsCustom = currentRooms();
          state.roomsCustom[i] = { name: ins[0].value.trim() || 'room', count: Math.max(1, +ins[1].value || 1) };
          renderRooms(); renderTable();
        }
        ins[0].addEventListener('change', commit);
        ins[1].addEventListener('change', commit);
        row.querySelector('button').addEventListener('click', function () {
          state.roomsCustom = currentRooms();
          state.roomsCustom.splice(i, 1);
          if (!state.roomsCustom.length) state.roomsCustom = null;
          renderRooms(); renderTable();
        });
        box.appendChild(row);
      });
    }

    /* ---------- allotment + editing ---------- */

    function personById(id) {
      return state.people.filter(function (p) { return p.id === id; })[0] || null;
    }

    function reallot() {
      var n = state.people.length;
      if (n < 5) {
        state.groups = n ? [state.people.map(function () { return []; })] : [];
        if (n) {
          state.groups = [[[], [], [], [], []]];
          state.people.forEach(function (p, i) { state.groups[0][Math.min(i, 4)].push(p.id); });
        }
        state.pool = [];
        renderRooms(); renderTable();
        return;
      }
      var groups = allotVps(n, state.seed);
      state.groups = groups.map(function (grp) {
        return grp.map(function (role) {
          return role.map(function (i) { return state.people[i].id; });
        });
      });
      state.pool = [];
      state.selectedPerson = null;
      renderRooms(); renderTable();
    }

    function movePerson(id, gi, role) {   // gi -1 = pool
      state.groups = state.groups.map(function (grp) {
        return grp.map(function (r) { return r.filter(function (x) { return x !== id; }); });
      });
      state.pool = state.pool.filter(function (x) { return x !== id; });
      if (gi === -1) state.pool.push(id);
      else state.groups[gi][role].push(id);
      state.selectedPerson = null;
      renderTable();
    }

    /* ---------- preview ---------- */

    function chipHtml(id) {
      var p = personById(id);
      if (!p) return '';
      return '<span class="grp-name' + (state.selectedPerson === id ? ' sel' : '') + '" data-p="' + id + '" draggable="true">' +
        escapeHtml(p.name) + '<button data-x="' + id + '">✕</button></span>';
    }

    function renderTable() {
      var holder = $('vp-table');
      var g = state.groups.length;
      $('vp-empty').style.display = state.people.length ? 'none' : '';
      if (!state.people.length) { holder.innerHTML = ''; $('vp-pool').style.display = 'none'; return; }

      var rooms = currentRooms();
      var roomIdx = roomOfGroups(rooms);
      var fs = Math.round(13 * state.textScale);
      var html = '<table class="grp" style="font-size:' + fs + 'px">';
      html += '<tr><td style="background:' + state.headFill + ';color:#fff;font-weight:700;width:52px">Group</td>' +
        '<td style="background:' + state.headFill + ';color:#fff;font-weight:700;width:92px">Room</td>' +
        state.roles.map(function (role) {
          return '<td style="background:' + state.headFill + ';color:#fff;font-weight:700">' + escapeHtml(role) + '</td>';
        }).join('') + '</tr>';
      for (var gi = 0; gi < g; gi++) {
        var room = rooms[roomIdx[gi]] || { name: '-' };
        var fill = gi % 2 ? state.rowFillB : state.rowFillA;
        html += '<tr>' +
          '<td style="background:' + fill + ';font-weight:700">' + (gi + 1) + '</td>' +
          '<td style="background:' + fill + ';font-weight:700;color:' + roomColor(room.name, roomIdx[gi] || 0) + '">' + escapeHtml(room.name) + '</td>';
        for (var role = 0; role < 5; role++) {
          var ids = state.groups[gi][role] || [];
          html += '<td class="movable" data-g="' + gi + '" data-role="' + role + '" style="background:' + fill + '">' +
            ids.map(chipHtml).join(' ') + '</td>';
        }
        html += '</tr>';
      }
      html += '</table>';
      holder.innerHTML = html;

      Array.prototype.forEach.call(holder.querySelectorAll('.grp-name'), function (el) {
        el.addEventListener('click', function (e) {
          if (e.target.tagName === 'BUTTON') return;
          var id = el.getAttribute('data-p');
          state.selectedPerson = state.selectedPerson === id ? null : id;
          renderTable();
        });
        el.addEventListener('dragstart', function (e) {
          e.dataTransfer.setData('text/plain', el.getAttribute('data-p'));
        });
      });
      Array.prototype.forEach.call(holder.querySelectorAll('[data-x]'), function (el) {
        el.addEventListener('click', function () { movePerson(el.getAttribute('data-x'), -1, 0); });
      });
      Array.prototype.forEach.call(holder.querySelectorAll('[data-role]'), function (el) {
        el.addEventListener('click', function (e) {
          if (e.target.closest('.grp-name')) return;
          if (state.selectedPerson) movePerson(state.selectedPerson, +el.getAttribute('data-g'), +el.getAttribute('data-role'));
        });
        el.addEventListener('dragover', function (e) { e.preventDefault(); el.style.outline = '2px solid var(--blue)'; });
        el.addEventListener('dragleave', function () { el.style.outline = ''; });
        el.addEventListener('drop', function (e) {
          e.preventDefault();
          el.style.outline = '';
          var id = e.dataTransfer.getData('text/plain');
          if (id) movePerson(id, +el.getAttribute('data-g'), +el.getAttribute('data-role'));
        });
      });

      var pool = $('vp-pool');
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
      } else pool.style.display = 'none';

      var doubles = 0, empty = 0;
      state.groups.forEach(function (grp) {
        grp.forEach(function (r) {
          if (r.length > 1) doubles += r.length - 1;
          if (!r.length) empty++;
        });
      });
      $('vp-status').textContent = state.people.length + ' people · ' + g + ' groups × 5 roles' +
        (doubles ? ' · ' + doubles + ' doubled' : '') + (empty ? ' · ⚠ ' + empty + ' empty role cell(s)' : '');
    }

    /* ---------- PPTX export ---------- */

    function exportPptx() {
      if (!window.pptxLite || !state.groups.length) return;
      var g = state.groups.length;
      var rooms = currentRooms();
      var roomIdx = roomOfGroups(rooms);
      var CW = 2560, CH = 1440, margin = 50;
      // ~12pt on the slide: sizePx = 12 * 12700 * canvasW / 12192000 = 32 at 2560
      var nameSize = 32 * state.textScale;
      var groupW = 90, roomW = 170;
      var roleW = (CW - 2 * margin - groupW - roomW) / 5;
      var rowH = Math.max(48, nameSize * 2.1);

      var rows = [{
        h: rowH,
        cells: [{ fill: state.headFill, paras: [{ runs: [{ text: 'Group', bold: true, color: '#FFFFFF' }], sizePx: nameSize }] },
                { fill: state.headFill, paras: [{ runs: [{ text: 'Room', bold: true, color: '#FFFFFF' }], sizePx: nameSize }] }]
          .concat(state.roles.map(function (role) {
            return { fill: state.headFill, paras: [{ runs: [{ text: role, bold: true, color: '#FFFFFF' }], sizePx: nameSize }] };
          }))
      }];
      for (var gi = 0; gi < g; gi++) {
        var room = rooms[roomIdx[gi]] || { name: '-' };
        var fill = gi % 2 ? state.rowFillB : state.rowFillA;
        rows.push({
          h: rowH,
          cells: [
            { fill: fill, paras: [{ runs: [{ text: String(gi + 1), bold: false, color: '#000000' }], sizePx: nameSize }] },
            { fill: fill, paras: [{ runs: [{ text: room.name, bold: true, color: roomColor(room.name, roomIdx[gi] || 0) }], sizePx: nameSize }] }
          ].concat(state.groups[gi].map(function (ids) {
            var names = ids.map(function (id) { var p = personById(id); return p ? p.name : ''; }).filter(Boolean).join(' | ');
            return { fill: fill, paras: [{ runs: [{ text: names || '-', bold: false, color: '#000000' }], sizePx: nameSize }] };
          }))
        });
      }

      var bytes = window.pptxLite.makePptx({
        canvasW: CW, canvasH: CH, background: '#FFFFFF',
        tables: [{
          x: margin, y: margin,
          colWidths: [groupW, roomW].concat(state.roles.map(function () { return roleW; })),
          border: { color: '#FFFFFF', w: 2 },
          font: 'Candara',
          rows: rows
        }]
      });
      var blob = new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation' });
      var a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'LEADTK_GSL-VPR_' + new Date().toISOString().slice(0, 10) + '.pptx';
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(function () { URL.revokeObjectURL(a.href); }, 5000);
    }

    /* ---------- events ---------- */

    var drop = $('vp-drop'), fileInput = $('vp-file');
    drop.addEventListener('click', function () { fileInput.click(); });
    fileInput.addEventListener('change', function () { if (fileInput.files[0]) loadFile(fileInput.files[0]); });
    ['dragover', 'dragenter'].forEach(function (ev) {
      drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.add('drag'); });
    });
    ['dragleave', 'drop'].forEach(function (ev) {
      drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.remove('drag'); });
    });
    drop.addEventListener('drop', function (e) { if (e.dataTransfer.files[0]) loadFile(e.dataTransfer.files[0]); });

    $('vp-sheet').addEventListener('change', function (e) { useSheet(+e.target.value); });
    $('vp-namecol').addEventListener('change', function (e) { state.nameCol = +e.target.value; rebuildPeople(); });
    $('vp-namecol2').addEventListener('change', function (e) { state.nameCol2 = +e.target.value; rebuildPeople(); });
    $('vp-filtercol').addEventListener('change', function (e) {
      state.filterCol = +e.target.value; state.includeValues = null; buildFilterValues(); rebuildPeople();
    });

    function addManual() {
      var v = $('vp-addname').value.trim();
      if (!v) return;
      state.people.push({ id: 'p' + (++uid), name: v, manual: true });
      $('vp-addname').value = '';
      $('vp-count').textContent = state.people.length + ' people';
      $('vp-pptx').disabled = false;
      if (state.groups.length) { state.pool.push(state.people[state.people.length - 1].id); renderTable(); }
      else reallot();
    }
    $('vp-addbtn').addEventListener('click', addManual);
    $('vp-addname').addEventListener('keydown', function (e) { if (e.key === 'Enter') addManual(); });

    $('vp-sample').addEventListener('click', function () {
      var names = (window.LEAD_SAMPLE_NAMES || []).slice(0, 75);
      state.people = names.map(function (n) { return { id: 'p' + (++uid), name: n, manual: false }; });
      $('vp-fileinfo').innerHTML = '<span class="file-info">✓ ' + state.people.length + ' sample names</span>';
      afterPeopleChanged();
    });

    $('vp-addroom').addEventListener('click', function () {
      state.roomsCustom = currentRooms();
      state.roomsCustom.push({ name: 'Kravis ', count: 1 });
      renderRooms(); renderTable();
    });
    $('vp-resetrooms').addEventListener('click', function () {
      state.roomsCustom = null;
      renderRooms(); renderTable();
    });

    $('vp-headfill').addEventListener('input', function (e) { state.headFill = e.target.value; renderTable(); });
    $('vp-fa').addEventListener('input', function (e) { state.rowFillA = e.target.value; renderTable(); });
    $('vp-fb').addEventListener('input', function (e) { state.rowFillB = e.target.value; renderTable(); });
    $('vp-ts').addEventListener('input', function (e) {
      state.textScale = parseFloat(e.target.value);
      $('vp-ts-o').textContent = state.textScale.toFixed(2).replace(/0$/, '') + '×';
      renderTable();
    });

    var poolEl = $('vp-pool');
    poolEl.addEventListener('dragover', function (e) { e.preventDefault(); poolEl.style.borderColor = 'var(--blue)'; });
    poolEl.addEventListener('dragleave', function () { poolEl.style.borderColor = ''; });
    poolEl.addEventListener('drop', function (e) {
      e.preventDefault();
      poolEl.style.borderColor = '';
      var id = e.dataTransfer.getData('text/plain');
      if (id) movePerson(id, -1, 0);
    });

    $('vp-shuffle').addEventListener('click', function () {
      state.seed = Math.floor(NATIVE_RANDOM() * 2147483647);
      reallot();
    });
    $('vp-pptx').addEventListener('click', exportPptx);

    renderRoles();
    renderRooms();
  }

  /* ---------- register / export ---------- */

  if (typeof window !== 'undefined' && window.LeadToolkit) {
    window.LeadToolkit.registerApp({
      id: 'vps',
      icon: '👥🏛️',
      group: 'Class 4 - Collective Intelligence',
      name: 'Group Selector | VP Roles',
      code: 'GSL-VPR',
      intro: { upload: 'the roster (or use the demo)', to: 'VP-role groups of 5 (extras double VP Marketing); PowerPoint table' },
      tags: ['vp', 'roles', 'collective intelligence', 'marketing', 'doubling', 'rooms'],
      description: 'Every group fills all five VP rows (HR, Finance, Operations, Sales, Marketing, all renameable); extras double up on Marketing. Rooms auto-assigned, drag to adjust, editable PowerPoint table.',
      mount: mount
    });
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
      allotVps: allotVps,
      defaultRoomsFor: defaultRoomsFor,
      roomOfGroups: roomOfGroups,
      seededShuffle: seededShuffle
    };
  }
})();
