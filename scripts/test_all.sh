#!/usr/bin/env bash
# Runs every check: data pipeline, backend tests, website type-check + build,
# then the browser journey against a fresh server.
set -euo pipefail
cd "$(dirname "$0")/.."
[ -d .venv ] || python3 -m venv .venv
# shellcheck disable=SC1091
. .venv/bin/activate
python -c "import fastapi, sklearn, ortools" 2>/dev/null || pip install -q -r backend/requirements.txt
python -c "import pytest, httpx" 2>/dev/null || pip install -q -r requirements-dev.txt
python pipeline/run_all.py
(cd backend && python -m pytest tests -q)
(cd frontend && npm run build)
DB="$(mktemp -d)/e2e.db"
(cd backend && MEDIPLATE_DATABASE_URL="sqlite:///$DB" uvicorn app.main:app --port 8000 &> /tmp/mediplate-e2e.log & echo $! > /tmp/mediplate-e2e.pid)
trap 'kill $(cat /tmp/mediplate-e2e.pid)' EXIT
sleep 5
(cd e2e && npm ci --silent && npx playwright test)
