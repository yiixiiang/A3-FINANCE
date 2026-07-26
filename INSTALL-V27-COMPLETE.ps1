$ErrorActionPreference = "Stop"

Write-Host ""
Write-Host "==============================================" -ForegroundColor Cyan
Write-Host " A3 FINANCE V27 COMPLETE UPGRADE - SAFE MODE" -ForegroundColor Cyan
Write-Host "==============================================" -ForegroundColor Cyan
Write-Host ""

# Project folder
$ProjectPath = Split-Path -Parent $MyInvocation.MyCommand.Path
$ProjectPath = (Resolve-Path $ProjectPath).Path

# Upgrade source:
# Prefer a payload folder when present.
$PayloadPath = Join-Path $PSScriptRoot "payload"

# Store backups OUTSIDE the FINANCE project to prevent recursive copying.
$ProjectsParent = Split-Path -Parent $ProjectPath
$BackupRoot = Join-Path $ProjectsParent ".a3-upgrade-backups"
$Timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$BackupPath = Join-Path $BackupRoot "v27-$Timestamp"

Write-Host "Project: $ProjectPath" -ForegroundColor Yellow
Write-Host "Backup:  $BackupPath" -ForegroundColor Yellow
Write-Host ""

# Confirm this is a Next.js project.
$PackageJson = Join-Path $ProjectPath "package.json"

if (-not (Test-Path $PackageJson)) {
    throw "package.json was not found in $ProjectPath"
}

# Create external backup folder.
New-Item -ItemType Directory -Path $BackupPath -Force | Out-Null

Write-Host "[1/7] Creating safe external backup..." -ForegroundColor Cyan

$BackupArguments = @(
    "`"$ProjectPath`"",
    "`"$BackupPath`"",
    "/E",
    "/R:2",
    "/W:1",
    "/XD",
    ".git",
    ".next",
    "node_modules",
    ".a3-upgrade-backups",
    "/XF",
    "*.log"
)

$BackupProcess = Start-Process `
    -FilePath "robocopy.exe" `
    -ArgumentList $BackupArguments `
    -Wait `
    -PassThru `
    -NoNewWindow

# Robocopy exit codes 0–7 are successful.
if ($BackupProcess.ExitCode -gt 7) {
    throw "Backup failed. Robocopy exit code: $($BackupProcess.ExitCode)"
}

Write-Host "Backup completed." -ForegroundColor Green

Write-Host "[2/7] Applying V27 files..." -ForegroundColor Cyan

if (Test-Path $PayloadPath) {
    $ResolvedPayload = (Resolve-Path $PayloadPath).Path

    if ($ResolvedPayload -eq $ProjectPath) {
        Write-Host "Payload and project are the same folder. Copy skipped." -ForegroundColor Yellow
    }
    else {
        $CopyArguments = @(
            "`"$ResolvedPayload`"",
            "`"$ProjectPath`"",
            "/E",
            "/R:2",
            "/W:1",
            "/XD",
            ".git",
            ".next",
            "node_modules",
            ".a3-upgrade-backups",
            "/XF",
            ".env.local",
            "INSTALL-V27-COMPLETE.ps1",
            "*.log"
        )

        $CopyProcess = Start-Process `
            -FilePath "robocopy.exe" `
            -ArgumentList $CopyArguments `
            -Wait `
            -PassThru `
            -NoNewWindow

        if ($CopyProcess.ExitCode -gt 7) {
            throw "Upgrade copy failed. Robocopy exit code: $($CopyProcess.ExitCode)"
        }

        Write-Host "V27 files copied successfully." -ForegroundColor Green
    }
}
else {
    Write-Host "No payload folder found." -ForegroundColor Yellow
    Write-Host "The ZIP appears to have already been extracted into FINANCE." -ForegroundColor Yellow
    Write-Host "Self-copy has been skipped safely." -ForegroundColor Yellow
}

Set-Location $ProjectPath

Write-Host "[3/7] Installing packages..." -ForegroundColor Cyan
npm install

if ($LASTEXITCODE -ne 0) {
    throw "npm install failed."
}

Write-Host "[4/7] Running TypeScript check..." -ForegroundColor Cyan
npm run typecheck

if ($LASTEXITCODE -ne 0) {
    throw "TypeScript check failed. Nothing will be pushed."
}

Write-Host "[5/7] Running production build..." -ForegroundColor Cyan
npm run build

if ($LASTEXITCODE -ne 0) {
    throw "Production build failed. Nothing will be pushed."
}

Write-Host "[6/7] Committing upgrade to GitHub..." -ForegroundColor Cyan

$GitFolder = Join-Path $ProjectPath ".git"

if (Test-Path $GitFolder) {
    git add .

    $Changes = git status --porcelain

    if ($Changes) {
        git commit -m "Upgrade A3 Finance to V27 complete set"

        if ($LASTEXITCODE -ne 0) {
            throw "Git commit failed."
        }

        git push

        if ($LASTEXITCODE -ne 0) {
            throw "Git push failed."
        }

        Write-Host "GitHub push completed." -ForegroundColor Green
    }
    else {
        Write-Host "No new Git changes to commit." -ForegroundColor Yellow
    }
}
else {
    Write-Host "No .git folder found. GitHub push skipped." -ForegroundColor Yellow
}

Write-Host "[7/7] Upgrade completed." -ForegroundColor Cyan
Write-Host ""
Write-Host "==============================================" -ForegroundColor Green
Write-Host " A3 FINANCE V27 COMPLETED SUCCESSFULLY" -ForegroundColor Green
Write-Host "==============================================" -ForegroundColor Green
Write-Host ""
Write-Host "Backup saved at:" -ForegroundColor White
Write-Host $BackupPath -ForegroundColor Yellow
Write-Host ""
Write-Host "Vercel should deploy automatically after GitHub push." -ForegroundColor White
Write-Host ""