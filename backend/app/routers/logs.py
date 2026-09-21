from __future__ import annotations

from datetime import date, timedelta

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from .. import knowledge
from ..auth import current_user
from ..db import MealLog, User, get_session
from ..inputs import active_plan
from ..schemas import GlucoseIn, MealLogIn

router = APIRouter(prefix="/api/logs", tags=["logs"])


def log_out(m: MealLog) -> dict:
    return {"id": m.id, "day": m.day.isoformat(), "slot": m.slot, "dish_id": m.dish_id, "portion": m.portion,
            "status": m.status, "rating": m.rating, "glucose_before": m.glucose_before,
            "glucose_after": m.glucose_after, "meal_gl": m.meal_gl}


@router.post("/meals", status_code=201)
def log_meal(body: MealLogIn, user: User = Depends(current_user), db: Session = Depends(get_session)) -> dict:
    if body.dish_id not in knowledge.get().dishes:
        raise HTTPException(status_code=422, detail="Unknown dish.")
    if body.day > date.today() + timedelta(days=1):
        raise HTTPException(status_code=422, detail="You cannot log meals in the future.")
    existing = db.execute(select(MealLog).where(MealLog.user_id == user.id, MealLog.day == body.day,
                                                MealLog.slot == body.slot)).scalars().first()
    if existing and existing.status != "reading":
        existing.dish_id, existing.portion = body.dish_id, body.portion
        existing.status, existing.rating = body.status, body.rating
        db.commit()
        return log_out(existing)
    m = MealLog(user_id=user.id, day=body.day, slot=body.slot, dish_id=body.dish_id, portion=body.portion,
                status=body.status, rating=body.rating)
    db.add(m)
    db.commit()
    return log_out(m)


@router.post("/glucose", status_code=201)
def log_glucose(body: GlucoseIn, user: User = Depends(current_user), db: Session = Depends(get_session)) -> dict:
    """Before/after-meal readings. The meal's glycemic load comes from the plan,
    so these readings personalise the glucose-response model (M2)."""
    plan = active_plan(db, user.id)
    meal_gl = None
    if plan:
        for d in plan.payload.get("days", []):
            if d.get("date") == body.day.isoformat() and d.get("feasible"):
                meal_gl = round(sum(i["glycemic_load"] for i in d["meals"].get(body.meal, [])), 2)
    if meal_gl is None:
        raise HTTPException(status_code=422, detail="Log readings for a meal that is in your current plan.")
    m = MealLog(user_id=user.id, day=body.day, slot=f"{body.meal}_glucose", dish_id="meal", status="reading",
                rating=0, glucose_before=body.before, glucose_after=body.after, meal_gl=meal_gl)
    db.add(m)
    db.commit()
    return log_out(m)


@router.get("/meals")
def list_logs(start: date | None = None, end: date | None = None, user: User = Depends(current_user),
              db: Session = Depends(get_session)) -> list[dict]:
    start = start or date.today() - timedelta(days=30)
    end = end or date.today() + timedelta(days=7)
    rows = db.execute(select(MealLog).where(MealLog.user_id == user.id, MealLog.day >= start, MealLog.day <= end)
                      .order_by(MealLog.day, MealLog.id)).scalars().all()
    return [log_out(m) for m in rows]


@router.get("/adherence")
def adherence(user: User = Depends(current_user), db: Session = Depends(get_session)) -> dict:
    since = date.today() - timedelta(days=30)
    rows = db.execute(select(MealLog).where(MealLog.user_id == user.id, MealLog.day >= since)).scalars().all()
    by_day: dict[str, dict] = {}
    for m in rows:
        if m.status == "reading":
            continue
        d = by_day.setdefault(m.day.isoformat(), {"ate": 0, "skipped": 0, "swapped": 0})
        d[m.status] += 1
    ate = sum(d["ate"] for d in by_day.values())
    total = sum(sum(d.values()) for d in by_day.values())
    readings = [log_out(m) for m in rows if m.status == "reading"]
    return {"days": by_day, "rate": round(ate / total, 3) if total else None, "logged": total,
            "readings": readings}
