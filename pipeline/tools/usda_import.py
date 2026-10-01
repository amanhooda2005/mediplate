"""Convert a USDA FoodData Central bulk download into MediPlate food rows.

FoodData Central publishes its data as a folder of CSV files. This tool reads
that folder and writes `pipeline/sources/usda_extra.csv` in exactly the schema
of `supplements.csv`, which step 2 of the pipeline already knows how to merge.

    # 1. download and unzip a dataset from
    #    https://fdc.nal.usda.gov/download-datasets.html
    #    (SR Legacy or Foundation Foods; the "full download" is not needed)
    # 2. see what is in it, without writing anything
    python pipeline/tools/usda_import.py ~/Downloads/FoodData_Central_sr_legacy_csv --dry-run
    # 3. import a chosen set of foods
    python pipeline/tools/usda_import.py ~/Downloads/FoodData_Central_sr_legacy_csv \\
        --match "oat" --match "quinoa" --limit 40
    # 4. rebuild everything
    python pipeline/run_all.py

Design notes
------------
* Nutrients are resolved by **name and unit**, not by a hard-coded id, because
  FoodData Central has changed its numbering between releases. Every match is
  printed so it can be checked against the source file.
* Energy is taken from the kcal row. FoodData Central also carries a kJ row for
  the same food; using it would overstate energy by a factor of 4.184, which
  step 2's Atwater check would then "correct" into a different wrong number.
* `sugar_g` means **added** sugar in MediPlate, not total sugars. USDA reports
  total sugars, so this tool writes 0 for everything except foods in the sugar
  group, matching how step 2 treats IFCT data.
* Diet type defaults to `nonveg` when the category is unknown. That is the safe
  direction: a wrongly excluded food costs variety, a wrongly included one could
  put meat in a vegetarian patient's plan.
* Nothing is written to `supplements.csv`, which stays hand-checked.
"""
from __future__ import annotations

import argparse
import csv
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from common import SOURCES, log  # noqa: E402

OUT = SOURCES / "usda_extra.csv"
CODE_PREFIX = "USDA"

# MediPlate nutrient -> (USDA nutrient name, unit). Names are matched
# case-insensitively and must be exact; units guard against the kJ/kcal trap.
NUTRIENT_MAP: dict[str, tuple[str, str]] = {
    "energy_kcal": ("energy", "kcal"),
    "protein_g": ("protein", "g"),
    "fat_g": ("total lipid (fat)", "g"),
    "carb_g": ("carbohydrate, by difference", "g"),
    "fiber_g": ("fiber, total dietary", "g"),
    "satfat_g": ("fatty acids, total saturated", "g"),
    "sodium_mg": ("sodium, na", "mg"),
    "potassium_mg": ("potassium, k", "mg"),
    "phosphorus_mg": ("phosphorus, p", "mg"),
    "calcium_mg": ("calcium, ca", "mg"),
    "iron_mg": ("iron, fe", "mg"),
    "vitk_ug": ("vitamin k (phylloquinone)", "ug"),
    "chol_mg": ("cholesterol", "mg"),
}
# Omega-3 is the sum of the individual fatty acids, all in grams.
OMEGA3_NAMES = ["18:3 n-3 c,c,c (ala)", "20:5 n-3 (epa)", "22:5 n-3 (dpa)", "22:6 n-3 (dha)"]
SUGAR_NAMES = ["sugars, total including nlea", "sugars, total"]

# USDA food category -> (MediPlate group, diet). Anything unmatched becomes
# "Miscellaneous Foods" / nonveg, and is listed in the run summary.
CATEGORY_MAP: dict[str, tuple[str, str]] = {
    "dairy and egg products": ("Milk and Milk Products", "veg"),
    "spices and herbs": ("Condiments and Spices", "veg"),
    "baby foods": ("Miscellaneous Foods", "veg"),
    "fats and oils": ("Edible Oils and Fats", "veg"),
    "poultry products": ("Poultry", "nonveg"),
    "soups, sauces, and gravies": ("Miscellaneous Foods", "nonveg"),
    "sausages and luncheon meats": ("Animal Meat", "nonveg"),
    "breakfast cereals": ("Cereals and Millets", "veg"),
    "fruits and fruit juices": ("Fruits", "veg"),
    "pork products": ("Animal Meat", "nonveg"),
    "vegetables and vegetable products": ("Other Vegetables", "veg"),
    "nut and seed products": ("Nuts and Oil Seeds", "veg"),
    "beef products": ("Animal Meat", "nonveg"),
    "beverages": ("Beverages", "veg"),
    "finfish and shellfish products": ("Marine Fish", "nonveg"),
    "legumes and legume products": ("Grain Legumes", "veg"),
    "lamb, veal, and game products": ("Animal Meat", "nonveg"),
    "baked products": ("Cereals and Millets", "veg"),
    "sweets": ("Sugars", "veg"),
    "cereal grains and pasta": ("Cereals and Millets", "veg"),
    "fast foods": ("Miscellaneous Foods", "nonveg"),
    "meals, entrees, and side dishes": ("Miscellaneous Foods", "nonveg"),
    "snacks": ("Miscellaneous Foods", "veg"),
    "american indian/alaska native foods": ("Miscellaneous Foods", "nonveg"),
    "restaurant foods": ("Miscellaneous Foods", "nonveg"),
}
EGG_HINTS = ("egg,", "egg ", "eggs,")

COLUMNS = ["code", "name", "group", "diet", "energy_kcal", "protein_g", "fat_g", "carb_g", "fiber_g",
           "satfat_g", "sugar_g", "sodium_mg", "potassium_mg", "phosphorus_mg", "calcium_mg",
           "iron_mg", "vitk_ug", "chol_mg", "omega3_g", "source"]


def _norm(s: str) -> str:
    return " ".join(s.strip().lower().split())


def _read(folder: Path, name: str) -> list[dict]:
    path = folder / name
    if not path.exists():
        raise FileNotFoundError(
            f"{path} not found. Point this tool at the unzipped FoodData Central folder, "
            f"which should contain food.csv, food_nutrient.csv and nutrient.csv.")
    with open(path, encoding="utf-8-sig", newline="") as fh:
        return list(csv.DictReader(fh))


def resolve_nutrients(rows: list[dict]) -> tuple[dict[str, str], list[str], list[str], list[str]]:
    """Map each MediPlate nutrient to the USDA nutrient id, by name and unit.

    Returns (nutrient field -> id, omega-3 ids, total-sugar ids, unmatched fields).
    """
    by_key: dict[tuple[str, str], str] = {}
    for r in rows:
        key = (_norm(r.get("name", "")), _norm(r.get("unit_name", "")))
        by_key.setdefault(key, r["id"])
    wanted: dict[str, str] = {}
    missing: list[str] = []
    for field, (name, unit) in NUTRIENT_MAP.items():
        nid = by_key.get((name, unit))
        if nid is None and unit == "ug":  # some releases spell it µg
            nid = by_key.get((name, "µg"))
        if nid is None:
            missing.append(f"{field} ({name}, {unit})")
        else:
            wanted[field] = nid
    omega = [by_key[(n, "g")] for n in OMEGA3_NAMES if (n, "g") in by_key]
    sugars = [by_key[(n, "g")] for n in SUGAR_NAMES if (n, "g") in by_key]
    return wanted, omega, sugars, missing


def convert(folder: Path, matches: list[str], limit: int, start_index: int,
            dry_run: bool) -> list[dict]:
    foods = _read(folder, "food.csv")
    nutrients = _read(folder, "nutrient.csv")
    wanted, omega_ids, sugar_ids, missing = resolve_nutrients(nutrients)
    for field, nid in wanted.items():
        log("usda", f"{field} <- nutrient id {nid}")
    for m in missing:
        log("usda", f"WARNING no USDA nutrient found for {m}; it will be 0")

    categories: dict[str, str] = {}
    cat_path = folder / "food_category.csv"
    if cat_path.exists():
        for r in _read(folder, "food_category.csv"):
            categories[r["id"]] = r.get("description", "")

    # Pick the foods to import first, so the (large) nutrient file is read once
    # and only for those ids.
    needles = [_norm(m) for m in matches]
    chosen: dict[str, dict] = {}
    for r in foods:
        desc = r.get("description", "").strip()
        if not desc:
            continue
        if needles and not any(n in _norm(desc) for n in needles):
            continue
        chosen[r["fdc_id"]] = r
        if limit and len(chosen) >= limit:
            break
    if not chosen:
        log("usda", "no foods matched; nothing to do")
        return []
    log("usda", f"{len(chosen)} foods selected out of {len(foods)} in the file")

    ids = set(wanted.values()) | set(omega_ids) | set(sugar_ids)
    values: dict[str, dict[str, float]] = {fid: {} for fid in chosen}
    with open(folder / "food_nutrient.csv", encoding="utf-8-sig", newline="") as fh:
        for r in csv.DictReader(fh):
            fid = r.get("fdc_id")
            if fid in values and r.get("nutrient_id") in ids:
                try:
                    values[fid][r["nutrient_id"]] = float(r.get("amount") or 0.0)
                except ValueError:
                    continue

    out: list[dict] = []
    unknown_cats: set[str] = set()
    for i, (fid, food) in enumerate(sorted(chosen.items(), key=lambda kv: kv[1].get("description", ""))):
        vals = values.get(fid, {})
        cat = _norm(categories.get(food.get("food_category_id", ""), ""))
        group, diet = CATEGORY_MAP.get(cat, ("Miscellaneous Foods", "nonveg"))
        if cat and cat not in CATEGORY_MAP:
            unknown_cats.add(cat)
        desc_n = _norm(food.get("description", ""))
        if group == "Milk and Milk Products" and desc_n.startswith(EGG_HINTS):
            group, diet = "Egg and Egg Products", "egg"
        row = {
            "code": f"{CODE_PREFIX}{start_index + i:04d}",
            "name": food.get("description", "").strip(),
            "group": group,
            "diet": diet,
            # MediPlate counts added sugar only; USDA reports total sugars.
            "sugar_g": round(sum(vals.get(s, 0.0) for s in sugar_ids), 4) if group == "Sugars" else 0,
            "omega3_g": round(sum(vals.get(o, 0.0) for o in omega_ids), 4),
            "source": f"USDA FoodData Central fdc_id {fid}",
        }
        for field, nid in wanted.items():
            row[field] = round(vals.get(nid, 0.0), 4)
        for field in NUTRIENT_MAP:
            row.setdefault(field, 0)
        out.append({k: row.get(k, 0) for k in COLUMNS})

    for c in sorted(unknown_cats):
        log("usda", f"WARNING category '{c}' is not mapped; those foods became Miscellaneous/nonveg")

    missing_energy = [r["name"] for r in out if not r["energy_kcal"]]
    if missing_energy:
        log("usda", f"WARNING {len(missing_energy)} foods have no energy value, "
                    f"e.g. {missing_energy[0]!r}; step 2 will compute it from macronutrients")

    if dry_run:
        log("usda", "dry run: nothing written. First rows:")
        for r in out[:8]:
            print(f"    {r['code']}  {r['name'][:46]:46s} {r['energy_kcal']:>7} kcal  "
                  f"{r['group']} / {r['diet']}")
        return out

    OUT.parent.mkdir(parents=True, exist_ok=True)
    with open(OUT, "w", encoding="utf-8", newline="") as fh:
        w = csv.DictWriter(fh, fieldnames=COLUMNS)
        w.writeheader()
        w.writerows(out)
    log("usda", f"wrote {len(out)} foods to {OUT.relative_to(OUT.parent.parent.parent)}")
    log("usda", "now run: python pipeline/run_all.py")
    return out


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("folder", type=Path, help="unzipped FoodData Central CSV folder")
    ap.add_argument("--match", action="append", default=[],
                    help="only import foods whose description contains this text (repeatable). "
                         "Without it, every food in the file is imported, which is rarely what you want.")
    ap.add_argument("--limit", type=int, default=200, help="maximum foods to import (default 200, 0 for no limit)")
    ap.add_argument("--start-index", type=int, default=1, help="first number for the generated USDA#### codes")
    ap.add_argument("--dry-run", action="store_true", help="show what would be imported and write nothing")
    args = ap.parse_args(argv)
    if not args.match and not args.dry_run and args.limit == 0:
        ap.error("importing every food with no limit is almost certainly a mistake; "
                 "use --match, or --limit, or --dry-run first")
    convert(args.folder, args.match, args.limit, args.start_index, args.dry_run)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
