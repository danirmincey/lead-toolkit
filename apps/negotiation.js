/* ==========================================================================
   App | Groups: Abhas/Bussan (Class 3 negotiation pairings)
   Sorts the class into TEAMS of max 3 (worst case 2 | never more than 3),
   pairs the teams into GROUPS of 4-6 people, and labels the two sides of
   each group Abhas / Bussan (renameable). As many groups as the class size
   needs (teams = 2 × ceil(n/6), which guarantees the max-3 rule).
   Preview mirrors the slide (green/lavender sides, navy group headers,
   centered rows of group blocks, numbered row-wise) and exports a native
   editable PowerPoint table.
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

  // teams = 2 × ceil(n/6): every team ≤ 3 people, groups of 4-6 (teams of 2
  // only appear when the count forces them)
  function teamPlan(n) {
    var groups = Math.max(1, Math.ceil(n / 6));
    return { groups: groups, teams: groups * 2 };
  }

  function teamSizes(n, teams) {
    var base = Math.floor(n / teams), rem = n % teams, out = [];
    for (var i = 0; i < teams; i++) out.push(base + (i < rem ? 1 : 0));
    return out;
  }

  // groups per row in the figure and on the slide
  var GROUPS_PER_ROW = 4;

  /* rowSplit: split g groups into centered rows of about `cols` groups each.
     Remainder 0 -> even full rows (12 -> [4,4,4]); remainder 1 -> the middle
     row absorbs the extra (13 -> [4,5,4]); remainder 2+ -> the extras form
     their own centered bottom row (14 -> [4,4,4,2]). Groups are numbered
     ROW-WISE: 1 2 3 4 across the first row, then continuing. */
  function rowSplit(g, cols) {
    if (!g || g < 1) return [];
    if (!cols || cols < 1) cols = 1;
    if (g <= cols) return [g];
    var full = Math.floor(g / cols), rem = g % cols, rows = [], i;
    for (i = 0; i < full; i++) rows.push(cols);
    if (rem === 1) rows[Math.floor(full / 2)] += 1;
    else if (rem > 1) rows.push(rem);
    return rows;
  }

  /* colSplit: split g groups into ncols STACKS (the class-deck layout:
     three tight columns, groups numbered DOWN each column). Remainder
     goes to the middle column first, so 13 -> [4, 5, 4] like the deck. */
  function colSplit(g, ncols) {
    if (!g || g < 1) return [];
    if (!ncols || ncols < 1) ncols = 1;
    if (ncols > g) ncols = g;
    var base = Math.floor(g / ncols), rem = g % ncols;
    var out = [], i;
    for (i = 0; i < ncols; i++) out.push(base);
    // middle-out: middle column, then left of it, then right...
    var order = [];
    var mid = Math.floor((ncols - 1) / 2);
    for (i = 0; i < ncols; i++) {
      var off = Math.ceil(i / 2) * (i % 2 === 1 ? -1 : 1);
      var idx = mid + off;
      if (idx >= 0 && idx < ncols && order.indexOf(idx) === -1) order.push(idx);
    }
    for (i = 0; i < ncols; i++) if (order.indexOf(i) === -1) order.push(i);
    for (i = 0; i < rem; i++) out[order[i]] += 1;
    return out;
  }

  // returns array of teams (arrays of people indices); teams 2i & 2i+1 = group i
  function allotTeams(n, seed) {
    var plan = teamPlan(n);
    var sizes = teamSizes(n, plan.teams);
    var order = seededShuffle(Array.apply(null, Array(n)).map(function (_, i) { return i; }), seed);
    var teams = [], at = 0;
    for (var t = 0; t < plan.teams; t++) {
      teams.push(order.slice(at, at + sizes[t]));
      at += sizes[t];
    }
    return teams;
  }

  /* ---------- UI ---------- */

  function mount(container) {
    var NATIVE_RANDOM = Math.random;
    var uid = 0;

    var state = {
      headers: [], rows: [], fileName: null, _sheets: null,
      nameCol: -1, nameCol2: -1, filterCol: -1, includeValues: null,
      people: [],           // {id, name}
      seed: 20260821,
      teams: [],            // arrays of person ids
      pool: [],
      selectedPerson: null,
      sideA: 'Abhas', sideB: 'Bussan',
      colA: '#C6E0B4', colB: '#CCCCE5', headFill: '#1F3864',
      textScale: 1
    };

    container.innerHTML = '' +
      '<div class="app-title"><h2>👥🤝 Group Selector | Abhas & Bussan</h2>' +
      '<span class="sub">Teams of max 3 (never more), paired into groups of 4-6, split into the two negotiation roles. Exports a real editable PowerPoint table.</span></div>' +
      '<div class="app-layout">' +
      '  <div class="sidebar">' +

      '    <details class="step" open>' +
      '      <summary><span class="n">1</span> Load data <span class="hint" id="ng-count"></span></summary>' +
      '      <div class="body">' +
      '        <div class="dropzone" id="ng-drop"><strong>DROP DATA HERE</strong><ul class="drop-spec"><li><b>Type of file:</b> CSV or Excel (.xlsx)</li><li><b>What you\'re looking for:</b> any sheet with a name column (the roster works)</li></ul></div>' +
      '        <input type="file" id="ng-file" accept=".csv,.tsv,.txt,.xlsx,.xlsm,.xltx" style="display:none">' +
      '        <div id="ng-fileinfo"></div>' +
      '        <label class="field" id="ng-sheetrow" style="display:none">Sheet<select id="ng-sheet"></select></label>' +
      '        <div class="clusterblock" id="ng-filterblock" style="display:none">' +
      '          <div class="clusterlabel">Select cluster(s)</div>' +
      '          <label class="field">Cluster column<select id="ng-filtercol"></select></label>' +
      '          <div id="ng-filtervals"></div>' +
      '        </div>' +
      '        <div class="row"><button id="ng-sample" class="fixed">🎲 Demo data</button></div>' +
      '      </div>' +
      '    </details>' +

      '    <details class="step" open>' +
      '      <summary><span class="n">2</span> Names</summary>' +
      '      <div class="body">' +
      '        <div id="ng-cols" style="display:none">' +
      '          <div class="row">' +
      '            <label class="field">Name column<select id="ng-namecol"></select></label>' +
      '            <label class="field">+ second<select id="ng-namecol2"></select></label>' +
      '          </div>' +
      '        </div>' +
      '        <div class="row">' +
      '          <input type="text" id="ng-addname" placeholder="add a name by hand…">' +
      '          <button id="ng-addbtn" class="fixed">＋</button>' +
      '        </div>' +
      '        <div class="small-note">To adjust: click a name, click its new team, or just drag it. ✕ unassigns.</div>' +
      '      </div>' +
      '    </details>' +

      '    <details class="step disabled" open>' +
      '      <summary><span class="n">3</span> Roles & look</summary>' +
      '      <div class="body">' +
      '        <div class="row">' +
      '          <label class="field">Side 1<input type="text" id="ng-sidea" value="Abhas"></label>' +
      '          <label class="field">Side 2<input type="text" id="ng-sideb" value="Bussan"></label>' +
      '        </div>' +
      '        <div class="row">' +
      '          <label class="field">Side 1 fill<input type="color" id="ng-cola" value="#C6E0B4"></label>' +
      '          <label class="field">Side 2 fill<input type="color" id="ng-colb" value="#CCCCE5"></label>' +
      '          <label class="field">Headers<input type="color" id="ng-headfill" value="#1F3864"></label>' +
      '        </div>' +
      '        <div class="slider-field"><div class="top">Text size <output id="ng-ts-o">1.0×</output></div>' +
      '          <input type="range" id="ng-ts" min="0.7" max="1.5" step="0.05" value="1"></div>' +
      '        <div class="small-note" id="ng-plan"></div>' +
      '      </div>' +
      '    </details>' +
      '  </div>' +

      '  <div class="preview-panel">' +
      '    <div class="preview-toolbar">' +
      '      <button id="ng-shuffle">⟳ Re-deal</button>' +
      '      <button id="ng-pptx" class="primary" disabled>⬇ PowerPoint</button>' +
      '      <span class="status" id="ng-status"></span>' +
      '    </div>' +
      '    <div class="grp-wrap">' +
      '      <div class="empty-msg" id="ng-empty">output displayed HERE</div>' +
      '      <div id="ng-table" style="display:flex;flex-direction:column;gap:12px"></div>' +
      '      <div class="grp-pool" id="ng-pool" style="display:none"></div>' +
      '    </div>' +
      '  </div>' +
      '</div>';

    var $ = function (id) { return container.querySelector('#' + id); };

    function escapeHtml(s) {
      return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    /* ---------- loading (same pattern as Groups) ---------- */

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
            $('ng-sheet').innerHTML = sheets.map(function (s, i) {
              return '<option value="' + i + '">' + escapeHtml(s.name) + '</option>';
            }).join('');
            $('ng-sheetrow').style.display = sheets.length > 1 ? '' : 'none';
            useSheet(0);
          });
        }
        $('ng-sheetrow').style.display = 'none';
        loadRows(parseCSVText(new TextDecoder(sniffEncoding(buf)).decode(buf)), file.name);
      }).catch(function (err) {
        $('ng-fileinfo').innerHTML = '<span class="file-warn">Could not read file: ' + (err.message || err) + '</span>';
      });
    }

    function useSheet(i) {
      var s = state._sheets[i];
      loadRows(s.rows.map(function (r) {
        return r.map(function (c) { return c === null || c === undefined ? '' : String(c); });
      }), state.fileName + (state._sheets.length > 1 ? ' · ' + s.name : ''));
    }

    function loadRows(raw, name) {
      if (raw.length < 2) { $('ng-fileinfo').innerHTML = '<span class="file-warn">No data rows.</span>'; return; }
      state.headers = dedupeHeaders(raw[0]);
      state.rows = raw.slice(1);
      state.filterCol = -1; state.includeValues = null;
      $('ng-fileinfo').innerHTML = '<span class="file-info">✓ ' + escapeHtml(name) + ' · ' + state.rows.length + ' rows</span>';
      $('ng-cols').style.display = '';
      $('ng-filterblock').style.display = '';

      var first = state.headers.findIndex(function (h) { return /first/i.test(h); });
      var last = state.headers.findIndex(function (h) { return /last/i.test(h); });
      var full = state.headers.findIndex(function (h) { return /name/i.test(h); });
      if (first !== -1 && last !== -1) { state.nameCol = first; state.nameCol2 = last; }
      else { state.nameCol = full !== -1 ? full : 0; state.nameCol2 = -1; }
      state.filterCol = state.headers.findIndex(function (h) { return /cluster/i.test(h); });

      var opts = state.headers.map(function (h, i) { return '<option value="' + i + '">' + escapeHtml(h) + '</option>'; }).join('');
      $('ng-namecol').innerHTML = opts;
      $('ng-namecol2').innerHTML = '<option value="-1">- none -</option>' + opts;
      $('ng-filtercol').innerHTML = '<option value="-1">- no filter -</option>' + opts;
      $('ng-namecol').value = String(state.nameCol);
      $('ng-namecol2').value = String(state.nameCol2);
      $('ng-filtercol').value = String(state.filterCol);
      buildFilterValues();
      rebuildPeople();
    }

    function buildFilterValues() {
      var box = $('ng-filtervals');
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
      note.id = 'ng-clusternote';
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
      $('ng-count').textContent = state.people.length ? state.people.length + ' people' : '';
      Array.prototype.forEach.call(container.querySelectorAll('details.step'), function (d) { d.classList.remove('disabled'); });
      $('ng-pptx').disabled = !state.people.length;
      reallot();
    }

    /* ---------- allotment + editing ---------- */

    function personById(id) {
      return state.people.filter(function (p) { return p.id === id; })[0] || null;
    }

    function reallot() {
      var n = state.people.length;
      if (!n) { state.teams = []; state.pool = []; renderTable(); return; }
      var teams = allotTeams(n, state.seed);
      state.teams = teams.map(function (t) {
        return t.map(function (i) { return state.people[i].id; });
      });
      state.pool = [];
      state.selectedPerson = null;
      renderTable();
    }

    function movePerson(id, teamIdx) {   // -1 = pool
      state.teams = state.teams.map(function (t) {
        return t.filter(function (x) { return x !== id; });
      });
      state.pool = state.pool.filter(function (x) { return x !== id; });
      if (teamIdx === -1) state.pool.push(id);
      else state.teams[teamIdx].push(id);
      state.selectedPerson = null;
      renderTable();
    }

    /* ---------- preview ---------- */

    function chipHtml(id) {
      var p = personById(id);
      if (!p) return '';
      return '<div><span class="grp-name' + (state.selectedPerson === id ? ' sel' : '') + '" data-p="' + id + '" draggable="true">' +
        escapeHtml(p.name) + '<button data-x="' + id + '">✕</button></span></div>';
    }

    function renderTable() {
      var holder = $('ng-table');
      var g = state.teams.length / 2;
      $('ng-empty').style.display = state.people.length ? 'none' : '';
      if (!state.people.length) { holder.innerHTML = ''; $('ng-pool').style.display = 'none'; return; }

      var fs = Math.round(13 * state.textScale);
      // CLASS-DECK LAYOUT: three tight columns, ONE Abhas/Bussan header
      // per column, groups stacked with no gaps, numbered DOWN each
      // column (13 -> 1-4 | 5-9 | 10-13, exactly like the slide)
      var splits = colSplit(g, 3);
      var html = '<div style="display:flex;gap:14px;justify-content:center;align-items:flex-start">';
      var gi = 0;
      for (var col = 0; col < splits.length; col++) {
        html += '<table class="grp" style="font-size:' + fs + 'px;flex:1;min-width:0">';
        html += '<tr><td style="background:' + state.colA + ';font-weight:700;font-family:var(--font-head);height:2em;min-width:96px;width:50%">' + escapeHtml(state.sideA) + '</td>' +
          '<td style="background:' + state.colB + ';font-weight:700;font-family:var(--font-head);height:2em;min-width:96px;width:50%">' + escapeHtml(state.sideB) + '</td></tr>';
        for (var k = 0; k < splits[col]; k++) {
          html += '<tr><td colspan="2" style="background:' + state.headFill + ';color:#fff;font-weight:700;font-family:var(--font-head);height:1.8em">Group ' + (gi + 1) + '</td></tr>';
          html += '<tr>' +
            '<td class="movable" data-t="' + (2 * gi) + '" style="background:' + state.colA + ';vertical-align:top">' + (state.teams[2 * gi] || []).map(chipHtml).join('') + '</td>' +
            '<td class="movable" data-t="' + (2 * gi + 1) + '" style="background:' + state.colB + ';vertical-align:top">' + (state.teams[2 * gi + 1] || []).map(chipHtml).join('') + '</td>' +
            '</tr>';
          gi++;
        }
        html += '</table>';
      }
      html += '</div>';
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
        el.addEventListener('click', function () { movePerson(el.getAttribute('data-x'), -1); });
      });
      Array.prototype.forEach.call(holder.querySelectorAll('[data-t]'), function (el) {
        el.addEventListener('click', function (e) {
          if (e.target.closest('.grp-name')) return;
          if (state.selectedPerson) movePerson(state.selectedPerson, +el.getAttribute('data-t'));
        });
        el.addEventListener('dragover', function (e) { e.preventDefault(); el.style.outline = '2px solid var(--blue)'; });
        el.addEventListener('dragleave', function () { el.style.outline = ''; });
        el.addEventListener('drop', function (e) {
          e.preventDefault();
          el.style.outline = '';
          var id = e.dataTransfer.getData('text/plain');
          if (id) movePerson(id, +el.getAttribute('data-t'));
        });
      });

      var pool = $('ng-pool');
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

      var sizes = state.teams.map(function (t) { return t.length; });
      var over = sizes.filter(function (s) { return s > 3; }).length;
      $('ng-plan').textContent = state.people.length + ' people → ' + g + ' groups (' + state.teams.length +
        ' teams of ' + (sizes.length ? Math.min.apply(null, sizes) + '–' + Math.max.apply(null, sizes) : '?') + ')' +
        (over ? ' · ⚠ a manual move made a team bigger than 3' : '');
      $('ng-status').textContent = state.people.length + ' people · ' + g + ' groups · teams max 3';
    }

    /* ---------- PPTX export ---------- */

    function exportPptx() {
      if (!window.pptxLite || !state.teams.length) return;
      var g = state.teams.length / 2;
      // CLASS-DECK LAYOUT (the slide Dani supplied): three tight columns,
      // ONE Abhas/Bussan header per column, navy Group banners, groups
      // stacked with NO gaps and numbered DOWN each column. Uniform cell
      // sizes; ~12pt names (sizePx = 12 * 12700 * canvasW / 12192000).
      var CW = 2560, CH = 1440, margin = 80, gap = 28;
      var cols = Math.min(3, g);
      var splits = colSplit(g, cols);
      var perCol = 1;
      splits.forEach(function (k) { if (k > perCol) perCol = k; });

      var nameSize = 32 * state.textScale;
      var maxLines = 1;
      state.teams.forEach(function (t) { if (t.length > maxLines) maxLines = t.length; });
      var headH = nameSize * 1.9;
      var bannH = nameSize * 1.7;
      var lineH = nameSize * 1.5;
      var pad = 16;
      var bodyH = maxLines * lineH + pad;

      // shrink-to-fit: the tallest column must stay inside the slide
      var need = headH + perCol * (bannH + bodyH);
      var avail = CH - 2 * margin;
      if (need > avail) {
        var f = avail / need;
        nameSize *= f; headH *= f; bannH *= f; lineH *= f; pad *= f;
        bodyH = maxLines * lineH + pad;
      }

      var colW = (CW - 2 * margin - (cols - 1) * gap) / cols;
      var cellW = colW / 2;

      var tables = [];
      var gi = 0;
      for (var ci = 0; ci < cols; ci++) {
        var rows = [{
          h: headH,
          cells: [
            { fill: state.colA, paras: [{ runs: [{ text: state.sideA, bold: true, color: '#000000' }], sizePx: nameSize, align: 'ctr' }] },
            { fill: state.colB, paras: [{ runs: [{ text: state.sideB, bold: true, color: '#000000' }], sizePx: nameSize, align: 'ctr' }] }
          ]
        }];
        for (var k = 0; k < splits[ci]; k++) {
          var a = (state.teams[2 * gi] || []).map(personById).filter(Boolean);
          var b = (state.teams[2 * gi + 1] || []).map(personById).filter(Boolean);
          rows.push({
            h: bannH,
            cells: [
              { span: 2, fill: state.headFill, paras: [{ runs: [{ text: 'Group ' + (gi + 1), bold: true, color: '#FFFFFF' }], sizePx: nameSize, align: 'ctr' }] },
              { merged: true, fill: state.headFill, paras: [] }
            ]
          });
          rows.push({
            h: bodyH,
            cells: [
              { fill: state.colA, paras: a.map(function (p) { return { runs: [{ text: p.name, color: '#000000' }], sizePx: nameSize, align: 'l' }; }) },
              { fill: state.colB, paras: b.map(function (p) { return { runs: [{ text: p.name, color: '#000000' }], sizePx: nameSize, align: 'l' }; }) }
            ]
          });
          gi++;
        }
        tables.push({
          x: margin + ci * (colW + gap), y: margin,
          colWidths: [cellW, cellW],
          border: { color: '#FFFFFF', w: 2.5 },
          font: 'Candara',
          rows: rows
        });
      }

      var bytes = window.pptxLite.makePptx({
        canvasW: CW, canvasH: CH, background: '#FFFFFF', tables: tables
      });
      var blob = new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation' });
      var a2 = document.createElement('a');
      a2.href = URL.createObjectURL(blob);
      a2.download = 'LEADTK_GSL-ABB_' + new Date().toISOString().slice(0, 10) + '.pptx';
      document.body.appendChild(a2);
      a2.click();
      a2.remove();
      setTimeout(function () { URL.revokeObjectURL(a2.href); }, 5000);
    }

    /* ---------- events ---------- */

    var drop = $('ng-drop'), fileInput = $('ng-file');
    drop.addEventListener('click', function () { fileInput.click(); });
    fileInput.addEventListener('change', function () { if (fileInput.files[0]) loadFile(fileInput.files[0]); });
    ['dragover', 'dragenter'].forEach(function (ev) {
      drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.add('drag'); });
    });
    ['dragleave', 'drop'].forEach(function (ev) {
      drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.remove('drag'); });
    });
    drop.addEventListener('drop', function (e) { if (e.dataTransfer.files[0]) loadFile(e.dataTransfer.files[0]); });

    $('ng-sheet').addEventListener('change', function (e) { useSheet(+e.target.value); });
    $('ng-namecol').addEventListener('change', function (e) { state.nameCol = +e.target.value; rebuildPeople(); });
    $('ng-namecol2').addEventListener('change', function (e) { state.nameCol2 = +e.target.value; rebuildPeople(); });
    $('ng-filtercol').addEventListener('change', function (e) {
      state.filterCol = +e.target.value; state.includeValues = null; buildFilterValues(); rebuildPeople();
    });

    function addManual() {
      var v = $('ng-addname').value.trim();
      if (!v) return;
      state.people.push({ id: 'p' + (++uid), name: v, manual: true });
      $('ng-addname').value = '';
      $('ng-count').textContent = state.people.length + ' people';
      $('ng-pptx').disabled = false;
      if (state.teams.length) { state.pool.push(state.people[state.people.length - 1].id); renderTable(); }
      else reallot();
    }
    $('ng-addbtn').addEventListener('click', addManual);
    $('ng-addname').addEventListener('keydown', function (e) { if (e.key === 'Enter') addManual(); });

    $('ng-sample').addEventListener('click', function () {
      var names = (window.LEAD_SAMPLE_NAMES || []).slice(0, 75);
      state.people = names.map(function (n) { return { id: 'p' + (++uid), name: n, manual: false }; });
      $('ng-fileinfo').innerHTML = '<span class="file-info">✓ ' + state.people.length + ' sample names</span>';
      afterPeopleChanged();
    });

    $('ng-sidea').addEventListener('input', function (e) { state.sideA = e.target.value || 'Side 1'; renderTable(); });
    $('ng-sideb').addEventListener('input', function (e) { state.sideB = e.target.value || 'Side 2'; renderTable(); });
    $('ng-cola').addEventListener('input', function (e) { state.colA = e.target.value; renderTable(); });
    $('ng-colb').addEventListener('input', function (e) { state.colB = e.target.value; renderTable(); });
    $('ng-headfill').addEventListener('input', function (e) { state.headFill = e.target.value; renderTable(); });
    $('ng-ts').addEventListener('input', function (e) {
      state.textScale = parseFloat(e.target.value);
      $('ng-ts-o').textContent = state.textScale.toFixed(2).replace(/0$/, '') + '×';
      renderTable();
    });

    // pool accepts drops
    var poolEl = $('ng-pool');
    poolEl.addEventListener('dragover', function (e) { e.preventDefault(); poolEl.style.borderColor = 'var(--blue)'; });
    poolEl.addEventListener('dragleave', function () { poolEl.style.borderColor = ''; });
    poolEl.addEventListener('drop', function (e) {
      e.preventDefault();
      poolEl.style.borderColor = '';
      var id = e.dataTransfer.getData('text/plain');
      if (id) movePerson(id, -1);
    });

    $('ng-shuffle').addEventListener('click', function () {
      state.seed = Math.floor(NATIVE_RANDOM() * 2147483647);
      reallot();
    });
    $('ng-pptx').addEventListener('click', exportPptx);
  }

  /* ---------- register / export ---------- */

  if (typeof window !== 'undefined' && window.LeadToolkit) {
    window.LeadToolkit.registerApp({
      id: 'negotiation',
      icon: '👥🤝',
      group: 'Class 3 - Influence and Persuasion',
      name: 'Group Selector | Abhas & Bussan',
      code: 'GSL-ABB',
      intro: { upload: 'the roster (or use the demo)', to: 'Abhas/Bussan teams of max 3, paired into groups of 4-6; PowerPoint table' },
      tags: ['abhas', 'bussan', 'teams', 'negotiation', 'sides'],
      description: 'Teams of max 3 (worst case 2), paired into negotiation groups of 4-6 with an Abhas side and a Bussan side; drag to adjust, export a real editable PowerPoint table.',
      mount: mount
    });
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
      teamPlan: teamPlan,
      teamSizes: teamSizes,
      allotTeams: allotTeams,
      rowSplit: rowSplit,
      colSplit: colSplit,
      seededShuffle: seededShuffle
    };
  }
})();
