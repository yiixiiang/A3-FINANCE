@echo off
setlocal EnableExtensions EnableDelayedExpansion

title A3 Finance V27 Complete Fix

echo.
echo ==================================================
echo  A3 FINANCE V27 COMPLETE FIX
echo ==================================================
echo.

set "PROJECT=C:\Users\Admin\Downloads\A3\projects\FINANCE"
set "TARGET=%PROJECT%\src\app\api\admin\cloud-user\route.ts"

cd /d "%PROJECT%"

if errorlevel 1 (
    echo ERROR: Cannot open project folder:
    echo %PROJECT%
    pause
    exit /b 1
)

echo Project folder:
echo %CD%
echo.

if not exist "package.json" (
    echo ERROR: package.json was not found.
    pause
    exit /b 1
)

if not exist "%TARGET%" (
    echo ERROR: File was not found:
    echo %TARGET%
    pause
    exit /b 1
)

echo [1/7] Checking Node and npm...
node -v
if errorlevel 1 (
    echo ERROR: Node.js is not installed or not available in CMD.
    pause
    exit /b 1
)

npm -v
if errorlevel 1 (
    echo ERROR: npm is not available.
    pause
    exit /b 1
)

echo.
echo [2/7] Installing Supabase JavaScript package...
call npm install @supabase/supabase-js

if errorlevel 1 (
    echo ERROR: Supabase package installation failed.
    pause
    exit /b 1
)

echo.
echo [3/7] Fixing TypeScript user type automatically...

copy /y "%TARGET%" "%TARGET%.before-v27-fix.bak" >nul

node -e "const fs=require('fs');const p=process.argv[1];let s=fs.readFileSync(p,'utf8');const old='const existingUser = users.find(\n      (user) => user.email?.toLowerCase() === email,\n    );';const replacement='const existingUser = users.find(\n      (user: { id: string; email?: string | null }) =>\n        user.email?.toLowerCase() === email,\n    );';if(s.includes(replacement)){console.log('TypeScript fix already exists.');process.exit(0);}if(s.includes(old)){s=s.replace(old,replacement);fs.writeFileSync(p,s,'utf8');console.log('TypeScript fix applied.');process.exit(0);}const regex=/const existingUser\s*=\s*users\.find\(\s*\(user\)\s*=>\s*user\.email\?\.toLowerCase\(\)\s*===\s*email,\s*\);/m;if(regex.test(s)){s=s.replace(regex,replacement);fs.writeFileSync(p,s,'utf8');console.log('TypeScript fix applied using fallback matching.');process.exit(0);}console.error('ERROR: Could not find the existingUser code block.');process.exit(1);" "%TARGET%"

if errorlevel 1 (
    echo.
    echo ERROR: Automatic TypeScript replacement failed.
    echo Backup remains at:
    echo %TARGET%.before-v27-fix.bak
    pause
    exit /b 1
)

echo.
echo [4/7] Running TypeScript check...
call npm run typecheck

if errorlevel 1 (
    echo.
    echo ERROR: TypeScript check failed.
    echo Nothing will be committed or pushed.
    pause
    exit /b 1
)

echo.
echo [5/7] Running production build...
call npm run build

if errorlevel 1 (
    echo.
    echo ERROR: Production build failed.
    echo Nothing will be committed or pushed.
    pause
    exit /b 1
)

echo.
echo [6/7] Checking Git changes...

if not exist ".git" (
    echo WARNING: This folder is not connected to Git.
    echo TypeScript and build checks passed, but Git push was skipped.
    pause
    exit /b 0
)

git status --short

git add .

if errorlevel 1 (
    echo ERROR: git add failed.
    pause
    exit /b 1
)

git diff --cached --quiet

if not errorlevel 1 (
    echo.
    echo No new Git changes were found.
    echo The project already contains the V27 fix.
    goto COMPLETE
)

echo.
echo [7/7] Committing and pushing to GitHub...

git commit -m "Complete V27 Supabase automatic user sync fix"

if errorlevel 1 (
    echo ERROR: Git commit failed.
    pause
    exit /b 1
)

git push

if errorlevel 1 (
    echo.
    echo ERROR: Git push failed.
    echo The commit is saved locally and can be pushed later.
    pause
    exit /b 1
)

:COMPLETE
echo.
echo ==================================================
echo  A3 FINANCE V27 FIX COMPLETED SUCCESSFULLY
echo ==================================================
echo.
echo TypeScript check: PASSED
echo Production build: PASSED
echo GitHub push: COMPLETED OR NO CHANGES REQUIRED
echo.
echo Vercel should start deploying automatically after GitHub push.
echo.
pause
exit /b 0