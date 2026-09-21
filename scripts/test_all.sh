#!/usr/bin/env bash
# Runs every check: data pipeline, backend tests, website type-check + build,
# then the browser journey against a fresh server.
set -euo pipefail
cd "$(dirname "$0")/.."
python3 pipeline/run_all.py
(cd backend && python3 -m pytest tests -q)
(cd frontend && npm run build)
DB="$(mktemp -d)/e2e.db"
(cd backend && MEDIPLATE_DATABASE_URL="sqlite:///$DB" uvicorn app.main:app --port 8000 &> /tmp/mediplate-e2e.log & echo $! > /tmp/mediplate-e2e.pid)
trap 'kill $(cat /tmp/mediplate-e2e.pid)' EXIT
sleep 5
(cd e2e && npm ci --silent && npx playwright test)
