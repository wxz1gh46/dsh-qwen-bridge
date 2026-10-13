#!/usr/bin/env node
// 会话状态持久化：在 Actions 窗口开始/结束时读写 persist/state。
// 目标是把「上次未完成的对话/任务、配置、进度」落盘，下一轮直接恢复，
// 无需重新填写。状态分文件存放，便于单独读取与增量更新。
import { readFile, writeFile, mkdir, readdir, stat } from 'node:fs/promises';
import { join, resolve } from 'node:path';

const STATE_DIR = resolve(process.env.STATE_DIR ?? 'persist/state');
const SCHEMA = 1;

// 每类数据一个文件：约定的固定槽位，缺省即被视为「从未保存」。
const SLOTS = {
  'config.json': { site: 'qwen', baseUrl: 'https://chat.qwen.ai/', note: '非敏感配置。凭证一律走 GitHub Secrets，不落盘。' },
  'progress.json': { session: 0, lastRequestId: null, phase: 'idle', updatedAt: null },
  'todo.json': { items: [] },
  'conversation.jsonl': null,
  'meta.json': { schema: SCHEMA, createdAt: null, updatedAt: null }
};

async function exists(path) { try { await stat(path); return true; } catch { return false; } }

export async function readState() {
  await mkdir(STATE_DIR, { recursive: true });
  const applied = [], created = [];
  for (const [name, template] of Object.entries(SLOTS)) {
    const path = join(STATE_DIR, name);
    if (!(await exists(path))) {
      if (template === null) { await writeFile(path, '', 'utf8'); created.push(name); continue; }
      const seeded = { ...template, ...(name === 'meta.json' ? { schema: SCHEMA, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() } : {}) };
      await writeFile(path, JSON.stringify(seeded, null, 2) + '\n', 'utf8');
      created.push(name);
      continue;
    }
    if (name.endsWith('.json')) { try { JSON.parse(await readFile(path, 'utf8')); applied.push(name); } catch { throw new Error(`状态文件 ${name} 不是合法 JSON，拒绝在损坏状态上继续。`); } }
    else applied.push(name);
  }
  return { dir: STATE_DIR, applied, created };
}

export async function writeState(extra = {}) {
  await mkdir(STATE_DIR, { recursive: true });
  const metaPath = join(STATE_DIR, 'meta.json');
  let meta = {};
  try { meta = JSON.parse(await readFile(metaPath, 'utf8')); } catch {}
  const now = new Date().toISOString();
  meta = { ...meta, schema: SCHEMA, createdAt: meta.createdAt ?? now, updatedAt: now, ...extra };
  await writeFile(metaPath, JSON.stringify(meta, null, 2) + '\n', 'utf8');
  const files = (await readdir(STATE_DIR)).sort();
  return { dir: STATE_DIR, files, meta };
}

async function main() {
  const mode = process.argv.includes('--write') ? 'write' : 'read';
  if (mode === 'read') {
    const r = await readState();
    console.log(`[state] 目录 ${r.dir}`);
    console.log(`[state] 已恢复 ${r.applied.length} 个文件: ${r.applied.join(', ') || '（无）'}`);
    if (r.created.length) console.log(`[state] 本次初始化 ${r.created.length} 个文件: ${r.created.join(', ')}`);
  } else {
    const r = await writeState({ session: process.env.SESSION ?? undefined, githubRunId: process.env.GITHUB_RUN_ID ?? undefined });
    console.log(`[state] 已保存 ${r.files.length} 个文件到 ${r.dir}: ${r.files.join(', ')}`);
  }
}
if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  main().catch(e => { console.error('[state] ' + e.message); process.exitCode = 1; });
}
