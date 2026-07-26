@echo off
setlocal EnableExtensions
cd /d "%~dp0"

echo ============================================================
echo A3 FINANCE V24 - COMPLETE VERIFICATION
echo ============================================================
echo.
echo Check these items:
echo.
echo [1] Supabase Authentication
echo     Confirm your user is created and email-confirmed.
echo.
echo [2] Supabase SQL tables
echo     a3_app_storage
echo     a3_app_backups
echo     a3_app_audit
echo     Row Level Security enabled on all three.
echo.
echo [3] Website
echo     Sign in and open Fleet ^& Settings ^> Cloud ^& Backup.
echo     Click Verify connection.
echo     Edit one record and click Sync now.
echo     Confirm an audit activity appears.
echo.
echo [4] API health
echo     Open /api/health on the production website.
echo.
start "" "https://supabase.com/dashboard/project/cdzfsbsknhsxsbymjftd/auth/users"
start "" "https://supabase.com/dashboard/project/cdzfsbsknhsxsbymjftd/editor"
start "" "https://vercel.com/dashboard"
pause
exit /b 0
