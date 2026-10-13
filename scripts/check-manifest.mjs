#!/usr/bin/env node
// 校验 Chrome manifest 与站点适配层一致：
// manifest 的 host_permissions 与 content_scripts.matches 必须覆盖每个站点的域名，
// 且 sites/index.js 必须被注入 —— 否则运行时 DSHBridgeSites 会是 undefined。
import { readFile } from 'node:fs/promises';

const manifest = JSON.parse(await readFile(new URL('../extension/manifest.json', import.meta.url), 'utf8'));
const sitesSource = await readFile(new URL('../extension/sites/index.js', import.meta.url), 'utf8');

const origins = [...sitesSource.matchAll(/origin:\s*'([^']+)'/g)].map(m => m[1]);
if (!origins.length) throw new Error('未能从 sites/index.js 解析出站点 origin。');

const problems = [];
for (const origin of origins) {
  const pattern = origin + '/*';
  if (!manifest.host_permissions?.includes(pattern)) problems.push(`host_permissions 缺少 ${pattern}`);
  for (const [i, script] of (manifest.content_scripts ?? []).entries()) {
    if (!script.matches?.includes(pattern)) problems.push(`content_scripts[${i}] 未匹配 ${pattern}`);
    if (!script.js?.includes('sites/index.js')) problems.push(`content_scripts[${i}] 未注入 sites/index.js`);
    if (script.js?.indexOf('sites/index.js') > 0) problems.push(`content_scripts[${i}] 中 sites/index.js 必须在其他脚本之前`);
  }
}
if (manifest.manifest_version !== 3) problems.push('manifest_version 必须为 3');
if (problems.length) { problems.forEach(p => console.error('✖ ' + p)); process.exitCode = 1; }
else console.log(`✔ manifest 与 ${origins.length} 个站点一致。`);
