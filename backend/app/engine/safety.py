"""E2 - Safety filter.

Runs before any meal is chosen. Every dish is checked against the patient's
diet, allergies, conditions and medicines. Dishes that must not be eaten are
removed from the search space (so the optimizer can never pick them); dishes
that should be eaten less are kept but marked, which the optimizer penalises.
"""
from __future__ import annotations

from dataclasses import dataclass, field

from .. import knowledge
from ..knowledge import msg
from .conditions import holds
from .plan_config import min_variant
from .profile import PatientContext
from .targets import UNITS, TargetSet

ALLERGEN_TAG = {a: f"allergen_{a}" for a in
                ("milk", "peanut", "treenut", "gluten", "egg", "fish", "shellfish", "soy", "sesame")}


@dataclass
class SafetyResult:
    allowed: set[str]
    removed: dict[str, list[dict]] = field(default_factory=dict)
    limited: dict[str, list[dict]] = field(default_factory=dict)


def _matches(rule_target: dict, dish: dict, tag_members: dict[str, set[str]]) -> bool:
    if "tag" in rule_target:
        return rule_target["tag"] in dish["tags"]
    if "dish_tag" in rule_target:
        return rule_target["dish_tag"] in dish["tags"]
    if "dish" in rule_target:
        return rule_target["dish"] == dish["id"]
    if "codes" in rule_target:
        codes = {i["code"] for i in dish["ingredients"]}
        return bool(codes & set(rule_target["codes"]))
    return False


def personal_blocks(ctx: PatientContext, dish: dict) -> list[dict]:
    """Diet type, beef/pork preference and allergies."""
    reasons = []
    if ctx.diet_type == "veg" and dish["diet"] != "veg":
        reasons.append(msg("diet_veg"))
    elif ctx.diet_type == "egg" and dish["diet"] == "nonveg":
        reasons.append(msg("diet_egg"))
    if ctx.no_beef and "beef" in dish["tags"]:
        reasons.append(msg("no_beef"))
    if ctx.no_pork and "pork" in dish["tags"]:
        reasons.append(msg("no_pork"))
    for a in sorted(ctx.allergies):
        if ALLERGEN_TAG[a] in dish["tags"]:
            reasons.append(msg("allergy", allergen=f"@a_{a}"))
    return reasons


def rule_hits(ctx: PatientContext, dish: dict) -> tuple[list[dict], list[dict]]:
    """(avoid reasons, limit reasons) from condition and medicine rules."""
    k = knowledge.get()
    avoid, limit = [], []
    for did in ctx.active:
        for a in k.rules["diseases"][did].get("avoid", []):
            if holds(a, ctx) and _matches(a, dish, k.tag_members):
                (avoid if a["severity"] == "avoid" else limit).append(
                    {"source": did, "message": msg(a["reason"])})
    for cls, meds in ctx.med_classes.items():
        for e in k.rules["drug_classes"][cls].get("effects", []):
            if "avoid" in e and _matches(e["avoid"], dish, k.tag_members):
                entry = {"source": meds[0], "message": msg(e["reason"])}
                (avoid if e["severity"] == "avoid" else limit).append(entry)
    return avoid, limit


def screen(ctx: PatientContext, targets: TargetSet, slots: set[str] | None = None) -> SafetyResult:
    k = knowledge.get()
    res = SafetyResult(allowed=set())
    for did, dish in k.dishes.items():
        if slots is not None and dish["slot"] not in slots:
            continue
        reasons = personal_blocks(ctx, dish)
        avoid, limit = rule_hits(ctx, dish)
        reasons += [a["message"] for a in avoid]
        # A dish that breaks a hard daily limit even in its smallest,
        # lowest-salt form can never fit, so it is removed with the reason.
        smallest = min_variant(dish, targets.leaching)
        for n, lim in targets.limits.items():
            if lim.max_hard is not None and smallest.get(n, 0) > lim.max_hard:
                reasons.append(msg("serving_share", nutrient=f"@n_{n}",
                                   value=f"{round(smallest[n]):,} {UNITS[n]}",
                                   pct=round(100 * smallest[n] / lim.max_hard)))
        if targets.vitk_band and smallest["vitk_ug"] > targets.vitk_band[1]:
            reasons.append(msg("vitk_high_serving", value=round(smallest["vitk_ug"])))
        if reasons:
            res.removed[did] = _dedupe(reasons)
        else:
            res.allowed.add(did)
            if limit:
                res.limited[did] = _dedupe([x["message"] for x in limit])
    return res


def _dedupe(items: list[dict]) -> list[dict]:
    out, seen = [], set()
    for m in items:
        key = (m["key"], tuple(sorted(m["params"].items())))
        if key not in seen:
            seen.add(key)
            out.append(m)
    return out
