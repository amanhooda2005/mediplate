"""Admin console (U3): data, rules and model status."""
from __future__ import annotations

from collections import Counter

from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from .. import knowledge
from ..auth import admin_user
from ..db import MealLog, Plan, User, get_session

router = APIRouter(prefix="/api/admin", tags=["admin"])


@router.get("/overview")
def overview(_: User = Depends(admin_user), db: Session = Depends(get_session)) -> dict:
    k = knowledge.get()
    dishes = list(k.dishes.values())
    zone_slot: dict[str, Counter] = {}
    for d in dishes:
        keys = d["zones"] or (["common"] if d["common"] else ["universal"])
        for z in keys:
            zone_slot.setdefault(z, Counter())[d["slot"]] += 1
    return {
        "manifest": k.manifest,
        "counts": {
            "users": db.scalar(select(func.count(User.id))),
            "plans": db.scalar(select(func.count(Plan.id))),
            "meal_logs": db.scalar(select(func.count(MealLog.id))),
            "foods": len(k.foods), "dishes": len(dishes), "medicines": len(k.rules["medicines"]),
            "food_tags": len(k.rules["food_tags"]),
        },
        "coverage": {z: dict(c) for z, c in zone_slot.items()},
        "models": {"M1": k.heart_meta, "M2": {"status": "trained" if k.glucose_model else "glycemic-load + personal"}},
    }


@router.get("/dishes")
def dishes(_: User = Depends(admin_user)) -> list[dict]:
    k = knowledge.get()
    return [{"id": d["id"], "name": d["name"], "slot": d["slot"], "diet": d["diet"], "zones": d["zones"],
             "common": d["common"], "universal": d["universal"], "tags": d["tags"],
             "nutrients": {n: round(v, 1) for n, v in d["nutrients"].items()},
             "glycemic_load": d["glycemic_load"]} for d in k.dishes.values()]


@router.get("/rules")
def rules(_: User = Depends(admin_user)) -> dict:
    k = knowledge.get()
    return {"diseases": k.rules["diseases"], "drug_classes": k.rules["drug_classes"],
            "medicines": k.rules["medicines"],
            "food_tags": {t: len(c) for t, c in k.rules["food_tags"].items()}}


@router.post("/reload")
def reload(_: User = Depends(admin_user)) -> dict:
    k = knowledge.reload()
    return {"reloaded": True, "manifest": k.manifest}
