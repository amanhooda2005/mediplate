"""Food check - one unified, prioritised alert for any dish or food.

Every rule that could apply (diet, allergy, each condition, each medicine, each
daily limit, glycemic load, vitamin K band) is evaluated. Alerts that concern
the same thing are merged (e.g. salt flagged by both blood pressure and kidney
disease becomes one alert naming both, using the strictest limit), then sorted
by severity so the patient sees the most important point first.
"""
from __future__ import annotations

from .. import knowledge
from ..knowledge import msg
from .glycemic import describe
from .safety import personal_blocks, rule_hits
from .service import EngineState
from .targets import UNITS

SEVERITY_RANK = {"avoid": 0, "limit": 1, "info": 2}
SHARE_NUTRIENTS = ["sodium_mg", "potassium_mg", "phosphorus_mg", "sugar_g", "satfat_g", "protein_g", "carb_g"]


def _food_as_dish(code: str, grams: float) -> dict:
    """Wrap a single IFCT/supplement food so it can be checked like a dish."""
    k = knowledge.get()
    food = k.foods[code]
    tags = {t for t, members in k.tag_members.items() if code in members}
    n = {key: v * grams / 100.0 for key, v in food["per100"].items()}
    return {
        "id": f"food:{code}", "name": food["name"], "name_ta": food["name"], "name_hi": food["name"],
        "slot": "food", "diet": food["diet"], "tags": sorted(tags),
        "ingredients": [{"code": code, "grams": grams, "name": food["name"]}],
        "nutrients": n, "glycemic_load": food["per100"]["carb_g"] * grams / 100.0 * food["gi"] / 100.0,
        "glycemic_index": food["gi"], "grams": grams,
    }


def check(state: EngineState, item_type: str, item_id: str, grams: float | None = None,
          portion: float = 1.0) -> dict:
    k = knowledge.get()
    if item_type == "dish":
        dish = k.dishes.get(item_id)
        if dish is None:
            raise KeyError("Unknown dish")
        nutrients = {n: v * portion for n, v in dish["nutrients"].items()}
        gl = dish["glycemic_load"] * portion
        serving_g = round(dish["grams"] * portion)
    elif item_type == "food":
        if item_id not in k.foods:
            raise KeyError("Unknown food")
        grams = grams or 100.0
        dish = _food_as_dish(item_id, grams)
        nutrients = dish["nutrients"]
        gl = dish["glycemic_load"]
        serving_g = round(grams)
    else:
        raise ValueError("item_type must be dish or food")

    ctx, ts = state.ctx, state.targets
    alerts: dict[str, dict] = {}

    def add(category: str, severity: str, message: dict, source: str, priority: int) -> None:
        cur = alerts.get(category)
        if cur is None:
            alerts[category] = {"category": category, "severity": severity, "message": message,
                                "sources": [source], "priority": priority}
            return
        if source not in cur["sources"]:
            cur["sources"].append(source)
        if (SEVERITY_RANK[severity], priority) < (SEVERITY_RANK[cur["severity"]], cur["priority"]):
            cur.update(severity=severity, message=message, priority=priority)

    for m in personal_blocks(ctx, dish):
        add(f"personal:{m['key']}", "avoid", m, "you", 0)
    avoid, limit = rule_hits(ctx, dish)
    for a in avoid:
        add(f"rule:{a['message']['key']}", "avoid", a["message"], a["source"], 1)
    for a in limit:
        add(f"rule:{a['message']['key']}", "limit", a["message"], a["source"], 2)

    # share of each daily limit in one serving
    for n in SHARE_NUTRIENTS:
        lim = ts.limits.get(n)
        if lim is None or lim.upper is None or lim.upper <= 0:
            continue
        v = nutrients.get(n, 0.0)
        share = v / lim.upper
        if share < 0.4:
            continue
        hard = lim.max_hard is not None
        severity = "avoid" if (hard and share >= 0.9) else "limit"
        sources = lim.max_sources or ["general"]
        text = msg("serving_share", nutrient=f"@n_{n}", value=f"{_fmt(v, n)}", pct=round(share * 100))
        for s in sources:
            add(f"nutrient:{n}", severity, text, s, lim.max_priority)

    if ts.vitk_band and nutrients.get("vitk_ug", 0.0) > ts.vitk_band[1] * 0.6:
        sev = "avoid" if nutrients["vitk_ug"] > ts.vitk_band[1] else "limit"
        add("nutrient:vitk_ug", sev, msg("vitk_high_serving", value=round(nutrients["vitk_ug"])),
            ctx.med_classes.get("vka", ["warfarin"])[0], 1)

    glyc = None
    if ts.glycemic_focus:
        glyc = describe(gl, state.glucose)
        if glyc["level"] == "high":
            add("glycemic", "limit", glyc["message"], "diabetes" if ctx.has("diabetes") else "metabolic_syndrome", 3)
        elif glyc["level"] == "medium" and glyc["message"]:
            add("glycemic", "info", glyc["message"], "diabetes" if ctx.has("diabetes") else "metabolic_syndrome", 4)

    if "fried" in dish["tags"]:
        add("fried", "info", msg("fried_note"), "general", 5)
    if "sweet" in dish["tags"] and not any(a.startswith("rule:sweet") for a in alerts):
        add("sweet", "info", msg("sweet_note"), "general", 5)

    ordered = sorted(alerts.values(), key=lambda a: (SEVERITY_RANK[a["severity"]], a["priority"]))
    for a in ordered:
        a["source_labels"] = [_source_msg(s) for s in a["sources"]]
    worst = ordered[0]["severity"] if ordered else "ok"
    verdict = {"avoid": "avoid", "limit": "limit", "info": "ok", "ok": "ok"}[worst]
    return {
        "item_type": item_type, "id": item_id, "name": dish["name"],
        "name_ta": dish.get("name_ta", dish["name"]), "name_hi": dish.get("name_hi", dish["name"]),
        "serving_g": serving_g, "portion": portion,
        "verdict": verdict, "verdict_message": msg(f"verdict_{verdict}"),
        "alerts": ordered,
        "nutrients": {n: round(v, 1) for n, v in nutrients.items()
                      if n in ("energy_kcal", "protein_g", "carb_g", "fat_g", "satfat_g", "fiber_g", "sugar_g",
                               "sodium_mg", "potassium_mg", "phosphorus_mg", "vitk_ug")},
        "glycemic": glyc,
        "ingredients": dish["ingredients"],
    }


def _fmt(v: float, n: str) -> str:
    unit = UNITS[n]
    return f"{round(v):,} {unit}" if unit in ("mg", "kcal", "µg") else f"{round(v, 1):g} {unit}"


def _source_msg(source: str) -> dict:
    k = knowledge.get()
    if source in k.rules["diseases"]:
        return msg(f"d_{source}")
    if source in k.medicine_by_id:
        return {"key": None, "params": {}, "text": k.medicine_by_id[source]["name"]}
    if source == "you":
        return {"key": None, "params": {}, "text": "Your settings"}
    if source == "risk_heart":
        return msg("d_cvd")
    return msg("d_general")


def search(query: str, limit: int = 25) -> list[dict]:
    """Search dishes (English, Tamil, Hindi names) and IFCT foods (English and
    local-language names). Dishes rank first."""
    k = knowledge.get()
    q = query.strip().lower()
    if len(q) < 2:
        return []
    results = []
    for d in k.dishes.values():
        if d["slot"] == "side" and d["id"] == "no_side":
            continue
        hay = " ".join([d["name"], d["name_ta"], d["name_hi"], d["id"].replace("_", " ")]).lower()
        if q in hay:
            score = 0 if d["name"].lower().startswith(q) else 1
            results.append((score, d["name"], {"type": "dish", "id": d["id"], "name": d["name"],
                                                "name_ta": d["name_ta"], "name_hi": d["name_hi"],
                                                "slot": d["slot"]}))
    for f in k.foods.values():
        hay = (f["name"] + " " + f["local_names"]).lower()
        if q in hay:
            score = 2 if f["name"].lower().startswith(q) else 3
            results.append((score, f["name"], {"type": "food", "id": f["code"], "name": f["name"],
                                                "group": f["group"], "local_names": f["local_names"][:120]}))
    results.sort(key=lambda r: (r[0], r[1]))
    return [r[2] for r in results[:limit]]
