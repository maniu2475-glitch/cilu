# 词炉 · 发布脚本
# 用法：在 wordapp 目录下执行  powershell -ExecutionPolicy Bypass -File publish.ps1
# 作用：把源码改动同步到 gh-pages 分支并推送，触发 Pages 重建

$ErrorActionPreference = "Stop"
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
$dirty = git status --porcelain
if ($dirty) {
  Write-Host "[1/4] 源码有改动，提交到 main..." -ForegroundColor Gray
  git add -A
  git commit -m "update: $(Get-Date -Format 'yyyy-MM-dd HH:mm')" | Out-Null
} else {
  Write-Host "[1/4] 源码无改动" -ForegroundColor Gray
}

Write-Host "[2/4] 推送 main..." -ForegroundColor Gray
git push origin main 2>&1 | Out-Null
Pop-Location

# 3. 同步到 gh-pages
Write-Host "[3/4] 同步发布产物到 gh-pages..." -ForegroundColor Gray
$tmp = Join-Path $env:TEMP "cilu-ghpages"
$worktreeExists = (Test-Path $tmp)
Push-Location $src

if ($worktreeExists) {
  git worktree remove $tmp --force 2>$null
}
git worktree add -f -B gh-pages $tmp 2>&1 | Out-Null

Push-Location $tmp
Get-ChildItem -Force | Where-Object { $_.Name -ne ".git" } | Remove-Item -Recurse -Force
Copy-Item "$src\index.html","$src\manifest.json","$src\sw.js","$src\.nojekyll" . -Force
New-Item -ItemType Directory -Force -Path icons | Out-Null
Copy-Item "$src\icons\*.png" icons\ -Force

$changed = git status --porcelain
if ($changed) {
  git add -A
  git commit -m "deploy: $(Get-Date -Format 'yyyy-MM-dd HH:mm')" | Out-Null
  git push -u origin gh-pages --force 2>&1 | Out-Null
  Write-Host "      已推送 gh-pages" -ForegroundColor Green
} else {
  Write-Host "      发布产物无变化，跳过" -ForegroundColor Gray
}
Pop-Location

Pop-Location

# 4. 清理
git worktree prune

Write-Host "[4/4] 完成" -ForegroundColor Green
Write-Host ""
Write-Host "  地址：https://maniu2475-glitch.github.io/cilu/" -ForegroundColor Yellow
Write-Host "  Pages 重建约 1-2 分钟后生效" -ForegroundColor Gray
