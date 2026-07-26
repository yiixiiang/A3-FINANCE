@echo off
setlocal EnableExtensions EnableDelayedExpansion
cd /d "%~dp0"

echo ============================================================
echo A3 FINANCE - VERCEL ENVIRONMENT + PRODUCTION DEPLOYMENT
echo ============================================================
echo Project folder: %CD%
echo.

if not exist "package.json" (
  echo ERROR: package.json was not found.
  echo Extract the project files directly into your FINANCE folder.
  pause
  exit /b 1
)

> ".env.local" (
  echo NEXT_PUBLIC_SUPABASE_URL=https://cdzfsbsknhsxsbymjftd.supabase.co
  echo NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_VHnYmhEg5nWzw7ExPOWAJA_OAwplyPX
)

echo Local Supabase environment file is ready.
echo.

call npx vercel@latest whoami >nul 2>&1
if errorlevel 1 (
  echo Vercel login is required.
  call npx vercel@latest login
  if errorlevel 1 (
    echo ERROR: Vercel login failed.
    pause
    exit /b 1
  )
)

if not exist ".vercel\project.json" (
  echo.
  echo Link this folder to your EXISTING Vercel project named finance.
  call npx vercel@latest link
  if errorlevel 1 (
    echo ERROR: Vercel project linking failed.
    pause
    exit /b 1
  )
)

set "A3_TEMP=%TEMP%\a3-finance-vercel-env"
if not exist "%A3_TEMP%" mkdir "%A3_TEMP%"
> "%A3_TEMP%\url.txt" echo https://cdzfsbsknhsxsbymjftd.supabase.co
> "%A3_TEMP%\key.txt" echo sb_publishable_VHnYmhEg5nWzw7ExPOWAJA_OAwplyPX

for %%E in (production preview development) do (
  echo.
  echo Setting Supabase variables for %%E...
  call npx vercel@latest env rm NEXT_PUBLIC_SUPABASE_URL %%E --yes >nul 2>&1
  call npx vercel@latest env add NEXT_PUBLIC_SUPABASE_URL %%E < "%A3_TEMP%\url.txt"
  if errorlevel 1 (
    echo ERROR: Unable to add NEXT_PUBLIC_SUPABASE_URL for %%E.
    pause
    exit /b 1
  )

  call npx vercel@latest env rm NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY %%E --yes >nul 2>&1
  call npx vercel@latest env add NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY %%E < "%A3_TEMP%\key.txt"
  if errorlevel 1 (
    echo ERROR: Unable to add NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY for %%E.
    pause
    exit /b 1
  )
)

del /q "%A3_TEMP%\url.txt" "%A3_TEMP%\key.txt" >nul 2>&1
rmdir "%A3_TEMP%" >nul 2>&1

echo.
echo Installing project packages...
call npm install
if errorlevel 1 (
  echo ERROR: npm install failed.
  pause
  exit /b 1
)

echo.
echo Running TypeScript validation...
call npm run typecheck
if errorlevel 1 (
  echo ERROR: TypeScript validation failed.
  pause
  exit /b 1
)

echo.
echo Building the production application...
call npm run build
if errorlevel 1 (
  echo ERROR: Production build failed.
  pause
  exit /b 1
)

echo.
echo Deploying to Vercel production...
call npx vercel@latest deploy --prod --yes
if errorlevel 1 (
  echo ERROR: Vercel production deployment failed.
  pause
  exit /b 1
)

echo.
echo ============================================================
echo PRODUCTION DEPLOYMENT COMPLETED
echo ============================================================
echo Sign in to A3 Finance once to upload the existing browser records.
echo Then sign in from another computer to verify cloud loading.
echo.
pause
exit /b 0
