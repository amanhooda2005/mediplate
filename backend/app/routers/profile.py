from __future__ import annotations

from datetime import date

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..auth import current_user
from ..db import LabResult, Profile, User, get_session
from ..engine.profile import build_context, validate_profile
from ..inputs import latest_labs
from ..schemas import ProfileIn

router = APIRouter(prefix="/api/profile", tags=["profile"])


@router.get("")
def get_profile(user: User = Depends(current_user), db: Session = Depends(get_session)) -> dict:
    data = user.profile.data if user.profile else None
    return {"profile": data, "labs": latest_labs(db, user.id)}


@router.put("")
def put_profile(body: ProfileIn, user: User = Depends(current_user), db: Session = Depends(get_session)) -> dict:
    data = body.model_dump(exclude={"labs"})
    data["allergies"] = sorted(set(data["allergies"]))
    data["medicines"] = sorted(set(data["medicines"]))
    try:
        validate_profile(data)
        labs = latest_labs(db, user.id)
        labs.update(body.labs)
        build_context(data, labs)   # proves the engine can use this profile
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    if user.profile is None:
        db.add(Profile(user_id=user.id, data=data))
    else:
        user.profile.data = data
        db.merge(user.profile)
    today = date.today()
    for kind, value in body.labs.items():
        db.add(LabResult(user_id=user.id, kind=kind, value=float(value), taken_on=today))
    db.commit()
    return {"profile": data, "labs": latest_labs(db, user.id)}
