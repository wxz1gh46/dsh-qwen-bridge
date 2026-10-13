#!/usr/bin/env node
// 生成结构报告：记录站点、扩展脚本与插件文件，便于构建产物溯源。
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';

const root = new URL('..', import.meta.url).pathname;
const manifest = JSON.parse(await readFile(join(root, 'extension/manifest.json'), 'utf8'));
const sites = [...(await readFile(join(root, 'extension/sites/index.js'), 'utf8')).matchAll(/origin:\s*'([^']+)'/g)].map(m => m[1]);
const pluginFiles = (await readdir(join(root, 'plugins/dsh-web-bridge'))).sort();
const report = {
  chromeVersion: manifest.version,
  sites,
  hostPermissions: manifest.host_permissions,
  contentScripts: manifest.content_scripts.length,
  pluginFiles,
  generatedAt: new Date().toISOString()
};
console.log(JSON.stringify(report, null, 2));
