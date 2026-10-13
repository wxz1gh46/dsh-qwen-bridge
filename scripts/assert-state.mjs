#!/usr/bin/env node
// 断言持久化状态可用：文件齐备、JSON 合法、进度可续接。
// 在 CI 里作为「上一轮的状态真的能被下一轮读出来」的证据。
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const STATE_DIR = resolve(process.env.STATE_DIR ?? 'persist/state');
const REQUIRED = ['config.json', 'progress.json', 'todo.json', 'meta.json'];

const problems = [];
for (const name of REQUIRED) {
  try { JSON.parse(await readFile(resolve(STATE_DIR, name), 'utf8')); }
  catch (e) { problems.push(`${name}: ${e.code ?? e.message}`); }
}

const progress = await readFile(resolve(STATE_DIR, 'progress.json'), 'utf8').then(JSON.parse).catch(() => null);
if (progress) {
  // phase === 'idle' 表示从未跑过窗口，这是合法初始态，不算损坏。
  const ran = progress.phase !== 'idle';
  if (ran && !Number.isFinite(progress.ticks)) problems.push('progress.ticks 不是数字，续接点缺失');
  if (!['idle', 'running', 'window-complete'].includes(progress.phase)) problems.push(`progress.phase 异常: ${progress.phase}`);
  console.log(`[assert] 会话 ${progress.session} · phase=${progress.phase} · ticks=${progress.ticks ?? 0} · ${ran ? '已有续接点' : '初始态'}`);
}

if (problems.length) { problems.forEach(p => console.error('✖ ' + p)); process.exitCode = 1; }
else console.log('[assert] 持久化状态校验通过：文件齐备、JSON 合法、续接点可用。');
