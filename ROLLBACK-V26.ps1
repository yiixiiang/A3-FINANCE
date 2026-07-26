[CmdletBinding()]
param([string]$ProjectPath)
$ErrorActionPreference = 'Stop'

if ([string]::IsNullOrWhiteSpace($ProjectPath)) {
    $ProjectPath = Read-Host 'Enter the full path to your A3-FINANCE project'
}
$ProjectPath = (Resolve-Path $ProjectPath).Path
$marker = Join-Path $ProjectPath '.a3-last-v26-backup.txt'
if (-not (Test-Path $marker)) { throw 'No V26 backup marker was found.' }
$backupRoot = (Get-Content $marker -Raw).Trim()
if (-not (Test-Path $backupRoot)) { throw "Backup folder not found: $backupRoot" }

Copy-Item (Join-Path $backupRoot 'src\lib\supabase-cloud.ts') (Join-Path $ProjectPath 'src\lib\supabase-cloud.ts') -Force
Copy-Item (Join-Path $backupRoot 'src\lib\access-control.ts') (Join-Path $ProjectPath 'src\lib\access-control.ts') -Force
Copy-Item (Join-Path $backupRoot 'src\components\management-app.tsx') (Join-Path $ProjectPath 'src\components\management-app.tsx') -Force
Copy-Item (Join-Path $backupRoot 'package.json') (Join-Path $ProjectPath 'package.json') -Force
if (Test-Path (Join-Path $backupRoot 'package-lock.json')) {
    Copy-Item (Join-Path $backupRoot 'package-lock.json') (Join-Path $ProjectPath 'package-lock.json') -Force
}
Write-Host 'V26 source changes were rolled back.' -ForegroundColor Green
