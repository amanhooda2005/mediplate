from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..auth import create_token, current_user, hash_password, verify_password
from ..db import User, get_session
from ..schemas import LoginIn, MeUpdate, RegisterIn, TokenOut, UserOut

router = APIRouter(prefix="/api/auth", tags=["auth"])


def user_out(u: User) -> UserOut:
    return UserOut(id=u.id, name=u.name, email=u.email, language=u.language, role=u.role,
                   has_profile=bool(u.profile and u.profile.data))


@router.post("/register", response_model=TokenOut, status_code=201)
def register(body: RegisterIn, db: Session = Depends(get_session)) -> TokenOut:
    email = body.email.lower()
    if db.execute(select(User).where(func.lower(User.email) == email)).scalar_one_or_none():
        raise HTTPException(status_code=409, detail="An account with this email already exists. Please sign in.")
    user = User(email=email, name=body.name.strip(), password_hash=hash_password(body.password),
                language=body.language)
    db.add(user)
    db.commit()
    db.refresh(user)
    return TokenOut(token=create_token(user.id), user=user_out(user))


@router.post("/login", response_model=TokenOut)
def login(body: LoginIn, db: Session = Depends(get_session)) -> TokenOut:
    user = db.execute(select(User).where(func.lower(User.email) == body.email.lower())).scalar_one_or_none()
    if user is None or not verify_password(body.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Email or password is not correct.")
    return TokenOut(token=create_token(user.id), user=user_out(user))


@router.get("/me", response_model=UserOut)
def me(user: User = Depends(current_user)) -> UserOut:
    return user_out(user)


@router.put("/me", response_model=UserOut)
def update_me(body: MeUpdate, user: User = Depends(current_user), db: Session = Depends(get_session)) -> UserOut:
    if body.name is not None:
        user.name = body.name.strip()
    if body.language is not None:
        user.language = body.language
    db.merge(user)
    db.commit()
    return user_out(user)
