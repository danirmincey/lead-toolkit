# Feedback triage | 2026-08-22 batch (40 rows -> 20 claims)

Source: LEAD Toolkit feedback Sheet, latest Rev per ClaimId. All from
dnr2117 / RPdL. Organized into waves; check off as shipped.

## WAVE 0 | Bugs and blockers (first)

- [ ] PGN-PFR: BROKEN import ("serious data issues... comma separated import
      issues as rows seem skip"). Reproduce with the real 07 Negotiation
      Outcomes export, fix, and add the summary numbers (avgs, % reached)
      VISIBLY IN THE APP, not only in the deck/copy text.
- [ ] PGN-SMS: NOT working on the Day 2 DM survey she loaded. Reproduce,
      fix autoselect; add a composite selector (auto-picked columns shown,
      user can change them); keep type-mean-by-hand; default the number
      line to 0-4 FIXED (remove the scale option and drop scale from copy
      text); move mean/data management out of Load data.
- [ ] DEX-KID: MATH AUDIT of persuasiveness/advocacy ("your plots are
      different AND your results are different"). BLOCKED ON DANI: need the
      reference tool/numbers to align to. Do not ship other kidney changes
      until the math is confirmed.
- [ ] Feedback widget fixes (4 claims):
      - closing the panel must NOT delete the draft (persist message/type/
        scope until sent or page reload; restore on reopen)
      - backdrop: keep the dimming, REMOVE the blur (text behind must stay
        legible for annotating while writing)
      - remove "Everyone's notes" entirely; "Your notes" becomes a
        COLLAPSED expander, sorted by app, so notes never crowd the form
      - ghost-note bug: a note not in the Sheet appeared under her UNI.
        "Your notes" must show ONLY claims whose uni matches the typed UNI
        (local cache included; uncredited legacy cache entries hidden)

## WAVE 1 | Cross-cutting doctrines (apply to EVERY relevant app)

- [ ] CLUSTER PICKER doctrine: on load, auto-detect a cluster column
      (heuristic ok; e.g. repeated values, groups under ~150 rows). One
      cluster -> pass through. Several -> prompt to tick clusters BEFORE
      results, defaulting to NONE selected, with "Select all" and
      "Clear all" buttons. No cluster column -> say so. Cluster block sits
      at the TOP of Load data. (Named in TPL, WCG, SES, SMS, BAP, CUL, CAR.)
- [ ] FONTS doctrine: LEAD-official inside the PLOTS too (headers Corbel
      blue, body Candara) for every app that exports figures; plus font
      family + size controls (headers, labels, N/%, Mean text). Named in
      TPL, FAC, IND, SES, MTE, CUL.
- [ ] PPT sizes: group-table exports to ~12pt (GSL-DMK, GSL-VPR, likely
      GSL-ABB/INF); kidney deck to ~Candara 20; audit other decks.
- [ ] REMOVE everywhere: "all processing local" phrasing ("cringe"), and
      the "variable names are in row N" selector (ALWAYS assume row 1).
- [ ] EDITABLE NUMBERS everywhere: every plot app extracts into an editable
      list before charting (PGN-SES still missing it; audit all).
- [ ] LAYOUT doctrine: Load data = loading only. Column pickers, name
      editors, mean overrides move to their own later blocks.

## WAVE 2 | Per-app features

- [ ] WCG: remove "how to count" and "remove these words" features; add
      ADD-a-word with editable counts (the editable-numbers pattern).
- [ ] PGN-TPL: font tinkering (big %, header text, cities/countries, mini
      N/%); domestic/intl veil at 100% opacity = full US cover, no cities;
      single treemaps get an editable title (var name default); categories
      list allows adding AND removing.
- [ ] CLG-FAC: paste-to-replace a photo in the recenter panel; LEAD fonts +
      color/font pickers (ring color auto-matches, still editable); NEW
      GRID STYLE: uniform squares in rows/columns filling the page,
      partial first/last rows centered, per-row count adapts to size,
      default no middle gap; style picker step before "Middle space &
      text"; middle text auto-fits/wraps to the gap (both personas).
- [ ] CLG-PER: inherits all CLG-FAC changes (same engine, verify).
- [ ] CLG-IND: LEAD font; intro rewritten as her 3 bulleted steps with the
      "CAN and WILL go wrong, supervise closely" warning.
- [ ] GSL-DMK: center the last partial row (or split into 2 tables);
      drag-and-drop the classrooms themselves; no borders on unfilled
      lingering cells in PPT; name editor moves out of Load data;
      click-a-name-to-edit in panel AND figure, synced both ways.
- [ ] GSL-INF: inherit DMK customization; default 4 columns per row;
      headers Candidate A..H (fixed 8; adding a 9th creates a group named
      "THIS EXERCISE ONLY HAS 8 GROUPS"). PRESET-SCOPED ONLY.
- [ ] GSL-ABB: group headers level across the strip; centered distribution
      (12 -> 4/4/4; 13 -> 4/5/4; overflow rows tacked at bottom); row-wise
      numbering (1 2 3 across row one) is acceptable if easier.
- [ ] GSL-VPR: PPT auto font to 12.
- [ ] DEX-LGS: realistic demo numbers (jitter around plausible means/SDs,
      never real students).
- [ ] PGN-BAP: drop the Gender/Race preset buttons; default the dropdown
      to a gender-ish column but let any column be picked; generalize the
      multi-column-checkbox combiner so ANY set of columns can be merged
      into one categorical (works for race, sexuality, etc.).
- [ ] PGN-MTE: frequency y axis; big "Mean = X.XX (SD = X.XX)" above in
      LEAD font/color; size + font customization.
- [ ] DEX-CUL: y axis, checkbox-optional like MTE; fonts; cluster doctrine.
- [ ] PGN-SES: separate "column to chart" from Load data; Mean text font.

## Blocked on Dani

1. DEX-KID: which reference numbers/tool should the advocacy and
   persuasiveness math match? (The DRRC workbook? Your R script? A slide
   with expected values for a known input file?) Send the source of truth.
2. PGN-SMS: the exact Day 2 DM survey file that failed to load (if it is
   not the "Ponce de Leon DM Data" file already on hand).
3. PGN-PFR: the exact outcomes export that broke, if different from the
   "07 Negotiation Outcomes - Fall 2025" file on hand.
