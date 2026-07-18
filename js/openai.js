// OpenAI-Pipeline der Anprobe – Browser-Port der Wardrobe-Import-Pipeline
// (Analyse per Vision-Modell, Freisteller per gpt-image + Chroma-Key-Entfernung,
// Model-Fotos per gpt-image mit dem Referenzfoto des Nutzers).
// Alle Aufrufe laufen direkt vom Gerät zur OpenAI-API mit dem Schlüssel des Nutzers.

export const DEFAULTS = {
  imageModel: 'gpt-image-1',   // reales OpenAI-Bildmodell (Freisteller & Model-Fotos)
  visionModel: 'gpt-4o',       // Vision + strukturierte Ausgabe für die Teile-Erkennung
  quality: 'high',
};

export const PARTS = [
  ['upperbody', 'Oberteile', 'Oberteil'],
  ['wholebody_up', 'Jacken', 'Jacke'],
  ['lowerbody', 'Unterteile', 'Unterteil'],
  ['accessories_up', 'Accessoires', 'Accessoire'],
  ['shoes', 'Schuhe', 'Schuhe'],
];
export const PART_LABEL = Object.fromEntries(PARTS.map(([id, label]) => [id, label]));
export const PART_SINGULAR = Object.fromEntries(PARTS.map(([id, , singular]) => [id, singular]));
const PART_IDS = new Set(PARTS.map(([id]) => [id][0]));

const HEX_COLOR = /^#[0-9a-f]{6}$/i;
const API = 'https://api.openai.com/v1';

/* ---------- Bild-Helfer (Canvas-Ersatz für sharp) ---------- */

export function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Bild konnte nicht geladen werden'));
    img.src = src;
  });
}

// Normalisiert auf PNG, max. Kantenlänge maxSize
export async function normalizeImage(dataUrl, maxSize = 1024) {
  const img = await loadImage(dataUrl);
  const scale = Math.min(1, maxSize / Math.max(img.width, img.height));
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(img.width * scale));
  c.height = Math.max(1, Math.round(img.height * scale));
  c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
  return c.toDataURL('image/png');
}

export function dataUrlToBlob(dataUrl) {
  const [head, b64] = dataUrl.split(',');
  const mime = /data:(.*?);/.exec(head)?.[1] || 'image/png';
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

function normalizeBoundingBox(value = {}) {
  const box = value && typeof value === 'object' ? value : {};
  const num = (key, fallback) => Number.isFinite(Number(box[key])) ? Math.round(Number(box[key])) : fallback;
  const x = Math.max(0, Math.min(999, num('x', 0)));
  const y = Math.max(0, Math.min(999, num('y', 0)));
  const width = Math.max(1, Math.min(1000 - x, num('width', 1000 - x)));
  const height = Math.max(1, Math.min(1000 - y, num('height', 1000 - y)));
  return { x, y, width, height };
}

export function normalizeMetadata(value = {}) {
  const m = value && typeof value === 'object' ? value : {};
  return {
    name: typeof m.name === 'string' ? m.name.trim().slice(0, 120) || 'Neues Teil' : 'Neues Teil',
    part: PART_IDS.has(m.part) ? m.part : 'upperbody',
    color: typeof m.color === 'string' && HEX_COLOR.test(m.color) ? m.color.toLowerCase() : '#d8d0c2',
    secondaryColor: typeof m.secondaryColor === 'string' && HEX_COLOR.test(m.secondaryColor) ? m.secondaryColor.toLowerCase() : null,
    material: typeof m.material === 'string' && m.material.trim() ? m.material.trim().slice(0, 40) : null,
    pattern: typeof m.pattern === 'string' && m.pattern.trim() ? m.pattern.trim().slice(0, 40) : null,
    tags: Array.isArray(m.tags) ? m.tags.filter((t) => typeof t === 'string').map((t) => t.trim().toLowerCase().slice(0, 40)).filter(Boolean).slice(0, 12) : [],
    boundingBox: normalizeBoundingBox(m.boundingBox),
  };
}

// Zuschnitt des erkannten Teils mit Rand (Port von cropDetectedItem)
export async function cropDetectedItem(dataUrl, boundingBox) {
  const img = await loadImage(dataUrl);
  const box = normalizeBoundingBox(boundingBox);
  const rawLeft = (box.x / 1000) * img.width;
  const rawTop = (box.y / 1000) * img.height;
  const rawWidth = (box.width / 1000) * img.width;
  const rawHeight = (box.height / 1000) * img.height;
  const padding = Math.max(12, Math.round(Math.max(rawWidth, rawHeight) * 0.08));
  const left = Math.max(0, Math.floor(rawLeft - padding));
  const top = Math.max(0, Math.floor(rawTop - padding));
  const right = Math.min(img.width, Math.ceil(rawLeft + rawWidth + padding));
  const bottom = Math.min(img.height, Math.ceil(rawTop + rawHeight + padding));
  const c = document.createElement('canvas');
  c.width = Math.max(1, right - left);
  c.height = Math.max(1, bottom - top);
  c.getContext('2d').drawImage(img, left, top, c.width, c.height, 0, 0, c.width, c.height);
  return c.toDataURL('image/png');
}

/* ---------- Chroma-Key-Auswahl & Prompts (1:1 aus Wardrobe) ---------- */

export function chooseChromaKey(primary = '#808080') {
  const value = HEX_COLOR.test(primary) ? primary : '#808080';
  const source = [1, 3, 5].map((offset) => Number.parseInt(value.slice(offset, offset + 2), 16));
  const candidates = [[0, 255, 0], [255, 0, 255], [0, 255, 255]];
  const selected = candidates.sort((a, b) => {
    const distance = (color) => color.reduce((total, channel, index) => total + ((channel - source[index]) ** 2), 0);
    return distance(b) - distance(a);
  })[0];
  return `#${selected.map((channel) => channel.toString(16).padStart(2, '0')).join('')}`;
}

export function buildGarmentPrompt(metadata = {}, chromaKey = '#00ff00') {
  const name = metadata.name || 'clothing item';
  const category = metadata.part || 'wardrobe item';
  const primary = metadata.color || 'the exact visible color';
  const secondary = metadata.secondaryColor ? ` with distinct secondary color ${metadata.secondaryColor}` : '';
  const details = Array.isArray(metadata.tags) && metadata.tags.length
    ? metadata.tags.join(', ')
    : 'all visible construction and design details';
  const fabric = metadata.material ? `, made of ${metadata.material}` : '';
  const isPlain = !metadata.pattern || /^(uni|einfarbig|solid|plain)/i.test(metadata.pattern);
  const patternText = !isPlain ? ` with a ${metadata.pattern} pattern` : '';

  return `Use case: background-extraction
Asset type: ecommerce catalog product cutout source

Input image: The reference photograph shows the exact garment, either by itself or worn by a person. Use it only to identify and reconstruct the garment.

Primary request: Reconstruct ONLY the complete empty ${name} (${category}) as a clean, front-facing ecommerce catalog product photograph. If a wearer is present, remove them. Remove every other garment, object, and background element. Show the complete item naturally arranged and symmetrical, with no person, body, mannequin, or hanger visible.

Garment fidelity: Preserve the reference garment's exact primary color ${primary}${secondary}${fabric}${patternText}, material and fabric texture (weave, knit, nap, ribbing – e.g. terry cloth/toweling, corduroy ridges, denim twill, knit structure, whatever is actually visible), silhouette, neckline, sleeves, fastenings, and distinctive details (${details}). Preserve any clearly legible existing graphic or logo exactly, but do not invent or reinterpret uncertain logos, text, pockets, seams, hardware, colors, or decoration.

Composition: Centered straight-on product view. Keep the entire garment inside the frame with generous, even padding on every side. No cropping or truncation.

Background: Perfectly flat, absolutely uniform solid ${chromaKey} chroma-key color, edge-to-edge. No shadows, gradient, texture, vignette, floor, horizon, reflection, or lighting variation.

Lighting: Neutral diffuse product lighting contained on the garment only.

Avoid: person, body, skin, hair, mannequin, hanger, props, other garments, retail tags, cast shadow, contact shadow, reflection, watermark, caption, border, background variation, or chroma spill.

Critical: Use no ${chromaKey} anywhere in the garment. Produce exactly one complete garment with a crisp, separable outer silhouette.`;
}

export const MODELED_PROMPT = 'Create a professional horizontal 3:2 editorial fashion photograph of the person in Image 1 wearing the exact garment from Image 2. Preserve the person\'s recognizable identity, face, hair, age and proportions. Preserve every garment color, material, fit, construction, graphic, logo and distinctive detail. Keep the complete featured item clearly visible and unobstructed, use understated neutral supporting clothes, realistic anatomy, natural light, authentic fabric, a tasteful real-world setting, and leave environmental space around the model. No text, watermark, product mockup, or synthetic appearance.';

export function buildLookPrompt(garmentCount, styleNote) {
  return `Create a professional vertical editorial fashion photograph of the person in Image 1 wearing the complete outfit made of the exact garments from Images 2 to ${garmentCount + 1} together. Preserve the person's recognizable identity, face, hair, age and proportions. Preserve every garment's color, material, fit, construction, graphic, logo and distinctive detail. Combine the garments naturally into one coherent, well-fitting outfit; add nothing that is not provided except minimal neutral basics where a slot is missing. Realistic anatomy, natural light, authentic fabric, a tasteful real-world setting with environmental space around the model. No text, watermark, product mockup, or synthetic appearance.${styleNote ? `\nStyling direction: ${styleNote}` : ''}`;
}

/* ---------- OpenAI-Aufrufe ---------- */

function apiError(result, status, fallback) {
  const detail = result?.error?.message || '';
  if (status === 401) return 'OpenAI-Schlüssel ungültig – bitte in den Einstellungen prüfen.';
  if (status === 429) return detail.includes('quota') ? 'OpenAI-Guthaben aufgebraucht – bitte Billing prüfen.' : 'OpenAI-Ratenlimit erreicht – kurz warten und erneut versuchen.';
  return detail ? `${fallback}: ${detail.slice(0, 180)}` : `${fallback} (HTTP ${status})`;
}

export async function openAIEdit({ key, model, prompt, images, size, quality }) {
  const form = new FormData();
  form.set('model', model || DEFAULTS.imageModel);
  form.set('prompt', prompt);
  form.set('size', size || '1024x1024');
  form.set('quality', quality || DEFAULTS.quality);
  form.set('output_format', 'png');
  images.forEach((dataUrl, index) => {
    form.append('image[]', dataUrlToBlob(dataUrl), `image-${index + 1}.png`);
  });
  const response = await fetch(`${API}/images/edits`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}` },
    body: form,
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(apiError(result, response.status, 'Bildgenerierung fehlgeschlagen'));
  const encoded = result.data?.[0]?.b64_json;
  if (!encoded) throw new Error('OpenAI hat kein Bild geliefert');
  return `data:image/png;base64,${encoded}`;
}

const ANALYZE_SCHEMA = {
  type: 'object', additionalProperties: false,
  properties: {
    items: {
      type: 'array', minItems: 0, maxItems: 8,
      items: {
        type: 'object', additionalProperties: false,
        properties: {
          name: { type: 'string' },
          part: { type: 'string', enum: ['upperbody', 'wholebody_up', 'lowerbody', 'accessories_up', 'shoes'] },
          color: { type: 'string', pattern: '^#[0-9A-Fa-f]{6}$' },
          secondaryColor: { anyOf: [{ type: 'string', pattern: '^#[0-9A-Fa-f]{6}$' }, { type: 'null' }] },
          material: { type: 'string' },
          pattern: { type: 'string' },
          tags: { type: 'array', items: { type: 'string' }, maxItems: 4 },
          boundingBox: {
            type: 'object', additionalProperties: false,
            properties: {
              x: { type: 'integer', minimum: 0, maximum: 999 },
              y: { type: 'integer', minimum: 0, maximum: 999 },
              width: { type: 'integer', minimum: 1, maximum: 1000 },
              height: { type: 'integer', minimum: 1, maximum: 1000 },
            },
            required: ['x', 'y', 'width', 'height'],
          },
        },
        required: ['name', 'part', 'color', 'secondaryColor', 'material', 'pattern', 'tags', 'boundingBox'],
      },
    },
  },
  required: ['items'],
};

export async function openAIAnalyze({ key, model, imageDataUrl }) {
  const response = await fetch(`${API}/responses`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: model || DEFAULTS.visionModel,
      input: [{ role: 'user', content: [
        { type: 'input_text', text: "Identify every distinct wearable clothing item visible in this image. A photo may show one isolated garment or a person wearing several items. Return one record per actual item that should enter a wardrobe. Ignore the person's body and non-wearable background objects. For each item, include a tight bounding box around only that item using integer coordinates normalized to a 1000 by 1000 image: x and y are the top-left corner, followed by width and height. Boxes may overlap when garments overlap, but each box must focus on one distinct item. Use only these category ids: upperbody, wholebody_up, lowerbody, accessories_up, shoes. Suggest a concise specific name in German, primary hex color, optional genuinely distinct secondary hex color, and 1-4 useful lowercase German detail tags. Also look closely at the actual fabric surface (weave, knit, nap, sheen, ribbing) rather than just the color, and fill 'material' with the fabric in German from categories like: Baumwolle, Frottee/Frotteestoff (terry cloth/toweling, looks like a towel), Cord, Denim/Jeansstoff, Leinen, Wolle, Strickware, Fleece, Leder, Kunstleder, Wildleder, Seide, Satin, Samt, Chiffon, Spitze, Neopren, Polyester, Netzstoff/Mesh, Filz (or the closest accurate description if none fit); fill 'pattern' in German from categories like: Uni/Einfarbig, Gestreift, Kariert, Geblümt, Gepunktet, Animal Print, Camouflage, Paisley, Colorblock, Aufdruck/Print, Ombré (or the closest accurate description). Use 'Uni/Einfarbig' as pattern only when the surface is genuinely a single flat color with no texture-based pattern." },
        { type: 'input_image', image_url: imageDataUrl },
      ] }],
      text: { format: { type: 'json_schema', name: 'wardrobe_items', strict: true, schema: ANALYZE_SCHEMA } },
    }),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(apiError(result, response.status, 'Bildanalyse fehlgeschlagen'));
  const outputText = result.output_text
    || result.output?.flatMap((item) => item.content || []).find((item) => item.type === 'output_text')?.text;
  if (!outputText) throw new Error('Die Analyse lieferte kein Ergebnis');
  const parsed = JSON.parse(outputText);
  if (!Array.isArray(parsed.items)) throw new Error('Die Analyse lieferte keine Kleidungsliste');
  return parsed.items.map(normalizeMetadata);
}

/* ---------- Chroma-Key-Entfernung (Canvas-Port von processChromaBackground) ---------- */

function cleanupToleranceValue(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(18, Math.min(110, Math.round(parsed))) : 46;
}

function removeKeyedSpill(data, index, keyedChannels, neutralLevel) {
  let remaining = Math.ceil(keyedChannels.reduce((total, channel) => total + data[index + channel], 0) - (neutralLevel * keyedChannels.length));
  let active = keyedChannels.filter((channel) => data[index + channel] > 0);
  while (remaining > 0 && active.length) {
    const share = Math.ceil(remaining / active.length);
    const next = [];
    for (const channel of active) {
      const reduction = Math.min(data[index + channel], share, remaining);
      data[index + channel] -= reduction;
      remaining -= reduction;
      if (data[index + channel] > 0) next.push(channel);
    }
    active = next;
  }
}

function imageDataFrom(img) {
  const c = document.createElement('canvas');
  c.width = img.width;
  c.height = img.height;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(img, 0, 0);
  return { canvas: c, ctx, imageData: ctx.getImageData(0, 0, c.width, c.height) };
}

// Beschneidet auf sichtbare Pixel und zentriert auf quadratischer Leinwand (frameTransparentGarment)
function frameTransparent(imageData, width, height, canvasSize = 1024, occupancy = 0.88) {
  const data = imageData.data;
  let minX = width, minY = height, maxX = -1, maxY = -1;
  for (let i = 0, p = 0; i < data.length; i += 4, p += 1) {
    if (data[i + 3] <= 8) continue;
    const x = p % width;
    const y = Math.floor(p / width);
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  }
  if (maxX < minX || maxY < minY) throw new Error('Nach der Freistellung ist kein Kleidungsstück mehr sichtbar');

  const src = document.createElement('canvas');
  src.width = width; src.height = height;
  src.getContext('2d').putImageData(imageData, 0, 0);

  const tw = maxX - minX + 1, th = maxY - minY + 1;
  const target = Math.max(1, Math.round(canvasSize * Math.max(0.5, Math.min(0.96, occupancy))));
  const scale = Math.min(target / tw, target / th);
  const dw = Math.max(1, Math.round(tw * scale)), dh = Math.max(1, Math.round(th * scale));
  const out = document.createElement('canvas');
  out.width = canvasSize; out.height = canvasSize;
  const octx = out.getContext('2d', { willReadFrequently: true });
  octx.drawImage(src, minX, minY, tw, th, Math.floor((canvasSize - dw) / 2), Math.floor((canvasSize - dh) / 2), dw, dh);
  return out;
}

/**
 * Entfernt den Chroma-Hintergrund; liefert { dataUrl, contaminatedPixels, tolerance }.
 * Bei contaminatedPixels > 1 sollte die App den Cleanup-Editor anbieten (wie Wardrobe).
 */
export async function processChromaBackground(dataUrl, key, options = {}) {
  const tolerance = cleanupToleranceValue(options.tolerance);
  const feather = 80;
  const target = [1, 3, 5].map((offset) => Number.parseInt(key.slice(offset, offset + 2), 16));
  const keyedChannels = target.map((channel, index) => channel > 200 ? index : null).filter((index) => index !== null);
  const neutralChannels = target.map((channel, index) => channel < 55 ? index : null).filter((index) => index !== null);

  const img = await loadImage(dataUrl);
  const { imageData } = imageDataFrom(img);
  const data = imageData.data;

  for (let index = 0; index < data.length; index += 4) {
    const distance = Math.sqrt(
      ((data[index] - target[0]) ** 2)
      + ((data[index + 1] - target[1]) ** 2)
      + ((data[index + 2] - target[2]) ** 2),
    );
    if (distance <= tolerance) {
      data[index] = 0; data[index + 1] = 0; data[index + 2] = 0; data[index + 3] = 0;
    } else {
      if (distance < tolerance + feather) data[index + 3] = Math.round(data[index + 3] * ((distance - tolerance) / feather));
      const keyedLevel = keyedChannels.reduce((total, channel) => total + data[index + channel], 0) / keyedChannels.length;
      const neutralLevel = neutralChannels.reduce((total, channel) => total + data[index + channel], 0) / neutralChannels.length;
      const spill = Math.max(0, keyedLevel - neutralLevel);
      if (spill > 0) {
        const spillAlpha = Math.max(0, 1 - (Math.max(0, spill - 4) / 150));
        data[index + 3] = Math.round(data[index + 3] * spillAlpha);
        removeKeyedSpill(data, index, keyedChannels, neutralLevel);
      }
      if (data[index + 3] <= 8) {
        data[index] = 0; data[index + 1] = 0; data[index + 2] = 0; data[index + 3] = 0;
      }
    }
  }
  for (let index = 0; index < data.length; index += 4) {
    if (data[index + 3] === 0) continue;
    const keyedLevel = keyedChannels.reduce((total, channel) => total + data[index + channel], 0) / keyedChannels.length;
    const neutralLevel = neutralChannels.reduce((total, channel) => total + data[index + channel], 0) / neutralChannels.length;
    if (keyedLevel - neutralLevel > 0) removeKeyedSpill(data, index, keyedChannels, neutralLevel);
  }

  const framed = frameTransparent(imageData, img.width, img.height);
  const fctx = framed.getContext('2d', { willReadFrequently: true });
  const framedData = fctx.getImageData(0, 0, framed.width, framed.height);
  const fd = framedData.data;
  let contaminatedPixels = 0;
  for (let index = 0; index < fd.length; index += 4) {
    if (fd[index + 3] === 0) continue;
    const keyedLevel = keyedChannels.reduce((total, channel) => total + fd[index + channel], 0) / keyedChannels.length;
    const neutralLevel = neutralChannels.reduce((total, channel) => total + fd[index + channel], 0) / neutralChannels.length;
    const spill = Math.max(0, keyedLevel - neutralLevel);
    if (spill > 0) removeKeyedSpill(fd, index, keyedChannels, neutralLevel);
    const postKeyed = keyedChannels.reduce((total, channel) => total + fd[index + channel], 0) / keyedChannels.length;
    const postNeutral = neutralChannels.reduce((total, channel) => total + fd[index + channel], 0) / neutralChannels.length;
    if (postKeyed - postNeutral > 1.5) contaminatedPixels += 1;
  }
  fctx.putImageData(framedData, 0, 0);
  return { dataUrl: framed.toDataURL('image/png'), contaminatedPixels, tolerance };
}
