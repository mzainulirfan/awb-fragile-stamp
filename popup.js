/**
 * popup.js — pengaturan + aksi cepat.
 */

const PRESETS = {
  fragile: {
    variant: 'badge', icon: 'fragile', main: 'FRAGILE',
    sub: 'JANGAN DIBANTING', small: 'HANDLE WITH CARE',
  },
  'keep-dry': {
    variant: 'badge', icon: 'umbrella', main: 'JAGA TETAP KERING',
    sub: 'KEEP DRY', small: 'PROTECT FROM WATER',
  },
  'this-side-up': {
    variant: 'badge', icon: 'up', main: 'SISI INI KE ATAS',
    sub: 'THIS SIDE UP', small: 'HANDLE UPRIGHT',
  },
  'do-not-fold': {
    variant: 'badge', icon: 'fold', main: 'JANGAN DILIPAT',
    sub: 'DO NOT FOLD', small: 'KEEP FLAT',
  },
};

const PROFILE_DEFAULTS = {
  auto: { scale: 1, positionX: 0, positionY: 0 },
  a6: { scale: 1, positionX: 0, positionY: 0 },
  thermal: { scale: 0.85, positionX: 0, positionY: -20 },
  a5: { scale: 1.1, positionX: 0, positionY: 10 },
  custom: { scale: 1, positionX: 0, positionY: 0 },
};

const ICON_PREVIEW = {
  warning: '!',
  fragile: 'Y',
  umbrella: '☂',
  up: '↑',
  fold: '╱',
  none: '',
};

const DEFAULTS = {
  enabled: true,
  preset: 'fragile',
  variant: 'badge',
  icon: 'fragile',
  main: 'FRAGILE',
  sub: 'JANGAN DIBANTING',
  small: 'HANDLE WITH CARE',
  scale: 1,
  positionX: 0,
  positionY: 0,
  labelProfile: 'auto',
  positionProfiles: {},
  pageMode: 'all',
  selectedPages: [],
};

const el = {
  enabled: document.getElementById('enabled'),
  toggleState: document.getElementById('toggleState'),
  previewBox: document.getElementById('previewBox'),
  previewIcon: document.querySelector('.stamp-alert'),
  previewSafeArea: document.getElementById('previewSafeArea'),
  previewMain: document.getElementById('previewMain'),
  previewSub: document.getElementById('previewSub'),
  main: document.getElementById('main'),
  sub: document.getElementById('sub'),
  preset: document.getElementById('preset'),
  handlingIcon: document.getElementById('handlingIcon'),
  scale: document.getElementById('scale'),
  scaleOut: document.getElementById('scaleOut'),
  positionX: document.getElementById('positionX'),
  positionXOut: document.getElementById('positionXOut'),
  positionY: document.getElementById('positionY'),
  positionYOut: document.getElementById('positionYOut'),
  positionPanel: document.getElementById('positionPanel'),
  positionSummary: document.getElementById('positionSummary'),
  resetPosition: document.getElementById('resetPosition'),
  labelProfile: document.getElementById('labelProfile'),
  appearanceTab: document.getElementById('appearanceTab'),
  positionTab: document.getElementById('positionTab'),
  pagesTab: document.getElementById('pagesTab'),
  appearancePanel: document.getElementById('appearancePanel'),
  pagesPanel: document.getElementById('pagesPanel'),
  pageSummary: document.getElementById('pageSummary'),
  pageGrid: document.getElementById('pageGrid'),
  pageNote: document.getElementById('pageNote'),
  selectAllPages: document.getElementById('selectAllPages'),
  clearPages: document.getElementById('clearPages'),
  version: document.getElementById('version'),
  status: document.getElementById('status'),
  apply: document.getElementById('apply'),
  open: document.getElementById('open'),
  download: document.getElementById('download'),
  variants: Array.from(document.querySelectorAll('[data-variant]')),
  pageModes: Array.from(document.querySelectorAll('[data-page-mode]')),
};

let settings = Object.assign({}, DEFAULTS);
let activeTabId = null;
let awbTab = false;
let pageCount = 0;
let stampedPages = [];

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

function numeric(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function normalizePageList(values, maximum) {
  const pages = Array.isArray(values) ? values : [];
  return Array.from(new Set(pages
    .map((value) => Math.trunc(Number(value)))
    .filter((value) => value >= 1 && (!maximum || value <= maximum))))
    .sort((a, b) => a - b);
}

function normalizeSettings() {
  if (!Object.prototype.hasOwnProperty.call(PRESETS, settings.preset)) settings.preset = 'custom';
  if (!Object.prototype.hasOwnProperty.call(ICON_PREVIEW, settings.icon)) settings.icon = DEFAULTS.icon;
  const preset = PRESETS[settings.preset];
  if (preset && ['variant', 'icon', 'main', 'sub', 'small'].some((key) => settings[key] !== preset[key])) {
    settings.preset = 'custom';
  }
  if (!Object.prototype.hasOwnProperty.call(PROFILE_DEFAULTS, settings.labelProfile)) settings.labelProfile = 'auto';
  settings.pageMode = settings.pageMode === 'custom' ? 'custom' : 'all';
  settings.selectedPages = normalizePageList(settings.selectedPages);

  const rawProfiles = settings.positionProfiles && typeof settings.positionProfiles === 'object'
    ? settings.positionProfiles
    : {};
  const profiles = {};
  for (const [id, fallback] of Object.entries(PROFILE_DEFAULTS)) {
    const raw = rawProfiles[id] && typeof rawProfiles[id] === 'object' ? rawProfiles[id] : null;
    profiles[id] = {
      scale: clamp(numeric(raw ? raw.scale : undefined, fallback.scale), 0.6, 1.4),
      positionX: clamp(numeric(raw ? raw.positionX : undefined, fallback.positionX), -100, 100),
      positionY: clamp(numeric(raw ? raw.positionY : undefined, fallback.positionY), -100, 100),
    };
  }

  // Migrasi v1.2: nilai posisi lama menjadi profil yang sedang aktif.
  if (!rawProfiles[settings.labelProfile]) {
    profiles[settings.labelProfile] = {
      scale: clamp(numeric(settings.scale, 1), 0.6, 1.4),
      positionX: clamp(numeric(settings.positionX, 0), -100, 100),
      positionY: clamp(numeric(settings.positionY, 0), -100, 100),
    };
  }
  settings.positionProfiles = profiles;
}

function activeProfile() {
  const id = Object.prototype.hasOwnProperty.call(PROFILE_DEFAULTS, settings.labelProfile)
    ? settings.labelProfile
    : 'auto';
  return Object.assign({}, PROFILE_DEFAULTS[id], settings.positionProfiles[id] || {});
}

function updateActiveProfile(partial) {
  const id = settings.labelProfile;
  settings.positionProfiles = Object.assign({}, settings.positionProfiles, {
    [id]: Object.assign({}, activeProfile(), partial),
  });
  return settings.positionProfiles;
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
  const icon = Object.prototype.hasOwnProperty.call(ICON_PREVIEW, settings.icon) ? settings.icon : DEFAULTS.icon;

  el.previewBox.dataset.variant = variant;
  el.previewBox.dataset.icon = icon;
  el.previewIcon.dataset.icon = icon;
  el.previewIcon.textContent = ICON_PREVIEW[icon];
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

function renderPages() {
  const count = Math.max(0, Math.trunc(Number(pageCount) || 0));
  const custom = settings.pageMode === 'custom';
  const selected = new Set(normalizePageList(settings.selectedPages, count));
  const controlsEnabled = Boolean(settings.enabled && awbTab && count > 0);

  el.pageModes.forEach((button) => {
    button.setAttribute('aria-checked', String(button.dataset.pageMode === settings.pageMode));
    button.disabled = !controlsEnabled;
  });
  el.selectAllPages.disabled = !controlsEnabled;
  el.clearPages.disabled = !controlsEnabled;

  el.pageGrid.replaceChildren();
  for (let page = 1; page <= count; page += 1) {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = String(page);
    button.title = `Halaman ${page}`;
    button.setAttribute('aria-label', `Halaman ${page}`);
    button.setAttribute('aria-pressed', String(!custom || selected.has(page)));
    button.disabled = !controlsEnabled;
    button.addEventListener('click', () => {
      let next;
      if (settings.pageMode === 'all') {
        next = Array.from({ length: count }, (_, index) => index + 1)
          .filter((value) => value !== page);
      } else {
        next = normalizePageList(settings.selectedPages, count);
        next = next.includes(page) ? next.filter((value) => value !== page) : next.concat(page);
      }
      settings.pageMode = 'custom';
      settings.selectedPages = normalizePageList(next, count);
      scheduleSave({ pageMode: 'custom', selectedPages: settings.selectedPages });
      renderPages();
    });
    el.pageGrid.appendChild(button);
  }

  if (!count) {
    el.pageSummary.textContent = 'Menunggu dokumen';
    el.pageNote.textContent = 'Jumlah halaman muncul setelah PDF selesai dimuat.';
  } else if (!custom) {
    el.pageSummary.textContent = `Semua ${count} halaman`;
    el.pageNote.textContent = 'Stempel diterapkan ke setiap halaman dalam PDF.';
  } else {
    el.pageSummary.textContent = `${selected.size} dari ${count} halaman`;
    el.pageNote.textContent = selected.size
      ? `Halaman terpilih: ${Array.from(selected).join(', ')}.`
      : 'Tidak ada halaman dipilih; PDF akan dibiarkan tanpa stempel.';
  }
}

function fillForm() {
  normalizeSettings();
  el.enabled.checked = Boolean(settings.enabled);
  el.toggleState.textContent = settings.enabled ? 'Aktif' : 'Mati';
  document.body.classList.toggle('is-disabled', !settings.enabled);
  el.preset.value = settings.preset;
  el.handlingIcon.value = settings.icon;
  el.labelProfile.value = settings.labelProfile;
  el.main.value = settings.main || '';
  el.sub.value = settings.sub || '';
  el.main.disabled = !settings.enabled;
  el.sub.disabled = !settings.enabled;
  el.preset.disabled = !settings.enabled;
  el.handlingIcon.disabled = !settings.enabled;
  el.labelProfile.disabled = !settings.enabled;
  el.scale.disabled = !settings.enabled;
  el.positionX.disabled = !settings.enabled;
  el.positionY.disabled = !settings.enabled;
  el.resetPosition.disabled = !settings.enabled;
  el.variants.forEach((button) => { button.disabled = !settings.enabled; });
  el.scale.value = String(Math.round((Number(settings.scale) || 1) * 100));
  el.positionX.value = String(Math.round(Number(settings.positionX) || 0));
  el.positionY.value = String(Math.round(Number(settings.positionY) || 0));
  renderPosition();
  renderPages();
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

async function readTabStatus(reloadSettings) {
  if (reloadSettings !== false) {
    Object.assign(settings, await new Promise((resolve) => {
      chrome.storage.sync.get(DEFAULTS, resolve);
    }));
    normalizeSettings();
  }

  const tab = await getActiveTab();
  activeTabId = tab && tab.id ? tab.id : null;
  awbTab = isAwbUrl(tab && tab.url);

  if (!awbTab) {
    pageCount = 0;
    stampedPages = [];
    renderPages();
    setStatus('Buka halaman AWB (Preview Cetak) dulu.', 'muted');
    el.apply.disabled = true;
    el.open.disabled = true;
    el.download.disabled = true;
    return;
  }

  const response = await sendToTab(activeTabId, { type: 'awbfz:status' });
  if (!response.ok) {
    pageCount = 0;
    stampedPages = [];
    renderPages();
    setStatus('Ekstensi belum aktif di tab ini. Muat ulang halaman.', 'warn');
    el.apply.disabled = false;
    el.open.disabled = true;
    el.download.disabled = true;
    return;
  }

  el.apply.disabled = false;
  el.open.disabled = !response.ready;
  el.download.disabled = !response.ready;
  pageCount = Math.max(0, Math.trunc(Number(response.pageCount) || 0));
  stampedPages = normalizePageList(response.stampedPages, pageCount);
  renderPages();

  if (!response.enabled) setStatus('Stempel dimatikan untuk tab ini.', 'muted');
  else if (response.status === 'working') setStatus('Menambahkan stempel…', 'busy');
  else if (response.status === 'error') setStatus(response.note || 'Gagal menstempel.', 'err');
  else if (response.ready) {
    const pageInfo = pageCount ? `${stampedPages.length}/${pageCount} halaman` : 'PDF siap';
    setStatus(`${pageInfo} · sumber: ${response.source === 'api' ? 'endpoint' : 'blob'}`, 'ok');
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

const CONTROL_TABS = [
  { name: 'appearance', button: el.appearanceTab, panel: el.appearancePanel },
  { name: 'position', button: el.positionTab, panel: el.positionPanel },
  { name: 'pages', button: el.pagesTab, panel: el.pagesPanel },
];

function activateControlTab(name, focus) {
  const active = CONTROL_TABS.find((item) => item.name === name) || CONTROL_TABS[0];
  CONTROL_TABS.forEach((item) => {
    const selected = item === active;
    item.button.setAttribute('aria-selected', String(selected));
    item.button.tabIndex = selected ? 0 : -1;
    item.panel.hidden = !selected;
  });
  if (focus) active.button.focus();
}

CONTROL_TABS.forEach((item, index) => {
  item.button.addEventListener('click', () => {
    activateControlTab(item.name, false);
    if (item.name === 'pages') readTabStatus(false);
  });
  item.button.addEventListener('keydown', (event) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    let next = index;
    if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = CONTROL_TABS.length - 1;
    else if (event.key === 'ArrowLeft') next = (index - 1 + CONTROL_TABS.length) % CONTROL_TABS.length;
    else next = (index + 1) % CONTROL_TABS.length;
    activateControlTab(CONTROL_TABS[next].name, true);
    if (CONTROL_TABS[next].name === 'pages') readTabStatus(false);
  });
});

el.enabled.addEventListener('change', () => {
  settings.enabled = el.enabled.checked;
  fillForm();
  scheduleSave({ enabled: settings.enabled });
});

el.preset.addEventListener('change', () => {
  if (!settings.enabled) return;
  const id = el.preset.value;
  if (id === 'custom' || !PRESETS[id]) {
    scheduleSave({ preset: 'custom' });
    return;
  }
  const preset = PRESETS[id];
  Object.assign(settings, preset, { preset: id });
  fillForm();
  scheduleSave(Object.assign({ preset: id }, preset));
});

el.handlingIcon.addEventListener('change', () => {
  if (!settings.enabled) return;
  el.preset.value = 'custom';
  scheduleSave({ preset: 'custom', icon: el.handlingIcon.value });
  renderPreview();
});

el.variants.forEach((button) => {
  button.addEventListener('click', () => {
    if (!settings.enabled) return;
    el.preset.value = 'custom';
    scheduleSave({ preset: 'custom', variant: button.dataset.variant });
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
  el.preset.value = 'custom';
  scheduleSave({ preset: 'custom', main: el.main.value });
  renderPreview();
});

el.sub.addEventListener('input', () => {
  el.preset.value = 'custom';
  scheduleSave({ preset: 'custom', sub: el.sub.value });
  renderPreview();
});

el.scale.addEventListener('input', () => {
  const scale = Number(el.scale.value) / 100;
  settings.scale = scale;
  const profiles = updateActiveProfile({ scale });
  scheduleSave({ scale, positionProfiles: profiles });
  renderPreview();
});

el.positionX.addEventListener('input', () => {
  const positionX = Number(el.positionX.value);
  settings.positionX = positionX;
  const profiles = updateActiveProfile({ positionX });
  scheduleSave({ positionX, positionProfiles: profiles });
  renderPosition();
});

el.positionY.addEventListener('input', () => {
  const positionY = Number(el.positionY.value);
  settings.positionY = positionY;
  const profiles = updateActiveProfile({ positionY });
  scheduleSave({ positionY, positionProfiles: profiles });
  renderPosition();
});

el.labelProfile.addEventListener('change', () => {
  if (!settings.enabled) return;
  settings.labelProfile = el.labelProfile.value;
  const profile = activeProfile();
  settings.scale = profile.scale;
  settings.positionX = profile.positionX;
  settings.positionY = profile.positionY;
  fillForm();
  scheduleSave({
    labelProfile: settings.labelProfile,
    scale: settings.scale,
    positionX: settings.positionX,
    positionY: settings.positionY,
    positionProfiles: settings.positionProfiles,
  });
});

el.resetPosition.addEventListener('click', () => {
  if (!settings.enabled) return;
  const reset = Object.assign({}, PROFILE_DEFAULTS[settings.labelProfile] || PROFILE_DEFAULTS.auto);
  settings.scale = reset.scale;
  settings.positionX = reset.positionX;
  settings.positionY = reset.positionY;
  settings.positionProfiles = Object.assign({}, settings.positionProfiles, {
    [settings.labelProfile]: reset,
  });
  fillForm();
  scheduleSave({
    scale: reset.scale,
    positionX: reset.positionX,
    positionY: reset.positionY,
    positionProfiles: settings.positionProfiles,
  });
});

el.pageModes.forEach((button) => {
  button.addEventListener('click', () => {
    if (!settings.enabled || !pageCount) return;
    const mode = button.dataset.pageMode;
    const wasAll = settings.pageMode === 'all';
    settings.pageMode = mode === 'custom' ? 'custom' : 'all';
    if (settings.pageMode === 'custom' && wasAll) {
      settings.selectedPages = Array.from({ length: pageCount }, (_, index) => index + 1);
    }
    if (settings.pageMode === 'all') settings.selectedPages = [];
    scheduleSave({ pageMode: settings.pageMode, selectedPages: settings.selectedPages });
    renderPages();
  });
});

el.selectAllPages.addEventListener('click', () => {
  if (!settings.enabled || !pageCount) return;
  settings.pageMode = 'custom';
  settings.selectedPages = Array.from({ length: pageCount }, (_, index) => index + 1);
  scheduleSave({ pageMode: 'custom', selectedPages: settings.selectedPages });
  renderPages();
});

el.clearPages.addEventListener('click', () => {
  if (!settings.enabled || !pageCount) return;
  settings.pageMode = 'custom';
  settings.selectedPages = [];
  scheduleSave({ pageMode: 'custom', selectedPages: [] });
  renderPages();
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
