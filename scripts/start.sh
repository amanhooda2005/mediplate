#!/usr/bin/env bash
# One-command start for Linux / macOS: installs what is needed, builds the
# website once, and serves everything at http://localhost:8000
set -euo pipefail
cd "$(dirname "$0")/.."
python3 -m venv .venv
. .venv/bin/activate
pip install -q -r backend/requirements.txt
[ -f backend/app/data/manifest.json ] || python pipeline/run_all.py
if [ ! -f frontend/dist/index.html ]; then (cd frontend && npm ci && npm run build); fi
cd backend
echo "MediPlate is running at http://localhost:8000  (Ctrl+C to stop)"
exec uvicorn app.main:app --host 127.0.0.1 --port 8000
