@echo off
REM Stop the backend (port 8000) and the frontend (port 5173)
setlocal

call :kill_port 8000 backend
call :kill_port 5173 frontend

pause
exit /b 0

:kill_port
set "_found="
for /f "tokens=5" %%p in ('netstat -ano -p tcp ^| findstr /c:"LISTENING" ^| findstr /c:":%~1 "') do (
    echo [%~2] killing PID %%p on port %~1
    taskkill /pid %%p /t /f >nul 2>&1
    set "_found=1"
)
if not defined _found echo [%~2] nothing listening on port %~1
exit /b 0
