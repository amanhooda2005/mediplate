from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from .. import knowledge
from ..auth import current_user
from ..db import User, get_session
from ..engine import foodcheck, service
from ..inputs import engine_inputs
from ..schemas import CheckIn

router = APIRouter(prefix="/api/foods", tags=["foods"])


@router.get("/search")
def search(q: str = Query(min_length=1, max_length=60), _: User = Depends(current_user)) -> list[dict]:
    return foodcheck.search(q)


@router.post("/check")
def check(body: CheckIn, user: User = Depends(current_user), db: Session = Depends(get_session)) -> dict:
    st = service.prepare(engine_inputs(db, user))
    try:
        return foodcheck.check(st, body.item_type, body.id, body.grams, body.portion)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="That food was not found.") from exc


@router.get("/dish/{dish_id}")
def dish(dish_id: str, _: User = Depends(current_user)) -> dict:
    d = knowledge.get().dishes.get(dish_id)
    if d is None:
        raise HTTPException(status_code=404, detail="Dish not found.")
    return d
