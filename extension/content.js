(() => {
  let active = null;
  const sleep = DSHBridgePage.createClock();
  const wake = () => {
    if (active && !active.cancelled) document.dispatchEvent(new Event('dsh-bridge-render-pulse'));
    sleep.flush();
  };
  const visible = el => !!el && el.getClientRects().length > 0;
  const site = globalThis.DSHBridgeSites?.current;
  const editor = () => site?.selectors.editor?.() ?? [...document.querySelectorAll('textarea')].find(el => visible(el) && !el.disabled);
  const stopButton = () => {
    const bySite = site?.selectors.stopButton?.();
    if (bySite) return bySite;
    const pattern = site?.selectors.stop ?? /^(停止生成|停止|Stop generating|Stop)$/i;
    return [...document.querySelectorAll('button,[role="button"]')].find(el => visible(el)
      && (pattern instanceof RegExp
        ? pattern.test(el.getAttribute('aria-label') ?? el.getAttribute('title') ?? el.textContent.trim())
        : /stop|停止/i.test(el.getAttribute('aria-label') ?? '')));
  };
  // 发送：DeepSeek 依赖 Enter；Qwen 的 Enter 可能被 IME/编辑器拦截，优先点击发送按钮。
  async function submit(input) {
    const sendBtn = site?.selectors.sendButton?.();
    if (site?.id === 'qwen' && sendBtn) { sendBtn.click(); return 'button'; }
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true, cancelable: true }));
    input.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true }));
    return 'enter';
  }
  function setEditorValue(input, value) {
    const proto = site?.selectors.editorProto?.() ?? HTMLTextAreaElement;
    Object.getOwnPropertyDescriptor(proto.prototype, 'value').set.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  }
  const sendEvent = async (job, action, extra = {}) => {
    const result = await chrome.runtime.sendMessage({ type: 'event', id: job.id, action, ...extra });
    if (result?.error) throw new Error(result.error);
    if (result?.cancelled) { job.cancelled = true; throw new Error('Harness 已取消本轮任务'); }
    return result;
  };
  function banner(text) {
    let el = document.getElementById('dsh-web-bridge-banner');
    if (!el) { el = document.createElement('div'); el.id = 'dsh-web-bridge-banner'; el.style.cssText = 'position:fixed;right:18px;top:12px;z-index:2147483647;background:#4263eb;color:white;border-radius:10px;padding:8px 12px;font:13px system-ui;box-shadow:0 3px 18px #0002;pointer-events:none'; document.body.append(el); }
    el.textContent = text;
  }
  async function run(job) {
    active = job;
    banner('Harness 专用会话 · 正在发送');
    try {
      let baseline = DSHBridgePage.capture(document);
      let lastProgress = '', lastOutput = '', latestReasoning = '', outputStableAt = Date.now();
      let input = editor();
      if (!input) throw new Error('未找到 ' + (site?.label ?? '网页') + ' 输入框，请完成登录或验证。');
      if (input.value.trim()) throw new Error('网页输入框已有未发送内容，本轮停止，避免覆盖。');
      if (stopButton()) throw new Error('网页正在回答其他消息，请等待结束再试。');
      const sentKey = 'dsh-sent-' + job.id;
      if (sessionStorage.getItem(sentKey)) throw new Error('本轮已有发送记录，拒绝重复提交。');
      // Record before interacting; ambiguity after a crash is surfaced instead of retried.
      sessionStorage.setItem(sentKey, 'sending');
      await sendEvent(job, 'sent');
      await sendEvent(job, 'progress', { phase: '正在向 ' + (site?.label ?? '网页') + ' 提交本轮上下文' });
      if (job.cancelled) return;
      input.focus();
      setEditorValue(input, job.prompt + (job.replyFormat === 'summary' ? '' : '\n' + DSHBridgeRepair.formatReminder(job.id)));
      await sleep(200);
      if (job.cancelled) { setEditorValue(input, ''); return; }
      await submit(input);
      sessionStorage.setItem(sentKey, 'sent');
      const started = Date.now(); let last = null; let stableSince = 0; let sentConfirmed = false;
      let sentAt = started, repairs = 0;
      const repairKey = 'dsh-repair-' + job.id;
      while (!job.cancelled && Date.now() - started < 590000) {
        await sleep(1000);
        await sendEvent(job, 'status');
        if (job.cancelled) break;
        if (!editor() && (site?.selectors.loginPattern ?? /登录|Log in|Sign in/).test(document.body.innerText.slice(-4000))) throw new Error((site?.label ?? '网页') + ' 登录失效，请重新登录后再发起任务。');
        if (!input.isConnected || !input.value.trim()) sentConfirmed = true;
        if (!sentConfirmed && Date.now() - sentAt > 12000) throw new Error('网页未确认发送，已停止避免重复提交；请检查专用标签页。');
        const snapshot = DSHBridgePage.scan(document, baseline, job.id, job.replyFormat);
        const answer = snapshot.answer;
        // A stationary old/partial body is not a stalled reply while thought is growing.
        if (snapshot.reasoning && snapshot.reasoning !== latestReasoning) { latestReasoning = snapshot.reasoning; outputStableAt = Date.now(); }
        const basePhase = answer ? '已收到完整回复，正在校验' : snapshot.outputText ? (DSHBridgeRepair.failureKind(snapshot.outputText, job.id) === 'dsml' ? '网页返回 DSML，等待输出结束后纠正格式' : '网页正在生成回复') : latestReasoning ? (site?.label ?? '网页') + '正在思考' : '已发送，等待网页开始输出';
        const phase = (repairs ? '格式纠正 1/1：' : '') + basePhase;
        const progressKey = phase + '\n' + latestReasoning + '\n' + JSON.stringify(snapshot.metrics);
        if (progressKey !== lastProgress) {
          await sendEvent(job, 'progress', { phase, reasoning: latestReasoning, metrics: snapshot.metrics }); lastProgress = progressKey;
        }
        if (snapshot.outputText !== lastOutput) { lastOutput = snapshot.outputText; outputStableAt = Date.now(); }
        let replyIssue;
        if (job.replyValidation === 1 && answer && answer === last && Date.now() - stableSince >= 5000 && !stopButton()) {
          const check = await sendEvent(job, 'validate', { text: answer });
          if (check.valid !== true) {
            if (!check.correctable) throw new Error(check.message ?? '完整校验没有明确通过，本轮已停止。');
            replyIssue = check;
          }
        }
        if (replyIssue || (!answer && lastOutput && Date.now() - outputStableAt > 45000 && !stopButton())) {
          const correctionReason = replyIssue?.message ?? snapshot.protocolIssue?.message;
          if (job.replyFormat === 'summary') throw new Error('网页摘要已停止更新，但缺少结束标记；上下文压缩失败，本轮不会自动重发。');
          if (DSHBridgeRepair.failureKind(lastOutput, job.id) === 'wrong-id') throw new Error('网页回复的请求编号不匹配，已拒收；不自动改写编号，本轮未执行工具。');
          if (repairs || sessionStorage.getItem(repairKey)) throw new Error('网页回复已进行 1 次格式纠正，仍未通过校验；已停止，本轮未执行工具。' + (correctionReason ?? ''));
          if (Date.now() - started > 500000) throw new Error('本轮剩余时间不足以纠正格式，已停止；本轮未执行工具。');
          input = editor();
          if (!input || input.value.trim()) throw new Error('格式纠正需要空闲输入框；为避免覆盖内容，本轮已停止。');
          // Claim the single correction before sending. Interruptions fail closed.
          sessionStorage.setItem(repairKey, 'sending'); repairs = 1;
          await sendEvent(job, 'progress', { phase: correctionReason ? '格式纠正 1/1：' + correctionReason : '格式纠正 1/1：上一条回复未执行工具，正在请求 JSON 格式', reasoning: '' });
          if (job.cancelled) break;
          baseline = DSHBridgePage.capture(document);
          const correction = DSHBridgeRepair.correctionPrompt(job.id, correctionReason);
          input.focus();
          setEditorValue(input, correction);
          await sleep(200);
          // Re-check the lease immediately before the extra message, even if cancelled
          // from a different Harness window while waiting for the editor update.
          try { await sendEvent(job, 'status'); }
          catch (error) {
            if (input.value === correction) setEditorValue(input, '');
            throw error;
          }
          if (job.cancelled) {
            if (input.value === correction) setEditorValue(input, '');
            break;
          }
          if (input.value !== correction || stopButton()) throw new Error('网页输入或生成状态发生变化，未发送格式纠正；本轮已停止。');
          await submit(input);
          sessionStorage.setItem(repairKey, 'sent');
          await sendEvent(job, 'progress', { phase: '格式纠正 1/1：已发送，仅等待新的格式化回复', reasoning: '' });
          lastProgress = ''; lastOutput = ''; latestReasoning = ''; last = null;
          sentAt = Date.now(); outputStableAt = sentAt; stableSince = sentAt; sentConfirmed = false;
          continue;
        }
        if (answer && answer === last) {
          if (Date.now() - stableSince >= 5000 && !stopButton()) {
            const kind = job.replyFormat === 'summary' ? 'final' : JSON.parse(answer).kind;
            await sendEvent(job, 'progress', { phase: kind === 'tool_calls' ? '网页已请求工具，交给 Harness 校验与执行' : '网页回答完成，正在回传 Harness' });
            await sendEvent(job, 'result', { text: answer, reasoning: latestReasoning }); banner('Harness 专用会话 · 答案已回传'); return;
          }
        } else { last = answer; stableSince = Date.now(); }
        if (sentConfirmed && Date.now() - started < 2500) await sendEvent(job, 'generating');
        banner(answer ? 'Harness 专用会话 · 正在核对完整回答' : 'Harness 专用会话 · 等待 ' + (site?.label ?? '网页') + ' 回答');
      }
      if (!job.cancelled) throw new Error('网页回答超时或没有生成带正确请求编号的完整 JSON。');
    } catch (error) {
      if (!job.cancelled) await sendEvent(job, 'error', { error: error.message }).catch(() => {});
      banner('Harness 专用会话 · ' + error.message);
    } finally { if (active === job) active = null; }
  }
  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message.type === 'inspect-reply') {
      if (active || location.href !== message.url || !/^[a-zA-Z0-9-]{1,100}$/.test(message.requestId)) { sendResponse({ error: 'Inspection target is active or does not match' }); return; }
      sendResponse(DSHBridgeInspect.inspect(document, message.requestId)); return;
    }
    if (message.type === 'health') { wake(); sendResponse({ ready: !!editor(), hasDraft: !!editor()?.value.trim(), generating: !!stopButton(), activeId: active?.id, version: '0.3.0', visibility: document.visibilityState }); return; }
    if (message.type === 'cancel' && active?.id === message.id) { active.cancelled = true; stopButton()?.click(); banner('Harness 专用会话 · 已停止接收答案'); sendResponse({ ok: true }); return; }
    if (message.type === 'run') {
      if (active) { sendResponse({ error: '网页已有运行中的桥接请求' }); return; }
      run(message.job); sendResponse({ ok: true });
    }
  });
  // Content-page heartbeats wake MV3 without an external browser automation process.
  setInterval(() => chrome.runtime.sendMessage({ type: 'tick' }).catch(() => {}), 2000);
  new MutationObserver(() => sleep.flush()).observe(document.body, { childList: true, subtree: true, characterData: true });
})();
