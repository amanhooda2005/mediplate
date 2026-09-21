@echo off
REM One-command start for Windows: serves MediPlate at http://localhost:8000
cd /d "%~dp0\.."
if not exist .venv ( python -m venv .venv )
call .venv\Scripts\activate.bat
pip install -q -r backend\requirements.txt
if not exist backend\app\data\manifest.json ( python pipeline\run_all.py )
if not exist frontend\dist\index.html ( pushd frontend & call npm ci & call npm run build & popd )
cd backend
echo MediPlate is running at http://localhost:8000  (Ctrl+C to stop)
uvicorn app.main:app --host 127.0.0.1 --port 8000
