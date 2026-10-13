#!/usr/bin/env node
// 重新生成 SOURCE.json 的 sha256：记录本仓库当前的核心文件内容指纹。
// 上游基线的哈希单独保留在 source.json 的 upstream 字段里，便于对照。
import { readFile, writeFile, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join, relative } from 'node:path';

const root = new URL('..', import.meta.url).pathname;
const manifestPath = join(root, 'SOURCE.json');
const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));

async function walk(dir) {
  const out = [];
  for (const entry of await readdir(join(root, dir), { withFileTypes: true })) {
    const rel = join(dir, entry.name);
    if (entry.isDirectory()) { out.push(...await walk(rel)); continue; }
    if (/\.(js|mjs|json|yml|html)$/.test(entry.name)) out.push(rel);
  }
  return out;
}

const files = [
  ...await walk('extension'),
  ...await walk('plugins/dsh-web-bridge')
].sort();

const sha256 = {};
for (const file of files) {
  sha256[file] = createHash('sha256').update(await readFile(join(root, file))).digest('hex');
}
manifest.sha256 = sha256;
await writeFile(manifestPath, JSON.stringify(manifest, null, 2) + '\n', 'utf8');
console.log(`已更新 ${Object.keys(sha256).length} 个文件的哈希。`);
