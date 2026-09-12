import { safeShopUrl } from './catalog.js';

// Browser-only import: shops must permit cross-origin access. No proxy bypass.
export function extractProductPage(html, link) {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const meta = name => doc.querySelector(`meta[property="${name}"], meta[name="${name}"]`)?.content;
  const rawImage = meta('og:image') || meta('twitter:image');
  let imageUrl = null;
  try { imageUrl = rawImage ? safeShopUrl(new URL(rawImage, link).href) : null; } catch {}
  return { name: (meta('og:title') || doc.title || '').trim().slice(0, 80), imageUrl };
}
export async function readProductPage(link) {
  const response = await fetch(link, { credentials: 'omit', signal: AbortSignal.timeout(10000) });
  if (!response.ok) throw new Error('Product page unavailable');
  return extractProductPage(await response.text(), link);
}
export async function loadProductImage(url) {
  if (!safeShopUrl(url)) throw new Error('Invalid product image URL');
  const response = await fetch(url, { credentials: 'omit', signal: AbortSignal.timeout(10000) });
  if (!response.ok) throw new Error('Product image unavailable');
  const blob = await response.blob();
  if (!blob.type.startsWith('image/') || blob.size > 20 * 1024 * 1024) throw new Error('Unsupported product image');
  return new Promise((resolve, reject) => {
    const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = reject; reader.readAsDataURL(blob);
  });
}
