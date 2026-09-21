from conftest import profile

from app.engine import foodcheck
from app.engine.service import EngineInputs, prepare



def test_salt_alert_merged_across_conditions():
    st = prepare(EngineInputs(profile(diseases={"hypertension": {}, "ckd": {"stage": 4}}), {}, [], []))
    r = foodcheck.check(st, "dish", "misal_bhakri", portion=1.5)
    sodium = [a for a in r["alerts"] if a["category"] == "nutrient:sodium_mg"]
    assert len(sodium) == 1
    assert set(sodium[0]["sources"]) >= {"ckd", "hypertension"}


def test_verdict_order_and_ckd_coconut():
    st = prepare(EngineInputs(profile(diseases={"ckd": {"stage": 4}}), {}, [], []))
    r = foodcheck.check(st, "dish", "coconut_water")
    assert r["verdict"] == "avoid"
    ranks = [foodcheck.SEVERITY_RANK[a["severity"]] for a in r["alerts"]]
    assert ranks == sorted(ranks)


def test_star_fruit_raw_food_ckd():
    st = prepare(EngineInputs(profile(diseases={"ckd": {"stage": 3}}), {}, [], []))
    r = foodcheck.check(st, "food", "E062", grams=100)
    assert r["verdict"] == "avoid"
    assert any(a["message"]["key"] == "star_fruit_ckd" for a in r["alerts"])


def test_pummelo_with_simvastatin():
    st = prepare(EngineInputs(profile(medicines=["simvastatin"]), {}, [], []))
    r = foodcheck.check(st, "dish", "fruit_pummelo")
    assert r["verdict"] == "avoid"


def test_sweets_limited_for_diabetes():
    st = prepare(EngineInputs(profile(diseases={"diabetes": {"type": "type2"}}), {}, [], []))
    r = foodcheck.check(st, "dish", "gulab_jamun")
    assert r["verdict"] in ("limit", "avoid")
    assert r["glycemic"]["level"] == "high"


def test_healthy_dish_fits():
    st = prepare(EngineInputs(profile(), {}, [], []))
    assert foodcheck.check(st, "dish", "beans_poriyal")["verdict"] == "ok"


def test_search_languages():
    assert any(r["id"] == "idli_sambar" for r in foodcheck.search("idli"))
    assert any(r["id"] == "rajma" for r in foodcheck.search("राजमा"))
    assert any(r["id"] == "sambar" for r in foodcheck.search("சாம்பார்"))
    assert any(r["type"] == "food" and r["id"] == "A015" for r in foodcheck.search("arisi"))
