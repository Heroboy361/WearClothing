// Shop-Link-Analyse per Gemini (optional): liest die Produktseite hinter einer URL
// und liefert Name, Kategorie, Farbe, Größe und Marke. Nur nötig für den Link-Import –
// der Foto-Import läuft komplett über OpenAI.

const API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';
const TEXT_MODEL = 'gemini-2.5-flash';

const CATEGORY_TO_PART = {
  tshirt: 'upperbody', longsleeve: 'upperbody', kleid: 'upperbody',
  jacke: 'wholebody_up',
  hose: 'lowerbody', shorts: 'lowerbody', rock: 'lowerbody', unterwaesche: 'lowerbody',
  schuhe: 'shoes', socken: 'shoes',
  uhr: 'accessories_up', kette: 'accessories_up',
};
const CATEGORIES = Object.keys(CATEGORY_TO_PART);

export async function analyzeShopUrl({ apiKey, link }) {
  const instruction = [
    'You are a product analyzer for a virtual wardrobe app.',
    `Read the product page at this URL and extract its data: ${link}`,
    'Respond with ONLY minified JSON, no markdown, exactly this shape:',
    `{"name":"short product name, German if the shop is German, else original","category":"one of ${CATEGORIES.join('|')}","color_name":"the shop's marketing color name if stated (e.g. Ocean Blue), else a German color word","color_hex":"#rrggbb approximation of the main color","size":"the selected/stated size or null","brand":"brand name or null","tags":["1-4 lowercase German detail tags"]}`,
    'If the URL cannot be read, derive as much as possible from the URL text itself.',
  ].join('\n');

  const response = await fetch(`${API_BASE}/${TEXT_MODEL}:generateContent?key=${encodeURIComponent(apiKey)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: instruction }] }],
      tools: [{ url_context: {} }],
    }),
  });
  if (!response.ok) throw new Error('Link-Analyse fehlgeschlagen (HTTP ' + response.status + ')');

  const data = await response.json();
  const text = (data?.candidates?.[0]?.content?.parts || []).map((p) => p.text || '').join('');
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('Keine auswertbare Antwort');
  const raw = JSON.parse(jsonMatch[0]);

  return {
    name: typeof raw.name === 'string' && raw.name.trim() ? raw.name.trim().slice(0, 80) : null,
    part: CATEGORY_TO_PART[raw.category] || null,
    colorName: typeof raw.color_name === 'string' && raw.color_name.trim() ? raw.color_name.trim().slice(0, 32) : null,
    color: /^#[0-9a-f]{6}$/i.test(raw.color_hex || '') ? raw.color_hex.toLowerCase() : null,
    size: typeof raw.size === 'string' && raw.size.trim() ? raw.size.trim().slice(0, 24) : null,
    brand: typeof raw.brand === 'string' && raw.brand.trim() ? raw.brand.trim().slice(0, 32) : null,
    tags: Array.isArray(raw.tags) ? raw.tags.filter((t) => typeof t === 'string').map((t) => t.trim().toLowerCase()).filter(Boolean).slice(0, 4) : [],
  };
}
