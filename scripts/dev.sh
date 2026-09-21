#!/usr/bin/env bash
# Development: API with auto-reload on :8000 and the website with hot reload on :5173
set -euo pipefail
cd "$(dirname "$0")/.."
(cd backend && uvicorn app.main:app --reload --port 8000) &
API=$!
trap 'kill $API' EXIT
cd frontend && npm run dev
