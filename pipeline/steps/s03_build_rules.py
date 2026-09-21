"""Step 3 - Compile the rules knowledge base (D3).

Reads the hand-built YAML rule files, checks every rule against a strict
schema (so a typo can never silently disable a safety rule), expands food tags
into concrete ingredient codes, and writes rules.json + messages.json.
"""
from __future__ import annotations

import sys
from pathlib import Path

import yaml

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from common import BACKEND_DATA, NUTRIENTS, SOURCES, log, read_json, write_json  # noqa: E402

RULES_DIR = SOURCES / "rules"
LANGS = ("en", "ta", "hi")
CONDITION_FIELDS = {
    "ckd_stage": (int, float), "dialysis": (bool,), "serum_potassium": (int, float),
    "serum_phosphorus": (int, float), "cvd_type": (str,), "arthritis_type": (str,),
    "diabetes_type": (str,), "bmi": (int, float), "age": (int, float),
}
OPS = {"==", "!=", ">", ">=", "<", "<=", "in"}
AMOUNT_KEYS = ("value", "per_kg", "pct_energy", "per_1000kcal")
DISEASES = ("diabetes", "hypertension", "cvd", "obesity", "ckd", "fatty_liver",
            "metabolic_syndrome", "arthritis")
DISEASE_ALERT_CONDITIONS = set(DISEASES) | {"heart_failure"}
TIMINGS = {"before_breakfast", "with_breakfast", "with_meals", "bedtime", "any"}


class RuleError(ValueError):
    pass


def _load(name: str):
    with open(RULES_DIR / name, encoding="utf-8") as fh:
        return yaml.safe_load(fh)


def expand_tags(tag_specs: dict, foods: list[dict]) -> dict[str, list[str]]:
    codes = [f["code"] for f in foods]
    by_code = {f["code"]: f for f in foods}
    out: dict[str, list[str]] = {}
    for tag, spec in tag_specs.items():
        members: set[str] = set()
        for code in spec.get("codes", []):
            if code not in by_code:
                raise RuleError(f"food tag {tag}: unknown code {code}")
            members.add(code)
        for prefix in spec.get("prefixes", []):
            members.update(c for c in codes if c.startswith(prefix) and not c.startswith("SUP"))
        for lo, hi in spec.get("ranges", []):
            if lo not in by_code or hi not in by_code:
                raise RuleError(f"food tag {tag}: bad range {lo}-{hi}")
            members.update(c for c in codes if lo <= c <= hi and c[0] == lo[0] and not c.startswith("SUP"))
        for group in spec.get("groups", []):
            hit = [c for c in codes if by_code[c]["group"] == group]
            if not hit:
                raise RuleError(f"food tag {tag}: group '{group}' matches nothing")
            members.update(hit)
        if not members:
            raise RuleError(f"food tag {tag} matches no foods")
        out[tag] = sorted(members)
    return out


def check_conditions(conds, where: str) -> None:
    if conds is None:
        return
    if not isinstance(conds, list):
        raise RuleError(f"{where}: conditions must be a list")
    for c in conds:
        if set(c) != {"field", "op", "value"}:
            raise RuleError(f"{where}: condition needs field/op/value, got {c}")
        if c["field"] not in CONDITION_FIELDS:
            raise RuleError(f"{where}: unknown condition field {c['field']}")
        if c["op"] not in OPS:
            raise RuleError(f"{where}: unknown operator {c['op']}")


def check_target(t: dict, where: str, messages: dict) -> None:
    if t.get("nutrient") not in NUTRIENTS:
        raise RuleError(f"{where}: unknown nutrient {t.get('nutrient')}")
    if t.get("bound") not in ("min", "max"):
        raise RuleError(f"{where}: bound must be min or max")
    amounts = [k for k in AMOUNT_KEYS if k in t]
    if len(amounts) != 1:
        raise RuleError(f"{where}: exactly one of {AMOUNT_KEYS} required")
    if not isinstance(t.get("hard"), bool):
        raise RuleError(f"{where}: hard must be true/false")
    if t.get("priority") not in (1, 2, 3, 4, 5):
        raise RuleError(f"{where}: priority must be 1-5")
    check_message(t.get("reason"), where, messages)
    check_conditions(t.get("when"), where)
    check_conditions(t.get("when_any"), where)


def check_message(key, where: str, messages: dict) -> None:
    if key not in messages:
        raise RuleError(f"{where}: message key '{key}' missing from messages.yaml")


def check_avoid(a: dict, where: str, messages: dict, tags: dict) -> None:
    targets = [k for k in ("tag", "dish_tag", "dish", "codes") if k in a]
    if len(targets) != 1:
        raise RuleError(f"{where}: avoid needs one of tag/dish_tag/dish/codes")
    if "tag" in a and a["tag"] not in tags:
        raise RuleError(f"{where}: unknown food tag {a['tag']}")
    if a.get("severity") not in ("avoid", "limit"):
        raise RuleError(f"{where}: severity must be avoid or limit")
    check_message(a.get("reason"), where, messages)
    check_conditions(a.get("when"), where)
    check_conditions(a.get("when_any"), where)


def validate_messages(messages: dict) -> None:
    for key, texts in messages.items():
        if not isinstance(texts, dict) or set(texts) != set(LANGS):
            raise RuleError(f"message {key} must have exactly {LANGS}")


def validate_diseases(diseases: dict, messages: dict, tags: dict) -> None:
    if set(diseases) != set(DISEASES):
        raise RuleError(f"diseases.yaml must define exactly {DISEASES}")
    for did, d in diseases.items():
        check_message(f"d_{did}", f"disease {did}", messages)
        for i, t in enumerate(d.get("targets", [])):
            check_target(t, f"{did}.targets[{i}]", messages)
        for i, a in enumerate(d.get("avoid", [])):
            check_avoid(a, f"{did}.avoid[{i}]", messages, tags)
        for kind in ("prefer", "penalize"):
            for i, p in enumerate(d.get(kind, [])):
                if not (("tag" in p) ^ ("dish_tag" in p)):
                    raise RuleError(f"{did}.{kind}[{i}]: needs tag or dish_tag")
                if "tag" in p and p["tag"] not in tags:
                    raise RuleError(f"{did}.{kind}[{i}]: unknown tag {p['tag']}")
                if not isinstance(p.get("weight"), (int, float)):
                    raise RuleError(f"{did}.{kind}[{i}]: weight required")
                check_message(p.get("reason"), f"{did}.{kind}[{i}]", messages)
                check_conditions(p.get("when"), f"{did}.{kind}[{i}]")
        for i, adv in enumerate(d.get("advice", [])):
            key = adv if isinstance(adv, str) else adv.get("key")
            check_message(key, f"{did}.advice[{i}]", messages)
            if isinstance(adv, dict):
                check_conditions(adv.get("when"), f"{did}.advice[{i}]")


def validate_drugs(drugs: dict, messages: dict, tags: dict) -> None:
    classes = drugs["classes"]
    for cid, c in classes.items():
        if c.get("timing") not in TIMINGS:
            raise RuleError(f"class {cid}: bad timing {c.get('timing')}")
        for i, e in enumerate(c.get("effects", [])):
            where = f"class {cid}.effects[{i}]"
            kinds = [k for k in ("nutrient", "meal_carb_min", "vitk_band", "avoid", "disease_alert", "advice") if k in e]
            if len(kinds) != 1:
                raise RuleError(f"{where}: exactly one effect type expected, got {kinds}")
            kind = kinds[0]
            if kind == "nutrient":
                check_target(e["nutrient"], where, messages)
            elif kind == "meal_carb_min":
                check_message(e.get("reason"), where, messages)
            elif kind == "vitk_band":
                band = e["vitk_band"]
                if not (0 <= band["min"] < band["max"]):
                    raise RuleError(f"{where}: bad vitamin K band")
                check_message(e.get("reason"), where, messages)
            elif kind == "avoid":
                spec = dict(e["avoid"])
                spec["severity"] = e.get("severity")
                spec["reason"] = e.get("reason")
                check_avoid(spec, where, messages, tags)
            elif kind == "disease_alert":
                da = e["disease_alert"]
                if da.get("condition") not in DISEASE_ALERT_CONDITIONS:
                    raise RuleError(f"{where}: unknown condition {da.get('condition')}")
                if da.get("severity") not in ("high", "medium"):
                    raise RuleError(f"{where}: severity must be high or medium")
                check_message(da.get("reason"), where, messages)
            elif kind == "advice":
                check_message(e["advice"], where, messages)
    ids = set()
    for m in drugs["medicines"]:
        if m["class"] not in classes:
            raise RuleError(f"medicine {m['id']}: unknown class {m['class']}")
        if m["id"] in ids:
            raise RuleError(f"duplicate medicine id {m['id']}")
        ids.add(m["id"])


def main() -> dict:
    foods = read_json(BACKEND_DATA / "foods.json")
    messages = _load("messages.yaml")
    validate_messages(messages)
    tags = expand_tags(_load("food_tags.yaml"), foods)
    diseases = _load("diseases.yaml")
    drugs = _load("drugs.yaml")
    validate_diseases(diseases, messages, tags)
    validate_drugs(drugs, messages, tags)
    regions = read_json(SOURCES / "regions.json")
    rules = {
        "version": "1.0",
        "food_tags": tags,
        "diseases": diseases,
        "drug_classes": drugs["classes"],
        "medicines": drugs["medicines"],
        "regions": {"zones": regions["zones"], "states": regions["states"]},
    }
    write_json(BACKEND_DATA / "rules.json", rules)
    write_json(BACKEND_DATA / "messages.json", messages)
    log("rules", f"{len(tags)} food tags, {len(diseases)} diseases, {len(drugs['classes'])} medicine classes, "
                 f"{len(drugs['medicines'])} medicines, {len(messages)} messages -> rules.json")
    return rules


if __name__ == "__main__":
    main()
