# 测试记录

## 自动化测试

```sh
node --test tests/*.test.mjs
```

**结果：86 项通过，0 失败。**

覆盖：正文与转义传输、调用批次校验、消息归属、格式修复上限、
摘要与续接、取消与超时、后台渲染、进度面板、配对配置、安装幂等性。

## 结构校验

```sh
node scripts/check-sites.mjs      # ✔ 2 个站点（qwen / deepseek）
node scripts/check-manifest.mjs   # ✔ manifest 与 2 个站点一致
node scripts/verify-source.mjs    # ✔ 25 个文件哈希一致
```

## 本次改造引入的测试夹具调整

站点适配层把选择器从 `page.js` 里搬到了 `sites/index.js`，
所以依赖浏览器脚本的回归测试需要先注入这一层。
新增 `tests/helpers/site.mjs` 统一处理，并给 vm 上下文补上 `location.origin`。

同时修正了两处真实问题：

1. `sites/index.js` 直接读 `location.origin`，在 Node 环境加载即崩 → 加环境守卫。
2. `bin/dsh-web-bridge.mjs` 复制扩展目录时不递归，`sites/` 子目录会丢失 → 改为递归复制。

`SOURCE.json` 的语义也做了调整：上游哈希作为 `upstream` 溯源保留，
本仓库自生成的哈希用于跟踪派生后的文件内容（`scripts/update-source.mjs`）。

## 未能验证的部分（必须说明）

以下内容**没有**在本次改造中被端到端验证：

| 项目 | 原因 |
| --- | --- |
| Qwen 真实收发消息 | 需要已登录的图形界面浏览器；CI 环境没有登录态 |
| Qwen 消息容器选择器 | 登录后才渲染；未登录页面只有输入框 |
| Windows GUI 启动器 | 当前环境是 Linux，无法运行 PowerShell |
| GitHub Actions 工作流实跑 | 需要推送到远端后由 GitHub 触发 |
| 千问账号有效性 | 未做任何登录尝试（也不应该在此环境尝试） |

结论：**CI 能验证的部分已全部通过；端到端链路必须在 Windows 本机实测后才能断言正常。**
