from __future__ import annotations

from datetime import date

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import update
from sqlalchemy.orm import Session
from sqlalchemy.orm.attributes import flag_modified

from ..auth import current_user
from ..db import Plan, User, get_session
from ..engine import risk, service
from ..inputs import active_plan, engine_inputs
from ..schemas import GenerateIn, SwapIn

router = APIRouter(prefix="/api", tags=["plans"])


def plan_out(p: Plan) -> dict:
    return {"id": p.id, "created_at": p.created_at.isoformat(), **p.payload}


@router.post("/plans/generate", status_code=201)
def generate(body: GenerateIn | None = None, user: User = Depends(current_user),
             db: Session = Depends(get_session)) -> dict:
    body = body or GenerateIn()
    inputs = engine_inputs(db, user)
    start = body.start or date.today()
    try:
        payload = service.generate_plan(inputs, start, body.days)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    db.execute(update(Plan).where(Plan.user_id == user.id, Plan.active.is_(True)).values(active=False))
    plan = Plan(user_id=user.id, start=start, active=True, payload=payload)
    db.add(plan)
    db.commit()
    db.refresh(plan)
    return plan_out(plan)


@router.get("/plans/current")
def current(user: User = Depends(current_user), db: Session = Depends(get_session)) -> dict | None:
    p = active_plan(db, user.id)
    return plan_out(p) if p else None


@router.post("/plans/current/swap")
def swap(body: SwapIn, user: User = Depends(current_user), db: Session = Depends(get_session)) -> dict:
    p = active_plan(db, user.id)
    if p is None:
        raise HTTPException(status_code=404, detail="Make a plan first.")
    inputs = engine_inputs(db, user)
    try:
        new_payload = service.swap(inputs, p.payload, body.day_index, body.slot)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except LookupError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    p.payload = new_payload
    flag_modified(p, "payload")
    db.commit()
    return plan_out(p)


@router.get("/insights")
def insights(user: User = Depends(current_user), db: Session = Depends(get_session)) -> dict:
    inputs = engine_inputs(db, user)
    st = service.prepare(inputs)
    return {
        "insights": risk.insights(st.ctx),
        "targets": st.targets.as_dict(),
        "context": service.context_summary(st),
        "removed": service.explainer.removed_summary(st.safety),
    }
