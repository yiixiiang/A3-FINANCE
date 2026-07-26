@echo off
setlocal EnableExtensions
cd /d "%~dp0"

echo ============================================================
echo A3 FINANCE V20 - SIGN-IN HOTFIX DEPLOYMENT
echo ============================================================

if not exist package.json (
  echo ERROR: package.json not found. Extract V20 directly into the FINANCE folder.
  pause
  exit /b 1
)

call npm install
if errorlevel 1 goto :failed

call npm run typecheck
if errorlevel 1 goto :failed

call npm run build
if errorlevel 1 goto :failed

call git add -A
call git commit -m "Fix A3 Finance sign-in when Supabase is unavailable"

call git pull --rebase origin main
if errorlevel 1 goto :failed

call git push origin main
if errorlevel 1 goto :failed

call npx vercel@latest deploy --prod --yes
if errorlevel 1 goto :failed

echo.
echo V20 SIGN-IN HOTFIX DEPLOYED SUCCESSFULLY.
echo Login: admin / admin123
pause
exit /b 0

:failed
echo.
echo DEPLOYMENT STOPPED. Read the first error shown above.
pause
exit /b 1
