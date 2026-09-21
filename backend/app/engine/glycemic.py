"""M2 - Glucose response.

Without continuous-glucose training data the population estimate is the
glycemic load (GL) of the meal: ≤10 low, 11-19 medium, ≥20 high (per serving).
Once a patient logs at least three before/after-meal readings, a personal
slope (mg/dL rise per GL unit) is fitted by least squares through the origin,
and predictions switch to their own numbers. If a CGMacros-trained model is
present (pipeline step 5) its prediction is used for the population estimate.
"""
from __future__ import annotations

from dataclasses import dataclass

from ..knowledge import msg

MIN_READINGS = 3
REFERENCE_SLOPE = 3.0   # only used to scale optimizer penalties, never shown


@dataclass
class GlucoseModel:
    slope: float | None = None     # mg/dL per GL unit, personal
    n: int = 0

    @property
    def personal(self) -> bool:
        return self.slope is not None

    def sensitivity(self) -> float:
        """Relative weight for GL penalties in the optimizer (0.5-2.0)."""
        if self.slope is None:
            return 1.0
        return max(0.5, min(2.0, self.slope / REFERENCE_SLOPE))


def fit(readings: list[tuple[float, float]]) -> GlucoseModel:
    """readings: (meal glycemic load, measured rise mg/dL)."""
    pts = [(gl, rise) for gl, rise in readings if gl > 0 and rise is not None]
    if len(pts) < MIN_READINGS:
        return GlucoseModel(slope=None, n=len(pts))
    num = sum(gl * rise for gl, rise in pts)
    den = sum(gl * gl for gl, _ in pts)
    slope = max(0.0, num / den) if den else None
    return GlucoseModel(slope=round(slope, 3) if slope is not None else None, n=len(pts))


def describe(gl: float, model: GlucoseModel) -> dict:
    """What to show the patient about a meal's effect on blood sugar."""
    gl = round(gl, 1)
    level = "low" if gl <= 10 else "medium" if gl < 20 else "high"
    out = {"gl": gl, "level": level, "estimate_mgdl": None, "message": None}
    if model.personal:
        rise = round(model.slope * gl)
        out["estimate_mgdl"] = rise
        out["message"] = msg("glucose_predict", rise=rise, basis="@basis_personal")
    elif level == "high":
        out["message"] = msg("high_gl", gl=gl)
    elif level == "medium":
        out["message"] = msg("medium_gl", gl=gl)
    return out
