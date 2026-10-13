<#
  Harness 网页桥接 · Windows 图形化启动器

  为什么需要它：本仓库的桥接依赖「有图形界面 + 已登录的浏览器」，
  GitHub Actions runner 没有 GUI 也没有登录态，跑不了桥接本体。
  所以图形化运行必须落在 Windows 本机；Actions 负责 CI 与状态持久化。

  功能：
    1. 检查并安装 Node.js 依赖
    2. 启动带远程调试端口的 Chrome，加载扩展目录
    3. 恢复上次持久化状态（对话记录、未完成任务、配置）
    4. 显示状态窗口，可一键打开 Qwen / 查看日志

  凭证说明：账号密码请放在 secrets.ps1（已在 .gitignore 中忽略），
  不要写进本文件，更不要提交到仓库。
#>
[CmdletBinding()]
param(
  [string]$ChromePath,
  [int]$DebugPort = 9222,
  [string]$StateDir = (Join-Path $PSScriptRoot '..\persist\state'),
  [switch]$SkipInstall
)

$ErrorActionPreference = 'Stop'
$root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$extensionDir = Join-Path $root 'extension'

function Write-Step($text) { Write-Host "[bridge] $text" -ForegroundColor Cyan }
function Write-Warn($text) { Write-Host "[bridge] $text" -ForegroundColor Yellow }
function Write-Err ($text) { Write-Host "[bridge] $text" -ForegroundColor Red }

Write-Step "工作目录: $root"

# --- 1. Node 与依赖 ---
$node = Get-Command node -ErrorAction SilentlyContinue
if (-not $node) {
  Write-Err ' 未找到 Node.js。请安装 Node.js 24+ 后重试：https://nodejs.org/'
  exit 1
}
$nodeVersion = (& node --version).TrimStart('v')
if ([int]($nodeVersion.Split('.')[0]) -lt 24) { Write-Warn "Node.js $nodeVersion 低于要求的 24，可能不兼容。" }

if (-not $SkipInstall) {
  Write-Step '安装依赖…'
  Push-Location $root
  try { & npm install --no-audit --no-fund | Out-Null } finally { Pop-Location }
}

# --- 2. 状态持久化 ---
Write-Step '恢复上次状态…'
Push-Location $root
try { & node scripts/session-state.mjs --read } finally { Pop-Location }

# --- 3. 找到 Chrome ---
function Find-Chrome {
  if ($ChromePath -and (Test-Path $ChromePath)) { return $ChromePath }
  $candidates = @(
    "$env:ProgramFiles\Google\Chrome\Application\chrome.exe",
    "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe",
    "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe",
    "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe"
  )
  foreach ($c in $candidates) { if (Test-Path $c) { return $c } }
  return $null
}
$chrome = Find-Chrome
if (-not $chrome) {
  Write-Err '未找到 Chrome 或 Edge。请用 -ChromePath 指定浏览器可执行文件。'
  exit 1
}
Write-Step "浏览器: $chrome"

# --- 4. 独立用户配置目录：避免污染日常浏览器，也让登录态可持久复用 ---
$profileDir = Join-Path $StateDir 'chrome-profile'
New-Item -ItemType Directory -Force -Path $profileDir | Out-Null

Write-Step "启动浏览器（调试端口 $DebugPort）…"
$chromeArgs = @(
  "--remote-debugging-port=$DebugPort",
  "--user-data-dir=`"$profileDir`"",
  "--load-extension=`"$extensionDir`"",
  '--no-first-run',
  '--no-default-browser-check',
  'https://chat.qwen.ai/'
)
Start-Process -FilePath $chrome -ArgumentList $chromeArgs | Out-Null

Start-Sleep -Seconds 4
Write-Step "浏览器已启动。"
Write-Host ''
Write-Host '下一步：' -ForegroundColor Green
Write-Host '  1. 在弹出的浏览器窗口里登录 Qwen 国际版（首次需要）'
Write-Host '  2. 打开 chrome://extensions 确认扩展已加载：Harness 网页桥接'
Write-Host '  3. 在 DSH 里选择「Qwen 网页」模型发送任务'
Write-Host '  4. 查看桥接状态: http://127.0.0.1:3081/'
Write-Host ''
Write-Host "状态目录: $StateDir" -ForegroundColor DarkGray
Write-Host "扩展目录: $extensionDir" -ForegroundColor DarkGray
