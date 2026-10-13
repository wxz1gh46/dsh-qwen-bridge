# persist/

运行期状态目录。`state/` 下的数据由脚本生成，**不提交**（已在 .gitignore 中忽略）。

## 结构

```text
persist/state/
  config.json        站点与基础配置（非敏感）
  progress.json      会话进度与检查点，决定下一轮从哪续接
  todo.json          未完成任务
  conversation.jsonl 对话记录（追加写）
  meta.json          元信息与时间戳
  chrome-profile/    浏览器登录态（本机专用，绝不提交）
```

## 读写

```sh
node scripts/session-state.mjs --read    # 恢复
node scripts/session-state.mjs --write   # 保存
```

Actions 里通过 `actions/cache` + `actions/upload-artifact` 跨轮搬运；
本机用 `windows/persist-state.ps1` 打包/解包。

## 原则

- 凭证不进这里，一律走 GitHub Secrets 或本机未跟踪文件。
- 单个文件损坏时宁可报错也不静默重置，避免用坏状态继续跑。
