#!/usr/bin/env bash
# Rebuild everything after a data or code change: data, models, tests, then the
# report numbers, figures and documents.
#
#   ./scripts/rebuild_all.sh              # everything
#   ./scripts/rebuild_all.sh --fast       # skip the report (data, models, tests only)
#   ./scripts/rebuild_all.sh --no-pdf     # build the .docx files but skip the PDF step
#
# Takes about 8 minutes: the evaluation in report/experiments.py is most of it.
set -euo pipefail
cd "$(dirname "$0")/.."

FAST=0; NOPDF=0
for a in "$@"; do
  case "$a" in
    --fast) FAST=1 ;;
    --no-pdf) NOPDF=1 ;;
    *) echo "unknown option: $a"; exit 2 ;;
  esac
done

say() { printf '\n\033[1;32m==> %s\033[0m\n' "$1"; }

say "1/6  Data pipeline (foods, rules, recipes, models)"
python3 pipeline/run_all.py

say "2/6  Backend tests"
(cd backend && python3 -m pytest tests -q)

say "3/6  Website build (type-check + missing translations)"
(cd frontend && npm run build)

if [ "$FAST" = "1" ]; then
  say "Done (--fast): data, models and tests are up to date."
  exit 0
fi

say "4/6  Evaluation: every number and figure in the report"
python3 report/experiments.py
python3 report/metrics_m1.py

say "5/6  Documents"
if [ ! -d report/node_modules ]; then
  echo "installing the docx package for the report builder"
  (cd report && npm install --silent)
fi
(cd report && node build_report.js && node build_dossier.js)

if [ "$NOPDF" = "1" ]; then
  say "Done (--no-pdf). The .docx files are in report/."
  exit 0
fi

say "6/6  PDFs"
if python3 report/to_pdf.py; then
  :
else
  echo "PDF step failed. The .docx files in report/ are fine — export them from Word."
fi

say "Done. Updated: backend/app/data, backend/app/models, report/*.docx, report/*.pdf"
echo "Restart the backend, or press reload in the admin console, so it loads the new data."
