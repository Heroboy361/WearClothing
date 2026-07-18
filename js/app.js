// WearClothing – Kleiderschrank-App (Port von tandpfun/wardrobe, komplett clientseitig).
import { imageStore } from './db.js';
import { icon } from './icons.js';
import * as ai from './openai.js';
import { analyzeShopUrl } from './gemini.js';
import { analyzeOutfit, isNeutral } from './advisor.js';
import { matchStyles } from './style-knowledge.js';
import { t, getLang, setLang, applyStaticTranslations } from './i18n.js';

/* ---------- Konstanten ---------- */

const TYPE_IDS = ['all', 'upperbody', 'wholebody_up', 'lowerbody', 'accessories_up', 'shoes'];
const TYPE_ORDER = Object.fromEntries(TYPE_IDS.slice(1).map((id, i) => [id, i]));
const typeLabel = (id) => t(`type.${id}`);
const typeSingular = (id) => t(`type.${id}.one`);
// Abbildung Kategorie -> Stilberater-Typ (für die Farbanalyse)
const ADVISOR_TYPE = { upperbody: 'tshirt', wholebody_up: 'jacke', lowerbody: 'hose', shoes: 'schuhe', accessories_up: 'kette' };
// Für welche Kategorien wird beim Model-Foto ein echtes Partner-Teil gesucht
const COMPANION_PARTS = {
  upperbody: ['lowerbody'],
  wholebody_up: ['lowerbody'],
  lowerbody: ['upperbody', 'wholebody_up'],
  shoes: ['upperbody', 'lowerbody'],
  accessories_up: ['upperbody', 'lowerbody'],
};

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
  settings: store.load('settings', { openaiKey: '', geminiKey: '', imageModel: ai.DEFAULTS.imageModel, visionModel: ai.DEFAULTS.visionModel, theme: '', usageLimit: 40 }),
  rules: store.load('rules', { max3: true, mono: false, neutral: false, accent: true, metal: true, favColors: ['#1f2937', '#e5e0d8', '#7a2e2e'] }),
  usage: store.load('usage', { day: '', count: 0 }),
  activeType: 'all',
  view: 'wardrobe',
  selectedId: null,
  hasModelReference: false,
};
// Alte, ungültige Platzhalter-Modelle automatisch auf echte OpenAI-Modelle heben
if (['gpt-image-2', ''].includes(state.settings.imageModel)) state.settings.imageModel = ai.DEFAULTS.imageModel;
if (['gpt-5.4-mini', ''].includes(state.settings.visionModel)) state.settings.visionModel = ai.DEFAULTS.visionModel;
if (typeof state.settings.usageLimit !== 'number') state.settings.usageLimit = 40;

/* ---------- OpenAI-Nutzungslimit (Bild-Generierungen pro Tag) ---------- */
function todayKey() { return new Date().toISOString().slice(0, 10); }
function usageLeft() {
  const limit = state.settings.usageLimit || 0;
  if (!limit) return Infinity;
  if (state.usage.day !== todayKey()) return limit;
  return Math.max(0, limit - state.usage.count);
}
function bumpUsage(n = 1) {
  const today = todayKey();
  if (state.usage.day !== today) state.usage = { day: today, count: 0 };
  state.usage.count += n;
  store.save('usage', state.usage);
}
// Prüft vor einer Generierung, ob noch Budget da ist
function canGenerate() {
  if (usageLeft() <= 0) {
    notify(t('err.limit', state.settings.usageLimit));
    return false;
  }
  return true;
}
function hasUsageFor(n) { return usageLeft() >= n; }

// Überall sichtbarer, kurzlebiger Hinweis
function notify(msg) {
  const el = document.createElement('div');
  el.className = 'app-toast';
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 4000);
}

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
$('#tray-auto').innerHTML = icon('wand', 16);
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
  for (const id of TYPE_IDS) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = typeLabel(id);
    btn.className = state.activeType === id ? 'active' : '';
    btn.setAttribute('aria-pressed', state.activeType === id);
    btn.addEventListener('click', () => { state.activeType = id; state.selectedId = null; renderCategoryNav(); renderGallery(); });
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
    btn.setAttribute('aria-label', `${item.name || t('viewer.newPiece')}`);
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
  $('#piece-count').textContent = t('pieces', state.items.length);
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

  const singular = typeSingular(item.part) || t('viewer.newPiece');
  const draft = { name: item.name || '', part: item.part, color: item.color || '#9a9286', secondaryColor: item.secondaryColor || null, material: item.material || '', pattern: item.pattern || '', brand: item.brand || '', tags: [...(item.tags || [])] };
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
    return JSON.stringify({ name: draft.name.trim(), part: draft.part, color: draft.color?.toLowerCase() || null, secondaryColor: draft.secondaryColor?.toLowerCase() || null, material: draft.material.trim(), pattern: draft.pattern.trim(), brand: draft.brand.trim(), tags: norm(draft.tags) })
      !== JSON.stringify({ name: (item.name || '').trim(), part: item.part, color: item.color?.toLowerCase() || null, secondaryColor: item.secondaryColor?.toLowerCase() || null, material: (item.material || '').trim(), pattern: (item.pattern || '').trim(), brand: (item.brand || '').trim(), tags: norm(item.tags || []) });
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
      slot.innerHTML = `<div class="color-slot-heading"><span>${label}</span><small>${t('field.optional')}</small></div><p>${t('field.noSecondary')}</p>`;
      const add = document.createElement('button');
      add.className = 'add-secondary-button';
      add.type = 'button';
      add.textContent = t('field.addSecondary');
      add.addEventListener('click', () => { draft.secondaryColor = palette.find((c) => c.toLowerCase() !== draft.color?.toLowerCase()) || '#9a9286'; render(); });
      slot.appendChild(add);
      return slot;
    }
    const heading = document.createElement('div');
    heading.className = 'color-slot-heading';
    heading.innerHTML = `<span>${label}</span>`;
    if (optional) {
      const rm = document.createElement('button');
      rm.type = 'button'; rm.textContent = t('field.remove');
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
    sh.innerHTML = `<span>${t('field.suggestions')}</span><small>${t('field.applyTip')}</small>`;
    slot.appendChild(sh);

    const pal = document.createElement('div');
    pal.className = 'palette' + (field === 'primary' ? ' palette-primary' : '');
    slot.appendChild(pal);
    renderPalette(pal, field);

    const sampleBtn = document.createElement('button');
    sampleBtn.className = 'sample-button' + (sampling === field ? ' active' : '');
    sampleBtn.type = 'button';
    sampleBtn.textContent = sampling === field ? t('field.cancelPick') : t('field.pickFrom', label);
    sampleBtn.addEventListener('click', () => { sampling = sampling === field ? null : field; render(); });
    slot.appendChild(sampleBtn);
    return slot;
  }

  function buildEditor() {
    const wrap = document.createElement('div');
    wrap.className = 'item-editor';

    const nameField = document.createElement('label');
    nameField.className = 'field';
    nameField.innerHTML = `<span>${t('field.name')}</span>`;
    const nameInput = document.createElement('input');
    nameInput.value = draft.name;
    nameInput.placeholder = singular;
    nameInput.addEventListener('input', (e) => { draft.name = e.target.value; });
    nameField.appendChild(nameInput);
    wrap.appendChild(nameField);

    const catField = document.createElement('label');
    catField.className = 'field';
    catField.innerHTML = `<span>${t('field.category')}</span>`;
    const sel = document.createElement('select');
    for (const id of TYPE_IDS.slice(1)) {
      const o = document.createElement('option');
      o.value = id; o.textContent = typeLabel(id);
      if (draft.part === id) o.selected = true;
      sel.appendChild(o);
    }
    sel.addEventListener('change', (e) => { draft.part = e.target.value; });
    catField.appendChild(sel);
    wrap.appendChild(catField);

    const colorField = document.createElement('fieldset');
    colorField.className = 'color-field';
    colorField.innerHTML = `<legend>${t('colors.legend')}</legend>`;
    const editor = document.createElement('div');
    editor.className = 'colors-editor';
    editor.appendChild(colorControl(t('field.primary'), 'primary', false));
    editor.appendChild(colorControl(t('field.secondary'), 'secondary', true));
    colorField.appendChild(editor);
    const help = document.createElement('p');
    help.className = 'color-help';
    help.textContent = sampling ? t('field.sampleHint', sampling === 'secondary' ? t('field.secondary') : t('field.primary')) : t('field.colorHelp');
    colorField.appendChild(help);
    wrap.appendChild(colorField);

    const materialField = document.createElement('label');
    materialField.className = 'field';
    materialField.innerHTML = `<span>${t('field.material')}</span>`;
    const materialInput = document.createElement('input');
    materialInput.value = draft.material;
    materialInput.placeholder = t('field.materialPh');
    materialInput.setAttribute('list', 'material-options');
    materialInput.addEventListener('input', (e) => { draft.material = e.target.value; });
    materialField.appendChild(materialInput);
    wrap.appendChild(materialField);

    const patternField = document.createElement('label');
    patternField.className = 'field';
    patternField.innerHTML = `<span>${t('field.pattern')}</span>`;
    const patternInput = document.createElement('input');
    patternInput.value = draft.pattern;
    patternInput.placeholder = t('field.patternPh');
    patternInput.setAttribute('list', 'pattern-options');
    patternInput.addEventListener('input', (e) => { draft.pattern = e.target.value; });
    patternField.appendChild(patternInput);
    wrap.appendChild(patternField);

    const brandField = document.createElement('label');
    brandField.className = 'field';
    brandField.innerHTML = `<span>${t('field.brand')}</span>`;
    const brandInput = document.createElement('input');
    brandInput.value = draft.brand;
    brandInput.placeholder = t('field.brandPh');
    brandInput.addEventListener('input', (e) => { draft.brand = e.target.value; });
    brandField.appendChild(brandInput);
    wrap.appendChild(brandField);

    const detailsField = document.createElement('div');
    detailsField.className = 'field details-field';
    detailsField.innerHTML = `<span>${t('field.details')}</span>`;
    detailsField.appendChild(buildTagEditor(draft));
    wrap.appendChild(detailsField);

    const detectedStyles = matchStyles({ name: draft.name, material: draft.material, pattern: draft.pattern, brand: draft.brand, color: draft.color, secondaryColor: draft.secondaryColor, tags: draft.tags });
    if (detectedStyles.length) {
      const styleField = document.createElement('div');
      styleField.className = 'field';
      styleField.innerHTML = `<span>${t('field.detectedStyle')}</span>`;
      const chips = document.createElement('div');
      chips.className = 'look-detail-tags';
      for (const s of detectedStyles) {
        const chip = document.createElement('span');
        chip.className = 'detail-chip';
        chip.textContent = s.matchedBrand ? `${s.name} · ${s.matchedBrand.name}` : s.name;
        chips.appendChild(chip);
      }
      styleField.appendChild(chips);
      wrap.appendChild(styleField);
    }

    const notice = document.createElement('p');
    notice.className = 'unsaved-notice hidden';
    wrap.appendChild(notice);

    const actions = document.createElement('div');
    actions.className = 'viewer-actions';
    const del = document.createElement('button');
    del.className = 'delete-button';
    del.type = 'button';
    del.innerHTML = icon('trash', 15) + ' ' + t('btn.delete');
    del.addEventListener('click', () => deleteItem(item.id));
    const spacer = document.createElement('span');
    spacer.className = 'action-spacer';
    const cancel = document.createElement('button');
    cancel.className = 'secondary-button';
    cancel.type = 'button';
    cancel.textContent = t('btn.close');
    cancel.addEventListener('click', closeViewer);
    function persistDraft() {
      Object.assign(item, {
        name: draft.name.trim(), part: draft.part, color: draft.color, secondaryColor: draft.secondaryColor,
        material: draft.material.trim() || null, pattern: draft.pattern.trim() || null, brand: draft.brand.trim() || null,
        tags: draft.tags.map((x) => x.trim()).filter(Boolean),
      });
      store.save('items', state.items);
      renderGallery();
      renderCategoryNav();
    }
    const save = document.createElement('button');
    save.className = 'primary-button';
    save.type = 'button';
    save.innerHTML = icon('check', 15) + ' ' + t('btn.save');
    save.addEventListener('click', () => { persistDraft(); closeViewer(); });

    const regen = document.createElement('button');
    regen.className = 'secondary-button';
    regen.type = 'button';
    regen.innerHTML = icon('wand', 15) + ' ' + t('btn.regenerate');
    regen.addEventListener('click', async () => {
      if (!item.cropKey) { notify(t('regen.unavailable')); return; }
      if (!state.settings.openaiKey) { openSettings(); return; }
      const cost = item.modeledKey ? 2 : 1;
      if (!hasUsageFor(cost)) { notify(t('err.limit', state.settings.usageLimit)); return; }
      if (!confirm(t('regen.confirm', cost))) return;
      persistDraft();
      const original = regen.innerHTML;
      regen.disabled = true; save.disabled = true; del.disabled = true;
      regen.innerHTML = `<span class="import-spinner">${icon('spinner', 15)}</span> ` + t('regen.working');
      try {
        await regenerateItem(item);
        notify(t('regen.done'));
        openViewer(item.id);
      } catch (e) {
        notify(e.message);
        regen.disabled = false; save.disabled = false; del.disabled = false;
        regen.innerHTML = original;
      }
    });

    actions.append(del, spacer, cancel, regen, save);
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
  input.placeholder = t('field.addDetail');
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
    if (item.cropKey) { imageStore.delete(item.cropKey); imageCache.delete(item.cropKey); }
  }
  state.items = state.items.filter((i) => i.id !== id);
  store.save('items', state.items);
  closeViewer();
  renderCategoryNav();
}

// Generiert Freisteller (und, falls vorhanden, Model-Foto) mit den aktuellen
// Metadaten (v.a. manuell korrigiertem Material/Muster) aus dem gespeicherten
// Zuschnitt neu. Wirft bei Fehlern, damit der Aufrufer den Button zurücksetzen kann.
async function regenerateItem(item) {
  const cropImage = await imageStore.get(item.cropKey);
  if (!cropImage) throw new Error(t('regen.unavailable'));

  const chromaKey = ai.chooseChromaKey(item.color);
  const prompt = ai.buildGarmentPrompt(
    { name: item.name, part: item.part, color: item.color, secondaryColor: item.secondaryColor, material: item.material, pattern: item.pattern, tags: item.tags },
    chromaKey,
  );
  const raw = await ai.openAIEdit({ key: state.settings.openaiKey, model: state.settings.imageModel, prompt, images: [cropImage], size: '1024x1024' });
  bumpUsage();
  const result = await ai.processChromaBackground(raw, chromaKey, {});
  await imageStore.put(item.imageKey, result.dataUrl);
  imageCache.set(item.imageKey, result.dataUrl);

  if (item.modeledKey) {
    const modelRef = await imageStore.get('model-reference');
    const isPlainPattern = !item.pattern || /^(uni|einfarbig|solid|plain)/i.test(item.pattern);
    const detail = [item.material ? `${item.material} fabric` : null, !isPlainPattern ? `${item.pattern} pattern` : null].filter(Boolean).join(' and ');
    const companion = pickCompanion(item);
    const companionImage = companion ? await cacheImage(companion.imageKey) : null;
    let prompt2, images2;
    if (companionImage) {
      prompt2 = ai.buildFeaturedPairPrompt(item.name || typeSingular(item.part), companion.name || typeSingular(companion.part));
      images2 = [modelRef, result.dataUrl, companionImage];
    } else {
      prompt2 = ai.MODELED_PROMPT;
      images2 = [modelRef, result.dataUrl];
    }
    prompt2 += detail ? `\nMake sure the garment's ${detail} is clearly visible and accurately rendered.` : '';
    const modeled = await ai.openAIEdit({ key: state.settings.openaiKey, model: state.settings.imageModel, prompt: prompt2, images: images2, size: '1024x1536' });
    bumpUsage();
    await imageStore.put(item.modeledKey, modeled);
    imageCache.set(item.modeledKey, modeled);
  }

  store.save('items', state.items);
  renderGallery();
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
  $('#tray-label').textContent = jobs.length ? statusText(active) : t('tray.add');
  const tray = $('#import-tray');
  tray.classList.toggle('is-expanded', jobs.length > 0);
}

function statusText(job) {
  switch (job?.stage) {
    case 'analyzing': return t('status.analyzing');
    case 'crop-review': return t('status.crop');
    case 'garment-processing': return t('status.garmentProc');
    case 'garment-review': return t('status.garmentReview');
    case 'modeled-processing': return t('status.modeledProc');
    case 'modeled-review': return t('status.modeledReview');
    case 'error': return t('status.error');
    default: return t('tray.add');
  }
}

$('#tray-button').addEventListener('click', () => openImport());
$('#tray-upload').addEventListener('click', () => $('#import-input').click());
$('#tray-auto').addEventListener('click', () => $('#import-input-auto').click());
$('#import-close').addEventListener('click', closeImport);
$('#import-input').addEventListener('change', (e) => { submitFiles(e.target.files); e.target.value = ''; });
$('#import-input-auto').addEventListener('change', (e) => { submitFiles(e.target.files, { auto: true }); e.target.value = ''; });
$('#import-backdrop').addEventListener('mousedown', (e) => { if (e.target === $('#import-backdrop')) closeImport(); });

function openImport() { importOpen = true; $('#import-backdrop').dataset.open = 'true'; renderImport(); }
function closeImport() { importOpen = false; $('#import-backdrop').dataset.open = 'false'; }

function requireSetup() {
  if (!state.settings.openaiKey) { openSettings(); return false; }
  if (!state.hasModelReference) { openSettings(); return false; }
  return true;
}

async function submitFiles(files, opts = {}) {
  const auto = !!opts.auto;
  const images = [...files].filter((f) => f.type.startsWith('image/'));
  if (!images.length) return;
  if (!requireSetup()) return;
  openImport();
  for (const file of images) {
    const dataUrl = await new Promise((res) => { const r = new FileReader(); r.onload = () => res(r.result); r.readAsDataURL(file); });
    await analyzeAndQueue(dataUrl, auto);
  }
}

// auto=true: jedes erkannte Teil durchläuft Zuschnitt→Freisteller→Model-Foto automatisch
// (siehe Auto-Verkettung am Ende von advanceCrop/approveGarment), ohne Einzel-Bestätigung.
async function analyzeAndQueue(dataUrl, auto = false) {
  const pending = { id: uid(), stage: 'analyzing' };
  jobs.push(pending);
  renderTrayButton(); renderImport();
  try {
    const normalized = await ai.normalizeImage(dataUrl, 1280);
    const detected = await ai.openAIAnalyze({ key: state.settings.openaiKey, model: state.settings.visionModel, imageDataUrl: normalized });
    jobs.splice(jobs.indexOf(pending), 1);
    if (!detected.length) { showImportError(t('err.noClothing')); renderTrayButton(); renderImport(); return; }
    for (const meta of detected) {
      const crop = await ai.cropDetectedItem(normalized, meta.boundingBox);
      const job = { id: uid(), stage: 'crop-review', metadata: meta, original: normalized, cropImage: crop, auto, originalBoundingBox: { ...meta.boundingBox } };
      jobs.push(job);
      renderTrayButton(); renderImport();
      if (auto) await advanceCrop(job);
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
  if (!state.settings.geminiKey) { showImportError(t('err.needGemini')); return; }
  const status = $('#import-link-status');
  $('#import-link-add').disabled = true;
  status.innerHTML = `<span class="import-spinner">${icon('spinner', 14)}</span> ${t('link.analyzing')}`;
  status.classList.remove('hidden');
  try {
    const info = await analyzeShopUrl({ apiKey: state.settings.geminiKey, link });
    const item = {
      id: uid(),
      name: info.name || 'Neues Teil',
      part: info.part || 'upperbody',
      color: info.color || '#c8c8c8',
      secondaryColor: null,
      brand: info.brand || null,
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
    showImportError(t('link.imported', item.name));
  } catch (e) { showImportError(e.message); }
  finally {
    $('#import-link-add').disabled = false;
    status.classList.add('hidden');
    status.innerHTML = '';
  }
});

async function advanceCrop(job) {
  if (!canGenerate()) return;
  job.stage = 'garment-processing';
  renderTrayButton(); renderImport();
  try {
    const chromaKey = ai.chooseChromaKey(job.metadata.color);
    const prompt = ai.buildGarmentPrompt(job.metadata, chromaKey) + (job.regenDirection ? `\nUser regeneration direction: ${job.regenDirection}` : '');
    const raw = await ai.openAIEdit({ key: state.settings.openaiKey, model: state.settings.imageModel, prompt, images: [job.cropImage], size: '1024x1024' });
    bumpUsage();
    job.garmentSource = raw;
    job.chromaKey = chromaKey;
    const result = await ai.processChromaBackground(raw, chromaKey, {});
    job.garmentImage = result.dataUrl;
    job.cleanupTolerance = result.tolerance;
    job.cleanupContaminated = result.contaminatedPixels;
    job.stage = 'garment-review';
  } catch (e) { job.stage = 'error'; job.error = e.message; }
  renderTrayButton(); renderImport();
  if (job.auto && job.stage === 'garment-review') await approveGarment(job);
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

// Sucht das best-passende andere Teil aus dem Kleiderschrank (per Stil-Bewertung,
// nicht zufällig), damit das Model-Foto ein echtes, plausibles Outfit zeigt statt
// generischer "neutraler" Begleitkleidung. Liefert null, wenn (noch) nichts passt.
function pickCompanion(item) {
  const candidateParts = COMPANION_PARTS[item.part];
  if (!candidateParts) return null;
  const candidates = state.items.filter((i) => i.id !== item.id && i.imageKey && candidateParts.includes(i.part));
  if (!candidates.length) return null;
  let best = null, bestScore = -1;
  for (const candidate of candidates) {
    const pairItems = [
      { type: ADVISOR_TYPE[item.part] || 'tshirt', color: item.color },
      { type: ADVISOR_TYPE[candidate.part] || 'tshirt', color: candidate.color },
    ];
    const { score } = analyzeOutfit(pairItems, DEFAULT_PROFILE_FOR_ADVICE, state.rules);
    if (score > bestScore) { bestScore = score; best = candidate; }
  }
  return best;
}

async function approveGarment(job) {
  // Teil in den Kleiderschrank aufnehmen (Freisteller)
  const itemId = uid();
  const imageKey = `garment-${itemId}`;
  await imageStore.put(imageKey, job.garmentImage);
  imageCache.set(imageKey, job.garmentImage);
  // Zuschnitt aufheben, damit man Material/Muster später korrigieren und neu generieren kann
  const cropKey = `crop-${itemId}`;
  await imageStore.put(cropKey, job.cropImage);
  imageCache.set(cropKey, job.cropImage);
  const item = {
    id: itemId,
    name: job.metadata.name,
    part: job.metadata.part,
    color: job.metadata.color,
    secondaryColor: job.metadata.secondaryColor,
    material: job.metadata.material || null,
    pattern: job.metadata.pattern || null,
    brand: job.metadata.brand || null,
    tags: job.metadata.tags,
    imageKey,
    modeledKey: null,
    cropKey,
    palette: [job.metadata.color, job.metadata.secondaryColor].filter(Boolean),
  };
  state.items.unshift(item);
  store.save('items', state.items);
  renderGallery(); renderCategoryNav();
  job.itemId = itemId;
  // Limit erreicht? Teil bleibt im Schrank (Freisteller), Model-Foto entfällt.
  if (!canGenerate()) { removeJob(job); return; }
  job.stage = 'modeled-processing';
  renderTrayButton(); renderImport();
  // Model-Foto erzeugen – mit einem echten, gut passenden Kleiderschrank-Teil
  // kombinieren statt generischer "neutraler" Begleitkleidung, sobald eins existiert.
  try {
    const modelRef = await imageStore.get('model-reference');
    const companion = pickCompanion(item);
    const companionImage = companion ? await cacheImage(companion.imageKey) : null;
    let prompt, images;
    if (companionImage) {
      prompt = ai.buildFeaturedPairPrompt(item.name || typeSingular(item.part), companion.name || typeSingular(companion.part));
      images = [modelRef, job.garmentImage, companionImage];
      job.companionName = companion.name;
    } else {
      prompt = ai.MODELED_PROMPT;
      images = [modelRef, job.garmentImage];
      job.companionName = null;
    }
    prompt += job.modeledDirection ? `\nUser regeneration direction: ${job.modeledDirection}` : '';
    const modeled = await ai.openAIEdit({ key: state.settings.openaiKey, model: state.settings.imageModel, prompt, images, size: '1024x1536' });
    bumpUsage();
    job.modeledImage = modeled;
    job.stage = 'modeled-review';
  } catch (e) { job.stage = 'modeled-error'; job.error = e.message; }
  renderTrayButton(); renderImport();
  if (job.auto && job.stage === 'modeled-review') await approveModeled(job);
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
  title.textContent = reviewing ? t('import.title.ready', reviewing) : jobs.some((j) => j.stage === 'error') ? t('import.title.attention') : jobs.length ? t('import.title.preparing') : t('import.title.default');

  body.innerHTML = '';
  if (!jobs.length) {
    body.innerHTML = `<div class="import-drop-target">${icon('upload', 28)}<h2>${t('import.empty.title')}</h2><p>${t('import.empty.sub')}</p></div>`;
    const target = body.querySelector('.import-drop-target');
    const btnRow = document.createElement('div');
    btnRow.className = 'import-empty-actions';
    const choose = document.createElement('button');
    choose.className = 'import-button import-button--primary';
    choose.textContent = t('import.choose');
    choose.addEventListener('click', () => $('#import-input').click());
    const auto = document.createElement('button');
    auto.className = 'import-button';
    auto.innerHTML = icon('wand', 14) + ' ' + t('import.auto');
    auto.addEventListener('click', () => $('#import-input-auto').click());
    btnRow.append(choose, auto);
    target.appendChild(btnRow);
    const hint = document.createElement('p');
    hint.className = 'import-auto-hint';
    hint.textContent = t('import.auto.hint');
    target.appendChild(hint);
    return;
  }

  const reviewJob = jobs.find((j) => ['crop-review', 'garment-review', 'modeled-review'].includes(j.stage)) || jobs[jobs.length - 1];

  if (jobs.some((j) => j.stage.endsWith('-processing') || j.stage === 'analyzing')) {
    const prog = document.createElement('div');
    prog.className = 'import-progress';
    prog.innerHTML = `<div class="import-progress__meta"><span>${statusText(jobs[jobs.length - 1])}</span><span>${t('pieces', jobs.length)}</span></div><div class="import-progress__track"><div class="import-progress__bar"></div></div>`;
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
  another.innerHTML = icon('plus', 14) + ' ' + t('import.another');
  another.addEventListener('click', () => $('#import-input').click());
  actions.appendChild(another);
  const anotherAuto = document.createElement('button');
  anotherAuto.className = 'import-button';
  anotherAuto.innerHTML = icon('wand', 14) + ' ' + t('import.auto');
  anotherAuto.addEventListener('click', () => $('#import-input-auto').click());
  actions.appendChild(anotherAuto);
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

// Interaktiver Zuschnitt-Editor: Rahmen per Ziehen verschieben, per Eckgriffen
// vergrößern/verkleinern. Arbeitet direkt auf der 0-1000-Boundingbox-Skala und
// ruft zur Vorschau nur die bestehende, kostenlose ai.cropDetectedItem() erneut auf.
function buildCropEditor(job) {
  const wrap = document.createElement('div');
  wrap.className = 'crop-editor';

  const stage = document.createElement('div');
  stage.className = 'crop-editor__stage';
  const img = document.createElement('img');
  img.className = 'crop-editor__image';
  img.src = job.original;
  img.alt = '';
  img.draggable = false;
  stage.appendChild(img);

  const boxEl = document.createElement('div');
  boxEl.className = 'crop-editor__box';
  for (const corner of ['nw', 'ne', 'sw', 'se']) {
    const handle = document.createElement('span');
    handle.className = `crop-handle crop-handle--${corner}`;
    handle.dataset.corner = corner;
    boxEl.appendChild(handle);
  }
  stage.appendChild(boxEl);
  wrap.appendChild(stage);

  const row = document.createElement('div');
  row.className = 'crop-editor__row';
  const hint = document.createElement('p');
  hint.className = 'crop-editor__hint';
  hint.textContent = t('review.cropDragHint');
  row.appendChild(hint);

  const resultBox = document.createElement('div');
  resultBox.className = 'crop-editor__result';
  const resultLabel = document.createElement('span');
  resultLabel.textContent = t('review.cropResult');
  const resultImg = document.createElement('img');
  resultImg.src = job.cropImage;
  resultBox.append(resultLabel, resultImg);
  row.appendChild(resultBox);
  wrap.appendChild(row);

  const actions = document.createElement('div');
  actions.className = 'crop-editor__actions';
  const reset = document.createElement('button');
  reset.type = 'button';
  reset.className = 'import-button';
  reset.innerHTML = icon('retry', 14) + ' ' + t('btn.reset');
  reset.addEventListener('click', () => {
    job.metadata.boundingBox = { ...job.originalBoundingBox };
    updateBoxStyle();
    scheduleRecrop();
  });
  actions.appendChild(reset);
  wrap.appendChild(actions);

  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  function updateBoxStyle() {
    const b = job.metadata.boundingBox;
    boxEl.style.left = (b.x / 10) + '%';
    boxEl.style.top = (b.y / 10) + '%';
    boxEl.style.width = (b.width / 10) + '%';
    boxEl.style.height = (b.height / 10) + '%';
  }
  updateBoxStyle();

  let recropTimer = null;
  function scheduleRecrop() {
    clearTimeout(recropTimer);
    recropTimer = setTimeout(async () => {
      try {
        job.cropImage = await ai.cropDetectedItem(job.original, job.metadata.boundingBox);
        resultImg.src = job.cropImage;
      } catch { /* letzte Vorschau beibehalten, falls das Zuschneiden fehlschlägt */ }
    }, 200);
  }

  boxEl.addEventListener('pointerdown', (e) => {
    if (e.target !== boxEl) return;
    e.preventDefault();
    const rect = stage.getBoundingClientRect();
    const startX = e.clientX, startY = e.clientY;
    const start = { ...job.metadata.boundingBox };
    boxEl.setPointerCapture(e.pointerId);
    const onMove = (ev) => {
      const dx = ((ev.clientX - startX) / rect.width) * 1000;
      const dy = ((ev.clientY - startY) / rect.height) * 1000;
      const b = job.metadata.boundingBox;
      b.x = Math.round(clamp(start.x + dx, 0, 1000 - b.width));
      b.y = Math.round(clamp(start.y + dy, 0, 1000 - b.height));
      updateBoxStyle();
    };
    const onUp = () => {
      boxEl.releasePointerCapture(e.pointerId);
      boxEl.removeEventListener('pointermove', onMove);
      boxEl.removeEventListener('pointerup', onUp);
      scheduleRecrop();
    };
    boxEl.addEventListener('pointermove', onMove);
    boxEl.addEventListener('pointerup', onUp);
  });

  boxEl.querySelectorAll('.crop-handle').forEach((handle) => {
    handle.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const corner = handle.dataset.corner;
      const rect = stage.getBoundingClientRect();
      const startX = e.clientX, startY = e.clientY;
      const start = { ...job.metadata.boundingBox };
      const minSize = 40;
      handle.setPointerCapture(e.pointerId);
      const onMove = (ev) => {
        const dx = ((ev.clientX - startX) / rect.width) * 1000;
        const dy = ((ev.clientY - startY) / rect.height) * 1000;
        let { x, y, width, height } = start;
        if (corner.includes('w')) {
          const newX = clamp(start.x + dx, 0, start.x + start.width - minSize);
          width = start.x + start.width - newX;
          x = newX;
        }
        if (corner.includes('e')) width = clamp(start.width + dx, minSize, 1000 - start.x);
        if (corner.includes('n')) {
          const newY = clamp(start.y + dy, 0, start.y + start.height - minSize);
          height = start.y + start.height - newY;
          y = newY;
        }
        if (corner.includes('s')) height = clamp(start.height + dy, minSize, 1000 - start.y);
        const b = job.metadata.boundingBox;
        b.x = Math.round(x); b.y = Math.round(y); b.width = Math.round(width); b.height = Math.round(height);
        updateBoxStyle();
      };
      const onUp = () => {
        handle.releasePointerCapture(e.pointerId);
        handle.removeEventListener('pointermove', onMove);
        handle.removeEventListener('pointerup', onUp);
        scheduleRecrop();
      };
      handle.addEventListener('pointermove', onMove);
      handle.addEventListener('pointerup', onUp);
    });
  });

  return wrap;
}

function buildReviewEditor(job) {
  const wrap = document.createElement('div');
  wrap.className = 'import-editor' + (job.stage === 'crop-review' ? ' import-editor--crop' : '');
  if (job.stage === 'crop-review') {
    wrap.appendChild(buildCropEditor(job));
  } else {
    const preview = document.createElement('img');
    preview.className = 'import-editor__preview';
    preview.src = job.stage === 'garment-review' ? job.garmentImage : job.modeledImage;
    wrap.appendChild(preview);
  }

  const fields = document.createElement('div');
  fields.className = 'import-fields';
  const stageLabel = document.createElement('p');
  stageLabel.className = 'import-editor__stage';
  stageLabel.textContent = job.stage === 'crop-review' ? t('stage.crop') : job.stage === 'garment-review' ? t('stage.garment') : t('stage.modeled');
  fields.appendChild(stageLabel);

  if (job.stage === 'crop-review') {
    const p = document.createElement('p');
    p.className = 'import-card__detail';
    p.textContent = t('review.cropHint');
    fields.appendChild(p);
  } else if (job.stage === 'garment-review') {
    fields.appendChild(metaField('Name', 'text', job.metadata.name, (v) => { job.metadata.name = v; }));
    fields.appendChild(metaSelect(t('field.category'), job.metadata.part, (v) => { job.metadata.part = v; }));
    fields.appendChild(metaColor(t('field.primary'), job.metadata.color, (v) => { job.metadata.color = v; }));
    fields.appendChild(metaField(t('field.secondaryOpt'), 'text', job.metadata.secondaryColor || '', (v) => { job.metadata.secondaryColor = /^#[0-9a-f]{6}$/i.test(v) ? v : null; }, t('field.secondaryPh')));
    fields.appendChild(metaField(t('field.material'), 'text', job.metadata.material || '', (v) => { job.metadata.material = v.trim() || null; }, t('field.materialPh'), 'material-options'));
    fields.appendChild(metaField(t('field.pattern'), 'text', job.metadata.pattern || '', (v) => { job.metadata.pattern = v.trim() || null; }, t('field.patternPh'), 'pattern-options'));
    fields.appendChild(metaField(t('field.brand'), 'text', job.metadata.brand || '', (v) => { job.metadata.brand = v.trim() || null; }, t('field.brandPh')));
    fields.appendChild(metaField(t('field.details'), 'text', (job.metadata.tags || []).join(', '), (v) => { job.metadata.tags = v.split(',').map((x) => x.trim().toLowerCase()).filter(Boolean); }, t('field.detailsPh')));
    if (job.cleanupContaminated > 1) fields.appendChild(buildCleanupControl(job));
    fields.appendChild(regenField(t('field.regen'), job.regenDirection || '', (v) => { job.regenDirection = v; }, t('field.regenGarmentPh')));
  } else {
    const p = document.createElement('p');
    p.className = 'import-card__detail';
    p.textContent = job.companionName ? t('review.modeledHint.companion', job.companionName) : t('review.modeledHint');
    fields.appendChild(p);
    fields.appendChild(regenField(t('field.regen'), job.modeledDirection || '', (v) => { job.modeledDirection = v; }, t('field.regenModeledPh')));
  }

  const actions = document.createElement('div');
  actions.className = 'import-actions';
  const reject = document.createElement('button');
  reject.className = 'import-button';
  reject.innerHTML = icon('trash', 14) + ' ' + t('btn.discard');
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
  approve.addEventListener('click', async () => {
    if (job.stage === 'crop-review') {
      // Letzten manuell angepassten Rahmen sicher übernehmen, unabhängig vom
      // Debounce der Live-Vorschau im Zuschnitt-Editor.
      try { job.cropImage = await ai.cropDetectedItem(job.original, job.metadata.boundingBox); } catch { /* letzte Vorschau nutzen */ }
      advanceCrop(job);
    } else if (job.stage === 'garment-review') approveGarment(job);
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

function metaField(label, type, value, onInput, placeholder, listId) {
  const f = document.createElement('div');
  f.className = 'import-field';
  f.innerHTML = `<label>${label}</label>`;
  const input = document.createElement('input');
  input.type = type; input.value = value; if (placeholder) input.placeholder = placeholder;
  if (listId) input.setAttribute('list', listId);
  input.addEventListener('input', (e) => onInput(e.target.value));
  f.appendChild(input);
  return f;
}
function metaSelect(label, value, onChange) {
  const f = document.createElement('div');
  f.className = 'import-field';
  f.innerHTML = `<label>${label}</label>`;
  const sel = document.createElement('select');
  for (const id of TYPE_IDS.slice(1)) { const o = document.createElement('option'); o.value = id; o.textContent = typeLabel(id); if (value === id) o.selected = true; sel.appendChild(o); }
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
const DEFAULT_PROFILE_FOR_ADVICE = { hair: '#3b2a1e', eyes: '#4a6b8a' };

// Überlappende Kleinvorschau mehrerer Teile (Vorschlags-Karten + Hover-Preview)
function buildPieceCollage(imgSrcs) {
  const wrap = document.createElement('div');
  wrap.className = 'piece-collage';
  imgSrcs.slice(0, 3).forEach((src, i) => {
    const img = document.createElement('img');
    img.src = src;
    img.style.setProperty('--i', i);
    wrap.appendChild(img);
  });
  return wrap;
}

// Einfache, regelbasierte Stil-Tags aus der Teile-Zusammensetzung (kostenlos, ohne KI)
function deriveLookTags(items) {
  const tags = [];

  // Stilrichtungen aus der Wissensdatenbank über alle Teile aggregieren (kostenlos,
  // ohne KI-Aufruf) und die stärksten als benannte Stil-Tags voranstellen.
  const totals = new Map();
  for (const item of items) {
    for (const match of matchStyles(item)) totals.set(match.name, (totals.get(match.name) || 0) + match.score);
  }
  for (const [name] of [...totals.entries()].sort((a, b) => b[1] - a[1]).slice(0, 2)) tags.push('style:' + name);

  const has = (part) => items.some((i) => i.part === part);
  if (tags.length < 3 && has('wholebody_up')) tags.push('layered');
  if (tags.length < 3 && has('accessories_up')) tags.push('statement');
  if (tags.length < 3 && items.every((i) => isNeutral(i.color))) tags.push('minimal');
  if (tags.length < 3 && has('lowerbody') && items.some((i) => i.part === 'lowerbody' && /short/i.test(i.name || ''))) tags.push('sportlich');
  if (!tags.length) tags.push('casual');
  return [...new Set(tags)].slice(0, 3);
}

// Bewertung + Tags aus den aktuellen Teile-Daten – kostenlos (keine KI-Anfrage),
// dient sowohl als Beschreibungstext für neu gespeicherte Looks als auch als
// Fallback für ältere Looks, die noch keine gespeicherte Beschreibung haben.
function describeLook(items) {
  const advisorItems = items.map((i) => ({ type: ADVISOR_TYPE[i.part] || 'tshirt', color: i.color }));
  const { score, text } = analyzeOutfit(advisorItems, DEFAULT_PROFILE_FOR_ADVICE, state.rules);
  const tags = deriveLookTags(items);
  // Kleiner Bonus, wenn die Teile erkennbar zu einer benannten Stilrichtung passen
  // (aus der Wissensdatenbank) – belohnt stilistisch stimmige Kombinationen zusätzlich
  // zur reinen Farbharmonie.
  const coherenceBonus = tags.some((tag) => tag.startsWith('style:')) ? 4 : 0;
  return { description: text, score: Math.min(98, score + coherenceBonus), tags };
}

const MAX_SUGGESTIONS = 6;
const MAX_SUGGESTION_COMBOS = 3000; // Sicherheitsdeckel für sehr große Kleiderschränke

// Berechnet plausible Outfit-Kombinationen rein lokal (kein KI-Aufruf) und
// bewertet sie mit dem bestehenden Stilberater, damit ohne jeden Filter schon
// passende Vorschläge angezeigt werden können.
function computeSuggestions(maxSuggestions = MAX_SUGGESTIONS) {
  const tops = state.items.filter((i) => i.part === 'upperbody');
  const jackets = state.items.filter((i) => i.part === 'wholebody_up');
  const bottoms = state.items.filter((i) => i.part === 'lowerbody');
  const shoes = state.items.filter((i) => i.part === 'shoes');
  if (!tops.length || !bottoms.length) return [];

  let n = 0;
  const combos = [];
  outer:
  for (const top of tops) {
    for (const bottom of bottoms) {
      combos.push([top, bottom]);
      if (jackets.length) combos.push([top, bottom, jackets[n % jackets.length]]);
      if (shoes.length) combos.push([top, bottom, shoes[n % shoes.length]]);
      n++;
      if (combos.length >= MAX_SUGGESTION_COMBOS) break outer;
    }
  }

  const seen = new Set();
  const scored = [];
  for (const combo of combos) {
    const key = combo.map((i) => i.id).sort().join('|');
    if (seen.has(key)) continue;
    seen.add(key);
    const { description, score } = describeLook(combo);
    scored.push({ itemIds: combo.map((i) => i.id), items: combo, score, text: description });
  }
  scored.sort((a, b) => b.score - a.score);

  // Vielfalt: dieselbe Ober-/Unterteil-Paarung nicht mehrfach unter den Top-Vorschlägen zeigen
  const picked = [];
  const usedPairs = new Set();
  for (const combo of scored) {
    const pairKey = [combo.itemIds[0], combo.itemIds[1]].sort().join('|');
    if (usedPairs.has(pairKey)) continue;
    usedPairs.add(pairKey);
    picked.push(combo);
    if (picked.length >= maxSuggestions) break;
  }
  for (const combo of scored) {
    if (picked.length >= maxSuggestions) break;
    if (!picked.includes(combo)) picked.push(combo);
  }
  return picked;
}

function applySuggestion(suggestion) {
  lookSelection.clear();
  suggestion.itemIds.forEach((id) => lookSelection.add(id));
  renderLooks();
  const box = $('#look-advice');
  box.textContent = t('looks.suggestPicked') + ' ' + t('looks.styleCheck', suggestion.score, suggestion.text);
  box.classList.remove('hidden');
  $('.looks-composer')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

async function renderSuggestions() {
  const grid = $('#suggest-grid');
  const suggestions = computeSuggestions();
  grid.innerHTML = '';
  $('#suggest-empty').classList.toggle('hidden', suggestions.length > 0);
  for (const suggestion of suggestions) {
    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'suggest-card';
    const preview = document.createElement('div');
    preview.className = 'suggest-card-preview';
    const srcs = [];
    for (const item of suggestion.items) { const s = await cacheImage(item.imageKey); if (s) srcs.push(s); }
    preview.appendChild(buildPieceCollage(srcs));
    const body = document.createElement('div');
    body.className = 'suggest-card-body';
    body.innerHTML = `<div class="suggest-card-score">${suggestion.score}/100</div><p class="suggest-card-text">${escapeHtml(suggestion.text)}</p>`;
    card.append(preview, body);
    card.addEventListener('click', () => applySuggestion(suggestion));
    grid.appendChild(card);
  }
}

let lookDetailEl = null;
function closeLookDetail() {
  if (lookDetailEl) { lookDetailEl.remove(); lookDetailEl = null; }
}

async function openLookDetail(look) {
  closeLookDetail();
  const items = look.itemIds.map((id) => state.items.find((i) => i.id === id)).filter(Boolean);
  const meta = (look.description && look.tags) ? { description: look.description, tags: look.tags } : describeLook(items);

  const overlay = document.createElement('div');
  overlay.className = 'viewer-overlay';
  overlay.addEventListener('mousedown', (e) => { if (e.target === overlay) closeLookDetail(); });
  const entry = document.createElement('div');
  entry.className = 'viewer-entry';
  const photoSrc = look.imageKey ? await cacheImage(look.imageKey) : null;
  const aside = document.createElement('aside');
  aside.className = 'viewer' + (photoSrc ? ' has-modeled-image' : '');
  aside.setAttribute('role', 'dialog');
  aside.setAttribute('aria-modal', 'true');

  const close = document.createElement('button');
  close.className = 'viewer-icon-close';
  close.innerHTML = icon('x', 24);
  close.addEventListener('click', closeLookDetail);
  aside.appendChild(close);

  if (photoSrc) {
    const photo = document.createElement('img');
    photo.className = 'look-detail-photo';
    photo.src = photoSrc;
    photo.alt = look.name;
    aside.appendChild(photo);
  }

  const body = document.createElement('div');
  body.className = 'look-detail-body';
  const heading = document.createElement('h2');
  heading.textContent = look.name;
  body.appendChild(heading);
  const desc = document.createElement('p');
  desc.className = 'look-detail-desc';
  desc.textContent = meta.description;
  body.appendChild(desc);

  const tagsRow = document.createElement('div');
  tagsRow.className = 'look-detail-tags';
  for (const tagKey of meta.tags) {
    const chip = document.createElement('span');
    chip.className = 'detail-chip';
    chip.textContent = tagKey.startsWith('style:') ? tagKey.slice(6) : t('tag.' + tagKey);
    tagsRow.appendChild(chip);
  }
  body.appendChild(tagsRow);

  const piecesWrap = document.createElement('div');
  piecesWrap.className = 'look-detail-pieces';
  piecesWrap.innerHTML = `<p class="look-detail-pieces-label">${t('field.details')}</p>`;
  for (const item of items) {
    const chip = document.createElement('span');
    chip.className = 'detail-chip';
    chip.innerHTML = `<span class="dot" style="background:${item.color}"></span>${escapeHtml(item.name)}`;
    piecesWrap.appendChild(chip);
  }
  body.appendChild(piecesWrap);

  const actions = document.createElement('div');
  actions.className = 'viewer-actions';
  const del = document.createElement('button');
  del.className = 'delete-button';
  del.type = 'button';
  del.innerHTML = icon('trash', 15) + ' ' + t('btn.delete');
  del.addEventListener('click', () => {
    if (look.imageKey) { imageStore.delete(look.imageKey); imageCache.delete(look.imageKey); }
    state.looks = state.looks.filter((l) => l.id !== look.id);
    store.save('looks', state.looks);
    closeLookDetail();
    renderLooks();
  });
  const spacer = document.createElement('span');
  spacer.className = 'action-spacer';
  const fav = document.createElement('button');
  fav.className = 'secondary-button';
  fav.innerHTML = icon(look.fav ? 'starFill' : 'star', 15);
  fav.addEventListener('click', () => {
    look.fav = !look.fav;
    store.save('looks', state.looks);
    fav.innerHTML = icon(look.fav ? 'starFill' : 'star', 15);
    renderLooks();
  });
  const regen = document.createElement('button');
  regen.className = 'primary-button';
  regen.innerHTML = icon('wand', 15) + ' ' + t('look.detail.regen');
  regen.addEventListener('click', async () => {
    if (!requireSetup()) return;
    if (!hasUsageFor(1)) { notify(t('err.limit', state.settings.usageLimit)); return; }
    if (!confirm(t('look.detail.regenConfirm'))) return;
    const original = regen.innerHTML;
    regen.disabled = true; del.disabled = true; fav.disabled = true;
    regen.innerHTML = `<span class="import-spinner">${icon('spinner', 15)}</span> ` + t('regen.working');
    try {
      const modelRef = await imageStore.get('model-reference');
      const garments = [];
      for (const item of items) { const g = await cacheImage(item.imageKey); if (g) garments.push(g); }
      const prompt = ai.buildLookPrompt(garments.length, '');
      const result = await ai.openAIEdit({ key: state.settings.openaiKey, model: state.settings.imageModel, prompt, images: [modelRef, ...garments], size: '1024x1536' });
      bumpUsage();
      await imageStore.put(look.imageKey, result);
      imageCache.set(look.imageKey, result);
      store.save('looks', state.looks);
      renderLooks();
      notify(t('regen.done'));
      openLookDetail(look);
    } catch (e) {
      notify(e.message);
      regen.disabled = false; del.disabled = false; fav.disabled = false;
      regen.innerHTML = original;
    }
  });
  actions.append(del, spacer, fav, regen);
  body.appendChild(actions);
  aside.appendChild(body);

  entry.appendChild(aside);
  overlay.appendChild(entry);
  document.body.appendChild(overlay);
  lookDetailEl = overlay;
}

async function renderLooks() {
  await renderSuggestions();

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
    card.tabIndex = 0;
    card.addEventListener('click', () => openLookDetail(look));
    card.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openLookDetail(look); } });

    const media = document.createElement('div');
    media.className = 'look-card-media';
    const src = look.imageKey ? await cacheImage(look.imageKey) : null;
    if (src) { const img = document.createElement('img'); img.src = src; img.alt = look.name; media.appendChild(img); }
    const piecesOverlay = document.createElement('div');
    piecesOverlay.className = 'look-card-pieces';
    const pieceItems = look.itemIds.map((id) => state.items.find((i) => i.id === id)).filter(Boolean);
    const pieceSrcs = [];
    for (const item of pieceItems) { const s = await cacheImage(item.imageKey); if (s) pieceSrcs.push(s); }
    piecesOverlay.appendChild(buildPieceCollage(pieceSrcs));
    media.appendChild(piecesOverlay);
    card.appendChild(media);

    const bodyEl = document.createElement('div');
    bodyEl.className = 'look-card-body';
    const name = document.createElement('span');
    name.className = 'name'; name.textContent = look.name;
    const fav = document.createElement('button');
    fav.className = look.fav ? 'fav' : '';
    fav.innerHTML = icon(look.fav ? 'starFill' : 'star', 17);
    fav.addEventListener('click', (e) => { e.stopPropagation(); look.fav = !look.fav; store.save('looks', state.looks); renderLooks(); });
    const del = document.createElement('button');
    del.innerHTML = icon('trash', 16);
    del.addEventListener('click', (e) => {
      e.stopPropagation();
      if (look.imageKey) { imageStore.delete(look.imageKey); imageCache.delete(look.imageKey); }
      state.looks = state.looks.filter((l) => l.id !== look.id);
      store.save('looks', state.looks);
      renderLooks();
    });
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
  const { score, text } = analyzeOutfit(items, DEFAULT_PROFILE_FOR_ADVICE, state.rules);
  const box = $('#look-advice');
  box.textContent = t('looks.styleCheck', score, text);
  box.classList.remove('hidden');
});

$('#btn-look-generate').addEventListener('click', async () => {
  const items = selectedLookItems();
  if (!items.length) { notify(t('err.pickItems')); return; }
  if (!requireSetup()) return;
  if (!canGenerate()) return;
  const btn = $('#btn-look-generate');
  btn.disabled = true; btn.textContent = t('looks.generating');
  try {
    const modelRef = await imageStore.get('model-reference');
    const garments = [];
    for (const item of items) { const g = await cacheImage(item.imageKey); if (g) garments.push(g); }
    const prompt = ai.buildLookPrompt(garments.length, $('#look-note').value.trim());
    const result = await ai.openAIEdit({ key: state.settings.openaiKey, model: state.settings.imageModel, prompt, images: [modelRef, ...garments], size: '1024x1536' });
    bumpUsage();
    lookResult = result;
    const box = $('#look-result');
    box.classList.remove('hidden');
    box.querySelector('img').src = result;
  } catch (e) { showImportError(e.message); }
  finally { btn.disabled = false; btn.textContent = t('looks.generate'); }
});

$('#btn-look-save').addEventListener('click', async () => {
  if (!lookResult) return;
  const id = uid();
  const imageKey = `look-${id}`;
  await imageStore.put(imageKey, lookResult);
  imageCache.set(imageKey, lookResult);
  const items = selectedLookItems();
  const { description, tags } = describeLook(items);
  const look = { id, name: $('#look-name').value.trim() || t('looks.defaultName'), itemIds: [...lookSelection], imageKey, description, tags, fav: false, createdAt: Date.now() };
  state.looks.unshift(look);
  store.save('looks', state.looks);
  $('#look-name').value = '';
  $('#look-result').classList.add('hidden');
  lookResult = null;
  renderLooks();
});

/* ================= DATENSICHERUNG (Export/Import) ================= */

$('#backup-export-icon').innerHTML = icon('download', 16);
$('#backup-import-icon').innerHTML = icon('upload', 16);

// Sammelt alle Bild-Schlüssel, die aktuell irgendwo referenziert werden
function collectImageKeys() {
  const keys = new Set(['model-reference']);
  for (const item of state.items) {
    if (item.imageKey) keys.add(item.imageKey);
    if (item.modeledKey) keys.add(item.modeledKey);
    if (item.cropKey) keys.add(item.cropKey);
  }
  for (const look of state.looks) {
    if (look.imageKey) keys.add(look.imageKey);
  }
  return [...keys];
}

$('#backup-export').addEventListener('click', async () => {
  const btn = $('#backup-export');
  const original = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = `<span class="import-spinner">${icon('spinner', 16)}</span> ${t('regen.working')}`;
  try {
    const images = {};
    for (const key of collectImageKeys()) {
      const data = await imageStore.get(key);
      if (data) images[key] = data;
    }
    const backup = {
      version: 1,
      exportedAt: new Date().toISOString(),
      lang: getLang(),
      settings: state.settings,
      rules: state.rules,
      usage: state.usage,
      items: state.items,
      looks: state.looks,
      images,
    };
    const blob = new Blob([JSON.stringify(backup)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `wearclothing-backup-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    notify(t('backup.exported'));
  } catch (e) {
    console.warn(e);
    notify(t('backup.exportFailed'));
  } finally {
    btn.disabled = false;
    btn.innerHTML = original;
  }
});

$('#backup-import').addEventListener('click', () => $('#backup-import-input').click());
$('#backup-import-input').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  e.target.value = '';
  if (!file) return;
  try {
    const text = await file.text();
    const data = JSON.parse(text);
    if (!data || typeof data !== 'object' || !Array.isArray(data.items) || typeof data.settings !== 'object') {
      notify(t('backup.invalidFile'));
      return;
    }
    if (!confirm(t('backup.importConfirm'))) return;

    for (const [key, dataUrl] of Object.entries(data.images || {})) {
      await imageStore.put(key, dataUrl);
      imageCache.set(key, dataUrl);
    }
    state.settings = { ...state.settings, ...data.settings };
    state.rules = data.rules || state.rules;
    state.usage = data.usage || state.usage;
    state.items = data.items || [];
    state.looks = data.looks || [];
    store.save('settings', state.settings);
    store.save('rules', state.rules);
    store.save('usage', state.usage);
    store.save('items', state.items);
    store.save('looks', state.looks);
    if (data.lang && data.lang !== getLang()) setLang(data.lang);

    state.hasModelReference = !!(await imageStore.get('model-reference'));
    const prev = $('#set-photo-preview');
    if (state.hasModelReference) { prev.src = await imageStore.get('model-reference'); prev.classList.remove('hidden'); }
    else prev.classList.add('hidden');

    applyTheme(state.settings.theme || currentTheme());
    applyStaticTranslations();
    $('#toggle-lang').textContent = getLang().toUpperCase();
    renderCategoryNav();
    await renderGallery();
    await renderLooks();
    renderTrayButton();
    openSettings(); // Felder (inkl. Schlüssel) mit den wiederhergestellten Werten neu befüllen
    notify(t('backup.imported'));
  } catch (err) {
    console.warn(err);
    notify(t('backup.invalidFile'));
  }
});

/* ================= EINSTELLUNGEN ================= */

function openSettings() {
  $('#set-language').value = getLang();
  $('#set-theme').value = currentTheme();
  $('#set-usage').value = state.settings.usageLimit ?? 40;
  const used = state.usage.day === todayKey() ? state.usage.count : 0;
  $('#usage-today').textContent = state.settings.usageLimit ? t('usage.today', used, state.settings.usageLimit) : '';
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
  const theme = $('#set-theme').value === 'dark' ? 'dark' : 'light';
  state.settings = {
    openaiKey: $('#set-openai').value.trim(),
    geminiKey: $('#set-gemini').value.trim(),
    imageModel: $('#set-image-model').value.trim() || ai.DEFAULTS.imageModel,
    visionModel: $('#set-vision-model').value.trim() || ai.DEFAULTS.visionModel,
    theme,
    usageLimit: Math.max(0, Math.min(999, parseInt($('#set-usage').value, 10) || 0)),
  };
  store.save('settings', state.settings);
  state.rules = {
    max3: $('#r-max3').checked, mono: $('#r-mono').checked, neutral: $('#r-neutral').checked,
    accent: $('#r-accent').checked, metal: $('#r-metal').checked,
    favColors: [$('#fav-c1').value, $('#fav-c2').value, $('#fav-c3').value],
  };
  store.save('rules', state.rules);
  applyTheme(theme);
  const wantLang = $('#set-language').value;
  if (wantLang !== getLang()) { setLang(wantLang); applyLang(); }
  closeSettings();
});

/* ================= DARSTELLUNG (Theme & Sprache) ================= */

function currentTheme() {
  return document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';
}
function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  const meta = $('#theme-color-meta');
  if (meta) meta.setAttribute('content', theme === 'dark' ? '#171611' : '#f4f0e8');
  $('#toggle-theme').innerHTML = icon(theme === 'dark' ? 'sun' : 'moon', 17);
}
// Alle sichtbaren Texte neu setzen (statisch + dynamische Ansichten)
function applyLang() {
  applyStaticTranslations();
  $('#toggle-lang').textContent = getLang().toUpperCase();
  renderCategoryNav();
  renderGallery();
  renderTrayButton();
  if (importOpen) renderImport();
  if (state.view === 'looks') renderLooks();
  if (viewerEl) { const item = state.items.find((i) => i.id === state.selectedId); if (item) openViewer(item.id); }
}

$('#toggle-theme').addEventListener('click', () => {
  const next = currentTheme() === 'dark' ? 'light' : 'dark';
  state.settings.theme = next;
  store.save('settings', state.settings);
  applyTheme(next);
});
$('#toggle-lang').addEventListener('click', () => {
  setLang(getLang() === 'de' ? 'en' : 'de');
  state.settings.theme = currentTheme();
  applyLang();
});
$('#set-theme').addEventListener('change', (e) => applyTheme(e.target.value));

/* ================= START ================= */

async function init() {
  applyStaticTranslations();
  $('#toggle-lang').textContent = getLang().toUpperCase();
  applyTheme(state.settings.theme || currentTheme());
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
