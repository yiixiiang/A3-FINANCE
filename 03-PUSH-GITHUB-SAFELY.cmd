@echo off
setlocal EnableExtensions EnableDelayedExpansion
cd /d "%~dp0"

echo ============================================================
echo A3 FINANCE V24 - SAFE GITHUB UPDATE
echo ============================================================
echo.

if not exist ".git" (
  echo Initialising Git...
  git init
  if errorlevel 1 goto :failed
)

git remote get-url origin >nul 2>&1
if errorlevel 1 (
  git remote add origin https://github.com/yiixiiang/A3-FINANCE.git
) else (
  git remote set-url origin https://github.com/yiixiiang/A3-FINANCE.git
)
if errorlevel 1 goto :failed

git branch -M main

git add -A
if errorlevel 1 goto :failed

git diff --cached --quiet
if errorlevel 1 (
  git commit -m "Deploy FINANCE1 V24 complete upgrade"
  if errorlevel 1 (
    echo.
    echo Git may need your identity. Run:
    echo git config user.name "yiixiiang"
    echo git config user.email "yiixiiang@gmail.com"
    goto :failed
  )
) else (
  echo No new local changes to commit.
)

echo.
echo Fetching existing GitHub history...
git fetch origin main
if errorlevel 1 goto :failed

for /f "tokens=*" %%S in ('git rev-parse origin/main') do set REMOTE_SHA=%%S
if not "!REMOTE_SHA!"=="" (
  git branch -f backup-before-v24 !REMOTE_SHA! >nul 2>&1
  git push origin backup-before-v24
  if errorlevel 1 goto :failed
)

echo.
echo Rebasing local V24 over GitHub main...
git rebase origin/main
if errorlevel 1 (
  echo.
  echo REBASE CONFLICT.
  echo Resolve the files shown by Git, then run:
  echo   git add -A
  echo   git rebase --continue
  echo Then run this script again.
  goto :failed
)

git push -u origin main
if errorlevel 1 goto :failed

echo.
echo ============================================================
echo GITHUB UPDATED SUCCESSFULLY
echo ============================================================
echo Backup branch: backup-before-v24
pause
exit /b 0

:failed
echo.
echo GITHUB UPDATE STOPPED. Nothing was force-pushed.
pause
exit /b 1
