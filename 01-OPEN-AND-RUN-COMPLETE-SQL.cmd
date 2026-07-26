@echo off
setlocal EnableExtensions
cd /d "%~dp0"

echo ============================================================
echo A3 FINANCE V24 - COMPLETE SUPABASE SQL SETUP
echo ============================================================
echo.
if not exist "supabase\COMPLETE-SCHEMA.sql" (
  echo ERROR: supabase\COMPLETE-SCHEMA.sql is missing.
  pause
  exit /b 1
)

type "supabase\COMPLETE-SCHEMA.sql" | clip
if errorlevel 1 (
  echo ERROR: Could not copy the SQL to the clipboard.
  pause
  exit /b 1
)

echo The COMPLETE SQL schema has been copied to your clipboard.
echo.
echo In the Supabase SQL Editor:
echo   1. Click New query
echo   2. Press Ctrl+V
echo   3. Click Run
echo   4. Confirm these tables appear:
echo      - a3_app_storage
echo      - a3_app_backups
echo      - a3_app_audit
echo.
start "" "https://supabase.com/dashboard/project/cdzfsbsknhsxsbymjftd/sql/new"
pause
exit /b 0
