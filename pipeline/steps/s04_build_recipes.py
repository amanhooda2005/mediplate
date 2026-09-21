"""Step 4 - Build the dish table (D2, dish level).

Validates every hand-built recipe, then calculates nutrients per serving from
IFCT 2017 ingredient values, the glycemic load, the region tags and the food
tags each dish inherits from its ingredients.
"""
from __future__ import annotations

import sys
from collections import Counter, defaultdict
from pathlib import Path

import yaml

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from common import (BACKEND_DATA, DIETS, NUTRIENTS, REPORTS, SLOTS, SODIUM_PER_G_SALT,  # noqa: E402
                    SOURCES, log, read_json, write_json)

REQUIRED = {"id", "slot", "diet", "name", "ta", "hi", "ing", "salt", "tags"}
DISH_TAGS = {"fried", "sweet", "soup", "fermented", "steamed", "fruit", "none", "alcohol"}
INHERITED_TAGS = [
    "allergen_milk", "allergen_peanut", "allergen_treenut", "allergen_gluten", "allergen_egg",
    "allergen_fish", "allergen_shellfish", "allergen_soy", "allergen_sesame", "beef", "pork",
    "red_meat", "poultry", "purine_high", "fermented_soy", "grapefruit_like", "star_fruit",
    "alcohol", "leafy_green", "legume",
]
DIET_RANK = {"veg": 0, "egg": 1, "nonveg": 2}
MINOR_GROUPS = {"Condiments and Spices", "Edible Oils and Fats", "Sugars"}


class RecipeError(ValueError):
    pass


def main() -> list[dict]:
    foods = {f["code"]: f for f in read_json(BACKEND_DATA / "foods.json")}
    rules = read_json(BACKEND_DATA / "rules.json")
    zones = set(rules["regions"]["zones"])
    tag_members = {t: set(c) for t, c in rules["food_tags"].items()}
    with open(SOURCES / "recipes.yaml", encoding="utf-8") as fh:
        recipes = yaml.safe_load(fh)

    dishes: list[dict] = []
    seen: set[str] = set()
    for r in recipes:
        rid = r.get("id", "?")
        missing = REQUIRED - set(r)
        if missing:
            raise RecipeError(f"{rid}: missing fields {sorted(missing)}")
        if rid in seen:
            raise RecipeError(f"duplicate dish id {rid}")
        seen.add(rid)
        if r["slot"] not in SLOTS:
            raise RecipeError(f"{rid}: bad slot {r['slot']}")
        if r["diet"] not in DIETS:
            raise RecipeError(f"{rid}: bad diet {r['diet']}")
        common = bool(r.get("common", False))
        universal = bool(r.get("universal", False))
        dish_zones = list(r.get("zones", []))
        if sum([bool(dish_zones), common, universal]) != 1:
            raise RecipeError(f"{rid}: needs exactly one of zones / common / universal")
        for z in dish_zones:
            if z not in zones:
                raise RecipeError(f"{rid}: unknown zone {z}")
        bad_tags = set(r["tags"]) - DISH_TAGS
        if bad_tags:
            raise RecipeError(f"{rid}: unknown dish tags {bad_tags}")
        if not r["ing"] and "none" not in r["tags"]:
            raise RecipeError(f"{rid}: no ingredients")
        if r["salt"] < 0:
            raise RecipeError(f"{rid}: negative salt")

        totals = {k: 0.0 for k in NUTRIENTS}
        potassium_leach = 0.0
        gl = 0.0
        grams = 0.0
        ing_diet = "veg"
        ing_tags: set[str] = set()
        key_ings: list[tuple[str, float]] = []
        whole_grain_g = 0.0
        grain_g = 0.0
        oily_fish_g = 0.0
        for code, g in r["ing"].items():
            if code not in foods:
                raise RecipeError(f"{rid}: unknown ingredient code {code}")
            if not isinstance(g, (int, float)) or g <= 0:
                raise RecipeError(f"{rid}: bad grams for {code}")
            food = foods[code]
            grams += g
            for k in NUTRIENTS:
                totals[k] += food["per100"][k] * g / 100.0
            if code in tag_members["leachable"]:
                potassium_leach += food["per100"]["potassium_mg"] * g / 100.0
            gl += food["per100"]["carb_g"] * g / 100.0 * food["gi"] / 100.0
            if DIET_RANK[food["diet"]] > DIET_RANK[ing_diet]:
                ing_diet = food["diet"]
            for t in INHERITED_TAGS:
                if code in tag_members[t]:
                    ing_tags.add(t)
            if code in tag_members["whole_grain"]:
                whole_grain_g += g
            if food["group"] == "Cereals and Millets" or code in tag_members["whole_grain"]:
                grain_g += g
            if code in tag_members["oily_fish"]:
                oily_fish_g += g
            if food["group"] not in MINOR_GROUPS and not code.startswith(("SUP001", "SUP006")):
                key_ings.append((code, g))
        if DIET_RANK[ing_diet] > DIET_RANK[r["diet"]]:
            raise RecipeError(f"{rid}: declared {r['diet']} but ingredients are {ing_diet}")
        if grain_g >= 30 and whole_grain_g >= 0.6 * grain_g:
            ing_tags.add("whole_grain")
        if oily_fish_g >= 50:
            ing_tags.add("oily_fish")

        sodium_salt = r["salt"] * SODIUM_PER_G_SALT
        totals["sodium_mg"] += sodium_salt
        grams += r["salt"]
        carb = totals["carb_g"]
        key_total = sum(g for _, g in key_ings) or 1.0
        key_ings.sort(key=lambda x: -x[1])
        dish = {
            "id": rid,
            "name": r["name"],
            "name_ta": r["ta"],
            "name_hi": r["hi"],
            "slot": r["slot"],
            "diet": r["diet"],
            "zones": dish_zones,
            "common": common,
            "universal": universal,
            "tags": sorted(set(r["tags"]) | ing_tags),
            "ingredients": [{"code": c, "grams": g, "name": foods[c]["name"]} for c, g in r["ing"].items()],
            "key_ingredients": [{"code": c, "share": round(g / key_total, 3)} for c, g in key_ings[:4]],
            "salt_g": r["salt"],
            "grams": round(grams, 1),
            "nutrients": {k: round(v, 3) for k, v in totals.items()},
            "sodium_from_salt_mg": round(sodium_salt, 2),
            "potassium_leachable_mg": round(potassium_leach, 2),
            "glycemic_load": round(gl, 2),
            "glycemic_index": round(gl / carb * 100, 1) if carb > 1 else 0.0,
        }
        dishes.append(dish)

    write_json(BACKEND_DATA / "dishes.json", dishes)
    write_report(dishes, sorted(zones))
    log("recipes", f"{len(dishes)} dishes validated and costed -> dishes.json")
    return dishes


def write_report(dishes: list[dict], zones: list[str]) -> None:
    lines = ["# MediPlate dish coverage", "", "Dishes per zone and meal slot (plan slots only).", ""]
    slots = ["breakfast", "staple", "protein", "veg", "side", "snack"]
    lines.append("| Zone | " + " | ".join(slots) + " |")
    lines.append("|---" * (len(slots) + 1) + "|")
    count = defaultdict(Counter)
    for d in dishes:
        keys = d["zones"] if d["zones"] else (["common"] if d["common"] else ["universal"])
        for z in keys:
            count[z][d["slot"]] += 1
    for z in zones + ["common", "universal"]:
        lines.append(f"| {z} | " + " | ".join(str(count[z][s]) for s in slots) + " |")
    lines += ["", f"Total dishes: {len(dishes)}",
              f"Diet split: {dict(Counter(d['diet'] for d in dishes))}",
              f"Slot split: {dict(Counter(d['slot'] for d in dishes))}"]
    REPORTS.mkdir(parents=True, exist_ok=True)
    (REPORTS / "dish_coverage.md").write_text("\n".join(lines) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
