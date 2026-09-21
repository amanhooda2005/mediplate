"""The pipeline outputs are complete, consistent and connected."""
from collections import Counter

NUTRIENTS = ["energy_kcal", "protein_g", "fat_g", "carb_g", "fiber_g", "satfat_g", "sugar_g", "sodium_mg",
             "potassium_mg", "phosphorus_mg", "vitk_ug"]


def test_counts(k):
    assert len(k.foods) >= 550
    assert len(k.dishes) >= 180
    assert len(k.rules["medicines"]) >= 60
    assert k.manifest["foods"] == len(k.foods)
    assert k.manifest["dishes"] == len(k.dishes)


def test_every_ingredient_resolves_and_nutrients_valid(k):
    for d in k.dishes.values():
        for ing in d["ingredients"]:
            assert ing["code"] in k.foods, (d["id"], ing["code"])
        for n in NUTRIENTS:
            v = d["nutrients"][n]
            assert v == v and v >= -1e-9, (d["id"], n, v)
        assert d["sodium_from_salt_mg"] <= d["nutrients"]["sodium_mg"] + 1e-6
        assert d["potassium_leachable_mg"] <= d["nutrients"]["potassium_mg"] + 1e-6


def test_energy_matches_macros(k):
    for f in k.foods.values():
        p = f["per100"]
        atwater = 4 * p["protein_g"] + 9 * p["fat_g"] + 4 * p["carb_g"] + 2 * p["fiber_g"]
        assert abs(p["energy_kcal"] - atwater) <= max(40, 0.25 * atwater), f["code"]


def test_messages_complete(k):
    for key, entry in k.messages.items():
        assert set(entry) == {"en", "ta", "hi"}, key


def test_every_zone_can_feed_every_diet(k):
    """Each zone offers at least two choices per plan slot for vegetarians."""
    for zone in k.zones:
        count = Counter()
        for d in k.dishes.values():
            if d["diet"] != "veg":
                continue
            if zone in d["zones"] or d["universal"]:
                count[d["slot"]] += 1
        for slot in ("breakfast", "staple", "protein", "veg", "side", "snack"):
            assert count[slot] >= 2, (zone, slot, count[slot])


def test_every_state_has_a_zone(k):
    assert len(k.states) == 36
    assert set(k.states.values()) <= set(k.zones)


def test_heart_model_loaded(k):
    auc = k.heart_meta["scores"][k.heart_meta["chosen"]]["auc_mean"]
    assert 0.65 < auc < 0.95
