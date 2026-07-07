// Stilberater: Farbharmonie-Analyse + kurze Bewertung (1–3 Sätze) auf Deutsch.

export function hexToHsl(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || '');
  if (!m) return { h: 0, s: 0, l: 50 };
  const n = parseInt(m[1], 16);
  const r = ((n >> 16) & 255) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  let h = 0, s = 0;
  if (max !== min) {
    const dlt = max - min;
    s = l > 0.5 ? dlt / (2 - max - min) : dlt / (max + min);
    if (max === r) h = ((g - b) / dlt + (g < b ? 6 : 0));
    else if (max === g) h = (b - r) / dlt + 2;
    else h = (r - g) / dlt + 4;
    h *= 60;
  }
  return { h, s: s * 100, l: l * 100 };
}

const hueDist = (a, b) => Math.min(Math.abs(a - b), 360 - Math.abs(a - b));

export function isNeutral(hex) {
  const { s, l } = hexToHsl(hex);
  return s < 16 || l < 14 || l > 92 || isBeigeNavy(hex);
}
function isBeigeNavy(hex) {
  const { h, s, l } = hexToHsl(hex);
  const beige = h >= 25 && h <= 55 && s < 40 && l > 55;
  const navy = h >= 200 && h <= 250 && l < 32;
  return beige || navy;
}

export function colorName(hex) {
  const { h, s, l } = hexToHsl(hex);
  if (l < 14) return 'Schwarz';
  if (l > 92 && s < 20) return 'Weiß';
  if (s < 12) return l > 60 ? 'Hellgrau' : 'Grau';
  if (h >= 25 && h <= 55 && s < 45 && l > 55) return 'Beige';
  if (h < 15 || h >= 345) return 'Rot';
  if (h < 40) return 'Orange/Braun';
  if (h < 70) return 'Gelb';
  if (h < 160) return 'Grün';
  if (h < 200) return 'Türkis';
  if (h < 250) return l < 32 ? 'Navy' : 'Blau';
  if (h < 290) return 'Violett';
  return 'Pink';
}

// Gruppiert ähnliche Farben, damit z. B. zwei fast identische Weißtöne als eine Farbe zählen
function distinctColors(hexes) {
  const groups = [];
  for (const hex of hexes) {
    const c = hexToHsl(hex);
    const hit = groups.find((g) => {
      const bothNeutral = isNeutral(hex) && isNeutral(g.hex);
      if (bothNeutral) return Math.abs(c.l - g.hsl.l) < 22;
      return hueDist(c.h, g.hsl.h) < 22 && Math.abs(c.l - g.hsl.l) < 30;
    });
    if (!hit) groups.push({ hex, hsl: c });
  }
  return groups;
}

function harmonyType(colored) {
  if (colored.length <= 1) return 'mono';
  const hues = colored.map((c) => c.hsl.h);
  let maxD = 0;
  for (let i = 0; i < hues.length; i++)
    for (let j = i + 1; j < hues.length; j++)
      maxD = Math.max(maxD, hueDist(hues[i], hues[j]));
  if (maxD < 25) return 'mono';
  if (maxD < 70) return 'analog';
  if (maxD > 150 && maxD < 210 && colored.length === 2) return 'komplementär';
  return 'gemischt';
}

/**
 * Bewertet ein Outfit.
 * @param items   getragene Teile [{name, type, color}]
 * @param profile {hair, eyes, skin}
 * @param rules   {max3, mono, neutral, accent, metal, favColors[]}
 * @returns {score: 0..100, text: '1–3 Sätze'}
 */
export function analyzeOutfit(items, profile, rules) {
  if (!items.length) {
    return { score: 0, text: 'Du trägst gerade noch nichts – zieh deinem Avatar erst ein paar Teile an, dann sage ich dir, wie es wirkt.' };
  }

  const clothes = items.filter((i) => !['uhr', 'kette'].includes(i.type));
  const jewelry = items.filter((i) => ['uhr', 'kette'].includes(i.type));
  const groups = distinctColors(clothes.map((i) => i.color));
  const neutrals = groups.filter((gr) => isNeutral(gr.hex));
  const colored = groups.filter((gr) => !isNeutral(gr.hex));
  const harmony = harmonyType(colored);

  let score = 70;
  const good = [];
  const bad = [];

  // Farbanzahl (3-Farben-Regel)
  if (rules?.max3 && groups.length > 3) {
    score -= 18;
    bad.push(`mit ${groups.length} verschiedenen Farben wird es etwas unruhig – deine 3-Farben-Regel würde hier helfen`);
  } else if (groups.length <= 3) {
    score += 8;
    good.push('die reduzierte Farbpalette wirkt aufgeräumt und modern');
  }

  // Harmonie
  if (harmony === 'mono') {
    score += 12;
    good.push('der Ton-in-Ton-Look wirkt sehr edel und gestreckt');
  } else if (harmony === 'analog') {
    score += 8;
    good.push('die Farben liegen nah beieinander und harmonieren weich miteinander');
  } else if (harmony === 'komplementär') {
    score += 6;
    good.push('der Komplementärkontrast setzt ein mutiges, gezieltes Statement');
  } else if (colored.length >= 3) {
    score -= 12;
    bad.push('die Buntfarben beißen sich leicht – eine davon gegen eine neutrale Farbe zu tauschen würde das Outfit beruhigen');
  }

  // Neutral-Regel
  if (rules?.neutral && colored.length > (rules?.accent ? 1 : 0)) {
    score -= 8;
    bad.push('laut deiner Regel „neutrale Basisfarben“ ist hier etwas viel Farbe im Spiel');
  }
  if (neutrals.length && colored.length === 1) {
    score += 6;
    good.push(`die Akzentfarbe ${colorName(colored[0].hex)} kommt vor der neutralen Basis richtig gut zur Geltung`);
  }

  // Abgleich mit Haaren / Augen
  const hair = hexToHsl(profile?.hair || '#3b2a1e');
  const eyes = hexToHsl(profile?.eyes || '#4a6b8a');
  for (const gr of colored) {
    if (hueDist(gr.hsl.h, eyes.h) < 30 && eyes.s > 15) {
      score += 6;
      good.push(`das ${colorName(gr.hex)} greift deine Augenfarbe auf und lässt sie leuchten`);
      break;
    }
  }
  for (const gr of colored) {
    if (hueDist(gr.hsl.h, hair.h) < 25 && Math.abs(gr.hsl.l - hair.l) < 25) {
      score += 4;
      good.push('einer der Töne matcht mit deinen Haaren – das bindet den Look zusammen');
      break;
    }
  }

  // Lieblingsfarben
  if (rules?.favColors?.length) {
    const favHit = colored.some((gr) => rules.favColors.some((f) => hueDist(hexToHsl(f).h, gr.hsl.h) < 25));
    if (favHit) { score += 4; good.push('deine Lieblingsfarben tauchen im Outfit auf'); }
  }

  // Schmuck
  if (jewelry.length) {
    const metals = jewelry.map((j) => hexToHsl(j.color));
    const warm = metals.filter((m) => m.h >= 20 && m.h <= 60 && m.s > 20).length; // Gold
    const cool = metals.length - warm;
    if (rules?.metal && warm && cool) {
      score -= 5;
      bad.push('Gold- und Silbertöne mischen sich beim Schmuck – einheitliche Metalle wirken bewusster');
    } else if (jewelry.length >= 1) {
      score += 4;
      good.push(jewelry.length > 1 ? 'Uhr und Kette runden das Outfit als Finish ab' : `${jewelry[0].type === 'uhr' ? 'die Uhr' : 'die Kette'} gibt dem Look das gewisse Finish`);
    }
  }

  // Vollständigkeit
  const hasTop = clothes.some((i) => ['tshirt', 'longsleeve', 'jacke', 'kleid'].includes(i.type));
  const hasBottom = clothes.some((i) => ['hose', 'shorts', 'rock', 'kleid'].includes(i.type));
  if (!hasTop || !hasBottom) {
    score -= 10;
    bad.push('das Outfit ist noch nicht komplett – ' + (!hasTop ? 'ein Oberteil fehlt noch' : 'unten fehlt noch ein Teil'));
  }

  score = Math.max(5, Math.min(98, Math.round(score)));

  // 1–3 Sätze bauen
  const sentences = [];
  if (score >= 82) sentences.push('Das sieht richtig gut aus! ✨');
  else if (score >= 65) sentences.push('Solider Look mit Potenzial.');
  else sentences.push('Hm, da geht noch was.');

  if (good.length) sentences.push(cap(good[0]) + (good[1] ? ', und ' + good[1] : '') + '.');
  if (bad.length) sentences.push(cap(bad[0]) + '.');
  else if (good[2]) sentences.push(cap(good[2]) + '.');

  return { score, text: sentences.slice(0, 3).join(' ') };
}

const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
