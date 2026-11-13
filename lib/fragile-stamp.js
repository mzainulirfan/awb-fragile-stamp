/**
 * fragile-stamp.js — inti penulisan stempel pada PDF label (AWB).
 *
 * Tidak menyentuh DOM dan tidak memakai API chrome supaya bisa diuji terpisah.
 * Bergantung pada global `PDFLib` (pdf-lib UMD) yang dimuat lebih dulu.
 *
 * Tata letak dihitung proporsional terhadap ukuran halaman, sehingga tetap
 * aman bila Shopee mengubah ukuran label (A5/A6) atau membuat halaman baru.
 * Acuan: label Instant 297,12 x 419,04 pt dengan area kosong y 0–144 pt.
 */
(function (root) {
  'use strict';

  const RATIO = {
    // area kosong bawah: konten berakhir di 0,344 H
    contentBottom: 0.344,
    // sisakan jarak dari baris konten paling bawah (mis. "Pesan:")
    safeGap: 0.025,
    badge: { x: 0.047, y: 0.110, w: 0.906, h: 0.200 },
    bar: { x: 0.034, y: 0.138, w: 0.932, h: 0.124 },
    font: { big: 0.0716, sub: 0.0322, small: 0.0191 },
  };

  const DEFAULTS = {
    variant: 'badge',
    icon: 'fragile',
    main: 'FRAGILE',
    sub: 'JANGAN DIBANTING',
    small: 'HANDLE WITH CARE',
    scale: 1,
    // -100 = kiri/bawah, 0 = posisi desain awal, 100 = kanan/atas.
    positionX: 0,
    positionY: 0,
    pageMode: 'all',
    selectedPages: [],
  };

  const ICONS = new Set(['warning', 'fragile', 'umbrella', 'up', 'fold', 'none']);

  function clamp(n, min, max) {
    return Math.min(max, Math.max(min, n));
  }

  function safeText(value, fallback, limit, allowEmpty) {
    const useFallback = value == null || (!allowEmpty && value === '');
    const raw = String(useFallback ? fallback : value)
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[\u2018\u2019]/g, "'")
      .replace(/[\u201C\u201D]/g, '"')
      .replace(/[\u2013\u2014]/g, '-')
      .replace(/[^\x20-\x7E]/gu, '?')
      .replace(/\s+/g, ' ')
      .trim();
    return raw.slice(0, limit);
  }

  function textWidth(font, text, size, spacing) {
    return font.widthOfTextAtSize(text, size) + (spacing || 0) * Math.max(0, text.length - 1);
  }

  function fitSize(font, text, preferred, maxWidth, minSize, spacingRatio) {
    if (!text) return preferred;
    const spacing = preferred * (spacingRatio || 0);
    const width = textWidth(font, text, preferred, spacing);
    if (width <= maxWidth) return preferred;
    return Math.max(minSize, preferred * (maxWidth / width));
  }

  function numeric(value, fallback) {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
  }

  /**
   * Gerakkan nilai dari posisi desain awal menuju batas aman.
   * control -100..0 bergerak ke min, 0..100 bergerak ke max.
   */
  function moveFromBase(base, min, max, control) {
    const lo = Math.min(min, max);
    const hi = Math.max(min, max);
    const anchor = clamp(base, lo, hi);
    const amount = clamp(numeric(control, 0), -100, 100) / 100;
    if (amount < 0) return anchor + (anchor - lo) * amount;
    return anchor + (hi - anchor) * amount;
  }

  function normalizeIcon(value) {
    return ICONS.has(value) ? value : DEFAULTS.icon;
  }

  function selectedPageSet(mode, values, pageCount) {
    if (mode !== 'custom') return null;
    const selected = new Set();
    if (!Array.isArray(values)) return selected;
    for (const value of values) {
      const page = Math.trunc(Number(value));
      if (page >= 1 && page <= pageCount) selected.add(page);
    }
    return selected;
  }

  function drawHandlingIcon(page, type, box) {
    if (type === 'none') return;
    const x = box.x;
    const y = box.y;
    const s = box.size;
    const color = box.color;
    const thick = Math.max(0.8, s * 0.065);
    const line = (x1, y1, x2, y2, width) => page.drawLine({
      start: { x: x + x1 * s, y: y + y1 * s },
      end: { x: x + x2 * s, y: y + y2 * s },
      thickness: width || thick,
      color,
    });

    if (type === 'warning') {
      line(0.10, 0.14, 0.90, 0.14);
      line(0.90, 0.14, 0.50, 0.88);
      line(0.50, 0.88, 0.10, 0.14);
      page.drawRectangle({
        x: x + s * 0.46, y: y + s * 0.39,
        width: s * 0.08, height: s * 0.24, color,
      });
      page.drawEllipse({
        x: x + s * 0.50, y: y + s * 0.28,
        xScale: s * 0.05, yScale: s * 0.05, color,
      });
      return;
    }

    if (type === 'fragile') {
      // Gelas: mangkuk, tangkai, dan alas.
      line(0.19, 0.82, 0.81, 0.82);
      line(0.19, 0.82, 0.31, 0.48);
      line(0.81, 0.82, 0.69, 0.48);
      line(0.31, 0.48, 0.69, 0.48);
      line(0.50, 0.48, 0.50, 0.20);
      line(0.28, 0.15, 0.72, 0.15);
      return;
    }

    if (type === 'umbrella') {
      // Kanopi bersegmen dan gagang payung.
      line(0.10, 0.54, 0.27, 0.72);
      line(0.27, 0.72, 0.50, 0.84);
      line(0.50, 0.84, 0.73, 0.72);
      line(0.73, 0.72, 0.90, 0.54);
      line(0.10, 0.54, 0.90, 0.54);
      line(0.50, 0.54, 0.50, 0.20);
      line(0.50, 0.20, 0.61, 0.12);
      line(0.61, 0.12, 0.70, 0.19);
      return;
    }

    if (type === 'up') {
      for (const center of [0.32, 0.68]) {
        line(center, 0.15, center, 0.76);
        line(center, 0.76, center - 0.17, 0.57);
        line(center, 0.76, center + 0.17, 0.57);
      }
      line(0.16, 0.12, 0.84, 0.12);
      return;
    }

    // Kertas terlipat dengan garis larangan diagonal.
    line(0.20, 0.12, 0.20, 0.86);
    line(0.20, 0.86, 0.65, 0.86);
    line(0.65, 0.86, 0.82, 0.68);
    line(0.82, 0.68, 0.82, 0.12);
    line(0.82, 0.12, 0.20, 0.12);
    line(0.65, 0.86, 0.65, 0.68);
    line(0.65, 0.68, 0.82, 0.68);
    line(0.08, 0.08, 0.92, 0.92, thick * 1.25);
  }

  /**
   * @param {Uint8Array} bytes PDF asli
   * @param {object} [opts]
   * @returns {Promise<{bytes: Uint8Array, pageCount: number, stampedPages: number[]}>}
   */
  async function stampDetailed(bytes, opts) {
    const o = Object.assign({}, DEFAULTS, opts || {});
    const PDFLib = root.PDFLib;
    if (!PDFLib) throw new Error('PDFLib belum dimuat');

    const { PDFDocument, StandardFonts, rgb } = PDFLib;
    const pdf = await PDFDocument.load(bytes);
    const pages = pdf.getPages();
    const selected = selectedPageSet(o.pageMode, o.selectedPages, pages.length);
    if (selected && selected.size === 0) {
      return {
        bytes: bytes instanceof Uint8Array ? bytes.slice() : new Uint8Array(bytes),
        pageCount: pages.length,
        stampedPages: [],
      };
    }
    const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
    const regular = await pdf.embedFont(StandardFonts.Helvetica);

    const black = rgb(0, 0, 0);
    const white = rgb(1, 1, 1);
    const grey = rgb(0.25, 0.25, 0.25);
    const scale = clamp(Number(o.scale) || 1, 0.6, 1.6);
    const positionX = clamp(numeric(o.positionX, 0), -100, 100);
    const positionY = clamp(numeric(o.positionY, 0), -100, 100);
    const icon = normalizeIcon(o.icon);

    // Font standar PDF memakai WinAnsi. Normalisasi input agar satu emoji atau
    // karakter tak didukung tidak menggagalkan seluruh proses stamping.
    const main = safeText(o.main, DEFAULTS.main, 40, false);
    const sub = safeText(o.sub, DEFAULTS.sub, 60, true);
    const small = safeText(o.small, DEFAULTS.small, 60, true);

    const stampedPages = [];

    for (const [index, page] of pages.entries()) {
      const pageNumber = index + 1;
      if (selected && !selected.has(pageNumber)) continue;
      stampedPages.push(pageNumber);
      const { width: W, height: H } = page.getSize();

      // Jangan pernah menimpa konten. `designTop` mempertahankan tata letak
      // versi awal; `maxTop` adalah batas gerak setelah diberi jarak aman.
      const designTop = RATIO.contentBottom * H;
      const maxTop = designTop - RATIO.safeGap * H;

      if (o.variant === 'bar') {
        drawBar(page, { W, H, designTop, maxTop, black, white, bold, regular, main, sub, scale, positionX, positionY, icon });
      } else if (o.variant === 'text') {
        drawText(page, { W, H, designTop, maxTop, black, bold, regular, main, sub, scale, positionX, positionY });
      } else {
        drawBadge(page, { W, H, designTop, maxTop, black, white, grey, bold, regular, main, sub, small, scale, positionX, positionY, icon });
      }
    }

    const out = await pdf.save();
    return {
      bytes: out instanceof Uint8Array ? out : new Uint8Array(out),
      pageCount: pages.length,
      stampedPages,
    };
  }

  async function stamp(bytes, opts) {
    const result = await stampDetailed(bytes, opts);
    return result.bytes;
  }

  function drawBadge(page, c) {
    const b = {
      x: RATIO.badge.x * c.W,
      y: RATIO.badge.y * c.H,
      // Pada ukuran <100%, kecilkan seluruh kotak (bukan hanya font/tinggi)
      // agar kontrol horizontal punya ruang gerak yang nyata.
      w: RATIO.badge.w * c.W * Math.min(c.scale, 1),
      h: RATIO.badge.h * c.H * c.scale,
    };
    if (b.y + b.h > c.maxTop) b.h = c.maxTop - b.y - 2;

    const marginX = 0.02 * c.W;
    const marginY = 0.02 * c.H;
    const baseX = (c.W - b.w) / 2;
    b.x = moveFromBase(baseX, marginX, c.W - marginX - b.w, c.positionX);
    b.y = moveFromBase(b.y, marginY, c.maxTop - 2 - b.h, c.positionY);

    page.drawRectangle({
      x: b.x, y: b.y, width: b.w, height: b.h,
      color: c.white, borderColor: c.black, borderWidth: Math.max(1, 0.006 * c.H),
    });

    // Ikon handling vektor agar tetap tajam pada printer thermal.
    const t = Math.min(b.h * 0.30, b.w * 0.10);
    const tx = b.x + b.w * 0.055;
    const ty = b.y + b.h / 2 - t / 2;
    const hasIcon = c.icon !== 'none';
    if (hasIcon) drawHandlingIcon(page, c.icon, { x: tx, y: ty, size: t, color: c.black });

    const textLeft = hasIcon ? tx + t + b.w * 0.045 : b.x + b.w * 0.035;
    const textRight = b.x + b.w - b.w * 0.035;
    const textWidthAvailable = Math.max(20, textRight - textLeft);
    const cx = (textLeft + textRight) / 2;
    const sBigPreferred = Math.min(RATIO.font.big * c.H * c.scale, b.h * 0.52);
    const sSubPreferred = RATIO.font.sub * c.H * c.scale;
    const sSmallPreferred = RATIO.font.small * c.H * c.scale;
    const sBig = fitSize(c.bold, c.main, sBigPreferred, textWidthAvailable, 7, 0);
    const sSub = fitSize(c.bold, c.sub, sSubPreferred, textWidthAvailable, 5, 0);
    const sSmall = fitSize(c.regular, c.small, sSmallPreferred, textWidthAvailable * 0.82, 4, 0.2);

    const wBig = c.bold.widthOfTextAtSize(c.main, sBig);
    const wSub = c.bold.widthOfTextAtSize(c.sub, sSub);
    const smallSpacing = sSmall * 0.2;
    const wSmall = textWidth(c.regular, c.small, sSmall, smallSpacing);

    page.drawText(c.main, { x: cx - wBig / 2, y: b.y + b.h * 0.57, size: sBig, font: c.bold, color: c.black });
    if (c.sub) page.drawText(c.sub, { x: cx - wSub / 2, y: b.y + b.h * 0.39, size: sSub, font: c.bold, color: c.black });
    if (c.small && sSmall >= 4 && wSmall <= textWidthAvailable) {
      page.drawText(c.small, {
        x: cx - wSmall / 2, y: b.y + b.h * 0.26, size: sSmall, font: c.regular,
        color: c.grey, characterSpacing: smallSpacing,
      });
    }
  }

  function drawBar(page, c) {
    const b = {
      x: RATIO.bar.x * c.W,
      y: RATIO.bar.y * c.H,
      w: RATIO.bar.w * c.W * Math.min(c.scale, 1),
      h: RATIO.bar.h * c.H * c.scale,
    };
    if (b.y + b.h > c.maxTop) b.h = c.maxTop - b.y - 2;

    const marginX = 0.02 * c.W;
    const marginY = 0.02 * c.H;
    const baseX = (c.W - b.w) / 2;
    b.x = moveFromBase(baseX, marginX, c.W - marginX - b.w, c.positionX);
    b.y = moveFromBase(b.y, marginY, c.maxTop - 2 - b.h, c.positionY);

    page.drawRectangle({ x: b.x, y: b.y, width: b.w, height: b.h, color: c.black });

    const hasIcon = c.icon !== 'none';
    const iconSize = Math.min(b.h * 0.46, b.w * 0.08);
    const iconX = b.x + b.w * 0.045;
    const iconY = b.y + (b.h - iconSize) / 2;
    if (hasIcon) drawHandlingIcon(page, c.icon, { x: iconX, y: iconY, size: iconSize, color: c.white });

    const textLeft = hasIcon ? iconX + iconSize + b.w * 0.03 : b.x + b.w * 0.05;
    const textRight = b.x + b.w * 0.95;
    const textWidthAvailable = Math.max(20, textRight - textLeft);
    const cx = (textLeft + textRight) / 2;

    const sBigPreferred = Math.min(RATIO.font.big * c.H * c.scale * 0.93, b.h * 0.60);
    const sSubPreferred = RATIO.font.sub * c.H * c.scale;
    const sBig = fitSize(c.bold, c.main, sBigPreferred, textWidthAvailable, 7, 0.10);
    const sSub = fitSize(c.regular, c.sub, sSubPreferred, textWidthAvailable, 5, 0);
    const sp = sBig * 0.10;
    const wBig = textWidth(c.bold, c.main, sBig, sp);
    const wSub = c.regular.widthOfTextAtSize(c.sub, sSub);

    page.drawText(c.main, {
      x: cx - wBig / 2, y: b.y + b.h * 0.58, size: sBig, font: c.bold,
      color: c.white, characterSpacing: sp,
    });
    if (c.sub) {
      page.drawText(c.sub, {
        x: cx - wSub / 2, y: b.y + b.h * 0.28, size: sSub, font: c.regular, color: c.white,
      });
    }
  }

  function drawText(page, c) {
    const sBig = fitSize(c.bold, c.main, RATIO.font.big * c.H * c.scale * 0.85, c.W * 0.90, 7, 0);
    const sSub = fitSize(c.bold, c.sub, RATIO.font.sub * c.H * c.scale, c.W * 0.90, 5, 0);
    const baseY = c.designTop - 0.10 * c.H - sBig;
    const wBig = c.bold.widthOfTextAtSize(c.main, sBig);
    const wSub = c.bold.widthOfTextAtSize(c.sub, sSub);
    const blockWidth = Math.max(wBig, wSub);
    const marginX = 0.02 * c.W;
    const marginY = 0.02 * c.H;
    const cx = moveFromBase(c.W / 2, marginX + blockWidth / 2, c.W - marginX - blockWidth / 2, c.positionX);

    const blockBottom = c.sub ? baseY - sSub * 1.7 : baseY - sBig * 0.12;
    const blockTop = baseY + sBig * 1.05;
    const shiftY = moveFromBase(0, marginY - blockBottom, c.maxTop - 2 - blockTop, c.positionY);
    const y = baseY + shiftY;

    page.drawText(c.main, { x: cx - wBig / 2, y, size: sBig, font: c.bold, color: c.black });
    if (c.sub) page.drawText(c.sub, { x: cx - wSub / 2, y: y - sSub * 1.5, size: sSub, font: c.bold, color: c.black });
  }

  root.FragileStamp = { stamp, stampDetailed, RATIO, DEFAULTS };
})(typeof globalThis !== 'undefined' ? globalThis : this);
