@echo off
setlocal EnableExtensions
cd /d "%~dp0"

echo ============================================================
echo A3 FINANCE - SUPABASE SQL SETUP
echo ============================================================
echo.

if not exist "supabase\schema.sql" (
  echo ERROR: supabase\schema.sql was not found.
  pause
  exit /b 1
)

powershell -NoProfile -ExecutionPolicy Bypass -Command "Get-Content -Raw 'supabase\schema.sql' | Set-Clipboard"
if errorlevel 1 (
  echo ERROR: Unable to copy the SQL file to the clipboard.
  pause
  exit /b 1
)

echo The complete SQL schema is now copied to your clipboard.
echo.
echo The Supabase SQL Editor will open now.
echo Paste with CTRL+V, then click RUN.
echo The final result should show:
echo   table_name: a3_app_storage
echo   rls_enabled: true
echo.
start "" "https://supabase.com/dashboard/project/cdzfsbsknhsxsbymjftd/sql/new"
pause
exit /b 0
