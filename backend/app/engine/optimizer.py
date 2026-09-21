"""E4 - Meal optimizer (Google OR-Tools, mixed-integer programming with CBC).

For each day it picks one dish variant (dish × portion × salt level ×
potassium-leaching) for each of the nine meal slots so that:
  * every HARD daily limit holds (sodium, potassium, phosphorus, protein caps,
    carbohydrate floors for insulin/sulfonylurea/SGLT2, vitamin K band, energy
    window) — these are constraints, never traded off;
  * SOFT goals (fibre, saturated fat, sugar, energy closeness, glycemic load)
    are met as closely as possible through penalties;
  * home-region dishes are preferred, and the search widens region by region
    (home → neighbouring zones → all-India) only when a day is infeasible.
Only dishes that passed the safety filter (E2) are ever considered.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date, timedelta

from ortools.linear_solver import pywraplp

from .. import knowledge
from ..config import get_settings
from .glycemic import GlucoseModel
from .plan_config import (DAY_SLOTS, MAIN_MEALS, PORTIONS, SALT_FACTORS, UNLIMITED_SLOTS, WEEKLY_CAP,
                          variant_nutrients)
from .profile import PatientContext
from .ranker import Preferences
from .safety import SafetyResult
from .targets import TargetSet

COST_SCALE = 5
PRIORITY_WEIGHT = {1: 6, 2: 4, 3: 2, 4: 1, 5: 1}
ORIGIN_COST = {"home": 0, "second": 4, "universal": 2, "neighbour": 25, "common": 35}
TIER_ORIGINS = {
    1: {"home", "second", "universal"},
    2: {"home", "second", "universal", "neighbour"},
    3: {"home", "second", "universal", "neighbour", "common"},
}
ENERGY_WINDOW = (0.85, 1.15)
GL_WEIGHT = 0.6


@dataclass
class Option:
    slot: str
    slot_type: str
    meal: str
    dish_id: str
    portion: float
    salt: float
    leach: bool
    raw: dict[str, float]
    gl: float
    origin: str
    base_cost: int


@dataclass
class DayResult:
    day_index: int
    date: str
    tier: int | None
    relaxed: bool
    chosen: dict[str, Option] = field(default_factory=dict)
    totals: dict[str, float] = field(default_factory=dict)
    feasible: bool = True


def dish_origin(dish: dict, ctx: PatientContext) -> str | None:
    k = knowledge.get()
    if dish["universal"]:
        return "universal"
    if ctx.zone in dish["zones"]:
        return "home"
    if ctx.second_zone and ctx.second_zone in dish["zones"]:
        return "second"
    neighbours = set(k.zones[ctx.zone]["neighbours"])
    if ctx.second_zone:
        neighbours |= set(k.zones[ctx.second_zone]["neighbours"])
    if neighbours & set(dish["zones"]):
        return "neighbour"
    if dish["common"]:
        return "common"
    return None


def build_options(ctx: PatientContext, targets: TargetSet, safety: SafetyResult, prefs: Preferences,
                  glucose: GlucoseModel) -> list[Option]:
    k = knowledge.get()
    gl_weight = GL_WEIGHT * glucose.sensitivity() if targets.glycemic_focus else 0.0
    na = targets.limits.get("sodium_mg")
    salt_levels = SALT_FACTORS if (na is not None and na.max_hard is not None) else SALT_FACTORS[:2]
    options: list[Option] = []
    for slot, slot_type, meal in DAY_SLOTS:
        for did in sorted(safety.allowed):
            dish = k.dishes[did]
            if dish["slot"] != slot_type:
                continue
            origin = dish_origin(dish, ctx)
            if origin is None:
                continue
            dish_cost = ORIGIN_COST[origin] - prefs.bonus(did)
            if did in safety.limited:
                dish_cost += 30
            for p in targets.prefer:
                if p.get("tag", p.get("dish_tag")) in dish["tags"]:
                    dish_cost -= p["weight"]
            for p in targets.penalize:
                if p.get("tag", p.get("dish_tag")) in dish["tags"]:
                    dish_cost += p["weight"]
            salts = salt_levels if dish["salt_g"] > 0 else [1.0]
            # When potassium is restricted, vegetables are always soaked and boiled.
            leaches = [True] if (targets.leaching and dish["potassium_leachable_mg"] >= 50) else [False]
            for portion in PORTIONS[slot_type]:
                for salt in salts:
                    for leach in leaches:
                        raw = variant_nutrients(dish, portion, salt, leach)
                        gl = dish["glycemic_load"] * portion
                        cost = dish_cost
                        cost += {1.0: 0, 0.5: 3, 0.25: 8}[salt]
                        cost += round(4 * abs(portion - 1.0) / 0.25)
                        cost += gl_weight * gl
                        options.append(Option(
                            slot=slot, slot_type=slot_type, meal=meal, dish_id=did, portion=portion,
                            salt=salt, leach=leach, raw=raw, gl=gl, origin=origin, base_cost=int(round(cost * COST_SCALE))))
    return options


def solve_day(options: list[Option], targets: TargetSet, tier: int, relaxed: bool,
              used: dict[str, int], fixed: dict[str, tuple] | None = None,
              exclude: dict[str, set[str]] | None = None) -> dict[str, Option] | None:
    """Solve one day as a mixed-integer programme. Returns slot -> option, or
    None when no combination satisfies every hard limit."""
    s = get_settings()
    fixed = fixed or {}
    exclude = exclude or {}
    allowed_origins = TIER_ORIGINS[tier]
    by_slot: dict[str, list[Option]] = {slot: [] for slot, _, _ in DAY_SLOTS}
    for o in options:
        if o.slot in fixed:
            if (o.dish_id, o.portion, o.salt, o.leach) != fixed[o.slot]:
                continue
        else:
            if o.origin not in allowed_origins:
                continue
            if o.dish_id in exclude.get(o.slot, set()):
                continue
            if o.slot_type not in UNLIMITED_SLOTS and used.get(o.dish_id, 0) >= WEEKLY_CAP:
                continue
        by_slot[o.slot].append(o)
    if any(not opts for opts in by_slot.values()):
        return None

    solver = pywraplp.Solver.CreateSolver("CBC") or pywraplp.Solver.CreateSolver("SCIP")
    if solver is None:
        raise RuntimeError("No MILP solver available in OR-Tools")
    solver.SetTimeLimit(int(s.solver_seconds_per_day * 1000))
    inf = solver.infinity()
    flat: list[Option] = []
    x: list = []
    for slot, opts in by_slot.items():
        vs = []
        for o in opts:
            v = solver.BoolVar(f"x{len(flat)}")
            flat.append(o)
            x.append(v)
            vs.append(v)
        solver.Add(solver.Sum(vs) == 1)

    nutrients = sorted(set(targets.limits) | {"energy_kcal", "carb_g", "vitk_ug"})
    total = {n: solver.Sum([o.raw.get(n, 0.0) * x[i] for i, o in enumerate(flat)]) for n in nutrients}
    objective = []

    # no dish twice in one day (staples and sides may repeat)
    per_dish: dict[str, list] = {}
    for i, o in enumerate(flat):
        if o.slot_type not in UNLIMITED_SLOTS:
            per_dish.setdefault(o.dish_id, []).append(x[i])
    for vs in per_dish.values():
        if len(vs) > 1:
            solver.Add(solver.Sum(vs) <= 1)

    # option costs + weekly variety
    for i, o in enumerate(flat):
        variety = 10 * COST_SCALE * used.get(o.dish_id, 0) if o.slot_type not in UNLIMITED_SLOTS else 0
        objective.append((o.base_cost + variety) * x[i])

    # energy: stay close to target, inside a hard window unless relaxed
    e = float(targets.energy_kcal)
    dev = solver.NumVar(0, inf, "energy_dev")
    solver.Add(dev >= total["energy_kcal"] - e)
    solver.Add(dev >= e - total["energy_kcal"])
    objective.append(dev)
    if not relaxed:
        solver.Add(total["energy_kcal"] >= ENERGY_WINDOW[0] * e)
        solver.Add(total["energy_kcal"] <= ENERGY_WINDOW[1] * e)

    # nutrient limits: hard = constraint, soft = penalty per 1 % beyond the goal
    for n, lim in targets.limits.items():
        for bound, hard_v, soft_v, prio in (("max", lim.max_hard, lim.max_soft, lim.max_priority),
                                            ("min", lim.min_hard, lim.min_soft, lim.min_priority)):
            if hard_v is not None:
                if (not relaxed) or prio <= 2:
                    solver.Add(total[n] <= hard_v if bound == "max" else total[n] >= hard_v)
                else:
                    _soft(solver, objective, total[n], hard_v, bound, PRIORITY_WEIGHT[prio] * 3)
            if soft_v is not None:
                _soft(solver, objective, total[n], soft_v, bound, PRIORITY_WEIGHT[prio])

    meal_carbs = {meal: solver.Sum([o.raw["carb_g"] * x[i] for i, o in enumerate(flat) if o.meal == meal])
                  for meal in MAIN_MEALS}
    # carbohydrate floor in every main meal (insulin / sulfonylurea) — hard
    if targets.meal_carb_min:
        for meal in MAIN_MEALS:
            solver.Add(meal_carbs[meal] >= targets.meal_carb_min)
    # spread carbohydrate across meals (diabetes) — soft
    if targets.meal_carb_share_max:
        carb_lim = targets.limits.get("carb_g")
        ref = carb_lim.upper if carb_lim and carb_lim.upper else 0.5 * targets.energy_kcal / 4
        cap = targets.meal_carb_share_max * ref
        for meal in MAIN_MEALS:
            over = solver.NumVar(0, inf, f"carbshare_{meal}")
            solver.Add(over >= meal_carbs[meal] - cap)
            objective.append(COST_SCALE * over)
    # vitamin K band (warfarin-type medicines) — always hard
    if targets.vitk_band:
        lo, hi = targets.vitk_band
        solver.Add(total["vitk_ug"] >= lo)
        solver.Add(total["vitk_ug"] <= hi)

    solver.Minimize(solver.Sum(objective))
    params = pywraplp.MPSolverParameters()
    params.SetDoubleParam(pywraplp.MPSolverParameters.RELATIVE_MIP_GAP, 0.05)
    status = solver.Solve(params)
    if status not in (pywraplp.Solver.OPTIMAL, pywraplp.Solver.FEASIBLE):
        return None
    return {o.slot: o for i, o in enumerate(flat) if x[i].solution_value() > 0.5}


def _soft(solver, objective: list, total, limit: float, bound: str, weight: int) -> None:
    """Penalise each 1 % beyond a goal."""
    if limit <= 0:
        return
    pct = solver.NumVar(0, solver.infinity(), "")
    if bound == "max":
        solver.Add(pct * limit >= 100 * (total - limit))
    else:
        solver.Add(pct * limit >= 100 * (limit - total))
    objective.append(weight * COST_SCALE * pct)


def totals_of(chosen: dict[str, Option]) -> dict[str, float]:
    out: dict[str, float] = {}
    for o in chosen.values():
        for n, v in o.raw.items():
            out[n] = out.get(n, 0.0) + v
    return {n: round(v, 2) for n, v in out.items()}


def plan_week(ctx: PatientContext, targets: TargetSet, safety: SafetyResult, prefs: Preferences,
              glucose: GlucoseModel, start: date, days: int = 7) -> list[DayResult]:
    options = build_options(ctx, targets, safety, prefs, glucose)
    used: dict[str, int] = {}
    results: list[DayResult] = []
    for d in range(days):
        day = start + timedelta(days=d)
        res = solve_with_fallback(options, targets, used)
        dr = DayResult(day_index=d, date=day.isoformat(), tier=res[1], relaxed=res[2])
        if res[0] is None:
            dr.feasible = False
        else:
            dr.chosen = res[0]
            dr.totals = totals_of(res[0])
            for o in res[0].values():
                used[o.dish_id] = used.get(o.dish_id, 0) + 1
        results.append(dr)
    return results


def solve_with_fallback(options: list[Option], targets: TargetSet, used: dict[str, int],
                        fixed: dict | None = None, exclude: dict | None = None
                        ) -> tuple[dict[str, Option] | None, int | None, bool]:
    for tier in (1, 2, 3):
        chosen = solve_day(options, targets, tier, False, used, fixed, exclude)
        if chosen:
            return chosen, tier, False
    chosen = solve_day(options, targets, 3, True, used, fixed, exclude)
    if chosen:
        return chosen, 3, True
    return None, None, False
