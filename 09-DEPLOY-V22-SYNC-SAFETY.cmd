@echo off
setlocal EnableExtensions
cd /d "%~dp0"

echo ============================================================
echo A3 FINANCE V22 - SAFE SYNC AND BACKUP DEPLOYMENT
echo ============================================================

if not exist package.json (
  echo ERROR: package.json not found. Extract V22 directly into the FINANCE folder.
  pause
  exit /b 1
)

if not exist .env.local (
  echo ERROR: .env.local is missing.
  echo Run 03-SET-VERCEL-ENV-AND-DEPLOY.cmd first.
  pause
  exit /b 1
)

echo.
echo Installing dependencies...
call npm install
if errorlevel 1 goto :failed

echo.
echo Running TypeScript validation...
call npm run typecheck
if errorlevel 1 goto :failed

echo.
echo Building production application...
call npm run build
if errorlevel 1 goto :failed

echo.
echo Saving V22 to Git...
call git add -A
if errorlevel 1 goto :failed

call git diff --cached --quiet
if errorlevel 1 (
  call git commit -m "Add V22 multi-device sync safety and cloud backups"
  if errorlevel 1 goto :failed
) else (
  echo No new Git changes to commit.
)

echo.
echo Updating from GitHub before push...
call git pull --rebase origin main
if errorlevel 1 goto :failed

call git push origin main
if errorlevel 1 goto :failed

echo.
echo Deploying V22 to Vercel production...
call npx vercel@latest deploy --prod --yes
if errorlevel 1 goto :failed

echo.
echo ============================================================
echo V22 DEPLOYED SUCCESSFULLY
ECHO ============================================================
echo Sign out and sign in once.
echo Open Fleet ^& Settings ^> Cloud ^& Backup.
echo Click Verify connection, Create backup now, then Sync now.
echo.
pause
exit /b 0

:failed
echo.
echo DEPLOYMENT STOPPED. Read the first error shown above.
pause
exit /b 1
