"""E1 - Profile builder.

Turns the stored profile + latest lab results into a PatientContext: the one
object every later step reads. Clinical calculations live here (BMI with Indian
cut-offs, eGFR by CKD-EPI 2021, CKD stage, reference body weight).
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from .. import knowledge
from ..knowledge import msg

DISEASE_IDS = ("diabetes", "hypertension", "cvd", "obesity", "ckd", "fatty_liver",
               "metabolic_syndrome", "arthritis")
ACTIVITY_FACTOR = {"sedentary": 1.2, "light": 1.375, "moderate": 1.55, "active": 1.725}
LAB_KINDS = {
    "weight": "kg", "waist": "cm", "sbp": "mmHg", "dbp": "mmHg", "fasting_glucose": "mg/dL",
    "post_meal_glucose": "mg/dL", "hba1c": "%", "creatinine": "mg/dL", "potassium": "mmol/L",
    "phosphorus": "mg/dL", "total_cholesterol": "mg/dL", "ldl": "mg/dL", "hdl": "mg/dL",
    "triglycerides": "mg/dL", "alt": "U/L", "ast": "U/L", "platelets": "×10⁹/L", "uric_acid": "mg/dL",
}


def egfr_ckd_epi_2021(creatinine_mg_dl: float, age: float, sex: str) -> float:
    """CKD-EPI 2021 race-free creatinine equation (mL/min/1.73 m²)."""
    female = sex == "female"
    kappa = 0.7 if female else 0.9
    alpha = -0.241 if female else -0.302
    ratio = creatinine_mg_dl / kappa
    value = 142 * (min(ratio, 1) ** alpha) * (max(ratio, 1) ** -1.200) * (0.9938 ** age)
    if female:
        value *= 1.012
    return round(value, 1)


def ckd_stage_from_egfr(egfr: float) -> tuple[int, str]:
    if egfr >= 90:
        return 1, "G1"
    if egfr >= 60:
        return 2, "G2"
    if egfr >= 45:
        return 3, "G3a"
    if egfr >= 30:
        return 3, "G3b"
    if egfr >= 15:
        return 4, "G4"
    return 5, "G5"


def bmi_category(bmi: float) -> str:
    """Asia-Pacific / Indian consensus cut-offs."""
    if bmi < 18.5:
        return "bmi_under"
    if bmi < 23:
        return "bmi_normal"
    if bmi < 25:
        return "bmi_over"
    return "bmi_obese"


@dataclass
class PatientContext:
    age: int
    sex: str
    height_cm: float
    weight_kg: float
    activity: str
    state: str
    zone: str
    second_zone: str | None
    diet_type: str
    no_beef: bool
    no_pork: bool
    allergies: set[str]
    diseases: dict[str, dict]
    medicines: list[str]
    med_classes: dict[str, list[str]]
    labs: dict[str, float]
    smoker: bool = False
    family_history_heart: bool = False
    family_history_diabetes: int = 0
    exercise: str = "none"
    waist_cm: float | None = None
    egfr: float | None = None
    ckd_stage: int | None = None
    ckd_stage_label: str | None = None
    dialysis: bool = False
    chd_risk: float | None = None
    notes: list[dict] = field(default_factory=list)

    # ---- derived values
    @property
    def bmi(self) -> float:
        return round(self.weight_kg / (self.height_cm / 100) ** 2, 1)

    @property
    def reference_weight(self) -> float:
        """Weight used for g/kg protein targets: actual weight, capped at the
        weight for BMI 25 so protein is not overestimated in obesity."""
        cap = 25 * (self.height_cm / 100) ** 2
        return round(min(self.weight_kg, cap), 1)

    def has(self, disease: str) -> bool:
        return disease in self.diseases

    @property
    def active(self) -> list[str]:
        return [d for d in DISEASE_IDS if d in self.diseases]

    def field(self, name: str) -> Any:
        mapping = {
            "ckd_stage": self.ckd_stage,
            "dialysis": self.dialysis,
            "serum_potassium": self.labs.get("potassium"),
            "serum_phosphorus": self.labs.get("phosphorus"),
            "cvd_type": self.diseases.get("cvd", {}).get("type"),
            "arthritis_type": self.diseases.get("arthritis", {}).get("type"),
            "diabetes_type": self.diseases.get("diabetes", {}).get("type"),
            "bmi": self.bmi,
            "age": self.age,
        }
        if name not in mapping:
            raise KeyError(f"unknown condition field {name}")
        return mapping[name]

    @property
    def heart_failure(self) -> bool:
        return self.diseases.get("cvd", {}).get("type") == "heart_failure"

    def condition_active(self, condition: str) -> bool:
        if condition == "heart_failure":
            return self.heart_failure
        return self.has(condition)


def build_context(profile: dict, labs: dict[str, float]) -> PatientContext:
    """profile: the stored profile JSON; labs: latest value per lab kind."""
    k = knowledge.get()
    state = profile["state"]
    zone = k.states.get(state)
    if zone is None:
        raise ValueError(f"unknown state {state}")
    second = profile.get("second_zone") or None
    if second == zone or (second and second not in k.zones):
        second = None
    diseases = {d: dict(v or {}) for d, v in (profile.get("diseases") or {}).items() if d in DISEASE_IDS}
    meds = [m for m in profile.get("medicines") or [] if m in k.medicine_by_id]
    med_classes: dict[str, list[str]] = {}
    for m in meds:
        med_classes.setdefault(k.medicine_by_id[m]["class"], []).append(m)

    weight = labs.get("weight") or profile["weight_kg"]
    waist = labs.get("waist") or profile.get("waist_cm")
    ctx = PatientContext(
        age=int(profile["age"]), sex=profile["sex"], height_cm=float(profile["height_cm"]),
        weight_kg=float(weight), activity=profile.get("activity", "sedentary"),
        state=state, zone=zone, second_zone=second, diet_type=profile.get("diet_type", "veg"),
        no_beef=bool(profile.get("no_beef", True)), no_pork=bool(profile.get("no_pork", False)),
        allergies=set(profile.get("allergies") or []), diseases=diseases, medicines=meds,
        med_classes=med_classes, labs=dict(labs), smoker=bool(profile.get("smoker", False)),
        family_history_heart=bool(profile.get("family_history_heart", False)),
        family_history_diabetes=int(profile.get("family_history_diabetes", 0)),
        exercise=profile.get("exercise", "none"), waist_cm=float(waist) if waist else None,
    )

    # Kidney function
    if "creatinine" in labs and labs["creatinine"] > 0:
        ctx.egfr = egfr_ckd_epi_2021(labs["creatinine"], ctx.age, ctx.sex)
    ckd = diseases.get("ckd")
    if ckd is not None:
        ctx.dialysis = bool(ckd.get("dialysis", False))
        if ckd.get("stage"):
            ctx.ckd_stage = int(ckd["stage"])
            ctx.ckd_stage_label = f"G{ctx.ckd_stage}"
        elif ctx.egfr is not None:
            ctx.ckd_stage, ctx.ckd_stage_label = ckd_stage_from_egfr(ctx.egfr)
        else:
            ctx.ckd_stage, ctx.ckd_stage_label = 3, "G3"  # cautious default until a result is added
        if ctx.dialysis:
            ctx.ckd_stage, ctx.ckd_stage_label = 5, "G5D"
    elif ctx.egfr is not None and ctx.egfr < 60:
        # Reduced kidney function found in the results: apply kidney-safe limits
        # and tell the patient, rather than silently ignoring it.
        ctx.diseases["ckd"] = {"auto": True}
        ctx.ckd_stage, ctx.ckd_stage_label = ckd_stage_from_egfr(ctx.egfr)
        ctx.notes.append(msg("insight_ckd_auto", egfr=ctx.egfr, stage=ctx.ckd_stage_label))

    # Heart-risk model (M1) only for people without known heart disease
    if not ctx.has("cvd"):
        from .risk import heart_risk
        ctx.chd_risk = heart_risk(ctx)
    return ctx


def validate_profile(profile: dict) -> None:
    """Raises ValueError with a clear message if the profile cannot be used."""
    k = knowledge.get()
    if not 30 <= int(profile.get("age", 0)) <= 100:
        raise ValueError("MediPlate is designed for adults aged 30 and above.")
    if profile.get("sex") not in ("male", "female"):
        raise ValueError("Please choose sex at birth (used for energy and kidney calculations).")
    if not 120 <= float(profile.get("height_cm", 0)) <= 220:
        raise ValueError("Height must be between 120 and 220 cm.")
    if not 30 <= float(profile.get("weight_kg", 0)) <= 250:
        raise ValueError("Weight must be between 30 and 250 kg.")
    if profile.get("state") not in k.states:
        raise ValueError("Please choose your home state.")
    if profile.get("diet_type") not in ("veg", "egg", "nonveg"):
        raise ValueError("Please choose a diet type.")
    if profile.get("activity", "sedentary") not in ACTIVITY_FACTOR:
        raise ValueError("Unknown activity level.")
    for d in (profile.get("diseases") or {}):
        if d not in DISEASE_IDS:
            raise ValueError(f"Unknown condition {d}.")
    ckd = (profile.get("diseases") or {}).get("ckd") or {}
    if ckd.get("stage") not in (None, 1, 2, 3, 4, 5):
        raise ValueError("Kidney disease stage must be 1 to 5.")
    for m in profile.get("medicines") or []:
        if m not in k.medicine_by_id:
            raise ValueError(f"Unknown medicine {m}.")
    allowed_allergens = {"milk", "peanut", "treenut", "gluten", "egg", "fish", "shellfish", "soy", "sesame"}
    for a in profile.get("allergies") or []:
        if a not in allowed_allergens:
            raise ValueError(f"Unknown allergy {a}.")


def energy_target(ctx: PatientContext) -> tuple[float, dict | None]:
    """Mifflin-St Jeor × activity; minus 500 kcal when weight loss applies."""
    k = knowledge.get()
    base = 10 * ctx.weight_kg + 6.25 * ctx.height_cm - 5 * ctx.age + (5 if ctx.sex == "male" else -161)
    tdee = base * ACTIVITY_FACTOR.get(ctx.activity, 1.2)
    thresholds = [k.rules["diseases"][d].get("weight_loss_bmi") for d in ctx.active]
    thresholds = [t for t in thresholds if t is not None]
    note = None
    if thresholds and ctx.bmi >= min(thresholds) and not ctx.dialysis:
        floor = 1500 if ctx.sex == "male" else 1200
        tdee = max(tdee - 500, floor)
        note = msg("weight_loss", bmi=ctx.bmi)
    return round(tdee), note
