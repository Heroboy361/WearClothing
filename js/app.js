// WearClothing – Kleiderschrank-App (Port von tandpfun/wardrobe, komplett clientseitig).
import { imageStore } from './db.js';
import { icon } from './icons.js';
import * as ai from './openai.js';
import { analyzeShopUrl } from './gemini.js';
import { analyzeOutfit } from './advisor.js';

/* ---------- Konstanten ---------- */

const TYPES = [
  { id: 'all', label: 'Alle' },
  { id: 'upperbody', label: 'Oberteile', singular: 'Oberteil' },
  { id: 'wholebody_up', label: 'Jacken', singular: 'Jacke' },
  { id: 'lowerbody', label: 'Unterteile', singular: 'Unterteil' },
  { id: 'accessories_up', label: 'Accessoires', singular: 'Accessoire' },
  { id: 'shoes', label: 'Schuhe', singular: 'Schuhe' },
];
const TYPE_MAP = Object.fromEntries(TYPES.map((t) => [t.id, t]));
const TYPE_ORDER = Object.fromEntries(TYPES.slice(1).map((t, i) => [t.id, i]));
// Abbildung Kategorie -> Stilberater-Typ (für die Farbanalyse)
const ADVISOR_TYPE = { upperbody: 'tshirt', wholebody_up: 'jacke', lowerbody: 'hose', shoes: 'schuhe', accessories_up: 'kette' };

const $ = (sel) => document.querySelector(sel);
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

/* ---------- Zustand ---------- */

const store = {
  load(key, fallback) {
    try { return JSON.parse(localStorage.getItem('wearclothing.' + key)) ?? fallback; }
    catch { return fallback; }
  },
  save(key, value) { try { localStorage.setItem('wearclothing.' + key, JSON.stringify(value)); } catch (e) { console.warn(e); } },
};

const state = {
  items: store.load('items', []),
  looks: store.load('looks', []),
  settings: store.load('settings', { openaiKey: '', geminiKey: '', imageModel: ai.DEFAULTS.imageModel, visionModel: ai.DEFAULTS.visionModel }),
  rules: store.load('rules', { max3: true, mono: false, neutral: false, accent: true, metal: true, favColors: ['#1f2937', '#e5e0d8', '#7a2e2e'] }),
  activeType: 'all',
  view: 'wardrobe',
  selectedId: null,
  hasModelReference: false,
};

// Bild-Cache: storageKey -> dataURL (für synchrones Rendern)
const imageCache = new Map();
async function cacheImage(key) {
  if (!key) return null;
  if (imageCache.has(key)) return imageCache.get(key);
  const data = await imageStore.get(key);
  if (data) imageCache.set(key, data);
  return data || null;
}

/* ---------- Icons in statische Buttons ---------- */

$('#nav-settings').innerHTML = icon('gear', 18);
$('#drop-icon').innerHTML = icon('upload', 34);
$('#tray-upload').innerHTML = icon('upload', 17);
$('#import-close').innerHTML = icon('x', 20);
$('#settings-close').innerHTML = icon('x', 20);

/* ================= NAVIGATION ================= */

function setView(view) {
  state.view = view;
  $('#gallery-grid').classList.toggle('hidden', view !== 'wardrobe');
  $('#category-nav').classList.toggle('hidden', view !== 'wardrobe');
  $('#looks-pane').classList.toggle('hidden', view !== 'looks');
  $('#nav-wardrobe').classList.toggle('active', view === 'wardrobe');
  $('#nav-looks').classList.toggle('active', view === 'looks');
  updateEmptyStates();
  if (view === 'looks') renderLooks();
}
$('#nav-wardrobe').addEventListener('click', () => setView('wardrobe'));
$('#nav-looks').addEventListener('click', () => setView('looks'));
$('#nav-settings').addEventListener('click', openSettings);

/* ================= GALERIE ================= */

function renderCategoryNav() {
  const nav = $('#category-nav');
  nav.innerHTML = '';
  for (const type of TYPES) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = type.label;
    btn.className = state.activeType === type.id ? 'active' : '';
    btn.setAttribute('aria-pressed', state.activeType === type.id);
    btn.addEventListener('click', () => { state.activeType = type.id; state.selectedId = null; renderCategoryNav(); renderGallery(); });
    nav.appendChild(btn);
  }
}

function visibleItems() {
  const filtered = state.activeType === 'all' ? state.items : state.items.filter((i) => i.part === state.activeType);
  return [...filtered].sort((a, b) => {
    if (state.activeType === 'all') {
      const diff = (TYPE_ORDER[a.part] ?? 99) - (TYPE_ORDER[b.part] ?? 99);
      if (diff) return diff;
    }
    return a.id.localeCompare(b.id);
  });
}

async function renderGallery() {
  const grid = $('#gallery-grid');
  grid.innerHTML = '';
  const items = visibleItems();
  for (const item of items) {
    const btn = document.createElement('button');
    btn.className = 'gallery-item' + (state.selectedId === item.id ? ' selected' : '');
    btn.type = 'button';
    btn.setAttribute('aria-label', `${item.name || 'Teil'} ansehen`);
    const src = await cacheImage(item.imageKey);
    if (src) {
      const img = document.createElement('img');
      img.src = src;
      img.alt = '';
      btn.appendChild(img);
    } else {
      const fallback = document.createElement('span');
      fallback.className = 'swatch-fallback';
      fallback.style.background = item.color || '#c8c8c8';
      btn.appendChild(fallback);
    }
    btn.addEventListener('click', () => openViewer(item.id));
    grid.appendChild(btn);
  }
  $('#piece-count').textContent = `${state.items.length} ${state.items.length === 1 ? 'Teil' : 'Teile'}`;
  updateEmptyStates();
}

function updateEmptyStates() {
  $('#status-empty').classList.toggle('hidden', !(state.view === 'wardrobe' && state.items.length === 0));
}

/* ================= ITEM-VIEWER (Seitenleiste) ================= */

let viewerEl = null;

async function openViewer(id) {
  state.selectedId = id;
  const item = state.items.find((i) => i.id === id);
  if (!item) return;
  const garment = await cacheImage(item.imageKey);
  const modeled = item.modeledKey ? await cacheImage(item.modeledKey) : null;
  renderGallery();
  buildViewer(item, garment, modeled);
}

function closeViewer() {
  state.selectedId = null;
  if (viewerEl) { viewerEl.remove(); viewerEl = null; }
  document.body.classList.remove('viewer-open');
  $('#app-shell').classList.remove('has-selection');
  renderGallery();
}

function rgbToHex(r, g, b) {
  return '#' + [r, g, b].map((v) => Math.max(0, Math.min(255, v)).toString(16).padStart(2, '0')).join('');
}
function colorDistance(a, b) {
  return Math.sqrt((a.r - b.r) ** 2 + (a.g - b.g) ** 2 + (a.b - b.b) ** 2);
}
function extractPalette(image) {
  const c = document.createElement('canvas');
  c.width = 72; c.height = 72;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.clearRect(0, 0, 72, 72);
  ctx.drawImage(image, 0, 0, 72, 72);
  const px = ctx.getImageData(0, 0, 72, 72).data;
  const buckets = new Map();
  for (let i = 0; i < px.length; i += 4) {
    if (px[i + 3] < 72) continue;
    const r = px[i], g = px[i + 1], b = px[i + 2];
    const key = `${Math.round(r / 28)}-${Math.round(g / 28)}-${Math.round(b / 28)}`;
    const cur = buckets.get(key) || { r: 0, g: 0, b: 0, count: 0 };
    cur.r += r; cur.g += g; cur.b += b; cur.count += 1;
    buckets.set(key, cur);
  }
  const ranked = [...buckets.values()].map((x) => ({ r: Math.round(x.r / x.count), g: Math.round(x.g / x.count), b: Math.round(x.b / x.count), count: x.count })).sort((a, b) => b.count - a.count);
  const selected = [];
  for (const color of ranked) {
    if (selected.every((e) => colorDistance(e, color) > 38)) selected.push(color);
    if (selected.length === 5) break;
  }
  return selected.map((c2) => rgbToHex(c2.r, c2.g, c2.b));
}

function buildViewer(item, garmentSrc, modeledSrc) {
  document.body.classList.add('viewer-open');
  $('#app-shell').classList.add('has-selection');
  if (viewerEl) viewerEl.remove();

  const overlay = document.createElement('div');
  overlay.className = 'viewer-overlay';
  overlay.addEventListener('mousedown', (e) => { if (e.target === overlay) requestClose(); });

  const singular = TYPE_MAP[item.part]?.singular || 'Teil';
  const draft = { name: item.name || '', part: item.part, color: item.color || '#9a9286', secondaryColor: item.secondaryColor || null, tags: [...(item.tags || [])] };
  let palette = [...(item.palette || [])];
  let sampling = null;
  let samplingCanvas = null;

  const entry = document.createElement('div');
  entry.className = 'viewer-entry';
  const aside = document.createElement('aside');
  aside.className = `viewer editing${modeledSrc ? ' has-modeled-image' : ''}`;
  aside.setAttribute('role', 'dialog');
  aside.setAttribute('aria-modal', 'true');

  function isDirty() {
    const norm = (t) => t.map((x) => x.trim()).filter(Boolean);
    return JSON.stringify({ name: draft.name.trim(), part: draft.part, color: draft.color?.toLowerCase() || null, secondaryColor: draft.secondaryColor?.toLowerCase() || null, tags: norm(draft.tags) })
      !== JSON.stringify({ name: (item.name || '').trim(), part: item.part, color: item.color?.toLowerCase() || null, secondaryColor: item.secondaryColor?.toLowerCase() || null, tags: norm(item.tags || []) });
  }
  function requestClose() {
    if (isDirty()) { aside.classList.remove('shake'); void aside.offsetWidth; aside.classList.add('shake'); }
    else closeViewer();
  }

  function render() {
    aside.innerHTML = '';
    const close = document.createElement('button');
    close.className = 'viewer-icon-close';
    close.innerHTML = icon('x', 24);
    close.addEventListener('click', requestClose);

    const artwork = document.createElement('div');
    artwork.className = `viewer-art${modeledSrc ? ' viewer-art-floating' : ''}${sampling ? ' sampling' : ''}`;
    if (modeledSrc) {
      const hash = [...item.id].reduce((t, ch) => t + ch.charCodeAt(0), 0);
      artwork.style.setProperty('--piece-rotation', `${(hash % 9) - 4}deg`);
    }
    const artImg = document.createElement('img');
    artImg.src = garmentSrc || '';
    artImg.alt = singular;
    artImg.addEventListener('load', () => {
      const c = document.createElement('canvas');
      c.width = artImg.naturalWidth; c.height = artImg.naturalHeight;
      c.getContext('2d', { willReadFrequently: true }).drawImage(artImg, 0, 0);
      samplingCanvas = c;
      const extracted = extractPalette(artImg);
      palette = [...new Set([...(item.palette || []), ...extracted])].slice(0, 5);
      const pc = aside.querySelector('.palette-primary');
      if (pc) renderPalette(pc, 'color');
    });
    artImg.addEventListener('click', (e) => {
      if (!sampling || !samplingCanvas) return;
      const color = sampleColor(artImg, samplingCanvas, e);
      if (!color) return;
      draft[sampling === 'secondary' ? 'secondaryColor' : 'color'] = color;
      palette = [color, ...palette.filter((p) => p.toLowerCase() !== color.toLowerCase())].slice(0, 5);
      sampling = null;
      render();
    });
    artwork.appendChild(artImg);

    if (modeledSrc) {
      const hero = document.createElement('div');
      hero.className = 'modeled-hero';
      const photo = document.createElement('img');
      photo.className = 'modeled-hero-photo';
      photo.src = modeledSrc;
      photo.alt = `${draft.name || singular} als Model-Foto`;
      const heading = document.createElement('div');
      heading.className = 'viewer-heading modeled-heading';
      heading.innerHTML = `<div><h2>${escapeHtml(draft.name || singular)}</h2></div>`;
      hero.appendChild(photo);
      hero.appendChild(heading);
      hero.appendChild(artwork);
      aside.appendChild(close);
      aside.appendChild(hero);
    } else {
      const heading = document.createElement('div');
      heading.className = 'viewer-heading';
      heading.innerHTML = `<div><h2>${escapeHtml(draft.name || singular)}</h2></div>`;
      aside.appendChild(close);
      aside.appendChild(heading);
      aside.appendChild(artwork);
    }

    const details = document.createElement('div');
    details.className = 'viewer-details editing';
    details.appendChild(buildEditor());
    aside.appendChild(details);
  }

  function renderPalette(container, field) {
    container.innerHTML = '';
    for (const color of palette) {
      const b = document.createElement('button');
      b.type = 'button';
      b.style.backgroundColor = color;
      b.title = color;
      if (draft[field === 'secondary' ? 'secondaryColor' : 'color']?.toLowerCase() === color.toLowerCase()) b.className = 'active';
      b.addEventListener('click', () => { draft[field === 'secondary' ? 'secondaryColor' : 'color'] = color; render(); });
      container.appendChild(b);
    }
  }

  function colorControl(label, field, optional) {
    const value = field === 'secondary' ? draft.secondaryColor : draft.color;
    const slot = document.createElement('div');
    slot.className = 'color-slot' + (optional && !value ? ' empty-color-slot' : '');
    if (optional && !value) {
      slot.innerHTML = `<div class="color-slot-heading"><span>${label}</span><small>Optional</small></div><p>Keine eindeutige Zweitfarbe erkannt.</p>`;
      const add = document.createElement('button');
      add.className = 'add-secondary-button';
      add.type = 'button';
      add.textContent = 'Zweitfarbe hinzufügen';
      add.addEventListener('click', () => { draft.secondaryColor = palette.find((c) => c.toLowerCase() !== draft.color?.toLowerCase()) || '#9a9286'; render(); });
      slot.appendChild(add);
      return slot;
    }
    const heading = document.createElement('div');
    heading.className = 'color-slot-heading';
    heading.innerHTML = `<span>${label}</span>`;
    if (optional) {
      const rm = document.createElement('button');
      rm.type = 'button'; rm.textContent = 'Entfernen';
      rm.addEventListener('click', () => { draft.secondaryColor = null; render(); });
      heading.appendChild(rm);
    }
    slot.appendChild(heading);

    const ctrl = document.createElement('label');
    ctrl.className = 'selected-color-control';
    const input = document.createElement('input');
    input.type = 'color'; input.value = value || '#9a9286';
    input.addEventListener('input', (e) => { draft[field === 'secondary' ? 'secondaryColor' : 'color'] = e.target.value; const strong = ctrl.querySelector('strong'); if (strong) strong.textContent = e.target.value; });
    ctrl.innerHTML = `<span class="selected-color-copy"><small>Gewählt</small><strong>${value || 'Custom'}</strong></span>`;
    ctrl.prepend(input);
    slot.appendChild(ctrl);

    const sh = document.createElement('div');
    sh.className = 'suggestion-heading';
    sh.innerHTML = '<span>Vorschläge aus dem Bild</span><small>Zum Übernehmen tippen</small>';
    slot.appendChild(sh);

    const pal = document.createElement('div');
    pal.className = 'palette' + (field === 'primary' ? ' palette-primary' : '');
    slot.appendChild(pal);
    renderPalette(pal, field);

    const sampleBtn = document.createElement('button');
    sampleBtn.className = 'sample-button' + (sampling === field ? ' active' : '');
    sampleBtn.type = 'button';
    sampleBtn.textContent = sampling === field ? 'Abbrechen' : `${label} aus Bild wählen`;
    sampleBtn.addEventListener('click', () => { sampling = sampling === field ? null : field; render(); });
    slot.appendChild(sampleBtn);
    return slot;
  }

  function buildEditor() {
    const wrap = document.createElement('div');
    wrap.className = 'item-editor';

    const nameField = document.createElement('label');
    nameField.className = 'field';
    nameField.innerHTML = '<span>Name</span>';
    const nameInput = document.createElement('input');
    nameInput.value = draft.name;
    nameInput.placeholder = singular;
    nameInput.addEventListener('input', (e) => { draft.name = e.target.value; });
    nameField.appendChild(nameInput);
    wrap.appendChild(nameField);

    const catField = document.createElement('label');
    catField.className = 'field';
    catField.innerHTML = '<span>Kategorie</span>';
    const sel = document.createElement('select');
    for (const t of TYPES.slice(1)) {
      const o = document.createElement('option');
      o.value = t.id; o.textContent = t.label;
      if (draft.part === t.id) o.selected = true;
      sel.appendChild(o);
    }
    sel.addEventListener('change', (e) => { draft.part = e.target.value; });
    catField.appendChild(sel);
    wrap.appendChild(catField);

    const colorField = document.createElement('fieldset');
    colorField.className = 'color-field';
    colorField.innerHTML = '<legend>Farben</legend>';
    const editor = document.createElement('div');
    editor.className = 'colors-editor';
    editor.appendChild(colorControl('Primärfarbe', 'primary', false));
    editor.appendChild(colorControl('Zweitfarbe', 'secondary', true));
    colorField.appendChild(editor);
    const help = document.createElement('p');
    help.className = 'color-help';
    help.textContent = sampling ? `Tippe auf das Kleidungsstück, um die ${sampling === 'secondary' ? 'Zweit' : 'Primär'}farbe zu übernehmen.` : 'Farben kommen aus dem Bild. Eine Zweitfarbe wird nur bei deutlichem Unterschied vorgeschlagen.';
    colorField.appendChild(help);
    wrap.appendChild(colorField);

    const detailsField = document.createElement('div');
    detailsField.className = 'field details-field';
    detailsField.innerHTML = '<span>Details</span>';
    detailsField.appendChild(buildTagEditor(draft));
    wrap.appendChild(detailsField);

    const notice = document.createElement('p');
    notice.className = 'unsaved-notice hidden';
    wrap.appendChild(notice);

    const actions = document.createElement('div');
    actions.className = 'viewer-actions';
    const del = document.createElement('button');
    del.className = 'delete-button';
    del.type = 'button';
    del.innerHTML = icon('trash', 15) + ' Löschen';
    del.addEventListener('click', () => deleteItem(item.id));
    const spacer = document.createElement('span');
    spacer.className = 'action-spacer';
    const cancel = document.createElement('button');
    cancel.className = 'secondary-button';
    cancel.type = 'button';
    cancel.textContent = 'Schließen';
    cancel.addEventListener('click', closeViewer);
    const save = document.createElement('button');
    save.className = 'primary-button';
    save.type = 'button';
    save.innerHTML = icon('check', 15) + ' Speichern';
    save.addEventListener('click', () => {
      Object.assign(item, { name: draft.name.trim(), part: draft.part, color: draft.color, secondaryColor: draft.secondaryColor, tags: draft.tags.map((t) => t.trim()).filter(Boolean) });
      store.save('items', state.items);
      renderGallery();
      renderCategoryNav();
      closeViewer();
    });
    actions.append(del, spacer, cancel, save);
    wrap.appendChild(actions);
    return wrap;
  }

  render();
  entry.appendChild(aside);
  overlay.appendChild(entry);
  document.body.appendChild(overlay);
  viewerEl = overlay;
  document.addEventListener('keydown', escHandler);
  function escHandler(e) {
    if (e.key !== 'Escape') return;
    if (sampling) { sampling = null; render(); } else requestClose();
    if (!viewerEl) document.removeEventListener('keydown', escHandler);
  }
}

function buildTagEditor(draft) {
  const wrap = document.createElement('div');
  wrap.className = 'tag-editor';
  const tags = document.createElement('div');
  tags.className = 'editable-tags';
  const row = document.createElement('div');
  row.className = 'tag-input-row';
  const input = document.createElement('input');
  input.placeholder = 'Detail hinzufügen';
  const add = document.createElement('button');
  add.type = 'button';
  add.innerHTML = icon('plus', 15);
  function renderTags() {
    tags.innerHTML = '';
    for (const tag of draft.tags) {
      const span = document.createElement('span');
      span.className = 'editable-tag';
      span.textContent = tag;
      const rm = document.createElement('button');
      rm.type = 'button';
      rm.innerHTML = icon('x', 12);
      rm.addEventListener('click', () => { draft.tags = draft.tags.filter((t) => t !== tag); renderTags(); });
      span.appendChild(rm);
      tags.appendChild(span);
    }
  }
  function addTag() {
    const t = input.value.trim().replace(/^#/, '');
    if (!t || draft.tags.some((x) => x.toLowerCase() === t.toLowerCase())) return;
    draft.tags.push(t); input.value = ''; renderTags();
  }
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addTag(); } });
  add.addEventListener('click', addTag);
  renderTags();
  row.append(input, add);
  wrap.append(tags, row);
  return wrap;
}

function sampleColor(image, canvas, event) {
  const bounds = image.getBoundingClientRect();
  const scale = Math.min(bounds.width / image.naturalWidth, bounds.height / image.naturalHeight);
  const rw = image.naturalWidth * scale, rh = image.naturalHeight * scale;
  const ox = (bounds.width - rw) / 2, oy = (bounds.height - rh) / 2;
  const ix = Math.floor((event.clientX - bounds.left - ox) / scale);
  const iy = Math.floor((event.clientY - bounds.top - oy) / scale);
  if (ix < 0 || iy < 0 || ix >= canvas.width || iy >= canvas.height) return null;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  for (let radius = 0; radius <= 18; radius += 2) {
    const sx = Math.max(0, ix - radius), sy = Math.max(0, iy - radius);
    const w = Math.min(canvas.width - sx, radius * 2 + 1), h = Math.min(canvas.height - sy, radius * 2 + 1);
    const data = ctx.getImageData(sx, sy, w, h).data;
    for (let i = 0; i < data.length; i += 4) if (data[i + 3] > 96) return rgbToHex(data[i], data[i + 1], data[i + 2]);
  }
  return null;
}

async function deleteItem(id) {
  const item = state.items.find((i) => i.id === id);
  if (item) {
    if (item.imageKey) { imageStore.delete(item.imageKey); imageCache.delete(item.imageKey); }
    if (item.modeledKey) { imageStore.delete(item.modeledKey); imageCache.delete(item.modeledKey); }
  }
  state.items = state.items.filter((i) => i.id !== id);
  store.save('items', state.items);
  closeViewer();
  renderCategoryNav();
}

function escapeHtml(s) { return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

/* ================= IMPORT-PIPELINE ================= */

const jobs = [];
let importOpen = false;

function renderTrayButton() {
  const btn = $('#tray-button');
  const reviewing = jobs.filter((j) => j.stage === 'crop-review' || j.stage === 'garment-review' || j.stage === 'modeled-review').length;
  const processing = jobs.some((j) => j.stage.endsWith('-processing') || j.stage === 'analyzing');
  const errored = jobs.some((j) => j.stage === 'error');
  if (processing) btn.innerHTML = `<span class="import-spinner">${icon('spinner', 19)}</span>`;
  else if (errored) btn.innerHTML = icon('warning', 19);
  else if (reviewing) btn.innerHTML = `<span class="import-tray__count">${reviewing}</span>`;
  else btn.innerHTML = icon('plus', 19);

  const active = jobs[jobs.length - 1];
  $('#tray-label').textContent = jobs.length ? statusText(active) : 'Kleidung hinzufügen';
  const tray = $('#import-tray');
  tray.classList.toggle('is-expanded', jobs.length > 0);
}

function statusText(job) {
  switch (job?.stage) {
    case 'analyzing': return 'Kleidung wird erkannt';
    case 'crop-review': return 'Zuschnitt prüfen';
    case 'garment-processing': return 'Freisteller wird erstellt';
    case 'garment-review': return 'Bereit zur Prüfung';
    case 'modeled-processing': return 'Model-Foto wird erstellt';
    case 'modeled-review': return 'Model-Foto prüfen';
    case 'error': return 'Import braucht Aufmerksamkeit';
    default: return 'Kleidung hinzufügen';
  }
}

$('#tray-button').addEventListener('click', () => { if (jobs.length) openImport(); else $('#import-input').click(); });
$('#tray-upload').addEventListener('click', () => $('#import-input').click());
$('#import-close').addEventListener('click', closeImport);
$('#import-input').addEventListener('change', (e) => { submitFiles(e.target.files); e.target.value = ''; });
$('#import-backdrop').addEventListener('mousedown', (e) => { if (e.target === $('#import-backdrop')) closeImport(); });

function openImport() { importOpen = true; $('#import-backdrop').dataset.open = 'true'; renderImport(); }
function closeImport() { importOpen = false; $('#import-backdrop').dataset.open = 'false'; }

function requireSetup() {
  if (!state.settings.openaiKey) { openSettings(); return false; }
  if (!state.hasModelReference) { openSettings(); return false; }
  return true;
}

async function submitFiles(files) {
  const images = [...files].filter((f) => f.type.startsWith('image/'));
  if (!images.length) return;
  if (!requireSetup()) return;
  openImport();
  for (const file of images) {
    const dataUrl = await new Promise((res) => { const r = new FileReader(); r.onload = () => res(r.result); r.readAsDataURL(file); });
    await analyzeAndQueue(dataUrl);
  }
}

async function analyzeAndQueue(dataUrl) {
  const pending = { id: uid(), stage: 'analyzing' };
  jobs.push(pending);
  renderTrayButton(); renderImport();
  try {
    const normalized = await ai.normalizeImage(dataUrl, 1280);
    const detected = await ai.openAIAnalyze({ key: state.settings.openaiKey, model: state.settings.visionModel, imageDataUrl: normalized });
    jobs.splice(jobs.indexOf(pending), 1);
    if (!detected.length) { showImportError('Kein Kleidungsstück im Bild erkannt. Versuche ein klareres, enger gefasstes Foto.'); renderTrayButton(); renderImport(); return; }
    for (const meta of detected) {
      const crop = await ai.cropDetectedItem(normalized, meta.boundingBox);
      jobs.push({ id: uid(), stage: 'crop-review', metadata: meta, original: normalized, cropImage: crop });
    }
  } catch (e) {
    jobs.splice(jobs.indexOf(pending), 1);
    showImportError(e.message);
  }
  renderTrayButton(); renderImport();
}

function showImportError(msg) {
  const el = $('#import-error');
  el.textContent = msg;
  el.classList.remove('hidden');
  setTimeout(() => el.classList.add('hidden'), 8000);
}

// Link-Import: analysiert per Gemini und legt ein Teil ohne Model-Foto an (Farbe/Name),
// da Shops kein isoliertes Kleidungsbild liefern, das wir freistellen könnten.
$('#import-link-add').addEventListener('click', async () => {
  const link = $('#import-link').value.trim();
  if (!link) return;
  if (!state.settings.geminiKey) { showImportError('Für den Link-Import bitte in den Einstellungen einen Gemini-Schlüssel hinterlegen.'); return; }
  $('#import-link-add').disabled = true;
  try {
    const info = await analyzeShopUrl({ apiKey: state.settings.geminiKey, link });
    const item = {
      id: uid(),
      name: info.name || 'Neues Teil',
      part: info.part || 'upperbody',
      color: info.color || '#c8c8c8',
      secondaryColor: null,
      tags: [info.colorName, info.size ? 'gr. ' + info.size : null, info.brand].filter(Boolean).map((t) => t.toLowerCase()),
      imageKey: null,
      modeledKey: null,
      palette: info.color ? [info.color] : [],
      link,
    };
    state.items.unshift(item);
    store.save('items', state.items);
    $('#import-link').value = '';
    renderGallery(); renderCategoryNav();
    showImportError(`„${item.name}“ importiert. Für ein Model-Foto ein Produktbild als Foto importieren.`);
  } catch (e) { showImportError(e.message); }
  finally { $('#import-link-add').disabled = false; }
});

async function advanceCrop(job) {
  job.stage = 'garment-processing';
  renderTrayButton(); renderImport();
  try {
    const chromaKey = ai.chooseChromaKey(job.metadata.color);
    const prompt = ai.buildGarmentPrompt(job.metadata, chromaKey) + (job.regenDirection ? `\nUser regeneration direction: ${job.regenDirection}` : '');
    const raw = await ai.openAIEdit({ key: state.settings.openaiKey, model: state.settings.imageModel, prompt, images: [job.cropImage], size: '1024x1024' });
    job.garmentSource = raw;
    job.chromaKey = chromaKey;
    const result = await ai.processChromaBackground(raw, chromaKey, {});
    job.garmentImage = result.dataUrl;
    job.cleanupTolerance = result.tolerance;
    job.cleanupContaminated = result.contaminatedPixels;
    job.stage = 'garment-review';
  } catch (e) { job.stage = 'error'; job.error = e.message; }
  renderTrayButton(); renderImport();
}

async function recleanup(job, tolerance) {
  try {
    const result = await ai.processChromaBackground(job.garmentSource, job.chromaKey, { tolerance });
    job.garmentImage = result.dataUrl;
    job.cleanupTolerance = result.tolerance;
    job.cleanupContaminated = result.contaminatedPixels;
  } catch (e) { showImportError(e.message); }
  renderImport();
}

async function approveGarment(job) {
  // Teil in den Kleiderschrank aufnehmen (Freisteller)
  const itemId = uid();
  const imageKey = `garment-${itemId}`;
  await imageStore.put(imageKey, job.garmentImage);
  imageCache.set(imageKey, job.garmentImage);
  const item = {
    id: itemId,
    name: job.metadata.name,
    part: job.metadata.part,
    color: job.metadata.color,
    secondaryColor: job.metadata.secondaryColor,
    tags: job.metadata.tags,
    imageKey,
    modeledKey: null,
    palette: [job.metadata.color, job.metadata.secondaryColor].filter(Boolean),
  };
  state.items.unshift(item);
  store.save('items', state.items);
  renderGallery(); renderCategoryNav();
  job.itemId = itemId;
  job.stage = 'modeled-processing';
  renderTrayButton(); renderImport();
  // Model-Foto erzeugen
  try {
    const modelRef = await imageStore.get('model-reference');
    const prompt = ai.MODELED_PROMPT + (job.modeledDirection ? `\nUser regeneration direction: ${job.modeledDirection}` : '');
    const modeled = await ai.openAIEdit({ key: state.settings.openaiKey, model: state.settings.imageModel, prompt, images: [modelRef, job.garmentImage], size: '1024x1536' });
    job.modeledImage = modeled;
    job.stage = 'modeled-review';
  } catch (e) { job.stage = 'modeled-error'; job.error = e.message; }
  renderTrayButton(); renderImport();
}

async function approveModeled(job) {
  const item = state.items.find((i) => i.id === job.itemId);
  if (item && job.modeledImage) {
    const modeledKey = `modeled-${item.id}`;
    await imageStore.put(modeledKey, job.modeledImage);
    imageCache.set(modeledKey, job.modeledImage);
    item.modeledKey = modeledKey;
    store.save('items', state.items);
    renderGallery();
  }
  removeJob(job);
}

function removeJob(job) {
  const i = jobs.indexOf(job);
  if (i >= 0) jobs.splice(i, 1);
  if (!jobs.length) closeImport();
  renderTrayButton(); renderImport();
}

/* ---- Import-Popover-Rendering ---- */

function renderImport() {
  const title = $('#import-title');
  const body = $('#import-body');
  const reviewing = jobs.filter((j) => ['crop-review', 'garment-review', 'modeled-review'].includes(j.stage)).length;
  title.textContent = reviewing ? `${reviewing} bereit zur Prüfung` : jobs.some((j) => j.stage === 'error') ? 'Import braucht Aufmerksamkeit' : jobs.length ? 'Neue Teile werden vorbereitet' : 'Zum Kleiderschrank hinzufügen';

  body.innerHTML = '';
  if (!jobs.length) {
    body.innerHTML = `<div class="import-drop-target">${icon('upload', 28)}<h2>Bild wählen oder einfügen</h2><p>Wir isolieren jedes Kleidungsstück, schlagen Details vor und halten alles zu deiner Prüfung bereit.</p></div>`;
    const choose = document.createElement('button');
    choose.className = 'import-button import-button--primary';
    choose.textContent = 'Bilder wählen';
    choose.style.marginTop = '4px';
    choose.addEventListener('click', () => $('#import-input').click());
    body.querySelector('.import-drop-target').appendChild(choose);
    return;
  }

  const reviewJob = jobs.find((j) => ['crop-review', 'garment-review', 'modeled-review'].includes(j.stage)) || jobs[jobs.length - 1];

  if (jobs.some((j) => j.stage.endsWith('-processing') || j.stage === 'analyzing')) {
    const prog = document.createElement('div');
    prog.className = 'import-progress';
    prog.innerHTML = `<div class="import-progress__meta"><span>${statusText(jobs[jobs.length - 1])}</span><span>${jobs.length} ${jobs.length === 1 ? 'Teil' : 'Teile'}</span></div><div class="import-progress__track"><div class="import-progress__bar"></div></div>`;
    body.appendChild(prog);
  }

  if (reviewJob) body.appendChild(buildReviewEditor(reviewJob));

  const list = document.createElement('div');
  list.className = 'import-card-list';
  for (const job of jobs) list.appendChild(buildJobCard(job, reviewJob));
  body.appendChild(list);

  const actions = document.createElement('div');
  actions.className = 'import-actions';
  const another = document.createElement('button');
  another.className = 'import-button';
  another.innerHTML = icon('plus', 14) + ' Weiteres hinzufügen';
  another.addEventListener('click', () => $('#import-input').click());
  actions.appendChild(another);
  body.appendChild(actions);
}

function buildJobCard(job, reviewJob) {
  const card = document.createElement('article');
  const tone = job.stage.includes('review') ? 'ready' : job.stage === 'error' || job.stage === 'modeled-error' ? 'error' : 'processing';
  card.className = `import-card is-${tone}` + (reviewJob === job ? ' is-selected' : '');
  const img = document.createElement('img');
  img.className = 'import-card__image';
  img.src = job.garmentImage || job.cropImage || job.original || '';
  card.appendChild(img);
  const b = document.createElement('div');
  b.className = 'import-card__body';
  b.innerHTML = `<h3 class="import-card__title">${escapeHtml(job.metadata?.name || 'Neues Teil')}</h3><p class="import-card__detail import-card__detail--status" data-tone="${tone}">${tone === 'error' ? escapeHtml(job.error || 'Fehler') : statusText(job)}</p>`;
  card.appendChild(b);
  const acts = document.createElement('div');
  acts.className = 'import-card__actions';
  if (job.stage === 'error' || job.stage === 'modeled-error') {
    const retry = document.createElement('button');
    retry.className = 'import-button import-card__retry';
    retry.innerHTML = icon('retry', 14) + ' Erneut';
    retry.addEventListener('click', () => { if (job.stage === 'modeled-error') { job.stage = 'garment-review'; approveGarment(job); } else { job.stage = 'crop-review'; advanceCrop(job); } });
    acts.appendChild(retry);
  }
  const del = document.createElement('button');
  del.className = 'import-icon-button import-card__delete';
  del.innerHTML = icon('trash', 16);
  del.addEventListener('click', () => removeJob(job));
  acts.appendChild(del);
  card.appendChild(acts);
  return card;
}

function buildReviewEditor(job) {
  const wrap = document.createElement('div');
  wrap.className = 'import-editor';
  const preview = document.createElement('img');
  preview.className = 'import-editor__preview';
  preview.src = job.stage === 'crop-review' ? job.cropImage : job.stage === 'garment-review' ? job.garmentImage : job.modeledImage;
  wrap.appendChild(preview);

  const fields = document.createElement('div');
  fields.className = 'import-fields';
  const stageLabel = document.createElement('p');
  stageLabel.className = 'import-editor__stage';
  stageLabel.textContent = job.stage === 'crop-review' ? 'Erkanntes Teil' : job.stage === 'garment-review' ? 'Freisteller' : 'Model-Foto';
  fields.appendChild(stageLabel);

  if (job.stage === 'crop-review') {
    const p = document.createElement('p');
    p.className = 'import-card__detail';
    p.textContent = 'Prüfe, ob der Zuschnitt das gewünschte Teil vollständig zeigt. Mit „Zuschnitt verwenden“ startet der Freisteller.';
    fields.appendChild(p);
  } else if (job.stage === 'garment-review') {
    fields.appendChild(metaField('Name', 'text', job.metadata.name, (v) => { job.metadata.name = v; }));
    fields.appendChild(metaSelect('Kategorie', job.metadata.part, (v) => { job.metadata.part = v; }));
    fields.appendChild(metaColor('Primärfarbe', job.metadata.color, (v) => { job.metadata.color = v; }));
    fields.appendChild(metaField('Zweitfarbe (optional)', 'text', job.metadata.secondaryColor || '', (v) => { job.metadata.secondaryColor = /^#[0-9a-f]{6}$/i.test(v) ? v : null; }, '#hex oder leer'));
    fields.appendChild(metaField('Details', 'text', (job.metadata.tags || []).join(', '), (v) => { job.metadata.tags = v.split(',').map((t) => t.trim().toLowerCase()).filter(Boolean); }, 'casual, baumwolle, gestreift'));
    if (job.cleanupContaminated > 1) fields.appendChild(buildCleanupControl(job));
    fields.appendChild(regenField('Neu-Anweisung (optional)', job.regenDirection || '', (v) => { job.regenDirection = v; }, 'z. B. Reißverschluss erhalten, Etikett entfernen'));
  } else {
    const p = document.createElement('p');
    p.className = 'import-card__detail';
    p.textContent = 'Übernimm dieses Model-Foto für dein neues Teil oder generiere es mit einer genaueren Vorgabe neu.';
    fields.appendChild(p);
    fields.appendChild(regenField('Neu-Anweisung (optional)', job.modeledDirection || '', (v) => { job.modeledDirection = v; }, 'z. B. abends in der Stadt, ganze Kleidung zeigen'));
  }

  const actions = document.createElement('div');
  actions.className = 'import-actions';
  const reject = document.createElement('button');
  reject.className = 'import-button';
  reject.innerHTML = icon('trash', 14) + ' Verwerfen';
  reject.addEventListener('click', () => removeJob(job));
  actions.appendChild(reject);

  if (job.stage === 'garment-review') {
    const regen = document.createElement('button');
    regen.className = 'import-button';
    regen.innerHTML = icon('retry', 14) + ' Neu generieren';
    regen.addEventListener('click', () => advanceCrop(job));
    actions.appendChild(regen);
  } else if (job.stage === 'modeled-review') {
    const regen = document.createElement('button');
    regen.className = 'import-button';
    regen.innerHTML = icon('retry', 14) + ' Neu generieren';
    regen.addEventListener('click', () => approveGarment(job));
    actions.appendChild(regen);
  }

  const approve = document.createElement('button');
  approve.className = 'import-button import-button--primary';
  approve.innerHTML = icon('check', 14) + (job.stage === 'crop-review' ? ' Zuschnitt verwenden' : ' Übernehmen');
  approve.addEventListener('click', () => {
    if (job.stage === 'crop-review') advanceCrop(job);
    else if (job.stage === 'garment-review') approveGarment(job);
    else approveModeled(job);
  });
  actions.appendChild(approve);
  fields.appendChild(actions);
  wrap.appendChild(fields);
  return wrap;
}

function buildCleanupControl(job) {
  const wrap = document.createElement('div');
  wrap.className = 'import-cleanup-editor';
  wrap.innerHTML = `<p class="import-card__detail">Der Freisteller zeigt noch ${job.cleanupContaminated} getönte Randpixel. Regel die Stärke nach – das kostet keine erneute KI-Anfrage.</p>`;
  const strength = document.createElement('div');
  strength.className = 'import-field import-cleanup-strength';
  strength.innerHTML = `<label>Freisteller-Stärke <strong>${job.cleanupTolerance}</strong></label>`;
  const range = document.createElement('input');
  range.type = 'range'; range.min = '18'; range.max = '110'; range.step = '2'; range.value = job.cleanupTolerance;
  let t;
  range.addEventListener('input', (e) => { strength.querySelector('strong').textContent = e.target.value; clearTimeout(t); t = setTimeout(() => recleanup(job, Number(e.target.value)), 300); });
  strength.appendChild(range);
  strength.insertAdjacentHTML('beforeend', '<div class="import-cleanup-scale"><span>Mehr Kantendetail</span><span>Mehr Hintergrund entfernen</span></div>');
  wrap.appendChild(strength);
  return wrap;
}

function metaField(label, type, value, onInput, placeholder) {
  const f = document.createElement('div');
  f.className = 'import-field';
  f.innerHTML = `<label>${label}</label>`;
  const input = document.createElement('input');
  input.type = type; input.value = value; if (placeholder) input.placeholder = placeholder;
  input.addEventListener('input', (e) => onInput(e.target.value));
  f.appendChild(input);
  return f;
}
function metaSelect(label, value, onChange) {
  const f = document.createElement('div');
  f.className = 'import-field';
  f.innerHTML = `<label>${label}</label>`;
  const sel = document.createElement('select');
  for (const t of TYPES.slice(1)) { const o = document.createElement('option'); o.value = t.id; o.textContent = t.label; if (value === t.id) o.selected = true; sel.appendChild(o); }
  sel.addEventListener('change', (e) => onChange(e.target.value));
  f.appendChild(sel);
  return f;
}
function metaColor(label, value, onChange) {
  const f = document.createElement('div');
  f.className = 'import-field';
  f.innerHTML = `<label>${label}</label>`;
  const row = document.createElement('div');
  row.className = 'import-color-row';
  const color = document.createElement('input');
  color.type = 'color'; color.value = /^#[0-9a-f]{6}$/i.test(value) ? value : '#000000';
  const hex = document.createElement('input');
  hex.value = value;
  color.addEventListener('input', (e) => { hex.value = e.target.value; onChange(e.target.value); });
  hex.addEventListener('input', (e) => { if (/^#[0-9a-f]{6}$/i.test(e.target.value)) { color.value = e.target.value; onChange(e.target.value); } });
  row.append(color, hex);
  f.appendChild(row);
  return f;
}
function regenField(label, value, onInput, placeholder) {
  const f = document.createElement('div');
  f.className = 'import-field';
  f.innerHTML = `<label>${label}</label>`;
  const ta = document.createElement('textarea');
  ta.rows = 3; ta.value = value; ta.placeholder = placeholder;
  ta.addEventListener('input', (e) => onInput(e.target.value));
  f.appendChild(ta);
  return f;
}

/* ---- Drag & Drop / Einfügen ---- */

let dragDepth = 0;
window.addEventListener('dragenter', (e) => { if (![...e.dataTransfer.types].includes('Files')) return; e.preventDefault(); dragDepth++; $('#drop-overlay').dataset.active = 'true'; });
window.addEventListener('dragover', (e) => { if ([...e.dataTransfer.types].includes('Files')) e.preventDefault(); });
window.addEventListener('dragleave', (e) => { e.preventDefault(); dragDepth = Math.max(0, dragDepth - 1); if (!dragDepth) $('#drop-overlay').dataset.active = 'false'; });
window.addEventListener('drop', (e) => { e.preventDefault(); dragDepth = 0; $('#drop-overlay').dataset.active = 'false'; submitFiles(e.dataTransfer.files); });
window.addEventListener('paste', (e) => { const files = [...(e.clipboardData?.files || [])]; if (files.some((f) => f.type.startsWith('image/'))) { e.preventDefault(); submitFiles(files); } });

/* ================= LOOKS ================= */

const lookSelection = new Set();
let lookResult = null;

async function renderLooks() {
  const picker = $('#look-picker');
  picker.innerHTML = '';
  for (const item of state.items) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'look-pick' + (lookSelection.has(item.id) ? ' selected' : '');
    const src = item.modeledKey ? await cacheImage(item.modeledKey) : await cacheImage(item.imageKey);
    if (src) { const img = document.createElement('img'); img.src = src; btn.appendChild(img); }
    else { const s = document.createElement('span'); s.className = 'swatch-fallback'; s.style.background = item.color; btn.appendChild(s); }
    btn.addEventListener('click', () => { lookSelection.has(item.id) ? lookSelection.delete(item.id) : lookSelection.add(item.id); renderLooks(); });
    picker.appendChild(btn);
  }
  $('#look-picker-empty').classList.toggle('hidden', state.items.length > 0);

  const grid = $('#looks-grid');
  grid.innerHTML = '';
  const sorted = [...state.looks].sort((a, b) => (b.fav - a.fav) || (b.createdAt - a.createdAt));
  for (const look of sorted) {
    const card = document.createElement('div');
    card.className = 'look-card';
    const src = look.imageKey ? await cacheImage(look.imageKey) : null;
    if (src) { const img = document.createElement('img'); img.src = src; img.alt = look.name; card.appendChild(img); }
    const bodyEl = document.createElement('div');
    bodyEl.className = 'look-card-body';
    const name = document.createElement('span');
    name.className = 'name'; name.textContent = look.name;
    const fav = document.createElement('button');
    fav.className = look.fav ? 'fav' : '';
    fav.innerHTML = icon(look.fav ? 'starFill' : 'star', 17);
    fav.addEventListener('click', () => { look.fav = !look.fav; store.save('looks', state.looks); renderLooks(); });
    const del = document.createElement('button');
    del.innerHTML = icon('trash', 16);
    del.addEventListener('click', () => { if (look.imageKey) { imageStore.delete(look.imageKey); imageCache.delete(look.imageKey); } state.looks = state.looks.filter((l) => l.id !== look.id); store.save('looks', state.looks); renderLooks(); });
    bodyEl.append(name, fav, del);
    card.appendChild(bodyEl);
    grid.appendChild(card);
  }
  $('#looks-empty').classList.toggle('hidden', state.looks.length > 0);
}

function selectedLookItems() {
  return [...lookSelection].map((id) => state.items.find((i) => i.id === id)).filter(Boolean);
}

$('#btn-look-advise').addEventListener('click', () => {
  const items = selectedLookItems().map((i) => ({ type: ADVISOR_TYPE[i.part] || 'tshirt', color: i.color }));
  const { score, text } = analyzeOutfit(items, { hair: state.rules.favColors?.[0], eyes: '#4a6b8a' }, state.rules);
  const box = $('#look-advice');
  box.textContent = `Stil-Check ${score}/100 — ${text}`;
  box.classList.remove('hidden');
});

$('#btn-look-generate').addEventListener('click', async () => {
  const items = selectedLookItems();
  if (!items.length) { showImportError('Wähle zuerst Teile für den Look aus.'); openImport(); closeImport(); return; }
  if (!requireSetup()) return;
  const btn = $('#btn-look-generate');
  btn.disabled = true; btn.textContent = 'Look wird generiert …';
  try {
    const modelRef = await imageStore.get('model-reference');
    const garments = [];
    for (const item of items) { const g = await cacheImage(item.imageKey); if (g) garments.push(g); }
    const prompt = ai.buildLookPrompt(garments.length, $('#look-note').value.trim());
    const result = await ai.openAIEdit({ key: state.settings.openaiKey, model: state.settings.imageModel, prompt, images: [modelRef, ...garments], size: '1024x1536' });
    lookResult = result;
    const box = $('#look-result');
    box.classList.remove('hidden');
    box.querySelector('img').src = result;
  } catch (e) { showImportError(e.message); }
  finally { btn.disabled = false; btn.textContent = 'Look generieren'; }
});

$('#btn-look-save').addEventListener('click', async () => {
  if (!lookResult) return;
  const id = uid();
  const imageKey = `look-${id}`;
  await imageStore.put(imageKey, lookResult);
  imageCache.set(imageKey, lookResult);
  const look = { id, name: $('#look-name').value.trim() || 'Look vom ' + new Date().toLocaleDateString('de-DE'), itemIds: [...lookSelection], imageKey, fav: false, createdAt: Date.now() };
  state.looks.unshift(look);
  store.save('looks', state.looks);
  $('#look-name').value = '';
  $('#look-result').classList.add('hidden');
  lookResult = null;
  renderLooks();
});

/* ================= EINSTELLUNGEN ================= */

function openSettings() {
  $('#set-openai').value = state.settings.openaiKey || '';
  $('#set-gemini').value = state.settings.geminiKey || '';
  $('#set-image-model').value = state.settings.imageModel || '';
  $('#set-vision-model').value = state.settings.visionModel || '';
  $('#r-max3').checked = state.rules.max3;
  $('#r-mono').checked = state.rules.mono;
  $('#r-neutral').checked = state.rules.neutral;
  $('#r-accent').checked = state.rules.accent;
  $('#r-metal').checked = state.rules.metal;
  const favs = state.rules.favColors || [];
  if (favs[0]) $('#fav-c1').value = favs[0];
  if (favs[1]) $('#fav-c2').value = favs[1];
  if (favs[2]) $('#fav-c3').value = favs[2];
  $('#settings-backdrop').dataset.open = 'true';
}
function closeSettings() { $('#settings-backdrop').dataset.open = 'false'; }
$('#settings-close').addEventListener('click', closeSettings);
$('#settings-backdrop').addEventListener('mousedown', (e) => { if (e.target === $('#settings-backdrop')) closeSettings(); });
$('#set-photo-button').addEventListener('click', () => $('#set-photo').click());
$('#set-photo').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const dataUrl = await new Promise((res) => { const r = new FileReader(); r.onload = () => res(r.result); r.readAsDataURL(file); });
  const normalized = await ai.normalizeImage(dataUrl, 1280);
  await imageStore.put('model-reference', normalized);
  imageCache.set('model-reference', normalized);
  state.hasModelReference = true;
  const prev = $('#set-photo-preview');
  prev.src = normalized; prev.classList.remove('hidden');
});
$('#settings-save').addEventListener('click', () => {
  state.settings = {
    openaiKey: $('#set-openai').value.trim(),
    geminiKey: $('#set-gemini').value.trim(),
    imageModel: $('#set-image-model').value.trim() || ai.DEFAULTS.imageModel,
    visionModel: $('#set-vision-model').value.trim() || ai.DEFAULTS.visionModel,
  };
  store.save('settings', state.settings);
  state.rules = {
    max3: $('#r-max3').checked, mono: $('#r-mono').checked, neutral: $('#r-neutral').checked,
    accent: $('#r-accent').checked, metal: $('#r-metal').checked,
    favColors: [$('#fav-c1').value, $('#fav-c2').value, $('#fav-c3').value],
  };
  store.save('rules', state.rules);
  closeSettings();
});

/* ================= START ================= */

async function init() {
  renderTrayButton();
  renderCategoryNav();
  await renderGallery();
  state.hasModelReference = !!(await imageStore.get('model-reference'));
  if (state.hasModelReference) {
    const prev = $('#set-photo-preview');
    prev.src = await imageStore.get('model-reference');
    prev.classList.remove('hidden');
  }
  setView('wardrobe');
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
}
init();
