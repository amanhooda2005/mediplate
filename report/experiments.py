"""Reproducible evaluation for the MediPlate project report.

Run from the repository root:  python report/experiments.py
Writes figures to report/figures/ and numbers to report/results.json.
Every number in the report comes from this script.
"""
from __future__ import annotations

import json
import random
import statistics
import sys
import time
from collections import Counter, defaultdict
from datetime import date
from pathlib import Path

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402
import numpy as np  # noqa: E402
from matplotlib.patches import FancyArrowPatch, FancyBboxPatch  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "backend"))
sys.path.insert(0, str(ROOT / "backend" / "tests"))
sys.path.insert(0, str(ROOT / "pipeline"))
sys.path.insert(0, str(ROOT / "pipeline" / "steps"))

import pandas as pd  # noqa: E402
from sklearn.calibration import calibration_curve  # noqa: E402
from sklearn.ensemble import GradientBoostingClassifier  # noqa: E402
from sklearn.linear_model import LogisticRegression  # noqa: E402
from sklearn.metrics import brier_score_loss, confusion_matrix, roc_auc_score, roc_curve  # noqa: E402
from sklearn.model_selection import RepeatedStratifiedKFold, StratifiedKFold, cross_val_predict, cross_val_score  # noqa: E402
from sklearn.pipeline import make_pipeline  # noqa: E402
from sklearn.preprocessing import StandardScaler  # noqa: E402

from app import knowledge  # noqa: E402
from app.engine import glycemic, optimizer, ranker  # noqa: E402
from app.engine.plan_config import DAY_SLOTS, variant_nutrients  # noqa: E402
from app.engine.service import EngineInputs, generate_plan, prepare  # noqa: E402
from conftest import profile  # noqa: E402
from test_plans_property import random_patient  # noqa: E402

FIG = ROOT / "report" / "figures"
FIG.mkdir(parents=True, exist_ok=True)
RESULTS: dict = {}
K = knowledge.get()

# ---- chart style (validated reference palette; text in ink, never series colour)
CAT = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4", "#008300", "#4a3aa7", "#e34948"]
INK, INK2, MUTED, GRID, SURF = "#0b0b0b", "#52514e", "#8a8984", "#e6e5e1", "#ffffff"
OK, BAD = "#1a7f5a", "#c0392b"
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


# =============================================================== diagrams
def box(ax, x, y, w, h, text, fc="#eef4f1", ec="#1e6b52", fs=9, bold=False):
    ax.add_patch(FancyBboxPatch((x, y), w, h, boxstyle="round,pad=0.02,rounding_size=0.06", fc=fc, ec=ec, lw=1.3))
    ax.text(x + w / 2, y + h / 2, text, ha="center", va="center", fontsize=fs, color=INK,
            fontweight="bold" if bold else "normal", wrap=True)


def arrow(ax, x1, y1, x2, y2, label=None, dy=0.08):
    ax.add_patch(FancyArrowPatch((x1, y1), (x2, y2), arrowstyle="-|>", mutation_scale=12, color=INK2, lw=1.2))
    if label:
        ax.text((x1 + x2) / 2, (y1 + y2) / 2 + dy, label, ha="center", fontsize=7.5, color=INK2, style="italic")


def fig_architecture() -> None:
    fig, ax = plt.subplots(figsize=(11, 6.6))
    ax.set_xlim(0, 11)
    ax.set_ylim(0, 6.6)
    ax.axis("off")
    box(ax, 0.3, 5.6, 4.9, 0.7, "Patient (web browser, phone or laptop)", bold=True)
    box(ax, 5.8, 5.6, 4.9, 0.7, "Admin console", bold=True)
    box(ax, 0.3, 4.55, 10.4, 0.6, "React + TypeScript website  ·  English / Tamil / Hindi  ·  installable on phones")
    box(ax, 0.3, 3.55, 10.4, 0.6, "FastAPI backend  ·  login (JWT)  ·  profile  ·  plans  ·  food check  ·  logs  ·  insights")
    arrow(ax, 2.75, 5.6, 2.75, 5.17)
    arrow(ax, 8.25, 5.6, 8.25, 5.17)
    arrow(ax, 5.5, 4.55, 5.5, 4.17, "HTTPS / JSON", dy=0.0)
    eng = [("E1\nProfile\nbuilder", "#eef4f1"), ("E3\nTargets +\nconflict ledger", "#eef4f1"),
           ("E2\nSafety\nfilter", "#fbe9dc"), ("E4\nMILP\noptimizer", "#eef4f1"), ("E5\nExplainer", "#eef4f1")]
    ax.text(5.5, 3.3, "RECOMMENDATION ENGINE (runs for every plan)", ha="center", fontsize=8, color=INK2)
    for i, (t, c) in enumerate(eng):
        x = 0.3 + i * 2.12
        box(ax, x, 2.2, 1.9, 0.9, t, fc=c, ec="#b4541a" if "Safety" in t else "#1e6b52", fs=8.5)
        if i:
            arrow(ax, x - 0.22, 2.65, x, 2.65)
    arrow(ax, 1.25, 3.55, 1.25, 3.12)
    arrow(ax, 9.75, 3.1, 9.75, 3.53)
    box(ax, 0.3, 0.3, 5.0, 1.35, "", fc="#ffffff", ec=MUTED)
    ax.text(0.45, 1.5, "DATA STORES", fontsize=8, color=INK2)
    for i, t in enumerate(["D1 Patients, plans, logs\n(SQLite / PostgreSQL)", "D2 Foods + 186 dishes\n(IFCT 2017)",
                           "D3 Rules knowledge base\n(8 conditions, 65 medicines)", "D4 Model files"]):
        box(ax, 0.45 + (i % 2) * 2.45, 0.4 + (1 - i // 2) * 0.55, 2.3, 0.48, t, fc="#e8f0fa", ec="#2c5a8f", fs=7.2)
    box(ax, 5.7, 0.3, 5.0, 1.35, "", fc="#ffffff", ec=MUTED)
    ax.text(5.85, 1.5, "MODELS", fontsize=8, color=INK2)
    for i, t in enumerate(["M1 Health-risk scorer\n(trained + calculators)", "M2 Glucose response\n(personal slope)",
                           "M3 Meal ranker\n(learns from logs)", "Region tiers\nhome → neighbour → all-India"]):
        box(ax, 5.85 + (i % 2) * 2.45, 0.4 + (1 - i // 2) * 0.55, 2.3, 0.48, t, fc="#f1ecf8", ec="#6b4fa0", fs=7.2)
    arrow(ax, 3.3, 1.65, 3.3, 2.18, "foods · rules · patient data")
    arrow(ax, 8.2, 1.65, 8.2, 2.18, "risk · glucose · preference")
    ax.add_patch(FancyArrowPatch((0.3, 3.85), (0.3, 0.95), connectionstyle="arc3,rad=0.25", arrowstyle="-|>",
                                 mutation_scale=12, color=INK2, lw=1.1, linestyle="--"))
    ax.text(0.02, 2.4, "meal logs,\nlab results", fontsize=7, color=INK2, rotation=90, va="center")
    save(fig, "fig01_architecture")


def fig_pipeline() -> None:
    fig, ax = plt.subplots(figsize=(11, 3.1))
    ax.set_xlim(0, 11)
    ax.set_ylim(0, 3.1)
    ax.axis("off")
    steps = [("1 Fetch", "IFCT 2017 (npm)\nSAheart (PMLB)\ncached offline"),
             ("2 Foods", "kJ → kcal, g → mg/µg\nAtwater check\n553 foods"),
             ("3 Rules", "YAML → schema check\ntags → food codes\n195 messages × 3 lang"),
             ("4 Dishes", "186 recipes costed\nglycemic load\nregion + food tags"),
             ("5 Models", "M1 trained, 5×5 CV\nM2 if CGM data\nreports"),
             ("Backend", "loaded at start-up\nreloadable by admin")]
    for i, (t, d) in enumerate(steps):
        x = 0.2 + i * 1.8
        box(ax, x, 1.75, 1.55, 0.7, t, bold=True, fc="#e8f0fa" if i < 5 else "#eef4f1",
            ec="#2c5a8f" if i < 5 else "#1e6b52")
        ax.text(x + 0.775, 1.5, d, ha="center", va="top", fontsize=7.5, color=INK2)
        if i:
            arrow(ax, x - 0.25, 2.1, x, 2.1)
    save(fig, "fig02_pipeline")


# =============================================================== datasets
def fig_datasets() -> None:
    groups = Counter(f["group"] for f in K.foods.values())
    items = sorted(groups.items(), key=lambda kv: kv[1])
    fig, ax = plt.subplots(figsize=(7.5, 6))
    ax.barh([g for g, _ in items], [c for _, c in items], color=CAT[0], height=0.65)
    for i, (_, c) in enumerate(items):
        ax.text(c + 1.5, i, str(c), va="center", fontsize=8.5, color=INK)
    ax.set_xlabel("Number of foods")
    ax.set_title("Foods in the MediPlate food table by group (n = %d)" % len(K.foods), loc="left")
    ax.grid(axis="y", visible=False)
    save(fig, "fig03_food_groups")
    RESULTS["foods_by_group"] = dict(groups)

    zones = ["north", "south", "east", "west", "northeast", "common", "universal"]
    slots = ["breakfast", "staple", "protein", "veg", "side", "snack"]
    m = np.zeros((len(zones), len(slots)), dtype=int)
    for d in K.dishes.values():
        keys = d["zones"] or (["common"] if d["common"] else ["universal"])
        for z in keys:
            if d["slot"] in slots:
                m[zones.index(z), slots.index(d["slot"])] += 1
    fig, ax = plt.subplots(figsize=(7.5, 4.2))
    im = ax.imshow(m, cmap="Blues", vmin=0, vmax=m.max() * 1.25)
    ax.set_xticks(range(len(slots)), [s.capitalize() for s in slots])
    ax.set_yticks(range(len(zones)), ["North", "South", "East", "West", "North-East", "All-India", "Universal"])
    for i in range(len(zones)):
        for j in range(len(slots)):
            ax.text(j, i, m[i, j], ha="center", va="center", fontsize=9, color=INK if m[i, j] < m.max() * 0.7 else "white")
    ax.grid(False)
    ax.set_title("Dishes per food region and meal slot", loc="left")
    fig.colorbar(im, ax=ax, fraction=0.03, pad=0.02)
    save(fig, "fig04_dish_coverage")
    RESULTS["dish_coverage"] = {z: dict(zip(slots, m[i].tolist())) for i, z in enumerate(zones)}

    order = ["breakfast", "staple", "protein", "veg", "side", "snack"]
    data = [[d["nutrients"]["sodium_mg"] for d in K.dishes.values() if d["slot"] == s] for s in order]
    fig, axes = plt.subplots(1, 2, figsize=(11, 3.8))
    for ax, key, title, unit in ((axes[0], "sodium_mg", "Sodium per serving", "mg"),
                                 (axes[1], "potassium_mg", "Potassium per serving", "mg")):
        vals = [[d["nutrients"][key] for d in K.dishes.values() if d["slot"] == s] for s in order]
        ax.boxplot(vals, tick_labels=[s.capitalize() for s in order], widths=0.55, patch_artist=True,
                   boxprops=dict(facecolor="#dbe8f8", edgecolor=CAT[0]), medianprops=dict(color=INK),
                   whiskerprops=dict(color=MUTED), capprops=dict(color=MUTED), flierprops=dict(markeredgecolor=MUTED, markersize=4))
        ax.set_title(title + " by meal slot", loc="left")
        ax.set_ylabel(unit)
    save(fig, "fig05_dish_nutrients")
    RESULTS["dish_nutrient_medians"] = {s: {"sodium_mg": round(statistics.median(v), 1)} for s, v in zip(order, data)}


# =============================================================== M1
def model_m1() -> None:
    df = pd.read_csv(ROOT / "pipeline" / "raw" / "saheart.csv")
    X = pd.DataFrame({"age": df["Age"], "sbp": df["Sbp"], "ldl_mmol": df["Ldl"], "family_history": df["Famhist"],
                      "bmi": df["Obesity"], "smoker": (df["Tobacco"] > 0).astype(float)}).astype(float)
    y = df["target"].astype(int)
    models = {
        "Logistic regression": make_pipeline(StandardScaler(), LogisticRegression(max_iter=1000)),
        "Gradient boosting": GradientBoostingClassifier(n_estimators=150, max_depth=2, learning_rate=0.05,
                                                        subsample=0.8, random_state=42),
    }
    rcv = RepeatedStratifiedKFold(n_splits=5, n_repeats=5, random_state=42)
    cv5 = StratifiedKFold(5, shuffle=True, random_state=42)
    scores, oof = {}, {}
    for name, mdl in models.items():
        scores[name] = cross_val_score(mdl, X, y, cv=rcv, scoring="roc_auc")
        oof[name] = cross_val_predict(mdl, X, y, cv=cv5, method="predict_proba")[:, 1]

    fig, axes = plt.subplots(1, 2, figsize=(11, 4.4))
    ax = axes[0]
    for i, name in enumerate(models):
        fpr, tpr, _ = roc_curve(y, oof[name])
        ax.plot(fpr, tpr, color=CAT[i], label=f"{name} (AUC {roc_auc_score(y, oof[name]):.3f})")
    ax.plot([0, 1], [0, 1], color=MUTED, ls="--", lw=1, label="Chance")
    ax.set_xlabel("False-positive rate")
    ax.set_ylabel("True-positive rate")
    ax.set_title("ROC curves, out-of-fold (5-fold CV)", loc="left")
    ax.legend(loc="lower right", fontsize=8.5)
    ax = axes[1]
    data = [scores[n] for n in models]
    ax.boxplot(data, tick_labels=list(models), widths=0.45, patch_artist=True,
               boxprops=dict(facecolor="#f3f2ef", edgecolor=MUTED), medianprops=dict(color=INK))
    rng = np.random.default_rng(1)
    for i, s in enumerate(data):
        ax.scatter(i + 1 + rng.uniform(-0.12, 0.12, len(s)), s, s=16, color=CAT[i], zorder=3)
    ax.set_ylabel("ROC AUC")
    ax.set_title("AUC across 25 folds (5×5 repeated CV)", loc="left")
    save(fig, "fig06_m1_roc")

    best = models["Logistic regression"]
    p = oof["Logistic regression"]
    frac_pos, mean_pred = calibration_curve(y, p, n_bins=5, strategy="quantile")
    best.fit(X, y)
    coef = best.named_steps["logisticregression"].coef_[0]
    names = ["Age", "Systolic BP", "LDL cholesterol", "Family history", "BMI", "Smoker"]
    fig, axes = plt.subplots(1, 2, figsize=(11, 4.2))
    ax = axes[0]
    ax.plot([0, 1], [0, 1], color=MUTED, ls="--", lw=1, label="Perfect calibration")
    ax.plot(mean_pred, frac_pos, marker="o", color=CAT[0], label="Logistic regression")
    ax.set_xlabel("Predicted probability")
    ax.set_ylabel("Observed rate")
    ax.set_title("Calibration (quintiles, out-of-fold)", loc="left")
    ax.legend(fontsize=8.5)
    ax = axes[1]
    order = np.argsort(coef)
    ax.barh([names[i] for i in order], coef[order], color=[CAT[0] if c > 0 else CAT[1] for c in coef[order]], height=0.6)
    for j, i in enumerate(order):
        ax.text(coef[i] + (0.02 if coef[i] >= 0 else -0.02), j, f"{coef[i]:.2f}", va="center",
                ha="left" if coef[i] >= 0 else "right", fontsize=8.5)
    ax.axvline(0, color=MUTED, lw=1)
    ax.set_xlabel("Standardised coefficient (log-odds per SD)")
    ax.set_title("What drives the heart-risk score", loc="left")
    ax.grid(axis="y", visible=False)
    save(fig, "fig07_m1_calibration_coef")

    pred = (p >= 0.5).astype(int)
    tn, fp, fn, tp = confusion_matrix(y, pred).ravel()
    RESULTS["m1"] = {
        "n": int(len(y)), "positives": int(y.sum()),
        "auc_mean": {n: round(float(s.mean()), 3) for n, s in scores.items()},
        "auc_sd": {n: round(float(s.std()), 3) for n, s in scores.items()},
        "oof_auc": {n: round(float(roc_auc_score(y, oof[n])), 3) for n in models},
        "brier": round(float(brier_score_loss(y, p)), 3),
        "confusion_at_0_5": {"tn": int(tn), "fp": int(fp), "fn": int(fn), "tp": int(tp)},
        "sensitivity": round(tp / (tp + fn), 3), "specificity": round(tn / (tn + fp), 3),
        "ppv": round(tp / (tp + fp), 3) if tp + fp else None, "accuracy": round((tp + tn) / len(y), 3),
        "coefficients": {n: round(float(c), 3) for n, c in zip(names, coef)},
        "calibration": [{"pred": round(float(a), 3), "obs": round(float(b), 3)} for a, b in zip(mean_pred, frac_pos)],
    }


# =============================================================== planner evaluation
def recompute(day: dict) -> dict:
    t: dict[str, float] = defaultdict(float)
    meal_c: dict[str, float] = defaultdict(float)
    meal_of = {s: m for s, _, m in DAY_SLOTS}
    for slot, (did, portion, salt, leach) in day["choice"].items():
        n = variant_nutrients(K.dishes[did], portion, salt, leach)
        for k, v in n.items():
            t[k] += v
        meal_c[meal_of[slot]] += n["carb_g"]
    return {"totals": t, "meal_carbs": meal_c}


def planner_eval(n_patients: int = 100, days: int = 3) -> None:
    states = sorted(K.states)
    rows = []
    violations = 0
    checks_total = 0
    soft = defaultdict(lambda: Counter())
    ratio_points = defaultdict(list)
    solve_times = []
    home_share = []
    ledger_counts = []
    removed_counts = []
    for seed in range(n_patients):
        rng = random.Random(5000 + seed)
        p, labs = random_patient(rng, states)
        inputs = EngineInputs(p, labs, [], [])
        st = prepare(inputs)
        removed_counts.append(len([d for d in st.safety.removed if K.dishes[d]["slot"] != "sweet"]))
        ledger_counts.append(sum(1 for m in st.targets.ledger if m["key"] == "conflict"))
        t0 = time.time()
        plan = generate_plan(inputs, date(2026, 9, 21), days=days)
        solve_times.append((time.time() - t0) / days)
        for d in plan["days"]:
            rows.append({"tier": d["tier"], "relaxed": d["relaxed"], "feasible": d["feasible"]})
            if not d["feasible"]:
                continue
            r = recompute(d)
            ts = st.targets
            for n, lim in ts.limits.items():
                v = r["totals"][n]
                for bound, hv in (("max", lim.max_hard), ("min", lim.min_hard)):
                    if hv is None or (d["relaxed"] and (lim.max_priority if bound == "max" else lim.min_priority) > 2):
                        continue
                    checks_total += 1
                    if (bound == "max" and v > hv + 1e-3) or (bound == "min" and v < hv - 1e-3):
                        violations += 1
                    if bound == "max" and n in ("sodium_mg", "potassium_mg", "phosphorus_mg", "protein_g"):
                        ratio_points[n].append(v / hv)
                if lim.max_soft is not None:
                    soft[n]["met" if v <= lim.max_soft * 1.02 else "missed"] += 1
                if lim.min_soft is not None:
                    soft[n]["met" if v >= lim.min_soft * 0.98 else "missed"] += 1
            if ts.meal_carb_min:
                for m in ("breakfast", "lunch", "dinner"):
                    checks_total += 1
                    if r["meal_carbs"][m] < ts.meal_carb_min - 1e-3:
                        violations += 1
            if ts.vitk_band:
                checks_total += 1
                if not ts.vitk_band[0] - 1e-3 <= r["totals"]["vitk_ug"] <= ts.vitk_band[1] + 1e-3:
                    violations += 1
            e = r["totals"]["energy_kcal"]
            if not d["relaxed"]:
                checks_total += 1
                if not 0.85 * ts.energy_kcal - 1 <= e <= 1.15 * ts.energy_kcal + 1:
                    violations += 1
            regional = [K.dishes[v[0]] for v in d["choice"].values() if not K.dishes[v[0]]["universal"]]
            if regional:
                home_share.append(sum(1 for x in regional if st.ctx.zone in x["zones"] or
                                      (st.ctx.second_zone and st.ctx.second_zone in x["zones"])) / len(regional))
            for v in d["choice"].values():
                if v[0] in st.safety.removed:
                    violations += 1
        print(f"  patient {seed + 1}/{n_patients}", end="\r", flush=True)
    print()
    tiers = Counter((r["tier"], r["relaxed"]) for r in rows)
    RESULTS["planner"] = {
        "patients": n_patients, "days": len(rows), "feasible_days": sum(r["feasible"] for r in rows),
        "hard_checks": checks_total, "hard_violations": violations,
        "tiers": {f"tier{t}{'_relaxed' if rel else ''}": c for (t, rel), c in tiers.items()},
        "home_share_mean": round(float(np.mean(home_share)), 4), "home_share_min": round(float(np.min(home_share)), 4),
        "solve_s_per_day": {"median": round(statistics.median(solve_times), 2),
                            "p90": round(float(np.percentile(solve_times, 90)), 2), "max": round(max(solve_times), 2)},
        "soft_goal_met_pct": {n: round(100 * c["met"] / (c["met"] + c["missed"]), 1) for n, c in soft.items()},
        "removed_dishes_median": statistics.median(removed_counts),
        "patients_with_conflicts": sum(1 for c in ledger_counts if c > 0),
    }

    fig, axes = plt.subplots(1, 2, figsize=(11, 4))
    ax = axes[0]
    labels = {"sodium_mg": "Sodium", "potassium_mg": "Potassium", "phosphorus_mg": "Phosphorus", "protein_g": "Protein"}
    keys = [k for k in labels if ratio_points[k]]
    rng = np.random.default_rng(2)
    for i, k in enumerate(keys):
        v = np.array(ratio_points[k])
        ax.scatter(i + rng.uniform(-0.18, 0.18, len(v)), v, s=10, alpha=0.55, color=CAT[0])
        ax.text(i, 1.06, f"n={len(v)}", ha="center", fontsize=8, color=INK2)
    ax.axhline(1.0, color=BAD, lw=1.4, ls="--")
    ax.text(len(keys) - 0.5, 1.005, "safety limit", color=BAD, fontsize=8, ha="right", va="bottom")
    ax.set_xticks(range(len(keys)), [labels[k] for k in keys])
    ax.set_ylim(0, 1.15)
    ax.set_ylabel("Day total ÷ hard limit")
    ax.set_title("Every planned day stays under its hard limits", loc="left")
    ax = axes[1]
    ax.hist(solve_times, bins=20, color=CAT[0], edgecolor="white")
    ax.set_xlabel("Seconds per planned day (2-core machine)")
    ax.set_ylabel("Patients")
    ax.set_title("Optimizer time per day", loc="left")
    save(fig, "fig08_planner_limits_time")

    names = {"fiber_g": "Fibre (min)", "satfat_g": "Saturated fat", "sugar_g": "Added sugar", "carb_g": "Carbohydrate",
             "protein_g": "Protein", "potassium_mg": "Potassium", "sodium_mg": "Sodium", "phosphorus_mg": "Phosphorus"}
    items = sorted(((names.get(n, n), pct) for n, pct in RESULTS["planner"]["soft_goal_met_pct"].items()), key=lambda x: x[1])
    fig, ax = plt.subplots(figsize=(7.5, 3.8))
    ax.barh([a for a, _ in items], [b for _, b in items], color=CAT[2], height=0.6)
    for i, (_, b) in enumerate(items):
        ax.text(b + 1, i, f"{b:.0f}%", va="center", fontsize=8.5)
    ax.set_xlim(0, 110)
    ax.set_xlabel("% of planned days meeting the goal")
    ax.set_title("Soft goals (traded off, not enforced)", loc="left")
    ax.grid(axis="y", visible=False)
    save(fig, "fig09_soft_goals")


def region_ablation(per_zone: int = 8, days: int = 2) -> None:
    zone_states = defaultdict(list)
    for s, z in K.states.items():
        zone_states[z].append(s)
    zones = ["north", "south", "east", "west", "northeast"]
    out = {"with_region_first": {}, "without": {}}
    saved = dict(optimizer.ORIGIN_COST), dict(optimizer.TIER_ORIGINS)
    for mode in ("with_region_first", "without"):
        if mode == "without":
            for k in optimizer.ORIGIN_COST:
                optimizer.ORIGIN_COST[k] = 0
            for t in (1, 2):
                optimizer.TIER_ORIGINS[t] = optimizer.TIER_ORIGINS[3]
            # without region logic every regional dish counts as available
            orig_origin = optimizer.dish_origin
            optimizer.dish_origin = lambda dish, ctx: "universal" if dish["universal"] else (
                "home" if ctx.zone in dish["zones"] else "common")
        for z in zones:
            shares = []
            for i in range(per_zone):
                rng = random.Random(900 + i)
                p = profile(state=zone_states[z][i % len(zone_states[z])], diet_type=rng.choice(["veg", "nonveg"]),
                            diseases={"diabetes": {"type": "type2"}, "hypertension": {}} if i % 2 else {"obesity": {}})
                plan = generate_plan(EngineInputs(p, {}, [], []), date(2026, 9, 21), days=days)
                for d in plan["days"]:
                    reg = [K.dishes[v[0]] for v in d["choice"].values() if not K.dishes[v[0]]["universal"]]
                    shares.append(sum(1 for x in reg if z in x["zones"]) / max(1, len(reg)))
            out[mode][z] = round(100 * float(np.mean(shares)), 1)
        if mode == "without":
            optimizer.dish_origin = orig_origin
    optimizer.ORIGIN_COST.clear()
    optimizer.ORIGIN_COST.update(saved[0])
    optimizer.TIER_ORIGINS.clear()
    optimizer.TIER_ORIGINS.update(saved[1])
    RESULTS["region_ablation_pct_home"] = out
    fig, ax = plt.subplots(figsize=(8, 3.8))
    x = np.arange(len(zones))
    w = 0.36
    a = [out["with_region_first"][z] for z in zones]
    b = [out["without"][z] for z in zones]
    ax.bar(x - w / 2 - 0.01, a, w, color=CAT[0], label="Region-first (MediPlate)")
    ax.bar(x + w / 2 + 0.01, b, w, color=CAT[1], label="No region preference")
    for i in range(len(zones)):
        ax.text(x[i] - w / 2, a[i] + 1.5, f"{a[i]:.0f}%", ha="center", fontsize=8.5)
        ax.text(x[i] + w / 2, b[i] + 1.5, f"{b[i]:.0f}%", ha="center", fontsize=8.5)
    ax.set_xticks(x, ["North", "South", "East", "West", "North-East"])
    ax.set_ylim(0, 112)
    ax.set_ylabel("% of regional dishes from home zone")
    ax.set_title("Effect of region-first planning", loc="left")
    ax.legend(loc="upper center", ncol=2, bbox_to_anchor=(0.5, -0.12))
    save(fig, "fig10_region_ablation")


def safety_effect() -> None:
    base = dict(state="Tamil Nadu", diet_type="nonveg")
    scenarios = [
        ("No conditions", {}),
        ("Vegetarian", dict(diet_type="veg")),
        ("Peanut + milk allergy", dict(allergies=["peanut", "milk"])),
        ("Gout", dict(diseases={"arthritis": {"type": "gout"}})),
        ("Kidney disease stage 4", dict(diseases={"ckd": {"stage": 4}})),
        ("Warfarin", dict(medicines=["warfarin"])),
        ("Simvastatin", dict(medicines=["simvastatin"])),
        ("Diabetes + BP + CKD 4 + warfarin", dict(diseases={"diabetes": {"type": "type2"}, "hypertension": {}, "ckd": {"stage": 4}},
                                                  medicines=["warfarin", "telmisartan"])),
    ]
    rows = []
    for name, over in scenarios:
        p = profile(**{**base, **over})
        st = prepare(EngineInputs(p, {}, [], []))
        removed = [d for d in st.safety.removed if K.dishes[d]["slot"] != "sweet"]
        limited = [d for d in st.safety.limited if K.dishes[d]["slot"] != "sweet"]
        rows.append((name, len(removed), len(limited)))
    RESULTS["safety_scenarios"] = [{"scenario": a, "removed": b, "limited": c} for a, b, c in rows]
    fig, ax = plt.subplots(figsize=(8, 4))
    names = [r[0] for r in rows][::-1]
    vals = [r[1] for r in rows][::-1]
    ax.barh(names, vals, color=CAT[1], height=0.6)
    for i, v in enumerate(vals):
        ax.text(v + 0.8, i, str(v), va="center", fontsize=8.5)
    ax.set_xlabel("Dishes removed before planning (of %d plan dishes)" %
                  sum(1 for d in K.dishes.values() if d["slot"] != "sweet"))
    ax.set_title("What the safety filter removes, by patient", loc="left")
    ax.grid(axis="y", visible=False)
    save(fig, "fig11_safety_filter")


def ranker_learning(rounds: int = 6) -> None:
    p = profile(state="Tamil Nadu", diet_type="veg", diseases={"diabetes": {"type": "type2"}})
    logs: list[dict] = []
    target = None
    series_dish, series_family = [], []
    for r in range(rounds):
        plan = generate_plan(EngineInputs(p, {}, logs, []), date(2026, 9, 21), days=3)
        ids = [v[0] for d in plan["days"] for v in d["choice"].values()]
        if target is None:
            prot = Counter(i for i in ids if K.dishes[i]["slot"] in ("protein", "veg"))
            target = prot.most_common(1)[0][0]
            main = K.dishes[target]["key_ingredients"][0]["code"]
        fam = [i for i in ids if any(ki["code"] == main for ki in K.dishes[i]["key_ingredients"])]
        series_dish.append(ids.count(target))
        series_family.append(len(fam))
        for d in plan["days"]:
            for v in d["choice"].values():
                if v[0] == target:
                    logs.append({"dish_id": target, "status": "skipped", "rating": -1})
                else:
                    logs.append({"dish_id": v[0], "status": "ate", "rating": 0})
    RESULTS["ranker"] = {"disliked_dish": target, "main_ingredient": K.foods[main]["name"],
                         "appearances_of_dish": series_dish, "appearances_same_main_ingredient": series_family}
    fig, ax = plt.subplots(figsize=(7.5, 3.6))
    x = np.arange(1, rounds + 1)
    ax.plot(x, series_family, marker="o", color=CAT[1], label=f"Dishes whose main ingredient is {K.foods[main]['name'].split(',')[0]}")
    ax.plot(x, series_dish, marker="o", color=CAT[0], label=f"The disliked dish ({K.dishes[target]['name']})")
    ax.set_xticks(x)
    ax.set_xlabel("Planning round (3-day plan each; patient dislikes the dish every time)")
    ax.set_ylabel("Times planned")
    ax.set_title("M3 learns from dislikes", loc="left")
    ax.legend(fontsize=8.5, loc="upper right")
    save(fig, "fig12_ranker")


def glucose_personalisation(true_slope: float = 4.0, noise: float = 12.0, sims: int = 300, n_max: int = 15) -> None:
    rng = np.random.default_rng(7)
    est = np.full((sims, n_max), np.nan)
    for s in range(sims):
        gls = rng.uniform(15, 40, n_max)
        rises = true_slope * gls + rng.normal(0, noise, n_max)
        for n in range(1, n_max + 1):
            m = glycemic.fit(list(zip(gls[:n], rises[:n])))
            if m.slope is not None:
                est[s, n - 1] = m.slope
    x = np.arange(1, n_max + 1)
    mean = np.nanmean(est, axis=0)
    lo = np.nanpercentile(est, 5, axis=0)
    hi = np.nanpercentile(est, 95, axis=0)
    RESULTS["m2_simulation"] = {"true_slope": true_slope, "noise_sd": noise, "sims": sims,
                                "by_n": {int(n): {"mean": round(float(m), 2), "p5": round(float(a), 2), "p95": round(float(b), 2)}
                                         for n, m, a, b in zip(x, mean, lo, hi) if not np.isnan(m)}}
    fig, ax = plt.subplots(figsize=(7.5, 3.6))
    ok = ~np.isnan(mean)
    ax.fill_between(x[ok], lo[ok], hi[ok], color="#cde2fb", label="90% of simulated patients")
    ax.plot(x[ok], mean[ok], color=CAT[0], marker="o", label="Mean estimate")
    ax.axhline(true_slope, color=INK2, ls="--", lw=1.2, label="True response (simulated)")
    ax.set_xlabel("Before/after-meal readings logged")
    ax.set_ylabel("mg/dL rise per unit glycemic load")
    ax.set_title("M2 personal glucose response: estimate vs readings (simulation)", loc="left")
    ax.set_xticks(x)
    ax.legend(fontsize=8.5, loc="upper right")
    save(fig, "fig13_glucose_simulation")


# =============================================================== case studies
PERSONAS = {
    "A": dict(title="Tamil Nadu · 58 M · diabetes + high BP + kidney disease stage 4",
              p=dict(age=58, sex="male", height_cm=168, weight_kg=82, state="Tamil Nadu", diet_type="nonveg",
                     diseases={"diabetes": {"type": "type2"}, "hypertension": {}, "ckd": {"stage": 4}},
                     medicines=["metformin", "glimepiride", "telmisartan", "atorvastatin"]),
              labs={"creatinine": 2.6, "potassium": 5.2, "sbp": 146, "dbp": 88, "ldl": 128, "hba1c": 8.1}),
    "B": dict(title="Punjab · 52 F · diabetes + high BP + osteoarthritis, on warfarin",
              p=dict(age=52, sex="female", height_cm=155, weight_kg=72, waist_cm=94, state="Punjab", diet_type="veg",
                     allergies=["peanut"], diseases={"diabetes": {"type": "type2"}, "hypertension": {},
                                                     "arthritis": {"type": "osteoarthritis"}},
                     medicines=["metformin", "amlodipine", "warfarin"]),
              labs={"hba1c": 7.9, "sbp": 150, "dbp": 92, "ldl": 140, "creatinine": 0.9}),
    "C": dict(title="Assam · 45 M · gout + fatty liver",
              p=dict(age=45, sex="male", height_cm=165, weight_kg=78, activity="moderate", state="Assam",
                     diet_type="nonveg", diseases={"arthritis": {"type": "gout"}, "fatty_liver": {}},
                     medicines=["allopurinol"]),
              labs={"alt": 65, "ast": 48, "platelets": 210}),
}


def case_studies() -> None:
    out = {}
    for key, persona in PERSONAS.items():
        inputs = EngineInputs(profile(**persona["p"]), persona["labs"], [], [])
        plan = generate_plan(inputs, date(2026, 9, 21), days=1)
        d = plan["days"][0]
        meals = {m: [f"{i['name']}" + (f" ×{i['portion']}" if i["portion"] != 1 else "") +
                     (" (½ salt)" if i["salt"] == 0.5 else " (¼ salt)" if i["salt"] == 0.25 else "")
                     for i in items] for m, items in d["meals"].items()}
        checks = [c for c in d["checks"] if c["max"] or c["min"]]
        out[key] = {"title": persona["title"], "meals": meals,
                    "checks": [{k: c[k] for k in ("nutrient", "value", "min", "max", "status", "unit", "hard")} for c in checks],
                    "ledger": [m["text"] for m in plan["targets"]["ledger"]],
                    "removed": plan["removed"]["health_count"], "energy": plan["targets"]["energy_kcal"],
                    "insights": [i["message"]["text"] for i in plan["insights"]],
                    "schedule": [(s["name"], s["timing"]["text"]) for s in plan["targets"]["medicine_schedule"]]}
        nice = {"energy_kcal": "Energy", "sodium_mg": "Sodium", "potassium_mg": "Potassium", "phosphorus_mg": "Phosphorus",
                "protein_g": "Protein", "carb_g": "Carbs", "sugar_g": "Added sugar", "satfat_g": "Sat. fat",
                "fiber_g": "Fibre", "vitk_ug": "Vitamin K"}
        fig, ax = plt.subplots(figsize=(7.5, 3.4))
        rows = []
        for c in checks:
            ref = c["max"] if c["max"] else c["min"]
            rows.append((nice.get(c["nutrient"], c["nutrient"]), 100 * c["value"] / ref, "max" if c["max"] else "min", c["hard"]))
        rows = rows[::-1]
        colors = [CAT[0] if r[2] == "max" else CAT[2] for r in rows]
        ax.barh([r[0] for r in rows], [r[1] for r in rows], color=colors, height=0.6)
        for i, r in enumerate(rows):
            ax.text(r[1] + 2, i, f"{r[1]:.0f}% of {'limit' if r[2] == 'max' else 'minimum'}" + (" · safety" if r[3] else ""),
                    va="center", fontsize=7.8)
        ax.axvline(100, color=INK2, ls="--", lw=1)
        ax.set_xlim(0, 175)
        ax.set_xlabel("Day 1 total as % of the limit (blue = upper limit, aqua = minimum)")
        ax.set_title(f"Patient {key}: {persona['title']}", loc="left", fontsize=9.5)
        ax.grid(axis="y", visible=False)
        save(fig, f"fig14_case_{key}")
    RESULTS["cases"] = out


def main() -> None:
    t = time.time()
    print("diagrams");  fig_architecture();  fig_pipeline()
    print("datasets");  fig_datasets()
    print("M1");  model_m1()
    print("planner");  planner_eval()
    print("region");  region_ablation()
    print("safety");  safety_effect()
    print("ranker");  ranker_learning()
    print("glucose");  glucose_personalisation()
    print("cases");  case_studies()
    RESULTS["manifest"] = K.manifest
    RESULTS["runtime_s"] = round(time.time() - t, 1)
    (ROOT / "report" / "results.json").write_text(json.dumps(RESULTS, indent=1, ensure_ascii=False), encoding="utf-8")
    print("done in", RESULTS["runtime_s"], "s")


if __name__ == "__main__":
    main()
