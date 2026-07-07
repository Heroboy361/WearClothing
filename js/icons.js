// Cleanes SVG-Icon-Set (Linien-Stil, an SF Symbols angelehnt).
// Nutzung: icon('shirt') liefert einen SVG-String, Farbe folgt currentColor.

const PATHS = {
  person: '<circle cx="12" cy="7.5" r="3.5"/><path d="M4.5 20c1.4-3.6 4.2-5.5 7.5-5.5s6.1 1.9 7.5 5.5"/>',
  hanger: '<path d="M12 7a2 2 0 1 1 2-2"/><path d="M12 7l8.5 6.2a1.5 1.5 0 0 1-.9 2.8H4.4a1.5 1.5 0 0 1-.9-2.8L12 7z"/>',
  sparkle: '<path d="M12 3l1.6 4.9L18.5 9.5l-4.9 1.6L12 16l-1.6-4.9L5.5 9.5l4.9-1.6L12 3z"/><path d="M18.5 15.5l.7 2.1 2.1.7-2.1.7-.7 2.1-.7-2.1-2.1-.7 2.1-.7.7-2.1z"/>',
  star: '<path d="M12 3.5l2.5 5.2 5.7.8-4.1 4 1 5.7-5.1-2.7-5.1 2.7 1-5.7-4.1-4 5.7-.8L12 3.5z"/>',
  starFill: '<path fill="currentColor" stroke="none" d="M12 3.5l2.5 5.2 5.7.8-4.1 4 1 5.7-5.1-2.7-5.1 2.7 1-5.7-4.1-4 5.7-.8L12 3.5z"/>',
  bulb: '<path d="M9 18h6M10 21h4"/><path d="M12 3a6 6 0 0 1 3.5 10.9c-.8.6-1.2 1.3-1.3 2.1h-4.4c-.1-.8-.5-1.5-1.3-2.1A6 6 0 0 1 12 3z"/>',
  camera: '<rect x="3" y="7" width="18" height="13" rx="3"/><path d="M8.5 7l1.2-2.4h4.6L15.5 7"/><circle cx="12" cy="13.5" r="3.5"/>',
  sliders: '<path d="M4 7h10M18 7h2M4 12h4M12 12h8M4 17h13M20 17h0"/><circle cx="16" cy="7" r="2"/><circle cx="10" cy="12" r="2"/><circle cx="18.5" cy="17" r="2"/>',
  droplet: '<path d="M12 3.5s6 6.2 6 10.5a6 6 0 0 1-12 0C6 9.7 12 3.5 12 3.5z"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  trash: '<path d="M4 7h16M9 7V4.5h6V7M6.5 7l.8 13h9.4l.8-13M10 11v5M14 11v5"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1.3 1.3"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1.3-1.3"/>',
  rotate: '<path d="M20 12a8 8 0 1 1-2.3-5.6"/><path d="M20 3v4h-4"/>',
  lock: '<rect x="5.5" y="10.5" width="13" height="9.5" rx="2.5"/><path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5"/>',
  bookmark: '<path d="M7 4h10a1 1 0 0 1 1 1v15l-6-3.5L6 20V5a1 1 0 0 1 1-1z"/>',
  photo: '<rect x="3.5" y="5" width="17" height="14" rx="2.5"/><circle cx="9" cy="10" r="1.6"/><path d="M4.5 17l4.5-4.5 3 3 3.5-3.5 4 4"/>',
  wand: '<path d="M6 18L18 6M15 3.5l.5 1.5 1.5.5-1.5.5-.5 1.5-.5-1.5L13 5.5l1.5-.5.5-1.5zM19.5 9l.4 1.1 1.1.4-1.1.4-.4 1.1-.4-1.1-1.1-.4 1.1-.4.4-1.1zM5 4.5l.4 1.1 1.1.4-1.1.4L5 7.5l-.4-1.1-1.1-.4 1.1-.4.4-1.1z"/>',
  shirt: '<path d="M9 4a3 3 0 0 0 6 0l4.5 2.5-1.7 3.6-2-1V20h-7.6V9.1l-2 1L4.5 6.5 9 4z"/>',
  jacket: '<path d="M9 4a3 3 0 0 0 6 0l4.5 2.5-1.7 3.6-2-1V20H8.2V9.1l-2 1L4.5 6.5 9 4z"/><path d="M12 5v15"/>',
  pants: '<path d="M8 3.5h8l1.5 17h-4.6L12 11l-.9 9.5H6.5L8 3.5z"/><path d="M8 6.5h8"/>',
  shorts: '<path d="M7.5 4.5h9l1.3 8h-5l-.8-4-.8 4h-5l1.3-8z"/><path d="M7.5 7h9"/>',
  skirt: '<path d="M8 4.5h8v3l3 11H5l3-11v-3z"/><path d="M8 7.5h8"/>',
  dress: '<path d="M9.5 3.5L12 7l2.5-3.5 1 4.5-1.5 2.5L17 20H7l3-9.5L8.5 8l1-4.5z"/>',
  shoe: '<path d="M3.5 17.5h17v-1.7c0-1.8-1.5-2.8-4-3.3l-3-.7-2.5-3.3h-3l-2 2.5-2.5 1v5.5z"/><path d="M3.5 15h17"/>',
  watch: '<circle cx="12" cy="12" r="4.5"/><path d="M12 9.8V12l1.6 1.2M9.5 7.7L10 3.5h4l.5 4.2M9.5 16.3l.5 4.2h4l.5-4.2"/>',
  necklace: '<path d="M4.5 4.5c0 5.5 3.3 8.5 7.5 8.5s7.5-3 7.5-8.5"/><circle cx="12" cy="16" r="2.2"/>',
  question: '<path d="M9.2 9a3 3 0 0 1 5.8 1c0 1.8-2.2 2.2-2.8 3.5-.1.3-.2.6-.2 1"/><circle cx="12" cy="18" r="0.4" fill="currentColor"/>',
  info: '<circle cx="12" cy="12" r="8.5"/><path d="M12 11v5"/><circle cx="12" cy="8" r="0.4" fill="currentColor"/>',
  arrowUp: '<path d="M12 19V5M6 11l6-6 6 6"/>',
  ruler: '<rect x="2.5" y="9" width="19" height="6" rx="1.5"/><path d="M6.5 9v2.5M10 9v3.5M13.5 9v2.5M17 9v3.5"/>',
};

export function icon(name, size = 20, cls = '') {
  const p = PATHS[name] || PATHS.info;
  return `<svg class="icn ${cls}" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${p}</svg>`;
}

export const TYPE_ICON = {
  tshirt: 'shirt', longsleeve: 'shirt', jacke: 'jacket', hose: 'pants', shorts: 'shorts',
  rock: 'skirt', kleid: 'dress', schuhe: 'shoe', uhr: 'watch', kette: 'necklace',
};
