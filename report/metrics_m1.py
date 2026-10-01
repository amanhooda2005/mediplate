"""Classification metrics for the M1 heart-risk model.

Run from the repository root:  python report/metrics_m1.py
Adds figures fig15-fig17 to report/figures/ and the key "m1_metrics" to
report/results.json. Accuracy, precision, recall and F1 are reported three
ways for both candidate models: on the training data itself, out-of-fold
under repeated cross-validation, and on a held-out 30% test split.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402
import numpy as np  # noqa: E402
import pandas as pd  # noqa: E402
from sklearn.ensemble import GradientBoostingClassifier  # noqa: E402
from sklearn.linear_model import LogisticRegression  # noqa: E402
from sklearn.metrics import (  # noqa: E402
    accuracy_score, average_precision_score, classification_report, confusion_matrix, f1_score,
    precision_recall_curve, precision_score, recall_score, roc_auc_score,
)
from sklearn.model_selection import (  # noqa: E402
    RepeatedStratifiedKFold, StratifiedKFold, cross_val_predict, cross_validate, train_test_split,
)
from sklearn.pipeline import make_pipeline  # noqa: E402
from sklearn.preprocessing import StandardScaler  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
FIG = ROOT / "report" / "figures"
RESULTS_FILE = ROOT / "report" / "results.json"
SEED = 42
FEATURES = ["age", "sbp", "ldl_mmol", "family_history", "bmi", "smoker"]

CAT = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4", "#008300", "#4a3aa7", "#e34948"]
INK, INK2, MUTED, GRID, SURF = "#0b0b0b", "#52514e", "#8a8984", "#e6e5e1", "#ffffff"
plt.rcParams.update({
    "font.family": "DejaVu Sans", "font.size": 10, "axes.edgecolor": MUTED, "axes.labelcolor": INK2,
    "xtick.color": INK2, "ytick.color": INK2, "axes.titlesize": 11, "axes.titleweight": "bold",
    "axes.titlecolor": INK, "axes.spines.top": False, "axes.spines.right": False,
    "axes.grid": True, "grid.color": GRID, "grid.linewidth": 0.8, "axes.axisbelow": True,
    "figure.dpi": 110, "savefig.dpi": 200, "savefig.bbox": "tight", "legend.frameon": False,
    "lines.linewidth": 2,
})


def save(fig, name: str) -> None:
    fig.savefig(FIG / f"{name}.png", facecolor=SURF)
    plt.close(fig)
    print("  figure", name, flush=True)


def load_saheart() -> tuple[pd.DataFrame, pd.Series]:
    df = pd.read_csv(ROOT / "pipeline" / "raw" / "saheart.csv")
    X = pd.DataFrame({
        "age": df["Age"].astype(float),
        "sbp": df["Sbp"].astype(float),
        "ldl_mmol": df["Ldl"].astype(float),
        "family_history": df["Famhist"].astype(float),
        "bmi": df["Obesity"].astype(float),
        "smoker": (df["Tobacco"] > 0).astype(float),
    })
    return X[FEATURES], df["target"].astype(int)


def models() -> dict:
    return {
        "Logistic regression": make_pipeline(StandardScaler(), LogisticRegression(max_iter=1000, C=1.0)),
        "Gradient boosting": GradientBoostingClassifier(n_estimators=150, max_depth=2, learning_rate=0.05,
                                                        subsample=0.8, random_state=SEED),
    }


def row(y_true, y_pred, proba=None) -> dict:
    tn, fp, fn, tp = confusion_matrix(y_true, y_pred, labels=[0, 1]).ravel()
    out = {
        "accuracy": round(float(accuracy_score(y_true, y_pred)), 3),
        "precision": round(float(precision_score(y_true, y_pred, zero_division=0)), 3),
        "recall": round(float(recall_score(y_true, y_pred, zero_division=0)), 3),
        "f1": round(float(f1_score(y_true, y_pred, zero_division=0)), 3),
        "specificity": round(float(tn / (tn + fp)), 3),
        "tn": int(tn), "fp": int(fp), "fn": int(fn), "tp": int(tp),
    }
    if proba is not None:
        out["auc"] = round(float(roc_auc_score(y_true, proba)), 3)
    return out


def main() -> None:
    X, y = load_saheart()
    res: dict = {
        "dataset": "South African Heart Disease (Rousseauw et al. 1983), via PMLB",
        "n_rows": int(len(y)), "n_features": len(FEATURES),
        "positives": int(y.sum()), "negatives": int((1 - y).sum()),
        "positive_rate": round(float(y.mean()), 3),
        "threshold": 0.5,
        "split": {"train_rows": 0, "test_rows": 0},
        "train": {}, "cv": {}, "holdout": {}, "per_class": {}, "thresholds": [], "oof": {},
    }

    X_tr, X_te, y_tr, y_te = train_test_split(X, y, test_size=0.3, stratify=y, random_state=SEED)
    res["split"] = {
        "train_rows": int(len(y_tr)), "train_positives": int(y_tr.sum()),
        "test_rows": int(len(y_te)), "test_positives": int(y_te.sum()),
    }

    scoring = {"accuracy": "accuracy", "precision": "precision", "recall": "recall",
               "f1": "f1", "roc_auc": "roc_auc"}
    cv = RepeatedStratifiedKFold(n_splits=5, n_repeats=5, random_state=SEED)

    oof_proba: dict = {}
    for name, model in models().items():
        # 1. fit on everything, score on the same rows (training / resubstitution)
        model.fit(X, y)
        p_tr = model.predict_proba(X)[:, 1]
        res["train"][name] = row(y, (p_tr >= 0.5).astype(int), p_tr)

        # 2. repeated stratified 5-fold cross-validation (mean +/- sd over 25 folds)
        cvres = cross_validate(models()[name], X, y, cv=cv, scoring=scoring, n_jobs=-1)
        res["cv"][name] = {k: {"mean": round(float(cvres[f"test_{k}"].mean()), 3),
                               "sd": round(float(cvres[f"test_{k}"].std()), 3)}
                           for k in scoring}
        res["cv"][name]["folds"] = int(len(cvres["test_accuracy"]))

        # 3. single 5-fold out-of-fold predictions -> one honest confusion matrix
        oof = cross_val_predict(models()[name], X, y, cv=StratifiedKFold(5, shuffle=True, random_state=SEED),
                                method="predict_proba")[:, 1]
        oof_proba[name] = oof
        res["oof"][name] = row(y, (oof >= 0.5).astype(int), oof)
        res["oof"][name]["average_precision"] = round(float(average_precision_score(y, oof)), 3)

        # 4. held-out 30% test split
        m = models()[name]
        m.fit(X_tr, y_tr)
        p_te = m.predict_proba(X_te)[:, 1]
        p_fit = m.predict_proba(X_tr)[:, 1]
        res["holdout"][name] = {
            "train_part": row(y_tr, (p_fit >= 0.5).astype(int), p_fit),
            "test_part": row(y_te, (p_te >= 0.5).astype(int), p_te),
        }

    chosen = "Logistic regression"
    res["chosen"] = chosen

    # per-class report on the out-of-fold predictions of the chosen model
    rep = classification_report(y, (oof_proba[chosen] >= 0.5).astype(int),
                                target_names=["No heart disease", "Heart disease"],
                                output_dict=True, zero_division=0)
    res["per_class"] = {k: ({kk: round(float(vv), 3) for kk, vv in v.items()} if isinstance(v, dict)
                            else round(float(v), 3)) for k, v in rep.items()}

    # threshold sweep on the chosen model's out-of-fold probabilities
    for t in [0.30, 0.35, 0.40, 0.45, 0.50, 0.55, 0.60]:
        r = row(y, (oof_proba[chosen] >= t).astype(int))
        r["threshold"] = t
        res["thresholds"].append(r)
    grid = np.linspace(0.05, 0.80, 120)
    f1s = [f1_score(y, (oof_proba[chosen] >= t).astype(int), zero_division=0) for t in grid]
    res["best_f1_threshold"] = round(float(grid[int(np.argmax(f1s))]), 3)
    res["best_f1"] = round(float(max(f1s)), 3)

    # ------------------------------------------------------------------ figures
    # fig15: confusion matrices, chosen model, training fit vs out-of-fold
    fig, axes = plt.subplots(1, 2, figsize=(9.6, 4.1))
    panels = [("Training data (fit and scored on all 462)", res["train"][chosen]),
              ("Cross-validated (out-of-fold, 5-fold)", res["oof"][chosen])]
    for ax, (title, m) in zip(axes, panels):
        cm = np.array([[m["tn"], m["fp"]], [m["fn"], m["tp"]]])
        ax.imshow(cm, cmap="Blues", vmin=0, vmax=cm.max() * 1.15)
        for i in range(2):
            for j in range(2):
                ax.text(j, i, f"{cm[i, j]}", ha="center", va="center", fontsize=15,
                        fontweight="bold", color="#ffffff" if cm[i, j] > cm.max() * 0.6 else INK)
        ax.set_xticks([0, 1], ["Predicted\nlow risk", "Predicted\nhigh risk"])
        ax.set_yticks([0, 1], ["Actual\nno disease", "Actual\ndisease"])
        ax.set_title(title, fontsize=10)
        ax.grid(False)
        ax.text(0.5, -0.30, f"accuracy {m['accuracy']:.3f} · precision {m['precision']:.3f} · "
                            f"recall {m['recall']:.3f} · F1 {m['f1']:.3f}",
                transform=ax.transAxes, ha="center", fontsize=9, color=INK2)
    save(fig, "fig15_m1_confusion")

    # fig16: accuracy / precision / recall / F1 bars, both models, train vs CV vs held-out test
    fig, axes = plt.subplots(1, 2, figsize=(10.6, 4.2), sharey=True)
    keys = ["accuracy", "precision", "recall", "f1"]
    labels = ["Accuracy", "Precision", "Recall", "F1"]
    for ax, name in zip(axes, res["train"]):
        sets = [("Training data", [res["train"][name][k] for k in keys], CAT[0]),
                ("5-fold CV (mean)", [res["cv"][name][k]["mean"] for k in keys], CAT[2]),
                ("Held-out test 30%", [res["holdout"][name]["test_part"][k] for k in keys], CAT[3])]
        x = np.arange(len(keys))
        w = 0.26
        for i, (lab, vals, c) in enumerate(sets):
            bars = ax.bar(x + (i - 1) * w, vals, w, color=c, label=lab)
            ax.bar_label(bars, fmt="%.2f", fontsize=7.5, color=INK2, padding=1)
        errs = [res["cv"][name][k]["sd"] for k in keys]
        ax.errorbar(x, [res["cv"][name][k]["mean"] for k in keys], yerr=errs, fmt="none",
                    ecolor=INK2, elinewidth=1, capsize=3)
        ax.set_xticks(x, labels)
        ax.set_ylim(0, 1.0)
        ax.set_title(name + (" (chosen)" if name == chosen else ""), fontsize=10)
    axes[0].set_ylabel("score at threshold 0.5")
    axes[0].legend(fontsize=8.5, loc="lower right")
    save(fig, "fig16_m1_metric_bars")

    # fig17: precision-recall curve and threshold sweep
    fig, axes = plt.subplots(1, 2, figsize=(10.4, 4.1))
    ax = axes[0]
    for i, (name, p) in enumerate(oof_proba.items()):
        pr, rc, _ = precision_recall_curve(y, p)
        ax.plot(rc, pr, color=CAT[i], label=f"{name} (AP {average_precision_score(y, p):.3f})")
    ax.axhline(float(y.mean()), color=MUTED, ls="--", lw=1.2)
    ax.text(0.02, float(y.mean()) + 0.02, f"always-say-yes baseline {y.mean():.2f}", fontsize=8, color=INK2)
    ax.set_xlabel("Recall")
    ax.set_ylabel("Precision")
    ax.set_ylim(0, 1)
    ax.set_title("Precision-recall, out-of-fold", fontsize=10)
    ax.legend(fontsize=8.5, loc="upper right")

    ax = axes[1]
    p = oof_proba[chosen]
    acc = [accuracy_score(y, (p >= t).astype(int)) for t in grid]
    prec = [precision_score(y, (p >= t).astype(int), zero_division=0) for t in grid]
    rec = [recall_score(y, (p >= t).astype(int), zero_division=0) for t in grid]
    for vals, lab, c in [(acc, "Accuracy", CAT[0]), (prec, "Precision", CAT[1]),
                         (rec, "Recall", CAT[2]), (f1s, "F1", CAT[3])]:
        ax.plot(grid, vals, color=c, label=lab)
    ax.axvline(0.5, color=INK2, ls=":", lw=1.2)
    ax.text(0.51, 0.04, "threshold used\nin the app", fontsize=8, color=INK2)
    ax.set_xlabel("High-risk threshold")
    ax.set_ylabel("Score")
    ax.set_ylim(0, 1)
    ax.set_title(f"{chosen}: metrics against threshold", fontsize=10)
    ax.legend(fontsize=8.5, loc="upper right", ncol=2)
    save(fig, "fig17_m1_threshold")

    results = json.loads(RESULTS_FILE.read_text(encoding="utf-8"))
    results["m1_metrics"] = res
    RESULTS_FILE.write_text(json.dumps(results, indent=1), encoding="utf-8")
    print(json.dumps({"train": res["train"], "cv": res["cv"], "oof": res["oof"],
                      "holdout": res["holdout"], "best_f1_threshold": res["best_f1_threshold"]}, indent=1))


if __name__ == "__main__":
    main()
