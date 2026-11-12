# 词炉 · 发布脚本
# 用法：在 wordapp 目录下执行  powershell -ExecutionPolicy Bypass -File publish.ps1
# 作用：把源码改动同步到 gh-pages 分支并推送，触发 Pages 重建

# git 会往 stderr 写进度信息，PowerShell 会当成错误。用这个包装函数静默处理
function Invoke-Git {
  param([string[]]$GitArgs)
  $out = & git @GitArgs 2>&1
  $code = $LASTEXITCODE
  return @{ Code = $code; Out = ($out | Out-String).Trim() }
}

$ErrorActionPreference = "Continue"
$src = $PSScriptRoot
$port = 7893

Write-Host "=== 词炉发布 ===" -ForegroundColor Cyan

# 1. 检查代理
$proxyOk = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
if (-not $proxyOk) {
  Write-Host "[警告] 代理 $port 未监听，推送大概率失败。请先开代理再跑。" -ForegroundColor Yellow
}

# 2. 提交源码改动（如果工作区有变化）
Push-Location $src
$dirty = (Invoke-Git @("status","--porcelain")).Out
if ($dirty) {
  Write-Host "[1/4] 源码有改动，提交到 main..." -ForegroundColor Gray
  Invoke-Git @("add","-A") | Out-Null
  Invoke-Git @("commit","-m","update: $(Get-Date -Format 'yyyy-MM-dd HH:mm')") | Out-Null
} else {
  Write-Host "[1/4] 源码无改动" -ForegroundColor Gray
}

Write-Host "[2/4] 推送 main..." -ForegroundColor Gray
$r = Invoke-Git @("push","origin","main")
if ($r.Code -ne 0) { Write-Host "      推送失败: $($r.Out)" -ForegroundColor Red } else { Write-Host "      已推送" -ForegroundColor Green }
Pop-Location

# 3. 同步到 gh-pages
Write-Host "[3/4] 同步发布产物到 gh-pages..." -ForegroundColor Gray
$tmp = Join-Path $env:TEMP "cilu-ghpages"
Push-Location $src

if (Test-Path $tmp) { Invoke-Git @("worktree","remove",$tmp,"--force") | Out-Null }
Invoke-Git @("worktree","prune") | Out-Null
$r = Invoke-Git @("worktree","add","-f","-B","gh-pages",$tmp)
if ($r.Code -ne 0) { Write-Host "      工作树创建失败: $($r.Out)" -ForegroundColor Red; Pop-Location; exit 1 }

Push-Location $tmp
Get-ChildItem -Force | Where-Object { $_.Name -ne ".git" } | Remove-Item -Recurse -Force
Copy-Item "$src\index.html","$src\manifest.json","$src\sw.js","$src\.nojekyll" . -Force
New-Item -ItemType Directory -Force -Path icons | Out-Null
Copy-Item "$src\icons\*.png" icons\ -Force

$changed = (Invoke-Git @("status","--porcelain")).Out
if ($changed) {
  Invoke-Git @("add","-A") | Out-Null
  Invoke-Git @("commit","-m","deploy: $(Get-Date -Format 'yyyy-MM-dd HH:mm')") | Out-Null
  $r2 = Invoke-Git @("push","-u","origin","gh-pages","--force")
  if ($r2.Code -ne 0) { Write-Host "      gh-pages 推送失败: $($r2.Out)" -ForegroundColor Red }
  else { Write-Host "      已推送 gh-pages" -ForegroundColor Green }
} else {
  Write-Host "      发布产物无变化，跳过" -ForegroundColor Gray
}
Pop-Location
Pop-Location

# 4. 清理
Invoke-Git @("worktree","prune") | Out-Null

Write-Host "[4/4] 完成" -ForegroundColor Green
Write-Host ""
Write-Host "  地址：https://maniu2475-glitch.github.io/cilu/" -ForegroundColor Yellow
Write-Host "  Pages 重建约 1-2 分钟后生效" -ForegroundColor Gray
