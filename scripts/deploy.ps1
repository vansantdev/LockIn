# scripts/deploy.ps1
$ErrorActionPreference = "Stop"

function Get-GitRoot($startPath) {
  $p = Resolve-Path $startPath
  while ($true) {
    if (Test-Path (Join-Path $p ".git")) { return $p }
    $parent = Split-Path $p -Parent
    if ($parent -eq $p) { throw "Could not find .git folder above $startPath" }
    $p = $parent
  }
}

$repoRoot  = Get-GitRoot (Get-Location)
$deployDir = Resolve-Path (Join-Path $repoRoot "..\lockin-deploy")
$distDir   = Join-Path $repoRoot "dist"
$cname     = "imlockin.app"

Write-Host "== LockIn Deploy ==" -ForegroundColor Cyan
Write-Host "Repo:   $repoRoot"
Write-Host "Deploy: $deployDir"
Write-Host "Dist:   $distDir"
Write-Host "CNAME:  $cname"
Write-Host ""

Push-Location $repoRoot

Write-Host "-> Building..." -ForegroundColor Yellow
npm run build

Write-Host "-> Writing dist\CNAME..." -ForegroundColor Yellow
$cname | Out-File -Encoding ascii (Join-Path $distDir "CNAME")

Write-Host "-> Syncing dist -> deploy worktree..." -ForegroundColor Yellow
Remove-Item -Recurse -Force (Join-Path $deployDir "*") -ErrorAction SilentlyContinue
Copy-Item -Recurse -Force (Join-Path $distDir "*") $deployDir

Pop-Location

Push-Location $deployDir

Write-Host "-> Committing deploy..." -ForegroundColor Yellow
git add -A
$ts = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
git commit -m "deploy: $ts" 2>$null
if ($LASTEXITCODE -ne 0) { Write-Host "No changes to commit." -ForegroundColor DarkYellow }

Write-Host "-> Pushing gh-pages..." -ForegroundColor Yellow
git fetch origin
git push --force-with-lease origin gh-pages

Pop-Location

Write-Host ""
Write-Host "✅ Deploy complete: https://imlockin.app/" -ForegroundColor Green