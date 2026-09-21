"""Shared paths and constants for the MediPlate data pipeline."""
from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PIPELINE = ROOT / "pipeline"
SOURCES = PIPELINE / "sources"
RAW = PIPELINE / "raw"
REPORTS = PIPELINE / "reports"
BACKEND_DATA = ROOT / "backend" / "app" / "data"
BACKEND_MODELS = ROOT / "backend" / "app" / "models"

# Nutrients tracked everywhere (per 100 g for foods, per serving for dishes)
NUTRIENTS = [
    "energy_kcal", "protein_g", "fat_g", "carb_g", "fiber_g", "satfat_g",
    "sugar_g", "sodium_mg", "potassium_mg", "phosphorus_mg", "calcium_mg",
    "iron_mg", "vitk_ug", "chol_mg", "omega3_g",
]

SLOTS = ["breakfast", "staple", "protein", "veg", "side", "snack", "sweet"]
DIETS = ["veg", "egg", "nonveg"]
SODIUM_PER_G_SALT = 387.58  # mg sodium in 1 g sodium chloride

IFCT_VERSION = "2.1.2"
IFCT_TARBALL = f"https://registry.npmjs.org/ifct2017/-/ifct2017-{IFCT_VERSION}.tgz"
SAHEART_URL = "https://media.githubusercontent.com/media/EpistasisLab/pmlb/master/datasets/saheart/saheart.tsv.gz"


def write_json(path: Path, data) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w", encoding="utf-8") as fh:
        json.dump(data, fh, ensure_ascii=False, indent=1, sort_keys=False)


def read_json(path: Path):
    with open(path, encoding="utf-8") as fh:
        return json.load(fh)


def log(step: str, msg: str) -> None:
    print(f"[{step}] {msg}", flush=True)
