/* ==========================================================================
   Wheel of Names  |  LEADTK_OTH-WHL  |  Class 7 - Leading Inclusively

   A prize wheel for calling on students. The room is split by SEAT, read off
   the Cluster G seating chart: left block DIAMONDS, middle CIRCLES, right
   SQUARES (19 / 40 / 19 over 78 seats). Pick a figure, spin, three names come
   up. Figures rotate square -> circle -> diamond after every spin.

   SETUP is three uploads and is DELIBERATELY NOT the standard Load-data block
   (Dani signed this exemption off, like QR and socialnet): a roster CSV
   (Last, First, Preferred, Seat), the headshots named "Last, First.jpg"
   exactly as they come out of the Headshots folder, and an optional link for
   a panel beside the wheel. Either upload alone is enough and the order does
   not matter; dropping the CSV second keeps the photos already loaded.
   Everything else is edited on the seating chart itself, which is drawn from
   the professor's point of view with the back row at the top, and the same
   chart is the mid-game seat adjuster.

   THE DRAW: each spin deals the remaining pool across the rings and each ring
   picks one of its own slice. Everyone therefore sits on exactly one ring,
   exactly k people are drawn, and everyone's chance is k/pool, identical to
   drawing k without replacement. Chi-square verified, see tests/wheel.js.
   It is also why the names stay readable: a ring holds a third of the pool,
   not all of it.

   THE SPIN is ONE continuous easing curve, never a chain of legs. Chaining is
   what made it jerk, because each new leg started at full speed from a dead
   stop. Velocity is zero either side of the hang and at the finish. It never
   runs backwards, and it parks somewhere random inside the wedge rather than
   dead centre. Roughly half the spins hang on a peg and tug before tipping
   over; that is switched off below 6 names where it only looks odd. Do not
   reintroduce separate animation stages here.

   Anyone marked TA in the roster is out of the draw from the moment it loads.
   Progress survives a refresh; only the reset buttons clear it.

   100% client side. Photos never leave the machine.
   ========================================================================== */
(function () {
  'use strict';


/* ======================================================================
   1. PURE LOGIC   (no DOM; this block is what gets unit tested)
   ====================================================================== */

/* Dani's room, read off the seating chart. Seat numbers run RIGHT to LEFT,
   so seat 1 is the far right of each row. Each row has a left block, a
   middle block and a right block, separated by the two aisles. */
var ROWS   = [['A',8],['B',12],['C',16],['D',20],['E',22]];
var LEFTN  = { A:2, B:3, C:4, D:5, E:5 };   // seats in the left block, per row
var RIGHTN = { A:2, B:3, C:4, D:5, E:5 };   // seats in the right block, per row
var COLS   = { left:5, mid:12, right:5 };   // widest row's block widths

/* Display and rotation order is SQUARE, CIRCLE, DIAMOND. A finished spin
   moves on to the next figure in this order. (Which seats belong to which
   figure is a separate thing and is unchanged: left block of the room is
   Diamonds, middle Circles, right Squares.) */
var GROUPS = [
  { key:'squares',  label:'Squares',  shape:'square',  cls:'squ',
    pal:['#ea580c','#b23c06','#fb923c'], hot:'#fdba74' },
  { key:'circles',  label:'Circles',  shape:'circle',  cls:'cir',
    pal:['#0e9bb5','#0b6f88','#22d3ee'], hot:'#67e8f9' },
  { key:'diamonds', label:'Diamonds', shape:'diamond', cls:'dia',
    pal:['#c026d3','#8b1aa8','#e879f9'], hot:'#f0abfc' }
];

function rowSize(r){ for (var i=0;i<ROWS.length;i++) if (ROWS[i][0]===r) return ROWS[i][1]; return 0; }

/* "C-13" -> 'diamonds' */
function seatGroup(seat){
  var m = String(seat||'').trim().toUpperCase().match(/^([A-E])\s*-\s*(\d+)$/);
  if (!m) return null;
  var r = m[1], num = parseInt(m[2],10), n = rowSize(r);
  if (!n || num < 1 || num > n) return null;
  if (num <= RIGHTN[r]) return 'squares';
  if (num > n - LEFTN[r]) return 'diamonds';
  return 'circles';
}

/* One row of the chart. The room numbers seats right to left, so laid out
   the way the STUDENTS see it a row reads n..1. The chart is drawn from the
   PROFESSOR's point of view, facing the class, which mirrors it: seat 1 ends
   up on the left and the blocks read squares, circles, diamonds across the
   page. Combined with the vertical flip in chartHtml (back row at the top),
   what Dani sees on screen matches what she sees standing at the front.
   The seat-to-figure mapping is NOT affected by any of this; seat A-1 is a
   Squares seat however it happens to be drawn.
   null entries are empty grid cells, 'gap' marks an aisle. */
function rowCells(r){
  var n = rowSize(r), L = LEFTN[r], R = RIGHTN[r], M = n - L - R;
  var cells = [], i;
  for (i=0;i<COLS.left;i++)  cells.push(i >= COLS.left - L ? n - (i - (COLS.left - L)) : null);
  cells.push('gap');
  var start = Math.floor((COLS.mid - M)/2);
  for (i=0;i<COLS.mid;i++)   cells.push((i >= start && i < start + M) ? (n - L) - (i - start) : null);
  cells.push('gap');
  for (i=0;i<COLS.right;i++) cells.push(i < R ? R - i : null);
  return cells.reverse();                    // mirror into the professor's view
}

/* --- CSV --- */
function parseCsv(text){
  var rows = [], row = [], cur = '', q = false, i, c;
  text = String(text).replace(/^﻿/,'');
  for (i=0;i<text.length;i++){
    c = text[i];
    if (q){
      if (c === '"'){ if (text[i+1] === '"'){ cur += '"'; i++; } else q = false; }
      else cur += c;
    } else if (c === '"'){ q = true; }
    else if (c === ','){ row.push(cur); cur = ''; }
    else if (c === '\n'){ row.push(cur); rows.push(row); row = []; cur = ''; }
    else if (c === '\r'){ /* skip */ }
    else cur += c;
  }
  if (cur !== '' || row.length){ row.push(cur); rows.push(row); }
  return rows.filter(function(r){ return r.some(function(x){ return String(x).trim() !== ''; }); });
}

function colIndex(headers, re){
  for (var i=0;i<headers.length;i++) if (re.test(String(headers[i]).trim())) return i;
  return -1;
}

/* Anyone who is not a student gets taken out of the draw on load, no
   clicking. Dani's roster already flags them with Preferred = "TA"; a Role
   column or a "(TA)" suffix on the name works too. Deliberately strict, so
   real names like Taj or Tanaka can never trip it. */
var STAFF_WORDS = /\bteaching\s*assistants?\b|\binstructor\b|\bstaff\b|\bfaculty\b|\bprofessor\b|\bgrader\b/i;
var STAFF_TAG   = /\(\s*t\.?\s*a\.?\s*\)|[,\-–]\s*t\.?\s*a\.?\s*$/i;   // "Rincon (TA)", "Rincon, TA"
function isStaff(p){
  var role = norm(p.role || '').replace(/ /g,'');
  if (/^(ta|teachingassistant|instructor|staff|faculty|prof|professor|grader)$/.test(role)) return true;
  var fields = [p.preferred, p.first, p.last];
  for (var i=0;i<fields.length;i++){
    if (norm(fields[i]).replace(/ /g,'') === 'ta') return true;       // "TA", "T.A."
    if (STAFF_TAG.test(String(fields[i] || ''))) return true;         // "Name (TA)"
  }
  return STAFF_WORDS.test([p.last, p.first, p.preferred].join(' '));
}

/* -> [{last, first, preferred, seat, group, role, out}] */
function parseRoster(text){
  var rows = parseCsv(text);
  if (!rows.length) return [];
  var h = rows[0];
  var iL = colIndex(h,/^last|surname/i), iF = colIndex(h,/^first/i),
      iP = colIndex(h,/prefer|nickname|goes\s*by/i), iS = colIndex(h,/seat/i),
      iR = colIndex(h,/^role|^type$|^status/i);
  if (iL === -1 && iF === -1) return [];
  var out = [];
  rows.slice(1).forEach(function(r){
    var last = (iL !== -1 ? r[iL] : '') || '';
    var first = (iF !== -1 ? r[iF] : '') || '';
    var pref = (iP !== -1 ? r[iP] : '') || '';
    var seat = (iS !== -1 ? r[iS] : '') || '';
    var role = (iR !== -1 ? r[iR] : '') || '';
    last = last.trim(); first = first.trim(); seat = seat.trim().toUpperCase();
    if (!last && !first) return;
    var p = { last:last, first:first, preferred:(pref.trim() || first || last),
              seat:seat, group:seatGroup(seat), role:role.trim() };
    p.out = isStaff(p);
    out.push(p);
  });
  return out;
}

/* identity that survives a roster reload, so a person you took out by hand
   stays out next time you drop the CSV in */
function personKey(p){ return norm(p.last) + '|' + norm(p.first); }

/* --- generous photo matching --- */
function norm(s){
  return String(s||'').normalize ? String(s).normalize('NFD').replace(/[̀-ͯ]/g,'')
         .toLowerCase().replace(/[^a-z]+/g,' ').trim()
       : String(s||'').toLowerCase().replace(/[^a-z]+/g,' ').trim();
}

/* "Rieger, Itai.jpg" -> {last:'Rieger', first:'Itai'}; also copes with
   "Itai Rieger.jpg", stray numbering, and double extensions */
function splitPhotoName(fname){
  var base = String(fname||'').replace(/\.(jpe?g|png|webp|gif|bmp|heic)$/i,'').trim();
  base = base.replace(/^\d+[\s._-]+/,'');                 // leading "01 " / "12_"
  var k = base.indexOf(',');
  if (k !== -1) return { last: base.slice(0,k).trim(), first: base.slice(k+1).trim() };
  var p = base.split(/\s+/);
  if (p.length === 1) return { last: p[0], first: '' };
  return { first: p[0], last: p.slice(1).join(' ') };      // "First Last"
}

/* returns index into roster, or -1. Four passes, loosest last. */
function matchPerson(fname, roster){
  var s = splitPhotoName(fname), L = norm(s.last), F = norm(s.first), i, hits;
  if (!L && !F) return -1;
  for (i=0;i<roster.length;i++)                                   // exact last + first
    if (norm(roster[i].last) === L && norm(roster[i].first) === F) return i;
  for (i=0;i<roster.length;i++)                                   // last + preferred
    if (norm(roster[i].last) === L && norm(roster[i].preferred) === F) return i;
  hits = [];
  for (i=0;i<roster.length;i++)                                   // last + first initial
    if (norm(roster[i].last) === L && (!F || norm(roster[i].first).charAt(0) === F.charAt(0))) hits.push(i);
  if (hits.length === 1) return hits[0];
  hits = [];
  for (i=0;i<roster.length;i++){                                  // every token present
    var hay = norm(roster[i].last + ' ' + roster[i].first + ' ' + roster[i].preferred);
    var toks = (L + ' ' + F).split(' ').filter(Boolean);
    if (toks.length && toks.every(function(t){ return hay.indexOf(t) !== -1; })) hits.push(i);
  }
  return hits.length === 1 ? hits[0] : -1;
}

/* --- the draw ---
   Deal the remaining pool round robin into k slices, one per ring, after a
   shuffle. Each ring then picks one of its own. Every person ends up on
   exactly one ring and exactly k people are drawn, so the chance of being
   picked is k/pool for everyone, same as drawing k without replacement. */
function partition(pool, k, rnd){
  rnd = rnd || Math.random;
  var a = pool.slice(), i, j, t;
  for (i=a.length-1;i>0;i--){ j = Math.floor(rnd()*(i+1)); t=a[i]; a[i]=a[j]; a[j]=t; }
  k = Math.max(1, Math.min(k, a.length));
  var parts = [];
  for (i=0;i<k;i++) parts.push([]);
  a.forEach(function(p, idx){ parts[idx % k].push(p); });
  return parts;
}

function pickOne(part, rnd){
  rnd = rnd || Math.random;
  return part.length ? Math.floor(rnd()*part.length) : -1;
}

/* rotation that parks segment idx of an n-segment ring under the 12 o'clock
   picker after at least `turns` whole revolutions in direction `dir` */
function targetRotation(cur, n, idx, turns, dir){
  var seg = 2*Math.PI/n, TWO = 2*Math.PI;
  var want = -Math.PI/2 - (idx + 0.5)*seg, k;
  if (dir > 0){ k = Math.ceil((cur - want)/TWO);  return want + k*TWO + turns*TWO; }
  k = Math.floor((cur - want)/TWO);               return want + k*TWO - turns*TWO;
}

/* ring radii as fractions of R, for k rings. Each ring leaves a clear band
   above its outer edge for its own picker. Outer ring is index 0. */
function ringGeom(k){
  var PICK = 0.065, HUB = { 1:0.42, 2:0.33, 3:0.285 }[k] || 0.285;
  var pad = 0.045;                                  // hub to innermost ring
  var avail = 0.99 - HUB - pad - k*PICK;
  var th = avail / k;
  var out = [], r0 = HUB + pad;
  for (var i=0;i<k;i++){ out.push({ rIn:r0, rOut:r0 + th }); r0 += th + PICK; }
  out.reverse();                                    // index 0 = outermost
  return { hub:HUB, rings:out };
}

function easeOutQuart(t){ return 1 - Math.pow(1-t,4); }
function easeOutCubic(t){ return 1 - Math.pow(1-t,3); }
function linear(t){ return t; }
/* zero velocity AND zero acceleration at both ends: the only way to start
   and stop a creep without the eye reading it as a jerk */
function smootherstep(t){ return t*t*t*(t*(6*t - 15) + 10); }

/* ---------------------------------------------------------------------
   HOW A REAL PRIZE WHEEL STOPS
   A wheel never runs backwards. It slows, and the flapper rides over the
   pegs; near the end it can barely clear one, so it hangs on a peg,
   trembles between the two wedges either side of it, then tips forward
   into one. That forward tip is a fraction of a wedge, never a whole one.
   So: motion is MONOTONIC in the spin direction, the resting point is
   somewhere random inside the wedge rather than dead centre, and the
   drama is a hesitation at a peg, not a reversal.

   ONE continuous move, never a chain of separate animations. Chaining was
   what made it jerk: each new leg started at its own full speed from a dead
   stop. Here the whole spin is a single easing curve whose velocity is zero
   on both sides of the hang and at the finish, so there is no instant where
   speed changes abruptly.
   --------------------------------------------------------------------- */
function spinStages(fromRot, centreRot, seg, dir, baseDur, n, dramatic, rnd){
  rnd = rnd || Math.random;
  // never park dead centre: sit anywhere in the middle 70% of the wedge
  var jit = (rnd()*0.70 - 0.35) * seg;
  var finalRot = centreRot + jit;

  // a hesitation only reads when the wedges are small enough to have pegs
  // close together; with a handful of names left it just looks odd
  if (!dramatic || n < 6){
    return [{ to: finalRot, dur: baseDur + rnd()*500, ease: easeOutQuart }];
  }

  // where the wheel hangs: just past the peg, so the picker is still on the
  // wedge BEFORE the winner (0.56 > half a wedge, so genuinely the other side)
  var holdRot = centreRot - dir*seg*0.56;
  var total = finalRot - fromRot;
  var f = (holdRot - fromRot)/total;            // share of the trip done before the hang
  if (!(f > 0 && f < 1)) return [{ to: finalRot, dur: baseDur + rnd()*500, ease: easeOutQuart }];

  var t1 = 0.60, t2 = 0.80;                     // spin down · hang · tip over
  // The tug is deliberately TINY: under a degree, one slow rock. Big enough
  // to read as the wheel straining against the peg, far too small to look
  // like it is running backwards. Capped in absolute terms so a nearly empty
  // wheel with huge wedges does not swing wildly.
  var amp = Math.min(seg*0.011, 0.007), cyc = 1.0;

  var ease = function(t){
    if (t <= t1) return f * easeOutQuart(t/t1);           // ends at zero speed
    if (t <= t2) return f;                                // hangs, still
    return f + (1-f)*smootherstep((t-t2)/(1-t2));         // leaves and arrives at zero speed
  };
  // rocks against the peg. sin squared means the rock itself fades in and
  // out rather than switching on, so it never snaps either.
  var wob = function(t){
    if (t <= t1 || t >= t2) return 0;
    var u = (t-t1)/(t2-t1), env = Math.sin(Math.PI*u);
    return Math.sin(2*Math.PI*cyc*u) * amp * env * env;
  };
  return [{ to: finalRot, dur: baseDur + 1700 + rnd()*500, ease: ease, wob: wob }];
}

var PURE = { isStaff:isStaff, personKey:personKey,
             seatGroup:seatGroup, rowCells:rowCells, parseRoster:parseRoster, parseCsv:parseCsv,
             splitPhotoName:splitPhotoName, matchPerson:matchPerson, partition:partition,
             targetRotation:targetRotation, ringGeom:ringGeom, norm:norm, rowSize:rowSize,
             spinStages:spinStages, easeOutQuart:easeOutQuart, easeOutCubic:easeOutCubic,
             ROWS:ROWS, LEFTN:LEFTN, RIGHTN:RIGHTN, COLS:COLS };
if (typeof module !== 'undefined' && module.exports){ module.exports = PURE; return; }

  var CSS = "#wh-root{--navy:#08306b;--gold:#ffd166;--line:#dbe3ee;--font-head:Corbel,'Segoe UI',Calibri,'Gill Sans',sans-serif;--font-body:Candara,'Gill Sans',Calibri,'Segoe UI',sans-serif;--dia:#c026d3;--cir:#0e9bb5;--squ:#ea580c;color:#111318;font-family:var(--font-body);font-size:15px}\n\n  \n  #wh-root *{box-sizing:border-box}\n  #wh-root button{font-family:var(--font-head)}\n\n  \n  #wh-root #wh-setup{background:#f4f7fb;color:#111318;border:1px solid #dbe3ee;border-radius:12px;overflow:hidden}\n  #wh-root .shead{position:sticky;top:0;z-index:20;background:var(--navy);color:#fff;display:flex;align-items:center;\n         gap:16px;padding:12px 24px;box-shadow:0 2px 14px rgba(0,0,0,.25)}\n  #wh-root .shead h1{font-family:var(--font-head);font-size:21px;margin:0;font-weight:600}\n  #wh-root .shead h1 span{color:var(--gold)}\n  #wh-root .shead .ver{font-size:11.5px;opacity:.6;letter-spacing:1px;margin-left:6px}\n  #wh-root .grow{flex:1}\n  #wh-root .go{font-size:18px;font-weight:700;letter-spacing:1.5px;padding:10px 32px;border:none;border-radius:999px;\n      cursor:pointer;color:#07203f;background:linear-gradient(180deg,#ffe08a,#f4b740);box-shadow:0 4px 0 #b9821f}\n  #wh-root .go:active{transform:translateY(2px);box-shadow:0 2px 0 #b9821f}\n  #wh-root .go[disabled]{filter:grayscale(.8);opacity:.5;cursor:default;box-shadow:0 4px 0 #666}\n  #wh-root .wrap{max-width:1360px;margin:0 auto;padding:22px 24px 70px}\n  #wh-root .card{background:#fff;border:1px solid var(--line);border-radius:12px;padding:18px 20px;margin-bottom:18px;\n        box-shadow:0 1px 2px rgba(8,48,107,.06),0 8px 24px rgba(8,48,107,.05)}\n  #wh-root .card h2{font-family:var(--font-head);color:#2E74B5;font-size:18px;margin:0 0 4px}\n  #wh-root .card h2 .n{display:inline-flex;width:24px;height:24px;border-radius:50%;background:var(--navy);color:#fff;\n              align-items:center;justify-content:center;font-size:13px;margin-right:9px;vertical-align:2px}\n  #wh-root .card .sub{color:#64748b;font-size:13.5px;margin:0 0 14px}\n  #wh-root .dz{border:2px dashed #b9cbe4;border-radius:10px;padding:16px;text-align:center;cursor:pointer;background:#fafcff;\n      transition:.12s}\n  #wh-root .dz:hover, #wh-root .dz.over{background:#e7f1fd;border-color:#0081cd}\n  #wh-root .dz b{display:block;font-family:var(--font-head);letter-spacing:1px;color:var(--navy);font-size:14px}\n  #wh-root .dz span{font-size:12.5px;color:#64748b}\n  #wh-root .row{display:flex;gap:12px;align-items:center;flex-wrap:wrap;margin-top:12px}\n  #wh-root .mini{font-size:13px;padding:7px 13px;border-radius:8px;border:1px solid var(--line);background:#fff;cursor:pointer}\n  #wh-root .mini:hover{background:#eef4fc}\n  #wh-root .stat{font-size:13px;color:#166534}\n  #wh-root .stat.warn{color:#b45309}\n  #wh-root input[type=url], #wh-root input[type=text]{font-family:var(--font-body);font-size:13.5px;padding:7px 10px;\n       border:1px solid var(--line);border-radius:8px;min-width:280px}\n  #wh-root select{font-family:var(--font-body);font-size:13.5px;padding:6px 8px;border:1px solid var(--line);border-radius:8px}\n\n  \n  \n  #wh-root .chartbox{overflow:auto;padding:6px 0 2px}\n  #wh-root .chartinner{width:max-content;min-width:100%;margin:0 auto}\n  #wh-root .srow{display:flex;gap:3px;margin-bottom:3px;align-items:stretch;justify-content:flex-start}\n  #wh-root .scell{width:56px;height:76px;border-radius:6px;position:relative;flex:0 0 auto}\n  #wh-root .scell.gap{background:transparent}\n  #wh-root .scell.seat{border:1px solid #cfdcec;background:#f8fafc;cursor:grab;overflow:hidden;\n              display:flex;flex-direction:column;align-items:center;justify-content:flex-start;padding-top:3px}\n  #wh-root .scell.seat:hover{box-shadow:0 0 0 2px #0081cd inset}\n  #wh-root .scell.seat.dia{background:#fbeaff;border-color:#e9b7f5}\n  #wh-root .scell.seat.cir{background:#e4f6fb;border-color:#a9dbe8}\n  #wh-root .scell.seat.squ{background:#fff0e4;border-color:#f6c69c}\n  #wh-root .scell.seat.empty{opacity:.45}\n  #wh-root .scell.seat.out{opacity:.4;filter:grayscale(1)}\n  #wh-root .scell.seat.out:after{content:'';position:absolute;left:4px;right:4px;top:50%;height:2px;background:#64748b;\n                        transform:rotate(-14deg)}\n  #wh-root .scell.drag{outline:2px solid var(--navy);outline-offset:1px}\n  #wh-root .scell img, #wh-root .scell .av{width:32px;height:32px;border-radius:50%;object-fit:cover;display:block;\n        border:1.5px solid #fff;box-shadow:0 1px 3px rgba(0,0,0,.25)}\n  #wh-root .scell .av{display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;color:#fff}\n  #wh-root .scell .nm{font-size:11px;line-height:1.12;text-align:center;margin-top:3px;max-width:54px;overflow:hidden;\n             white-space:nowrap;text-overflow:ellipsis;color:#1a2333;font-weight:600}\n  #wh-root .scell .ln{font-size:8.5px;line-height:1.1;text-align:center;max-width:54px;overflow:hidden;\n             white-space:nowrap;text-overflow:ellipsis;color:#7b8ca4}\n  #wh-root .scell .st{position:absolute;bottom:1px;right:3px;font-size:7.5px;color:#94a3b8}\n\n  \n  #wh-root .loadrow{display:grid;grid-template-columns:1fr 1fr 1.1fr;gap:20px;align-items:start}\n  #wh-root .lbl{display:block;font-family:var(--font-head);font-size:13px;color:#2E74B5;margin-bottom:6px;font-weight:600}\n  #wh-root .lbl span{display:block;font-family:var(--font-body);font-size:11.5px;color:#94a3b8;font-weight:400}\n  #wh-root .dz.slim{padding:11px 8px;margin-bottom:7px}\n  #wh-root .dz.slim b{font-size:12.5px}\n  #wh-root #wh-editor{position:fixed;z-index:40;width:236px;background:#fff;border:1px solid #c3d3e6;border-radius:10px;\n          padding:12px;box-shadow:0 18px 44px rgba(8,48,107,.3);display:none;color:#111318}\n  #wh-root #wh-editor.on{display:block}\n  #wh-root #wh-editor .ehead{display:flex;align-items:center;gap:9px;margin-bottom:9px}\n  #wh-root #wh-editor .ehead img, #wh-root #wh-editor .ehead .av{width:40px;height:40px;border-radius:50%;object-fit:cover;\n          display:flex;align-items:center;justify-content:center;color:#fff;font-weight:700;font-size:14px}\n  #wh-root #wh-editor .ehead b{font-family:var(--font-head);font-size:13px;color:#2E74B5}\n  #wh-root #wh-editor .ehead .sm{font-size:11px;color:#64748b;display:block}\n  #wh-root #wh-editor label{display:block;font-size:10.5px;color:#64748b;margin:7px 0 2px;letter-spacing:.4px;font-family:var(--font-head)}\n  #wh-root #wh-editor input{width:100%;font-family:var(--font-body);font-size:13.5px;padding:6px 8px;\n          border:1px solid var(--line);border-radius:7px}\n  #wh-root #wh-editor input.big{font-size:15px;font-weight:600}\n  #wh-root #wh-editor .erow{display:flex;gap:7px}\n  #wh-root #wh-editor .erow>div{flex:1}\n  #wh-root #wh-editor .ebtns{display:flex;gap:6px;margin-top:11px;flex-wrap:wrap}\n  #wh-root #wh-editor .ebtns button{flex:1;font-size:12px;padding:6px 8px;border-radius:7px;border:1px solid var(--line);\n          background:#fff;cursor:pointer;white-space:nowrap}\n  #wh-root #wh-editor .ebtns button:hover{background:#eef4fc}\n  #wh-root #wh-editor .ebtns button.warn{color:#b91c1c;border-color:#f3c9c9}\n  #wh-root .rowlab{width:20px;display:flex;align-items:center;justify-content:center;font-family:var(--font-head);\n          font-size:12px;color:#94a3b8;flex:0 0 auto}\n  #wh-root .stagebar{text-align:center;font-family:var(--font-head);letter-spacing:4px;font-size:11px;color:#94a3b8;\n            border-top:2px solid #cbd5e1;margin:10px auto 0;max-width:560px;padding-top:5px}\n  #wh-root .legend{display:flex;gap:16px;align-items:center;font-size:13px;margin-top:12px;flex-wrap:wrap}\n  #wh-root .legend i{display:inline-block;width:13px;height:13px;margin-right:5px;vertical-align:-2px}\n  #wh-root .lg-d{background:var(--dia);transform:rotate(45deg)}\n  #wh-root .lg-c{background:var(--cir);border-radius:50%}\n  #wh-root .lg-s{background:var(--squ)}\n\n  \n  #wh-root #wh-game{display:none}\n  #wh-root #wh-game.on{display:flex;position:fixed;inset:0;z-index:9000;background:#061f45;color:#fff;font-family:var(--font-body)}\n  #wh-root #wh-side{height:100%;border:0;background:#fff;flex:0 0 45%;display:none}\n  #wh-root #wh-side.on{display:block}\n  \n  #wh-root #wh-split{flex:0 0 10px;cursor:col-resize;background:rgba(255,255,255,.07);display:none;position:relative;\n         touch-action:none}\n  #wh-root #wh-split.on{display:block}\n  \n  body.splitting #wh-side{pointer-events:none}\n  body.splitting{cursor:col-resize;user-select:none}\n  #wh-root #wh-split:hover, #wh-root #wh-split.dragging{background:var(--gold)}\n  #wh-root #wh-split:after{content:'';position:absolute;left:2px;top:50%;width:3px;height:46px;margin-top:-23px;\n               border-radius:3px;background:rgba(255,255,255,.3)}\n  #wh-root #wh-split:hover:after, #wh-root #wh-split.dragging:after{background:rgba(7,32,63,.5)}\n  #wh-root .arena{flex:1;position:relative;overflow:hidden;\n         background:radial-gradient(ellipse at 50% 44%,#123a74 0%,#061f45 58%,#04142c 100%)}\n  #wh-root canvas{position:absolute;inset:0;width:100%;height:100%}\n  #wh-root #wh-fx{pointer-events:none}\n\n  \n  #wh-root #wh-shapes{position:absolute;right:14px;top:50%;transform:translateY(-50%);display:flex;flex-direction:column;gap:18px;z-index:5}\n  #wh-root .shp{width:50px;height:50px;border:none;background:none;cursor:pointer;padding:0;opacity:.42;transition:.16s;\n       filter:drop-shadow(0 3px 7px rgba(0,0,0,.5))}\n  #wh-root .shp:hover{opacity:.8}\n  #wh-root .shp.on{opacity:1;transform:scale(1.22)}\n  #wh-root .shp svg{width:100%;height:100%;display:block}\n\n  \n  #wh-root #wh-gear{position:absolute;right:14px;bottom:12px;width:34px;height:34px;border-radius:50%;border:none;cursor:pointer;\n        background:rgba(255,255,255,.08);color:rgba(255,255,255,.35);font-size:17px;line-height:1;z-index:8;transition:.16s}\n  #wh-root #wh-gear:hover{background:rgba(255,255,255,.22);color:#fff}\n  #wh-root #wh-panel{position:absolute;right:14px;bottom:54px;width:300px;background:#0d2b55;border:1px solid rgba(255,209,102,.4);\n         border-radius:12px;padding:14px;display:none;z-index:9;box-shadow:0 14px 40px rgba(0,0,0,.6)}\n  #wh-root #wh-panel.on{display:block}\n  #wh-root #wh-panel h3{font-family:var(--font-head);font-size:13px;margin:0 0 9px;color:var(--gold);letter-spacing:1px;font-weight:600}\n  #wh-root #wh-panel button{display:block;width:100%;text-align:left;font-size:13.5px;padding:8px 11px;margin-bottom:6px;\n                border-radius:8px;border:1px solid rgba(255,255,255,.18);background:rgba(255,255,255,.07);color:#fff;cursor:pointer}\n  #wh-root #wh-panel button:hover{background:rgba(255,255,255,.17)}\n  #wh-root #wh-panel .pstat{font-size:12px;opacity:.6;margin-top:8px;line-height:1.5}\n\n  \n  #wh-root #wh-adjust{position:absolute;inset:0;background:rgba(4,16,36,.93);z-index:12;display:none;overflow:auto;padding:18px}\n  #wh-root #wh-adjust.on{display:block}\n  #wh-root #wh-adjust .ahead{display:flex;align-items:center;gap:14px;margin-bottom:12px}\n  #wh-root #wh-adjust h3{font-family:var(--font-head);font-size:17px;margin:0;color:var(--gold);font-weight:600}\n  #wh-root #wh-adjust .note{font-size:12.5px;opacity:.65}\n  #wh-root #wh-adjust .scell.seat{background:#12305c;border-color:#29496f;color:#fff}\n  #wh-root #wh-adjust .scell.seat.dia{background:#4a1259;border-color:#7d2a90}\n  #wh-root #wh-adjust .scell.seat.cir{background:#0b3b47;border-color:#17697e}\n  #wh-root #wh-adjust .scell.seat.squ{background:#51250c;border-color:#8a4414}\n  #wh-root #wh-adjust .scell .nm{color:#eaf1fb}\n  #wh-root #wh-adjust .scell .st{color:#7b93b4}\n  #wh-root #wh-adjust .stagebar{color:#7b93b4;border-color:#30496b}\n  #wh-root #wh-adjust .rowlab{color:#7b93b4}\n\n  \n  #wh-root #wh-winners{position:absolute;inset:0;display:none;align-items:center;justify-content:center;gap:clamp(14px,3vw,48px);\n           background:rgba(4,16,36,.87);backdrop-filter:blur(3px);cursor:pointer;flex-wrap:wrap;padding:20px;z-index:6}\n  #wh-root #wh-winners.show{display:flex}\n  #wh-root .win{text-align:center;transform:scale(.3);opacity:0;animation:pop .5s cubic-bezier(.2,1.5,.4,1) forwards}\n  #wh-root .win:nth-child(2){animation-delay:.14s}\n  #wh-root .win:nth-child(3){animation-delay:.28s}\n  \n  #wh-root .win .ph{width:clamp(130px,16vw,240px);height:clamp(130px,16vw,240px);border-radius:50%;object-fit:cover;\n           border:7px solid var(--gold);box-shadow:0 0 0 5px rgba(255,255,255,.14),0 18px 50px rgba(0,0,0,.6);\n           display:flex;align-items:center;justify-content:center;font-family:var(--font-head);font-size:52px;color:#fff}\n  #wh-root .win .nm{font-family:var(--font-head);font-size:clamp(22px,2.6vw,36px);margin-top:16px;\n           text-shadow:0 3px 14px rgba(0,0,0,.7);line-height:1.2}\n  #wh-root .win .nm small{display:block;font-size:.5em;color:var(--gold);letter-spacing:2px;opacity:.85;margin-top:5px}\n  #wh-root .toast{position:absolute;left:50%;top:18px;transform:translateX(-50%);background:rgba(13,43,85,.95);\n         border:1px solid rgba(255,209,102,.5);border-radius:10px;padding:8px 16px;font-size:13.5px;z-index:14;\n         display:none}\n  #wh-root .toast.on{display:block}\n\n@keyframes pop{to{transform:scale(1);opacity:1}}";

  var HTML = "<!-- ==================== SETUP ==================== -->\n<div id=\"wh-setup\">\n  <div class=\"shead\">\n    <h1>\ud83c\udfa1 Wheel of <span>Names</span><span class=\"ver\">PREVIEW v2</span></h1>\n    <div class=\"grow\"></div>\n    <button class=\"mini\" id=\"wh-btn-clear\" style=\"color:#111\">\u21ba Clear the picks</button>\n    <button class=\"mini\" id=\"wh-btn-wipe\" style=\"color:#b91c1c\">\u232b Reset everything</button>\n    <button class=\"go\" id=\"wh-btn-start\" disabled>START</button>\n  </div>\n\n  <div class=\"wrap\">\n\n    <div class=\"card\">\n      <div class=\"loadrow\">\n        <div>\n          <label class=\"lbl\">Roster CSV <span>optional. Last, First, Preferred, Seat. Anyone marked TA is taken out.</span></label>\n          <div class=\"dz slim\" id=\"wh-dz-csv\"><b>DROP CSV</b></div>\n          <input type=\"file\" id=\"wh-f-csv\" accept=\".csv,text/csv\" style=\"display:none\">\n          <button class=\"mini\" id=\"wh-btn-tpl\">\u2b07 blank template</button>\n        </div>\n        <div>\n          <label class=\"lbl\">Headshots <span>named \"Last, First.jpg\". Enough on their own: the names come from the file names.</span></label>\n          <div class=\"dz slim\" id=\"wh-dz-pic\"><b>DROP PHOTOS</b></div>\n          <input type=\"file\" id=\"wh-f-pic\" accept=\"image/*\" multiple style=\"display:none\">\n          <button class=\"mini\" id=\"wh-btn-demo2\">\ud83c\udfb2 demo roster</button>\n        </div>\n        <div>\n          <label class=\"lbl\">Left panel <span>optional, must allow embedding</span></label>\n          <input type=\"url\" id=\"wh-f-url\" placeholder=\"https://\u2026\" autocomplete=\"off\" style=\"width:100%\">\n          <label style=\"font-size:13px;display:block;margin-top:7px\"><input type=\"checkbox\" id=\"wh-f-urlon\"> show it beside the wheel</label>\n        </div>\n      </div>\n      <div class=\"row\" style=\"margin-top:4px\">\n        <span class=\"stat\" id=\"wh-st-csv\"></span><span class=\"stat\" id=\"wh-st-pic\"></span><span class=\"stat\" id=\"wh-st-url\"></span>\n      </div>\n    </div>\n\n    <div class=\"card\">\n      <h2>Seating chart <span style=\"font-size:13px;color:#94a3b8;font-weight:400\">your point of view, back row at the top</span></h2>\n      <p class=\"sub\"><b>Click</b> anyone to fix their name, swap their photo or take them out of the draw. <b>Drag</b> them onto another seat to swap seats. Groups follow the seat.</p>\n      <div class=\"row\" id=\"wh-seatrow\" style=\"display:none;margin:0 0 10px\">\n        <span class=\"stat warn\" id=\"wh-st-seat\"></span>\n        <button class=\"mini\" id=\"wh-btn-seat\">\ud83c\udfb2 Assign them to free seats at random</button>\n      </div>\n      <div class=\"chartbox\" id=\"wh-chart\"></div>\n      <div class=\"stagebar\">FRONT OF ROOM / YOU</div>\n      <div class=\"legend\">\n        <span><i class=\"lg-s\"></i><b id=\"wh-c-squ\">0</b> Squares</span>\n        <span><i class=\"lg-c\"></i><b id=\"wh-c-cir\">0</b> Circles</span>\n        <span><i class=\"lg-d\"></i><b id=\"wh-c-dia\">0</b> Diamonds</span>\n        <span id=\"wh-c-out\" style=\"color:#b45309\"></span>\n        <span style=\"margin-left:auto;color:#64748b\">names per spin:</span>\n        <label style=\"font-size:13px\">\u25a0 <select id=\"wh-r-squ\"><option>1</option><option>2</option><option selected>3</option></select></label>\n        <label style=\"font-size:13px\">\u25cf <select id=\"wh-r-cir\"><option>1</option><option>2</option><option selected>3</option></select></label>\n        <label style=\"font-size:13px\">\u25c6 <select id=\"wh-r-dia\"><option>1</option><option>2</option><option selected>3</option></select></label>\n        <label style=\"font-size:13px;margin-left:14px\"><input type=\"checkbox\" id=\"wh-f-norepeat\" checked> no repeats</label>\n      </div>\n    </div>\n\n  </div>\n</div>\n\n<!-- ==================== GAME ==================== -->\n<div id=\"wh-game\">\n  <iframe id=\"wh-side\" title=\"panel\" referrerpolicy=\"no-referrer\"></iframe>\n  <div id=\"wh-split\" title=\"drag to resize\"></div>\n  <div class=\"arena\" id=\"wh-arena\">\n    <canvas id=\"wh-wheel\"></canvas>\n    <canvas id=\"wh-fx\"></canvas>\n    <div id=\"wh-shapes\"></div>\n    <div id=\"wh-winners\"></div>\n    <button id=\"wh-gear\" title=\"settings\">\u2699</button>\n    <div id=\"wh-panel\">\n      <h3>WHEEL</h3>\n      <button id=\"wh-p-adjust\">Seat adjuster</button>\n      <button id=\"wh-p-full\">Full screen</button>\n      <button id=\"wh-p-undo\">Undo last spin</button>\n      <button id=\"wh-p-setup\">Back to setup</button>\n      <button id=\"wh-p-reset\">Put everyone back in</button>\n      <div class=\"pstat\" id=\"wh-p-stat\"></div>\n    </div>\n    <div id=\"wh-adjust\">\n      <div class=\"ahead\">\n        <h3>Seat adjuster</h3>\n        <span class=\"note\">drag anyone onto another seat to swap them. Back row at the top, the way you see the room.</span>\n        <div class=\"grow\"></div>\n        <button class=\"mini\" id=\"wh-a-close\" style=\"color:#111\">Close</button>\n      </div>\n      <div class=\"chartbox\" id=\"wh-chart2\"></div>\n      <div class=\"stagebar\">FRONT OF ROOM / YOU</div>\n    </div>\n    <div class=\"toast\" id=\"wh-toast\"></div>\n  </div>\n</div>\n\n<!-- one seat editor, shared by the setup chart and the mid-game adjuster -->\n<div id=\"wh-editor\"></div>\n<input type=\"file\" id=\"wh-f-one\" accept=\"image/*\" style=\"display:none\">";

  var cssDone = false;
  function injectCss(){
    if (cssDone || document.getElementById('wh-css')){ cssDone = true; return; }
    cssDone = true;
    var st = document.createElement('style');
    st.id = 'wh-css';
    st.textContent = CSS;
    document.head.appendChild(st);
  }

  /* document-level listeners attach once, not once per remount */
  var docWired = false;
  function docOn(a, b, c){ if (!docWired) document.addEventListener(a, b, c); }
  function winOn(a, b, c){ if (!docWired) window.addEventListener(a, b, c); }

  /* the split handle is rebuilt on every mount, so its drag state lives here */
  var splitDrag = false;
  function endSplit(e){
    if (!splitDrag) return;
    splitDrag = false;
    var bar = document.getElementById('wh-split');
    if (bar){
      if (e){ try { bar.releasePointerCapture(e.pointerId); } catch(err){} }
      bar.classList.remove('dragging');
    }
    document.body.classList.remove('splitting');
    save();
  }

window.WHEEL = PURE;

/* ======================================================================
   2. STATE + PERSISTENCE
   ====================================================================== */

var KEY = 'leadtk-wheel-v2';
var pid = 0;                   // person ids, unique whatever the roster came from
var S = {
  roster: [],                 // {id,last,first,preferred,seat,group,thumbData}
  used: {},                   // id -> true
  outKeys: [],                // people you took out by hand, remembered by name
  history: [],                // [{used:{...}, winners:[ids]}], newest last
  group: 'squares',
  rings: { squares:3, circles:3, diamonds:3 },
  noRepeat: true,
  url: '', urlOn: false, splitPct: 45,
  started: false
};

function save(){
  try {
    localStorage.setItem(KEY, JSON.stringify({
      roster: S.roster, used: S.used, outKeys: S.outKeys, history: S.history.slice(-6), group: S.group,
      rings: S.rings, noRepeat: S.noRepeat, url: S.url, urlOn: S.urlOn,
      splitPct: S.splitPct, started: S.started
    }));
  } catch(e){ toast('Could not save progress (storage full). Photos may be too large.'); }
}
function load(){
  try {
    var raw = localStorage.getItem(KEY);
    if (!raw) return false;
    var d = JSON.parse(raw);
    if (!d || !d.roster || !d.roster.length) return false;
    S.roster = d.roster; S.used = d.used || {}; S.history = d.history || [];
    S.outKeys = d.outKeys || [];
    S.group = d.group || 'squares'; S.rings = d.rings || S.rings;
    S.noRepeat = d.noRepeat !== false; S.url = d.url || ''; S.urlOn = !!d.urlOn;
    S.splitPct = d.splitPct || 45;
    S.started = !!d.started;
    return true;
  } catch(e){ return false; }
}

/* ======================================================================
   3. DOM HELPERS
   ====================================================================== */

var $ = function(id){ return document.getElementById(id); };
function esc(s){ return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
function groupOf(key){ for (var i=0;i<GROUPS.length;i++) if (GROUPS[i].key===key) return GROUPS[i]; return GROUPS[0]; }
function initials(p){
  return ((p.preferred||p.first||'?').charAt(0) + (p.last||'').charAt(0)).toUpperCase();
}
function hueOf(p){ var h=0,s=(p.last||'')+(p.first||''); for(var i=0;i<s.length;i++)h=(h*31+s.charCodeAt(i))%360; return h; }

var toastT = null;
function toast(msg, ms){
  var t = $('wh-toast'); if (!t) return;
  t.textContent = msg; t.classList.add('on');
  clearTimeout(toastT);
  toastT = setTimeout(function(){ t.classList.remove('on'); }, ms || 2600);
}

/* ---------- stand-in for anyone without a photo ----------
   ONE shape for everybody: a plain abstract bust, no face, no hair, no skin
   tone, nothing that assigns a student a gender or a race. The only thing
   that varies is the backing colour, and only so that neighbouring wedges
   stay tellable apart; it is seeded from the name so a person's placeholder
   never changes between spins. */
function hash32(s){
  var h = 2166136261;
  for (var i=0;i<s.length;i++){ h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

function drawAvatar(x, size, name){
  var hue = hash32(name || '?') % 360, k = size/100;
  x.save();
  x.scale(k, k);
  x.beginPath(); x.arc(50,50,50,0,6.2832); x.clip();
  x.fillStyle = 'hsl(' + hue + ',34%,52%)';
  x.fillRect(0,0,100,100);
  x.fillStyle = 'rgba(255,255,255,.9)';
  x.beginPath(); x.arc(50,37,16,0,6.2832); x.fill();                 // head
  x.beginPath(); x.ellipse(50,100,29,32,0,0,6.2832); x.fill();       // shoulders
  x.restore();
}

/* thumbs are kept as small JPEG data URLs so a refresh keeps the photos */
var imgCache = {};                       // id -> HTMLCanvasElement ready to draw
function thumbCanvas(p){
  if (imgCache[p.id]) return imgCache[p.id];
  var size = 160, c = document.createElement('canvas');
  c.width = c.height = size;
  var x = c.getContext('2d');
  x.save(); x.beginPath(); x.arc(size/2,size/2,size/2,0,6.2832); x.clip();
  if (p._img && p._img.complete && p._img.naturalWidth){
    var im = p._img, s = Math.min(im.naturalWidth, im.naturalHeight);
    var sx = (im.naturalWidth - s)/2, sy = Math.max(0,(im.naturalHeight - s)/2 - s*0.06);
    x.drawImage(im, sx, sy, s, s, 0, 0, size, size);
  } else {
    drawAvatar(x, size, (p.last || '') + '|' + (p.first || '') + '|' + (p.preferred || ''));
  }
  x.restore();
  imgCache[p.id] = c;
  return c;
}

/* data URL for the DOM (chart cells, winner cards). Photos use the stored
   JPEG; everyone else gets their drawn avatar, cached per person. */
function faceUrl(p){
  if (p.thumbData) return p.thumbData;
  if (!p._avatarUrl) p._avatarUrl = thumbCanvas(p).toDataURL('image/png');
  return p._avatarUrl;
}
var redrawT = null;
function rehydrate(p){
  if (!p.thumbData || p._img) return;
  var im = new Image();
  im.onload = function(){
    delete imgCache[p.id]; delete p._avatarUrl; thumbCanvas(p);
    clearTimeout(redrawT);                       // 78 photos, one redraw
    redrawT = setTimeout(drawChart, 90);
  };
  im.src = p.thumbData;
  p._img = im;
}

/* ======================================================================
   4. SETUP SCREEN
   ====================================================================== */

function wireDrop(dzId, inputId, handler, accept){
  var dz = $(dzId), inp = $(inputId);
  dz.addEventListener('click', function(){ inp.click(); });
  inp.addEventListener('change', function(){ if (inp.files.length) handler(inp.files); inp.value=''; });
  ['dragenter','dragover'].forEach(function(e){
    dz.addEventListener(e, function(ev){ ev.preventDefault(); dz.classList.add('over'); });
  });
  ['dragleave','drop'].forEach(function(e){
    dz.addEventListener(e, function(ev){ ev.preventDefault(); dz.classList.remove('over'); });
  });
  dz.addEventListener('drop', function(ev){ if (ev.dataTransfer.files.length) handler(ev.dataTransfer.files); });
}

function loadRosterFiles(files){
  var f = files[0];
  var rd = new FileReader();
  rd.onload = function(){
    var list = parseRoster(rd.result);
    if (!list.length){ $('wh-st-csv').className='stat warn'; $('wh-st-csv').textContent='No Last/First columns found in that file.'; return; }
    var auto = 0;
    var had = S.roster;                       // photos loaded before the CSV
    S.roster = list.map(function(p){
      p.id = 'p'+(pid++);
      if (!p.out && S.outKeys.indexOf(personKey(p)) !== -1) p.out = true;   // remembered from last time
      else if (p.out) auto++;                                              // flagged by the file itself
      if (p.out && S.outKeys.indexOf(personKey(p)) === -1) S.outKeys.push(personKey(p));
      return p;
    });

    // ORDER MUST NOT MATTER: carry photos already in hand over to the new
    // roster, matched the same generous way photo file names are matched,
    // so dropping the CSV second never means pasting the photos twice.
    var kept = 0;
    had.forEach(function(op){
      if (!op.thumbData) return;
      var k = matchPerson(op.last + ', ' + op.first + '.jpg', S.roster);
      if (k !== -1 && !S.roster[k].thumbData){ S.roster[k].thumbData = op.thumbData; kept++; }
    });
    if (kept){
      $('wh-st-pic').className = 'stat';
      $('wh-st-pic').textContent = '✓ kept the ' + kept + ' photos you already loaded';
    }
    S.used = {}; S.history = [];
    imgCache = {};
    var noSeat = S.roster.filter(function(p){ return !p.group; }).length;
    var out = S.roster.filter(function(p){ return p.out; }).length;
    var bits = ['✓ ' + (S.roster.length - out) + ' students'];
    if (out) bits.push(out + ' taken out of the draw' + (auto ? ' automatically (marked TA or staff in the file)' : ''));
    if (noSeat) bits.push(noSeat + ' with a missing or unreadable seat, they will not appear until you seat them');
    $('wh-st-csv').className = 'stat' + (noSeat ? ' warn' : '');
    $('wh-st-csv').textContent = bits.join(' · ');
    afterRoster();
  };
  rd.readAsText(f);
}

function loadPhotoFiles(files){
  var list = Array.prototype.slice.call(files).filter(function(f){
    return /image\//.test(f.type) || /\.(png|jpe?g|webp|gif|bmp)$/i.test(f.name);
  });
  if (!list.length) return;

  // NO CSV? Then the photo file names are the roster. "Rieger, Itai.jpg"
  // becomes Itai Rieger, with no seat yet, and the random-seating offer
  // appears under the chart.
  var fromPhotos = !S.roster.length;
  if (fromPhotos){
    S.roster = [];
    list.forEach(function(f){
      var s = splitPhotoName(f.name);
      if (!s.last && !s.first) return;
      var p = { id:'p'+(pid++), last:s.last, first:s.first,
                preferred:(s.first || s.last), seat:'', group:null, role:'' };
      p.out = isStaff(p) || S.outKeys.indexOf(personKey(p)) !== -1;
      if (p.out && S.outKeys.indexOf(personKey(p)) === -1) S.outKeys.push(personKey(p));
      S.roster.push(p);
    });
    S.roster.sort(function(a,b){ return (a.last+a.first).localeCompare(b.last+b.first); });
    S.used = {}; S.history = []; imgCache = {};
  }

  var matched = 0, unmatched = [];
  var jobs = list.map(function(f){
    return new Promise(function(done){
      var idx = matchPerson(f.name, S.roster);
      if (idx === -1){ unmatched.push(f.name); done(); return; }
      var url = URL.createObjectURL(f), im = new Image();
      im.onload = function(){
        var p = S.roster[idx];
        p._img = im;
        delete imgCache[p.id]; delete p._avatarUrl;
        // squeeze to a small JPEG so a page refresh keeps the photo
        var c = thumbCanvas(p);
        try { p.thumbData = c.toDataURL('image/jpeg', 0.72); } catch(e){ p.thumbData = ''; }
        URL.revokeObjectURL(url);
        matched++; done();
      };
      im.onerror = function(){ unmatched.push(f.name); URL.revokeObjectURL(url); done(); };
      im.src = url;
    });
  });
  Promise.all(jobs).then(function(){
    var noPhoto = S.roster.filter(function(p){ return !p.thumbData; }).length;
    var bits = [];
    if (fromPhotos) bits.push('✓ ' + S.roster.length + ' people read from the file names');
    else bits.push('✓ ' + matched + ' matched to the roster');
    if (unmatched.length) bits.push(unmatched.length + ' could not be matched: ' + unmatched.slice(0,3).join(', ') + (unmatched.length>3?' …':''));
    if (noPhoto) bits.push(noPhoto + ' without a photo');
    $('wh-st-pic').className = 'stat' + ((unmatched.length||noPhoto) ? ' warn' : '');
    $('wh-st-pic').textContent = bits.join(' · ');
    if (fromPhotos){
      $('wh-st-csv').className = 'stat';
      $('wh-st-csv').textContent = 'No CSV needed. Seat them below, then edit any name on the chart.';
    }
    afterRoster();
  });
}

function afterRoster(){
  drawChart(); syncCounts();
  // ready as soon as somebody is actually sitting somewhere, however they
  // got here: a CSV, photo file names, or the demo
  $('wh-btn-start').disabled = !S.roster.some(function(p){ return p.group && !p.out; });
  save();
}

function syncCounts(){
  var c = { diamonds:0, circles:0, squares:0 }, out = 0;
  S.roster.forEach(function(p){
    if (p.out){ out++; return; }
    if (p.group) c[p.group]++;
  });
  $('wh-c-dia').textContent = c.diamonds; $('wh-c-cir').textContent = c.circles; $('wh-c-squ').textContent = c.squares;
  $('wh-c-out').textContent = out ? ('· ' + out + ' out of the draw') : '';

  // the random-seating offer only exists while somebody has no seat
  var unseated = S.roster.filter(function(p){ return !p.group; }).length;
  $('wh-seatrow').style.display = unseated ? '' : 'none';
  $('wh-btn-seat').textContent = unseated === S.roster.length
    ? '\ud83c\udfb2 Seat everyone at random' : '\ud83c\udfb2 Assign them to free seats at random';
  if (unseated) $('wh-st-seat').textContent = unseated + ' ' + (unseated === 1 ? 'person has' : 'people have') +
    ' no seat yet, so they are not on the wheel.';
}

/* drop everyone without a readable seat into the empty seats, at random */
function assignSeatsRandomly(){
  var taken = {};
  S.roster.forEach(function(p){ if (p.group) taken[p.seat] = 1; });
  var free = [];
  ROWS.forEach(function(rr){
    for (var i=1;i<=rr[1];i++){ var s = rr[0]+'-'+i; if (!taken[s]) free.push(s); }
  });
  for (var i=free.length-1;i>0;i--){ var j = Math.floor(Math.random()*(i+1)), t = free[i]; free[i] = free[j]; free[j] = t; }
  var need = S.roster.filter(function(p){ return !p.group; });
  var placed = 0;
  need.forEach(function(p){
    if (!free.length) return;
    p.seat = free.shift(); p.group = seatGroup(p.seat); placed++;
  });
  drawChart(); syncCounts(); save();
  $('wh-st-seat').textContent = placed < need.length
    ? ('Seated ' + placed + '. The room is full, ' + (need.length - placed) + ' still have nowhere to sit.')
    : '';
  if (placed) toast('Seated ' + placed + ' at random.');
}

/* the chart, prof POV: back row (E) on top, front row (A) at the bottom */
function chartHtml(){
  var html = '<div class="chartinner">';
  ROWS.slice().reverse().forEach(function(rr){
    var r = rr[0], cells = rowCells(r);
    html += '<div class="srow"><div class="rowlab">' + r + '</div>';
    cells.forEach(function(c){
      if (c === 'gap' || c === null){ html += '<div class="scell gap"></div>'; return; }
      var seat = r + '-' + c;
      var p = null;
      for (var i=0;i<S.roster.length;i++) if (S.roster[i].seat === seat){ p = S.roster[i]; break; }
      var g = seatGroup(seat), cls = g ? groupOf(g).cls : '';
      if (!p){ html += '<div class="scell seat empty ' + cls + '" data-seat="' + seat + '"><div class="st">' + c + '</div></div>'; return; }
      var face = '<img src="' + esc(faceUrl(p)) + '" alt="">';
      html += '<div class="scell seat ' + cls + (p.out ? ' out' : '') + '" draggable="true" data-seat="' + seat + '" data-id="' + p.id + '" title="' + esc(p.preferred + ' ' + p.last + ' · ' + seat + (p.out ? ' · not in the draw' : '')) + '">' +
              face + '<div class="nm">' + esc(p.preferred) + '</div><div class="ln">' + esc(p.last) + '</div><div class="st">' + c + '</div></div>';
    });
    html += '<div class="rowlab"></div></div>';
  });
  return html + '</div>';
}

/* ---------- the seat editor, used by BOTH charts ---------- */
var editId = null;

function closeEditor(){
  var e = document.getElementById('wh-editor');
  if (e) e.classList.remove('on');
  editId = null;
}

function personById(id){
  for (var i=0;i<S.roster.length;i++) if (S.roster[i].id === id) return S.roster[i];
  return null;
}

function openEditor(el, id){
  var p = personById(id); if (!p) return;
  editId = id;
  var ed = $('wh-editor');
  var face = '<img src="' + esc(faceUrl(p)) + '" alt="">';
  var g = p.group ? groupOf(p.group) : null;
  ed.innerHTML =
    '<div class="ehead">' + face + '<div><b>' + esc(p.seat) + '</b>' +
      '<span class="sm">' + (g ? esc(g.label) : 'no group') + (p.out ? ' · out of the draw' : '') + '</span></div></div>' +
    '<label>SHOWN ON THE WHEEL</label><input class="big" id="wh-e-pref" value="' + esc(p.preferred) + '">' +
    '<div class="erow"><div><label>FIRST</label><input id="wh-e-first" value="' + esc(p.first) + '"></div>' +
      '<div><label>LAST</label><input id="wh-e-last" value="' + esc(p.last) + '"></div></div>' +
    '<div class="ebtns">' +
      '<button id="wh-e-photo">' + (p.thumbData ? 'Change photo' : 'Add photo') + '</button>' +
      (p.thumbData ? '<button id="wh-e-nophoto">Remove photo</button>' : '') +
    '</div>' +
    '<div class="ebtns">' +
      '<button id="wh-e-out" class="' + (p.out ? '' : 'warn') + '">' + (p.out ? 'Put back in the draw' : 'Take out of the draw') + '</button>' +
      '<button id="wh-e-done">Done</button>' +
    '</div>';

  // place it next to the seat, kept on screen
  var r = el.getBoundingClientRect();
  ed.classList.add('on');
  var w = ed.offsetWidth, h = ed.offsetHeight;
  var x = Math.min(window.innerWidth - w - 10, Math.max(10, r.left + r.width/2 - w/2));
  var y = r.bottom + 8;
  if (y + h > window.innerHeight - 10) y = Math.max(10, r.top - h - 8);
  ed.style.left = x + 'px'; ed.style.top = y + 'px';

  function commit(){
    p.preferred = $('wh-e-pref').value.trim();
    p.first = $('wh-e-first').value.trim();
    p.last = $('wh-e-last').value.trim();
    if (!p.preferred) p.preferred = p.first || p.last;
    delete imgCache[p.id]; delete p._avatarUrl;
    drawChart(); save();
  }
  ['wh-e-pref','wh-e-first','wh-e-last'].forEach(function(id){
    $(id).addEventListener('change', commit);
    $(id).addEventListener('keydown', function(e){
      if (e.key === 'Enter'){ commit(); closeEditor(); }
      if (e.key === 'Escape'){ closeEditor(); }
    });
  });
  $('wh-e-photo').addEventListener('click', function(){
    var inp = $('wh-f-one');
    inp.onchange = function(){
      if (!inp.files.length){ return; }
      var f = inp.files[0]; inp.value = '';
      var url = URL.createObjectURL(f), im = new Image();
      im.onload = function(){
        p._img = im; delete imgCache[p.id]; delete p._avatarUrl;
        var c = thumbCanvas(p);
        try { p.thumbData = c.toDataURL('image/jpeg', 0.72); } catch(err){ p.thumbData = ''; }
        URL.revokeObjectURL(url);
        drawChart(); save(); closeEditor();
      };
      im.onerror = function(){ URL.revokeObjectURL(url); toast('Could not read that image.'); };
      im.src = url;
    };
    inp.click();
  });
  if ($('wh-e-nophoto')) $('wh-e-nophoto').addEventListener('click', function(){
    p.thumbData = ''; delete p._img; delete imgCache[p.id]; delete p._avatarUrl;
    drawChart(); save(); closeEditor();
  });
  $('wh-e-out').addEventListener('click', function(){
    commit();
    p.out = !p.out;
    // remember it by name, so reloading the roster keeps them out
    var k = personKey(p), at = S.outKeys.indexOf(k);
    if (p.out && at === -1) S.outKeys.push(k);
    if (!p.out && at !== -1) S.outKeys.splice(at, 1);
    drawChart(); save(); closeEditor();
    if (S.started){ refreshRings(); syncPanel(); }
  });
  $('wh-e-done').addEventListener('click', function(){ commit(); closeEditor(); });
  setTimeout(function(){ var f = $('wh-e-pref'); if (f){ f.focus(); f.select(); } }, 30);
}

function wireChart(box){
  var dragId = null;
  box.querySelectorAll('.scell.seat').forEach(function(el){
    el.addEventListener('click', function(e){
      var id = el.getAttribute('data-id');
      if (!id){ closeEditor(); return; }
      e.stopPropagation();
      if (editId === id){ closeEditor(); return; }
      openEditor(el, id);
    });
    el.addEventListener('dragstart', function(e){
      closeEditor();
      dragId = el.getAttribute('data-id') || '';
      if (!dragId){ e.preventDefault(); return; }
      e.dataTransfer.setData('text/plain', dragId);
      e.dataTransfer.effectAllowed = 'move';
    });
    el.addEventListener('dragover', function(e){ e.preventDefault(); el.classList.add('drag'); });
    el.addEventListener('dragleave', function(){ el.classList.remove('drag'); });
    el.addEventListener('drop', function(e){
      e.preventDefault(); el.classList.remove('drag');
      var id = e.dataTransfer.getData('text/plain') || dragId;
      var toSeat = el.getAttribute('data-seat');
      if (!id || !toSeat) return;
      var from = null, to = null;
      S.roster.forEach(function(p){
        if (p.id === id) from = p;
        if (p.seat === toSeat) to = p;
      });
      if (!from || from.seat === toSeat) return;
      var oldSeat = from.seat;
      from.seat = toSeat; from.group = seatGroup(toSeat);
      if (to){ to.seat = oldSeat; to.group = seatGroup(oldSeat); }
      drawChart(); syncCounts(); save();
    });
  });
}

function drawChart(){
  var html = chartHtml();
  var a = $('wh-chart'); if (a){ a.innerHTML = html; wireChart(a); }
  var b = $('wh-chart2'); if (b && $('wh-adjust').classList.contains('on')){ b.innerHTML = html; wireChart(b); }
  syncCounts();
}

function demoRoster(){
  var F = ['Amara','Bruno','Caitlin','Dario','Elif','Farid','Greta','Hiro','Ines','Jonas','Kavya','Lorenzo','Maren','Nikolai','Oriana','Pablo','Quinn','Rosa','Stellan','Tamsin','Umberto','Vera','Wilhelm','Ximena','Yusuf','Zelda','Anouk','Baptiste','Chiara','Devendra','Esther','Filip','Gala','Henrik','Ilaria','Jasper','Keiko','Luan','Milena','Nuno','Olive','Priya','Ronan','Saskia','Tobias','Ulla','Viggo','Wanda','Yara','Zeno','Astrid','Benicio','Clara','Dmitri','Eunice','Flora','Gustav','Hana','Ivo','Jolanta','Kasper','Leonor','Matteo','Noor','Otto','Paloma','Rafael','Sonia','Tarek','Ulyana','Valentin','Wren','Xanthe','Yannick','Zofia','Anselm','Beatriz','Cosmin'];
  var L = ['Lindqvist','Hoffmann','Reinholt','Pellegrino','Tanaka','Nyberg','Jelinek','Iversen','Ellsworth','Whitlock','Havel','Abreu','Ashworth','Sandoval','Thibodeau','Wexford','Ibarra','Rasmussen','Bergstrom','Vanterpool','Norrland','Zielinski','Kristiansen','Dupont','Almqvist','Rosales','Lombardi','Moreau','Cavendish','Bellucci','Okafor','Umarov','Xiang','Brindisi','Takeda','Jansson','Dvorak','Mbeki','Laurent','Imamura','Joubert','Fontaine','Valcourt','Eriksen','Zaragoza','Galliano','Ybarra','Yamashiro','Westergaard','Quintana','Zanetti','Vasilenko','Uddin','Fitzroy','Farrow','Santoro','Kepler','Ybanez','Ulverston','Grimaldi','Cormier','Soderberg','Holloway','Kowalski','Aalto','Eze','Granlund','Marchetti','Dagher','Castellano','Nakata','Palenque','Ostrowski','Oyelaran','Peralta','Veitch','Marchand','Teodorescu'];
  var NICK = { Benicio:'Ben', Valentin:'Val', Wilhelm:'Will', Devendra:'Dev', Umberto:'Berto', Nikolai:'Niko',
               Dmitri:'Dima', Saskia:'Sass', Jolanta:'Jo', Ulyana:'Ulya', Xanthe:'Xan', Yannick:'Yanni',
               Beatriz:'Bea', Caitlin:'Cait', Oriana:'Ori', Tamsin:'Tam', Leonor:'Leo', Matteo:'Matt',
               Rafael:'Rafa', Lorenzo:'Enzo', Henrik:'Rik', Milena:'Mila', Stellan:'Stel' };
  var seats = [];
  ROWS.forEach(function(rr){ for (var i=1;i<=rr[1];i++) seats.push(rr[0]+'-'+i); });
  for (var i=seats.length-1;i>0;i--){ var j=Math.floor(Math.random()*(i+1)), t=seats[i]; seats[i]=seats[j]; seats[j]=t; }
  S.roster = seats.map(function(seat, i){
    var f = F[i % F.length], l = L[i % L.length];
    return { id:'p'+i, last:l, first:f, preferred:NICK[f] || f, seat:seat, group:seatGroup(seat) };
  });
  S.used = {}; S.history = []; imgCache = {};
  $('wh-st-csv').className = 'stat';
  $('wh-st-csv').textContent = '✓ demo roster: ' + S.roster.length + ' invented names in all ' + seats.length + ' seats';
  afterRoster();
}

/* two levels of reset, both on the setup page.
   clear  = who has been picked, keeps the roster, photos and settings
   wipe   = everything, back to an empty app */
function clearPicks(){
  S.used = {}; S.history = [];
  if (S.started){ hideWinners(false); refreshRings(); syncPanel(); }
  save(); drawChart();
  $('wh-st-csv').className = 'stat';
  $('wh-st-csv').textContent = '✓ picks cleared, all ' +
    S.roster.filter(function(p){ return !p.out; }).length + ' students are back in';
}

function wipeAll(){
  try { localStorage.removeItem(KEY); } catch(e){}
  S.roster = []; S.used = {}; S.outKeys = []; S.history = [];
  S.group = 'squares'; S.rings = { squares:3, circles:3, diamonds:3 };
  S.noRepeat = true; S.url = ''; S.urlOn = false; S.started = false;
  imgCache = {}; bits = []; rings = []; winners = []; phase = 'idle';
  closeEditor();
  $('wh-game').classList.remove('on');
  $('wh-adjust').classList.remove('on');
  $('wh-panel').classList.remove('on');
  $('wh-setup').style.display = '';
  var sd = $('wh-side'); sd.classList.remove('on'); sd.removeAttribute('src');
  $('wh-f-url').value = ''; $('wh-f-urlon').checked = false; $('wh-f-norepeat').checked = true;
  $('wh-r-squ').value = 3; $('wh-r-cir').value = 3; $('wh-r-dia').value = 3;
  ['wh-st-csv','wh-st-pic','wh-st-url'].forEach(function(i){ $(i).textContent = ''; $(i).className = 'stat'; });
  $('wh-btn-start').disabled = true;
  drawChart(); syncCounts();
  $('wh-st-csv').textContent = 'Everything cleared. Drop a roster CSV to start again.';
}

function downloadTemplate(){
  // Role is optional: anything saying TA / instructor / staff is auto excluded
  var lines = ['Last,First,Preferred,Seat (ORIGINAL DO NOT EDIT),Role'];
  var seats = [];
  ROWS.forEach(function(rr){ for (var i=1;i<=rr[1];i++) seats.push(rr[0]+'-'+i); });
  seats.forEach(function(s){ lines.push(',,,' + s + ','); });
  var blob = new Blob([lines.join('\n')], { type:'text/csv' });
  var a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = 'wheel-roster-template.csv';
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(function(){ URL.revokeObjectURL(a.href); }, 4000);
}

/* ======================================================================
   5. GAME
   ====================================================================== */

var wheel, fx, wctx, fctx, arena, DPR = Math.min(2, window.devicePixelRatio || 1);
var rings = [];                 // live ring objects
var phase = 'idle';             // idle | spinning | won
var winners = [];
var hubSlots = [];              // one per ring: {text, locked}
var shuffleT = 0;
var allStoppedAt = 0;           // when the last ring stopped
var REVEAL_HOLD = 900;          // read the three names in the hub, then reveal

function startGame(){
  S.started = true; save();
  $('wh-setup').style.display = 'none';
  $('wh-game').classList.add('on');
  var sd = $('wh-side');
  if (S.urlOn && S.url){
    sd.src = S.url; sd.classList.add('on'); $('wh-split').classList.add('on');
    sd.style.flexBasis = (S.splitPct || 45) + '%';
  } else {
    sd.classList.remove('on'); sd.removeAttribute('src'); $('wh-split').classList.remove('on');
  }
  buildShapes();
  sizeCanvas();
  refreshRings();
  syncPanel();
  if (!loopOn){ loopOn = true; requestAnimationFrame(draw); }
}

function backToSetup(){
  $('wh-game').classList.remove('on');
  $('wh-setup').style.display = '';
  $('wh-panel').classList.remove('on');
  $('wh-adjust').classList.remove('on');
  S.started = false; save();
  drawChart();
}

function buildShapes(){
  var box = $('wh-shapes'); box.innerHTML = '';
  GROUPS.forEach(function(g){
    var b = document.createElement('button');
    b.className = 'shp' + (S.group === g.key ? ' on' : '');
    b.title = g.label;
    b.innerHTML = shapeSvg(g.shape, g.pal[0], g.hot);
    b.addEventListener('click', function(){
      if (phase === 'spinning') return;
      hideWinners(false);
      S.group = g.key; refreshRings(); buildShapes(); syncPanel(); save();
    });
    box.appendChild(b);
  });
}
function shapeSvg(shape, fill, stroke){
  if (shape === 'circle')  return '<svg viewBox="0 0 40 40"><circle cx="20" cy="20" r="16" fill="'+fill+'" stroke="'+stroke+'" stroke-width="3"/></svg>';
  if (shape === 'square')  return '<svg viewBox="0 0 40 40"><rect x="5" y="5" width="30" height="30" rx="3" fill="'+fill+'" stroke="'+stroke+'" stroke-width="3"/></svg>';
  return '<svg viewBox="0 0 40 40"><path d="M20 3 L37 20 L20 37 L3 20 Z" fill="'+fill+'" stroke="'+stroke+'" stroke-width="3"/></svg>';
}

function eligibleIn(key){
  return S.roster.filter(function(p){
    return p.group === key && !p.out && !(S.noRepeat && S.used[p.id]);
  });
}
function eligible(){ return eligibleIn(S.group); }

/* square -> circle -> diamond -> square, skipping any figure with nobody
   left in it. Returns the current figure if every other one is spent. */
function nextGroup(from){
  var i = 0;
  for (var j=0;j<GROUPS.length;j++) if (GROUPS[j].key === from) i = j;
  for (var step=1; step<=GROUPS.length; step++){
    var g = GROUPS[(i+step) % GROUPS.length];
    if (eligibleIn(g.key).length) return g.key;
  }
  return from;
}

/* rebuild the rings for the current group and pool */
function refreshRings(){
  var pool = eligible();
  var want = Math.max(1, Math.min(S.rings[S.group] || 3, pool.length || 1));
  var parts = pool.length ? partition(pool, want) : [];
  var geom = ringGeom(Math.max(1, parts.length || 1));
  var keep = rings.map(function(r){ return r.rot; });   // no teleport on rebuild
  rings = [];
  parts.forEach(function(part, i){
    rings.push({
      people: part, rIn: geom.rings[i].rIn, rOut: geom.rings[i].rOut,
      rot: (keep[i] !== undefined ? keep[i] : Math.random()*6.283), dir: i % 2 ? -1 : 1,
      dur: 3400 + i*1250, turns: 6 + i,
      anim: null, pick: -1, flash: 0
    });
  });
  hubGeom = geom.hub;
  hubSlots = rings.map(function(){ return { text:'', locked:false }; });
  phase = 'idle';
}
var hubGeom = 0.285;

function spin(){
  if (phase === 'spinning') return;
  hideWinners();
  var pool = eligible();
  if (!pool.length){ toast(groupOf(S.group).label + ': everyone has been picked.'); return; }
  refreshRings();
  if (!rings.length) return;

  // snapshot for undo, before anyone is consumed
  S.history.push({ used: JSON.parse(JSON.stringify(S.used)), group: S.group });
  if (S.history.length > 6) S.history.shift();

  winners = [];
  phase = 'spinning';
  allStoppedAt = 0;
  shuffleT = performance.now();
  var now = performance.now();

  // at most one ring per spin hangs on a peg, and it is the last to settle
  var dramaIdx = (Math.random() < 0.45) ? rings.length - 1 : -1;

  rings.forEach(function(r, i){
    var idx = pickOne(r.people);
    r.pick = idx;
    winners.push(r.people[idx]);
    var n = r.people.length, seg = 2*Math.PI/n;
    var centreRot = targetRotation(r.rot, n, idx, r.turns + Math.floor(Math.random()*2), r.dir);
    r.anim = {
      st: spinStages(r.rot, centreRot, seg, r.dir, r.dur, n, i === dramaIdx),
      i: 0, from: r.rot, t0: now + i*110
    };
    r.wob = 0;
    hubSlots[i] = { text:'', locked:false };
  });
  syncPanel();
}

function undo(){
  if (phase === 'spinning') return;
  if (!S.history.length){ toast('Nothing to undo.'); return; }
  hideWinners(false);
  var h = S.history.pop();
  S.used = h.used; S.group = h.group;
  buildShapes(); refreshRings(); syncPanel(); save();
  toast('Went back one spin. ' + S.history.length + ' more available.');
}

function resetAll(){
  hideWinners(false);
  S.used = {}; S.history = [];
  refreshRings(); syncPanel(); save();
  toast('Progress cleared. Everyone is back in.');
}

/* ---------- canvas ---------- */

function sizeCanvas(){
  var w = arena.clientWidth, h = arena.clientHeight;
  var bw = Math.max(1, Math.round(w*DPR)), bh = Math.max(1, Math.round(h*DPR));
  [wheel, fx].forEach(function(c){
    if (c.width !== bw || c.height !== bh){ c.width = bw; c.height = bh; }
  });
}

/* The wheel is centred in the arena MINUS a gutter on the right, so the
   three shape buttons never sit on top of it however wide the window is. */
var GUTTER = 76;
function stage(w,h){
  var usable = Math.max(120, w - GUTTER);
  var R = Math.min(usable, h)*0.455;      // 1.046R is the outer light ring
  return { cx: usable/2, cy: h/2, R: R };
}

var loopOn = false;
function draw(now){
  var gEl = document.getElementById('wh-game');
  if (!gEl){ loopOn = false; return; }        // unmounted: let the loop die
  requestAnimationFrame(draw);
  if (!gEl.classList.contains('on')) return;
  sizeCanvas();                                   // never let the buffer go stale
  var w = arena.clientWidth, h = arena.clientHeight;

  // clear the FULL backing store with no transform, then set the scale.
  // Doing it this way is what stops a resize leaving half an old wheel behind.
  wctx.setTransform(1,0,0,1,0,0); wctx.clearRect(0,0,wheel.width,wheel.height);
  fctx.setTransform(1,0,0,1,0,0); fctx.clearRect(0,0,fx.width,fx.height);
  wctx.setTransform(DPR,0,0,DPR,0,0);
  fctx.setTransform(DPR,0,0,DPR,0,0);

  stepConfetti(w,h);
  if (!rings.length) return;

  var geo = stage(w,h), cx = geo.cx, cy = geo.cy, R = geo.R, G = groupOf(S.group);

  /* animation */
  var justFixed = [];
  rings.forEach(function(r, i){
    var a = r.anim;
    if (a){
      var s = a.st[a.i], t = (now - a.t0)/s.dur;
      if (t <= 0) return;                               // staggered start
      if (t >= 1){
        r.rot = s.to; r.wob = 0;
        a.i++;
        if (a.i >= a.st.length){
          r.anim = null; r.flash = now; justFixed.push(i);
        } else { a.from = s.to; a.t0 = now; }
      } else {
        r.rot = a.from + (s.to - a.from)*s.ease(t);
        // the tug is drawn only, it never moves where the wheel actually lands
        r.wob = s.wob ? s.wob(t) : 0;
      }
    } else if (phase === 'idle'){
      r.rot += r.dir*0.0015; r.wob = 0;
    } else {
      r.wob = 0;
    }
  });
  justFixed.forEach(function(i){
    var wp = rings[i].people[rings[i].pick];
    hubSlots[i] = { text: wp ? wp.preferred : '', locked:true };
    burst(cx, cy - R*rings[i].rOut, 24, G);
  });
  // Hold once everything has stopped, so the LAST name actually gets to sit
  // in the hub before the reveal covers it. Without this the third name was
  // written and hidden in the same frame.
  if (phase === 'spinning' && rings.every(function(r){ return !r.anim; })){
    if (!allStoppedAt) allStoppedAt = now;
    else if (now - allStoppedAt >= REVEAL_HOLD) finish();
  }

  wctx.save();
  wctx.translate(cx, cy);

  /* backboard + shape lights */
  wctx.beginPath(); wctx.arc(0,0,R*1.03,0,6.2832);
  wctx.fillStyle = '#0a1c3a'; wctx.fill();
  wctx.lineWidth = 3; wctx.strokeStyle = 'rgba(255,209,102,.5)'; wctx.stroke();
  var LN = 36, blink = Math.floor(now/110);
  for (var b=0;b<LN;b++){
    var ab = b/LN*6.2832 - Math.PI/2;
    var lit = (phase === 'spinning') ? ((b + blink) % 3 === 0) : (b % 2 === 0);
    drawLight(Math.cos(ab)*R*1.03, Math.sin(ab)*R*1.03, R*0.016, G.shape,
              lit ? '#ffe9a8' : 'rgba(255,233,168,.20)', ab);
  }

  rings.forEach(function(r){ drawRing(r, R, G, now); });
  drawHub(R, G, now);
  rings.forEach(function(r, i){ drawPicker(r, R, now, i); });
  wctx.restore();
}

function drawLight(x, y, s, shape, fill, ang){
  wctx.save(); wctx.translate(x,y); wctx.fillStyle = fill;
  if (shape === 'circle'){ wctx.beginPath(); wctx.arc(0,0,s,0,6.2832); wctx.fill(); }
  else if (shape === 'square'){ wctx.rotate(ang + Math.PI/2); wctx.fillRect(-s,-s,s*2,s*2); }
  else { wctx.rotate(ang + Math.PI/2); wctx.beginPath();
         wctx.moveTo(0,-s*1.3); wctx.lineTo(s,0); wctx.lineTo(0,s*1.3); wctx.lineTo(-s,0);
         wctx.closePath(); wctx.fill(); }
  wctx.restore();
}

function drawRing(r, R, G, now){
  var n = r.people.length; if (!n) return;
  var rIn = R*r.rIn, rOut = R*r.rOut, rMid = (rIn+rOut)/2, th = rOut-rIn;
  var seg = 6.2832/n, arcW = seg*rMid, rot = r.rot + (r.wob || 0);
  // face slightly smaller than the band so the name under it stays big
  var face = Math.max(14, Math.min(th*0.62, arcW*0.84));
  for (var k=0;k<n;k++){
    var a0 = rot + k*seg, a1 = a0 + seg, am = a0 + seg/2, p = r.people[k];
    wctx.beginPath();
    wctx.arc(0,0,rOut,a0,a1); wctx.arc(0,0,rIn,a1,a0,true); wctx.closePath();
    wctx.fillStyle = G.pal[k % G.pal.length];
    wctx.fill();
    wctx.lineWidth = 1.5; wctx.strokeStyle = 'rgba(6,20,44,.5)'; wctx.stroke();

    wctx.save();
    wctx.translate(Math.cos(am)*rMid, Math.sin(am)*rMid);
    wctx.rotate(am + Math.PI/2);
    var thumb = thumbCanvas(p);
    wctx.save();
    wctx.beginPath(); wctx.arc(0,-face*0.10,face/2,0,6.2832); wctx.clip();
    wctx.drawImage(thumb, -face/2, -face*0.10-face/2, face, face);
    wctx.restore();
    wctx.beginPath(); wctx.arc(0,-face*0.10,face/2,0,6.2832);
    wctx.lineWidth = Math.max(1.5, face*0.05); wctx.strokeStyle = 'rgba(255,255,255,.88)'; wctx.stroke();

    var fs = Math.min(arcW*0.32, th*0.22, 26);
    while (fs >= 9){
      wctx.font = '600 ' + fs.toFixed(1) + 'px Corbel, sans-serif';
      if (wctx.measureText(p.preferred).width <= arcW*0.92) break;
      fs -= 0.5;
    }
    if (fs >= 9){
      wctx.textAlign = 'center'; wctx.textBaseline = 'top';
      wctx.fillStyle = '#fff';
      wctx.shadowColor = 'rgba(0,0,0,.55)'; wctx.shadowBlur = 3;
      wctx.fillText(p.preferred, 0, face*0.42);
      wctx.shadowBlur = 0;
    }
    wctx.restore();
  }
  if (!r.anim && r.pick >= 0 && phase !== 'idle'){
    var age = (now - r.flash)/420;
    wctx.beginPath(); wctx.arc(0,0,rOut+1.5,0,6.2832);
    wctx.lineWidth = 3 + (age < 1 ? (1-age)*7 : 0);
    wctx.strokeStyle = 'rgba(255,209,102,' + (age < 1 ? 1 : .75) + ')';
    wctx.stroke();
  }
}

/* the hub: SPIN when idle, otherwise one changing preferred name per ring */
function drawHub(R, G, now){
  var rh = R*hubGeom;
  wctx.beginPath(); wctx.arc(0,0,rh,0,6.2832);
  var grd = wctx.createRadialGradient(0,-rh*0.4,rh*0.1,0,0,rh);
  grd.addColorStop(0,'#15356e'); grd.addColorStop(1,'#07203f');
  wctx.fillStyle = grd; wctx.fill();
  wctx.lineWidth = 5; wctx.strokeStyle = G.hot; wctx.stroke();
  wctx.beginPath(); wctx.arc(0,0,rh*0.92,0,6.2832);
  wctx.lineWidth = 1.5; wctx.strokeStyle = 'rgba(255,209,102,.45)'; wctx.stroke();

  wctx.textAlign = 'center'; wctx.textBaseline = 'middle';

  if (phase === 'idle'){
    wctx.font = '700 ' + (rh*0.34).toFixed(0) + 'px Corbel, sans-serif';
    wctx.fillStyle = G.hot;
    wctx.fillText('SPIN', 0, 0);
    return;
  }
  // one line per ring, each shuffling until its ring locks
  var k = rings.length, lh = (rh*1.55)/Math.max(3,k), size = Math.min(rh*0.27, lh*0.82);
  wctx.font = '700 ' + size.toFixed(1) + 'px Corbel, sans-serif';
  var y0 = -(k-1)*lh/2;
  for (var i=0;i<k;i++){
    var slot = hubSlots[i] || { text:'', locked:false }, txt = slot.text;
    if (!slot.locked){
      var list = rings[i].people;
      txt = list.length ? list[Math.floor((now - shuffleT)/65 + i*7) % list.length].preferred : '';
    }
    var s2 = size;
    while (s2 > 9){ wctx.font = '700 ' + s2.toFixed(1) + 'px Corbel, sans-serif';
                    if (wctx.measureText(txt).width <= rh*1.65) break; s2 -= 1; }
    wctx.fillStyle = slot.locked ? '#fff' : 'rgba(255,255,255,.45)';
    wctx.fillText(txt, 0, y0 + i*lh);
  }
}

function drawPicker(r, R, now, i){
  var y = -R*r.rOut, live = !!r.anim;
  var wob = live ? Math.sin(now/55 + i)*2.2 : 0;
  wctx.save(); wctx.translate(0,y);
  wctx.beginPath();
  wctx.moveTo(0,-2);
  wctx.lineTo(-R*0.026 + wob, -R*0.044);
  wctx.lineTo( R*0.026 + wob, -R*0.044);
  wctx.closePath();
  wctx.fillStyle = live ? '#fff3cf' : '#ffd166';
  wctx.shadowColor = 'rgba(0,0,0,.55)'; wctx.shadowBlur = 7; wctx.shadowOffsetY = 2;
  wctx.fill(); wctx.shadowBlur = 0; wctx.shadowOffsetY = 0;
  wctx.lineWidth = 1.5; wctx.strokeStyle = '#8a5a00'; wctx.stroke();
  wctx.restore();
}

function finish(){
  phase = 'won';
  winners.forEach(function(p){ if (p) S.used[p.id] = true; });
  save();
  showWinners(); bigBlast(); syncPanel();
}

function showWinners(){
  var box = $('wh-winners'); box.innerHTML = '';
  var G = groupOf(S.group);
  winners.forEach(function(p){
    if (!p) return;
    var d = document.createElement('div'); d.className = 'win';
    var ph = document.createElement('img');
    ph.src = faceUrl(p);
    ph.className = 'ph';
    var nm = document.createElement('div'); nm.className = 'nm';
    nm.innerHTML = esc(p.preferred) + '<small>' + esc(p.last.toUpperCase()) + '</small>';
    d.appendChild(ph); d.appendChild(nm); box.appendChild(d);
  });
  box.classList.add('show');
}
/* Dismissing a result moves on to the NEXT FIGURE (square, circle, diamond)
   and arms the wheel for it. advance===false keeps the current figure, for
   the cases where the caller is choosing one itself. */
function hideWinners(advance){
  $('wh-winners').classList.remove('show');
  if (phase !== 'won') return;
  if (advance !== false) S.group = nextGroup(S.group);
  refreshRings(); buildShapes(); syncPanel(); save();
}

function syncPanel(){
  var G = groupOf(S.group);
  var total = S.roster.filter(function(p){ return p.group === S.group; }).length;
  var left = eligible().length;
  $('wh-p-stat').textContent = G.label + ': ' + left + ' of ' + total + ' left · ' +
    S.history.length + ' undo step' + (S.history.length === 1 ? '' : 's');
}

/* ---------- confetti ---------- */
var bits = [];
function burst(x,y,n,G){
  for (var i=0;i<n;i++){
    var a = Math.random()*6.2832, v = 2 + Math.random()*6;
    bits.push({ x:x,y:y,vx:Math.cos(a)*v,vy:Math.sin(a)*v-2, r:3+Math.random()*5,
      c:[G.pal[0],G.pal[2],'#ffd166','#fff'][i%4], rot:Math.random()*6.28, vr:(Math.random()-.5)*.3, life:1 });
  }
}
function bigBlast(){
  var w = arena.clientWidth, h = arena.clientHeight, G = groupOf(S.group);
  for (var s=0;s<3;s++) setTimeout(function(){
    [[w*0.14,h*0.80],[w*0.5,h*0.92],[w*0.86,h*0.80]].forEach(function(o){
      for (var i=0;i<64;i++){
        var a = -Math.PI/2 + (Math.random()-.5)*1.5, v = 9 + Math.random()*13;
        bits.push({ x:o[0],y:o[1],vx:Math.cos(a)*v,vy:Math.sin(a)*v, r:4+Math.random()*7,
          c:[G.pal[0],G.pal[2],'#ffd166','#fff','#67e8f9'][i%5], rot:Math.random()*6.28,
          vr:(Math.random()-.5)*.35, life:1 });
      }
    });
  }, s*210);
}
function stepConfetti(w,h){
  for (var i=bits.length-1;i>=0;i--){
    var b = bits[i];
    b.vy += 0.30; b.vx *= 0.995; b.x += b.vx; b.y += b.vy; b.rot += b.vr; b.life -= 0.0045;
    if (b.life <= 0 || b.y > h + 40){ bits.splice(i,1); continue; }
    fctx.save(); fctx.translate(b.x,b.y); fctx.rotate(b.rot);
    fctx.globalAlpha = Math.min(1, b.life*2.2); fctx.fillStyle = b.c;
    fctx.fillRect(-b.r/2,-b.r*0.35,b.r,b.r*0.7);
    fctx.restore();
  }
  fctx.globalAlpha = 1;
}

/* ======================================================================
   6. WIRE UP
   ====================================================================== */


  function mount(container){
    injectCss();
    container.innerHTML =
      '<div class="app-title"><h2>\uD83C\uDFA1 Wheel of Names</h2></div>' +
      '<div id="wh-root">' + HTML + '</div>';
  wheel = $('wh-wheel'); fx = $('wh-fx'); arena = $('wh-arena');
  wctx = wheel.getContext('2d'); fctx = fx.getContext('2d');

  wireDrop('wh-dz-csv','wh-f-csv', loadRosterFiles);
  wireDrop('wh-dz-pic','wh-f-pic', loadPhotoFiles);
  $('wh-btn-tpl').addEventListener('click', downloadTemplate);
  $('wh-btn-demo2').addEventListener('click', demoRoster);
  $('wh-btn-seat').addEventListener('click', assignSeatsRandomly);

  /* Drag the join between the panel and the wheel, mid game. Pointer capture
     keeps the events coming once the cursor is over the IFRAME, which would
     otherwise swallow them; the draw loop handles the canvas resize. */
  (function(){
    var bar = $('wh-split');
    if (!bar) return;
    bar.addEventListener('pointerdown', function(e){
      splitDrag = true;
      try { bar.setPointerCapture(e.pointerId); } catch(err){}
      bar.classList.add('dragging');
      document.body.classList.add('splitting');
      e.preventDefault();
    });
    bar.addEventListener('pointermove', function(e){
      if (!splitDrag) return;
      var total = $('wh-game').clientWidth;
      if (!total) return;
      S.splitPct = Math.max(15, Math.min(82, (e.clientX / total) * 100));
      $('wh-side').style.flexBasis = S.splitPct + '%';
    });
    bar.addEventListener('pointerup', endSplit);
    bar.addEventListener('pointercancel', endSplit);
    bar.addEventListener('dblclick', function(){
      S.splitPct = 45; $('wh-side').style.flexBasis = '45%'; save();
    });
  })();
  $('wh-btn-clear').addEventListener('click', function(){
    if (confirm('Put everyone back in the draw? Keeps the roster, the photos and your settings.')) clearPicks();
  });
  $('wh-btn-wipe').addEventListener('click', function(){
    if (confirm('Reset EVERYTHING: roster, photos, who is out of the draw, the picks and the panel link. This cannot be undone.')) wipeAll();
  });
  /* close the seat editor on an outside click or Escape */
  docOn('mousedown', function(e){
    if (!e.target.closest) return;
    if (!e.target.closest('#wh-editor') && !e.target.closest('.scell.seat')) closeEditor();
  });
  docOn('keydown', function(e){ if (e.key === 'Escape') closeEditor(); });
  $('wh-btn-start').addEventListener('click', startGame);
  /* pasting a link is the whole intent, so it turns the panel on by itself */
  function syncUrl(){
    S.url = $('wh-f-url').value.trim();
    $('wh-f-urlon').checked = S.urlOn;
    $('wh-st-url').textContent = S.urlOn && S.url ? 'panel on, it will sit on the left' : '';
    save();
  }
  ['input','change','paste'].forEach(function(ev){
    $('wh-f-url').addEventListener(ev, function(){
      var self = this;
      setTimeout(function(){                       // paste fires before the value lands
        var v = self.value.trim();
        S.urlOn = !!v;                             // clearing the box turns it back off
        S.url = v;
        syncUrl();
      }, 0);
    });
  });
  $('wh-f-urlon').addEventListener('change', function(){ S.urlOn = this.checked; syncUrl(); });
  $('wh-f-norepeat').addEventListener('change', function(){ S.noRepeat = this.checked; save(); });
  [['squ','squares'],['cir','circles'],['dia','diamonds']].forEach(function(pair){
    $('wh-r-'+pair[0]).addEventListener('change', function(){ S.rings[pair[1]] = +this.value; save(); });
  });

  $('wh-gear').addEventListener('click', function(e){ e.stopPropagation(); $('wh-panel').classList.toggle('on'); syncPanel(); });
  docOn('click', function(e){
    var p = document.getElementById('wh-panel');
    if (!p || !e.target.closest) return;
    if (!e.target.closest('#wh-panel') && !e.target.closest('#wh-gear')) p.classList.remove('on');
  });
  $('wh-p-full').addEventListener('click', function(){
    $('wh-panel').classList.remove('on');
    var g = $('wh-game');
    if (document.fullscreenElement) document.exitFullscreen();
    else if (g.requestFullscreen) g.requestFullscreen();
    setTimeout(sizeCanvas, 120);
  });
  docOn('fullscreenchange', function(){ setTimeout(function(){ if (arena) sizeCanvas(); }, 120); });
  $('wh-p-undo').addEventListener('click', undo);
  $('wh-p-setup').addEventListener('click', backToSetup);
  $('wh-p-reset').addEventListener('click', function(){
    if (confirm('Clear everyone who has been picked and start the class over?')) resetAll();
  });
  $('wh-p-adjust').addEventListener('click', function(){
    $('wh-panel').classList.remove('on');
    $('wh-adjust').classList.add('on');
    var b = $('wh-chart2'); b.innerHTML = chartHtml(); wireChart(b);
  });
  $('wh-a-close').addEventListener('click', function(){
    closeEditor();
    $('wh-adjust').classList.remove('on');
    refreshRings(); buildShapes(); syncPanel(); save();
  });

  /* click the hub to spin */
  wheel.addEventListener('click', function(e){
    var rect = wheel.getBoundingClientRect();
    var g = stage(rect.width, rect.height);
    var x = e.clientX - rect.left - g.cx, y = e.clientY - rect.top - g.cy;
    if (Math.sqrt(x*x + y*y) <= g.R*hubGeom + 6) spin();
  });
  wheel.addEventListener('mousemove', function(e){
    var rect = wheel.getBoundingClientRect();
    var g = stage(rect.width, rect.height);
    var x = e.clientX - rect.left - g.cx, y = e.clientY - rect.top - g.cy;
    wheel.style.cursor = (phase === 'idle' && Math.sqrt(x*x + y*y) <= g.R*hubGeom + 6) ? 'pointer' : 'default';
  });
  $('wh-winners').addEventListener('click', function(){ hideWinners(); syncPanel(); });

  docOn('keydown', function(e){
    var gEl = document.getElementById('wh-game');
    if (!gEl || !gEl.classList.contains('on')) return;
    // never steal keys from a text field: Backspace and Space belong to typing
    var t = e.target;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
    if (e.key === 'Backspace'){ e.preventDefault(); undo(); }
    if (e.key === ' ' || e.code === 'Space'){
      e.preventDefault();
      if ($('wh-winners').classList.contains('show')){ hideWinners(); syncPanel(); }
      else spin();
    }
    if (e.key === 'Escape'){
      if (editId){ closeEditor(); return; }        // editor first, then the overlay
      $('wh-adjust').classList.remove('on'); $('wh-panel').classList.remove('on');
    }
  });
  winOn('resize', function(){ if (arena) sizeCanvas(); });

  /* restore the last session: progress survives a refresh on purpose */
  if (load()){
    S.roster.forEach(rehydrate);
    $('wh-f-url').value = S.url; $('wh-f-urlon').checked = S.urlOn;
    $('wh-f-norepeat').checked = S.noRepeat;
    $('wh-r-dia').value = S.rings.diamonds; $('wh-r-cir').value = S.rings.circles; $('wh-r-squ').value = S.rings.squares;
    $('wh-st-csv').className = 'stat';
    $('wh-st-csv').textContent = '✓ restored ' + S.roster.length + ' students from your last session';
    afterRoster();
    if (S.started) startGame();
  }

    winOn('blur', function(){ endSplit(null); });
    docWired = true;
  }

  /* ======================================================================
     REGISTER
     ====================================================================== */

  window.LeadToolkit.registerApp({
    id: 'wheel',
    icon: '\uD83C\uDFA1',
    group: 'Class 7 - Leading Inclusively',
    name: 'Wheel of Names',
    code: 'OTH-WHL',
    appType: 'Other',
    intro: { verb: 'Upload', upload: 'the class headshots, or a roster CSV with seats',
             to: 'spin a prize wheel that calls on three students at a time' },
    tags: ['wheel', 'spinner', 'cold call', 'random', 'names', 'seating chart',
           'diamonds', 'circles', 'squares', 'participation', 'inclusively'],
    description: 'A prize wheel that calls on students by seat block. Spin for three names at a time, with photos, undo and a seating chart you can fix mid class.',
    mount: mount
  });
})();
