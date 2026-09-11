import test from 'node:test';
import assert from 'node:assert/strict';
import { catalogItems, collectionOf, safeShopUrl, withoutSecrets } from '../js/catalog.js';
import { analyzeOutfit } from '../js/advisor.js';
const items = [
  { id: '1', name: 'Weißes Hemd', part: 'upperbody', tags: ['weiß'], modeledKey: 'model-1' },
  { id: '3', name: 'Grauer Hoodie', part: 'upperbody', collection: 'wishlist', favorite: true, brand: 'Adidas', size: 'M' },
  { id: '2', name: 'Sneaker', part: 'shoes', collection: 'owned', favorite: true },
];
test('existing records remain owned, wishlist and favorites are independent', () => {
  assert.equal(collectionOf(items[0]), 'owned');
  assert.deepEqual(catalogItems(items, { collection: 'owned' }).map(i => i.id), ['2', '1']);
  assert.deepEqual(catalogItems(items, { collection: 'wishlist', favorites: true }).map(i => i.id), ['3']);
  assert.deepEqual(catalogItems(items, { favorites: true }).map(i => i.id), ['3', '2']);
});
test('search combines collection/category and scans tags and shop metadata', () => {
  assert.equal(catalogItems(items, { query: '  ADIDAS ' })[0].id, '3');
  assert.equal(catalogItems(items, { query: 'weiß' })[0].id, '1');
  assert.equal(catalogItems(items, { collection: 'owned', query: 'Adidas' }).length, 0);
  assert.equal(catalogItems(items, { category: 'shoes', favorites: true })[0].id, '2');
});
test('sorts without changing the stored order', () => {
  assert.deepEqual(catalogItems(items, { sort: 'untried' }).map(i => i.id), ['3', '2', '1']);
  assert.deepEqual(catalogItems(items, { sort: 'name' }).map(i => i.id), ['3', '2', '1']);
  assert.deepEqual(items.map(i => i.id), ['1', '3', '2']);
});
test('unsafe or malformed imported source links are not rendered as links', () => {
  for (const url of ['javascript:alert(1)', 'data:text/html,test', 'file:///etc/passwd', 'https://user:password@example.com', 'not a url']) assert.equal(safeShopUrl(url), null);
  assert.equal(safeShopUrl('https://example.com/product?q=shirt'), 'https://example.com/product?q=shirt');
});
test('backups remove both provider keys without mutating live settings', () => {
  const settings = { openaiKey: 'test-openai', geminiKey: 'test-gemini', theme: 'dark', usageLimit: 40 };
  assert.deepEqual(withoutSecrets(settings), { theme: 'dark', usageLimit: 40 });
  assert.equal(settings.openaiKey, 'test-openai');
});
test('advisor does not invent personal hair or eye matches when no profile exists', () => {
  const result = analyzeOutfit([{ type: 'tshirt', color: '#4a6b8a' }, { type: 'hose', color: '#3b2a1e' }], {}, {});
  assert.doesNotMatch(result.text, /Augen|Haar/);
});
