"""Step 5 - Train ML models.

M1 heart-risk indicator: trained on the South African Heart Disease dataset
(462 adults, outcome = coronary heart disease) using only numbers a patient can
enter in the app. Two candidate models are compared with repeated 5-fold
cross-validation and the better one (by ROC AUC) is saved.

M2 glucose-response model: needs continuous-glucose + meal data (CGMacros on
PhysioNet). If that data is placed in pipeline/raw/cgmacros/ it is trained
here; otherwise the app uses glycemic load plus each patient's own logged
readings (see backend/app/engine/glycemic.py) and this step says so.
"""
from __future__ import annotations

import json
import sys
from datetime import datetime, timezone
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
from sklearn.ensemble import GradientBoostingClassifier
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import roc_auc_score
from sklearn.model_selection import RepeatedStratifiedKFold, cross_val_predict, cross_val_score
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from common import BACKEND_MODELS, RAW, REPORTS, log, write_json  # noqa: E402

FEATURES = ["age", "sbp", "ldl_mmol", "family_history", "bmi", "smoker"]
SEED = 42


def load_saheart() -> tuple[pd.DataFrame, pd.Series]:
    df = pd.read_csv(RAW / "saheart.csv")
    X = pd.DataFrame({
        "age": df["Age"].astype(float),
        "sbp": df["Sbp"].astype(float),
        "ldl_mmol": df["Ldl"].astype(float),
        "family_history": df["Famhist"].astype(float),
        "bmi": df["Obesity"].astype(float),
        "smoker": (df["Tobacco"] > 0).astype(float),
    })
    y = df["target"].astype(int)
    if X.isna().any().any():
        raise ValueError("SAheart has missing values")
    return X[FEATURES], y


def train_heart_model() -> dict:
    X, y = load_saheart()
    cv = RepeatedStratifiedKFold(n_splits=5, n_repeats=5, random_state=SEED)
    candidates = {
        "logistic_regression": make_pipeline(StandardScaler(), LogisticRegression(max_iter=1000, C=1.0)),
        "gradient_boosting": GradientBoostingClassifier(n_estimators=150, max_depth=2, learning_rate=0.05,
                                                        subsample=0.8, random_state=SEED),
    }
    scores = {}
    for name, model in candidates.items():
        s = cross_val_score(model, X, y, cv=cv, scoring="roc_auc")
        scores[name] = {"auc_mean": round(float(s.mean()), 4), "auc_sd": round(float(s.std()), 4)}
        log("models", f"M1 {name}: AUC {s.mean():.3f} ± {s.std():.3f}")
    best = max(scores, key=lambda n: scores[n]["auc_mean"])
    model = candidates[best]
    # out-of-fold calibration check on a single 5-fold split
    oof = cross_val_predict(model, X, y, cv=5, method="predict_proba")[:, 1]
    bins = pd.qcut(oof, 5, labels=False, duplicates="drop")
    calibration = [
        {"predicted": round(float(oof[bins == b].mean()), 3), "observed": round(float(y[bins == b].mean()), 3),
         "n": int((bins == b).sum())}
        for b in sorted(set(bins))
    ]
    model.fit(X, y)
    BACKEND_MODELS.mkdir(parents=True, exist_ok=True)
    joblib.dump(model, BACKEND_MODELS / "m1_heart_risk.joblib")
    meta = {
        "model_id": "M1-heart",
        "chosen": best,
        "features": FEATURES,
        "feature_units": {"age": "years", "sbp": "mmHg", "ldl_mmol": "mmol/L (LDL mg/dL ÷ 38.67)",
                          "family_history": "0/1 heart disease in parents or siblings", "bmi": "kg/m²",
                          "smoker": "0/1 current or past tobacco use"},
        "cv": "repeated stratified 5-fold (5 repeats)",
        "scores": scores,
        "oof_auc": round(float(roc_auc_score(y, oof)), 4),
        "calibration_quintiles": calibration,
        "n_rows": int(len(y)),
        "positive_rate": round(float(y.mean()), 3),
        "dataset": "South African Heart Disease (Rousseauw et al. 1983), via PMLB",
        "limitations": "Men aged 15-64 from a high-risk region of the Western Cape. Research indicator only, "
                       "not a validated clinical risk score for Indian adults.",
        "high_risk_threshold": 0.5,
        "trained_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
    }
    if best == "logistic_regression":
        lr = model.named_steps["logisticregression"]
        meta["coefficients_standardised"] = {f: round(float(c), 4) for f, c in zip(FEATURES, lr.coef_[0])}
    write_json(BACKEND_MODELS / "m1_heart_risk.json", meta)
    return meta


def train_glucose_model() -> dict:
    folder = RAW / "cgmacros"
    if not folder.exists() or not any(folder.glob("*.csv")):
        log("models", "M2 glucose model skipped: CGMacros not in pipeline/raw/cgmacros/ "
                      "(PhysioNet data-use agreement needed). App uses glycemic load + personal readings.")
        return {"model_id": "M2-glucose", "status": "skipped",
                "reason": "CGMacros dataset not present. Download from PhysioNet into pipeline/raw/cgmacros/."}
    # Data present: fit a gradient-boosting regressor of 2-hour glucose rise on meal macros.
    frames = [pd.read_csv(p) for p in sorted(folder.glob("*.csv"))]
    df = pd.concat(frames, ignore_index=True)
    needed = {"carbs", "protein", "fat", "fiber", "rise_mgdl"}
    if not needed.issubset(df.columns):
        return {"model_id": "M2-glucose", "status": "skipped",
                "reason": f"CGMacros files must be pre-processed to columns {sorted(needed)}"}
    from sklearn.ensemble import GradientBoostingRegressor
    from sklearn.model_selection import KFold
    X = df[["carbs", "protein", "fat", "fiber"]].astype(float)
    y = df["rise_mgdl"].astype(float)
    model = GradientBoostingRegressor(random_state=SEED)
    mae = -cross_val_score(model, X, y, cv=KFold(5, shuffle=True, random_state=SEED),
                           scoring="neg_mean_absolute_error")
    model.fit(X, y)
    joblib.dump(model, BACKEND_MODELS / "m2_glucose.joblib")
    meta = {"model_id": "M2-glucose", "status": "trained", "mae_mgdl": round(float(np.mean(mae)), 2),
            "n_meals": int(len(df))}
    write_json(BACKEND_MODELS / "m2_glucose.json", meta)
    return meta


def main() -> dict:
    heart = train_heart_model()
    glucose = train_glucose_model()
    report = {"M1": heart, "M2": glucose}
    REPORTS.mkdir(parents=True, exist_ok=True)
    (REPORTS / "model_report.json").write_text(json.dumps(report, indent=1), encoding="utf-8")
    return report


if __name__ == "__main__":
    main()
