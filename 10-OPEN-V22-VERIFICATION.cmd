@echo off
setlocal EnableExtensions
cd /d "%~dp0"

echo ============================================================
echo A3 FINANCE V22 - FINAL CLOUD VERIFICATION
ECHO ============================================================
echo.
echo 1. Open the production website and sign in.
echo 2. Go to Fleet ^& Settings ^> Cloud ^& Backup.
echo 3. Confirm Cloud Connected, pending saves 0, and backup table ready.
echo 4. Create one manual backup.
echo 5. Add a small test record, click Sync now, refresh, and verify it remains.
echo.
start "" "https://vercel.com/dashboard"
start "" "https://supabase.com/dashboard/project/cdzfsbsknhsxsbymjftd/editor"
pause
exit /b 0
