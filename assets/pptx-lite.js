/* ==========================================================================
   pptx-lite | minimal .pptx writer for the LEAD Toolkit. Zero dependencies:
   builds the OOXML package by hand and zips it with STORED (uncompressed)
   entries. Used by Faces, Companies, Groups, Abhas/Bussan, VP Groups and
   the Kidney deck.

   API | single slide (back-compatible):
     pptxLite.makePptx({ canvasW, canvasH, background, images, texts, tables })
   API | multi-slide deck:
     pptxLite.makePptx({ canvasW, canvasH, slides: [ {background, images,
       texts, tables, canvasW?, canvasH?}, … ] })
   -> Uint8Array (the .pptx file bytes)

   images: [{ bytes:Uint8Array, ext:'png'|'jpeg', x,y,w,h, shape:'ellipse'|
              'rect', borderColor, borderPx, name }]
   texts:  [{ text, x,y,w,h, fontPx, color, bold, font, align? }]
   tables: [{ x, y, colWidths:[px…], border:{color,w}, font,
              rows:[{ h, cells:[{ fill, span?, merged?, paras:[{ runs:
              [{text,bold,color}], sizePx, align }] }] }] }]
   Tables become NATIVE, fully editable PowerPoint tables (gridSpan merges
   supported). Each canvas frame is fit-scaled onto a 16:9 slide, centered.
   ========================================================================== */

(function () {
  'use strict';

  /* ---------- CRC32 + zip (stored entries only) ---------- */

  var CRC_TABLE = (function () {
    var t = new Array(256), c;
    for (var n = 0; n < 256; n++) {
      c = n;
      for (var k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      t[n] = c >>> 0;
    }
    return t;
  })();

  function crc32(bytes) {
    var c = 0xFFFFFFFF;
    for (var i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8);
    return (c ^ 0xFFFFFFFF) >>> 0;
  }

  function strBytes(s) {
    if (typeof TextEncoder !== 'undefined') return new TextEncoder().encode(s);
    var out = [];
    for (var i = 0; i < s.length; i++) out.push(s.charCodeAt(i) & 0xFF);
    return new Uint8Array(out);
  }

  function zipStore(files) {
    var chunks = [], central = [], offset = 0;
    var dosTime = (12 << 11), dosDate = ((2026 - 1980) << 9) | (8 << 5) | 21;

    function push16(arr, v) { arr.push(v & 0xFF, (v >>> 8) & 0xFF); }
    function push32(arr, v) { arr.push(v & 0xFF, (v >>> 8) & 0xFF, (v >>> 16) & 0xFF, (v >>> 24) & 0xFF); }

    files.forEach(function (f) {
      var nameB = strBytes(f.name);
      var crc = crc32(f.bytes);
      var head = [];
      push32(head, 0x04034b50); push16(head, 20); push16(head, 0); push16(head, 0);
      push16(head, dosTime); push16(head, dosDate);
      push32(head, crc); push32(head, f.bytes.length); push32(head, f.bytes.length);
      push16(head, nameB.length); push16(head, 0);
      chunks.push(new Uint8Array(head), nameB, f.bytes);

      var cd = [];
      push32(cd, 0x02014b50); push16(cd, 20); push16(cd, 20); push16(cd, 0); push16(cd, 0);
      push16(cd, dosTime); push16(cd, dosDate);
      push32(cd, crc); push32(cd, f.bytes.length); push32(cd, f.bytes.length);
      push16(cd, nameB.length); push16(cd, 0); push16(cd, 0); push16(cd, 0); push16(cd, 0);
      push32(cd, 0); push32(cd, offset);
      central.push({ head: new Uint8Array(cd), name: nameB });

      offset += 30 + nameB.length + f.bytes.length;
    });

    var cdStart = offset, cdSize = 0;
    central.forEach(function (c) {
      chunks.push(c.head, c.name);
      cdSize += c.head.length + c.name.length;
    });
    var eocd = [];
    push32(eocd, 0x06054b50); push16(eocd, 0); push16(eocd, 0);
    push16(eocd, files.length); push16(eocd, files.length);
    push32(eocd, cdSize); push32(eocd, cdStart); push16(eocd, 0);
    chunks.push(new Uint8Array(eocd));

    var total = 0;
    chunks.forEach(function (c) { total += c.length; });
    var out = new Uint8Array(total), p = 0;
    chunks.forEach(function (c) { out.set(c, p); p += c.length; });
    return out;
  }

  /* ---------- OOXML boilerplate ---------- */

  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&apos;');
  }

  var XMLH = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\r\n';

  var THEME =
    XMLH +
    '<a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" name="LEAD">' +
    '<a:themeElements>' +
    '<a:clrScheme name="LEAD"><a:dk1><a:sysClr val="windowText" lastClr="000000"/></a:dk1>' +
    '<a:lt1><a:sysClr val="window" lastClr="FFFFFF"/></a:lt1>' +
    '<a:dk2><a:srgbClr val="1F4E79"/></a:dk2><a:lt2><a:srgbClr val="E7E6E6"/></a:lt2>' +
    '<a:accent1><a:srgbClr val="2E75B6"/></a:accent1><a:accent2><a:srgbClr val="0081CD"/></a:accent2>' +
    '<a:accent3><a:srgbClr val="08306B"/></a:accent3><a:accent4><a:srgbClr val="6BAED6"/></a:accent4>' +
    '<a:accent5><a:srgbClr val="4472C4"/></a:accent5><a:accent6><a:srgbClr val="70AD47"/></a:accent6>' +
    '<a:hlink><a:srgbClr val="0563C1"/></a:hlink><a:folHlink><a:srgbClr val="954F72"/></a:folHlink></a:clrScheme>' +
    '<a:fontScheme name="LEAD"><a:majorFont><a:latin typeface="Corbel"/><a:ea typeface=""/><a:cs typeface=""/></a:majorFont>' +
    '<a:minorFont><a:latin typeface="Candara"/><a:ea typeface=""/><a:cs typeface=""/></a:minorFont></a:fontScheme>' +
    '<a:fmtScheme name="LEAD">' +
    '<a:fillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill>' +
    '<a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:fillStyleLst>' +
    '<a:lnStyleLst><a:ln w="6350"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln>' +
    '<a:ln w="12700"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln>' +
    '<a:ln w="19050"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln></a:lnStyleLst>' +
    '<a:effectStyleLst><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle>' +
    '<a:effectStyle><a:effectLst/></a:effectStyle></a:effectStyleLst>' +
    '<a:bgFillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill>' +
    '<a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:bgFillStyleLst>' +
    '</a:fmtScheme></a:themeElements></a:theme>';

  var SLIDE_MASTER =
    XMLH +
    '<p:sldMaster xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" ' +
    'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" ' +
    'xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">' +
    '<p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>' +
    '<p:grpSpPr/></p:spTree></p:cSld>' +
    '<p:clrMap bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" ' +
    'accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/>' +
    '<p:sldLayoutIdLst><p:sldLayoutId id="2147483649" r:id="rId1"/></p:sldLayoutIdLst>' +
    '<p:txStyles><p:titleStyle/><p:bodyStyle/><p:otherStyle/></p:txStyles>' +
    '</p:sldMaster>';

  var SLIDE_LAYOUT =
    XMLH +
    '<p:sldLayout xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" ' +
    'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" ' +
    'xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" type="blank">' +
    '<p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>' +
    '<p:grpSpPr/></p:spTree></p:cSld><p:clrMapOvr><a:overrideClrMapping bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" ' +
    'accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" ' +
    'hlink="hlink" folHlink="folHlink"/></p:clrMapOvr></p:sldLayout>';

  var SLIDE_W = 12192000, SLIDE_H = 6858000;   // 16:9 EMU

  /* ---------- one slide's XML ---------- */

  function buildSlide(sl, defaults, mediaStart) {
    var canvasW = sl.canvasW || defaults.canvasW || 2560;
    var canvasH = sl.canvasH || defaults.canvasH || 1440;
    var scale = Math.min(SLIDE_W / canvasW, SLIDE_H / canvasH);
    var offX = Math.round((SLIDE_W - canvasW * scale) / 2);
    var offY = Math.round((SLIDE_H - canvasH * scale) / 2);
    var E = function (px) { return Math.round(px * scale); };
    var bg = (sl.background || defaults.background || '#FFFFFF').replace('#', '').toUpperCase();

    var shapes = '';
    var id = 2;
    var rels = '<Relationship Id="rId1" ' +
      'Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" ' +
      'Target="../slideLayouts/slideLayout1.xml"/>';
    var media = [];

    (sl.images || []).forEach(function (im, i) {
      var rid = 'rId' + (i + 2);
      var ext = im.ext === 'jpeg' ? 'jpeg' : 'png';
      var mediaName = 'image' + (mediaStart + media.length + 1) + '.' + ext;
      media.push({ name: 'ppt/media/' + mediaName, bytes: im.bytes });
      rels += '<Relationship Id="' + rid + '" ' +
        'Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" ' +
        'Target="../media/' + mediaName + '"/>';

      var ln = '';
      if (im.borderColor && im.borderPx > 0) {
        ln = '<a:ln w="' + E(im.borderPx) + '"><a:solidFill><a:srgbClr val="' +
          im.borderColor.replace('#', '').toUpperCase() + '"/></a:solidFill></a:ln>';
      }
      shapes +=
        '<p:pic><p:nvPicPr><p:cNvPr id="' + (id++) + '" name="' + esc(im.name || ('Image ' + (i + 1))) + '"/>' +
        '<p:cNvPicPr/><p:nvPr/></p:nvPicPr>' +
        '<p:blipFill><a:blip r:embed="' + rid + '"/><a:stretch><a:fillRect/></a:stretch></p:blipFill>' +
        '<p:spPr><a:xfrm><a:off x="' + (offX + E(im.x)) + '" y="' + (offY + E(im.y)) + '"/>' +
        '<a:ext cx="' + Math.max(1, E(im.w)) + '" cy="' + Math.max(1, E(im.h)) + '"/></a:xfrm>' +
        '<a:prstGeom prst="' + (im.shape === 'ellipse' ? 'ellipse' : 'rect') + '"><a:avLst/></a:prstGeom>' +
        ln + '</p:spPr></p:pic>';
    });

    (sl.texts || []).forEach(function (tx) {
      if (!tx.text) return;
      var sz = Math.max(100, Math.round(tx.fontPx * scale / 12700 * 100));
      shapes +=
        '<p:sp><p:nvSpPr><p:cNvPr id="' + (id++) + '" name="Text"/>' +
        '<p:cNvSpPr txBox="1"/><p:nvPr/></p:nvSpPr>' +
        '<p:spPr><a:xfrm><a:off x="' + (offX + E(tx.x)) + '" y="' + (offY + E(tx.y)) + '"/>' +
        '<a:ext cx="' + Math.max(1, E(tx.w)) + '" cy="' + Math.max(1, E(tx.h)) + '"/></a:xfrm>' +
        '<a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:noFill/></p:spPr>' +
        '<p:txBody><a:bodyPr wrap="square" anchor="ctr"/><a:lstStyle/><a:p><a:pPr algn="' + (tx.align || 'ctr') + '"/>' +
        '<a:r><a:rPr lang="en-US" sz="' + sz + '"' + (tx.bold === false ? '' : ' b="1"') + ' dirty="0">' +
        '<a:solidFill><a:srgbClr val="' + (tx.color || '#2E75B6').replace('#', '').toUpperCase() + '"/></a:solidFill>' +
        '<a:latin typeface="' + esc(tx.font || 'Corbel') + '"/></a:rPr>' +
        '<a:t>' + esc(tx.text) + '</a:t></a:r></a:p></p:txBody></p:sp>';
    });

    (sl.tables || []).forEach(function (tb) {
      var font = tb.font || 'Candara';
      var bw = Math.max(1, E((tb.border && tb.border.w) || 2));
      var bc = ((tb.border && tb.border.color) || '#7E88C6').replace('#', '').toUpperCase();
      var line = function (tag) {
        return '<a:' + tag + ' w="' + bw + '" cap="flat" cmpd="sng" algn="ctr">' +
          '<a:solidFill><a:srgbClr val="' + bc + '"/></a:solidFill><a:prstDash val="solid"/></a:' + tag + '>';
      };
      var totalH = 0;
      tb.rows.forEach(function (r) { totalH += r.h; });

      var grid = tb.colWidths.map(function (cw) {
        return '<a:gridCol w="' + Math.max(1, E(cw)) + '"/>';
      }).join('');

      var rowsXml = tb.rows.map(function (r) {
        var cells = r.cells.map(function (cell) {
          var paras = (cell.paras || []).map(function (p) {
            var sz = Math.max(100, Math.round((p.sizePx || 14) * scale / 12700 * 100));
            var runs = (p.runs || []).map(function (run) {
              return '<a:r><a:rPr lang="en-US" sz="' + sz + '"' + (run.bold ? ' b="1"' : '') + ' dirty="0">' +
                '<a:solidFill><a:srgbClr val="' + ((run.color || '#000000').replace('#', '').toUpperCase()) + '"/></a:solidFill>' +
                '<a:latin typeface="' + esc(font) + '"/></a:rPr>' +
                '<a:t>' + esc(run.text) + '</a:t></a:r>';
            }).join('');
            return '<a:p><a:pPr algn="' + (p.align || 'ctr') + '"/>' + (runs || '<a:endParaRPr lang="en-US"/>') + '</a:p>';
          }).join('');
          var tcAttrs = '';
          if (cell.span > 1) tcAttrs += ' gridSpan="' + cell.span + '"';
          if (cell.merged) tcAttrs += ' hMerge="1"';
          return '<a:tc' + tcAttrs + '><a:txBody><a:bodyPr/><a:lstStyle/>' + (paras || '<a:p><a:endParaRPr lang="en-US"/></a:p>') + '</a:txBody>' +
            '<a:tcPr marL="27432" marR="27432" marT="13716" marB="13716" anchor="ctr">' +
            line('lnL') + line('lnR') + line('lnT') + line('lnB') +
            '<a:solidFill><a:srgbClr val="' + ((cell.fill || '#FFFFFF').replace('#', '').toUpperCase()) + '"/></a:solidFill>' +
            '</a:tcPr></a:tc>';
        }).join('');
        return '<a:tr h="' + Math.max(1, E(r.h)) + '">' + cells + '</a:tr>';
      }).join('');

      var sumW = 0;
      tb.colWidths.forEach(function (cw) { sumW += cw; });

      shapes +=
        '<p:graphicFrame><p:nvGraphicFramePr><p:cNvPr id="' + (id++) + '" name="Table"/>' +
        '<p:cNvGraphicFramePr/><p:nvPr/></p:nvGraphicFramePr>' +
        '<p:xfrm><a:off x="' + (offX + E(tb.x)) + '" y="' + (offY + E(tb.y)) + '"/>' +
        '<a:ext cx="' + Math.max(1, E(sumW)) + '" cy="' + Math.max(1, E(totalH)) + '"/></p:xfrm>' +
        '<a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/table">' +
        '<a:tbl><a:tblPr firstRow="0" bandRow="0">' +
        '<a:tableStyleId>{5940675A-B579-460E-94D1-54222C63F5DA}</a:tableStyleId></a:tblPr>' +
        '<a:tblGrid>' + grid + '</a:tblGrid>' + rowsXml +
        '</a:tbl></a:graphicData></a:graphic></p:graphicFrame>';
    });

    var slideXml =
      XMLH +
      '<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" ' +
      'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" ' +
      'xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">' +
      '<p:cSld><p:bg><p:bgPr><a:solidFill><a:srgbClr val="' + bg + '"/></a:solidFill><a:effectLst/></p:bgPr></p:bg>' +
      '<p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr/>' +
      shapes +
      '</p:spTree></p:cSld><p:clrMapOvr><a:overrideClrMapping bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" ' +
      'accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" ' +
      'hlink="hlink" folHlink="folHlink"/></p:clrMapOvr></p:sld>';

    var slideRels =
      XMLH +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      rels +
      '</Relationships>';

    return { xml: slideXml, rels: slideRels, media: media };
  }

  /* ---------- main entry ---------- */

  function makePptx(spec) {
    var slides = spec.slides || [spec];
    var files = [];
    var mediaFiles = [];
    var slideOverrides = '';
    var sldIds = '';
    var presRelsSlides = '';

    slides.forEach(function (sl, si) {
      var built = buildSlide(sl, spec, mediaFiles.length);
      built.media.forEach(function (m) { mediaFiles.push(m); });
      var n = si + 1;
      files.push({ name: 'ppt/slides/slide' + n + '.xml', bytes: strBytes(built.xml) });
      files.push({ name: 'ppt/slides/_rels/slide' + n + '.xml.rels', bytes: strBytes(built.rels) });
      slideOverrides += '<Override PartName="/ppt/slides/slide' + n + '.xml" ' +
        'ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>';
      sldIds += '<p:sldId id="' + (256 + si) + '" r:id="rId' + (si + 2) + '"/>';
      presRelsSlides += '<Relationship Id="rId' + (si + 2) + '" ' +
        'Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" ' +
        'Target="slides/slide' + n + '.xml"/>';
    });

    var themeRid = 'rId' + (slides.length + 2);

    var contentTypes =
      XMLH +
      '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
      '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
      '<Default Extension="xml" ContentType="application/xml"/>' +
      '<Default Extension="png" ContentType="image/png"/>' +
      '<Default Extension="jpeg" ContentType="image/jpeg"/>' +
      '<Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/>' +
      '<Override PartName="/ppt/slideMasters/slideMaster1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideMaster+xml"/>' +
      '<Override PartName="/ppt/slideLayouts/slideLayout1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideLayout+xml"/>' +
      slideOverrides +
      '<Override PartName="/ppt/theme/theme1.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/>' +
      '</Types>';

    var rootRels =
      XMLH +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="ppt/presentation.xml"/>' +
      '</Relationships>';

    var presentation =
      XMLH +
      '<p:presentation xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" ' +
      'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" ' +
      'xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">' +
      '<p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rId1"/></p:sldMasterIdLst>' +
      '<p:sldIdLst>' + sldIds + '</p:sldIdLst>' +
      '<p:sldSz cx="' + SLIDE_W + '" cy="' + SLIDE_H + '"/><p:notesSz cx="6858000" cy="9144000"/>' +
      '</p:presentation>';

    var presRels =
      XMLH +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="slideMasters/slideMaster1.xml"/>' +
      presRelsSlides +
      '<Relationship Id="' + themeRid + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme" Target="theme/theme1.xml"/>' +
      '</Relationships>';

    var masterRels =
      XMLH +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/>' +
      '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme" Target="../theme/theme1.xml"/>' +
      '</Relationships>';

    var layoutRels =
      XMLH +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="../slideMasters/slideMaster1.xml"/>' +
      '</Relationships>';

    var all = [
      { name: '[Content_Types].xml', bytes: strBytes(contentTypes) },
      { name: '_rels/.rels', bytes: strBytes(rootRels) },
      { name: 'ppt/presentation.xml', bytes: strBytes(presentation) },
      { name: 'ppt/_rels/presentation.xml.rels', bytes: strBytes(presRels) },
      { name: 'ppt/slideMasters/slideMaster1.xml', bytes: strBytes(SLIDE_MASTER) },
      { name: 'ppt/slideMasters/_rels/slideMaster1.xml.rels', bytes: strBytes(masterRels) },
      { name: 'ppt/slideLayouts/slideLayout1.xml', bytes: strBytes(SLIDE_LAYOUT) },
      { name: 'ppt/slideLayouts/_rels/slideLayout1.xml.rels', bytes: strBytes(layoutRels) },
      { name: 'ppt/theme/theme1.xml', bytes: strBytes(THEME) }
    ].concat(files).concat(mediaFiles.map(function (m) { return { name: m.name, bytes: m.bytes }; }));

    return zipStore(all);
  }

  var api = { makePptx: makePptx, crc32: crc32, zipStore: zipStore };
  if (typeof window !== 'undefined') window.pptxLite = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})();
