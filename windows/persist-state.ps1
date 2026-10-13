<#
  状态持久化脚本：把会话状态打包/恢复，供本机运行与 Actions 之间搬运。
  用法：
    .\persist-state.ps1 -Action export -Out bridge-state.zip
    .\persist-state.ps1 -Action import -In  bridge-state.zip
#>
[CmdletBinding()]
param(
  [Parameter(Mandatory)][ValidateSet('export','import')][string]$Action,
  [string]$StateDir = (Join-Path $PSScriptRoot '..\persist\state'),
  [Parameter(Mandatory)][string]$File
)
$ErrorActionPreference = 'Stop'
$resolvedState = (Resolve-Path $StateDir -ErrorAction SilentlyContinue)
if (-not $resolvedState) { New-Item -ItemType Directory -Force -Path $StateDir | Out-Null }

switch ($Action) {
  'export' {
    if (Test-Path $File) { Remove-Item $File -Force }
    Compress-Archive -Path (Join-Path $StateDir '*') -DestinationPath $File -Force
    Write-Host "[persist] 已导出到 $File"
  }
  'import' {
    if (-not (Test-Path $File)) { throw "找不到归档文件: $File" }
    Expand-Archive -Path $File -DestinationPath $StateDir -Force
    Write-Host "[persist] 已恢复到 $StateDir"
  }
}
