@echo off
REM Start the FastAPI backend on http://localhost:8000
cd /d "%~dp0backend"

if not exist ".venv\Scripts\python.exe" (
    echo [ERROR] .venv not found.
    echo         python -m venv .venv
    echo         .venv\Scripts\pip install -r requirements.txt
    pause
    exit /b 1
)

if not exist ".env" (
    echo [ERROR] .env not found. Copy .env.example to .env and edit it.
    pause
    exit /b 1
)

echo [1/2] alembic upgrade head
.venv\Scripts\python.exe -m alembic upgrade head || goto :fail

echo [2/2] uvicorn app.main:app
.venv\Scripts\python.exe -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload

pause
exit /b 0

:fail
echo [ERROR] Migration failed. Is PostgreSQL running on port 5432?
pause
exit /b 1
