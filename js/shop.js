import { icon } from './icons.js';
import { getLang } from './i18n.js';
import { collectionOf, safeShopUrl } from './catalog.js';

export const shopText = (de, en) => getLang() === 'en' ? en : de;
const tr = shopText;
const el = (tag, cls, text) => { const node = document.createElement(tag); if (cls) node.className = cls; if (text) node.textContent = text; return node; };
const button = (label, cls, action) => { const node = el('button', cls, label); node.type = 'button'; node.addEventListener('click', action); return node; };
export function placeholder(item) {
  const wrap = el('span', 'product-placeholder');
  wrap.innerHTML = icon(({ upperbody: 'shirt', wholebody_up: 'jacket', lowerbody: 'pants', shoes: 'shoe', accessories_up: 'watch' })[item.part] || 'shirt', 48);
  wrap.append(el('span', '', tr('Produktfoto ergänzen', 'Add a product photo')));
  return wrap;
}
export function productCard(item, { garment, modeled, mode, open, favorite }) {
  const card = el('article', 'product-card');
  const link = button('', 'product-open', open);
  link.setAttribute('aria-label', tr('Ansehen: ', 'View: ') + item.name);
  const media = el('span', 'product-media');
  const src = mode === 'modeled' ? modeled || garment : garment || modeled;
  const alternate = mode === 'modeled' ? garment : modeled;
  const isModeled = Boolean(modeled && (mode === 'modeled' || !garment));
  if (src) {
    const img = el('img', 'product-primary' + (isModeled ? ' is-modeled' : ''));
    img.src = src; img.alt = ''; img.loading = 'lazy'; img.decoding = 'async';
    media.append(img);
    if (alternate && alternate !== src) {
      const alt = el('img', 'product-alternate' + (!isModeled ? ' is-modeled' : ''));
      alt.src = alternate; alt.alt = ''; alt.loading = 'lazy'; alt.decoding = 'async'; media.append(alt);
      media.classList.add('has-alternate');
    }
  } else media.append(placeholder(item));
  if (!modeled) media.append(el('span', 'product-state', tr('Noch nicht anprobiert', 'Not tried on yet')));
  const info = el('span', 'product-info');
  info.append(el('span', 'product-name', item.name || tr('Neues Teil', 'New piece')));
  info.append(el('span', 'product-meta', [item.brand, item.size, collectionOf(item) === 'wishlist' ? tr('Wunschliste', 'Wishlist') : tr('In meinem Schrank', 'In my wardrobe')].filter(Boolean).join(' · ')));
  link.append(media, info); card.append(link);
  const fav = button('', 'product-favorite', () => { favorite(); fav.setAttribute('aria-pressed', String(Boolean(item.favorite))); fav.innerHTML = icon(item.favorite ? 'starFill' : 'star', 19); });
  fav.innerHTML = icon(item.favorite ? 'starFill' : 'star', 19);
  fav.setAttribute('aria-label', tr('Favorit: ', 'Favorite: ') + item.name);
  fav.setAttribute('aria-pressed', String(Boolean(item.favorite)));
  card.append(fav);
  return card;
}

// Product browsing is separate from the detailed metadata editor.
export function productDetail(item, { garment, modeled, mode, close, edit, save, tryOn, attach, addToLook, busy, variants = [], createVariant }) {
  const overlay = el('div', 'product-overlay');
  const dialog = el('section', 'product-dialog');
  dialog.setAttribute('role', 'dialog'); dialog.setAttribute('aria-modal', 'true'); dialog.setAttribute('aria-labelledby', 'product-title');
  const media = el('div', 'product-detail-media');
  const picture = el('div', 'product-picture');
  const chooseImage = kind => {
    picture.replaceChildren();
    const src = kind === 'modeled' ? modeled : garment;
    if (src) { const img = el('img', kind === 'modeled' ? 'is-modeled' : ''); img.src = src; img.alt = kind === 'modeled' ? tr('KI-Anprobe: ', 'AI try-on: ') + item.name : item.name; picture.append(img); }
    else picture.append(placeholder(item));
    tabs?.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.kind === kind)));
  };
  const tabs = el('div', 'product-image-tabs');
  for (const [kind, label, available] of [['modeled', tr('An mir', 'On me'), modeled], ['garment', tr('Produkt', 'Product'), garment]]) {
    const b = button(label, 'secondary-button', () => chooseImage(kind)); b.dataset.kind = kind; b.disabled = !available; tabs.append(b);
  }
  chooseImage(mode === 'modeled' && modeled ? 'modeled' : garment ? 'garment' : 'modeled');
  media.append(picture, tabs);
  if (garment && modeled) {
    const inset = el('img', 'product-inset'); inset.src = garment; inset.alt = item.name;
    media.append(inset);
  }

  const content = el('div', 'product-detail-content');
  content.append(el('p', 'product-eyebrow', collectionOf(item) === 'wishlist' ? tr('Meine Wunschliste', 'My wishlist') : tr('Mein Kleiderschrank', 'My wardrobe')));
  const title = el('h2', '', item.name || tr('Neues Teil', 'New piece')); title.id = 'product-title'; content.append(title);
  const facts = el('p', 'product-facts', [item.brand, item.size, item.material, item.pattern].filter(Boolean).join(' · ')); content.append(facts);
  const hint = el('p', 'product-note', modeled ? tr('KI-Vorschau für deinen Look. Größe und tatsächlicher Sitz können abweichen.', 'AI preview of your look. Size and actual fit may differ.') : garment ? tr('Sieh dir dieses Teil an dir an, bevor du dich entscheidest.', 'See this piece on you before you decide.') : tr('Ergänze ein Produktfoto oder einen Screenshot für die Anprobe.', 'Add a product photo or screenshot to try this on.')); content.append(hint);
  const actions = el('div', 'product-main-actions');
  const generate = button(busy ? tr('Anprobe entsteht …', 'Creating try-on …') : modeled ? tr('Anprobe erneuern', 'Try on again') : tr('An mir ansehen', 'See it on me'), 'primary-button', tryOn);
  generate.disabled = busy || !garment;
  actions.append(generate);
  if (!garment) actions.append(button(tr('Produktfoto hinzufügen', 'Add product photo'), 'primary-button', attach));
  const look = button(tr('Mit meinen Teilen kombinieren', 'Combine with my pieces'), 'secondary-button', addToLook); look.disabled = !garment; actions.append(look);
  content.append(actions);
  if (createVariant) {
    const variantsBox = el('div', 'product-variants');
    variantsBox.append(el('h3', '', tr('Farbe an mir ausprobieren', 'Try a color on me')));
    variantsBox.append(el('p', 'product-facts', tr('KI-Farbidee · keine bestätigte Shop-Variante. Eine Vorschau erzeugt ein KI-Bild.', 'AI color concept · not a confirmed shop variant. Each preview generates one AI image.')));
    const label = el('label', 'variant-picker', tr('Wunschfarbe', 'Desired color'));
    const color = el('input'); color.type = 'color'; color.value = /^#[0-9a-f]{6}$/i.test(item.color) ? item.color : '#333333'; label.append(color);
    const generateColor = button(tr('Farbvorschau erstellen', 'Create color preview'), 'secondary-button', () => createVariant(color.value));
    generateColor.disabled = busy || !garment;
    variantsBox.append(label, generateColor);
    const previews = el('div', 'variant-previews');
    for (const variant of variants) {
      const b = button('', 'variant-preview', () => {
        picture.replaceChildren();
        const img = el('img', 'is-modeled'); img.src = variant.src; img.alt = tr('KI-Farbidee ', 'AI color concept ') + variant.color; picture.append(img);
        tabs.querySelectorAll('button').forEach(x => x.setAttribute('aria-pressed', 'false'));
        previews.querySelectorAll('button').forEach(x => x.setAttribute('aria-pressed', String(x === b)));
      });
      b.setAttribute('aria-label', tr('KI-Farbidee ', 'AI color concept ') + variant.color); b.setAttribute('aria-pressed', 'false');
      const thumb = el('img'); thumb.src = variant.src; thumb.alt = ''; b.append(thumb, el('span', '', variant.color)); previews.append(b);
    }
    variantsBox.append(previews); content.append(variantsBox);
    tabs.addEventListener('click', () => previews.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', 'false')));
  }

  const ownership = button(collectionOf(item) === 'wishlist' ? tr('Gekauft · in meinen Schrank', 'Purchased · move to wardrobe') : tr('Auf die Wunschliste verschieben', 'Move to wishlist'), 'secondary-button', () => { item.collection = collectionOf(item) === 'wishlist' ? 'owned' : 'wishlist'; save(); });
  const fav = button(item.favorite ? tr('Favorit entfernen', 'Remove favorite') : tr('Als Favorit merken', 'Add to favorites'), 'secondary-button', () => { item.favorite = !item.favorite; save(); });
  const secondary = el('div', 'product-secondary-actions'); secondary.append(ownership, fav); content.append(secondary);
  const source = safeShopUrl(item.link);
  if (source) { const a = el('a', 'product-shop-link', tr('Im ursprünglichen Shop öffnen', 'Open original shop')); a.href = source; a.target = '_blank'; a.rel = 'noopener noreferrer'; content.append(a); }
  const details = el('div', 'product-edit-actions');
  details.append(button(tr('Details bearbeiten', 'Edit details'), 'secondary-button', edit));
  if (garment) details.append(button(tr('Produktfoto ersetzen', 'Replace product photo'), 'secondary-button', attach));
  content.append(details);
  const dismiss = button('', 'product-close', close); dismiss.innerHTML = icon('x', 22); dismiss.setAttribute('aria-label', tr('Schließen', 'Close'));
  dialog.append(media, content, dismiss); overlay.append(dialog);
  overlay.addEventListener('click', e => { if (e.target === overlay) close(); });
  overlay.addEventListener('keydown', e => {
    if (e.key === 'Escape') { e.preventDefault(); close(); }
    if (e.key === 'Tab') {
      const controls = [...dialog.querySelectorAll('button:not(:disabled), a[href], input:not(:disabled)')];
      const first = controls[0], last = controls.at(-1);
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  });
  requestAnimationFrame(() => dismiss.focus());
  return overlay;
}
