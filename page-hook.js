/**
 * page-hook.js — berjalan di MAIN world pada document_start.
 *
 * Tujuannya satu: kalau Shopee membuka blob PDF asli lewat `window.open()`
 * (misalnya untuk mencetak), arahkan ke blob PDF yang sudah distempel.
 * Konten script ini tidak memakai API chrome sama sekali.
 */
(() => {
  if (window.__awbfzHook) return;
  window.__awbfzHook = true;

  /** @type {Map<string,string>} blob asli -> blob stempel */
  const blobMap = new Map();

  function baseOf(url) {
    const s = String(url || '');
    const i = s.indexOf('#');
    return i === -1 ? s : s.slice(0, i);
  }

  function translate(url) {
    const raw = String(url || '');
    if (!raw) return null;
    if (blobMap.has(raw)) return blobMap.get(raw);
    const base = baseOf(raw);
    if (blobMap.has(base)) {
      const tail = raw.slice(base.length);
      return blobMap.get(base) + tail;
    }
    return null;
  }

  const nativeOpen = window.open;
  window.open = function open(url, ...rest) {
    let target = url;
    try {
      const mapped = translate(url);
      if (mapped) target = mapped;
    } catch (e) { /* biarkan URL asli */ }
    return nativeOpen.call(window, target, ...rest);
  };

  function rewriteElement(el) {
    if (!el || !el.getAttribute) return;
    const tag = el.tagName;
    if (tag === 'IFRAME' || tag === 'EMBED') {
      const src = el.getAttribute('src');
      const mapped = translate(src);
      if (mapped) el.setAttribute('src', mapped);
    } else if (tag === 'OBJECT') {
      const data = el.getAttribute('data');
      const mapped = translate(data);
      if (mapped) el.setAttribute('data', mapped);
    }
  }

  function scan(root) {
    if (!root || !root.querySelectorAll) return;
    if (root.nodeType === 1) rewriteElement(root);
    root.querySelectorAll('iframe[src], embed[src], object[data]').forEach(rewriteElement);
  }

  try {
    new MutationObserver((records) => {
      for (const rec of records) {
        if (rec.type === 'attributes') rewriteElement(rec.target);
        else rec.addedNodes.forEach(scan);
      }
    }).observe(document, { childList: true, subtree: true, attributes: true, attributeFilter: ['src', 'data'] });
  } catch (e) { /* observasi gagal, window.open tetap aktif */ }

  window.addEventListener('message', (event) => {
    if (event.source !== window) return;
    const data = event.data;
    if (!data || data.__awbfz !== 1) return;

    if (data.type === 'blob-map' && typeof data.from === 'string' && typeof data.to === 'string' && data.from && data.to) {
      blobMap.set(baseOf(data.from), baseOf(data.to));
    } else if (data.type === 'blob-unmap' && typeof data.from === 'string') {
      blobMap.delete(baseOf(data.from));
    } else if (data.type === 'blob-clear') {
      blobMap.clear();
    }
  });
})();
