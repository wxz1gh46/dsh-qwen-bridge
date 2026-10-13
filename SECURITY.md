# 安全须知

## 不要在仓库里放凭证

本仓库是公开的。以下内容**永远不要**提交：

- GitHub Personal Access Token
- 邮箱/账号的密码
- 浏览器 cookie、`localStorage` 导出
- `persist/state/chrome-profile/`（含登录态）

已在 [.gitignore](.gitignore) 中忽略 `windows/secrets.ps1`、`web-bridge/`、
`persist/state/chrome-profile/`。需要凭证时用 GitHub Secrets 或本地未跟踪文件。

## 如果凭证已经泄露

1. 立刻撤销：GitHub → Settings → Developer settings → Personal access tokens。
2. 改密码：相关邮箱/账号全部更换，并开启两步验证。
3. 检查异常：GitHub → Settings → Sessions、Security log；邮箱的登录记录。
4. 若已提交到 git 历史，仅删除文件不够，需要重写历史（`git filter-repo`）并强制推送。

## 关于 GitHub Actions

Actions runner 是共享的云端虚拟机：

- 没有图形界面，**无法运行本仓库的 Chrome 网页桥接**。
- 不要在工作流里回显 secrets，也不要 `set -x` 打印含 token 的命令。
- 本仓库工作流只申请 `contents: read`（keepalive 额外需要 `actions: write`）。

## 网页桥接会发送什么

桥接把任务上下文、工具定义与工具结果发送给目标网页服务（如 Qwen）。
只在你愿意把这些内容交给该服务的项目上使用。
