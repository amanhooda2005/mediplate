"""The whole patient journey through the HTTP API, plus access control and
input validation."""
import uuid

PROFILE = {
    "age": 61, "sex": "female", "height_cm": 152, "weight_kg": 68, "waist_cm": 90, "activity": "light",
    "state": "West Bengal", "diet_type": "nonveg", "no_beef": True, "no_pork": True, "allergies": ["shellfish"],
    "diseases": {"diabetes": {"type": "type2"}, "hypertension": {}, "ckd": {"stage": 3}},
    "medicines": ["metformin", "glimepiride", "losartan"], "smoker": False, "family_history_heart": True,
    "family_history_diabetes": 1, "exercise": "none",
    "labs": {"hba1c": 8.4, "sbp": 148, "dbp": 86, "ldl": 132, "creatinine": 1.3, "potassium": 5.3},
}


def register(client, lang="en"):
    email = f"user-{uuid.uuid4().hex[:8]}@example.com"
    r = client.post("/api/auth/register", json={"name": "Test", "email": email, "password": "password123",
                                                "language": lang})
    assert r.status_code == 201, r.text
    return {"Authorization": f"Bearer {r.json()['token']}"}, email


def test_health(client):
    assert client.get("/api/health").json()["status"] == "ok"


def test_register_login_and_duplicates(client):
    h, email = register(client)
    assert client.post("/api/auth/register", json={"name": "X", "email": email, "password": "password123"}
                       ).status_code == 409
    assert client.post("/api/auth/login", json={"email": email, "password": "wrong-pass"}).status_code == 401
    r = client.post("/api/auth/login", json={"email": email.upper(), "password": "password123"})
    assert r.status_code == 200
    me = client.get("/api/auth/me", headers=h).json()
    assert me["has_profile"] is False
    assert client.put("/api/auth/me", json={"language": "hi"}, headers=h).json()["language"] == "hi"


def test_requires_login(client):
    assert client.get("/api/profile").status_code == 401
    assert client.get("/api/profile", headers={"Authorization": "Bearer nonsense"}).status_code == 401


def test_plan_needs_profile(client):
    h, _ = register(client)
    r = client.post("/api/plans/generate", json={"days": 1}, headers=h)
    assert r.status_code == 409


def test_profile_validation(client):
    h, _ = register(client)
    bad = {**PROFILE, "age": 25}
    assert client.put("/api/profile", json=bad, headers=h).status_code == 422
    bad = {**PROFILE, "state": "Atlantis"}
    r = client.put("/api/profile", json=bad, headers=h)
    assert r.status_code == 422 and "state" in r.json()["detail"].lower()
    bad = {**PROFILE, "medicines": ["unknownium"]}
    assert client.put("/api/profile", json=bad, headers=h).status_code == 422
    bad = {**PROFILE, "labs": {"potassium": 42}}
    assert client.put("/api/profile", json=bad, headers=h).status_code == 422


def test_full_journey(client):
    h, _ = register(client, "ta")
    r = client.put("/api/profile", json=PROFILE, headers=h)
    assert r.status_code == 200, r.text
    assert r.json()["labs"]["potassium"] == 5.3

    r = client.post("/api/plans/generate", json={"start": "2026-09-21", "days": 3}, headers=h)
    assert r.status_code == 201, r.text
    plan = r.json()
    assert len(plan["days"]) == 3 and all(d["feasible"] for d in plan["days"])
    t = plan["targets"]
    assert t["limits"]["potassium_mg"]["max_hard"] == 2000      # potassium 5.3 + losartan
    assert t["meal_carb_min"] == 30                               # glimepiride
    for d in plan["days"]:
        for c in d["checks"]:
            assert c["status"] not in ("over", "under"), c
        for m in d["meals"].values():
            for i in m:
                assert "shellfish" not in " ".join(i["tags"])
                assert i["region"]["key"] in ("region_home", "region_universal", "region_second")

    cur = client.get("/api/plans/current", headers=h).json()
    assert cur["id"] == plan["id"]

    before = plan["days"][0]["choice"]["dinner_protein"][0]
    r = client.post("/api/plans/current/swap", json={"day_index": 0, "slot": "dinner_protein"}, headers=h)
    assert r.status_code == 200, r.text
    after = r.json()["days"][0]["choice"]["dinner_protein"][0]
    assert after != before
    assert all(c["status"] not in ("over", "under") for c in r.json()["days"][0]["checks"])
    assert client.post("/api/plans/current/swap", json={"day_index": 0, "slot": "nope"}, headers=h).status_code == 422

    r = client.get("/api/foods/search", params={"q": "fish"}, headers=h)
    assert r.status_code == 200 and len(r.json()) > 0
    r = client.post("/api/foods/check", json={"item_type": "dish", "id": "coconut_water"}, headers=h)
    assert r.json()["verdict"] in ("avoid", "limit")
    assert client.post("/api/foods/check", json={"item_type": "dish", "id": "nope"}, headers=h).status_code == 404

    day0 = plan["days"][0]
    bf = day0["meals"]["breakfast"][0]["dish_id"]
    r = client.post("/api/logs/meals", json={"day": day0["date"], "slot": "breakfast", "dish_id": bf,
                                             "status": "ate", "rating": 1}, headers=h)
    assert r.status_code == 201
    r = client.post("/api/logs/meals", json={"day": day0["date"], "slot": "breakfast", "dish_id": bf,
                                             "status": "skipped", "rating": -1}, headers=h)
    assert r.json()["status"] == "skipped"                        # same slot -> updated, not duplicated
    for meal, (b, a) in {"breakfast": (110, 160), "lunch": (105, 170), "dinner": (115, 175)}.items():
        r = client.post("/api/logs/glucose", json={"day": day0["date"], "meal": meal, "before": b, "after": a},
                        headers=h)
        assert r.status_code == 201, r.text
    ad = client.get("/api/logs/adherence", headers=h).json()
    assert ad["logged"] == 1 and len(ad["readings"]) == 3

    ins = client.get("/api/insights", headers=h).json()
    assert ins["context"]["glucose_personal"] is True             # 3 readings -> personal model
    assert any(i["id"] == "potassium" for i in ins["insights"])

    r = client.post("/api/labs", json={"kind": "creatinine", "value": 1.6}, headers=h)
    assert r.status_code == 201
    s = client.get("/api/labs/series", headers=h).json()
    assert len(s["creatinine"]) == 2 and len(s["egfr"]) == 2
    assert client.post("/api/labs", json={"kind": "creatinine", "value": 99}, headers=h).status_code == 422

    # regenerate uses the learned dislike and the new lab result
    r = client.post("/api/plans/generate", json={"days": 2}, headers=h)
    assert r.status_code == 201
    ids = {i["dish_id"] for d in r.json()["days"] for m in d["meals"].values() for i in m}
    assert bf not in ids


def test_admin(client):
    h, _ = register(client)
    assert client.get("/api/admin/overview", headers=h).status_code == 403
    r = client.post("/api/auth/login", json={"email": "admin@mediplate.in", "password": "ChangeMe!2026"})
    a = {"Authorization": f"Bearer {r.json()['token']}"}
    ov = client.get("/api/admin/overview", headers=a).json()
    assert ov["counts"]["dishes"] >= 180
    assert len(client.get("/api/admin/dishes", headers=a).json()) == ov["counts"]["dishes"]
    assert "diseases" in client.get("/api/admin/rules", headers=a).json()
    assert client.post("/api/admin/reload", headers=a).json()["reloaded"] is True


def test_meta(client):
    m = client.get("/api/meta").json()
    assert "Tamil Nadu" in m["states"] and m["state_zone"]["Tamil Nadu"] == "south"
    assert len(m["medicines"]) >= 60 and "tier_1" in m["messages"]
