#!/usr/bin/env node
// 校验站点适配层：在无浏览器环境下加载 extension/sites/index.js，
// 确认每个站点都具备 page.js / content.js / tabs.js 需要的字段。
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const REQUIRED_TOP = ['id', 'label', 'origin', 'matchPattern', 'conversationUrl'];
const REQUIRED_SELECTORS = ['editor', 'editorProto', 'messages', 'thinking', 'rows', 'rowKeyAttr'];

const source = await readFile(new URL('../extension/sites/index.js', import.meta.url), 'utf8');
const ctx = vm.createContext({});
vm.runInContext(source, ctx);
const sites = ctx.DSHBridgeSites;
if (!sites?.SITES?.length) throw new Error('站点适配层没有导出任何站点。');

let failed = 0;
for (const site of sites.SITES) {
  const problems = [];
  for (const key of REQUIRED_TOP) if (!site[key]) problems.push(`缺少 ${key}`);
  for (const key of REQUIRED_SELECTORS) if (!site.selectors?.[key]) problems.push(`缺少 selectors.${key}`);
  // vm 跨 realm 时 instanceof RegExp 会误判；按行为检测。
  const isRegex = v => Object.prototype.toString.call(v) === '[object RegExp]' && typeof v.test === 'function';
  if (!isRegex(site.conversationUrl)) problems.push('conversationUrl 不是 RegExp');
  // 选择器必须是可调用函数，避免写死字符串后无法按运行时状态回退。
  for (const key of ['editor', 'editorProto']) {
    if (typeof site.selectors?.[key] !== 'function') problems.push(`selectors.${key} 必须是函数`);
  }
  const byOrigin = sites.byOrigin(site.origin + '/');
  if (byOrigin?.id !== site.id) problems.push(`byOrigin(${site.origin}) 解析为 ${byOrigin?.id ?? 'null'}`);
  if (problems.length) { failed += 1; console.error(`✖ ${site.id}: ${problems.join('; ')}`); }
  else console.log(`✔ ${site.id} (${site.label})`);
}
if (failed) { console.error(`站点适配层校验失败：${failed} 个站点有问题。`); process.exitCode = 1; }
else console.log(`站点适配层校验通过：${sites.SITES.length} 个站点。`);
