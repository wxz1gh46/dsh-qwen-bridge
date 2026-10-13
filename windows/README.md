# Windows 图形化运行

桥接本体必须有图形界面与登录态，所以在这里跑；GitHub Actions 只做 CI 与状态持久化。

## 快速开始

双击 `start-gui.cmd`，或：

```powershell
.\windows\start-gui.ps1
```

脚本会：安装依赖 → 恢复上次状态 → 用独立用户配置启动 Chrome 并加载扩展 → 打开 Qwen。

首次运行请在浏览器里登录 Qwen 国际版。登录态保存在 `persist/state/chrome-profile`，
下次启动直接复用，无需重新登录。

## 参数

| 参数 | 说明 |
| --- | --- |
| `-ChromePath` | 指定浏览器可执行文件 |
| `-DebugPort` | 远程调试端口，默认 9222 |
| `-SkipInstall` | 跳过 `npm install` |
| `-StateDir` | 状态目录，默认 `persist/state` |

## 状态搬运

```powershell
.\windows\persist-state.ps1 -Action export -File bridge-state.zip
.\windows\persist-state.ps1 -Action import -File bridge-state.zip
```

## 凭证

账号密码放在 `windows/secrets.ps1`（已被 `.gitignore` 忽略）。
**永远不要**把凭证提交到仓库或写进工作流。
