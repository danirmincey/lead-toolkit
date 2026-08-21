/* ==========================================================================
   xlsx-lite | minimal .xlsx reader for the LEAD Toolkit. No dependencies:
   uses the browser's built-in DecompressionStream for the zip entries and
   regex parsing for the narrow, machine-generated OOXML we care about.
   Read-only, first-class support for: shared strings (incl. rich text),
   inline strings, numbers, booleans, date-formatted cells, multiple sheets.
   Exposes window.parseXlsx(arrayBuffer) -> Promise<[{name, rows}]>,
   where rows is an array of arrays (strings/numbers).
   Also exports pure helpers for node tests (pass {inflateRaw} there).
   ========================================================================== */

(function () {
  'use strict';

  /* ---------- tiny utils ---------- */

  function u16(b, o) { return b[o] | (b[o + 1] << 8); }
  function u32(b, o) { return (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0; }

  var ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };

  function decodeEntities(s) {
    return s.replace(/&(#x?[0-9a-fA-F]+|[a-z]+);/g, function (m, e) {
      if (e[0] === '#') {
        var code = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
        return String.fromCodePoint(code);
      }
      return ENTITIES[e] !== undefined ? ENTITIES[e] : m;
    });
  }

  // concat every <t>…</t> inside a fragment (handles rich-text runs)
  function textOf(fragment) {
    var out = '', re = /<t(?:\s[^>]*)?>([\s\S]*?)<\/t>|<t(?:\s[^>]*)?\/>/g, m;
    while ((m = re.exec(fragment)) !== null) out += m[1] === undefined ? '' : decodeEntities(m[1]);
    return out;
  }

  function colToIndex(ref) {
    var m = /^([A-Z]+)/.exec(ref);
    if (!m) return -1;
    var n = 0;
    for (var i = 0; i < m[1].length; i++) n = n * 26 + (m[1].charCodeAt(i) - 64);
    return n - 1;
  }

  /* ---------- zip reading (central directory) ---------- */

  function readZipEntries(bytes) {
    // find End Of Central Directory (scan back for PK\x05\x06)
    var i = bytes.length - 22;
    var min = Math.max(0, bytes.length - 22 - 65535);
    while (i >= min) {
      if (bytes[i] === 0x50 && bytes[i + 1] === 0x4B && bytes[i + 2] === 0x05 && bytes[i + 3] === 0x06) break;
      i--;
    }
    if (i < min) throw new Error('not a zip file (no central directory)');
    var count = u16(bytes, i + 10);
    var cdOff = u32(bytes, i + 16);

    var entries = {};
    var p = cdOff;
    for (var k = 0; k < count; k++) {
      if (u32(bytes, p) !== 0x02014b50) throw new Error('bad central directory');
      var method = u16(bytes, p + 10);
      var csize = u32(bytes, p + 20);
      var nameLen = u16(bytes, p + 28);
      var extraLen = u16(bytes, p + 30);
      var cmtLen = u16(bytes, p + 32);
      var lho = u32(bytes, p + 42);
      var name = '';
      for (var c = 0; c < nameLen; c++) name += String.fromCharCode(bytes[p + 46 + c]);
      // local header: skip its own name/extra lengths
      var lNameLen = u16(bytes, lho + 26), lExtraLen = u16(bytes, lho + 28);
      var dataOff = lho + 30 + lNameLen + lExtraLen;
      entries[name] = { method: method, data: bytes.subarray(dataOff, dataOff + csize) };
      p += 46 + nameLen + extraLen + cmtLen;
    }
    return entries;
  }

  function makeInflater(opts) {
    if (opts && opts.inflateRaw) return opts.inflateRaw; // node tests inject zlib
    if (typeof DecompressionStream === 'undefined') {
      throw new Error('This browser cannot decompress .xlsx files | please save the sheet as CSV instead.');
    }
    return function (data) {
      var ds = new DecompressionStream('deflate-raw');
      var stream = new Blob([data]).stream().pipeThrough(ds);
      return new Response(stream).arrayBuffer().then(function (ab) { return new Uint8Array(ab); });
    };
  }

  function getFileText(entries, path, inflate) {
    var e = entries[path];
    if (!e) return Promise.resolve(null);
    var bytesP = e.method === 0 ? Promise.resolve(e.data) : Promise.resolve(inflate(e.data));
    return bytesP.then(function (b) { return new TextDecoder('utf-8').decode(b); });
  }

  /* ---------- workbook structure ---------- */

  function parseWorkbook(xml) {
    var sheets = [];
    var re = /<sheet\s[^>]*?\/?>/g, m;
    while ((m = re.exec(xml)) !== null) {
      var tag = m[0];
      var name = /name="([^"]*)"/.exec(tag);
      var rid = /r:id="([^"]*)"/.exec(tag) || /id="([^"]*)"/.exec(tag);
      sheets.push({ name: name ? decodeEntities(name[1]) : 'Sheet', rid: rid ? rid[1] : null });
    }
    var date1904 = /date1904="(1|true)"/.test(xml);
    return { sheets: sheets, date1904: date1904 };
  }

  function parseRels(xml) {
    var map = {};
    if (!xml) return map;
    var re = /<Relationship\s[^>]*?\/?>/g, m;
    while ((m = re.exec(xml)) !== null) {
      var id = /Id="([^"]*)"/.exec(m[0]);
      var target = /Target="([^"]*)"/.exec(m[0]);
      if (id && target) {
        var t = target[1];
        if (t[0] === '/') t = t.slice(1); else t = 'xl/' + t.replace(/^\.\//, '');
        map[id[1]] = t.replace(/\/{2,}/g, '/');
      }
    }
    return map;
  }

  function parseSharedStrings(xml) {
    var out = [];
    if (!xml) return out;
    var re = /<si(?:\s[^>]*)?>([\s\S]*?)<\/si>|<si\/>/g, m;
    while ((m = re.exec(xml)) !== null) out.push(m[1] === undefined ? '' : textOf(m[1]));
    return out;
  }

  // date-format detection: builtin ids + custom codes that look like dates
  var BUILTIN_DATE_IDS = { 14: 1, 15: 1, 16: 1, 17: 1, 18: 1, 19: 1, 20: 1, 21: 1, 22: 1, 45: 1, 46: 1, 47: 1 };

  function parseStyles(xml) {
    var dateStyles = {};           // style index (s attr) -> true if date
    if (!xml) return dateStyles;
    var custom = {};               // numFmtId -> looks like date
    var re = /<numFmt\s[^>]*?\/?>/g, m;
    while ((m = re.exec(xml)) !== null) {
      var id = /numFmtId="(\d+)"/.exec(m[0]);
      var code = /formatCode="([^"]*)"/.exec(m[0]);
      if (id && code) {
        var c = decodeEntities(code[1]).replace(/"[^"]*"/g, '').replace(/\[[^\]]*\]/g, '');
        custom[id[1]] = /[ymdh]/i.test(c) && !/#|0\.0|%/.test(c);
      }
    }
    var xfsBlock = /<cellXfs[^>]*>([\s\S]*?)<\/cellXfs>/.exec(xml);
    if (!xfsBlock) return dateStyles;
    var idx = 0, xre = /<xf\s[^>]*?\/?>(?:<\/xf>)?/g, xm;
    while ((xm = xre.exec(xfsBlock[1])) !== null) {
      var fid = /numFmtId="(\d+)"/.exec(xm[0]);
      if (fid) {
        var n = fid[1];
        if (BUILTIN_DATE_IDS[n] || custom[n]) dateStyles[idx] = true;
      }
      idx++;
    }
    return dateStyles;
  }

  function serialToDateString(serial, date1904) {
    var base = date1904 ? Date.UTC(1904, 0, 1) : Date.UTC(1899, 11, 30);
    var ms = base + serial * 86400000;
    var d = new Date(Math.round(ms / 60000) * 60000); // snap to minute
    var pad = function (x) { return (x < 10 ? '0' : '') + x; };
    var s = d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1) + '-' + pad(d.getUTCDate());
    var frac = serial % 1;
    if (frac > 1e-6) s += ' ' + pad(d.getUTCHours()) + ':' + pad(d.getUTCMinutes());
    return s;
  }

  /* ---------- sheet parsing ---------- */

  function parseSheet(xml, shared, dateStyles, date1904) {
    var rows = [];
    var rowRe = /<row(?:\s[^>]*)?>([\s\S]*?)<\/row>|<row(?:\s[^>]*)?\/>/g, rm;
    while ((rm = rowRe.exec(xml)) !== null) {
      var inner = rm[1];
      var row = [];
      if (inner !== undefined) {
        var cellRe = /<c(\s[^>]*)?\/>|<c(\s[^>]*)?>([\s\S]*?)<\/c>/g, cm;
        var autoCol = 0;
        while ((cm = cellRe.exec(inner)) !== null) {
          var attrs = cm[1] !== undefined ? cm[1] : (cm[2] || '');
          var body = cm[3];
          var rAttr = /\br="([A-Z]+\d+)"/.exec(attrs || '');
          var col = rAttr ? colToIndex(rAttr[1]) : autoCol;
          autoCol = col + 1;
          var t = /\bt="([^"]*)"/.exec(attrs || '');
          t = t ? t[1] : 'n';
          var sAttr = /\bs="(\d+)"/.exec(attrs || '');
          var val = '';
          if (body !== undefined) {
            if (t === 'inlineStr') {
              val = textOf(body);
            } else {
              var v = /<v(?:\s[^>]*)?>([\s\S]*?)<\/v>/.exec(body);
              var raw = v ? decodeEntities(v[1]) : '';
              if (t === 's') val = shared[parseInt(raw, 10)] !== undefined ? shared[parseInt(raw, 10)] : '';
              else if (t === 'str') val = raw;
              else if (t === 'b') val = raw === '1' ? 'TRUE' : 'FALSE';
              else if (t === 'e') val = '';
              else { // number
                var num = parseFloat(raw);
                if (isNaN(num)) val = raw;
                else if (sAttr && dateStyles[sAttr[1]]) val = serialToDateString(num, date1904);
                else val = num;
              }
            }
          }
          while (row.length < col) row.push('');
          row[col] = val;
        }
      }
      rows.push(row);
    }
    // trim fully empty trailing rows; keep interior structure
    while (rows.length && rows[rows.length - 1].every(function (c) { return c === ''; })) rows.pop();
    return rows.filter(function (r) { return r.some(function (c) { return c !== ''; }); });
  }

  /* ---------- main entry ---------- */

  function parseXlsx(arrayBuffer, opts) {
    return Promise.resolve().then(function () {
      var bytes = arrayBuffer instanceof Uint8Array ? arrayBuffer : new Uint8Array(arrayBuffer);
      var entries = readZipEntries(bytes);
      var inflate = makeInflater(opts);
      var get = function (p) { return getFileText(entries, p, inflate); };

      return Promise.all([
        get('xl/workbook.xml'),
        get('xl/_rels/workbook.xml.rels'),
        get('xl/sharedStrings.xml'),
        get('xl/styles.xml')
      ]).then(function (parts) {
        var wbXml = parts[0];
        if (!wbXml) throw new Error('no workbook.xml | is this a real .xlsx?');
        var wb = parseWorkbook(wbXml);
        var rels = parseRels(parts[1]);
        var shared = parseSharedStrings(parts[2]);
        var dateStyles = parseStyles(parts[3]);

        var jobs = wb.sheets.map(function (sh, i) {
          var path = (sh.rid && rels[sh.rid]) || ('xl/worksheets/sheet' + (i + 1) + '.xml');
          return get(path).then(function (xml) {
            return { name: sh.name, rows: xml ? parseSheet(xml, shared, dateStyles, wb.date1904) : [] };
          });
        });
        return Promise.all(jobs);
      });
    });
  }

  function isZipFile(bytes) {
    return bytes.length > 3 && bytes[0] === 0x50 && bytes[1] === 0x4B && (bytes[2] === 3 || bytes[2] === 5 || bytes[2] === 7);
  }

  var api = {
    parseXlsx: parseXlsx,
    isZipFile: isZipFile,
    _internal: {
      readZipEntries: readZipEntries, parseWorkbook: parseWorkbook, parseRels: parseRels,
      parseSharedStrings: parseSharedStrings, parseStyles: parseStyles, parseSheet: parseSheet,
      serialToDateString: serialToDateString, colToIndex: colToIndex, decodeEntities: decodeEntities
    }
  };

  if (typeof window !== 'undefined') {
    window.parseXlsx = parseXlsx;
    window.xlsxLite = api;
  }
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})();
