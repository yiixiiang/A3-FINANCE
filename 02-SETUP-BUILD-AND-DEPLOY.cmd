@echo off
setlocal EnableExtensions EnableDelayedExpansion
cd /d "%~dp0"

echo ============================================================
echo A3 FINANCE V24 - COMPLETE SETUP, BUILD AND DEPLOY
echo ============================================================
echo.

if not exist "package.json" (
  echo ERROR: package.json not found.
  echo Extract this package directly into your FINANCE folder.
  pause
  exit /b 1
)

where node >nul 2>&1
if errorlevel 1 (
  echo ERROR: Node.js is not installed.
  pause
  exit /b 1
)

where npm >nul 2>&1
if errorlevel 1 (
  echo ERROR: npm is not installed.
  pause
  exit /b 1
)

for /f "tokens=*" %%V in ('node -v') do set NODE_VERSION=%%V
echo Node: !NODE_VERSION!
echo Recommended production version: Node 24.x
echo.

if not exist ".env.local" (
  echo Creating .env.local...
  > ".env.local" echo NEXT_PUBLIC_SUPABASE_URL=https://cdzfsbsknhsxsbymjftd.supabase.co
  >> ".env.local" echo NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_VHnYmhEg5nWzw7ExPOWAJA_OAwplyPX
)

findstr /b /c:"NEXT_PUBLIC_SUPABASE_URL=" ".env.local" >nul || >> ".env.local" echo NEXT_PUBLIC_SUPABASE_URL=https://cdzfsbsknhsxsbymjftd.supabase.co
findstr /b /c:"NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=" ".env.local" >nul || >> ".env.local" echo NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_VHnYmhEg5nWzw7ExPOWAJA_OAwplyPX

echo Installing dependencies...
call npm install
if errorlevel 1 goto :failed

echo.
echo Running TypeScript validation...
call npm run typecheck
if errorlevel 1 goto :failed

echo.
echo Building production application...
if exist ".next" rmdir /s /q ".next"
call npm run build
if errorlevel 1 goto :failed

echo.
echo Linking/deploying Vercel production...
call npx vercel@latest deploy --prod --yes
if errorlevel 1 goto :failed

echo.
echo ============================================================
echo WEBSITE DEPLOYED SUCCESSFULLY
echo ============================================================
echo.
echo Next run: 03-PUSH-GITHUB-SAFELY.cmd
pause
exit /b 0

:failed
echo.
echo SETUP OR DEPLOYMENT STOPPED.
echo Read the first error shown above.
pause
exit /b 1
