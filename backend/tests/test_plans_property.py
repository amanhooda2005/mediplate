"""Property test: every plan meets every hard limit, for many random patients.

Patients are generated from a fixed seed across all states, diets, condition
combinations, kidney stages, lab results and medicines. For each plan day we
recompute totals from the dish data (not from the optimizer's own numbers) and
check every hard rule independently.
"""
import random
from datetime import date

import pytest
from conftest import profile

from app.engine import safety
from app.engine.plan_config import DAY_SLOTS, variant_nutrients
from app.engine.service import EngineInputs, generate_plan, prepare

DISEASES = ["diabetes", "hypertension", "cvd", "obesity", "ckd", "fatty_liver", "metabolic_syndrome", "arthritis"]
MED_GROUPS = [[], ["metformin"], ["metformin", "glimepiride"], ["insulin_premix"], ["dapagliflozin", "metformin"],
              ["telmisartan"], ["ramipril", "spironolactone"], ["amlodipine", "atorvastatin"], ["warfarin"],
              ["acenocoumarol", "metoprolol"], ["allopurinol", "colchicine"], ["prednisolone", "methotrexate"],
              ["levothyroxine", "ferrous_sulfate"], ["furosemide", "aspirin"]]
N_PATIENTS = 36


def random_patient(rng: random.Random, states: list[str]) -> tuple[dict, dict]:
    chosen = rng.sample(DISEASES, rng.randint(1, 4))
    diseases = {}
    for d in chosen:
        if d == "diabetes":
            diseases[d] = {"type": "type2"}
        elif d == "ckd":
            diseases[d] = {"stage": rng.choice([2, 3, 3, 4, 5])}
        elif d == "cvd":
            diseases[d] = {"type": rng.choice(["coronary", "stroke", "heart_failure"])}
        elif d == "arthritis":
            diseases[d] = {"type": rng.choice(["osteoarthritis", "rheumatoid", "gout"])}
        else:
            diseases[d] = {}
    labs = {}
    if rng.random() < 0.5:
        labs["potassium"] = round(rng.uniform(3.8, 5.6), 1)
    if rng.random() < 0.5:
        labs["phosphorus"] = round(rng.uniform(3.0, 5.5), 1)
    if rng.random() < 0.5:
        labs.update({"sbp": rng.randint(115, 170), "ldl": rng.randint(80, 190)})
    p = profile(
        age=rng.randint(30, 85), sex=rng.choice(["male", "female"]), height_cm=rng.randint(148, 182),
        weight_kg=rng.randint(48, 110), state=rng.choice(states), diet_type=rng.choice(["veg", "egg", "nonveg"]),
        no_pork=rng.random() < 0.5, allergies=rng.sample(["milk", "peanut", "gluten", "fish", "soy"], rng.randint(0, 1)),
        diseases=diseases, medicines=rng.choice(MED_GROUPS), activity=rng.choice(["sedentary", "light", "moderate"]),
    )
    return p, labs


def check_day(day: dict, st, k) -> None:
    ts = st.targets
    assert day["feasible"], "no plan for day"
    chosen = day["choice"]
    assert set(chosen) == {s for s, _, _ in DAY_SLOTS}
    totals: dict[str, float] = {}
    meal_carbs = {"breakfast": 0.0, "lunch": 0.0, "dinner": 0.0, "snack": 0.0}
    meal_of = {s: m for s, _, m in DAY_SLOTS}
    seen_nonstaple = []
    for slot, (dish_id, portion, salt, leach) in chosen.items():
        assert dish_id in st.safety.allowed, f"{dish_id} was removed by the safety filter"
        dish = k.dishes[dish_id]
        n = variant_nutrients(dish, portion, salt, leach)
        for key, v in n.items():
            totals[key] = totals.get(key, 0.0) + v
        meal_carbs[meal_of[slot]] += n["carb_g"]
        if dish["slot"] not in ("staple", "side"):
            seen_nonstaple.append(dish_id)
        if leach:
            assert ts.leaching
    assert len(seen_nonstaple) == len(set(seen_nonstaple)), "same dish twice in a day"
    tol = 1e-3
    for n, lim in ts.limits.items():
        if day["relaxed"]:
            if lim.max_hard is not None and lim.max_priority <= 2:
                assert totals[n] <= lim.max_hard + tol, (n, totals[n], lim.max_hard)
            continue
        if lim.max_hard is not None:
            assert totals[n] <= lim.max_hard + tol, (n, totals[n], lim.max_hard)
        if lim.min_hard is not None:
            assert totals[n] >= lim.min_hard - tol, (n, totals[n], lim.min_hard)
    if not day["relaxed"]:
        assert 0.85 * ts.energy_kcal - 1 <= totals["energy_kcal"] <= 1.15 * ts.energy_kcal + 1
    if ts.meal_carb_min:
        for m in ("breakfast", "lunch", "dinner"):
            assert meal_carbs[m] >= ts.meal_carb_min - tol, (m, meal_carbs[m])
    if ts.vitk_band:
        assert ts.vitk_band[0] - tol <= totals["vitk_ug"] <= ts.vitk_band[1] + tol
    if day["tier"] == 1:
        for (dish_id, *_rest) in chosen.values():
            d = k.dishes[dish_id]
            assert d["universal"] or st.ctx.zone in d["zones"] or \
                (st.ctx.second_zone and st.ctx.second_zone in d["zones"])


@pytest.mark.parametrize("seed", range(N_PATIENTS))
def test_random_patient_plans_respect_every_hard_limit(seed, k):
    rng = random.Random(1000 + seed)
    p, labs = random_patient(rng, sorted(k.states))
    inputs = EngineInputs(p, labs, [], [])
    st = prepare(inputs)
    plan = generate_plan(inputs, date(2026, 9, 21), days=2)
    for day in plan["days"]:
        check_day(day, st, k)
        # safety filter really ran on everything planned
        for m in day["meals"].values():
            for item in m:
                assert not safety.personal_blocks(st.ctx, k.dishes[item["dish_id"]])
