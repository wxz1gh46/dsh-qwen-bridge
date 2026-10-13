// 站点适配层：把「操作哪个网页」从桥接协议中拆出来。
// 每个 manifest 条目声明自己的域名、输入框与消息节点选择器。
// 新增站点只需在此登记，content.js / page.js / tabs.js 共用同一套协议。
(() => {
  const DEEPSEEK = {
    id: 'deepseek',
    label: 'DeepSeek 网页',
    origin: 'https://chat.deepseek.com',
    matchPattern: 'https://chat.deepseek.com/*',
    conversationUrl: /^https:\/\/chat\.deepseek\.com\/a\/chat\/s\/[a-zA-Z0-9-]+$/,
    selectors: {
      // 输入框：DeepSeek 用原生 textarea，可直接赋值 + 派发 Enter。
      editor: () => [...document.querySelectorAll('textarea')].find(el => el.getClientRects().length > 0 && !el.disabled),
      editorProto: () => HTMLTextAreaElement,
      // 停止生成按钮：用文本判断，适配中英文界面。
      stop: /^(停止生成|停止|Stop generating|Stop)$/i,
      // 消息节点：虚拟列表行 + 助手容器 + 思考内容。
      messages: '[data-message-role="assistant"], [data-role="assistant"], .ds-markdown, .ds-think-content, [class*="thinking-content"], [class*="think-content"]',
      thinking: '.ds-think-content, [class*="thinking-content"], [class*="think-content"]',
      rows: '[data-virtual-list-item-key]',
      rowKeyAttr: 'data-virtual-list-item-key'
    },
    // 站点在「用户消息行」上如何定位本轮提示。DeepSeek 用虚拟列表行号。
    loginPattern: /登录|Log in|Sign in/
  };

  const QWEN = {
    id: 'qwen',
    label: 'Qwen 网页',
    origin: 'https://chat.qwen.ai',
    matchPattern: 'https://chat.qwen.ai/*',
    conversationUrl: /^https:\/\/chat\.qwen\.ai\/c\/[a-zA-Z0-9-]+$/,
    selectors: {
      // Qwen 国际版同样是原生 textarea：<textarea class="message-input-textarea" placeholder="Ask Qwen">
      // 登录后不再有 placeholder，因此优先按 class 匹配，再退回可见 textarea。
      editor: () => document.querySelector('textarea.message-input-textarea')
        ?? [...document.querySelectorAll('textarea')].find(el => el.getClientRects().length > 0 && !el.disabled),
      editorProto: () => HTMLTextAreaElement,
      // Qwen 生成中：发送按钮切换为停止图标，优先按 aria-label / class 判断。
      stopButton: () => [...document.querySelectorAll('button,[role="button"]')]
        .find(el => el.getClientRects().length > 0 && /stop|停止/i.test(el.getAttribute('aria-label') ?? '')),
      stopText: /^(停止|Stop|Stop responding)$/i,
      // Qwen 消息容器（未登录时不存在，登录后由前端渲染）。
      // 这些类名来自 qwen-chat-fe 0.3.17 的 DOM 约定，改版时需要更新。
      messages: '[class*="chat-message-assistant"], [class*="message-assistant"], [class*="markdown-body"], [class*="qwen-markdown"], [class*="thinking"], [class*="think-block"]',
      thinking: '[class*="thinking"], [class*="think-block"], [class*="reasoning"]',
      rows: '[class*="chat-message"]',
      rowKeyAttr: 'data-message-id',
      sendButton: () => document.querySelector('.message-input-right-button-send [role="button"], .message-input-right-button-send button')
    },
    loginPattern: /登录|Log in|Sign in|Sign up/
  };

  const SITES = [DEEPSEEK, QWEN];
  // 严格按 URL 解析后比较 host，避免 "https://chat.qwen.ai.evil.com" 这类
  // 前缀伪装域名被误判为受信任站点（前缀匹配在这里是安全漏洞）。
  // 不依赖 URL 构造器：vm / 旧环境可能没有它。只取 scheme://host[:port]。
  function originOf(url) {
    if (typeof url !== 'string') return null;
    const match = /^(https?:)\/\/([^/?#]+)/i.exec(url);
    if (!match) return null;
    return match[1].toLowerCase() + '//' + match[2].toLowerCase();
  }
  function byOrigin(origin) {
    const normalized = originOf(origin) ?? originOf(origin + '/');
    if (!normalized) return null;
    return SITES.find(s => originOf(s.origin) === normalized) ?? null;
  }
  function byId(id) { return SITES.find(s => s.id === id); }
  // location 只在浏览器里存在；Node（测试/校验脚本）下 current 为 null，
  // 由调用方按 origin 显式解析，避免加载即崩。
  const currentOrigin = typeof location !== 'undefined' ? location.origin : null;
  globalThis.DSHBridgeSites = { SITES, DEEPSEEK, QWEN, byOrigin, byId, current: currentOrigin ? byOrigin(currentOrigin) : null };
})();
