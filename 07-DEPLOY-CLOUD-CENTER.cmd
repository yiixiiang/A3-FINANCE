@echo off
setlocal EnableExtensions
cd /d "%~dp0"

echo ============================================================
echo A3 FINANCE V21 - CLOUD CENTER DEPLOYMENT
echo ============================================================

if not exist package.json (
  echo ERROR: package.json not found. Extract V21 directly into the FINANCE folder.
  pause
  exit /b 1
)

if not exist .env.local (
  echo ERROR: .env.local is missing. Run 03-SET-VERCEL-ENV-AND-DEPLOY.cmd first.
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
if errorlevel 1 goto :failed

call git diff --cached --quiet
if errorlevel 1 (
  call git commit -m "Add Supabase cloud migration and backup center"
  if errorlevel 1 goto :failed
) else (
  echo No new Git changes to commit.
)

call git pull --rebase origin main
if errorlevel 1 goto :failed

call git push origin main
if errorlevel 1 goto :failed

call npx vercel@latest deploy --prod --yes
if errorlevel 1 goto :failed

echo.
echo V21 CLOUD CENTER DEPLOYED SUCCESSFULLY.
echo Open Fleet ^& Settings ^> Cloud ^& Backup after signing in.
pause
exit /b 0

:failed
echo.
echo DEPLOYMENT STOPPED. Read the first error shown above.
pause
exit /b 1
