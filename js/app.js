// Haupt-App: Navigation, Zustand, Kleiderschrank, Outfits, Verkabelung aller Module.
import { initStage, updateAvatar, toggleAutoRotate } from './avatar.js';
import { analyzeOutfit } from './advisor.js';
import { startCamera, stopCamera, capturePhoto, estimateMeasurements, sampleSkinTone } from './scan.js';

/* ---------- Zustand & Speicher (bleibt lokal auf dem Gerät) ---------- */

const store = {
  load(key, fallback) {
    try { return JSON.parse(localStorage.getItem('wearclothing.' + key)) ?? fallback; }
    catch { return fallback; }
  },
  save(key, value) {
    try { localStorage.setItem('wearclothing.' + key, JSON.stringify(value)); }
    catch (e) { console.warn('Speichern fehlgeschlagen (Speicher voll?)', e); toast('⚠️ Speicher voll – Bild evtl. zu groß'); }
  },
};

const state = {
  profile: store.load('profile', {
    height: 175, build: 'normal', shoulder: 44, chest: 96, waist: 82, hip: 96,
    inseam: 80, arm: 60, skin: '#e0b394', hair: '#3b2a1e', eyes: '#4a6b8a', hairstyle: 'kurz',
  }),
  items: store.load('items', []),
  worn: store.load('worn', []),
  outfits: store.load('outfits', []),
  rules: store.load('rules', { max3: true, mono: false, neutral: false, accent: true, metal: true, favColors: ['#1f2937', '#e5e0d8', '#7a2e2e'] }),
};

const $ = (sel) => document.querySelector(sel);
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

function toast(msg) {
  const t = document.createElement('div');
  t.className = 'toast';
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 2200);
}

/* ---------- Navigation ---------- */

document.querySelectorAll('.tab').forEach((tab) => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('active', t === tab));
    document.querySelectorAll('.view').forEach((v) => v.classList.remove('active'));
    $('#view-' + tab.dataset.view).classList.add('active');
    if (tab.dataset.view === 'anprobe') refreshAvatar();
  });
});

/* ---------- Profil ---------- */

const profileFields = {
  height: '#m-height', build: '#m-build', shoulder: '#m-shoulder', chest: '#m-chest',
  waist: '#m-waist', hip: '#m-hip', inseam: '#m-inseam', arm: '#m-arm',
  skin: '#a-skin', hair: '#a-hair', eyes: '#a-eyes', hairstyle: '#a-hairstyle',
};

function profileToForm() {
  for (const [key, sel] of Object.entries(profileFields)) $(sel).value = state.profile[key];
}
function formToProfile() {
  for (const [key, sel] of Object.entries(profileFields)) {
    const el = $(sel);
    state.profile[key] = el.type === 'number' ? Number(el.value) : el.value;
  }
}

$('#btn-save-profile').addEventListener('click', () => {
  formToProfile();
  store.save('profile', state.profile);
  toast('✅ Profil gespeichert');
  refreshAvatar();
});

$('#btn-estimate').addEventListener('click', () => {
  const est = estimateMeasurements(Number($('#m-height').value) || 175, $('#m-build').value);
  $('#m-shoulder').value = est.shoulder;
  $('#m-chest').value = est.chest;
  $('#m-waist').value = est.waist;
  $('#m-hip').value = est.hip;
  $('#m-inseam').value = est.inseam;
  $('#m-arm').value = est.arm;
  toast('📏 Maße geschätzt – gern feinjustieren');
});

/* ---------- Kamera-Scan ---------- */

const video = $('#scan-video');
const scanCanvas = $('#scan-canvas');

$('#btn-start-scan').addEventListener('click', async () => {
  try {
    $('#scan-area').classList.remove('hidden');
    await startCamera(video);
    $('#btn-start-scan').classList.add('hidden');
    $('#btn-capture').classList.remove('hidden');
    $('#btn-stop-scan').classList.remove('hidden');
    $('#scan-result').textContent = '';
  } catch (e) {
    $('#scan-area').classList.add('hidden');
    $('#scan-result').textContent = '❌ Kamera nicht verfügbar: ' + e.message + ' – Tipp: Die Seite muss über HTTPS (oder localhost) laufen und Kamerazugriff braucht deine Erlaubnis.';
  }
});

$('#btn-stop-scan').addEventListener('click', endScan);

function endScan() {
  stopCamera(video);
  $('#scan-area').classList.add('hidden');
  $('#btn-start-scan').classList.remove('hidden');
  $('#btn-capture').classList.add('hidden');
  $('#btn-stop-scan').classList.add('hidden');
}

$('#btn-capture').addEventListener('click', () => {
  const photo = capturePhoto(video, scanCanvas);
  const skin = sampleSkinTone(scanCanvas);
  endScan();
  if (!photo) {
    $('#scan-result').textContent = '❌ Aufnahme fehlgeschlagen, bitte erneut versuchen.';
    return;
  }
  const est = estimateMeasurements(Number($('#m-height').value) || 175, $('#m-build').value);
  $('#m-shoulder').value = est.shoulder;
  $('#m-chest').value = est.chest;
  $('#m-waist').value = est.waist;
  $('#m-hip').value = est.hip;
  $('#m-inseam').value = est.inseam;
  $('#m-arm').value = est.arm;
  if (skin) $('#a-skin').value = skin;
  $('#scan-result').innerHTML = '✅ Scan ausgewertet: Maße wurden aus Größe, Körperbau und Foto geschätzt' +
    (skin ? ', Hautton übernommen' : '') +
    '. Prüfe die Werte unten und speichere dein Profil.';
});

/* ---------- Kleiderschrank ---------- */

const TYPE_ICONS = {
  tshirt: '👕', longsleeve: '🧥', jacke: '🧥', hose: '👖', shorts: '🩳',
  rock: '👗', kleid: '👗', schuhe: '👟', uhr: '⌚', kette: '📿',
};
const TYPE_NAMES = {
  tshirt: 'T-Shirt', longsleeve: 'Langarm/Pulli', jacke: 'Jacke', hose: 'Hose', shorts: 'Shorts',
  rock: 'Rock', kleid: 'Kleid', schuhe: 'Schuhe', uhr: 'Uhr', kette: 'Kette',
};

let pendingImage = null;

$('#c-image').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  pendingImage = await downscaleImage(file, 320);
  const prev = $('#c-preview');
  prev.classList.remove('hidden');
  prev.querySelector('img').src = pendingImage;
  const dominant = await dominantColor(pendingImage);
  if (dominant) $('#c-color').value = dominant;
});

function downscaleImage(file, maxSize) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, maxSize / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * scale);
      c.height = Math.round(img.height * scale);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(img.src);
      resolve(c.toDataURL('image/jpeg', 0.82));
    };
    img.onerror = reject;
    img.src = URL.createObjectURL(file);
  });
}

// Dominante Farbe: häufigster gesättigter Farbton, sonst mittlerer Grauwert
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
        // Weißen/sehr hellen Hintergrund ignorieren
        if (min > 235) continue;
        const weight = 1 + (max - min) / 64; // gesättigte Pixel zählen stärker
        r += pr * weight; g += pg * weight; b += pb * weight; n += weight;
      }
      if (!n) return resolve(null);
      const hex = '#' + [r / n, g / n, b / n].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');
      resolve(hex);
    };
    img.onerror = () => resolve(null);
    img.src = dataUrl;
  });
}

$('#btn-add-item').addEventListener('click', () => {
  const name = $('#c-name').value.trim();
  const type = $('#c-type').value;
  if (!name) { toast('Bitte gib dem Teil einen Namen'); return; }
  const item = {
    id: uid(),
    name,
    type,
    link: $('#c-link').value.trim() || null,
    color: $('#c-color').value,
    image: pendingImage,
  };
  state.items.unshift(item);
  store.save('items', state.items);
  // Formular zurücksetzen
  $('#c-name').value = '';
  $('#c-link').value = '';
  $('#c-image').value = '';
  $('#c-preview').classList.add('hidden');
  pendingImage = null;
  renderItems();
  renderWearList();
  toast('👕 „' + name + '“ hinzugefügt');
});

function itemRow(item, { wearable = false } = {}) {
  const row = document.createElement('div');
  row.className = 'item-row';
  const thumb = document.createElement('div');
  thumb.className = 'item-thumb';
  if (item.image) thumb.style.backgroundImage = `url(${item.image})`;
  else { thumb.textContent = TYPE_ICONS[item.type] || '👕'; thumb.style.background = item.color; }
  row.appendChild(thumb);

  const info = document.createElement('div');
  info.className = 'item-info';
  const nm = document.createElement('div');
  nm.className = 'name';
  nm.textContent = item.name;
  info.appendChild(nm);
  const meta = document.createElement('div');
  meta.className = 'meta';
  meta.innerHTML = `<span class="color-dot" style="background:${item.color}"></span> ${TYPE_NAMES[item.type] || item.type}`;
  if (item.link) {
    const a = document.createElement('a');
    a.href = item.link;
    a.target = '_blank';
    a.rel = 'noopener';
    a.textContent = '🔗 Shop';
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
    btn.textContent = worn ? '✓' : '+';
    btn.title = worn ? 'Ausziehen' : 'Anziehen';
    btn.addEventListener('click', () => toggleWear(item.id));
    actions.appendChild(btn);
  } else {
    const del = document.createElement('button');
    del.className = 'icon-btn';
    del.textContent = '🗑';
    del.title = 'Löschen';
    del.addEventListener('click', () => {
      state.items = state.items.filter((i) => i.id !== item.id);
      state.worn = state.worn.filter((id) => id !== item.id);
      store.save('items', state.items);
      store.save('worn', state.worn);
      renderItems();
      renderWearList();
      refreshAvatar();
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

/* ---------- Anprobe ---------- */

function renderWearList() {
  const list = $('#wear-list');
  list.innerHTML = '';
  state.items.forEach((item) => list.appendChild(itemRow(item, { wearable: true })));
  $('#wear-empty').classList.toggle('hidden', state.items.length > 0);
}

function toggleWear(id) {
  const item = state.items.find((i) => i.id === id);
  if (!item) return;
  if (state.worn.includes(id)) {
    state.worn = state.worn.filter((w) => w !== id);
  } else {
    // Pro "Slot" nur ein Teil: gleiche/konkurrierende Kategorie ausziehen
    const slots = {
      tshirt: ['tshirt', 'longsleeve', 'kleid'], longsleeve: ['tshirt', 'longsleeve', 'kleid'],
      jacke: ['jacke'], kleid: ['tshirt', 'longsleeve', 'kleid', 'hose', 'shorts', 'rock'],
      hose: ['hose', 'shorts', 'rock', 'kleid'], shorts: ['hose', 'shorts', 'rock', 'kleid'],
      rock: ['hose', 'shorts', 'rock', 'kleid'], schuhe: ['schuhe'], uhr: ['uhr'], kette: ['kette'],
    };
    const conflict = slots[item.type] || [item.type];
    state.worn = state.worn.filter((w) => {
      const other = state.items.find((i) => i.id === w);
      return other && !conflict.includes(other.type);
    });
    state.worn.push(id);
  }
  store.save('worn', state.worn);
  renderWearList();
  refreshAvatar();
}

function wornItems() {
  return state.worn.map((id) => state.items.find((i) => i.id === id)).filter(Boolean);
}

function refreshAvatar() {
  updateAvatar(state.profile, wornItems());
}

$('#btn-autorotate').addEventListener('click', () => {
  const on = toggleAutoRotate();
  $('#btn-autorotate').style.background = on ? 'linear-gradient(135deg,#8b7cf6,#6a5cd8)' : '';
});

$('#btn-analyze').addEventListener('click', () => {
  const box = $('#analysis-box');
  if (!box.classList.contains('hidden')) { box.classList.add('hidden'); return; }
  const { score, text } = analyzeOutfit(wornItems(), state.profile, state.rules);
  box.innerHTML = `<strong>Stil-Check · ${score}/100</strong><br>${text}`;
  box.classList.remove('hidden');
  setTimeout(() => box.classList.add('hidden'), 12000);
});

/* ---------- Outfits ---------- */

$('#btn-save-outfit').addEventListener('click', () => {
  const items = wornItems();
  if (!items.length) { toast('Zieh deinem Avatar zuerst etwas an'); return; }
  const name = $('#outfit-name').value.trim() || 'Outfit vom ' + new Date().toLocaleDateString('de-DE');
  state.outfits.unshift({ id: uid(), name, itemIds: [...state.worn], fav: false, createdAt: Date.now() });
  store.save('outfits', state.outfits);
  $('#outfit-name').value = '';
  renderOutfits();
  toast('💾 Outfit gespeichert');
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
    const name = document.createElement('div');
    name.className = 'name';
    name.textContent = outfit.name;
    head.appendChild(name);
    const fav = document.createElement('button');
    fav.className = 'icon-btn' + (outfit.fav ? ' active' : '');
    fav.textContent = outfit.fav ? '⭐' : '☆';
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
    wear.textContent = '✨ Anziehen';
    wear.addEventListener('click', () => {
      state.worn = outfit.itemIds.filter((id) => state.items.some((i) => i.id === id));
      store.save('worn', state.worn);
      renderWearList();
      refreshAvatar();
      document.querySelector('.tab[data-view="anprobe"]').click();
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
  toast('💡 Stilregeln gespeichert');
});

$('#btn-advise').addEventListener('click', () => {
  const { score, text } = analyzeOutfit(wornItems(), state.profile, state.rules);
  const box = $('#advice-box');
  box.innerHTML = `<strong>Stil-Check · ${score}/100</strong><br>${text}`;
  box.classList.remove('hidden');
});

/* ---------- Start ---------- */

profileToForm();
rulesToForm();
renderItems();
renderWearList();
renderOutfits();
initStage($('#stage'));
refreshAvatar();

// Service Worker für Offline-Nutzung / "App installieren"
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
