// Haupt-App: Navigation, Zustand, Kleiderschrank, KI-Anprobe, Outfits.
import { analyzeOutfit } from './advisor.js';
import { icon, TYPE_ICON } from './icons.js';
import { analyzeItem, TYPE_LABEL } from './detect.js';
import { buildPrompt, generateTryOn } from './tryon.js';

/* ---------- Zustand & Speicher (bleibt lokal auf dem Gerät) ---------- */

const store = {
  load(key, fallback) {
    try { return JSON.parse(localStorage.getItem('wearclothing.' + key)) ?? fallback; }
    catch { return fallback; }
  },
  save(key, value) {
    try { localStorage.setItem('wearclothing.' + key, JSON.stringify(value)); }
    catch (e) { console.warn('Speichern fehlgeschlagen (Speicher voll?)', e); toast('Speicher voll – ältere Outfits löschen hilft'); }
  },
};

const state = {
  profile: store.load('profile', { hair: '#3b2a1e', eyes: '#4a6b8a' }),
  photos: store.load('photos', { body: null, face: null }),
  apiKey: store.load('apikey', ''),
  items: store.load('items', []),
  worn: store.load('worn', []),
  outfits: store.load('outfits', []),
  rules: store.load('rules', { max3: true, mono: false, neutral: false, accent: true, metal: true, favColors: ['#1f2937', '#e5e0d8', '#7a2e2e'] }),
  current: store.load('current', null), // letztes KI-Ergebnis
};

// Slots für die Anprobe-Toggles
const SLOTS = {
  oberteil: { label: 'Oberteil', types: ['tshirt', 'longsleeve', 'kleid'] },
  jacke: { label: 'Jacke', types: ['jacke'] },
  hose: { label: 'Hose / Rock', types: ['hose', 'shorts', 'rock'] },
  schuhe: { label: 'Schuhe', types: ['schuhe'] },
  uhr: { label: 'Uhr', types: ['uhr'] },
  kette: { label: 'Kette', types: ['kette'] },
};
const slotOf = (type) => Object.keys(SLOTS).find((s) => SLOTS[s].types.includes(type));
const slotActions = { oberteil: 'keep', jacke: 'keep', hose: 'keep', schuhe: 'keep', uhr: 'keep', kette: 'keep' };

const $ = (sel) => document.querySelector(sel);
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

function toast(msg) {
  const t = document.createElement('div');
  t.className = 'toast';
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 2600);
}

/* ---------- Statische Icons einsetzen ---------- */

document.querySelectorAll('[data-icon]').forEach((el) => {
  const inTab = el.closest('.tab');
  const inFab = el.closest('.fab');
  const inEmpty = el.closest('.stage-empty');
  const size = inTab ? 22 : inFab ? 20 : inEmpty ? 34 : 18;
  el.innerHTML = icon(el.dataset.icon, size);
});

/* ---------- Navigation ---------- */

function switchView(name) {
  document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('active', t.dataset.view === name));
  document.querySelectorAll('.view').forEach((v) => v.classList.remove('active'));
  $('#view-' + name).classList.add('active');
}
document.querySelectorAll('.tab').forEach((tab) => {
  tab.addEventListener('click', () => switchView(tab.dataset.view));
});

/* ---------- Bild-Helfer ---------- */

function downscaleFile(file, maxSize, quality = 0.85) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(img.src);
      resolve(downscaleImg(img, maxSize, quality));
    };
    img.onerror = reject;
    img.src = URL.createObjectURL(file);
  });
}
function downscaleDataUrl(dataUrl, maxSize, quality = 0.85) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(downscaleImg(img, maxSize, quality));
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });
}
function downscaleImg(img, maxSize, quality) {
  const scale = Math.min(1, maxSize / Math.max(img.width, img.height));
  const c = document.createElement('canvas');
  c.width = Math.round(img.width * scale);
  c.height = Math.round(img.height * scale);
  c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
  return c.toDataURL('image/jpeg', quality);
}

// Dominante Farbe eines Bildes (gesättigte Pixel zählen stärker, helle Ränder ignoriert)
function dominantColor(dataUrl) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const c = document.createElement('canvas');
      const s = 48;
      c.width = s; c.height = s;
      const ctx = c.getContext('2d');
      ctx.drawImage(img, 0, 0, s, s);
      const d = ctx.getImageData(0, 0, s, s).data;
      let r = 0, g = 0, b = 0, n = 0;
      for (let i = 0; i < d.length; i += 4) {
        const [pr, pg, pb, pa] = [d[i], d[i + 1], d[i + 2], d[i + 3]];
        if (pa < 120) continue;
        const max = Math.max(pr, pg, pb), min = Math.min(pr, pg, pb);
        if (min > 235) continue;
        const weight = 1 + (max - min) / 64;
        r += pr * weight; g += pg * weight; b += pb * weight; n += weight;
      }
      if (!n) return resolve(null);
      resolve('#' + [r / n, g / n, b / n].map((v) => Math.round(v).toString(16).padStart(2, '0')).join(''));
    };
    img.onerror = () => resolve(null);
    img.src = dataUrl;
  });
}

/* ---------- Profil: Fotos, KI-Schlüssel, Aussehen ---------- */

function renderPhotoPreviews() {
  const b = $('#prev-body'), f = $('#prev-face');
  b.classList.toggle('hidden', !state.photos.body);
  if (state.photos.body) b.src = state.photos.body;
  f.classList.toggle('hidden', !state.photos.face);
  if (state.photos.face) f.src = state.photos.face;
  $('#body-drop-text').textContent = state.photos.body ? 'Ganzkörperfoto ersetzen' : 'Ganzkörperfoto auswählen (nötig)';
  $('#face-drop-text').textContent = state.photos.face ? 'Gesichtsfoto ersetzen' : 'Gesichtsfoto auswählen (optional, für mehr Ähnlichkeit)';
  $('#body-drop').classList.toggle('has-image', !!state.photos.body);
  $('#face-drop').classList.toggle('has-image', !!state.photos.face);
}

$('#p-body').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  state.photos.body = await downscaleFile(file, 1280);
  state.current = null; // neues Basisfoto -> altes Ergebnis verwerfen
  store.save('photos', state.photos);
  store.save('current', null);
  renderPhotoPreviews();
  renderStage();
  toast('Ganzkörperfoto gespeichert');
});

$('#p-face').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  state.photos.face = await downscaleFile(file, 640);
  store.save('photos', state.photos);
  renderPhotoPreviews();
  toast('Gesichtsfoto gespeichert');
});

function renderKeyStatus() {
  $('#ai-key-status').textContent = state.apiKey
    ? 'Schlüssel gespeichert – bleibt nur auf diesem Gerät.'
    : 'Noch kein Schlüssel hinterlegt.';
}
$('#ai-key').addEventListener('change', () => {
  state.apiKey = $('#ai-key').value.trim();
  store.save('apikey', state.apiKey);
  renderKeyStatus();
  if (state.apiKey) toast('KI-Schlüssel gespeichert');
});

$('#btn-save-profile').addEventListener('click', () => {
  state.profile.hair = $('#a-hair').value;
  state.profile.eyes = $('#a-eyes').value;
  state.apiKey = $('#ai-key').value.trim() || state.apiKey;
  store.save('profile', state.profile);
  store.save('apikey', state.apiKey);
  renderKeyStatus();
  toast('Profil gespeichert');
});

/* ---------- Kleiderschrank: automatische Erkennung ---------- */

let pendingImage = null;
let pendingImageColor = null;

$('#c-image').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  pendingImage = await downscaleFile(file, 512, 0.82);
  pendingImageColor = await dominantColor(pendingImage);
  $('#image-drop').classList.add('has-image');
  $('#image-drop-text').textContent = 'Bild ausgewählt – anderes wählen?';
  runDetection();
});

$('#c-link').addEventListener('input', () => runDetection());

function runDetection() {
  const link = $('#c-link').value.trim();
  if (!link && !pendingImage) { $('#c-detected').classList.add('hidden'); return; }

  const result = analyzeItem(link, pendingImageColor);
  $('#c-name').value = result.name;
  $('#c-type').value = result.type;
  $('#c-color').value = result.color;

  const box = $('#c-detected');
  box.classList.remove('hidden');
  const thumb = $('#d-thumb');
  if (pendingImage) {
    thumb.style.backgroundImage = `url(${pendingImage})`;
    thumb.innerHTML = '';
  } else {
    thumb.style.backgroundImage = 'none';
    thumb.style.background = result.color;
    thumb.innerHTML = icon(TYPE_ICON[result.type] || 'shirt', 26);
  }
  $('#d-name').textContent = result.name;
  $('#d-meta').innerHTML =
    `<span class="color-dot" style="background:${result.color}"></span>` +
    `${TYPE_LABEL[result.type]}` +
    (result.notes.length ? ` · ${result.notes.join(' · ')}` : ' · automatisch erkannt');
}

$('#btn-add-item').addEventListener('click', () => {
  const link = $('#c-link').value.trim();
  if (!link && !pendingImage) {
    toast('Bitte Bild auswählen oder Shop-Link einfügen');
    return;
  }
  const item = {
    id: uid(),
    name: $('#c-name').value.trim() || 'Neues Teil',
    type: $('#c-type').value,
    link: link || null,
    color: $('#c-color').value,
    image: pendingImage,
  };
  state.items.unshift(item);
  store.save('items', state.items);
  $('#c-name').value = '';
  $('#c-link').value = '';
  $('#c-image').value = '';
  $('#c-detected').classList.add('hidden');
  $('#c-details').removeAttribute('open');
  $('#image-drop').classList.remove('has-image');
  $('#image-drop-text').textContent = 'Produktbild auswählen';
  pendingImage = null;
  pendingImageColor = null;
  renderItems();
  renderWearList();
  toast('„' + item.name + '“ hinzugefügt');
});

function itemRow(item, { wearable = false } = {}) {
  const row = document.createElement('div');
  row.className = 'item-row';
  const thumb = document.createElement('div');
  thumb.className = 'item-thumb';
  if (item.image) thumb.style.backgroundImage = `url(${item.image})`;
  else { thumb.innerHTML = icon(TYPE_ICON[item.type] || 'shirt', 26); thumb.style.background = item.color; }
  row.appendChild(thumb);

  const info = document.createElement('div');
  info.className = 'item-info';
  const nm = document.createElement('div');
  nm.className = 'name';
  nm.textContent = item.name;
  info.appendChild(nm);
  const meta = document.createElement('div');
  meta.className = 'meta';
  meta.innerHTML = `<span class="color-dot" style="background:${item.color}"></span> ${TYPE_LABEL[item.type] || item.type}`;
  if (item.link) {
    const a = document.createElement('a');
    a.href = item.link;
    a.target = '_blank';
    a.rel = 'noopener';
    a.innerHTML = icon('link', 12) + 'Shop';
    meta.appendChild(a);
  }
  info.appendChild(meta);
  row.appendChild(info);

  const actions = document.createElement('div');
  actions.className = 'item-actions';
  if (wearable) {
    const worn = state.worn.includes(item.id);
    const btn = document.createElement('button');
    btn.className = 'icon-btn' + (worn ? ' active' : '');
    btn.innerHTML = icon(worn ? 'check' : 'plus', 17);
    btn.title = worn ? 'Abwählen' : 'Auswählen';
    btn.addEventListener('click', () => toggleWear(item.id));
    actions.appendChild(btn);
  } else {
    const del = document.createElement('button');
    del.className = 'icon-btn';
    del.innerHTML = icon('trash', 16);
    del.title = 'Löschen';
    del.addEventListener('click', () => {
      state.items = state.items.filter((i) => i.id !== item.id);
      state.worn = state.worn.filter((id) => id !== item.id);
      store.save('items', state.items);
      store.save('worn', state.worn);
      renderItems();
      renderWearList();
    });
    actions.appendChild(del);
  }
  row.appendChild(actions);
  return row;
}

function renderItems() {
  const list = $('#item-list');
  list.innerHTML = '';
  state.items.forEach((item) => list.appendChild(itemRow(item)));
  $('#item-empty').classList.toggle('hidden', state.items.length > 0);
}

/* ---------- Anprobe: Auswahl, Slots, Generierung ---------- */

function renderWearList() {
  const list = $('#wear-list');
  list.innerHTML = '';
  state.items.forEach((item) => list.appendChild(itemRow(item, { wearable: true })));
  $('#wear-empty').classList.toggle('hidden', state.items.length > 0);
  renderSlots();
}

function toggleWear(id) {
  const item = state.items.find((i) => i.id === id);
  if (!item) return;
  if (state.worn.includes(id)) {
    state.worn = state.worn.filter((w) => w !== id);
  } else {
    // Pro Slot nur ein Teil
    const slot = slotOf(item.type);
    const conflictTypes = item.type === 'kleid'
      ? [...SLOTS.oberteil.types, ...SLOTS.hose.types]
      : SLOTS[slot]?.types || [item.type];
    state.worn = state.worn.filter((w) => {
      const other = state.items.find((i) => i.id === w);
      return other && !conflictTypes.includes(other.type);
    });
    state.worn.push(id);
    if (slot) slotActions[slot] = 'keep'; // "Ausziehen" hebt sich mit Auswahl auf
  }
  store.save('worn', state.worn);
  renderWearList();
}

function wornItems() {
  return state.worn.map((id) => state.items.find((i) => i.id === id)).filter(Boolean);
}
function selectedForSlot(slot) {
  return wornItems().find((i) => slotOf(i.type) === slot);
}

function renderSlots() {
  const list = $('#slot-list');
  list.innerHTML = '';
  for (const [slot, def] of Object.entries(SLOTS)) {
    const row = document.createElement('div');
    row.className = 'slot-row';
    const label = document.createElement('span');
    label.className = 'slot-label';
    label.textContent = def.label;
    row.appendChild(label);

    const pill = document.createElement('button');
    const sel = selectedForSlot(slot);
    if (sel) {
      pill.className = 'pill swap';
      pill.textContent = 'Wechseln: ' + sel.name;
      pill.title = 'Tippen zum Abwählen';
      pill.addEventListener('click', () => toggleWear(sel.id));
    } else if (slotActions[slot] === 'strip') {
      pill.className = 'pill strip';
      pill.textContent = 'Ausziehen';
      pill.addEventListener('click', () => { slotActions[slot] = 'keep'; renderSlots(); });
    } else {
      pill.className = 'pill';
      pill.textContent = 'Behalten';
      pill.addEventListener('click', () => { slotActions[slot] = 'strip'; renderSlots(); });
    }
    row.appendChild(pill);
    list.appendChild(row);
  }
}

/* ---------- Foto-Bühne ---------- */

function renderStage() {
  const img = $('#stage-photo');
  const src = state.current || state.photos.body;
  img.classList.toggle('hidden', !src);
  if (src) img.src = src;
  $('#stage-empty').classList.toggle('hidden', !!src);
  $('#result-actions').classList.toggle('hidden', !state.current);
}

$('#btn-keep-base').addEventListener('click', () => {
  if (!state.current) return;
  state.photos.body = state.current;
  state.current = null;
  store.save('photos', state.photos);
  store.save('current', null);
  renderPhotoPreviews();
  renderStage();
  toast('Ergebnis ist jetzt dein Ausgangsfoto');
});

$('#btn-reset-photo').addEventListener('click', () => {
  state.current = null;
  store.save('current', null);
  renderStage();
});

/* ---------- KI-Generierung ---------- */

let generating = false;

$('#btn-generate').addEventListener('click', async () => {
  if (generating) return;
  if (!state.photos.body) {
    toast('Lade zuerst im Profil ein Ganzkörperfoto hoch');
    switchView('profil');
    return;
  }
  if (!state.apiKey) {
    toast('Bitte zuerst den kostenlosen KI-Schlüssel im Profil eintragen');
    switchView('profil');
    return;
  }
  const auto = $('#auto-mode').checked;
  const garments = wornItems().map((i) => ({
    slot: slotOf(i.type),
    image: i.image,
    desc: `${i.name} (${TYPE_LABEL[i.type]}, Farbe ${i.color})`,
  }));
  const hasStrip = Object.values(slotActions).some((a) => a === 'strip');
  if (!garments.length && !hasStrip) {
    toast('Wähle Kleidung aus oder stelle einen Slot auf „Ausziehen“');
    return;
  }

  const slots = Object.fromEntries(Object.entries(slotActions).map(([s, a]) => [s, { action: selectedForSlot(s) ? 'swap' : a }]));
  const prompt = buildPrompt({ slots, auto, rules: state.rules, hasFace: !!state.photos.face, garments });

  generating = true;
  $('#stage-loading').classList.remove('hidden');
  $('#btn-generate').disabled = true;
  try {
    const result = await generateTryOn({
      apiKey: state.apiKey,
      prompt,
      personImage: state.photos.body,
      faceImage: state.photos.face,
      garments,
    });
    state.current = await downscaleDataUrl(result, 1024, 0.86);
    store.save('current', state.current);
    renderStage();
    toast('Fertig – so sieht es an dir aus');
  } catch (e) {
    console.warn(e);
    toast(e.message || 'Generierung fehlgeschlagen');
  } finally {
    generating = false;
    $('#stage-loading').classList.add('hidden');
    $('#btn-generate').disabled = false;
  }
});

/* ---------- Stil-Analyse ---------- */

$('#btn-analyze').addEventListener('click', () => {
  const box = $('#analysis-box');
  if (!box.classList.contains('hidden')) { box.classList.add('hidden'); return; }
  const { score, text } = analyzeOutfit(wornItems(), state.profile, state.rules);
  box.innerHTML = `<strong>Stil-Check · ${score}/100</strong><br>${text}`;
  box.classList.remove('hidden');
  setTimeout(() => box.classList.add('hidden'), 12000);
});

$('#btn-advise').addEventListener('click', () => {
  const { score, text } = analyzeOutfit(wornItems(), state.profile, state.rules);
  const box = $('#advice-box');
  box.innerHTML = `<strong>Stil-Check · ${score}/100</strong><br>${text}`;
  box.classList.remove('hidden');
});

/* ---------- Outfits ---------- */

$('#btn-save-outfit').addEventListener('click', async () => {
  const items = wornItems();
  if (!items.length && !state.current) { toast('Wähle Kleidung aus oder probiere zuerst etwas an'); return; }
  const name = $('#outfit-name').value.trim() || 'Outfit vom ' + new Date().toLocaleDateString('de-DE');
  const image = state.current ? await downscaleDataUrl(state.current, 640, 0.8) : null;
  state.outfits.unshift({ id: uid(), name, itemIds: [...state.worn], image, fav: false, createdAt: Date.now() });
  store.save('outfits', state.outfits);
  $('#outfit-name').value = '';
  renderOutfits();
  toast('Outfit gespeichert');
});

function renderOutfits() {
  const list = $('#outfit-list');
  list.innerHTML = '';
  const sorted = [...state.outfits].sort((a, b) => (b.fav - a.fav) || (b.createdAt - a.createdAt));
  for (const outfit of sorted) {
    const card = document.createElement('div');
    card.className = 'outfit-card';

    const head = document.createElement('div');
    head.className = 'head';
    if (outfit.image) {
      const thumb = document.createElement('img');
      thumb.className = 'outfit-thumb';
      thumb.src = outfit.image;
      thumb.alt = outfit.name;
      head.appendChild(thumb);
    }
    const name = document.createElement('div');
    name.className = 'name';
    name.textContent = outfit.name;
    head.appendChild(name);
    const fav = document.createElement('button');
    fav.className = 'icon-btn' + (outfit.fav ? ' active' : '');
    fav.innerHTML = icon(outfit.fav ? 'starFill' : 'star', 17);
    fav.title = 'Favorit';
    fav.addEventListener('click', () => {
      outfit.fav = !outfit.fav;
      store.save('outfits', state.outfits);
      renderOutfits();
    });
    head.appendChild(fav);
    card.appendChild(head);

    const pieces = document.createElement('div');
    pieces.className = 'pieces';
    for (const id of outfit.itemIds) {
      const item = state.items.find((i) => i.id === id);
      const chip = document.createElement('span');
      chip.className = 'chip';
      if (item) chip.innerHTML = `<span class="color-dot" style="background:${item.color}"></span>${item.name}`;
      else chip.textContent = '(gelöschtes Teil)';
      pieces.appendChild(chip);
    }
    card.appendChild(pieces);

    const actions = document.createElement('div');
    actions.className = 'actions';
    const wear = document.createElement('button');
    wear.className = 'btn primary';
    wear.textContent = 'Ansehen';
    wear.addEventListener('click', () => {
      state.worn = outfit.itemIds.filter((id) => state.items.some((i) => i.id === id));
      store.save('worn', state.worn);
      if (outfit.image) {
        state.current = outfit.image;
        store.save('current', state.current);
      }
      renderWearList();
      renderStage();
      switchView('anprobe');
    });
    actions.appendChild(wear);
    const del = document.createElement('button');
    del.className = 'btn ghost danger';
    del.textContent = 'Löschen';
    del.addEventListener('click', () => {
      state.outfits = state.outfits.filter((o) => o.id !== outfit.id);
      store.save('outfits', state.outfits);
      renderOutfits();
    });
    actions.appendChild(del);
    card.appendChild(actions);

    list.appendChild(card);
  }
  $('#outfit-empty').classList.toggle('hidden', state.outfits.length > 0);
}

/* ---------- Berater ---------- */

function rulesToForm() {
  $('#r-max3').checked = state.rules.max3;
  $('#r-mono').checked = state.rules.mono;
  $('#r-neutral').checked = state.rules.neutral;
  $('#r-accent').checked = state.rules.accent;
  $('#r-metal').checked = state.rules.metal;
  const favs = state.rules.favColors || [];
  if (favs[0]) $('#fav-c1').value = favs[0];
  if (favs[1]) $('#fav-c2').value = favs[1];
  if (favs[2]) $('#fav-c3').value = favs[2];
}

$('#btn-save-rules').addEventListener('click', () => {
  state.rules = {
    max3: $('#r-max3').checked,
    mono: $('#r-mono').checked,
    neutral: $('#r-neutral').checked,
    accent: $('#r-accent').checked,
    metal: $('#r-metal').checked,
    favColors: [$('#fav-c1').value, $('#fav-c2').value, $('#fav-c3').value],
  };
  store.save('rules', state.rules);
  toast('Stilregeln gespeichert');
});

/* ---------- Start ---------- */

$('#a-hair').value = state.profile.hair || '#3b2a1e';
$('#a-eyes').value = state.profile.eyes || '#4a6b8a';
if (state.apiKey) $('#ai-key').value = state.apiKey;
renderKeyStatus();
renderPhotoPreviews();
rulesToForm();
renderItems();
renderWearList();
renderOutfits();
renderStage();

// Service Worker für Offline-Nutzung / "App installieren"
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
