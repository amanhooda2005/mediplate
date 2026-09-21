"""Meal structure and the dish variants the planner may choose."""
from __future__ import annotations

# (slot key, dish slot type, meal)
DAY_SLOTS: list[tuple[str, str, str]] = [
    ("breakfast", "breakfast", "breakfast"),
    ("lunch_staple", "staple", "lunch"),
    ("lunch_protein", "protein", "lunch"),
    ("lunch_veg", "veg", "lunch"),
    ("lunch_side", "side", "lunch"),
    ("snack", "snack", "snack"),
    ("dinner_staple", "staple", "dinner"),
    ("dinner_protein", "protein", "dinner"),
    ("dinner_veg", "veg", "dinner"),
]
MEALS = ["breakfast", "lunch", "snack", "dinner"]
MAIN_MEALS = ["breakfast", "lunch", "dinner"]

PORTIONS = {
    "breakfast": [0.75, 1.0, 1.25],
    "staple": [0.5, 0.75, 1.0, 1.25, 1.5],
    "protein": [0.5, 0.75, 1.0, 1.25],
    "veg": [0.75, 1.0, 1.5],
    "side": [1.0],
    "snack": [1.0],
    "sweet": [1.0],
}
SALT_FACTORS = [1.0, 0.5, 0.25]
LEACH_RETAIN = 0.6      # share of vegetable potassium left after soak-and-boil
WEEKLY_CAP = 5          # max uses of one non-staple dish per week
UNLIMITED_SLOTS = {"staple", "side"}


def variant_nutrients(dish: dict, portion: float, salt: float, leach: bool) -> dict[str, float]:
    n = dict(dish["nutrients"])
    n["sodium_mg"] -= dish["sodium_from_salt_mg"] * (1 - salt)
    if leach:
        n["potassium_mg"] -= dish["potassium_leachable_mg"] * (1 - LEACH_RETAIN)
    return {k: v * portion for k, v in n.items()}


def can_leach(dish: dict) -> bool:
    """Soak-and-boil only makes sense for cooked vegetable dishes, never raw ones."""
    return dish["potassium_leachable_mg"] >= 50 and not ({"raw", "fruit"} & set(dish["tags"]))


def min_variant(dish: dict, leaching_allowed: bool) -> dict[str, float]:
    """Smallest amounts of each nutrient any variant of this dish can have."""
    p = min(PORTIONS[dish["slot"]])
    salt = min(SALT_FACTORS) if dish["salt_g"] > 0 else 1.0
    return variant_nutrients(dish, p, salt, leaching_allowed and can_leach(dish))
