[CmdletBinding()]
param([string]$ProjectPath)

$ErrorActionPreference = 'Stop'

function Step([string]$Text) {
    Write-Host "`n==> $Text" -ForegroundColor Cyan
}

if ([string]::IsNullOrWhiteSpace($ProjectPath)) {
    $ProjectPath = Read-Host 'Enter the full path to your A3-FINANCE project'
}

$ProjectPath = (Resolve-Path $ProjectPath).Path
$CloudFile = Join-Path $ProjectPath 'src\lib\supabase-cloud.ts'
$AccessFile = Join-Path $ProjectPath 'src\lib\access-control.ts'
$AppFile = Join-Path $ProjectPath 'src\components\management-app.tsx'
$PackageFile = Join-Path $ProjectPath 'package.json'

foreach ($file in @($CloudFile, $AccessFile, $AppFile, $PackageFile)) {
    if (-not (Test-Path $file)) { throw "Required file not found: $file" }
}

$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$backupRoot = Join-Path $ProjectPath ".a3-upgrade-backups\v26-$stamp"
New-Item -ItemType Directory -Force -Path (Join-Path $backupRoot 'src\lib') | Out-Null
New-Item -ItemType Directory -Force -Path (Join-Path $backupRoot 'src\components') | Out-Null
Copy-Item $CloudFile (Join-Path $backupRoot 'src\lib\supabase-cloud.ts')
Copy-Item $AccessFile (Join-Path $backupRoot 'src\lib\access-control.ts')
Copy-Item $AppFile (Join-Path $backupRoot 'src\components\management-app.tsx')
Copy-Item $PackageFile (Join-Path $backupRoot 'package.json')
if (Test-Path (Join-Path $ProjectPath 'package-lock.json')) {
    Copy-Item (Join-Path $ProjectPath 'package-lock.json') (Join-Path $backupRoot 'package-lock.json')
}
Set-Content -Path (Join-Path $ProjectPath '.a3-last-v26-backup.txt') -Value $backupRoot -Encoding UTF8
Step "Backup created: $backupRoot"

Step 'Upgrading cloud synchronization engine'
$cloud = Get-Content $CloudFile -Raw

# Allow A3 User Access records to synchronize.
$cloud = [regex]::Replace($cloud, '(?m)^\s*"a3-user-access",\s*\r?\n', '')

# Raise cloud data version.
$cloud = [regex]::Replace($cloud, 'const APP_VERSION\s*=\s*\d+;', 'const APP_VERSION = 26;')

# Faster automatic sync. Existing implementation enforces a minimum of 30 seconds.
$cloud = [regex]::Replace($cloud, 'const AUTO_SYNC_INTERVAL_MS\s*=\s*[\d_]+;', 'const AUTO_SYNC_INTERVAL_MS = 30_000;')

# Expose a safe access-token getter for future server-side admin operations.
if ($cloud -notmatch 'export async function getCloudAccessToken') {
    $anchor = 'export async function signOutCloud(): Promise<void> {'
    if (-not $cloud.Contains($anchor)) { throw 'Could not locate signOutCloud in supabase-cloud.ts.' }
    $getter = @'
export async function getCloudAccessToken(): Promise<string> {
  const session = await usableSession();
  return session?.access_token || "";
}

'@
    $cloud = $cloud.Replace($anchor, $getter + $anchor)
}
Set-Content -Path $CloudFile -Value $cloud -Encoding UTF8

Step 'Repairing the primary administrator and permission migration'
$access = Get-Content $AccessFile -Raw
$access = [regex]::Replace($access, 'export const CURRENT_PERMISSION_REVISION\s*=\s*\d+;', 'export const CURRENT_PERMISSION_REVISION = 7;')

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

Step 'Improving login cloud-status handling'
$app = Get-Content $AppFile -Raw
$old = 'await signInAndHydrateCloud(user.email,password);'
$new = @'
const cloudResult = await signInAndHydrateCloud(user.email,password);
   if (!cloudResult.ok) {
    console.warn("A3 cloud authentication:", cloudResult.message);
   }
'@
if ($app.Contains($old)) {
    $app = $app.Replace($old, $new)
} elseif ($app -notmatch 'const cloudResult = await signInAndHydrateCloud') {
    throw 'Could not safely locate the cloud sign-in call in management-app.tsx.'
}
Set-Content -Path $AppFile -Value $app -Encoding UTF8

Push-Location $ProjectPath
try {
    Step 'Installing project dependencies'
    npm install
    if ($LASTEXITCODE -ne 0) { throw 'npm install failed.' }

    Step 'Running TypeScript validation'
    npm run typecheck
    if ($LASTEXITCODE -ne 0) { throw 'TypeScript validation failed. Use the rollback script.' }

    Step 'Running production build'
    npm run build
    if ($LASTEXITCODE -ne 0) { throw 'Production build failed. Use the rollback script.' }

    if (Test-Path (Join-Path $ProjectPath '.git')) {
        Step 'Creating Git commit'
        git add src/lib/supabase-cloud.ts src/lib/access-control.ts src/components/management-app.tsx package.json package-lock.json 2>$null
        git commit -m "Upgrade V26 full automatic multi-device sync" 2>$null
        if ($LASTEXITCODE -eq 0) {
            $origin = git remote get-url origin 2>$null
            if ($LASTEXITCODE -eq 0 -and $origin) {
                Step 'Pushing to GitHub for Vercel deployment'
                git push
                if ($LASTEXITCODE -ne 0) {
                    Write-Host 'Build passed but Git push failed. Run git push manually.' -ForegroundColor Yellow
                }
            }
        } else {
            Write-Host 'No new Git commit was created.' -ForegroundColor Yellow
        }
    }
} finally {
    Pop-Location
}

Write-Host "`nV26 upgrade completed successfully." -ForegroundColor Green
Write-Host 'Wait for Vercel deployment, then upload once from the main laptop and restore once on other devices.' -ForegroundColor Green
