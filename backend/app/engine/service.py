"""Connects the engine steps into the operations the API offers:
generate a weekly plan, swap one dish, and explain the current targets."""
from __future__ import annotations

from dataclasses import dataclass
from datetime import date

from .. import knowledge
from ..knowledge import msg
from . import explainer, optimizer, ranker, risk, safety, targets
from .glycemic import GlucoseModel, fit
from .profile import PatientContext, build_context


@dataclass
class EngineInputs:
    profile: dict
    labs: dict[str, float]
    meal_logs: list[dict]
    glucose_readings: list[tuple[float, float]]


@dataclass
class EngineState:
    ctx: PatientContext
    targets: targets.TargetSet
    safety: safety.SafetyResult
    prefs: ranker.Preferences
    glucose: GlucoseModel


def prepare(inputs: EngineInputs) -> EngineState:
    ctx = build_context(inputs.profile, inputs.labs)                 # E1
    ts = targets.build_targets(ctx)                                  # E3 (limits first:
    sr = safety.screen(ctx, ts)                                      # E2 needs them)
    prefs = ranker.learn(inputs.meal_logs)                           # M3
    glucose = fit(inputs.glucose_readings)                           # M2
    return EngineState(ctx=ctx, targets=ts, safety=sr, prefs=prefs, glucose=glucose)


def generate_plan(inputs: EngineInputs, start: date, days: int = 7) -> dict:
    st = prepare(inputs)
    results = optimizer.plan_week(st.ctx, st.targets, st.safety, st.prefs, st.glucose, start, days)  # E4
    return {                                                                                         # E5
        "start": start.isoformat(),
        "days": [explainer.day_json(d, st.ctx, st.targets, st.prefs, st.glucose) for d in results],
        "tier_message": explainer.plan_tier_message(results),
        "targets": st.targets.as_dict(),
        "removed": explainer.removed_summary(st.safety),
        "context": context_summary(st),
        "insights": risk.insights(st.ctx),
    }


def swap(inputs: EngineInputs, plan: dict, day_index: int, slot: str) -> dict:
    """Re-plan one slot of one day, keeping every other dish that day fixed and
    every limit enforced. Returns the updated plan."""
    st = prepare(inputs)
    days = plan["days"]
    if not 0 <= day_index < len(days) or not days[day_index].get("feasible"):
        raise ValueError("That day cannot be changed.")
    choice = days[day_index]["choice"]
    if slot not in choice:
        raise ValueError("Unknown meal slot.")
    fixed = {s: tuple(v) for s, v in choice.items() if s != slot}
    current = choice[slot][0]
    used: dict[str, int] = {}
    for i, d in enumerate(days):
        if i == day_index or not d.get("feasible"):
            continue
        for v in d["choice"].values():
            used[v[0]] = used.get(v[0], 0) + 1
    options = optimizer.build_options(st.ctx, st.targets, st.safety, st.prefs, st.glucose)
    chosen, tier, relaxed = optimizer.solve_with_fallback(options, st.targets, used, fixed=fixed,
                                                          exclude={slot: {current}})
    if chosen is None:
        raise LookupError("No other dish fits this meal within your limits. Try another meal.")
    dr = optimizer.DayResult(day_index=day_index, date=days[day_index]["date"],
                             tier=max(tier or 1, days[day_index].get("tier") or 1),
                             relaxed=relaxed or days[day_index].get("relaxed", False),
                             chosen=chosen, totals=optimizer.totals_of(chosen))
    new_plan = dict(plan)
    new_plan["days"] = list(days)
    new_plan["days"][day_index] = explainer.day_json(dr, st.ctx, st.targets, st.prefs, st.glucose)
    return new_plan


def context_summary(st: EngineState) -> dict:
    k = knowledge.get()
    ctx = st.ctx
    return {
        "zone": ctx.zone, "zone_label": msg(f"z_{ctx.zone}"),
        "second_zone": ctx.second_zone,
        "bmi": ctx.bmi, "egfr": ctx.egfr, "ckd_stage": ctx.ckd_stage_label,
        "reference_weight": ctx.reference_weight,
        "conditions": [{"id": d, "label": msg(f"d_{d}"), "auto": bool(ctx.diseases[d].get("auto"))}
                       for d in ctx.active],
        "medicines": [k.medicine_by_id[m]["name"] for m in ctx.medicines],
        "chd_risk": ctx.chd_risk,
        "glucose_personal": st.glucose.personal, "glucose_readings": st.glucose.n,
        "dishes_allowed": len(st.safety.allowed), "dishes_removed": len(st.safety.removed),
    }
