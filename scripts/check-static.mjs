import { readdir, readFile, access } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
const root = fileURLToPath(new URL('../', import.meta.url));
for (const file of [...(await readdir(resolve(root, 'js'))).filter(f => f.endsWith('.js')).map(f => 'js/' + f), 'sw.js']) {
  const check = spawnSync(process.execPath, ['--check', resolve(root, file)], { encoding: 'utf8' });
  if (check.status !== 0) throw new Error(check.stderr);
  const source = await readFile(resolve(root, file), 'utf8');
  for (const match of source.matchAll(/from\s+['"](\.\.?\/[^'"]+)['"]/g)) await access(resolve(root, file, '..', match[1]));
}
const html = await readFile(resolve(root, 'index.html'), 'utf8');
const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map(m => m[1]);
if (new Set(ids).size !== ids.length) throw new Error('Duplicate HTML ids');
for (const match of html.matchAll(/(?:src|href)="([^"#]+)"/g)) {
  if (!/^(https?:|data:)/.test(match[1])) await access(resolve(root, match[1]));
}
for (const match of (await readFile(resolve(root, 'sw.js'), 'utf8')).matchAll(/'\.\/([^']+)'/g)) await access(resolve(root, match[1]));
console.log('PASS: JavaScript syntax, module imports, unique HTML ids, local assets, service-worker assets.');
