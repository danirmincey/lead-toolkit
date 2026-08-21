/* ==========================================================================
   qr-lite | hand-written QR encoder for the LEAD Toolkit. Zero dependencies.
   Byte mode (UTF-8), versions 1–10 (≈271 bytes at level L), EC levels
   L/M/Q/H, all 8 masks with spec penalty scoring, format + version info.
   Returns the module matrix; rendering/styling is the app's job.
     qrLite.encode(text, 'H') -> { version, size, ecLevel, matrix }  (matrix[r][c] = 0|1)
   Verified against the published Reed-Solomon test vector, the spec's
   format-information strings, and machine-decoded with OpenCV.
   ========================================================================== */

(function () {
  'use strict';

  /* ---------- constants ---------- */

  // [ecPerBlock, group1Blocks, group1Data, group2Blocks, group2Data] v1-10
  var EC_TABLE = {
    L: [[7, 1, 19, 0, 0], [10, 1, 34, 0, 0], [15, 1, 55, 0, 0], [20, 1, 80, 0, 0], [26, 1, 108, 0, 0],
        [18, 2, 68, 0, 0], [20, 2, 78, 0, 0], [24, 2, 97, 0, 0], [30, 2, 116, 0, 0], [18, 2, 68, 2, 69]],
    M: [[10, 1, 16, 0, 0], [16, 1, 28, 0, 0], [26, 1, 44, 0, 0], [18, 2, 32, 0, 0], [24, 2, 43, 0, 0],
        [16, 4, 27, 0, 0], [18, 4, 31, 0, 0], [22, 2, 38, 2, 39], [22, 3, 36, 2, 37], [26, 4, 43, 1, 44]],
    Q: [[13, 1, 13, 0, 0], [22, 1, 22, 0, 0], [18, 2, 17, 0, 0], [26, 2, 24, 0, 0], [18, 2, 15, 2, 16],
        [24, 4, 19, 0, 0], [18, 2, 14, 4, 15], [22, 4, 18, 2, 19], [20, 4, 16, 4, 17], [24, 6, 19, 2, 20]],
    H: [[17, 1, 9, 0, 0], [28, 1, 16, 0, 0], [22, 2, 13, 0, 0], [16, 4, 9, 0, 0], [22, 2, 11, 2, 12],
        [28, 4, 15, 0, 0], [26, 4, 13, 1, 14], [26, 4, 14, 2, 15], [24, 4, 12, 4, 13], [28, 6, 15, 2, 16]]
  };

  var ALIGN = [null, [], [6, 18], [6, 22], [6, 26], [6, 30], [6, 34], [6, 22, 38], [6, 24, 42], [6, 26, 46], [6, 28, 50]];

  var EC_BITS = { L: 1, M: 0, Q: 3, H: 2 };

  /* ---------- GF(256) / Reed-Solomon ---------- */

  var EXP = new Array(512), LOG = new Array(256);
  (function () {
    var x = 1;
    for (var i = 0; i < 255; i++) {
      EXP[i] = x; LOG[x] = i;
      x <<= 1;
      if (x & 0x100) x ^= 0x11D;
    }
    for (var j = 255; j < 512; j++) EXP[j] = EXP[j - 255];
  })();

  function gfMul(a, b) { return a && b ? EXP[LOG[a] + LOG[b]] : 0; }

  // generator polynomial: (x - α^0)(x - α^1)…(x - α^(ec-1)),
  // HIGHEST degree first (g[0] = 1, monic | the division below relies on it)
  function rsGenerator(ec) {
    var g = [1];
    for (var i = 0; i < ec; i++) {
      var ng = new Array(g.length + 1).fill(0);
      for (var j = 0; j < g.length; j++) {
        ng[j] ^= g[j];                                    // x · g[j]
        ng[j + 1] ^= g[j] ? gfMul(g[j], EXP[i]) : 0;      // α^i · g[j]
      }
      g = ng;
    }
    return g;
  }

  function rsEncode(data, ec) {
    var gen = rsGenerator(ec);
    var rem = data.concat(new Array(ec).fill(0));
    for (var i = 0; i < data.length; i++) {
      var factor = rem[i];
      if (factor) {
        for (var j = 1; j < gen.length; j++) rem[i + j] ^= gfMul(gen[j], factor);
        rem[i] = 0;
      }
    }
    return rem.slice(data.length);
  }

  /* ---------- bit assembly ---------- */

  function utf8Bytes(text) {
    if (typeof TextEncoder !== 'undefined') return Array.prototype.slice.call(new TextEncoder().encode(text));
    var out = [];
    for (var i = 0; i < text.length; i++) {
      var c = text.codePointAt(i);
      if (c > 0xFFFF) i++;
      if (c < 0x80) out.push(c);
      else if (c < 0x800) out.push(0xC0 | c >> 6, 0x80 | c & 63);
      else if (c < 0x10000) out.push(0xE0 | c >> 12, 0x80 | (c >> 6) & 63, 0x80 | c & 63);
      else out.push(0xF0 | c >> 18, 0x80 | (c >> 12) & 63, 0x80 | (c >> 6) & 63, 0x80 | c & 63);
    }
    return out;
  }

  function pickVersion(nBytes, level) {
    for (var v = 1; v <= 10; v++) {
      var t = EC_TABLE[level][v - 1];
      var dataCw = t[1] * t[2] + t[3] * t[4];
      var countBits = v <= 9 ? 8 : 16;
      var needed = 4 + countBits + 8 * nBytes;
      if (needed <= dataCw * 8) return v;
    }
    return -1;
  }

  function buildCodewords(bytes, version, level) {
    var t = EC_TABLE[level][version - 1];
    var dataCw = t[1] * t[2] + t[3] * t[4];
    var countBits = version <= 9 ? 8 : 16;

    var bits = [];
    function push(val, n) { for (var i = n - 1; i >= 0; i--) bits.push((val >> i) & 1); }
    push(4, 4);                      // byte mode
    push(bytes.length, countBits);
    bytes.forEach(function (b) { push(b, 8); });
    // terminator (up to 4 zero bits), pad to byte
    var cap = dataCw * 8;
    push(0, Math.min(4, cap - bits.length));
    while (bits.length % 8) bits.push(0);
    // pad codewords
    var pads = [0xEC, 0x11], p = 0;
    while (bits.length < cap) { push(pads[p % 2], 8); p++; }

    var data = [];
    for (var i = 0; i < bits.length; i += 8) {
      var b2 = 0;
      for (var j = 0; j < 8; j++) b2 = (b2 << 1) | bits[i + j];
      data.push(b2);
    }

    // split into blocks
    var blocks = [], at = 0, k;
    for (k = 0; k < t[1]; k++) { blocks.push(data.slice(at, at + t[2])); at += t[2]; }
    for (k = 0; k < t[3]; k++) { blocks.push(data.slice(at, at + t[4])); at += t[4]; }
    var ecBlocks = blocks.map(function (blk) { return rsEncode(blk, t[0]); });

    // interleave
    var out = [];
    var maxLen = Math.max(t[2], t[4] || 0);
    for (var col = 0; col < maxLen; col++) {
      blocks.forEach(function (blk) { if (col < blk.length) out.push(blk[col]); });
    }
    for (var col2 = 0; col2 < t[0]; col2++) {
      ecBlocks.forEach(function (blk) { out.push(blk[col2]); });
    }
    return out;
  }

  /* ---------- matrix ---------- */

  function makeMatrix(version) {
    var size = 17 + 4 * version;
    var m = [], f = [];   // modules, isFunction
    for (var r = 0; r < size; r++) { m.push(new Uint8Array(size)); f.push(new Uint8Array(size)); }

    function set(r, c, v) { m[r][c] = v; f[r][c] = 1; }

    function finder(r0, c0) {
      for (var r = -1; r <= 7; r++) {
        for (var c = -1; c <= 7; c++) {
          var rr = r0 + r, cc = c0 + c;
          if (rr < 0 || cc < 0 || rr >= size || cc >= size) continue;
          var inside = r >= 0 && r <= 6 && c >= 0 && c <= 6;
          var dark = inside && (r === 0 || r === 6 || c === 0 || c === 6 || (r >= 2 && r <= 4 && c >= 2 && c <= 4));
          set(rr, cc, dark ? 1 : 0);
        }
      }
    }
    finder(0, 0); finder(0, size - 7); finder(size - 7, 0);

    // timing
    for (var i = 8; i < size - 8; i++) {
      if (!f[6][i]) set(6, i, i % 2 === 0 ? 1 : 0);
      if (!f[i][6]) set(i, 6, i % 2 === 0 ? 1 : 0);
    }

    // alignment | skip ONLY the three finder corners (alignment patterns
    // legitimately sit on the timing row/col at versions ≥ 7)
    (ALIGN[version] || []).forEach(function (cr) {
      (ALIGN[version] || []).forEach(function (cc) {
        var inFinder = (cr <= 8 && cc <= 8) || (cr <= 8 && cc >= size - 9) || (cr >= size - 9 && cc <= 8);
        if (inFinder) return;
        for (var r = -2; r <= 2; r++) {
          for (var c = -2; c <= 2; c++) {
            var dark = Math.max(Math.abs(r), Math.abs(c)) !== 1;
            set(cr + r, cc + c, dark ? 1 : 0);
          }
        }
      });
    });

    // dark module + reserve format areas
    set(4 * version + 9, 8, 1);
    for (var k = 0; k <= 8; k++) {
      if (k !== 6) {
        if (!f[8][k]) set(8, k, 0);
        if (!f[k][8]) set(k, 8, 0);
      }
    }
    for (var k2 = 0; k2 < 8; k2++) {
      if (!f[8][size - 1 - k2]) set(8, size - 1 - k2, 0);
      if (!f[size - 1 - k2][8]) set(size - 1 - k2, 8, 0);
    }
    // version info areas (v >= 7)
    if (version >= 7) {
      for (var a = 0; a < 6; a++) {
        for (var b = 0; b < 3; b++) {
          set(size - 11 + b, a, 0);
          set(a, size - 11 + b, 0);
        }
      }
    }
    return { size: size, m: m, f: f };
  }

  function placeData(mat, codewords) {
    var size = mat.size, m = mat.m, f = mat.f;
    var bitIdx = 0, total = codewords.length * 8;
    function nextBit() {
      if (bitIdx >= total) return 0;
      var b = (codewords[bitIdx >> 3] >> (7 - (bitIdx & 7))) & 1;
      bitIdx++;
      return b;
    }
    var upward = true;
    for (var col = size - 1; col > 0; col -= 2) {
      if (col === 6) col--;
      for (var i = 0; i < size; i++) {
        var r = upward ? size - 1 - i : i;
        for (var dc = 0; dc < 2; dc++) {
          var c = col - dc;
          if (!f[r][c]) m[r][c] = nextBit();
        }
      }
      upward = !upward;
    }
  }

  var MASKS = [
    function (r, c) { return (r + c) % 2 === 0; },
    function (r, c) { return r % 2 === 0; },
    function (r, c) { return c % 3 === 0; },
    function (r, c) { return (r + c) % 3 === 0; },
    function (r, c) { return (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0; },
    function (r, c) { return (r * c) % 2 + (r * c) % 3 === 0; },
    function (r, c) { return ((r * c) % 2 + (r * c) % 3) % 2 === 0; },
    function (r, c) { return ((r + c) % 2 + (r * c) % 3) % 2 === 0; }
  ];

  function bchFormat(level, mask) {
    var data = (EC_BITS[level] << 3) | mask;
    var v = data << 10;
    while (highBit(v) >= 10) v ^= 0x537 << (highBit(v) - 10);
    return ((data << 10) | v) ^ 0x5412;
  }

  function bchVersion(version) {
    var v = version << 12;
    while (highBit(v) >= 12) v ^= 0x1F25 << (highBit(v) - 12);
    return (version << 12) | v;
  }

  function highBit(x) {
    var h = -1;
    while (x) { h++; x >>= 1; }
    return h;
  }

  function drawFormat(mat, level, mask) {
    var size = mat.size, m = mat.m;
    var bits = bchFormat(level, mask);
    var A = [[8, 0], [8, 1], [8, 2], [8, 3], [8, 4], [8, 5], [8, 7], [8, 8], [7, 8], [5, 8], [4, 8], [3, 8], [2, 8], [1, 8], [0, 8]];
    var B = [[size - 1, 8], [size - 2, 8], [size - 3, 8], [size - 4, 8], [size - 5, 8], [size - 6, 8], [size - 7, 8],
             [8, size - 8], [8, size - 7], [8, size - 6], [8, size - 5], [8, size - 4], [8, size - 3], [8, size - 2], [8, size - 1]];
    for (var i = 0; i < 15; i++) {
      var bit = (bits >> (14 - i)) & 1;
      m[A[i][0]][A[i][1]] = bit;
      m[B[i][0]][B[i][1]] = bit;
    }
  }

  function drawVersion(mat, version) {
    if (version < 7) return;
    var size = mat.size, m = mat.m;
    var bits = bchVersion(version);
    for (var i = 0; i < 18; i++) {
      var bit = (bits >> i) & 1;
      var a = Math.floor(i / 3), b = size - 11 + (i % 3);
      m[b][a] = bit;   // bottom-left block
      m[a][b] = bit;   // top-right block
    }
  }

  function penalty(m, size) {
    var p = 0, r, c;
    // N1 runs
    for (var dir = 0; dir < 2; dir++) {
      for (r = 0; r < size; r++) {
        var run = 1;
        for (c = 1; c < size; c++) {
          var cur = dir ? m[c][r] : m[r][c];
          var prev = dir ? m[c - 1][r] : m[r][c - 1];
          if (cur === prev) {
            run++;
            if (c === size - 1 && run >= 5) p += 3 + run - 5;
          } else {
            if (run >= 5) p += 3 + run - 5;
            run = 1;
          }
        }
      }
    }
    // N2 2x2 blocks
    for (r = 0; r < size - 1; r++) {
      for (c = 0; c < size - 1; c++) {
        var v = m[r][c];
        if (m[r][c + 1] === v && m[r + 1][c] === v && m[r + 1][c + 1] === v) p += 3;
      }
    }
    // N3 finder-like patterns
    var pat1 = [1, 0, 1, 1, 1, 0, 1, 0, 0, 0, 0], pat2 = [0, 0, 0, 0, 1, 0, 1, 1, 1, 0, 1];
    function checkAt(get) {
      for (var i = 0; i <= size - 11; i++) {
        var ok1 = true, ok2 = true;
        for (var j = 0; j < 11; j++) {
          var v2 = get(i + j);
          if (v2 !== pat1[j]) ok1 = false;
          if (v2 !== pat2[j]) ok2 = false;
        }
        if (ok1) p += 40;
        if (ok2) p += 40;
      }
    }
    for (r = 0; r < size; r++) {
      (function (rr) { checkAt(function (k) { return m[rr][k]; }); })(r);
      (function (cc) { checkAt(function (k) { return m[k][cc]; }); })(r);
    }
    // N4 dark proportion
    var dark = 0;
    for (r = 0; r < size; r++) for (c = 0; c < size; c++) dark += m[r][c];
    var pct = dark * 100 / (size * size);
    p += Math.floor(Math.abs(pct - 50) / 5) * 10;
    return p;
  }

  function buildWithMask(codewords, version, level, mask) {
    var mat = makeMatrix(version);
    placeData(mat, codewords);
    for (var r = 0; r < mat.size; r++) {
      for (var c = 0; c < mat.size; c++) {
        if (!mat.f[r][c] && MASKS[mask](r, c)) mat.m[r][c] ^= 1;
      }
    }
    drawFormat(mat, level, mask);
    drawVersion(mat, version);
    return mat;
  }

  function encode(text, level, forcedMask, forcedVersion) {
    level = level || 'M';
    if (!EC_TABLE[level]) throw new Error('bad EC level');
    var bytes = utf8Bytes(String(text));
    var version = forcedVersion || pickVersion(bytes.length, level);
    if (version === -1) throw new Error('text too long for this QR (max ~' +
      (EC_TABLE[level][9][1] * EC_TABLE[level][9][2] + EC_TABLE[level][9][3] * EC_TABLE[level][9][4] - 3) + ' bytes at level ' + level + ')');
    if (forcedVersion && pickVersion(bytes.length, level) > forcedVersion) {
      throw new Error('text too long for version ' + forcedVersion);
    }

    var codewords = buildCodewords(bytes, version, level);
    var best = null, bestScore = Infinity, bestMask = 0;

    if (forcedMask !== undefined) {
      best = buildWithMask(codewords, version, level, forcedMask);
      bestMask = forcedMask;
    } else {
      for (var mask = 0; mask < 8; mask++) {
        var mat = buildWithMask(codewords, version, level, mask);
        var score = penalty(mat.m, mat.size);
        if (score < bestScore) { bestScore = score; best = mat; bestMask = mask; }
      }
    }

    return { version: version, size: best.size, ecLevel: level, mask: bestMask, matrix: best.m };
  }

  var api = {
    encode: encode,
    _internal: { rsEncode: rsEncode, bchFormat: bchFormat, bchVersion: bchVersion, pickVersion: pickVersion, utf8Bytes: utf8Bytes }
  };

  if (typeof window !== 'undefined') window.qrLite = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})();
