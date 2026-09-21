"""Clinical calculators match their published formulas."""
import math

import pytest
from conftest import profile

from app.engine.profile import bmi_category, build_context, ckd_stage_from_egfr, egfr_ckd_epi_2021
from app.engine.risk import fib4, idrs, metabolic_syndrome_signs


def ref_egfr(scr, age, female):
    kappa, alpha = (0.7, -0.241) if female else (0.9, -0.302)
    r = scr / kappa
    v = 142 * min(r, 1) ** alpha * max(r, 1) ** -1.2 * 0.9938 ** age
    return v * (1.012 if female else 1)


@pytest.mark.parametrize("scr,age,sex", [(1.0, 60, "female"), (0.6, 45, "female"), (2.6, 58, "male"), (0.8, 35, "male")])
def test_egfr(scr, age, sex):
    assert egfr_ckd_epi_2021(scr, age, sex) == pytest.approx(ref_egfr(scr, age, sex == "female"), abs=0.1)


def test_egfr_known_value():
    # 60-year-old woman, creatinine 1.0 mg/dL -> about 64.5 mL/min/1.73m²
    assert egfr_ckd_epi_2021(1.0, 60, "female") == pytest.approx(64.5, abs=0.5)


@pytest.mark.parametrize("egfr,stage,label", [(95, 1, "G1"), (70, 2, "G2"), (50, 3, "G3a"), (35, 3, "G3b"),
                                              (20, 4, "G4"), (10, 5, "G5")])
def test_stages(egfr, stage, label):
    assert ckd_stage_from_egfr(egfr) == (stage, label)


def test_bmi_indian_cutoffs():
    assert bmi_category(22.9) == "bmi_normal"
    assert bmi_category(23.0) == "bmi_over"
    assert bmi_category(25.0) == "bmi_obese"


def test_idrs():
    # age 52 (30) + male waist 95 (10) + some exercise (20) + one parent (10) = 70
    ctx = build_context(profile(age=52, waist_cm=95, exercise="some", family_history_diabetes=1), {})
    assert idrs(ctx) == 70


def test_fib4():
    ctx = build_context(profile(age=50), {"ast": 40, "alt": 64, "platelets": 200})
    assert fib4(ctx) == pytest.approx(50 * 40 / (200 * math.sqrt(64)), abs=0.01)


def test_metabolic_syndrome():
    ctx = build_context(profile(sex="female", waist_cm=88), {"triglycerides": 180, "hdl": 42, "sbp": 120, "dbp": 76})
    meets, signs = metabolic_syndrome_signs(ctx)
    assert meets and signs == 3


def test_ckd_auto_activation():
    ctx = build_context(profile(age=65), {"creatinine": 2.0})
    assert ctx.has("ckd") and ctx.ckd_stage in (3, 4)
    assert any(n["key"] == "insight_ckd_auto" for n in ctx.notes)


def test_reference_weight_capped_for_obesity():
    ctx = build_context(profile(height_cm=160, weight_kg=90), {})
    assert ctx.reference_weight == pytest.approx(25 * 1.6 ** 2, abs=0.1)
