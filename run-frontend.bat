@echo off
REM Start the Vite dev server on http://localhost:5173
cd /d "%~dp0frontend"

if not exist "node_modules" (
    echo [1/2] npm install
    call npm install || goto :fail
)

echo [2/2] npm run dev
call npm run dev -- --host

pause
exit /b 0

:fail
echo [ERROR] npm install failed.
pause
exit /b 1
