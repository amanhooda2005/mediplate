"""Targets, conflict ledger, safety filter, ranker and region rules."""
from datetime import date

from conftest import profile

from app.engine import ranker, safety, targets
from app.engine.profile import build_context
from app.engine.service import EngineInputs, generate_plan, prepare


def ts_for(p, labs=None):
    ctx = build_context(p, labs or {})
    return ctx, targets.build_targets(ctx)


def test_ckd4_potassium_beats_hypertension_dash():
    ctx, ts = ts_for(profile(diseases={"hypertension": {}, "ckd": {"stage": 4}}))
    k = ts.limits["potassium_mg"]
    assert k.max_hard == 2000 and k.min_soft is None
    assert any(e["key"] == "conflict" and e["params"]["winner"] == "@d_ckd" for e in ts.ledger)


def test_ckd_protein_cap_uses_reference_weight():
    ctx, ts = ts_for(profile(height_cm=160, weight_kg=90, diseases={"ckd": {"stage": 3}}))
    assert ts.limits["protein_g"].max_hard == round(0.8 * ctx.reference_weight, 1) or \
        abs(ts.limits["protein_g"].max_hard - 0.8 * ctx.reference_weight) < 0.2


def test_dialysis_needs_more_protein():
    _, ts = ts_for(profile(diseases={"ckd": {"stage": 5, "dialysis": True}}))
    assert ts.limits["protein_g"].min_soft is not None and ts.limits["protein_g"].max_hard is None


def test_sglt2_sets_carb_floor():
    _, ts = ts_for(profile(diseases={"diabetes": {"type": "type2"}}, medicines=["empagliflozin"]))
    assert ts.limits["carb_g"].min_hard == 130


def test_sulfonylurea_sets_meal_carb_floor():
    _, ts = ts_for(profile(diseases={"diabetes": {"type": "type2"}}, medicines=["glimepiride"]))
    assert ts.meal_carb_min == 30


def test_warfarin_band_and_natto():
    ctx, ts = ts_for(profile(state="Manipur", diet_type="nonveg", medicines=["warfarin"]))
    assert ts.vitk_band == (50.0, 150.0)
    sr = safety.screen(ctx, ts)
    assert "hawaijar" in sr.removed and "axone_pork" in sr.removed


def test_arb_potassium_only_with_kidney_or_high_potassium():
    _, ts = ts_for(profile(diseases={"hypertension": {}}, medicines=["telmisartan"]))
    assert "potassium_mg" not in ts.limits or ts.limits["potassium_mg"].max_hard is None
    _, ts2 = ts_for(profile(diseases={"hypertension": {}}, medicines=["telmisartan"]), {"potassium": 5.4})
    assert ts2.limits["potassium_mg"].max_hard == 2000


def test_nsaid_with_ckd_alert():
    _, ts = ts_for(profile(diseases={"ckd": {"stage": 3}}, medicines=["diclofenac"]))
    assert any(a["message"]["key"] == "nsaid_ckd" and a["severity"] == "high" for a in ts.alerts)


def test_gout_removes_high_purine():
    ctx, ts = ts_for(profile(diet_type="nonveg", diseases={"arthritis": {"type": "gout"}}))
    sr = safety.screen(ctx, ts)
    assert "mackerel_curry" in sr.removed


def test_vegetarian_and_allergy_filter(k):
    ctx, ts = ts_for(profile(diet_type="veg", allergies=["milk", "peanut"]))
    sr = safety.screen(ctx, ts)
    for did in sr.allowed:
        d = k.dishes[did]
        assert d["diet"] == "veg"
        assert "allergen_milk" not in d["tags"] and "allergen_peanut" not in d["tags"]


def test_no_beef_no_pork(k):
    ctx, ts = ts_for(profile(diet_type="nonveg", no_beef=True, no_pork=True, state="Nagaland"))
    sr = safety.screen(ctx, ts)
    assert all("pork" not in k.dishes[d]["tags"] and "beef" not in k.dishes[d]["tags"] for d in sr.allowed)


def test_ckd_removes_coconut_water():
    ctx, ts = ts_for(profile(diseases={"ckd": {"stage": 4}}))
    assert "coconut_water" in safety.screen(ctx, ts).removed


def test_ranker_learns_dislike():
    prefs = ranker.learn([{"dish_id": "pavakkai_poriyal", "status": "skipped", "rating": -1}] * 2)
    assert prefs.bonus("pavakkai_poriyal") < 0
    assert "pavakkai_poriyal" in prefs.disliked


def test_disliked_dish_not_planned():
    p = profile(diseases={"diabetes": {"type": "type2"}})
    logs = [{"dish_id": "idli_sambar", "status": "skipped", "rating": -1}] * 3
    plan = generate_plan(EngineInputs(p, {}, logs, []), date(2026, 9, 21), days=2)
    ids = {i["dish_id"] for d in plan["days"] for m in d["meals"].values() for i in m}
    assert "idli_sambar" not in ids


def test_home_region_first(k):
    for state, zone in (("Punjab", "north"), ("Kerala", "south"), ("West Bengal", "east"), ("Gujarat", "west"),
                        ("Assam", "northeast")):
        plan = generate_plan(EngineInputs(profile(state=state, diet_type="nonveg"), {}, [], []),
                             date(2026, 9, 21), days=2)
        for d in plan["days"]:
            assert d["tier"] == 1, (state, d["tier"])
            for m in d["meals"].values():
                for i in m:
                    assert i["origin"] in ("home", "second", "universal"), (state, i["dish_id"], i["origin"])
                    dish = k.dishes[i["dish_id"]]
                    assert dish["universal"] or zone in dish["zones"]


def test_prepare_counts():
    st = prepare(EngineInputs(profile(), {}, [], []))
    assert len(st.safety.allowed) > 100
