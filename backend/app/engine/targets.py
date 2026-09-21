"""E3 - Target calculator with conflict ledger.

Collects every daily nutrient limit that applies to this patient (from each of
their conditions, each of their medicines, their risk results and general
healthy-eating defaults), merges them, and resolves clashes by clinical
priority. Every clash is written to a ledger in plain words.
"""
from __future__ import annotations

from dataclasses import dataclass, field

from .. import knowledge
from ..knowledge import msg
from .conditions import holds
from .profile import PatientContext, energy_target

UNITS = {
    "energy_kcal": "kcal", "protein_g": "g", "fat_g": "g", "carb_g": "g", "fiber_g": "g",
    "satfat_g": "g", "sugar_g": "g", "sodium_mg": "mg", "potassium_mg": "mg",
    "phosphorus_mg": "mg", "calcium_mg": "mg", "iron_mg": "mg", "vitk_ug": "µg",
    "chol_mg": "mg", "omega3_g": "g",
}
ENERGY_PER_G = {"carb_g": 4, "satfat_g": 9, "sugar_g": 4, "fat_g": 9, "protein_g": 4}

# Healthy-eating defaults for everyone (ICMR-NIN 2024 / WHO), lowest priority.
GENERAL_TARGETS = [
    {"nutrient": "fiber_g", "bound": "min", "per_1000kcal": 12, "hard": False, "priority": 5, "reason": "fiber_general"},
    {"nutrient": "sugar_g", "bound": "max", "pct_energy": 10, "hard": False, "priority": 5, "reason": "sugar_limit"},
    {"nutrient": "satfat_g", "bound": "max", "pct_energy": 10, "hard": False, "priority": 5, "reason": "satfat_heart"},
    {"nutrient": "sodium_mg", "bound": "max", "value": 2300, "hard": False, "priority": 5, "reason": "sodium_general"},
    {"nutrient": "protein_g", "bound": "min", "per_kg": 0.8, "hard": False, "priority": 5, "reason": "protein_muscle",
     "skip_if_ckd": True},
]


@dataclass
class Entry:
    value: float
    hard: bool
    priority: int
    source: str          # disease id, medicine id, "general" or "risk_heart"
    reason: str


@dataclass
class Limit:
    nutrient: str
    min_hard: float | None = None
    min_soft: float | None = None
    max_hard: float | None = None
    max_soft: float | None = None
    min_priority: int = 5
    max_priority: int = 5
    min_sources: list[str] = field(default_factory=list)
    max_sources: list[str] = field(default_factory=list)
    reasons: list[dict] = field(default_factory=list)

    def as_dict(self) -> dict:
        return {
            "nutrient": self.nutrient, "unit": UNITS[self.nutrient],
            "min_hard": _r(self.min_hard), "min_soft": _r(self.min_soft),
            "max_hard": _r(self.max_hard), "max_soft": _r(self.max_soft),
            "min_priority": self.min_priority, "max_priority": self.max_priority,
            "min_sources": self.min_sources, "max_sources": self.max_sources,
            "reasons": self.reasons,
        }

    @property
    def upper(self) -> float | None:
        vals = [v for v in (self.max_hard, self.max_soft) if v is not None]
        return min(vals) if vals else None

    @property
    def lower(self) -> float | None:
        vals = [v for v in (self.min_hard, self.min_soft) if v is not None]
        return max(vals) if vals else None


@dataclass
class TargetSet:
    energy_kcal: float
    limits: dict[str, Limit]
    meal_carb_min: float | None = None
    meal_carb_min_reason: dict | None = None
    vitk_band: tuple[float, float] | None = None
    vitk_reason: dict | None = None
    meal_carb_share_max: float | None = None
    glycemic_focus: bool = False
    leaching: bool = False
    prefer: list[dict] = field(default_factory=list)
    penalize: list[dict] = field(default_factory=list)
    advice: list[dict] = field(default_factory=list)
    medicine_schedule: list[dict] = field(default_factory=list)
    alerts: list[dict] = field(default_factory=list)
    ledger: list[dict] = field(default_factory=list)
    notes: list[dict] = field(default_factory=list)
    reference_weight: float = 0.0

    def as_dict(self) -> dict:
        return {
            "energy_kcal": self.energy_kcal,
            "limits": {k: v.as_dict() for k, v in self.limits.items()},
            "meal_carb_min": self.meal_carb_min,
            "meal_carb_min_reason": self.meal_carb_min_reason,
            "vitk_band": list(self.vitk_band) if self.vitk_band else None,
            "vitk_reason": self.vitk_reason,
            "meal_carb_share_max": self.meal_carb_share_max,
            "glycemic_focus": self.glycemic_focus,
            "leaching": self.leaching,
            "advice": self.advice,
            "medicine_schedule": self.medicine_schedule,
            "alerts": self.alerts,
            "ledger": self.ledger,
            "notes": self.notes,
            "reference_weight": self.reference_weight,
        }


def _r(v: float | None) -> float | None:
    return None if v is None else round(v, 1)


def _fmt(value: float, nutrient: str) -> str:
    unit = UNITS[nutrient]
    if unit in ("mg", "kcal", "µg"):
        return f"{round(value):,} {unit}"
    return f"{round(value, 1):g} {unit}"


def _amount(t: dict, ctx: PatientContext, energy: float) -> float:
    if "value" in t:
        return float(t["value"])
    if "per_kg" in t:
        return float(t["per_kg"]) * ctx.reference_weight
    if "pct_energy" in t:
        return energy * float(t["pct_energy"]) / 100.0 / ENERGY_PER_G[t["nutrient"]]
    if "per_1000kcal" in t:
        return float(t["per_1000kcal"]) * energy / 1000.0
    raise ValueError(f"target has no amount: {t}")


def _source_label(source: str) -> str:
    k = knowledge.get()
    if source in k.rules["diseases"]:
        return f"@d_{source}"
    if source in k.medicine_by_id:
        return k.medicine_by_id[source]["name"]
    if source == "risk_heart":
        return "@d_cvd"
    return "@d_general"


def build_targets(ctx: PatientContext) -> TargetSet:
    k = knowledge.get()
    energy, energy_note = energy_target(ctx)
    entries: dict[tuple[str, str], list[Entry]] = {}
    reasons: dict[str, list[dict]] = {}

    def add(t: dict, source: str) -> None:
        if not holds(t, ctx):
            return
        value = _amount(t, ctx, energy)
        entries.setdefault((t["nutrient"], t["bound"]), []).append(
            Entry(value=value, hard=bool(t["hard"]), priority=int(t["priority"]), source=source, reason=t["reason"]))
        r = msg(t["reason"])
        if r not in reasons.setdefault(t["nutrient"], []):
            reasons[t["nutrient"]].append(r)

    ts = TargetSet(energy_kcal=energy, limits={}, reference_weight=ctx.reference_weight)
    if energy_note:
        ts.notes.append(energy_note)
    ts.notes.extend(ctx.notes)

    # --- conditions
    for did in ctx.active:
        d = k.rules["diseases"][did]
        for t in d.get("targets", []):
            add(t, did)
        for p in d.get("prefer", []):
            if holds(p, ctx):
                ts.prefer.append({**p, "source": did})
        for p in d.get("penalize", []):
            if holds(p, ctx):
                ts.penalize.append({**p, "source": did})
        if d.get("glycemic_focus"):
            ts.glycemic_focus = True
        if d.get("meal_carb_share_max"):
            ts.meal_carb_share_max = min(ts.meal_carb_share_max or 1.0, float(d["meal_carb_share_max"]))
        for adv in d.get("advice", []):
            key = adv if isinstance(adv, str) else adv["key"]
            if isinstance(adv, dict) and not holds(adv, ctx):
                continue
            m = msg(key)
            if m not in ts.advice:
                ts.advice.append(m)

    # --- medicines
    for cls, med_ids in ctx.med_classes.items():
        c = k.rules["drug_classes"][cls]
        for med in med_ids:
            advice_for_med = []
            for e in c.get("effects", []):
                if "nutrient" in e:
                    add(e["nutrient"], med)
                elif "meal_carb_min" in e:
                    if ts.meal_carb_min is None or e["meal_carb_min"] > ts.meal_carb_min:
                        ts.meal_carb_min = float(e["meal_carb_min"])
                        ts.meal_carb_min_reason = msg(e["reason"])
                elif "vitk_band" in e:
                    band = e["vitk_band"]
                    ts.vitk_band = (float(band["min"]), float(band["max"]))
                    ts.vitk_reason = msg(e["reason"])
                elif "disease_alert" in e:
                    da = e["disease_alert"]
                    if ctx.condition_active(da["condition"]):
                        alert = {"severity": da["severity"], "medicine": k.medicine_by_id[med]["name"],
                                 "message": msg(da["reason"])}
                        if alert not in ts.alerts:
                            ts.alerts.append(alert)
                elif "advice" in e:
                    advice_for_med.append(msg(e["advice"]))
                elif "avoid" in e:
                    advice_for_med.append(msg(e["reason"]))
            ts.medicine_schedule.append({
                "medicine": med, "name": k.medicine_by_id[med]["name"], "class_label": c["label"],
                "timing": msg(f"t_{c['timing']}"), "timing_key": c["timing"], "advice": advice_for_med,
            })

    # --- risk results
    if ctx.chd_risk is not None and ctx.chd_risk >= k.heart_meta.get("high_risk_threshold", 0.5):
        add({"nutrient": "satfat_g", "bound": "max", "pct_energy": 7, "hard": False, "priority": 4,
             "reason": "satfat_heart"}, "risk_heart")
        ts.penalize.append({"dish_tag": "fried", "weight": 15, "reason": "fried_food", "source": "risk_heart"})

    # --- general defaults
    ckd_limits_protein = ctx.has("ckd") and (ctx.ckd_stage or 0) >= 3 and not ctx.dialysis
    for t in GENERAL_TARGETS:
        if t.get("skip_if_ckd") and ckd_limits_protein:
            continue
        add({kk: vv for kk, vv in t.items() if kk != "skip_if_ckd"}, "general")

    # --- merge + resolve
    nutrients = sorted({n for n, _ in entries})
    for n in nutrients:
        lim = Limit(nutrient=n, reasons=reasons.get(n, []))
        mins = entries.get((n, "min"), [])
        maxs = entries.get((n, "max"), [])
        if maxs:
            hard = [e for e in maxs if e.hard]
            lim.max_hard = min(e.value for e in hard) if hard else None
            best = min(maxs, key=lambda e: (e.value, e.priority))
            lim.max_soft = best.value
            lim.max_priority = min(e.priority for e in maxs)
            lim.max_sources = sorted({e.source for e in maxs if abs(e.value - best.value) < 1e-6})
            if lim.max_hard is not None and lim.max_soft >= lim.max_hard:
                lim.max_soft = None
            specific = [e for e in maxs if e.source != "general"]
            if len({e.source for e in specific}) > 1 and len({round(e.value) for e in specific}) > 1:
                ts.ledger.append(msg("tightened", nutrient=f"@n_{n}", value=_fmt(best.value, n),
                                     source=_source_label(best.source)))
        if mins:
            hard = [e for e in mins if e.hard]
            lim.min_hard = max(e.value for e in hard) if hard else None
            best = max(mins, key=lambda e: (e.value, -e.priority))
            lim.min_soft = best.value
            lim.min_priority = min(e.priority for e in mins)
            lim.min_sources = sorted({e.source for e in mins if abs(e.value - best.value) < 1e-6})
            if lim.min_hard is not None and lim.min_soft <= lim.min_hard:
                lim.min_soft = None
        _resolve(lim, mins, maxs, ts)
        ts.limits[n] = lim

    # leaching is offered when potassium is restricted and the patient has CKD
    k_lim = ts.limits.get("potassium_mg")
    if k_lim and k_lim.max_hard is not None and ctx.has("ckd"):
        ts.leaching = True
    if k_lim and k_lim.max_hard is not None and not ctx.has("ckd"):
        ts.leaching = True  # medicine-driven potassium limit: leaching helps too
    return ts


def _resolve(lim: Limit, mins: list[Entry], maxs: list[Entry], ts: TargetSet) -> None:
    """Make min <= max. Lower priority number wins; loser is capped and logged."""
    n = lim.nutrient

    def strongest(entries: list[Entry], pick) -> Entry:
        return pick(entries)

    # 1. both hard and contradictory
    if lim.min_hard is not None and lim.max_hard is not None and lim.min_hard > lim.max_hard:
        emin = strongest([e for e in mins if e.hard], lambda es: max(es, key=lambda e: e.value))
        emax = strongest([e for e in maxs if e.hard], lambda es: min(es, key=lambda e: e.value))
        if emin.priority <= emax.priority:
            _log(ts, n, loser=emax, winner=emin, loser_bound="max", winner_bound="min")
            lim.max_hard = None
            lim.max_soft = None if (lim.max_soft is not None and lim.max_soft < lim.min_hard) else lim.max_soft
        else:
            _log(ts, n, loser=emin, winner=emax, loser_bound="min", winner_bound="max")
            lim.min_hard = None
            lim.min_soft = None
    # 2. a soft minimum above a hard maximum -> cap the soft minimum
    if lim.min_soft is not None and lim.max_hard is not None and lim.min_soft > lim.max_hard:
        emin = max(mins, key=lambda e: e.value)
        emax = min([e for e in maxs if e.hard], key=lambda e: e.value)
        _log(ts, n, loser=emin, winner=emax, loser_bound="min", winner_bound="max")
        lim.min_soft = None
    # 3. a hard minimum above a soft maximum -> drop the soft maximum
    if lim.min_hard is not None and lim.max_soft is not None and lim.min_hard > lim.max_soft:
        emin = max([e for e in mins if e.hard], key=lambda e: e.value)
        emax = min(maxs, key=lambda e: e.value)
        _log(ts, n, loser=emax, winner=emin, loser_bound="max", winner_bound="min")
        lim.max_soft = None
    # 4. two soft goals that clash -> keep the higher-priority one
    if lim.min_soft is not None and lim.max_soft is not None and lim.min_soft > lim.max_soft:
        emin = max([e for e in mins if not e.hard], key=lambda e: e.value)
        emax = min([e for e in maxs if not e.hard], key=lambda e: e.value)
        if emin.priority < emax.priority:
            _log(ts, n, loser=emax, winner=emin, loser_bound="max", winner_bound="min")
            lim.max_soft = None
        else:
            _log(ts, n, loser=emin, winner=emax, loser_bound="min", winner_bound="max")
            lim.min_soft = None


def _log(ts: TargetSet, n: str, loser: Entry, winner: Entry, loser_bound: str, winner_bound: str) -> None:
    if loser.source == winner.source:
        return
    ts.ledger.append(msg(
        "conflict", loser=_source_label(loser.source), winner=_source_label(winner.source),
        nutrient=f"@n_{n}", loser_dir=f"@dir_{loser_bound}", loser_value=_fmt(loser.value, n),
        winner_dir=f"@dir_{winner_bound}", winner_value=_fmt(winner.value, n)))
