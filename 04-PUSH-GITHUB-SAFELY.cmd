@echo off
setlocal EnableExtensions EnableDelayedExpansion
cd /d "%~dp0"

echo ============================================================
echo A3 FINANCE - GITHUB PUSH
echo ============================================================
echo.

if not exist ".git" (
  echo Initialising Git in this project folder...
  git init
)

git remote get-url origin >nul 2>&1
if errorlevel 1 (
  git remote add origin https://github.com/yiixiiang/A3-FINANCE.git
) else (
  git remote set-url origin https://github.com/yiixiiang/A3-FINANCE.git
)

git add -A
git diff --cached --quiet
if errorlevel 1 (
  git commit -m "Connect A3 Finance to Supabase SQL"
  if errorlevel 1 (
    echo ERROR: Git commit failed.
    echo Configure your name/email if Git requests them.
    pause
    exit /b 1
  )
) else (
  echo No new local changes to commit.
)

git branch -M main
git fetch origin
if errorlevel 1 (
  echo ERROR: Unable to fetch the GitHub repository.
  pause
  exit /b 1
)

git push -u origin main
if errorlevel 1 (
  echo.
  echo GitHub rejected the normal push because the histories differ.
  echo The website can still be deployed with 03-SET-VERCEL-ENV-AND-DEPLOY.cmd.
  echo Do not force-push until the remote branch is backed up.
  pause
  exit /b 1
)

echo GitHub push completed.
pause
exit /b 0
