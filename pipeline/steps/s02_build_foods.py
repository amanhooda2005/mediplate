"""Step 2 - Build the food table (D2, ingredient level).

IFCT 2017 stores nutrients in grams per 100 g and energy in kJ. This step
converts everything to the units MediPlate uses (kcal, g, mg, µg per 100 g),
merges the small supplement table, and attaches a glycemic index to each food.
"""
from __future__ import annotations

import csv
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from common import BACKEND_DATA, NUTRIENTS, RAW, REPORTS, SOURCES, log, write_json  # noqa: E402

KJ_PER_KCAL = 4.184


def _f(value: str | None) -> float:
    if value is None:
        return 0.0
    value = value.strip()
    if not value:
        return 0.0
    try:
        return float(value)
    except ValueError:
        return 0.0


def load_gi() -> tuple[dict[str, float], dict[str, float], float]:
    specific: dict[str, float] = {}
    groups: dict[str, float] = {}
    default = 50.0
    with open(SOURCES / "glycemic_index.csv", encoding="utf-8") as fh:
        lines = [ln for ln in fh if ln.strip() and not ln.lstrip().startswith("#")]
    for row in csv.DictReader(lines):
        key, gi = row["key"].strip(), float(row["gi"])
        if key == "default":
            default = gi
        elif key.startswith("group:"):
            groups[key[len("group:"):]] = gi
        else:
            specific[key] = gi
    return specific, groups, default


def ifct_diet(tags: str, group: str) -> str:
    t = tags.split()
    if "vegetarian" in t:
        return "veg"
    if group.startswith("Egg"):
        return "egg"
    return "nonveg"


def build_ifct_food(row: dict) -> dict:
    protein = _f(row.get("protcnt"))
    fat = _f(row.get("fatce"))
    carb = _f(row.get("choavldf"))
    fiber = _f(row.get("fibtg"))
    energy = _f(row.get("enerc")) / KJ_PER_KCAL
    if energy <= 0:
        energy = 4 * protein + 9 * fat + 4 * carb + 2 * fiber
    group = row["grup"].strip()
    # "Added sugar" = free sugars only from sugar foods (jaggery, cane juice).
    # Sugars naturally inside fruit, milk and vegetables are not counted.
    added_sugar = _f(row.get("fsugar")) if group == "Sugars" else 0.0
    per100 = {
        "energy_kcal": energy,
        "protein_g": protein,
        "fat_g": fat,
        "carb_g": carb,
        "fiber_g": fiber,
        "satfat_g": _f(row.get("fasat")),
        "sugar_g": added_sugar,
        "sodium_mg": _f(row.get("na")) * 1000,
        "potassium_mg": _f(row.get("k")) * 1000,
        "phosphorus_mg": _f(row.get("p")) * 1000,
        "calcium_mg": _f(row.get("ca")) * 1000,
        "iron_mg": _f(row.get("fe")) * 1000,
        "vitk_ug": (_f(row.get("vitk1")) + _f(row.get("vitk2"))) * 1_000_000,
        "chol_mg": _f(row.get("cholc")) * 1000,
        "omega3_g": _f(row.get("facn3")),
    }
    return {
        "code": row["code"].strip(),
        "name": row["name"].strip(),
        "local_names": (row.get("lang") or "").strip(),
        "group": group,
        "diet": ifct_diet(row.get("tags", ""), group),
        "per100": {k: round(v, 4) for k, v in per100.items()},
        "source": "IFCT 2017 (NIN-ICMR)",
    }


def build_supplement(row: dict) -> dict:
    per100 = {k: round(_f(row.get(k)), 4) for k in NUTRIENTS}
    return {
        "code": row["code"].strip(),
        "name": row["name"].strip(),
        "local_names": "",
        "group": row["group"].strip(),
        "diet": row["diet"].strip(),
        "per100": per100,
        "source": row["source"].strip(),
    }


def main() -> list[dict]:
    specific, groups, default_gi = load_gi()
    foods: list[dict] = []
    with open(RAW / "ifct2017_compositions.csv", encoding="utf-8") as fh:
        for row in csv.DictReader(fh):
            if row.get("code", "").strip():
                foods.append(build_ifct_food(row))
    n_ifct = len(foods)
    with open(SOURCES / "supplements.csv", encoding="utf-8") as fh:
        for row in csv.DictReader(fh):
            foods.append(build_supplement(row))

    codes = [f["code"] for f in foods]
    dupes = {c for c in codes if codes.count(c) > 1}
    if dupes:
        raise ValueError(f"duplicate food codes: {sorted(dupes)}")

    # Data-quality check: energy must agree with protein/fat/carbohydrate/fibre
    # (Atwater factors). A large mismatch means a data-entry error, so the
    # calculated value is used and the fix is written to the quality report.
    fixes = []
    for food in foods:
        p = food["per100"]
        atwater = 4 * p["protein_g"] + 9 * p["fat_g"] + 4 * p["carb_g"] + 2 * p["fiber_g"]
        if abs(p["energy_kcal"] - atwater) > max(40.0, 0.25 * atwater):
            fixes.append(f"{food['code']} {food['name']}: listed {p['energy_kcal']:.0f} kcal, "
                         f"macronutrients give {atwater:.0f} kcal -> using {atwater:.0f}")
            p["energy_kcal"] = round(atwater, 4)
    REPORTS.mkdir(parents=True, exist_ok=True)
    (REPORTS / "data_quality.md").write_text(
        "# Data-quality corrections\n\n" + ("\n".join(f"- {f}" for f in fixes) if fixes else "None.") + "\n",
        encoding="utf-8")
    for fx in fixes:
        log("foods", f"corrected {fx}")

    for food in foods:
        if food["per100"]["carb_g"] <= 0.5:
            food["gi"] = 0.0
        else:
            food["gi"] = float(specific.get(food["code"], groups.get(food["group"], default_gi)))
        for k in NUTRIENTS:
            v = food["per100"][k]
            if v < 0 or v != v:
                raise ValueError(f"bad value {k}={v} for {food['code']}")

    write_json(BACKEND_DATA / "foods.json", foods)
    REPORTS.mkdir(parents=True, exist_ok=True)
    log("foods", f"{n_ifct} IFCT foods + {len(foods) - n_ifct} supplements -> foods.json")
    return foods


if __name__ == "__main__":
    main()
