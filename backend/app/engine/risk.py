"""M1 - Health-risk scorer.

Combines the trained heart-risk model (SAheart) with validated clinical
calculators that need no training data: eGFR/CKD stage, FIB-4 liver score,
Indian Diabetes Risk Score (IDRS), IDF metabolic-syndrome criteria for South
Asians, BMI with Indian cut-offs, HbA1c, blood pressure and potassium checks.
"""
from __future__ import annotations

import math

import pandas as pd

from .. import knowledge
from ..knowledge import msg
from .profile import PatientContext, bmi_category

LDL_MGDL_PER_MMOL = 38.67


def heart_risk(ctx: PatientContext) -> float | None:
    """Probability of coronary heart disease from the M1 model, or None when the
    needed numbers (systolic BP and LDL) have not been entered."""
    sbp = ctx.labs.get("sbp")
    ldl = ctx.labs.get("ldl")
    if sbp is None or ldl is None:
        return None
    k = knowledge.get()
    row = pd.DataFrame([{
        "age": float(ctx.age), "sbp": float(sbp), "ldl_mmol": float(ldl) / LDL_MGDL_PER_MMOL,
        "family_history": 1.0 if ctx.family_history_heart else 0.0, "bmi": float(ctx.bmi),
        "smoker": 1.0 if ctx.smoker else 0.0,
    }])[k.heart_meta["features"]]
    return round(float(k.heart_model.predict_proba(row)[0, 1]), 3)


def idrs(ctx: PatientContext) -> int | None:
    """Indian Diabetes Risk Score (Mohan et al., JAPI 2005)."""
    if ctx.waist_cm is None:
        return None
    score = 0 if ctx.age < 35 else 20 if ctx.age < 50 else 30
    w = ctx.waist_cm
    if ctx.sex == "female":
        score += 0 if w < 80 else 10 if w < 90 else 20
    else:
        score += 0 if w < 90 else 10 if w < 100 else 20
    score += {"regular": 0, "some": 20, "none": 30}.get(ctx.exercise, 30)
    score += {0: 0, 1: 10, 2: 20}.get(ctx.family_history_diabetes, 0)
    return score


def fib4(ctx: PatientContext) -> float | None:
    ast, alt, plt = ctx.labs.get("ast"), ctx.labs.get("alt"), ctx.labs.get("platelets")
    if not ast or not alt or not plt:
        return None
    return round(ctx.age * ast / (plt * math.sqrt(alt)), 2)


def metabolic_syndrome_signs(ctx: PatientContext) -> tuple[bool, int] | None:
    """IDF 2006 with South Asian waist cut-offs. Returns (meets, signs)."""
    if ctx.waist_cm is None:
        return None
    male = ctx.sex == "male"
    central = ctx.waist_cm >= (90 if male else 80)
    others = 0
    tg, hdl = ctx.labs.get("triglycerides"), ctx.labs.get("hdl")
    sbp, dbp, fpg = ctx.labs.get("sbp"), ctx.labs.get("dbp"), ctx.labs.get("fasting_glucose")
    if tg is not None and tg >= 150:
        others += 1
    if hdl is not None and hdl < (40 if male else 50):
        others += 1
    if ctx.has("hypertension") or (sbp and sbp >= 130) or (dbp and dbp >= 85):
        others += 1
    if ctx.has("diabetes") or (fpg and fpg >= 100):
        others += 1
    return central and others >= 2, others + (1 if central else 0)


def insights(ctx: PatientContext) -> list[dict]:
    out: list[dict] = []

    def add(ident: str, severity: str, m: dict) -> None:
        out.append({"id": ident, "severity": severity, "message": m})

    for note in ctx.notes:
        add("auto", "warning", note)
    cat = bmi_category(ctx.bmi)
    add("bmi", "info" if cat == "bmi_normal" else "warning", msg("insight_bmi", bmi=ctx.bmi, category=f"@{cat}"))
    if ctx.egfr is not None:
        add("egfr", "info" if ctx.egfr >= 60 else "warning",
            msg("insight_egfr", egfr=ctx.egfr, stage=ctx.ckd_stage_label or "G1–G2"))
    pot = ctx.labs.get("potassium")
    if pot is not None and pot > 5.0:
        add("potassium", "urgent" if pot >= 6.0 else "warning", msg("insight_potassium_high", value=pot))
    hba1c = ctx.labs.get("hba1c")
    if hba1c is not None and ctx.has("diabetes"):
        add("hba1c", "info" if hba1c <= 7 else "warning",
            msg("insight_hba1c", value=hba1c, level="@hba1c_ok" if hba1c <= 7 else "@hba1c_high"))
    sbp, dbp = ctx.labs.get("sbp"), ctx.labs.get("dbp")
    if sbp is not None and dbp is not None:
        if sbp >= 180 or dbp >= 120:
            level, sev = "@bp_very_high", "urgent"
        elif sbp >= 130 or dbp >= 80:
            level, sev = "@bp_high", "warning"
        else:
            level, sev = "@bp_ok", "info"
        add("bp", sev, msg("insight_bp", sbp=round(sbp), dbp=round(dbp), level=level))
    if not ctx.has("metabolic_syndrome"):
        ms = metabolic_syndrome_signs(ctx)
        if ms and ms[0]:
            add("mets", "warning", msg("insight_mets", count=ms[1]))
    f4 = fib4(ctx)
    if f4 is not None:
        low_cut = 2.0 if ctx.age >= 65 else 1.3
        if f4 < low_cut:
            level, sev = "@fib4_low", "info"
        elif f4 <= 2.67:
            level, sev = "@fib4_mid", "warning"
        else:
            level, sev = "@fib4_high", "urgent"
        add("fib4", sev, msg("insight_fib4", fib4=f4, level=level))
    if not ctx.has("diabetes"):
        score = idrs(ctx)
        if score is not None:
            level = "@idrs_low" if score < 30 else "@idrs_mid" if score < 60 else "@idrs_high"
            add("idrs", "warning" if score >= 60 else "info", msg("insight_idrs", score=score, level=level))
    if ctx.chd_risk is not None:
        k = knowledge.get()
        high = ctx.chd_risk >= k.heart_meta.get("high_risk_threshold", 0.5)
        add("chd", "warning" if high else "info",
            msg("insight_chd", pct=round(ctx.chd_risk * 100), level="@chd_high" if high else "@chd_low"))
    return out
