"""Public reference data the website needs to build its forms."""
from __future__ import annotations

from fastapi import APIRouter

from .. import knowledge
from ..engine.profile import LAB_KINDS
from ..schemas import LAB_RANGES

router = APIRouter(prefix="/api/meta", tags=["meta"])

CONDITION_OPTIONS = {
    "diabetes": {"type": ["type2", "type1"]},
    "cvd": {"type": ["coronary", "stroke", "heart_failure"]},
    "ckd": {"stage": [1, 2, 3, 4, 5], "dialysis": [False, True]},
    "arthritis": {"type": ["osteoarthritis", "rheumatoid", "gout"]},
}


@router.get("")
def meta() -> dict:
    k = knowledge.get()
    return {
        "states": sorted(k.states),
        "state_zone": k.states,
        "zones": {z: v["label"] for z, v in k.zones.items()},
        "conditions": [{"id": d, "options": CONDITION_OPTIONS.get(d, {})} for d in k.rules["diseases"]],
        "medicines": [{"id": m["id"], "name": m["name"],
                       "class_label": k.rules["drug_classes"][m["class"]]["label"]} for m in k.rules["medicines"]],
        "allergens": ["milk", "peanut", "treenut", "gluten", "egg", "fish", "shellfish", "soy", "sesame"],
        "labs": [{"kind": kind, "unit": unit, "min": LAB_RANGES[kind][0], "max": LAB_RANGES[kind][1]}
                 for kind, unit in LAB_KINDS.items()],
        "messages": k.messages,
        "manifest": k.manifest,
    }
