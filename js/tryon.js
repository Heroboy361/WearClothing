// KI-Anprobe: schickt das Nutzerfoto + Kleidungsstücke an die Gemini-Bild-KI
// und erhält ein fotorealistisch editiertes Bild zurück.
// Der API-Schlüssel gehört dem Nutzer (kostenlos via https://aistudio.google.com/apikey)
// und wird nur lokal gespeichert. Fotos werden ausschließlich beim Generieren übertragen.

const MODEL = 'gemini-2.5-flash-image';
const TEXT_MODEL = 'gemini-2.5-flash';
const API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';
const ENDPOINT = `${API_BASE}/${MODEL}:generateContent`;

const SLOT_LABEL_EN = {
  oberteil: 'top (shirt/t-shirt/sweater/dress)',
  jacke: 'jacket/coat',
  hose: 'bottoms (pants/shorts/skirt)',
  schuhe: 'shoes',
  socken: 'socks',
  unterwaesche: 'underwear',
  uhr: 'watch',
  kette: 'necklace',
};

function dataUrlToInline(dataUrl) {
  const [head, data] = dataUrl.split(',');
  const mime = /data:(.*?);/.exec(head)?.[1] || 'image/jpeg';
  return { inlineData: { mimeType: mime, data } };
}

/**
 * Baut die Editier-Anweisung für die KI.
 * @param slots    { oberteil: {action:'keep'|'strip'|'swap', item?}, ... }
 * @param auto     true = KI entscheidet anhand der Stilregeln selbst
 * @param rules    Stilregeln des Nutzers
 * @param hasFace  ob ein separates Gesichtsfoto mitgeschickt wird
 * @param garmentsWithImage Anzahl mitgeschickter Kleidungsbilder
 */
export function buildPrompt({ slots, auto, rules, hasFace, garments }) {
  const lines = [
    'You are a professional virtual try-on photo editor.',
    'IMAGE 1 is the person. Edit IMAGE 1 only.',
    'Strictly preserve: the person\'s identity and face, hair, skin tone, body shape and proportions, pose, hands, the background and the lighting/photo style. The result must be ultra-photorealistic and look like the same photo, only with different clothing.',
  ];
  if (hasFace) lines.push('IMAGE 2 shows the same person\'s face as an identity reference – use it to keep the face accurate.');

  let imgIndex = hasFace ? 3 : 2;
  const tasks = [];
  for (const g of garments) {
    const ref = g.image ? `the garment shown in IMAGE ${imgIndex++}` : `this garment: ${g.desc}`;
    tasks.push(`Replace the person's ${SLOT_LABEL_EN[g.slot] || g.slot} with ${ref}${g.image ? ` (${g.desc})` : ''}. Fit it naturally to the person's body, proportions and pose with realistic fabric folds, correct size and perspective.`);
  }
  for (const [slot, s] of Object.entries(slots)) {
    if (s.action === 'strip') tasks.push(`Remove the person's ${SLOT_LABEL_EN[slot] || slot} in a natural, appropriate way.`);
  }

  if (auto) {
    lines.push('MODE: automatic styling. From the provided garments, apply the combination that objectively looks best on this person and matches these style preferences: ' + describeRules(rules) + '. You may skip garments that would not improve the outfit. Everything not swapped stays exactly as in IMAGE 1.');
    if (tasks.length) lines.push('Candidate changes: ' + tasks.join(' '));
  } else {
    lines.push('Perform exactly these changes and nothing else: ' + (tasks.length ? tasks.join(' ') : 'no changes.'));
    lines.push('All clothing not mentioned above stays exactly as in IMAGE 1.');
  }
  lines.push('Output only the edited photorealistic image, full frame, same crop as IMAGE 1.');
  return lines.join('\n');
}

function describeRules(rules) {
  const r = [];
  if (rules?.max3) r.push('maximum 3 colors per outfit');
  if (rules?.mono) r.push('prefer monochrome/tonal looks');
  if (rules?.neutral) r.push('prefer neutral base colors (black, white, grey, beige, navy)');
  if (rules?.accent) r.push('one accent color is allowed');
  if (rules?.metal) r.push('jewelry metals should match');
  if (rules?.favColors?.length) r.push('favorite colors: ' + rules.favColors.join(', '));
  return r.length ? r.join('; ') : 'a clean, modern, well-coordinated look';
}

/**
 * Ruft die Bild-KI auf und liefert das Ergebnis als DataURL.
 * @returns {Promise<string>} dataURL des generierten Bildes
 */
export async function generateTryOn({ apiKey, prompt, personImage, faceImage, garments }) {
  const parts = [{ text: prompt }, dataUrlToInline(personImage)];
  if (faceImage) parts.push(dataUrlToInline(faceImage));
  for (const g of garments) if (g.image) parts.push(dataUrlToInline(g.image));

  const res = await fetch(`${ENDPOINT}?key=${encodeURIComponent(apiKey)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts }],
      generationConfig: { responseModalities: ['IMAGE'] },
    }),
  });

  if (!res.ok) {
    let msg = `KI-Anfrage fehlgeschlagen (HTTP ${res.status})`;
    try {
      const err = await res.json();
      const detail = err?.error?.message || '';
      if (res.status === 400 && /api key/i.test(detail)) msg = 'API-Schlüssel ungültig – bitte im Profil prüfen.';
      else if (res.status === 429) msg = 'Tageslimit der kostenlosen KI-Nutzung erreicht – bitte später erneut versuchen.';
      else if (detail) msg += ': ' + detail.slice(0, 160);
    } catch { /* Rohfehler reicht */ }
    throw new Error(msg);
  }

  const data = await res.json();
  const partsOut = data?.candidates?.[0]?.content?.parts || [];
  const imgPart = partsOut.find((p) => p.inlineData?.data || p.inline_data?.data);
  if (!imgPart) {
    const block = data?.candidates?.[0]?.finishReason || data?.promptFeedback?.blockReason;
    throw new Error('Die KI hat kein Bild geliefert' + (block ? ` (${block})` : '') + ' – bitte mit anderem Foto/Teil erneut versuchen.');
  }
  const inline = imgPart.inlineData || imgPart.inline_data;
  return `data:${inline.mimeType || inline.mime_type || 'image/png'};base64,${inline.data}`;
}

/* ---------- KI-Produktanalyse (Kleiderschrank) ---------- */

const CATEGORIES = ['tshirt', 'longsleeve', 'jacke', 'hose', 'shorts', 'rock', 'kleid', 'schuhe', 'socken', 'unterwaesche', 'uhr', 'kette'];

/**
 * Analysiert ein Produkt per KI: liest bei einer Shop-URL die Produktseite
 * (Name, Farbe wie "Ocean Blue", Größe, Abmaße, Marke) und/oder erkennt die
 * Kategorie und Farbe visuell aus dem Produktbild.
 * @returns {Promise<{name, category, colorName, colorHex, size, dimensions, brand}>}
 */
export async function aiAnalyzeItem({ apiKey, link, image }) {
  const instruction = [
    'You are a product analyzer for a virtual try-on wardrobe app.',
    link ? `Read the product page at this URL and extract its data: ${link}` : '',
    image ? 'Also analyze the attached product photo (garment category and color).' : '',
    'Respond with ONLY minified JSON, no markdown, exactly this shape:',
    `{"name":"short product name, German if the shop is German, else original","category":"one of ${CATEGORIES.join('|')}","color_name":"the shop's marketing color name if stated (e.g. Ocean Blue), else a German color word","color_hex":"#rrggbb approximation of the main color","size":"the selected/stated size or null","dimensions":"stated measurements/Abmaße or null","brand":"brand name or null"}`,
    'If the URL cannot be read, derive as much as possible from the URL text itself' + (image ? ' and the photo' : '') + '.',
  ].filter(Boolean).join('\n');

  const parts = [{ text: instruction }];
  if (image) parts.push(dataUrlToInline(image));

  const body = { contents: [{ parts }] };
  if (link) body.tools = [{ url_context: {} }];

  const res = await fetch(`${API_BASE}/${TEXT_MODEL}:generateContent?key=${encodeURIComponent(apiKey)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error('Analyse fehlgeschlagen (HTTP ' + res.status + ')');

  const data = await res.json();
  const text = (data?.candidates?.[0]?.content?.parts || [])
    .map((p) => p.text || '')
    .join('');
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('Keine auswertbare Antwort');
  const raw = JSON.parse(jsonMatch[0]);

  return {
    name: typeof raw.name === 'string' && raw.name.trim() ? raw.name.trim().slice(0, 60) : null,
    category: CATEGORIES.includes(raw.category) ? raw.category : null,
    colorName: typeof raw.color_name === 'string' && raw.color_name.trim() ? raw.color_name.trim().slice(0, 32) : null,
    colorHex: /^#[0-9a-f]{6}$/i.test(raw.color_hex || '') ? raw.color_hex : null,
    size: typeof raw.size === 'string' && raw.size.trim() ? raw.size.trim().slice(0, 24) : null,
    dimensions: typeof raw.dimensions === 'string' && raw.dimensions.trim() ? raw.dimensions.trim().slice(0, 80) : null,
    brand: typeof raw.brand === 'string' && raw.brand.trim() ? raw.brand.trim().slice(0, 32) : null,
  };
}
