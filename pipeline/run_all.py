"""Run the whole MediPlate data pipeline in order.

    python pipeline/run_all.py            # use cached raw data when present
    python pipeline/run_all.py --force    # re-download raw data

Outputs go to backend/app/data/ and backend/app/models/, which the backend
loads at start-up. Each step validates its inputs and stops with a clear error
instead of writing half-built files.
"""
from __future__ import annotations

import sys
import time
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
sys.path.insert(0, str(HERE / "steps"))

import s01_fetch  # noqa: E402
import s02_build_foods  # noqa: E402
import s03_build_rules  # noqa: E402
import s04_build_recipes  # noqa: E402
import s05_train_models  # noqa: E402
from common import BACKEND_DATA, read_json, write_json  # noqa: E402


def main() -> None:
    start = time.time()
    s01_fetch.main(force="--force" in sys.argv)
    foods = s02_build_foods.main()
    rules = s03_build_rules.main()
    dishes = s04_build_recipes.main()
    models = s05_train_models.main()
    manifest = {
        "built_at": time.strftime("%Y-%m-%d %H:%M:%S"),
        "foods": len(foods),
        "dishes": len(dishes),
        "medicines": len(rules["medicines"]),
        "food_tags": len(rules["food_tags"]),
        "messages": len(read_json(BACKEND_DATA / "messages.json")),
        "models": {k: v.get("status", "trained") if isinstance(v, dict) else "trained" for k, v in models.items()},
        "m1_auc": models["M1"]["scores"][models["M1"]["chosen"]]["auc_mean"],
    }
    write_json(BACKEND_DATA / "manifest.json", manifest)
    print(f"[done] pipeline finished in {time.time() - start:.1f}s: {manifest}")


if __name__ == "__main__":
    main()
