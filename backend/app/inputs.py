"""Gathers everything the engine needs for one user from the database."""
from __future__ import annotations

from datetime import date, timedelta

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from .db import LabResult, MealLog, Plan, User
from .engine.service import EngineInputs


def latest_labs(db: Session, user_id: int) -> dict[str, float]:
    rows = db.execute(select(LabResult).where(LabResult.user_id == user_id)
                      .order_by(LabResult.taken_on, LabResult.id)).scalars().all()
    out: dict[str, float] = {}
    for r in rows:
        out[r.kind] = r.value
    return out


def engine_inputs(db: Session, user: User) -> EngineInputs:
    if user.profile is None or not user.profile.data:
        raise HTTPException(status_code=409, detail="Please complete your health profile first.")
    since = date.today() - timedelta(days=120)
    logs = db.execute(select(MealLog).where(MealLog.user_id == user.id, MealLog.day >= since)).scalars().all()
    meal_logs = [{"dish_id": m.dish_id, "status": m.status, "rating": m.rating}
                 for m in logs if m.status in ("ate", "skipped", "swapped")]
    readings = [(m.meal_gl, m.glucose_after - m.glucose_before) for m in logs
                if m.status == "reading" and m.meal_gl and m.glucose_after is not None
                and m.glucose_before is not None]
    return EngineInputs(profile=user.profile.data, labs=latest_labs(db, user.id), meal_logs=meal_logs,
                        glucose_readings=readings)


def active_plan(db: Session, user_id: int) -> Plan | None:
    return db.execute(select(Plan).where(Plan.user_id == user_id, Plan.active.is_(True))
                      .order_by(Plan.id.desc())).scalars().first()
