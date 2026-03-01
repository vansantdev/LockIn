# scripts/deploy.ps1
# LockIn deploy script (Vite -> dist -> gh-pages via worktree)

$ErrorActionPreference = "Stop"

$repoRoot  = "C:\Users\darkh\lockin"
$deployDir = "C:\Users\darkh\lockin-deploy"
$distDir   = Join-Path $repoRoot "dist"
$cname     = "imlockin.app"

Write-Host "== LockIn Deploy ==" -ForegroundColor Cyan
Write-Host "Repo:   $repoRoot"
Write-Host "Deploy: $deployDir"
Write-Host "Dist:   $distDir"
Write-Host "CNAME:  $cname"
Write-Host ""

# Sanity checks
if (!(Test-Path $repoRoot))  { throw "Repo root not found: $repoRoot" }
if (!(Test-Path $deployDir)) { throw "Deploy folder not found: $deployDir (create worktree first)" }
if (!(Test-Path (Join-Path $repoRoot "package.json"))) { throw "package.json not found in $repoRoot" }

# 1) Build
Push-Location $repoRoot
Write-Host "-> Building..." -ForegroundColor Yellow
npm run build

# 2) Ensure CNAME is in dist
Write-Host "-> Writing dist\CNAME..." -ForegroundColor Yellow
$cname | Out-File -Encoding ascii (Join-Path $distDir "CNAME")

# 3) Sync dist into deploy worktree (DO NOT delete .git)
Write-Host "-> Syncing dist -> deploy worktree..." -ForegroundColor Yellow
Get-ChildItem -Force $deployDir | Where-Object { $_.Name -ne ".git" } | Remove-Item -Recurse -Force -ErrorAction SilentlyContinue
Copy-Item -Recurse -Force (Join-Path $distDir "*") $deployDir

Pop-Location

# 4) Commit + push in deploy worktree
Push-Location $deployDir
Write-Host "-> Committing deploy..." -ForegroundColor Yellow

git add -A

$ts = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
git commit -m "deploy: $ts" 2>$null
if ($LASTEXITCODE -ne 0) {
  Write-Host "No changes to commit. Skipping commit." -ForegroundColor DarkYellow
}

Write-Host "-> Fetch + force-with-lease push to gh-pages..." -ForegroundColor Yellow
git fetch origin | Out-Null
git push --force-with-lease origin gh-pages

Pop-Location

Write-Host ""
Write-Host "✅ Deploy complete: https://imlockin.app/" -ForegroundColor Green