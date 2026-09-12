import { JSDOM } from 'jsdom';
import { indexedDB } from 'fake-indexeddb';
import { readFile } from 'node:fs/promises';
import { pathToFileURL, fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
const root = fileURLToPath(new URL('../', import.meta.url));
const html = await readFile(root + 'index.html', 'utf8');
const dom = new JSDOM(html, { url: 'https://example.test/WearClothing/', pretendToBeVisual: true });
for (const key of ['window','document','localStorage','FileReader','Image','HTMLElement','Event','KeyboardEvent','DOMParser']) globalThis[key] = dom.window[key];
Object.defineProperty(globalThis, 'navigator', { value: dom.window.navigator, configurable: true });
globalThis.indexedDB = indexedDB;
globalThis.requestAnimationFrame = dom.window.requestAnimationFrame.bind(dom.window);
window.matchMedia = () => ({matches: false});
globalThis.confirm = () => true;
dom.window.HTMLElement.prototype.scrollIntoView = () => {};
globalThis.fetch = async () => { throw new Error('Shop blocks cross-origin access'); };
const originalStore = await import(pathToFileURL(root + 'js/db.js'));
const img = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6ZlUAAAAASUVORK5CYII=';
const items = [{id:'01',name:'Weißes Hemd',part:'upperbody',color:'#ffffff',tags:['weiß'],imageKey:'g1',modeledKey:'m1'}, {id:'02',name:'Grauer Hoodie',part:'upperbody',color:'#777777',collection:'wishlist',imageKey:'g2',favorite:true,brand:'Adidas',tags:[]}, {id:'03',name:'Schuhe ohne Foto',part:'shoes',collection:'wishlist',color:'#222222',tags:[]}];
localStorage.setItem('wearclothing.items', JSON.stringify(items));
localStorage.setItem('wearclothing.lang', JSON.stringify('de'));
for (const key of ['g1','m1','g2','model-reference']) await originalStore.imageStore.put(key,img);
let calls = 0; let fail = false;
globalThis.shopTestAI = {
  DEFAULTS: {imageModel:'test',visionModel:'test'}, MODELED_PROMPT:'test',
  openAIEdit: async () => { calls++; if(fail) throw new Error('Simulierter Bildfehler'); return img; },
  normalizeImage: async value => value,
};
let source = await readFile(root + 'js/app.js','utf8');
source = source.replace("import * as ai from './openai.js';", 'const ai = globalThis.shopTestAI;');
source = source.replace(/from '(\.\/[^']+)'/g,(_,p)=>`from '${pathToFileURL(root+'js/'+p.slice(2))}'`);
source += '\nexport { state, jobs, approveGarment, tryOnItem, renderGallery, openViewer, generateImage, renderLooks, openLookDetail, collectImageKeys };';
const app = await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
const settle = async () => { for(let i=0;i<5;i++) await new Promise(r=>setTimeout(r,10)); };
await settle();
const q=s=>document.querySelector(s);
assert.equal(document.querySelectorAll('.product-card').length,3);
assert.match(q('.shop-heading').textContent,/persönlicher Shop/);
q('#nav-wishlist').click(); await settle(); assert.equal(document.querySelectorAll('.product-card').length,2);
q('#shop-search').value='adidas';q('#shop-search').dispatchEvent(new Event('input'));await settle();assert.equal(document.querySelectorAll('.product-card').length,1);
q('.product-open').click();await settle();assert.equal(q('#product-title').textContent,'Grauer Hoodie');
q('.product-secondary-actions button').click();await settle();assert.equal(app.state.items.find(i=>i.id==='02').collection,'owned');
q('.product-close').click(); await settle(); assert.equal(q('#status-empty').classList.contains('hidden'),false);
q('#empty-reset').click();await settle();assert.equal(document.querySelectorAll('.product-card').length,1);
q('.product-open').click();await settle();assert.equal(q('.product-main-actions button').disabled,true);
assert.match(q('.product-note').textContent,/Produktfoto/);
q('.product-close').click();q('#nav-wardrobe').click();await settle();
assert.equal(document.querySelectorAll('.product-card').length,2);
q('#mode-product').click(); await settle(); assert.equal(localStorage.getItem('wearclothing.previewMode'),'"product"');
// API is stubbed: no real request or key is used.
app.state.settings.openaiKey='test-only';app.state.hasModelReference=true;
const item = app.state.items.find(i=>i.id==='02');
await app.tryOnItem(item);await settle();assert.equal(item.modeledKey,'modeled-02');assert.equal(calls,1);
// Failed model retry is idempotent and does not duplicate the saved garment.
const job={id:'job-1',stage:'garment-review',collection:'wishlist',tryOn:true,metadata:{name:'Testshirt',part:'upperbody',color:'#ffffff',tags:[]},garmentImage:img,cropImage:img};
app.jobs.push(job); fail=true;await app.approveGarment(job);await settle();
assert.equal(job.stage,'modeled-error');const count=app.state.items.length;
job.stage='garment-review';fail=false;await app.approveGarment(job);await settle();
assert.equal(app.state.items.length,count);assert.equal(job.stage,'modeled-review');
// Import can save without a reference; wishlist membership is preserved.
const noRef={...job,id:'job-2',itemId:undefined,saving:false,stage:'garment-review'};app.jobs.push(noRef);app.state.hasModelReference=false;const before=calls;
await app.approveGarment(noRef);await settle();assert.equal(calls,before);assert.equal(app.state.items.find(i=>i.id===noRef.itemId).collection,'wishlist');
assert.equal(app.jobs.includes(noRef),false);
// Product links can be saved without a second provider key.
q('#shop-add').click();q('#import-collection').value='wishlist';q('#import-link').value='https://example.com/shirt';q('#import-link-add').click();await settle();
assert.equal(app.state.items.at(0).link,'https://example.com/shirt');assert.equal(app.state.items.at(0).collection,'wishlist');
// Theme persists and is mirrored into settings.
q('#toggle-theme').click();assert.equal(document.documentElement.dataset.theme,'dark');assert.equal(q('#set-theme').value,'dark');
assert.equal(JSON.parse(localStorage.getItem('wearclothing.settings')).theme,'dark');
// A color concept preserves the original try-on and is included in backups.
app.state.hasModelReference=true; const piece=app.state.items.find(i=>i.id==='01');const original=piece.modeledKey;
await app.tryOnItem(piece,'#aa1122');await settle();assert.equal(piece.modeledKey,original);assert.equal(piece.variants.length,1);
assert.ok(app.collectImageKeys().includes(piece.variants[0].imageKey));
await app.openViewer(piece.id);await settle();q('.variant-preview').click();assert.equal(q('.variant-preview').getAttribute('aria-pressed'),'true');
q('.product-close').click();await settle();
// Outfit preview includes every garment, touch toggle does not open a drawer.
app.state.looks=[{id:'look1',name:'Test Look',itemIds:['01','02'],imageKey:'m1',description:'Test',tags:[],createdAt:1}];
await app.renderLooks(); const card=q('.look-card');card.querySelector('.look-card-body button').click();assert.equal(card.classList.contains('show-pieces'),true);
await app.openLookDetail(app.state.looks[0]);assert.equal(document.querySelectorAll('.outfit-piece-link').length,2);
assert.equal(q('.outfit-detail-hero .piece-collage').classList.contains('hidden'),false);
q('.outfit-drawer').dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));assert.equal(q('.outfit-drawer'),null);
// Page image extraction resolves relative URLs and rejects unsafe protocols.
const {extractProductPage}=await import(pathToFileURL(root+'js/product-import.js'));
assert.deepEqual(extractProductPage('<meta property="og:title" content="Shirt"><meta property="og:image" content="/shirt.jpg">','https://example.com/shop'),{name:'Shirt',imageUrl:'https://example.com/shirt.jpg'});
assert.equal(extractProductPage('<meta property="og:image" content="javascript:alert(1)">','https://example.com').imageUrl,null);
// Concurrent requests reserve the remaining daily allowance.
app.state.settings.usageLimit=1;app.state.usage={day:new Date().toISOString().slice(0,10),count:0};
let release;globalThis.shopTestAI.openAIEdit=()=>new Promise(resolve=>{release=resolve;});
const pending=app.generateImage({});await assert.rejects(app.generateImage({}));release(img);await pending;assert.equal(app.state.usage.count,1);
console.log('PASS: shop flows, color variants and backups, theme persistence, outfit drawer, touch preview, URL extraction and usage limits. AI and shop fetches simulated.');
dom.window.close();
