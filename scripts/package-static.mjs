// A portable, public-assets-only bundle. Never copies credentials or Git data.
import { cp, mkdir, rm, access } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
const root = fileURLToPath(new URL('../', import.meta.url));
const output = resolve(root, 'dist');
const assets = ['index.html', 'css', 'js', 'fonts', 'icons', 'manifest.webmanifest', 'sw.js', 'LICENSE'];
for (const path of assets) await access(resolve(root, path));
await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
for (const path of assets) await cp(resolve(root, path), resolve(output, path), { recursive: true });
console.log('Static assets packaged in dist/');
