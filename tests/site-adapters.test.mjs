// 站点适配层的单元测试：不依赖浏览器，直接加载 sites/index.js。
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';

const SOURCE = await readFile(new URL('../extension/sites/index.js', import.meta.url), 'utf8');

function load(origin) {
  const ctx = vm.createContext({});
  if (origin) ctx.location = { origin, href: origin + '/' };
  vm.runInContext(SOURCE, ctx);
  return ctx.DSHBridgeSites;
}

test('站点适配层在无 location 的 Node 环境也能加载', () => {
  const sites = load(null);
  assert.equal(sites.current, null, '无 location 时 current 必须是 null，而不是抛错');
  assert.equal(sites.SITES.length, 2);
});

test('每个站点都具备 page/content/tabs 需要的字段', () => {
  for (const site of load(null).SITES) {
    for (const key of ['id', 'label', 'origin', 'matchPattern', 'conversationUrl']) {
      assert.ok(site[key], `${site.id} 缺少 ${key}`);
    }
    assert.ok(site.selectors, `${site.id} 缺少 selectors`);
    for (const key of ['editor', 'editorProto', 'messages', 'thinking', 'rows', 'rowKeyAttr']) {
      assert.ok(site.selectors[key], `${site.id} 缺少 selectors.${key}`);
    }
    assert.equal(typeof site.selectors.editor, 'function', 'editor 必须是函数以便运行时回退');
    assert.equal(typeof site.selectors.editorProto, 'function');
  }
});

test('按 origin 解析当前站点', () => {
  assert.equal(load('https://chat.qwen.ai').current.id, 'qwen');
  assert.equal(load('https://chat.deepseek.com').current.id, 'deepseek');
  assert.equal(load('https://example.com').current, null, '未知域名不得误配站点');
  assert.equal(load('https://chat.qwen.ai.evil.com').current, null);
});

test('byOrigin 不把相似域名误判为站点', () => {
  const sites = load(null);
  assert.equal(sites.byOrigin('https://chat.qwen.ai.evil.com/'), null, '伪装域必须被拒绝');
  assert.equal(sites.byOrigin('https://chat.qwen.ai.evil.com'), null);
  assert.equal(sites.byOrigin(undefined), null);
  assert.equal(sites.byOrigin('http://chat.qwen.ai/'), null, 'scheme 不同不得匹配');
  assert.equal(sites.byOrigin('https://chat.qwen.ai/c/abc').id, 'qwen');
});

test('会话链接正则只接受各自站点的对话路径', () => {
  const sites = load(null);
  const qwen = sites.byId('qwen'), ds = sites.byId('deepseek');
  assert.ok(qwen.conversationUrl.test('https://chat.qwen.ai/c/ef7f039e-6b93-411e'));
  assert.ok(!qwen.conversationUrl.test('https://chat.qwen.ai/'), '主页不是具体对话');
  assert.ok(!qwen.conversationUrl.test('https://chat.deepseek.com/a/chat/s/x'), '不能跨站点接受');
  assert.ok(ds.conversationUrl.test('https://chat.deepseek.com/a/chat/s/ef7f039e'));
  assert.ok(!ds.conversationUrl.test('https://chat.deepseek.com/'));
});

test('Qwen 输入框选择器优先命中 message-input-textarea', () => {
  const sites = load('https://chat.qwen.ai');
  const qwen = sites.current;
  const target = { id: 'target' };
  const doc = {
    querySelector: sel => (sel === 'textarea.message-input-textarea' ? target : null),
    querySelectorAll: () => []
  };
  const ctx = vm.createContext({ document: doc, location: { origin: 'https://chat.qwen.ai' } });
  vm.runInContext(SOURCE, ctx);
  const editor = ctx.DSHBridgeSites.current.selectors.editor();
  assert.equal(editor, target, '应优先返回 class 命中的输入框');
});
