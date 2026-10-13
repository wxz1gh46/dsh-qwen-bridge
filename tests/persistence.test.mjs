// 持久化与续接的单元测试：不依赖 GitHub，直接验证状态读写与续接语义。
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, rm, readFile, writeFile, mkdir } from 'node:fs/promises';
import { promisify } from 'node:util';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const run = promisify(execFile);
const ROOT = new URL('..', import.meta.url).pathname;

async function withState(fn) {
  const dir = await mkdtemp(join(tmpdir(), 'bridge-state-'));
  try { return await fn(dir); } finally { await rm(dir, { recursive: true, force: true }); }
}
const node = (script, env) => run('node', [join(ROOT, script)], { env: { ...process.env, ...env }, cwd: ROOT });

test('首次读取会初始化全部状态槽位', () => withState(async dir => {
  const { stdout } = await node('scripts/session-state.mjs', { STATE_DIR: dir }).catch(e => e);
  const stateDir = dir;
  const files = ['config.json', 'progress.json', 'todo.json', 'conversation.jsonl', 'meta.json'];
  for (const f of files) {
    const content = await readFile(join(stateDir, f), 'utf8');
    if (f.endsWith('.json')) assert.doesNotThrow(() => JSON.parse(content), `${f} 必须是合法 JSON`);
  }
}));

test('损坏的状态文件会被拒绝，而不是静默重置', () => withState(async dir => {
  const stateDir = dir;
  await mkdir(stateDir, { recursive: true });
  await writeFile(join(stateDir, 'progress.json'), '{ this is not json', 'utf8');
  await assert.rejects(
    () => node('scripts/session-state.mjs', { STATE_DIR: dir }),
    /不是合法 JSON/,
    '损坏状态必须报错，否则会用坏数据继续跑'
  );
}));

test('会话窗口写入检查点，下一轮从中续接', () => withState(async dir => {
  const env = { STATE_DIR: dir, WINDOW_TICKS: '2', TICK_SECONDS: '1', WINDOW_MINUTES: '1' };
  await node('scripts/session-window.mjs', { ...env, SESSION: '1' });
  const first = JSON.parse(await readFile(join(dir, 'progress.json'), 'utf8'));
  assert.equal(first.session, 1);
  assert.equal(first.phase, 'window-complete');
  assert.equal(first.resumedFrom, 'idle', '第 1 轮应从 idle 开始');

  await node('scripts/session-window.mjs', { ...env, SESSION: '2' });
  const second = JSON.parse(await readFile(join(dir, 'progress.json'), 'utf8'));
  assert.equal(second.session, 2);
  assert.equal(second.resumedFrom, 'window-complete', '第 2 轮必须从上一轮检查点续接');
  assert.equal(second.ticks, 2);
}));

test('无 token 时重触发安静跳过，不让工作流失败', () => withState(async dir => {
  const { stdout } = await node('scripts/retrigger.mjs', { STATE_DIR: dir, GITHUB_REPOSITORY: '', GH_TOKEN: '', GITHUB_TOKEN: '' });
  assert.match(stdout, /跳过/, '缺 token 时应跳过而不是抛错');
}));

test('断言脚本接受初始态，并对已运行的会话校验续接点', () => withState(async dir => {
  await node('scripts/session-state.mjs', { STATE_DIR: dir });
  await node('scripts/assert-state.mjs', { STATE_DIR: dir });           // 初始态应通过
  await node('scripts/session-window.mjs', { STATE_DIR: dir, WINDOW_TICKS: '1', TICK_SECONDS: '1', WINDOW_MINUTES: '1', SESSION: '1' });
  const { stdout } = await node('scripts/assert-state.mjs', { STATE_DIR: dir });
  assert.match(stdout, /已有续接点/);
}));
