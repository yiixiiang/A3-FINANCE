@echo off
setlocal
cd /d "%~dp0"
PowerShell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\verify-supabase.ps1"
if errorlevel 1 (
  echo.
  echo Verification failed. Read the first red error above.
  pause
  exit /b 1
)
echo.
echo Verification completed successfully.
pause
