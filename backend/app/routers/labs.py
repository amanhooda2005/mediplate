from __future__ import annotations

from datetime import date

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..auth import current_user
from ..db import LabResult, User, get_session
from ..engine.profile import LAB_KINDS, egfr_ckd_epi_2021
from ..schemas import LabIn

router = APIRouter(prefix="/api/labs", tags=["labs"])


def lab_out(r: LabResult) -> dict:
    return {"id": r.id, "kind": r.kind, "value": r.value, "unit": LAB_KINDS.get(r.kind, ""),
            "taken_on": r.taken_on.isoformat()}


@router.post("", status_code=201)
def add_lab(body: LabIn, user: User = Depends(current_user), db: Session = Depends(get_session)) -> dict:
    if body.kind not in LAB_KINDS:
        raise HTTPException(status_code=422, detail="Unknown test.")
    taken = body.taken_on or date.today()
    if taken > date.today():
        raise HTTPException(status_code=422, detail="The test date cannot be in the future.")
    r = LabResult(user_id=user.id, kind=body.kind, value=body.value, taken_on=taken)
    db.add(r)
    db.commit()
    return lab_out(r)


@router.get("")
def list_labs(kind: str | None = None, user: User = Depends(current_user),
              db: Session = Depends(get_session)) -> list[dict]:
    q = select(LabResult).where(LabResult.user_id == user.id)
    if kind:
        q = q.where(LabResult.kind == kind)
    rows = db.execute(q.order_by(LabResult.taken_on.desc(), LabResult.id.desc())).scalars().all()
    return [lab_out(r) for r in rows]


@router.delete("/{lab_id}", status_code=204)
def delete_lab(lab_id: int, user: User = Depends(current_user), db: Session = Depends(get_session)) -> None:
    r = db.get(LabResult, lab_id)
    if r is None or r.user_id != user.id:
        raise HTTPException(status_code=404, detail="Result not found.")
    db.delete(r)
    db.commit()


@router.get("/series")
def series(user: User = Depends(current_user), db: Session = Depends(get_session)) -> dict:
    """Time series for the progress charts, including eGFR calculated from creatinine."""
    rows = db.execute(select(LabResult).where(LabResult.user_id == user.id)
                      .order_by(LabResult.taken_on, LabResult.id)).scalars().all()
    out: dict[str, list] = {}
    for r in rows:
        out.setdefault(r.kind, []).append({"date": r.taken_on.isoformat(), "value": r.value})
    prof = user.profile.data if user.profile else None
    if prof and "creatinine" in out:
        out["egfr"] = [{"date": p["date"], "value": egfr_ckd_epi_2021(p["value"], prof["age"], prof["sex"])}
                       for p in out["creatinine"]]
    return out
