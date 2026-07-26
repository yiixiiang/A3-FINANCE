[CmdletBinding()]
param(
    [string]$ProjectPath
)

$ErrorActionPreference = 'Stop'

function Write-Step([string]$Message) {
    Write-Host "`n==> $Message" -ForegroundColor Cyan
}

if ([string]::IsNullOrWhiteSpace($ProjectPath)) {
    $ProjectPath = Read-Host 'Enter the full path to your A3-FINANCE project'
}

$ProjectPath = (Resolve-Path $ProjectPath).Path
$CloudFile = Join-Path $ProjectPath 'src\lib\supabase-cloud.ts'
$AccessFile = Join-Path $ProjectPath 'src\lib\access-control.ts'
$PackageFile = Join-Path $ProjectPath 'package.json'

foreach ($file in @($CloudFile, $AccessFile, $PackageFile)) {
    if (-not (Test-Path $file)) {
        throw "Required file not found: $file"
    }
}

$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$backupRoot = Join-Path $ProjectPath ".a3-upgrade-backups\v25-$stamp"
New-Item -ItemType Directory -Force -Path (Join-Path $backupRoot 'src\lib') | Out-Null
Copy-Item $CloudFile (Join-Path $backupRoot 'src\lib\supabase-cloud.ts')
Copy-Item $AccessFile (Join-Path $backupRoot 'src\lib\access-control.ts')
Copy-Item $PackageFile (Join-Path $backupRoot 'package.json')
Set-Content -Path (Join-Path $ProjectPath '.a3-last-v25-backup.txt') -Value $backupRoot -Encoding UTF8
Write-Step "Backup created at $backupRoot"

Write-Step 'Enabling User Access cloud synchronization'
$cloud = Get-Content $CloudFile -Raw
$originalCloud = $cloud

# Remove a3-user-access from LOCAL_ONLY_KEYS only. This allows the existing
# sync engine to upload, restore, merge, audit, and back up the user list.
$cloud = [regex]::Replace(
    $cloud,
    '(?m)^\s*"a3-user-access",\s*\r?\n',
    ''
)

if ($cloud -eq $originalCloud) {
    if ($cloud -match 'LOCAL_ONLY_KEYS' -and $cloud -notmatch '"a3-user-access"') {
        Write-Host 'User Access sync was already enabled.' -ForegroundColor Yellow
    } else {
        throw 'Could not safely locate the a3-user-access exclusion in supabase-cloud.ts.'
    }
} else {
    Set-Content -Path $CloudFile -Value $cloud -Encoding UTF8
}

Write-Step 'Upgrading administrator recovery and permission revision'
$access = Get-Content $AccessFile -Raw

$access = [regex]::Replace(
    $access,
    'export const CURRENT_PERMISSION_REVISION\s*=\s*\d+;',
    'export const CURRENT_PERMISSION_REVISION = 6;'
)

# Force the canonical primary administrator credentials during normalization.
# This repairs stale local user records after browser resets or upgrades.
$canonicalPattern = '(?s)const canonicalAdmin: UserAccessRecord = \{\s*\.\.\.selectedAdmin,.*?status:\s*"Active",\s*\};'
$canonicalReplacement = @'
const canonicalAdmin: UserAccessRecord = {
    ...selectedAdmin,
    id: DEFAULT_ADMIN_USER.id,
    username: DEFAULT_ADMIN_USERNAME,
    name: selectedAdmin.name || DEFAULT_ADMIN_USER.name,
    email: DEFAULT_ADMIN_USER.email,
    password: DEFAULT_ADMIN_PASSWORD,
    role: "ADMIN",
    accessScope: "ALL_INFORMATION",
    companyId: selectedAdmin.companyId || "",
    driverId: selectedAdmin.driverId || "",
    visibleModules: [...DEFAULT_ADMIN_USER.visibleModules],
    permissionRevision: CURRENT_PERMISSION_REVISION,
    status: "Active",
  };
'@

if (-not [regex]::IsMatch($access, $canonicalPattern)) {
    throw 'Could not safely locate canonicalAdmin in access-control.ts.'
}
$access = [regex]::Replace($access, $canonicalPattern, $canonicalReplacement)
Set-Content -Path $AccessFile -Value $access -Encoding UTF8

Write-Step 'Installing dependencies'
Push-Location $ProjectPath
try {
    npm install
    if ($LASTEXITCODE -ne 0) { throw 'npm install failed.' }

    Write-Step 'Running TypeScript validation'
    npm run typecheck
    if ($LASTEXITCODE -ne 0) { throw 'Typecheck failed. Your original files remain available in the backup folder.' }

    Write-Step 'Running production build'
    npm run build
    if ($LASTEXITCODE -ne 0) { throw 'Production build failed. Your original files remain available in the backup folder.' }

    if (Test-Path (Join-Path $ProjectPath '.git')) {
        Write-Step 'Creating Git commit'
        git add src/lib/supabase-cloud.ts src/lib/access-control.ts package-lock.json package.json 2>$null
        git commit -m "Upgrade V25 automatic user access sync" 2>$null
        if ($LASTEXITCODE -eq 0) {
            $origin = git remote get-url origin 2>$null
            if ($LASTEXITCODE -eq 0 -and $origin) {
                Write-Step 'Pushing to GitHub'
                git push
                if ($LASTEXITCODE -ne 0) {
                    Write-Host 'Build passed, but git push failed. Push manually from the project folder.' -ForegroundColor Yellow
                }
            }
        } else {
            Write-Host 'No Git commit created, possibly because there were no new changes.' -ForegroundColor Yellow
        }
    }
} finally {
    Pop-Location
}

Write-Host "`nV25 upgrade completed successfully." -ForegroundColor Green
Write-Host 'After Vercel deploys, upload from the main laptop once and restore on the iPhone once.' -ForegroundColor Green
