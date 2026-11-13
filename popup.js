/**
 * popup.js — pengaturan + aksi cepat.
 */

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

const el = {
  enabled: document.getElementById('enabled'),
  toggleState: document.getElementById('toggleState'),
  previewBox: document.getElementById('previewBox'),
  previewSafeArea: document.getElementById('previewSafeArea'),
  previewMain: document.getElementById('previewMain'),
  previewSub: document.getElementById('previewSub'),
  main: document.getElementById('main'),
  sub: document.getElementById('sub'),
  scale: document.getElementById('scale'),
  scaleOut: document.getElementById('scaleOut'),
  positionX: document.getElementById('positionX'),
  positionXOut: document.getElementById('positionXOut'),
  positionY: document.getElementById('positionY'),
  positionYOut: document.getElementById('positionYOut'),
  positionPanel: document.getElementById('positionPanel'),
  positionSummary: document.getElementById('positionSummary'),
  resetPosition: document.getElementById('resetPosition'),
  appearanceTab: document.getElementById('appearanceTab'),
  positionTab: document.getElementById('positionTab'),
  appearancePanel: document.getElementById('appearancePanel'),
  version: document.getElementById('version'),
  status: document.getElementById('status'),
  apply: document.getElementById('apply'),
  open: document.getElementById('open'),
  download: document.getElementById('download'),
  variants: Array.from(document.querySelectorAll('[data-variant]')),
};

let settings = Object.assign({}, DEFAULTS);
let activeTabId = null;
let awbTab = false;

/* ------------------------------------------------------------------ */

function setStatus(text, tone) {
  el.status.textContent = text;
  el.status.dataset.tone = tone || 'muted';
}

function isAwbUrl(url) {
  if (!url) return false;
  try {
    const u = new URL(url);
    return /(^|\.)shopee\.co\.id$/.test(u.hostname) && u.pathname.toLowerCase().startsWith('/awbprint');
  } catch (e) {
    return false;
  }
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function moveFromBase(base, min, max, control) {
  const anchor = clamp(base, min, max);
  const amount = clamp(Number(control) || 0, -100, 100) / 100;
  if (amount < 0) return anchor + (anchor - min) * amount;
  return anchor + (max - anchor) * amount;
}

function renderPreview() {
  const variant = ['badge', 'bar', 'text'].includes(settings.variant) ? settings.variant : 'badge';
  const main = settings.main || DEFAULTS.main;
  const sub = settings.sub || '';
  const scale = clamp(Number(settings.scale) || 1, 0.6, 1.4);
  const positionX = clamp(Number(settings.positionX) || 0, -100, 100);
  const positionY = clamp(Number(settings.positionY) || 0, -100, 100);

  el.previewBox.dataset.variant = variant;
  el.previewMain.textContent = main;
  el.previewSub.textContent = sub;
  el.previewSub.style.display = sub ? '' : 'none';

  // Miniatur mengikuti prinsip layout PDF: ukuran <100% mengecilkan blok,
  // sedangkan posisi bergerak dari titik desain awal menuju batas aman.
  const baseWidth = variant === 'bar' ? 90 : variant === 'text' ? 72 : 86;
  const width = clamp(baseWidth * Math.min(scale, 1), 44, 92);
  const horizontalRoom = Math.max(0, (100 - width) / 2 - 2);
  const left = 50 + (positionX / 100) * horizontalRoom;

  const baseHeight = variant === 'bar' ? 34 : variant === 'text' ? 34 : 45;
  const safeHeight = el.previewSafeArea.clientHeight || 58;
  const height = clamp(baseHeight * scale, variant === 'bar' ? 24 : 27, safeHeight - 5);
  const minBottom = 3;
  const maxBottom = Math.max(minBottom, safeHeight - height - 3);
  const baseRatio = variant === 'badge' ? 0.92 : variant === 'bar' ? 0.62 : 0.55;
  const baseBottom = minBottom + (maxBottom - minBottom) * baseRatio;
  const bottom = moveFromBase(baseBottom, minBottom, maxBottom, positionY);

  el.previewBox.style.width = `${width.toFixed(1)}%`;
  el.previewBox.style.height = `${height.toFixed(1)}px`;
  el.previewBox.style.left = `${left.toFixed(2)}%`;
  el.previewBox.style.bottom = `${bottom.toFixed(1)}px`;

  const mainFit = Math.min(1, 10 / Math.max(7, main.length));
  const subFit = Math.min(1, 20 / Math.max(12, sub.length || 12));
  const bigBase = variant === 'bar' ? 18 : 17;
  el.previewMain.style.fontSize = `${clamp(bigBase * scale * mainFit, 10, 20).toFixed(1)}px`;
  el.previewSub.style.fontSize = `${clamp(7.5 * scale * subFit, 5.5, 9).toFixed(1)}px`;
  el.scaleOut.textContent = `${Math.round(scale * 100)}%`;

  el.variants.forEach((button) => {
    button.setAttribute('aria-checked', String(button.dataset.variant === settings.variant));
  });
}

function axisLabel(value, negative, positive, neutral) {
  const n = Math.max(-100, Math.min(100, Math.round(Number(value) || 0)));
  if (n === 0) return neutral;
  return `${Math.abs(n)}% ${n < 0 ? negative : positive}`;
}

function renderPosition() {
  const x = axisLabel(settings.positionX, 'ke kiri', 'ke kanan', 'Tengah');
  const y = axisLabel(settings.positionY, 'ke bawah', 'ke atas', 'Awal');
  el.positionXOut.textContent = x;
  el.positionYOut.textContent = y;
  el.positionSummary.textContent = `${x} · ${y}`;
  renderPreview();
}

function fillForm() {
  el.enabled.checked = Boolean(settings.enabled);
  el.toggleState.textContent = settings.enabled ? 'Aktif' : 'Mati';
  document.body.classList.toggle('is-disabled', !settings.enabled);
  el.main.value = settings.main || '';
  el.sub.value = settings.sub || '';
  el.main.disabled = !settings.enabled;
  el.sub.disabled = !settings.enabled;
  el.scale.disabled = !settings.enabled;
  el.positionX.disabled = !settings.enabled;
  el.positionY.disabled = !settings.enabled;
  el.resetPosition.disabled = !settings.enabled;
  el.variants.forEach((button) => { button.disabled = !settings.enabled; });
  el.scale.value = String(Math.round((Number(settings.scale) || 1) * 100));
  el.positionX.value = String(Math.round(Number(settings.positionX) || 0));
  el.positionY.value = String(Math.round(Number(settings.positionY) || 0));
  renderPosition();
}

/* ------------------------------------------------------------------ */

function getActiveTab() {
  return new Promise((resolve) => {
    chrome.tabs.query({ active: true, lastFocusedWindow: true }, (tabs) => {
      resolve((tabs && tabs[0]) || null);
    });
  });
}

function sendToTab(tabId, message) {
  return new Promise((resolve) => {
    chrome.tabs.sendMessage(tabId, message, (response) => {
      if (chrome.runtime.lastError) {
        resolve({ ok: false, error: chrome.runtime.lastError.message });
      } else {
        resolve(response || { ok: false, error: 'Tidak ada respons' });
      }
    });
  });
}

async function refreshTab() {
  if (!activeTabId || !awbTab) return;
  const response = await sendToTab(activeTabId, { type: 'awbfz:refresh' });
  if (!response.ok) setStatus('Halaman belum siap. Muat ulang tab AWB.', 'warn');
}

async function readTabStatus() {
  Object.assign(settings, await new Promise((resolve) => {
    chrome.storage.sync.get(DEFAULTS, resolve);
  }));

  const tab = await getActiveTab();
  activeTabId = tab && tab.id ? tab.id : null;
  awbTab = isAwbUrl(tab && tab.url);

  if (!awbTab) {
    setStatus('Buka halaman AWB (Preview Cetak) dulu.', 'muted');
    el.apply.disabled = true;
    el.open.disabled = true;
    el.download.disabled = true;
    return;
  }

  const response = await sendToTab(activeTabId, { type: 'awbfz:status' });
  if (!response.ok) {
    setStatus('Ekstensi belum aktif di tab ini. Muat ulang halaman.', 'warn');
    el.apply.disabled = false;
    el.open.disabled = true;
    el.download.disabled = true;
    return;
  }

  el.apply.disabled = false;
  el.open.disabled = !response.ready;
  el.download.disabled = !response.ready;

  if (!response.enabled) setStatus('Stempel dimatikan untuk tab ini.', 'muted');
  else if (response.status === 'working') setStatus('Menambahkan stempel…', 'busy');
  else if (response.status === 'error') setStatus(response.note || 'Gagal menstempel.', 'err');
  else if (response.ready) {
    setStatus(`Stempel aktif · sumber PDF: ${response.source === 'api' ? 'endpoint' : 'blob'}`, 'ok');
  } else {
    setStatus('Menunggu dokumen muncul di halaman…', 'warn');
  }
}

/* ------------------------------------------------------------------ */

let saveTimer = 0;
function scheduleSave(partial) {
  Object.assign(settings, partial);
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    chrome.storage.sync.set(settings, refreshTab);
  }, 220);
}

function activateControlTab(name, focus) {
  const position = name === 'position';
  el.appearanceTab.setAttribute('aria-selected', String(!position));
  el.positionTab.setAttribute('aria-selected', String(position));
  el.appearanceTab.tabIndex = position ? -1 : 0;
  el.positionTab.tabIndex = position ? 0 : -1;
  el.appearancePanel.hidden = position;
  el.positionPanel.hidden = !position;
  if (focus) (position ? el.positionTab : el.appearanceTab).focus();
}

el.appearanceTab.addEventListener('click', () => activateControlTab('appearance', false));
el.positionTab.addEventListener('click', () => activateControlTab('position', false));

[el.appearanceTab, el.positionTab].forEach((tab) => {
  tab.addEventListener('keydown', (event) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    if (event.key === 'ArrowLeft' || event.key === 'Home') activateControlTab('appearance', true);
    else activateControlTab('position', true);
  });
});

el.enabled.addEventListener('change', () => {
  settings.enabled = el.enabled.checked;
  fillForm();
  scheduleSave({ enabled: settings.enabled });
});

el.variants.forEach((button) => {
  button.addEventListener('click', () => {
    if (!settings.enabled) return;
    scheduleSave({ variant: button.dataset.variant });
    renderPreview();
  });

  button.addEventListener('keydown', (event) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const current = el.variants.indexOf(button);
    let next = current;
    if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = el.variants.length - 1;
    else if (event.key === 'ArrowLeft') next = (current - 1 + el.variants.length) % el.variants.length;
    else next = (current + 1) % el.variants.length;
    el.variants[next].focus();
    el.variants[next].click();
  });
});

el.main.addEventListener('input', () => {
  scheduleSave({ main: el.main.value });
  renderPreview();
});

el.sub.addEventListener('input', () => {
  scheduleSave({ sub: el.sub.value });
  renderPreview();
});

el.scale.addEventListener('input', () => {
  scheduleSave({ scale: Number(el.scale.value) / 100 });
  renderPreview();
});

el.positionX.addEventListener('input', () => {
  scheduleSave({ positionX: Number(el.positionX.value) });
  renderPosition();
});

el.positionY.addEventListener('input', () => {
  scheduleSave({ positionY: Number(el.positionY.value) });
  renderPosition();
});

el.resetPosition.addEventListener('click', () => {
  if (!settings.enabled) return;
  el.positionX.value = '0';
  el.positionY.value = '0';
  scheduleSave({ positionX: 0, positionY: 0 });
  renderPosition();
});

el.apply.addEventListener('click', async () => {
  el.apply.disabled = true;
  setStatus('Menerapkan ulang…', 'busy');
  await refreshTab();
  setTimeout(() => {
    el.apply.disabled = false;
    readTabStatus();
  }, 900);
});

el.open.addEventListener('click', async () => {
  const response = await sendToTab(activeTabId, { type: 'awbfz:action', action: 'open' });
  if (!response.ok) setStatus(response.error || 'Stempel belum siap.', 'warn');
  else window.close();
});

el.download.addEventListener('click', async () => {
  const response = await sendToTab(activeTabId, { type: 'awbfz:action', action: 'download' });
  if (!response.ok) setStatus(response.error || 'Stempel belum siap.', 'warn');
});

/* ------------------------------------------------------------------ */

el.version.textContent = `v${chrome.runtime.getManifest().version}`;
activateControlTab('appearance', false);
readTabStatus().then(fillForm);
