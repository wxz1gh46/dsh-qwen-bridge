#!/usr/bin/env node
// 会话窗口：在 Actions 的 6 小时上限内维持一个可恢复的工作窗口。
// 到达窗口时间（默认 330 分钟，留出保存/上传/重触发的余量）后正常退出，
// 由 keepalive.yml 的后续步骤落盘并触发下一轮，形成连续会话。
import { readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

const STATE_DIR = resolve(process.env.STATE_DIR ?? 'persist/state');
const WINDOW_MS = Number(process.env.WINDOW_MINUTES ?? 330) * 60 * 1000;
const TICK_MS = Number(process.env.TICK_SECONDS ?? 30) * 1000;

async function readJson(name, fallback) {
  try { return JSON.parse(await readFile(join(STATE_DIR, name), 'utf8')); } catch { return fallback; }
}

async function main() {
  const started = Date.now();
  const session = Number(process.env.SESSION ?? 1);
  const progress = await readJson('progress.json', {});
  // 断点续跑：上一轮没做完就接着，不重置计数。
  const resumeFrom = progress.phase && progress.phase !== 'idle' ? progress.phase : 'idle';
  console.log(`[window] 会话 ${session} 启动，窗口 ${WINDOW_MS / 60000} 分钟，续接自 "${resumeFrom}"`);

  await writeFile(join(STATE_DIR, 'progress.json'), JSON.stringify({
    ...progress, session, phase: 'running', resumedFrom: resumeFrom, startedAt: new Date(started).toISOString(), updatedAt: new Date().toISOString()
  }, null, 2) + '\n', 'utf8');

  // 心跳：定期把进度写盘，进程被强杀时也能保留最近的检查点。
  let ticks = 0;
  while (Date.now() - started < WINDOW_MS) {
    await new Promise(r => setTimeout(r, Math.min(TICK_MS, WINDOW_MS - (Date.now() - started))));
    ticks += 1;
    const current = await readJson('progress.json', {});
    await writeFile(join(STATE_DIR, 'progress.json'), JSON.stringify({
      ...current, session, phase: 'running', ticks, updatedAt: new Date().toISOString()
    }, null, 2) + '\n', 'utf8');
    console.log(`[window] tick ${ticks} · 已运行 ${Math.round((Date.now() - started) / 1000)}s`);
    if (process.env.WINDOW_TICKS && ticks >= Number(process.env.WINDOW_TICKS)) break;
  }

  const current = await readJson('progress.json', {});
  await writeFile(join(STATE_DIR, 'progress.json'), JSON.stringify({
    ...current, session, phase: 'window-complete', ticks, updatedAt: new Date().toISOString()
  }, null, 2) + '\n', 'utf8');
  console.log(`[window] 窗口结束，已写入检查点，等待落盘与重触发。`);
}
main().catch(e => { console.error('[window] ' + e.message); process.exitCode = 1; });
