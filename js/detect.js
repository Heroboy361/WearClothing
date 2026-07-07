// Automatische Erkennung von Kategorie, Farbe und Name aus Shop-Link und/oder Bild.

// Reihenfolge wichtig: spezifische Begriffe vor generischen (z. B. sweatshirt vor shirt).
const TYPE_KEYWORDS = [
  ['uhr',        ['armbanduhr', 'watch', 'chronograph', ' uhr', '-uhr', 'uhr-']],
  ['kette',      ['halskette', 'kette', 'necklace', 'collier', 'chain', 'anhaenger', 'anhänger']],
  ['socken',     ['socke', 'socks', 'sock', 'strumpf', 'struempfe', 'strümpfe', 'kniestrumpf']],
  ['unterwaesche', ['unterhose', 'boxershort', 'boxer-brief', 'boxerbrief', 'retroshort', 'slip', 'panty', 'panties', 'tanga', 'string', 'unterwaesche', 'unterwäsche', 'underwear', 'bralette', 'buegel-bh', 'bh-', '-bh', 'bra-', 'dessous']],
  ['schuhe',     ['sneaker', 'schuh', 'shoe', 'boot', 'stiefel', 'sandale', 'loafer', 'slipper', 'trainer', 'laufschuh']],
  ['longsleeve', ['sweatshirt', 'sweater', 'hoodie', 'kapuzenpullover', 'pullover', 'pulli', 'langarm', 'longsleeve', 'strickjacke', 'strick', 'cardigan', 'sweat']],
  ['jacke',      ['jacke', 'jacket', 'mantel', 'coat', 'blazer', 'parka', 'weste', 'vest', 'windbreaker', 'daunen']],
  ['shorts',     ['shorts', 'kurze-hose', 'bermuda', 'badehose', 'badeshorts']],
  ['hose',       ['hose', 'jeans', 'chino', 'jogger', 'jogging', 'cargo', 'pants', 'trousers', 'leggings', 'schlupfhose']],
  ['kleid',      ['kleid', 'dress']],
  ['rock',       ['rock', 'skirt']],
  ['tshirt',     ['t-shirt', 'tshirt', 'tee', 'shirt', 'top', 'polo', 'tanktop']],
];

const COLOR_KEYWORDS = [
  ['schwarz|black', '#17181c', 'Schwarzes'],
  ['weiss|weiß|white|offwhite|off-white', '#f2f0ea', 'Weißes'],
  ['hellgrau|lightgrey|light-grey', '#c3c6cc', 'Hellgraues'],
  ['grau|grey|gray|anthrazit|charcoal', '#6f7379', 'Graues'],
  ['beige|creme|cream|sand|ecru|taupe', '#d6c6a8', 'Beiges'],
  ['navy|dunkelblau|marine|darkblue|dark-blue', '#1f2a44', 'Dunkelblaues'],
  ['hellblau|lightblue|light-blue|babyblau|sky', '#9ec1dd', 'Hellblaues'],
  ['blau|blue|denim|indigo', '#3b6ea5', 'Blaues'],
  ['bordeaux|weinrot|burgund|maroon', '#722f37', 'Bordeauxrotes'],
  ['rot|red', '#b03a3a', 'Rotes'],
  ['olive|oliv', '#6b6b3f', 'Olivfarbenes'],
  ['khaki', '#8a7f5c', 'Khakifarbenes'],
  ['gruen|grün|green|mint|salbei|sage', '#3f6b4f', 'Grünes'],
  ['gelb|yellow|senf|mustard', '#d9b23c', 'Gelbes'],
  ['orange|apricot|koralle|coral', '#d98136', 'Oranges'],
  ['braun|brown|schoko|mokka|cognac|camel', '#6f4e37', 'Braunes'],
  ['rosa|pink|rose|rosé|blush', '#d98fb0', 'Rosafarbenes'],
  ['lila|violett|purple|flieder|lavendel', '#7b5ea7', 'Violettes'],
  ['gold', '#d4af37', 'Goldenes'],
  ['silber|silver', '#c0c4cc', 'Silbernes'],
];

const TYPE_LABEL = {
  tshirt: 'T-Shirt', longsleeve: 'Pullover', jacke: 'Jacke', hose: 'Hose', shorts: 'Shorts',
  rock: 'Rock', kleid: 'Kleid', schuhe: 'Schuhe', socken: 'Socken', unterwaesche: 'Unterwäsche',
  uhr: 'Uhr', kette: 'Kette',
};
// Artikel-korrekte Namensform ("Weiße Hose" statt "Weißes Hose")
const TYPE_GENDER = { hose: 'e', shorts: '', rock: 'er', kleid: 'es', schuhe: 'e', socken: 'e', unterwaesche: 'e', uhr: 'e', kette: 'e', tshirt: 'es', longsleeve: 'er', jacke: 'e' };

function normalize(text) {
  return decodeURIComponent(text || '')
    .toLowerCase()
    .replace(/[_+.,/\\]/g, '-')
    .replace(/%20/g, '-');
}

// Aussagekräftiger Teil einer Shop-URL (Pfad ohne Domain, IDs und Query)
export function slugFromLink(link) {
  try {
    const u = new URL(link);
    const segs = u.pathname.split('/').filter((s) => s && !/^\d+$/.test(s) && !/^[a-z]{1,3}$/.test(s));
    return normalize(segs.join('-'));
  } catch {
    return normalize(link);
  }
}

export function detectType(text) {
  const t = normalize(text);
  for (const [type, words] of TYPE_KEYWORDS) {
    if (words.some((w) => t.includes(w))) return type;
  }
  return null;
}

export function detectColorWord(text) {
  const t = normalize(text);
  for (const [pattern, hex, adjective] of COLOR_KEYWORDS) {
    if (new RegExp(pattern).test(t)) return { hex, adjective };
  }
  return null;
}

// Farbadjektiv passend zum erkannten Hex-Wert (aus Bildanalyse)
export function adjectiveForHex(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || '');
  if (!m) return null;
  const n = parseInt(m[1], 16);
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2 / 255;
  const s = max === min ? 0 : (max - min) / (255 - Math.abs(max + min - 255));
  let h = 0;
  if (max !== min) {
    const d = (max - min);
    if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) * 60;
    else if (max === g) h = ((b - r) / d + 2) * 60;
    else h = ((r - g) / d + 4) * 60;
  }
  if (l < 0.13) return 'Schwarzes';
  if (l > 0.9 && s < 0.25) return 'Weißes';
  if (s < 0.13) return 'Graues';
  if (h < 15 || h >= 345) return 'Rotes';
  if (h < 40) return l < 0.4 ? 'Braunes' : 'Oranges';
  if (h < 65) return 'Gelbes';
  if (h < 160) return 'Grünes';
  if (h < 200) return 'Türkises';
  if (h < 250) return l < 0.3 ? 'Dunkelblaues' : 'Blaues';
  if (h < 290) return 'Violettes';
  return 'Rosafarbenes';
}

// Angepasste Adjektiv-Endung: "Weißes T-Shirt", "Weiße Hose", "Weißer Pullover"
function inflect(adjective, type) {
  const suffix = TYPE_GENDER[type] ?? 'es';
  return adjective.replace(/e[sr]?$/, '') + suffix;
}

/**
 * Analysiert Link + Bildfarbe und liefert {type, color, name, notes[]}.
 * @param link      Shop-URL oder ''
 * @param imageHex  dominante Bildfarbe oder null
 */
export function analyzeItem(link, imageHex) {
  const slug = link ? slugFromLink(link) : '';
  const type = detectType(slug);
  const linkColor = slug ? detectColorWord(slug) : null;

  // Bildfarbe hat Vorrang (real gemessen), sonst Farbwort aus dem Link
  const color = imageHex || linkColor?.hex || '#c8c8c8';
  const adjective = imageHex ? adjectiveForHex(imageHex) : linkColor?.adjective || null;

  const finalType = type || 'tshirt';
  let name;
  if (adjective) name = `${inflect(adjective, finalType)} ${TYPE_LABEL[finalType]}`;
  else if (slug) name = deslugName(slug);
  else name = TYPE_LABEL[finalType];

  const notes = [];
  if (!type) notes.push('Kategorie bitte kurz prüfen');
  if (!imageHex && !linkColor) notes.push('Farbe bitte kurz prüfen');
  return { type: finalType, color, name, detectedType: !!type, notes };
}

function deslugName(slug) {
  const words = slug.split('-').filter((w) => w.length > 1 && !/^\d+$/.test(w)).slice(0, 5);
  const name = words.map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
  return name.slice(0, 42) || 'Neues Teil';
}

export { TYPE_LABEL };
