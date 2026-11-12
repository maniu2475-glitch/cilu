# 词炉 · 局域网服务
# 用法：右键 -> 使用 PowerShell 运行；或 pwsh -File serve.ps1
# 作用：在本机 8791 端口起静态服务，手机同 WiFi 可访问

$ErrorActionPreference = "Stop"
$root = $PSScriptRoot
$port = 8791

# 取本机内网 IP
$ip = (Get-NetIPAddress -AddressFamily IPv4 |
  Where-Object { $_.IPAddress -notmatch "^(127\.|169\.254\.)" } |
  Select-Object -First 1).IPAddress

# 放行防火墙（需要管理员权限；失败则提示手动允许）
try {
  $exists = Get-NetFirewallRule -DisplayName "词炉 8791" -ErrorAction SilentlyContinue
  if (-not $exists) {
    New-NetFirewallRule -DisplayName "词炉 8791" -Direction Inbound -Protocol TCP `
      -LocalPort $port -Action Allow -Profile Private -ErrorAction Stop | Out-Null
    Write-Host "[OK] 已添加防火墙规则" -ForegroundColor Green
  } else {
    Write-Host "[OK] 防火墙规则已存在" -ForegroundColor Green
  }
} catch {
  Write-Host "[提示] 防火墙规则未添加（非管理员）。手机首次访问被拦时，在弹窗里选允许。"
}

# 端口占用检查
$busy = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
if ($busy) {
  Write-Host "[提示] 端口 $port 已被 PID $($busy[0].OwningProcess) 占用，直接访问即可"
} else {
  $script = @"
const http=require('http'),fs=require('fs'),path=require('path');
const root=path.resolve('$($root -replace '\\','/')');
const MIME={'.html':'text/html;charset=utf-8','.js':'text/javascript;charset=utf-8','.json':'application/json;charset=utf-8','.png':'image/png','.css':'text/css;charset=utf-8','.ico':'image/x-icon','.md':'text/markdown;charset=utf-8'};
http.createServer((req,res)=>{
  let p=decodeURIComponent(new URL(req.url,'http://x').pathname);
  if(p==='/')p='/index.html';
  const f=path.join(root,p);
  if(!f.startsWith(root)){res.writeHead(403);return res.end('forbidden');}
  fs.readFile(f,(e,d)=>{
    if(e){res.writeHead(404,{'Content-Type':'text/plain'});return res.end('404 '+p);}
    res.writeHead(200,{'Content-Type':MIME[path.extname(f)]||'application/octet-stream','Cache-Control':'no-cache'});
    res.end(d);
  });
}).listen($port,'0.0.0.0',()=>console.log('LAN: http://${ip}:${port}/'));
"@
  $tmp = Join-Path $env:TEMP "cilu-serve.js"
  $script | Set-Content -Path $tmp -Encoding UTF8
  Start-Process -FilePath "node" -ArgumentList "`"$tmp`"" -WindowStyle Hidden
  Start-Sleep -Seconds 2
}

Write-Host ""
Write-Host "=============================================" -ForegroundColor Cyan
Write-Host "  手机浏览器打开： http://${ip}:${port}/" -ForegroundColor Yellow
Write-Host "  电脑本机打开：   http://127.0.0.1:${port}/" -ForegroundColor Gray
Write-Host "  停止服务：       Get-NetTCPConnection -LocalPort $port -State Listen | ForEach-Object { Stop-Process -Id `$_.OwningProcess -Force }" -ForegroundColor Gray
Write-Host "=============================================" -ForegroundColor Cyan
