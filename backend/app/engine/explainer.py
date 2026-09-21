"""E5 - Explainer.

Turns the optimizer's choices into what the patient sees: each dish with its
region, portion, salt level and short "why it fits" labels; each day's totals
checked against every limit; meal-level blood-sugar estimates; and the
plan-level ledger, advice and medicine timings.
"""
from __future__ import annotations

from .. import knowledge
from ..knowledge import msg
from .glycemic import GlucoseModel, describe
from .optimizer import DayResult, Option
from .plan_config import DAY_SLOTS, MEALS
from .profile import PatientContext
from .ranker import Preferences
from .safety import SafetyResult
from .targets import UNITS, TargetSet

SHOWN_NUTRIENTS = ["energy_kcal", "protein_g", "carb_g", "fat_g", "satfat_g", "fiber_g", "sugar_g",
                   "sodium_mg", "potassium_mg", "phosphorus_mg", "vitk_ug"]


def _region_msg(o: Option, ctx: PatientContext) -> dict:
    k = knowledge.get()
    dish = k.dishes[o.dish_id]
    if o.origin == "home":
        return msg("region_home", zone=f"@z_{ctx.zone}")
    if o.origin == "second":
        return msg("region_second", zone=f"@z_{ctx.second_zone}")
    if o.origin == "neighbour":
        zone = next((z for z in dish["zones"] if z in k.zones), dish["zones"][0])
        return msg("region_neighbour", zone=f"@z_{zone}")
    if o.origin == "common":
        return msg("region_common")
    return msg("region_universal")


def _why(o: Option, targets: TargetSet, prefs: Preferences) -> list[dict]:
    k = knowledge.get()
    dish = k.dishes[o.dish_id]
    n = o.raw
    chips: list[str] = []
    if o.dish_id in prefs.liked:
        chips.append("why_liked")
    if "oily_fish" in dish["tags"]:
        chips.append("why_omega3")
    k_lim = targets.limits.get("potassium_mg")
    if k_lim and k_lim.max_hard is not None and n.get("potassium_mg", 0) < 250:
        chips.append("why_low_potassium")
    na_lim = targets.limits.get("sodium_mg")
    if na_lim and na_lim.upper is not None and na_lim.upper <= 2000 and n.get("sodium_mg", 0) < 250:
        chips.append("why_low_sodium")
    if targets.glycemic_focus and n.get("carb_g", 0) >= 10 and 0 < dish["glycemic_index"] < 55:
        chips.append("why_low_gi")
    if n.get("fiber_g", 0) >= 5:
        chips.append("why_high_fiber")
    if n.get("protein_g", 0) >= 10:
        chips.append("why_protein")
    if "whole_grain" in dish["tags"]:
        chips.append("why_whole_grain")
    sf = targets.limits.get("satfat_g")
    if sf and sf.upper is not None and n.get("satfat_g", 0) < 1.0 and o.slot_type in ("protein", "veg", "breakfast"):
        chips.append("why_low_satfat")
    seen, out = set(), []
    for c in chips:
        if c not in seen:
            seen.add(c)
            out.append(msg(c))
    return out[:3]


def item_json(o: Option, ctx: PatientContext, targets: TargetSet, prefs: Preferences) -> dict:
    k = knowledge.get()
    dish = k.dishes[o.dish_id]
    notes = []
    if o.salt == 0.5:
        notes.append(msg("variant_less_salt"))
    elif o.salt == 0.25:
        notes.append(msg("variant_very_low_salt"))
    if o.leach:
        notes.append(msg("variant_leached_short"))
    if o.portion != 1.0:
        notes.append(msg("portion", portion=o.portion))
    return {
        "slot": o.slot, "meal": o.meal, "slot_type": o.slot_type,
        "dish_id": o.dish_id, "name": dish["name"], "name_ta": dish["name_ta"], "name_hi": dish["name_hi"],
        "portion": o.portion, "salt": o.salt, "leach": o.leach, "origin": o.origin,
        "grams": round(dish["grams"] * o.portion),
        "nutrients": {n: round(o.raw.get(n, 0.0), 1) for n in SHOWN_NUTRIENTS},
        "glycemic_load": round(o.gl, 1),
        "region": _region_msg(o, ctx), "notes": notes, "why": _why(o, targets, prefs),
        "tags": dish["tags"],
    }


def day_checks(totals: dict[str, float], targets: TargetSet) -> list[dict]:
    checks = []
    e = totals.get("energy_kcal", 0.0)
    checks.append({"nutrient": "energy_kcal", "unit": "kcal", "value": round(e),
                   "min": round(targets.energy_kcal * 0.85), "max": round(targets.energy_kcal * 1.15),
                   "target": targets.energy_kcal, "hard": True,
                   "status": "ok" if 0.85 * targets.energy_kcal <= e <= 1.15 * targets.energy_kcal else "off"})
    for n, lim in targets.limits.items():
        v = totals.get(n, 0.0)
        status = "ok"
        if lim.max_hard is not None and v > lim.max_hard + 0.5:
            status = "over"
        elif lim.min_hard is not None and v < lim.min_hard - 0.5:
            status = "under"
        elif lim.max_soft is not None and v > lim.max_soft * 1.02:
            status = "above_goal"
        elif lim.min_soft is not None and v < lim.min_soft * 0.98:
            status = "below_goal"
        checks.append({"nutrient": n, "unit": UNITS[n], "value": round(v, 1),
                       "min": lim.lower, "max": lim.upper,
                       "hard": (lim.max_hard is not None) or (lim.min_hard is not None),
                       "status": status})
    if targets.vitk_band:
        v = totals.get("vitk_ug", 0.0)
        lo, hi = targets.vitk_band
        checks.append({"nutrient": "vitk_ug", "unit": "µg", "value": round(v), "min": lo, "max": hi, "hard": True,
                       "status": "ok" if lo - 0.5 <= v <= hi + 0.5 else "over" if v > hi else "under"})
    return checks


def day_json(dr: DayResult, ctx: PatientContext, targets: TargetSet, prefs: Preferences,
             glucose: GlucoseModel) -> dict:
    if not dr.feasible:
        return {"index": dr.day_index, "date": dr.date, "feasible": False, "tier": None, "relaxed": False,
                "message": msg("no_plan"), "meals": {m: [] for m in MEALS}, "totals": {}, "checks": [],
                "glycemic": {}}
    meals: dict[str, list] = {m: [] for m in MEALS}
    for slot, _, meal in DAY_SLOTS:
        o = dr.chosen[slot]
        if o.slot_type == "side" and o.dish_id == "no_side":
            continue
        meals[meal].append(item_json(o, ctx, targets, prefs))
    glyc = {}
    if targets.glycemic_focus:
        for meal in MEALS:
            gl = sum(o.gl for o in dr.chosen.values() if o.meal == meal)
            glyc[meal] = describe(gl, glucose, per="meal")
    return {
        "index": dr.day_index, "date": dr.date, "feasible": True, "tier": dr.tier, "relaxed": dr.relaxed,
        "message": msg("tier_relaxed") if dr.relaxed else None,
        "meals": meals, "totals": {n: round(dr.totals.get(n, 0.0), 1) for n in SHOWN_NUTRIENTS},
        "checks": day_checks(dr.totals, targets), "glycemic": glyc,
        "choice": {slot: [o.dish_id, o.portion, o.salt, o.leach] for slot, o in dr.chosen.items()},
    }


def removed_summary(safety: SafetyResult, limit: int = 12) -> dict:
    k = knowledge.get()
    items = []
    for did, reasons in sorted(safety.removed.items(), key=lambda kv: k.dishes[kv[0]]["name"]):
        dish = k.dishes[did]
        if dish["slot"] == "sweet":
            continue
        items.append({"dish_id": did, "name": dish["name"], "name_ta": dish["name_ta"], "name_hi": dish["name_hi"],
                      "reasons": reasons})
    personal = {"diet_veg", "diet_egg", "no_beef", "no_pork"}
    health = [i for i in items if any(r["key"] not in personal for r in i["reasons"])]
    return {"count": len(items), "health_count": len(health), "examples": health[:limit]}


def plan_tier_message(days: list[DayResult]) -> dict:
    tiers = [d.tier for d in days if d.tier]
    if any(d.relaxed for d in days):
        return msg("tier_relaxed")
    top = max(tiers) if tiers else 1
    return msg(f"tier_{top}")
