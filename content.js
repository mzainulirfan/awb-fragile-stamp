/**
 * content.js — inti ekstensi "Shopee AWB Fragile Stamp".
 *
 * Alur:
 *   1. halaman /awbprint memuat PDF label di <iframe type="application/pdf"> (blob).
 *   2. ambil byte PDF: utamakan endpoint download_sd_job (byte identik),
 *      fallback ke blob URL yang sedang tampil.
 *   3. minta service worker menulis stempel FRAGILE (pdf-lib).
 *   4. tukar src iframe dengan blob hasil stempel → layar & cetak ikut berubah.
 *   5. amati DOM supaya tetap berlaku saat React membuat ulang iframe.
 */
(() => {
  'use strict';

  if (window.__awbfzContent) return;
  window.__awbfzContent = true;

  const DEFAULTS = {
    enabled: true,
    variant: 'badge',
    main: 'FRAGILE',
    sub: 'JANGAN DIBANTING',
    small: 'HANDLE WITH CARE',
    scale: 1,
    positionX: 0,
    positionY: 0,
  };

  const state = {
    settings: Object.assign({}, DEFAULTS),
    originalSrc: '',
    originalBytes: null,
    source: '',
    result: null, // { key, url, bytes }
    working: false,
    pending: false,
    status: 'idle',
    note: '',
    toastTimer: 0,
  };

  /* ------------------------------------------------------------------ *
   * util
   * ------------------------------------------------------------------ */

  const isAwbPage = () => location.pathname.replace(/\/+$/, '').toLowerCase().startsWith('/awbprint');

  function isPdf(bytes) {
    return (
      bytes && bytes.length > 4 &&
      bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46
    );
  }

  function bytesToBase64(bytes) {
    const CHUNK = 0x8000;
    let bin = '';
    for (let i = 0; i < bytes.length; i += CHUNK) {
      bin += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK));
    }
    return btoa(bin);
  }

  function base64ToBytes(b64) {
    const clean = String(b64 || '').replace(/^data:[^,]*,/, '');
    const bin = atob(clean);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i += 1) out[i] = bin.charCodeAt(i);
    return out;
  }

  function baseOf(url) {
    const s = String(url || '');
    const i = s.indexOf('#');
    return i === -1 ? s : s.slice(0, i);
  }

  function jobId() {
    return new URLSearchParams(location.search).get('job_id') || '';
  }

  function findIframe() {
    return document.querySelector('iframe[type="application/pdf"]');
  }

  function log(...args) {
    console.debug('[AWB Fragile]', ...args);
  }

  /* ------------------------------------------------------------------ *
   * pengambilan PDF
   * ------------------------------------------------------------------ */

  async function fetchViaServiceWorker(url) {
    try {
      const response = await askServiceWorker({ type: 'awbfz:fetch', url });
      if (!response.ok || !response.bytes) {
        log('fetch via service worker gagal', response.status || response.error);
        return null;
      }
      const bytes = base64ToBytes(response.bytes);
      return isPdf(bytes) ? bytes : null;
    } catch (err) {
      log('fetch via service worker error', err);
      return null;
    }
  }

  async function fetchFromApi() {
    const id = jobId();
    if (!id) return null;
    const url = `${location.origin}/api/v3/logistics/download_sd_job?job_id=${encodeURIComponent(id)}&is_first_time=0`;

    try {
      const res = await fetch(url, { credentials: 'include', cache: 'no-store' });
      if (res.ok) {
        const bytes = new Uint8Array(await res.arrayBuffer());
        if (isPdf(bytes)) return bytes;
        log('API download bukan PDF');
      } else {
        log('API download gagal', res.status);
      }
    } catch (err) {
      log('API download error', err);
    }

    // CSP halaman bisa memblokir fetch dari content script → ulang lewat service worker
    return fetchViaServiceWorker(url);
  }

  async function fetchFromBlob(src) {
    if (!src || !src.startsWith('blob:')) return null;
    try {
      const res = await fetch(src, { cache: 'no-store' });
      if (!res.ok) return null;
      const bytes = new Uint8Array(await res.arrayBuffer());
      return isPdf(bytes) ? bytes : null;
    } catch (err) {
      log('blob fetch error', err);
      return null;
    }
  }

  /* ------------------------------------------------------------------ *
   * stamping lewat service worker
   * ------------------------------------------------------------------ */

  function stampPayload() {
    const s = state.settings;
    return {
      variant: s.variant === 'bar' || s.variant === 'text' ? s.variant : 'badge',
      main: s.main || DEFAULTS.main,
      sub: s.sub || '',
      small: s.small || '',
      scale: Number(s.scale) || 1,
      positionX: Number(s.positionX) || 0,
      positionY: Number(s.positionY) || 0,
    };
  }

  function askServiceWorker(message) {
    return new Promise((resolve, reject) => {
      let settled = false;
      const timer = setTimeout(() => {
        if (!settled) {
          settled = true;
          reject(new Error('Service worker tidak merespons'));
        }
      }, 30000);

      try {
        chrome.runtime.sendMessage(message, (response) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
          } else if (!response) {
            reject(new Error('Tidak ada respons dari service worker'));
          } else if (!response.ok) {
            reject(new Error(response.error || 'Gagal menstempel PDF'));
          } else {
            resolve(response);
          }
        });
      } catch (err) {
        settled = true;
        clearTimeout(timer);
        reject(err);
      }
    });
  }

  async function stamp(bytes) {
    const response = await askServiceWorker({
      type: 'awbfz:stamp',
      bytes: bytesToBase64(bytes),
      settings: stampPayload(),
    });
    return base64ToBytes(response.bytes);
  }

  /* ------------------------------------------------------------------ *
   * penerapan ke iframe
   * ------------------------------------------------------------------ */

  function announceMap(from, to) {
    try {
      window.postMessage({ __awbfz: 1, type: 'blob-map', from: baseOf(from), to: baseOf(to) }, location.origin);
    } catch (e) { /* abaikan */ }
  }

  function removeMap(from) {
    if (!from) return;
    try {
      window.postMessage({ __awbfz: 1, type: 'blob-unmap', from: baseOf(from) }, location.origin);
    } catch (e) { /* abaikan */ }
  }

  function swapIframe(iframe, url) {
    const full = url + '#toolbar=0&navpanes=0';
    if (iframe.getAttribute('src') !== full) iframe.setAttribute('src', full);
    announceMap(state.originalSrc, url);
  }

  async function apply() {
    if (!isAwbPage()) return;
    if (state.working) {
      state.pending = true;
      return;
    }

    const iframe = findIframe();
    if (!iframe) {
      setStatus('idle', 'Menunggu dokumen…');
      return;
    }

    if (!state.settings.enabled) {
      await restore();
      return;
    }

    const current = iframe.getAttribute('src') || '';
    const ours = state.result && state.result.url;
    const isOurs = Boolean(ours && baseOf(current) === baseOf(ours));

    // src baru dari halaman = dokumen baru (atau iframe dibuat ulang)
    if (current && !isOurs && baseOf(current) !== baseOf(state.originalSrc)) {
      removeMap(state.originalSrc);
      state.originalSrc = current;
      state.originalBytes = null;
    }

    const key = `${JSON.stringify(stampPayload())}|${state.originalSrc}`;
    if (state.result && state.result.key === key) {
      if (!isOurs) swapIframe(iframe, state.result.url);
      setStatus('done', 'FRAGILE aktif');
      return;
    }

    state.working = true;
    setStatus('working', 'Menambahkan stempel…');

    try {
      if (!state.originalBytes) {
        const fromApi = await fetchFromApi();
        if (fromApi) {
          state.originalBytes = fromApi;
          state.source = 'api';
        } else {
          const fromBlob = await fetchFromBlob(state.originalSrc || current);
          if (!fromBlob) throw new Error('PDF label tidak bisa diambil');
          state.originalBytes = fromBlob;
          state.source = 'blob';
        }
      }

      const stamped = await stamp(state.originalBytes);
      const url = URL.createObjectURL(new Blob([stamped], { type: 'application/pdf' }));
      const previous = state.result && state.result.url;

      state.result = { key, url, bytes: stamped };
      swapIframe(iframe, url);
      if (previous) setTimeout(() => URL.revokeObjectURL(previous), 60000);

      setStatus('done', 'FRAGILE aktif');
      log('stempel diterapkan', { source: state.source, size: stamped.length });
      iframe.dispatchEvent(new CustomEvent('awbfz:stamped', { bubbles: true }));
    } catch (err) {
      setStatus('error', String((err && err.message) || err));
      log('gagal', err);
    } finally {
      state.working = false;
      if (state.pending) {
        state.pending = false;
        setTimeout(apply, 60);
      }
    }
  }

  async function restore() {
    removeMap(state.originalSrc);
    const iframe = findIframe();
    const ours = state.result && baseOf(state.result.url);
    state.result = null;

    if (!iframe) {
      if (ours) URL.revokeObjectURL(ours);
      setStatus('idle', 'Stempel dimatikan');
      return;
    }

    if (ours && baseOf(iframe.getAttribute('src')) === ours) {
      URL.revokeObjectURL(ours);
      if (state.originalBytes) {
        // blob asli bisa saja sudah di-revoke halaman; buat ulang dari byte yang kita simpan
        const url = URL.createObjectURL(new Blob([state.originalBytes], { type: 'application/pdf' }));
        const full = url + '#toolbar=0&navpanes=0';
        iframe.setAttribute('src', full);
        state.originalSrc = full;
      } else if (state.originalSrc) {
        iframe.setAttribute('src', state.originalSrc);
      }
    }
    setStatus('idle', 'Stempel dimatikan');
  }

  /* ------------------------------------------------------------------ *
   * toast kecil (shadow DOM supaya tidak bentrok dengan CSS Shopee)
   * ------------------------------------------------------------------ */

  const ui = { host: null, root: null, els: null };

  function ensureUi() {
    if (ui.host && document.documentElement.contains(ui.host)) return ui;
    if (!document.body) return null;

    const host = document.createElement('div');
    host.id = 'awbfz-root';
    host.setAttribute('data-awbfz', '1');
    const root = host.attachShadow({ mode: 'open' });
    root.innerHTML = `
      <style>
        :host { all: initial; }
        .toast {
          position: fixed; left: 16px; bottom: 16px; z-index: 2147483647;
          display: flex; align-items: center; gap: 10px;
          max-width: min(420px, calc(100vw - 32px));
          padding: 9px 10px 9px 12px;
          font: 13px/1.35 "Segoe UI", system-ui, -apple-system, sans-serif;
          color: #111827; background: #ffffff;
          border: 1px solid #e5e7eb; border-left: 4px solid #f59e0b;
          border-radius: 10px; box-shadow: 0 8px 24px rgba(15, 23, 42, .16);
          opacity: 0; transform: translateY(8px);
          transition: opacity .18s ease, transform .18s ease;
          pointer-events: none;
        }
        .toast[data-show="1"] { opacity: 1; transform: none; pointer-events: auto; }
        .toast[data-state="done"] { border-left-color: #16a34a; }
        .toast[data-state="error"] { border-left-color: #dc2626; }
        .dot { width: 8px; height: 8px; border-radius: 50%; background: #f59e0b; flex: 0 0 auto; }
        .toast[data-state="done"] .dot { background: #16a34a; }
        .toast[data-state="error"] .dot { background: #dc2626; }
        .toast[data-state="working"] .dot { animation: pulse 1s ease-in-out infinite; }
        @keyframes pulse { 50% { opacity: .3; } }
        .txt { min-width: 0; }
        .title { font-weight: 700; letter-spacing: .02em; }
        .msg { color: #4b5563; font-size: 12px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        button {
          all: unset; cursor: pointer; padding: 4px 9px; border-radius: 6px;
          font: 600 12px/1.4 "Segoe UI", system-ui, sans-serif; color: #ffffff; background: #111827;
        }
        button:hover { background: #374151; }
        button.ghost { color: #374151; background: #f3f4f6; }
        button.ghost:hover { background: #e5e7eb; }
        .actions { display: flex; gap: 6px; margin-left: 4px; flex: 0 0 auto; }
        @media (prefers-reduced-motion: reduce) {
          *, *::before, *::after {
            animation-duration: .01ms !important;
            animation-iteration-count: 1 !important;
            transition-duration: .01ms !important;
          }
        }
      </style>
      <div class="toast" data-show="0" data-state="idle" role="status" aria-live="polite">
        <span class="dot"></span>
        <div class="txt">
          <div class="title">FRAGILE</div>
          <div class="msg"></div>
        </div>
        <div class="actions">
          <button data-act="open" class="ghost" type="button">Buka</button>
          <button data-act="save" type="button">Unduh</button>
        </div>
      </div>`;

    document.body.appendChild(host);

    const els = {
      toast: root.querySelector('.toast'),
      msg: root.querySelector('.msg'),
      open: root.querySelector('[data-act="open"]'),
      save: root.querySelector('[data-act="save"]'),
    };

    els.open.addEventListener('click', openStamped);
    els.save.addEventListener('click', downloadStamped);

    ui.host = host;
    ui.root = root;
    ui.els = els;
    return ui;
  }

  function setStatus(status, note) {
    state.status = status;
    state.note = note || '';
    notifyBadge(status);

    const view = ensureUi();
    if (!view) return;
    const { toast, msg } = view.els;

    toast.dataset.state = status;
    msg.textContent = note || '';

    clearTimeout(state.toastTimer);
    if (status === 'idle' || status === 'done') {
      toast.dataset.show = '1';
      state.toastTimer = setTimeout(() => {
        toast.dataset.show = '0';
      }, status === 'done' ? 4000 : 2500);
    } else if (status === 'error') {
      toast.dataset.show = '1';
    } else {
      toast.dataset.show = '1';
    }
  }

  function notifyBadge(status) {
    try {
      chrome.runtime.sendMessage({ type: 'awbfz:state', state: status }, () => void chrome.runtime.lastError);
    } catch (e) { /* SW tidak aktif */ }
  }

  function openStamped() {
    if (!state.result) return;
    window.open(state.result.url + '#toolbar=0&navpanes=0', '_blank');
  }

  function downloadStamped() {
    if (!state.result) return;
    const a = document.createElement('a');
    a.href = state.result.url;
    a.download = 'Label Pengiriman - FRAGILE.pdf';
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  /* ------------------------------------------------------------------ *
   * pengaturan & observer
   * ------------------------------------------------------------------ */

  function loadSettings() {
    return new Promise((resolve) => {
      try {
        chrome.storage.sync.get(DEFAULTS, (items) => {
          if (chrome.runtime.lastError) {
            resolve(Object.assign({}, DEFAULTS));
          } else {
            resolve(Object.assign({}, DEFAULTS, items || {}));
          }
        });
      } catch (e) {
        resolve(Object.assign({}, DEFAULTS));
      }
    });
  }

  let scheduled = 0;
  function schedule(delay) {
    clearTimeout(scheduled);
    scheduled = setTimeout(() => apply(), delay == null ? 180 : delay);
  }

  async function boot() {
    state.settings = await loadSettings();
    if (!state.settings.enabled) {
      setStatus('idle', 'Stempel dimatikan');
      return;
    }
    apply();

    const observer = new MutationObserver((records) => {
      for (const rec of records) {
        if (rec.type === 'attributes') {
          const el = rec.target;
          if (el && el.tagName === 'IFRAME' && el.getAttribute('type') === 'application/pdf') {
            schedule(120);
            return;
          }
        } else {
          for (const node of rec.addedNodes) {
            if (node.nodeType !== 1) continue;
            if (node.tagName === 'IFRAME') {
              schedule(120);
              return;
            }
            if (node.querySelector && node.querySelector('iframe[type="application/pdf"]')) {
              schedule(120);
              return;
            }
          }
        }
      }
    });

    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['src', 'type'],
    });

    // jaring pengaman kalau React mengganti iframe tanpa mutasi yang terlihat
    setInterval(() => {
      if (!state.settings.enabled || state.working) return;
      const iframe = findIframe();
      if (!iframe) return;
      const src = iframe.getAttribute('src') || '';
      const ours = state.result && state.result.url;
      if (ours && (src === ours || src === ours + '#toolbar=0&navpanes=0')) return;
      schedule(0);
    }, 2500);
  }

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    const type = message && message.type;

    if (type === 'awbfz:refresh') {
      loadSettings().then((next) => {
        state.settings = next;
        if (!next.enabled) restore();
        else apply();
      });
      sendResponse({ ok: true });
      return false;
    }

    if (type === 'awbfz:action') {
      const action = message.action;
      if (!state.result) {
        sendResponse({ ok: false, error: 'Stempel belum siap' });
        return false;
      }
      if (action === 'open') openStamped();
      else if (action === 'download') downloadStamped();
      else {
        sendResponse({ ok: false, error: 'Aksi tidak dikenal' });
        return false;
      }
      sendResponse({ ok: true });
      return false;
    }

    if (type === 'awbfz:status') {
      sendResponse({
        ok: true,
        status: state.status,
        note: state.note,
        source: state.source,
        ready: Boolean(state.result),
        enabled: Boolean(state.settings.enabled),
      });
      return false;
    }

    return false;
  });

  try {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== 'sync') return;
      if (!changes || Object.keys(changes).length === 0) return;
      loadSettings().then((next) => {
        const changed = JSON.stringify(next) !== JSON.stringify(state.settings);
        state.settings = next;
        if (!changed) return;
        if (!next.enabled) restore();
        else apply();
      });
    });
  } catch (e) { /* storage tidak tersedia */ }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
  } else {
    boot();
  }
})();

