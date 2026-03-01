$ErrorActionPreference = "Stop"

$repoRoot  = "C:\Users\darkh\lockin"
$deployDir = "C:\Users\darkh\lockin-deploy"
$distDir   = Join-Path $repoRoot "dist"
$cname     = "imlockin.app"

Write-Host "Deploy complete: https://imlockin.app/" -ForegroundColor Green

# Build
cd $repoRoot
Write-Host "-> Building..." -ForegroundColor Yellow
npm run build

# CNAME
$cname | Out-File -Encoding ascii (Join-Path $distDir "CNAME")

# Sync WITHOUT deleting .git
Get-ChildItem -Force $deployDir |
  Where-Object { $_.Name -ne ".git" } |
  Remove-Item -Recurse -Force -ErrorAction SilentlyContinue

Copy-Item -Recurse -Force (Join-Path $distDir "*") $deployDir

# Commit + push
cd $deployDir

git add -A
git commit -m "deploy: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')" 2>$null
git fetch origin
git push --force-with-lease origin gh-pages

Write-Host "✅ Deploy complete: https://imlockin.app/" -ForegroundColor Green