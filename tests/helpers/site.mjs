// 测试公共夹具：把 extension/sites/index.js 注入 vm 上下文。
// page.js / content.js / tabs.js 现在从 DSHBridgeSites 取站点选择器，
// 所有依赖浏览器脚本的回归测试都必须先加载这一层。
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const SITES_SOURCE = await readFile(new URL('../../extension/sites/index.js', import.meta.url), 'utf8');
const PAGE_SOURCE = await readFile(new URL('../../extension/page.js', import.meta.url), 'utf8');
const CONTENT_SOURCE = await readFile(new URL('../../extension/content.js', import.meta.url), 'utf8');
const TABS_SOURCE = await readFile(new URL('../../extension/tabs.js', import.meta.url), 'utf8');

// origin 决定站点适配；默认用 DeepSeek 保持既有 fixture 语义。
export function installSites(ctx, origin = 'https://chat.deepseek.com') {
  ctx.location = { origin, href: origin + '/' };
  vm.runInContext(SITES_SOURCE, ctx);
  return ctx.DSHBridgeSites;
}
export function installPage(ctx, origin) {
  installSites(ctx, origin);
  vm.runInContext(PAGE_SOURCE, ctx);
  return ctx.DSHBridgePage;
}
export { SITES_SOURCE, PAGE_SOURCE, CONTENT_SOURCE, TABS_SOURCE };
