@echo off
setlocal EnableExtensions
cd /d "%~dp0"

echo ============================================================
echo A3 FINANCE V22 - SUPABASE BACKUP TABLE UPGRADE
echo ============================================================

if not exist "supabase\v22-upgrade.sql" (
  echo ERROR: supabase\v22-upgrade.sql was not found.
  echo Extract the V22 files directly into the FINANCE folder.
  pause
  exit /b 1
)

powershell -NoProfile -ExecutionPolicy Bypass -Command "Get-Content -Raw 'supabase\v22-upgrade.sql' | Set-Clipboard"
if errorlevel 1 (
  echo ERROR: Unable to copy the SQL file.
  pause
  exit /b 1
)

echo.
echo The V22 SQL upgrade has been copied to your clipboard.
echo The Supabase SQL Editor will open now.
echo Paste the SQL, click RUN, and confirm a3_app_backups shows RLS enabled.
echo.
start "" "https://supabase.com/dashboard/project/cdzfsbsknhsxsbymjftd/sql/new"
pause
exit /b 0
