// Pure catalog rules shared by the shop UI and regression checks.
export const collectionOf = item => item.collection === 'wishlist' ? 'wishlist' : 'owned';
export function safeShopUrl(value) {
  try {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password ? url.href : null;
  } catch { return null; }
}
export function catalogItems(items, { collection = 'all', category = 'all', query = '', sort = 'newest', favorites = false } = {}) {
  const needle = query.trim().toLocaleLowerCase();
  return items.filter(item =>
    (collection === 'all' || collectionOf(item) === collection) &&
    (category === 'all' || item.part === category) &&
    (!favorites || item.favorite) &&
    (!needle || [item.name, item.brand, item.size, item.material, item.pattern, ...(item.tags || [])].filter(Boolean).join(' ').toLocaleLowerCase().includes(needle))
  ).sort((a, b) => sort === 'name'
    ? (a.name || '').localeCompare(b.name || '')
    : sort === 'untried'
      ? Number(Boolean(a.modeledKey)) - Number(Boolean(b.modeledKey)) || b.id.localeCompare(a.id)
      : b.id.localeCompare(a.id));
}
export function withoutSecrets(settings) {
  const { openaiKey, geminiKey, ...safe } = settings;
  return safe;
}
