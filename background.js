/**
 * background.js — service worker.
 *
 * Tugasnya cuma dua:
 *  1. Menjalankan pdf-lib + fragile-stamp.js untuk menulis stempel ke byte PDF.
 *  2. Menampilkan indikator status kecil di ikon ekstensi.
 *
 * Semua pengambilan PDF dilakukan di content script (fetch same-origin),
 * jadi service worker tidak perlu menyentuh jaringan sama sekali.
 */

/* global PDFLib, FragileStamp */

self.importScripts('lib/pdf-lib.min.js', 'lib/fragile-stamp.js');

const STAMP_DEFAULT = {
  variant: 'badge',
  icon: 'fragile',
  main: 'FRAGILE',
  sub: 'JANGAN DIBANTING',
  small: 'HANDLE WITH CARE',
  scale: 1,
  positionX: 0,
  positionY: 0,
  pageMode: 'all',
  selectedPages: [],
};

function base64ToBytes(b64) {
  const clean = String(b64 || '').replace(/^data:[^,]*,/, '');
  const bin = atob(clean);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) out[i] = bin.charCodeAt(i);
  return out;
}

function bytesToBase64(bytes) {
  const CHUNK = 0x8000;
  let bin = '';
  for (let i = 0; i < bytes.length; i += CHUNK) {
    bin += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK));
  }
  return btoa(bin);
}

function isShopeeUrl(raw) {
  try {
    const url = new URL(String(raw));
    return url.protocol === 'https:' && /(^|\.)shopee\.co\.id$/.test(url.hostname);
  } catch (e) {
    return false;
  }
}

async function handleFetch(message) {
  const url = message && message.url;
  if (!isShopeeUrl(url)) throw new Error('URL tidak diizinkan');

  const res = await fetch(url, { credentials: 'include', cache: 'no-store' });
  if (!res.ok) return { ok: false, status: res.status, error: `HTTP ${res.status}` };

  const buffer = new Uint8Array(await res.arrayBuffer());
  return {
    ok: true,
    status: res.status,
    contentType: res.headers.get('content-type') || '',
    bytes: bytesToBase64(buffer),
  };
}

async function handleStamp(payload) {
  if (!self.PDFLib) throw new Error('pdf-lib gagal dimuat');
  if (!self.FragileStamp) throw new Error('fragile-stamp.js gagal dimuat');

  const bytes = base64ToBytes(payload && payload.bytes);
  if (bytes.length < 5 || String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3]) !== '%PDF') {
    throw new Error('Byte yang diterima bukan PDF');
  }

  const settings = Object.assign({}, STAMP_DEFAULT, payload.settings || {});
  const result = self.FragileStamp.stampDetailed
    ? await self.FragileStamp.stampDetailed(bytes, settings)
    : { bytes: await self.FragileStamp.stamp(bytes, settings), pageCount: 0, stampedPages: [] };

  return {
    ok: true,
    bytes: bytesToBase64(result.bytes),
    size: result.bytes.length,
    pageCount: result.pageCount,
    stampedPages: result.stampedPages,
  };
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const type = message && message.type;

  if (type === 'awbfz:stamp') {
    handleStamp(message)
      .then(sendResponse)
      .catch((error) => sendResponse({ ok: false, error: String((error && error.message) || error) }));
    return true;
  }

  if (type === 'awbfz:fetch') {
    handleFetch(message)
      .then(sendResponse)
      .catch((error) => sendResponse({ ok: false, error: String((error && error.message) || error) }));
    return true;
  }

  if (type === 'awbfz:state') {
    const tabId = sender.tab && sender.tab.id;
    if (typeof tabId === 'number') {
      const state = message.state;
      const text = state === 'done' ? 'OK' : state === 'error' ? '!' : '';
      const color = state === 'done' ? '#15803d' : '#b91c1c';
      chrome.action.setBadgeText({ tabId, text }).catch(() => {});
      chrome.action.setBadgeBackgroundColor({ tabId, color }).catch(() => {});
    }
    sendResponse({ ok: true });
    return false;
  }

  if (type === 'awbfz:ping') {
    sendResponse({ ok: true, version: chrome.runtime.getManifest().version });
    return false;
  }

  return false;
});
