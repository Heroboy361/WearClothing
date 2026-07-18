// Statische Stil-Wissensdatenbank (Stand Mitte 2026): 8 zentrale Modestile mit
// Farb-/Material-/Schlüsselwort-Signalen und Marken je Preisklasse. Dient der
// kostenlosen, rein lokalen Zuordnung erkannter Teile zu Stilrichtungen und
// Herstellern (kein KI-Aufruf) – ergänzt die freie Text-Erkennung aus der
// Foto-Analyse (Material/Muster/Tags/Marke) um eine strukturierte Einordnung.
import { colorName } from './advisor.js';

export const STYLE_KB = [
  {
    id: 'opium',
    name: 'Opium',
    momentum: 'rising',
    colorWords: ['Schwarz', 'Violett', 'Grau', 'Hellgrau'],
    materialWords: ['leder', 'kunstleder', 'netzstoff', 'mesh'],
    keywords: ['oversized', 'cropped', 'destroyed', 'distressed', 'baggy', 'gothic', 'goth', 'punk', 'spike', 'kreuz', 'nietend', 'nieten', 'balaclava'],
    brands: {
      accessible: ['Bershka', 'HOUSE', 'Zara', 'H&M'],
      midHype: ['Fuga Studios', 'Heliot Emil', 'No Faith Studios', 'Anonymous Club'],
      premiumNiche: ['Rick Owens', 'Balenciaga', 'Vetements', 'Maison Margiela', 'Mihara Yasuhiro', 'Chrome Hearts', 'Parts of Four', 'Raf Simons'],
    },
  },
  {
    id: 'streetwear',
    name: 'Streetwear',
    momentum: 'mature/stable',
    colorWords: [],
    materialWords: ['baumwolle', 'fleece'],
    keywords: ['oversized', 'hoodie', 'sneaker', 'graphic', 'logo', 'baggy', 'cargo', 'streetwear', 'drop-shoulder', 'boxy'],
    brands: {
      accessible: ['Uniqlo', 'H&M', 'Zara', 'Bershka', 'Pull&Bear', 'Nike', 'adidas', 'Carhartt WIP'],
      midHype: ['Stüssy', 'Palace', 'Supreme', 'BAPE', 'Corteiz', 'Aimé Leon Dore', 'Represent', 'Obey', 'Daily Paper', 'Patta', 'Arte Antwerp', "Sp5der", 'Denim Tears'],
      premiumNiche: ['Fear of God', 'Essentials', 'Off-White', 'A-COLD-WALL*', 'Stone Island', 'Brain Dead', 'KITH'],
    },
  },
  {
    id: 'y2k',
    name: 'Y2K',
    momentum: 'mature/stable',
    colorWords: ['Pink', 'Blau', 'Türkis', 'Grau'],
    materialWords: ['denim', 'samt', 'netzstoff', 'mesh'],
    keywords: ['low-rise', 'low rise', 'tiefsitzend', 'crop', 'bauchfrei', 'strass', 'rhinestone', 'glitzer', 'metallic', 'velour', 'schmetterling', 'butterfly', 'chrom'],
    brands: {
      accessible: ['Bershka', 'Zara', 'H&M', 'Pull&Bear', 'ASOS', 'PrettyLittleThing', 'Boohoo', 'Urban Outfitters', 'Shein'],
      midHype: ['Juicy Couture', 'Von Dutch', 'Ed Hardy', 'Baby Phat', 'Miss Sixty', 'Guess', 'Tommy Hilfiger', 'FUBU'],
      premiumNiche: ['Diesel', 'Blumarine', 'Coperni', 'Knwls', 'Miu Miu'],
    },
  },
  {
    id: 'grunge_90s',
    name: '90s Grunge',
    momentum: 'mature/stable',
    colorWords: ['Beige', 'Grau', 'Schwarz', 'Grün', 'Orange/Braun'],
    materialWords: ['cord', 'wolle', 'denim', 'strickware'],
    keywords: ['kariert', 'flanell', 'plaid', 'destroyed', 'distressed', 'vintage', 'oversized', 'grunge', 'used'],
    brands: {
      accessible: ['Urban Outfitters', "Levi's", 'Dr. Martens', 'Converse', 'Vans', 'H&M', 'Carhartt'],
      midHype: ['Pendleton', 'L.L.Bean', 'Woolrich'],
      premiumNiche: ['Magliano', 'Marc Jacobs', 'Fear of God', 'Balenciaga', 'R13', 'Saint Laurent'],
    },
  },
  {
    id: 'old_money',
    name: 'Old Money / Quiet Luxury',
    momentum: 'rising',
    colorWords: ['Navy', 'Beige', 'Weiß', 'Grau', 'Schwarz', 'Orange/Braun', 'Rot'],
    materialWords: ['kaschmir', 'cashmere', 'seide', 'wolle', 'leinen', 'leder'],
    keywords: ['tailored', 'preppy', 'quarter-zip', 'quarterzip', 'oxford', 'loafer', 'blazer', 'cordovan', 'klassisch', 'zeitlos', 'understated'],
    brands: {
      accessible: ['Ralph Lauren', 'Polo Ralph Lauren', 'Uniqlo', 'COS', 'Massimo Dutti', 'Arket', 'Tommy Hilfiger', 'Brooks Brothers', 'Charles & Keith', 'Zara'],
      midHype: ['Max Mara', 'Reiss', 'Sézane', 'Filippa K', 'Pringle', 'Orlebar Brown', 'Barbour'],
      premiumNiche: ['The Row', 'Loro Piana', 'Brunello Cucinelli', 'Hermès', 'Kiton', 'Brioni', 'Zegna', 'Charvet', 'Alden', "Church's"],
    },
  },
  {
    id: 'gorpcore',
    name: 'Gorpcore',
    momentum: 'plateauing (Marken wachsen weiter)',
    colorWords: ['Grün', 'Orange/Braun', 'Schwarz', 'Beige'],
    materialWords: ['fleece', 'neopren', 'polyester'],
    keywords: ['outdoor', 'hiking', 'wander', 'trekking', 'funktional', 'gore-tex', 'goretex', 'ripstop', 'trail', 'regenjacke'],
    brands: {
      accessible: ['The North Face', 'Columbia', 'Patagonia', 'Uniqlo', 'Decathlon', 'Jack Wolfskin', 'Merrell', 'Teva', 'Birkenstock'],
      midHype: ['Salomon', 'Hoka', 'Gramicci', 'Snow Peak', 'And Wander', 'Forét', 'Mammut'],
      premiumNiche: ["Arc'teryx", 'Veilance', 'C.P. Company', 'Klättermusen', 'Norse Projects', 'Aztech Mountain', 'ACRONYM'],
    },
  },
  {
    id: 'coquette',
    name: 'Coquette',
    momentum: 'plateauing/maturing',
    colorWords: ['Pink', 'Weiß', 'Beige', 'Blau', 'Rot'],
    materialWords: ['spitze', 'seide', 'chiffon', 'satin'],
    keywords: ['schleife', 'bow', 'rüsche', 'ruffle', 'romantisch', 'pastell', 'tüll', 'balletcore', 'perlen', 'pearl'],
    brands: {
      accessible: ['Urban Outfitters', 'PrettyLittleThing', 'Free People', 'Zara', 'H&M', 'Sézane', 'Rouje', 'Brandy Melville'],
      midHype: ['LoveShackFancy', 'For Love & Lemons', 'Mirror Palais', 'Hill House Home', 'House of CB', 'Selkie'],
      premiumNiche: ['Miu Miu', 'Vivienne Westwood', 'Blumarine', 'Cecilie Bahnsen', 'Simone Rocha', 'Chopova Lowena', 'Shushu/Tong', 'Sandy Liang'],
    },
  },
  {
    id: 'blokecore',
    name: 'Blokecore',
    momentum: 'rising (WM 2026)',
    colorWords: [],
    materialWords: ['polyester', 'denim', 'baumwolle'],
    keywords: ['trikot', 'jersey', 'fussball', 'fußball', 'soccer', 'terrace', 'retro', 'kit'],
    brands: {
      accessible: ['adidas', 'Nike', 'Puma', 'Umbro', 'Castore', 'Fred Perry', 'Zara', 'Pull&Bear'],
      midHype: ['Wales Bonner', 'Corteiz', 'Dime', 'Stone Island', 'Aimé Leon Dore'],
      premiumNiche: ['Gucci', 'Balenciaga', 'Martine Rose', '3.Paradis', 'Loewe'],
    },
  },
];

const norm = (s) => (s || '').toString().toLowerCase();

function wordHit(haystack, word) {
  const w = norm(word);
  if (!w) return false;
  if (w.length > 3) return haystack.includes(w);
  const padded = ` ${haystack} `;
  return padded.includes(` ${w} `) || padded.includes(` ${w}.`) || padded.includes(` ${w},`);
}

// Ordnet ein Teil (Name/Marke/Material/Muster/Tags/Farben) rein lokal den
// passendsten Stilrichtungen zu und erkennt dabei ggf. auch den Hersteller
// samt Preisklasse (accessible/mid-hype/premium-niche) über die Markenlisten.
export function matchStyles(item = {}) {
  const haystack = norm([item.name, item.material, item.pattern, ...(item.tags || [])].filter(Boolean).join(' '));
  const brandText = norm(item.brand || item.name || '');
  const primaryWord = item.color ? colorName(item.color) : null;
  const secondaryWord = item.secondaryColor ? colorName(item.secondaryColor) : null;

  const scored = STYLE_KB.map((style) => {
    let score = 0;
    let matchedBrand = null;
    for (const tier of ['premiumNiche', 'midHype', 'accessible']) {
      for (const brand of style.brands[tier]) {
        if (wordHit(brandText, brand)) {
          score += tier === 'premiumNiche' ? 45 : tier === 'midHype' ? 40 : 28;
          if (!matchedBrand) matchedBrand = { name: brand, tier };
        }
      }
    }
    for (const word of style.materialWords) if (haystack.includes(norm(word))) score += 14;
    if (primaryWord && style.colorWords.includes(primaryWord)) score += 10;
    if (secondaryWord && style.colorWords.includes(secondaryWord)) score += 6;
    for (const kw of style.keywords) if (haystack.includes(norm(kw))) score += 12;
    return { id: style.id, name: style.name, score, matchedBrand };
  });

  return scored.filter((s) => s.score > 0).sort((a, b) => b.score - a.score).slice(0, 3);
}
