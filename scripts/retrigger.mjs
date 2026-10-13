#!/usr/bin/env node
// 自动重触发：本轮窗口结束后，用 GitHub API 触发下一轮 workflow_dispatch。
//
// 为什么必须这么做：GitHub 自带的事件（schedule / push / pull_request）都不是
// 「本轮结束后立即再来一轮」。cron 最小间隔 5 分钟且可能延迟；只有一个 job
// 主动调用 workflow_dispatch，才能形成连续的会话链。
//
// 需要 actions:write 权限（工作流里已声明）。缺 token 时安静跳过，不让工作流失败。
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const REPO = process.env.GITHUB_REPOSITORY;
const TOKEN = process.env.GH_TOKEN ?? process.env.GITHUB_TOKEN;
const WORKFLOW = process.env.RETRIGGER_WORKFLOW ?? 'keepalive.yml';
const REF = process.env.RETRIGGER_REF ?? 'main';
const MAX_SESSIONS = Number(process.env.MAX_SESSIONS ?? 0); // 0 = 不限
const STATE_DIR = resolve(process.env.STATE_DIR ?? 'persist/state');

async function currentSession() {
  try { return Number(JSON.parse(await readFile(resolve(STATE_DIR, 'progress.json'), 'utf8')).session ?? 0); }
  catch { return 0; }
}

async function main() {
  const session = await currentSession();
  const next = session + 1;
  if (!REPO) { console.log('[retrigger] 非 GitHub 环境，跳过。'); return; }
  if (!TOKEN) { console.log('[retrigger] 缺少 token，跳过自动重触发。'); return; }
  if (MAX_SESSIONS > 0 && next > MAX_SESSIONS) { console.log(`[retrigger] 已达上限 ${MAX_SESSIONS} 轮，停止。`); return; }

  const url = `https://api.github.com/repos/${REPO}/actions/workflows/${WORKFLOW}/dispatches`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ ref: REF, inputs: { session: String(next), resume: 'true', ...(process.env.RETRIGGER_WINDOW_MINUTES ? { window_minutes: process.env.RETRIGGER_WINDOW_MINUTES } : {}) } }),
    signal: AbortSignal.timeout(20000)
  });
  if (res.status === 204) { console.log(`[retrigger] 已触发第 ${next} 轮会话。`); return; }
  const body = await res.text().catch(() => '');
  throw new Error(`重触发失败 HTTP ${res.status} ${body.slice(0, 300)}`);
}
main().catch(e => { console.error('[retrigger] ' + e.message); process.exitCode = 1; });
