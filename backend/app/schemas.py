"""Request / response models with validation."""
from __future__ import annotations

from datetime import date
from typing import Literal

from pydantic import BaseModel, EmailStr, Field, field_validator

Language = Literal["en", "ta", "hi"]

LAB_RANGES: dict[str, tuple[float, float]] = {
    "weight": (30, 250), "waist": (50, 200), "sbp": (70, 260), "dbp": (40, 160),
    "fasting_glucose": (40, 600), "post_meal_glucose": (40, 700), "hba1c": (3, 20),
    "creatinine": (0.2, 20), "potassium": (2, 9), "phosphorus": (1, 15), "total_cholesterol": (50, 600),
    "ldl": (20, 400), "hdl": (10, 150), "triglycerides": (20, 3000), "alt": (3, 2000), "ast": (3, 2000),
    "platelets": (10, 1000), "uric_acid": (1, 20),
}


class RegisterIn(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    language: Language = "en"


class LoginIn(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=128)


class UserOut(BaseModel):
    id: int
    name: str
    email: str
    language: str
    role: str
    has_profile: bool


class TokenOut(BaseModel):
    token: str
    user: UserOut


class MeUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=120)
    language: Language | None = None


class ProfileIn(BaseModel):
    age: int = Field(ge=30, le=100)
    sex: Literal["male", "female"]
    height_cm: float = Field(ge=120, le=220)
    weight_kg: float = Field(ge=30, le=250)
    waist_cm: float | None = Field(default=None, ge=50, le=200)
    activity: Literal["sedentary", "light", "moderate", "active"] = "sedentary"
    state: str
    second_zone: Literal["north", "south", "east", "west", "northeast"] | None = None
    diet_type: Literal["veg", "egg", "nonveg"]
    no_beef: bool = True
    no_pork: bool = False
    allergies: list[str] = []
    diseases: dict[str, dict] = {}
    medicines: list[str] = []
    smoker: bool = False
    family_history_heart: bool = False
    family_history_diabetes: int = Field(default=0, ge=0, le=2)
    exercise: Literal["none", "some", "regular"] = "none"
    labs: dict[str, float] = {}

    @field_validator("labs")
    @classmethod
    def _labs_in_range(cls, v: dict[str, float]) -> dict[str, float]:
        for kind, value in v.items():
            check_lab(kind, value)
        return v


def check_lab(kind: str, value: float) -> None:
    if kind not in LAB_RANGES:
        raise ValueError(f"Unknown test '{kind}'.")
    lo, hi = LAB_RANGES[kind]
    if not lo <= value <= hi:
        raise ValueError(f"{kind.replace('_', ' ').capitalize()} must be between {lo:g} and {hi:g}.")


class LabIn(BaseModel):
    kind: str
    value: float
    taken_on: date | None = None

    @field_validator("value")
    @classmethod
    def _range(cls, v: float, info) -> float:
        kind = info.data.get("kind")
        if kind is not None:
            check_lab(kind, v)
        return v


class MealLogIn(BaseModel):
    day: date
    slot: str = Field(max_length=30)
    dish_id: str = Field(max_length=60)
    portion: float = Field(default=1.0, gt=0, le=3)
    status: Literal["ate", "skipped", "swapped"]
    rating: Literal[-1, 0, 1] = 0


class GlucoseIn(BaseModel):
    day: date
    meal: Literal["breakfast", "lunch", "dinner"]
    before: float = Field(ge=40, le=600)
    after: float = Field(ge=40, le=700)


class CheckIn(BaseModel):
    item_type: Literal["dish", "food"]
    id: str = Field(max_length=60)
    grams: float | None = Field(default=None, gt=0, le=2000)
    portion: float = Field(default=1.0, gt=0, le=3)


class SwapIn(BaseModel):
    day_index: int = Field(ge=0, le=13)
    slot: str = Field(max_length=30)


class GenerateIn(BaseModel):
    start: date | None = None
    days: int = Field(default=7, ge=1, le=7)
