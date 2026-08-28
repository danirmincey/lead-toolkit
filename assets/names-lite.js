/* names-lite.js | shared name-column picking for the group selectors (v1.27)
   ---------------------------------------------------------------------------
   Her rosters carry Preferred / First / Last, and her own group-making sheets
   ("## making groups", allteams) use Preferred + Last, so PREFERRED is the
   default given name in every Group Selector. Style 'first' swaps in the legal
   First column. Column shape stays what the selectors always used: a given
   name plus Last when both exist, otherwise a single full-name column.
   Zero dependencies, no DOM. Loaded before the apps in index.html. */
(function () {
  'use strict';

  function findCols(headers) {
    var h = headers || [];
    function idx(re) {
      for (var i = 0; i < h.length; i++) if (re.test(String(h[i]))) return i;
      return -1;
    }
    return {
      preferred: idx(/prefer|nickname|goes\s*by/i),
      first: idx(/first/i),
      last: idx(/last|surname/i),
      full: idx(/name/i)
    };
  }

  // -> {nameCol, nameCol2, cols}; style is 'preferred' (default) or 'first'
  function pick(headers, style) {
    var c = findCols(headers);
    var given = style === 'first'
      ? (c.first !== -1 ? c.first : c.preferred)
      : (c.preferred !== -1 ? c.preferred : c.first);
    if (given !== -1 && c.last !== -1) return { nameCol: given, nameCol2: c.last, cols: c };
    var only = c.full !== -1 ? c.full : (given !== -1 ? given : 0);
    return { nameCol: only, nameCol2: -1, cols: c };
  }

  // the toggle is only meaningful when the file really carries both columns
  function styleApplies(cols) {
    return !!cols && cols.preferred !== -1 && cols.first !== -1 && cols.preferred !== cols.first;
  }

  var api = { findCols: findCols, pick: pick, styleApplies: styleApplies };
  if (typeof window !== 'undefined') window.leadNames = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})();
