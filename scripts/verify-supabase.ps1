$ErrorActionPreference = "Stop"

function Get-DotEnvValue([string]$Name) {
  $envPath = Join-Path (Split-Path $PSScriptRoot -Parent) ".env.local"
  if (-not (Test-Path $envPath)) { throw ".env.local was not found. Run 03-SET-VERCEL-ENV-AND-DEPLOY.cmd first." }
  $line = Get-Content $envPath | Where-Object { $_ -match "^$([regex]::Escape($Name))=" } | Select-Object -First 1
  if (-not $line) { throw "$Name is missing from .env.local." }
  return ($line -split "=", 2)[1].Trim()
}

function ConvertTo-PlainText([Security.SecureString]$SecureValue) {
  $pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($SecureValue)
  try { return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer) }
  finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer) }
}

$projectRoot = Split-Path $PSScriptRoot -Parent
$url = (Get-DotEnvValue "NEXT_PUBLIC_SUPABASE_URL").TrimEnd("/")
$key = Get-DotEnvValue "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"

Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "A3 FINANCE - SUPABASE AND WEBSITE VERIFICATION" -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "Supabase: $url"

$email = Read-Host "Supabase user email"
$securePassword = Read-Host "Supabase user password" -AsSecureString
$password = ConvertTo-PlainText $securePassword

Write-Host "`n1. Signing in to Supabase Auth..." -ForegroundColor Yellow
$authBody = @{ email = $email; password = $password } | ConvertTo-Json -Compress
$session = Invoke-RestMethod -Method Post -Uri "$url/auth/v1/token?grant_type=password" -Headers @{ apikey = $key } -ContentType "application/json" -Body $authBody
if (-not $session.access_token -or -not $session.user.id) { throw "Supabase did not return a valid user session." }
Write-Host "   PASS - authenticated as $($session.user.email)" -ForegroundColor Green

$headers = @{
  apikey = $key
  Authorization = "Bearer $($session.access_token)"
}

Write-Host "2. Reading a3_app_storage through RLS..." -ForegroundColor Yellow
$null = Invoke-RestMethod -Method Get -Uri "$url/rest/v1/a3_app_storage?select=storage_key,updated_at&limit=1" -Headers $headers
Write-Host "   PASS - table exists and authenticated SELECT is allowed" -ForegroundColor Green

Write-Host "3. Testing INSERT and DELETE through RLS..." -ForegroundColor Yellow
$testKey = "a3-health-check-$([guid]::NewGuid().ToString('N'))"
$testRows = @(@{
  user_id = $session.user.id
  storage_key = $testKey
  value = @{ checked_at = [DateTime]::UtcNow.ToString("o"); source = "V19 verifier" }
}) | ConvertTo-Json -Depth 6 -Compress
$writeHeaders = $headers.Clone()
$writeHeaders["Prefer"] = "return=minimal"
Invoke-RestMethod -Method Post -Uri "$url/rest/v1/a3_app_storage" -Headers $writeHeaders -ContentType "application/json" -Body $testRows | Out-Null
Invoke-RestMethod -Method Delete -Uri "$url/rest/v1/a3_app_storage?storage_key=eq.$testKey" -Headers $writeHeaders | Out-Null
Write-Host "   PASS - temporary test record was saved and removed" -ForegroundColor Green

$productionUrl = Read-Host "`nProduction website URL (press Enter to skip)"
if ($productionUrl) {
  $productionUrl = $productionUrl.TrimEnd("/")
  Write-Host "4. Checking $productionUrl/api/health..." -ForegroundColor Yellow
  $health = Invoke-RestMethod -Method Get -Uri "$productionUrl/api/health"
  if (-not $health.ok) { throw "Website health endpoint did not return ok=true." }
  if (-not $health.supabase.configured) { throw "Website is online, but production Supabase variables are missing." }
  Write-Host "   PASS - website online and Supabase environment configured" -ForegroundColor Green
  Write-Host "   Supabase host: $($health.supabase.host)"
} else {
  Write-Host "4. Website check skipped." -ForegroundColor DarkYellow
}

Write-Host "`nALL CHECKS PASSED" -ForegroundColor Green
Write-Host "Sign in to the website, save one record, then sign in from another browser to confirm cloud synchronization."
