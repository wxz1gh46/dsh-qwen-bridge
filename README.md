# DSH Web Bridge · Qwen 国际版 / DeepSeek

把已登录的网页（**Qwen 国际版** `chat.qwen.ai` 或 DeepSeek `chat.deepseek.com`）作为算力接入
[DSH Harness](https://github.com/xinyuquan985-coder/DSH-webtokens) 的模型菜单，
让 Harness 在本机完成工具调用、多轮任务、验证与修复。

派生自 [xinyuquan985-coder/DSH-webtokens](https://github.com/xinyuquan985-coder/DSH-webtokens)
（`82440ec`，插件 0.2.15 / 扩展 0.2.19）。本仓库的主要改动是**站点适配层**，
并新增 Qwen 国际版适配。

---

## ⚠️ 先读这一段：什么能跑，什么跑不了

这套桥接的架构是：

```text
Harness 用户任务与工具定义
          ↓
DSH 插件 → 本机桥接 127.0.0.1:3081
          ↓
Chrome 扩展 → 已登录的网页（Qwen / DeepSeek）
          ↓
回答校验 → Harness 原生工具调用 → 实际工具结果 → 下一轮
```

它**必须有图形界面和已登录的浏览器**。因此：

| 需求 | 能不能做到 | 说明 |
| --- | --- | --- |
| 在 **Windows 本机**跑图形化桥接 | ✅ | 见 [windows/](windows/) |
| 在 **GitHub Actions** 跑测试 / 校验 / 打包 | ✅ | 见 [.github/workflows/ci.yml](.github/workflows/ci.yml) |
| 在 **GitHub Actions** 维持 6 小时会话 + 状态持久化 + 自动重启 | ✅ | 见 [.github/workflows/keepalive.yml](.github/workflows/keepalive.yml) |
| 在 **GitHub Actions** 跑 Windows 图形界面 + Chrome 网页桥接 | ❌ | runner 无 GUI、无登录态 |
| 在 **GitHub Actions** 登录 Qwen 并代替你对话 | ❌ | 同上，且会把凭证暴露给公开仓库 |

**GitHub Actions 的 runner 是无图形界面的云端虚拟机**：没有桌面、没有你的浏览器 cookie、
没有持久的 Chrome 用户配置。Chrome 扩展无法加载到"用户正在使用的浏览器"里。
把账号密码放进公开仓库的 secrets 去跑 CI 登录，风险极高且会触发风控。

所以本仓库的分工是：

- **Windows 本机**：真正跑桥接（图形界面、Chrome、登录态）。
- **GitHub Actions**：跑 CI（86 项回归测试 + 结构校验），并提供**会话生命周期与持久化**骨架。

---

## 站点适配层

新增 `extension/sites/index.js`，把"操作哪个网站"从桥接协议里拆出来。
每个站点声明自己的域名、输入框、消息节点选择器：

```js
{
  id: 'qwen',
  origin: 'https://chat.qwen.ai',
  selectors: {
    editor: () => document.querySelector('textarea.message-input-textarea'),
    messages: '[class*="chat-message-assistant"], ...',
    // ...
  }
}
```

`content.js` / `page.js` / `tabs.js` 共用同一套协议，不再硬编码站点。
新增站点只需在此登记。

**已实测的 Qwen DOM 事实**（`chat.qwen.ai`，前端 `qwen-chat-fe 0.3.17`）：

- 输入框是原生 `<textarea class="message-input-textarea" placeholder="Ask Qwen">`
  —— 与 DeepSeek 同构，可直接赋值 + 派发事件。
- 发送按钮 `.message-input-right-button-send`；未登录时该位置显示语音按钮。
- 消息容器类名（`chat-message-assistant` 等）来自前端约定，**登录后才渲染**，
  属于易变部分 —— 改版时需要更新选择器。

> 这些选择器在无登录态的 CI 环境里无法端到端验证。CI 只校验结构与加载；
> 真实收发需要在 Windows 本机实测。

---

## 安装与运行（Windows 本机）

需要 Node.js 24+、Chrome（或 Edge）、可正常登录的 Qwen 账号。

```powershell
git clone https://github.com/wxz1gh46/dsh-qwen-bridge.git
cd dsh-qwen-bridge
.\windows\start-gui.cmd
```

脚本会：安装依赖 → 恢复上次状态 → 用**独立用户配置**启动 Chrome 并加载扩展 → 打开 Qwen。
首次运行请在浏览器里登录。

安装为 DSH 插件：

```sh
npm install -g pnpm @deepseek-ai/dsh@0.1.5-rc.1
dsh plugin --profile web add ./
dsh plugin --profile web exec dsh-web-bridge setup
dsh web
```

在有 `manifest.json` 的目录里加载扩展（`chrome://extensions` → 开发者模式 → 加载已解压的扩展程序）。

在 Harness 模型菜单选择 **Qwen 网页**（`qwen-web`）或 **DeepSeek 网页**（`deepseek-web`）。

---

## 持久化与自动重启

目标：Actions 窗口结束后自动触发下一轮，下一轮直接读取上次保存内容，
无需重新填写配置（对话记录、未完成任务等分文件存放）。

```text
persist/state/
  config.json      站点与基础配置（非敏感）
  progress.json    会话进度、检查点、续接点
  todo.json        未完成任务
  conversation.jsonl  对话记录（追加）
  meta.json        元信息与时间戳
```

- **写盘时机**：`scripts/session-window.mjs` 定期心跳 + 窗口结束时落盘。
- **跨轮恢复**：`scripts/session-state.mjs --read` 在下一轮开头恢复；
  `progress.json` 的 `phase` 决定从哪继续。
- **自动重触发**：`scripts/retrigger.mjs` 用 `workflow_dispatch` 触发下一轮。

为什么不用 `schedule`：cron 最小间隔 5 分钟、可能延迟、且不是"本轮结束后立即下一轮"。
只有一个 job 主动调用 API 才能形成连续会话链。

> 提醒：GitHub 托管 runner 的硬上限是 **6 小时/job**，且会在超时后强杀。
> 本仓库用 330 分钟窗口 + 落盘 + 重触发来规避强杀造成的数据丢失。

---

## 测试

```sh
node --test tests/*.test.mjs      # 86 项回归测试
node scripts/check-sites.mjs      # 站点适配层完整性
node scripts/check-manifest.mjs   # manifest 与站点一致
node scripts/verify-source.mjs    # 文件哈希
```

---

## 凭证

**不要**把 token / 密码提交到仓库。见 [SECURITY.md](SECURITY.md)。

如果你是照着某个 Issue 里的明文 token 跑过来的：那个 token 已经公开，
请立即去 GitHub 撤销并重新生成，同时更换相关账号密码。

---

## 已知限制

- Qwen 的消息容器选择器依赖前端类名，改版会失效 —— 需要更新 `sites/index.js`。
- 网页端没有正式 API，模型选择、限额、验证码、风控都由网站决定。
- 本插件不提供 API Key，也不解锁账号没有的模型。
- CI 无法验证"Qwen 能否真实收发"，只能验证结构；端到端必须本机实测。
