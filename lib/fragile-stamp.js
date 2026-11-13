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
    main: 'FRAGILE',
    sub: 'JANGAN DIBANTING',
    small: 'HANDLE WITH CARE',
    scale: 1,
    // -100 = kiri/bawah, 0 = posisi desain awal, 100 = kanan/atas.
    positionX: 0,
    positionY: 0,
  };

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

  /**
   * @param {Uint8Array} bytes PDF asli
   * @param {object} [opts]
   * @returns {Promise<Uint8Array>}
   */
  async function stamp(bytes, opts) {
    const o = Object.assign({}, DEFAULTS, opts || {});
    const PDFLib = root.PDFLib;
    if (!PDFLib) throw new Error('PDFLib belum dimuat');

    const { PDFDocument, StandardFonts, rgb } = PDFLib;
    const pdf = await PDFDocument.load(bytes);
    const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
    const regular = await pdf.embedFont(StandardFonts.Helvetica);

    const black = rgb(0, 0, 0);
    const white = rgb(1, 1, 1);
    const grey = rgb(0.25, 0.25, 0.25);
    const scale = clamp(Number(o.scale) || 1, 0.6, 1.6);
    const positionX = clamp(numeric(o.positionX, 0), -100, 100);
    const positionY = clamp(numeric(o.positionY, 0), -100, 100);

    // Font standar PDF memakai WinAnsi. Normalisasi input agar satu emoji atau
    // karakter tak didukung tidak menggagalkan seluruh proses stamping.
    const main = safeText(o.main, DEFAULTS.main, 40, false);
    const sub = safeText(o.sub, DEFAULTS.sub, 60, true);
    const small = safeText(o.small, DEFAULTS.small, 60, true);

    for (const page of pdf.getPages()) {
      const { width: W, height: H } = page.getSize();

      // Jangan pernah menimpa konten. `designTop` mempertahankan tata letak
      // versi awal; `maxTop` adalah batas gerak setelah diberi jarak aman.
      const designTop = RATIO.contentBottom * H;
      const maxTop = designTop - RATIO.safeGap * H;

      if (o.variant === 'bar') {
        drawBar(page, { W, H, designTop, maxTop, black, white, bold, regular, main, sub, scale, positionX, positionY });
      } else if (o.variant === 'text') {
        drawText(page, { W, H, designTop, maxTop, black, bold, regular, main, sub, scale, positionX, positionY });
      } else {
        drawBadge(page, { W, H, designTop, maxTop, black, white, grey, bold, regular, main, sub, small, scale, positionX, positionY });
      }
    }

    const out = await pdf.save();
    return out instanceof Uint8Array ? out : new Uint8Array(out);
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

    // ikon segitiga peringatan
    const t = Math.min(b.h * 0.30, b.w * 0.10);
    const tx = b.x + b.w * 0.055;
    const ty = b.y + b.h / 2 - t / 2;
    const thick = Math.max(0.8, t * 0.075);
    const p1 = { x: tx, y: ty };
    const p2 = { x: tx + t, y: ty };
    const p3 = { x: tx + t / 2, y: ty + t * 0.88 };
    page.drawLine({ start: p1, end: p2, thickness: thick, color: c.black });
    page.drawLine({ start: p2, end: p3, thickness: thick, color: c.black });
    page.drawLine({ start: p3, end: p1, thickness: thick, color: c.black });
    page.drawRectangle({
      x: tx + t / 2 - t * 0.06, y: ty + t * 0.27, width: t * 0.12, height: t * 0.30, color: c.black,
    });
    page.drawEllipse({
      x: tx + t / 2, y: ty + t * 0.17, xScale: t * 0.065, yScale: t * 0.065, color: c.black,
    });

    const textLeft = tx + t + b.w * 0.045;
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

    const sBigPreferred = Math.min(RATIO.font.big * c.H * c.scale * 0.93, b.h * 0.60);
    const sSubPreferred = RATIO.font.sub * c.H * c.scale;
    const sBig = fitSize(c.bold, c.main, sBigPreferred, b.w * 0.90, 7, 0.10);
    const sSub = fitSize(c.regular, c.sub, sSubPreferred, b.w * 0.90, 5, 0);
    const sp = sBig * 0.10;
    const wBig = textWidth(c.bold, c.main, sBig, sp);
    const wSub = c.regular.widthOfTextAtSize(c.sub, sSub);

    page.drawText(c.main, {
      x: b.x + (b.w - wBig) / 2, y: b.y + b.h * 0.58, size: sBig, font: c.bold,
      color: c.white, characterSpacing: sp,
    });
    if (c.sub) {
      page.drawText(c.sub, {
        x: b.x + (b.w - wSub) / 2, y: b.y + b.h * 0.28, size: sSub, font: c.regular, color: c.white,
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

  root.FragileStamp = { stamp, RATIO, DEFAULTS };
})(typeof globalThis !== 'undefined' ? globalThis : this);
