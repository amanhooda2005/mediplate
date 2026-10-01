"""Reduce a CGMacros download to the meal table that step 5 trains M2 on.

CGMacros (PhysioNet) ships a continuous glucose trace per participant with the
logged meals written into the same rows. Step 5 of the pipeline wants one row
per meal with the columns `carbs, protein, fat, fiber, rise_mgdl`, so this tool
does that reduction:

    for each logged meal
        baseline = the glucose reading at the meal
        peak     = the highest glucose in the next 2 hours
        rise     = peak - baseline

    python pipeline/tools/cgmacros_prep.py ~/Downloads/cgmacros --dry-run
    python pipeline/tools/cgmacros_prep.py ~/Downloads/cgmacros
    python pipeline/run_all.py        # step 5 now trains M2

A meal is dropped, and counted in the summary, when:
  * another meal falls inside its 2-hour window (the rise cannot be attributed),
  * the trace ends before the window closes,
  * the trace has a gap longer than `--max-gap` minutes inside the window,
  * there is no reading near the meal to use as a baseline.

Column names are detected rather than assumed, because the published files have
changed between releases; every choice is printed so it can be checked. Use
--glucose-col / --time-col and the macro flags to override.
"""
from __future__ import annotations

import argparse
import csv
import sys
from datetime import datetime, timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from common import RAW, log  # noqa: E402

OUT_DEFAULT = RAW / "cgmacros" / "meals.csv"
OUT_COLUMNS = ["subject", "timestamp", "carbs", "protein", "fat", "fiber", "baseline_mgdl", "peak_mgdl", "rise_mgdl"]
MMOL_TO_MGDL = 18.0

# Candidate column names, best first. Matching is case-insensitive on a
# squashed form of the header, so "Libre GL" also matches "libre_gl".
CANDIDATES: dict[str, list[str]] = {
    "time": ["timestamp", "time", "datetime", "date time", "localtime"],
    "glucose": ["dexcom gl", "libre gl", "glucose", "glucose value", "cgm", "gl", "sensor glucose"],
    "carbs": ["carbs", "carbohydrate", "carbohydrates", "carbs g", "carb"],
    "protein": ["protein", "protein g"],
    "fat": ["fat", "fat g", "total fat"],
    "fiber": ["fiber", "fibre", "fiber g", "dietary fiber"],
    "calories": ["calories", "energy", "kcal"],
}
TIME_FORMATS = ["%Y-%m-%d %H:%M:%S", "%Y-%m-%d %H:%M", "%d-%m-%Y %H:%M:%S", "%d/%m/%Y %H:%M",
                "%m/%d/%Y %H:%M:%S", "%m/%d/%Y %H:%M", "%Y-%m-%dT%H:%M:%S"]


def _squash(s: str) -> str:
    return " ".join(s.replace("_", " ").replace("-", " ").strip().lower().split())


def pick_column(headers: list[str], role: str, override: str | None = None) -> str | None:
    if override:
        if override not in headers:
            raise ValueError(f"column {override!r} is not in the file; headers are {headers}")
        return override
    squashed = {_squash(h): h for h in headers}
    for want in CANDIDATES[role]:
        if want in squashed:
            return squashed[want]
    for want in CANDIDATES[role]:           # then a looser contains-match
        for s, original in squashed.items():
            if want in s:
                return original
    return None


def _num(value: str | None) -> float | None:
    if value is None:
        return None
    value = value.strip()
    if not value or value.lower() in {"na", "nan", "null", "-"}:
        return None
    try:
        return float(value)
    except ValueError:
        return None


def _time(value: str) -> datetime | None:
    value = value.strip()
    for fmt in TIME_FORMATS:
        try:
            return datetime.strptime(value, fmt)
        except ValueError:
            continue
    try:
        return datetime.fromisoformat(value)
    except ValueError:
        return None


def read_subject(path: Path, cols: dict[str, str | None]) -> tuple[list[tuple[datetime, float]], list[dict]]:
    """Return (glucose trace, logged meals) from one participant file."""
    trace: list[tuple[datetime, float]] = []
    meals: list[dict] = []
    with open(path, encoding="utf-8-sig", newline="") as fh:
        for row in csv.DictReader(fh):
            ts = _time(row.get(cols["time"] or "", "") or "")
            if ts is None:
                continue
            g = _num(row.get(cols["glucose"] or ""))
            if g is not None and g > 0:
                trace.append((ts, g))
            carbs = _num(row.get(cols["carbs"] or "")) if cols["carbs"] else None
            cals = _num(row.get(cols["calories"] or "")) if cols["calories"] else None
            if (carbs and carbs > 0) or (cals and cals > 0):
                meals.append({
                    "timestamp": ts,
                    "carbs": carbs or 0.0,
                    "protein": _num(row.get(cols["protein"] or "")) or 0.0 if cols["protein"] else 0.0,
                    "fat": _num(row.get(cols["fat"] or "")) or 0.0 if cols["fat"] else 0.0,
                    "fiber": _num(row.get(cols["fiber"] or "")) or 0.0 if cols["fiber"] else 0.0,
                })
    trace.sort(key=lambda p: p[0])
    meals.sort(key=lambda m: m["timestamp"])
    return trace, meals


def build(folder: Path, window_min: int = 120, baseline_min: int = 15, max_gap_min: int = 20,
          out_path: Path | None = None, dry_run: bool = False,
          overrides: dict[str, str] | None = None) -> tuple[list[dict], dict]:
    files = sorted(p for p in folder.glob("*.csv") if p.name != "meals.csv")
    if not files:
        raise ValueError(f"no CSV files in {folder}")
    overrides = overrides or {}

    report = {"subjects": 0, "meals_found": 0, "kept": 0, "dropped_overlap": 0,
              "dropped_short_trace": 0, "dropped_gap": 0, "dropped_no_baseline": 0,
              "units": "mg/dL"}
    rows: list[dict] = []
    mmol_seen = False

    for path in files:
        with open(path, encoding="utf-8-sig", newline="") as fh:
            headers = next(csv.reader(fh), [])
        if not headers:
            continue
        cols = {role: pick_column(headers, role, overrides.get(role)) for role in CANDIDATES}
        if not cols["time"] or not cols["glucose"]:
            raise ValueError(
                f"{path.name}: could not find a time and a glucose column (headers: {headers}). "
                f"Pass --time-col and --glucose-col.")
        if report["subjects"] == 0:
            for role, chosen in cols.items():
                log("cgmacros", f"{role:9s} <- {chosen!r}" if chosen else f"{role:9s} <- not found, treated as 0")

        trace, meals = read_subject(path, cols)
        if not trace:
            continue
        report["subjects"] += 1
        report["meals_found"] += len(meals)

        # A trace in mmol/L reads as implausibly low in mg/dL terms.
        median = sorted(g for _, g in trace)[len(trace) // 2]
        if median < 30:
            mmol_seen = True
            trace = [(t, g * MMOL_TO_MGDL) for t, g in trace]

        window = timedelta(minutes=window_min)
        for i, meal in enumerate(meals):
            t0 = meal["timestamp"]
            if i + 1 < len(meals) and meals[i + 1]["timestamp"] - t0 <= window:
                report["dropped_overlap"] += 1
                continue
            inside = [(t, g) for t, g in trace if t0 <= t <= t0 + window]
            if not inside or inside[-1][0] < t0 + window - timedelta(minutes=max_gap_min):
                report["dropped_short_trace"] += 1
                continue
            gaps = [(b[0] - a[0]).total_seconds() / 60 for a, b in zip(inside, inside[1:])]
            if gaps and max(gaps) > max_gap_min:
                report["dropped_gap"] += 1
                continue
            near = [g for t, g in trace if t0 - timedelta(minutes=baseline_min) <= t <= t0]
            if not near:
                report["dropped_no_baseline"] += 1
                continue
            baseline = sum(near) / len(near)
            peak = max(g for _, g in inside)
            rows.append({
                "subject": path.stem,
                "timestamp": t0.isoformat(sep=" "),
                "carbs": round(meal["carbs"], 2),
                "protein": round(meal["protein"], 2),
                "fat": round(meal["fat"], 2),
                "fiber": round(meal["fiber"], 2),
                "baseline_mgdl": round(baseline, 1),
                "peak_mgdl": round(peak, 1),
                "rise_mgdl": round(peak - baseline, 1),
            })
            report["kept"] += 1

    if mmol_seen:
        report["units"] = "mmol/L converted to mg/dL"
        log("cgmacros", "a trace looked like mmol/L and was multiplied by 18")

    for k, v in report.items():
        log("cgmacros", f"{k}: {v}")
    if rows:
        rises = sorted(r["rise_mgdl"] for r in rows)
        log("cgmacros", f"rise mg/dL: median {rises[len(rises) // 2]}, "
                        f"range {rises[0]} to {rises[-1]}")
        negative = sum(1 for r in rises if r < 0)
        if negative:
            log("cgmacros", f"NOTE {negative} meals have a negative rise (glucose fell); "
                            f"they are kept, since dropping them would bias the model upward")

    if dry_run:
        log("cgmacros", "dry run: nothing written")
        return rows, report
    if not rows:
        raise ValueError("no usable meals were found; run with --dry-run and check the column report above")

    out = out_path or OUT_DEFAULT
    out.parent.mkdir(parents=True, exist_ok=True)
    with open(out, "w", encoding="utf-8", newline="") as fh:
        w = csv.DictWriter(fh, fieldnames=OUT_COLUMNS)
        w.writeheader()
        w.writerows(rows)
    log("cgmacros", f"wrote {len(rows)} meals to {out}")
    log("cgmacros", "now run: python pipeline/run_all.py")
    return rows, report


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("folder", type=Path, help="folder of CGMacros participant CSV files")
    ap.add_argument("--out", type=Path, default=None, help=f"output file (default {OUT_DEFAULT})")
    ap.add_argument("--window", type=int, default=120, help="minutes after the meal to look for the peak")
    ap.add_argument("--baseline", type=int, default=15, help="minutes before the meal to average for the baseline")
    ap.add_argument("--max-gap", type=int, default=20, help="largest allowed gap in the trace, in minutes")
    ap.add_argument("--dry-run", action="store_true", help="report what would be produced, write nothing")
    for role in ("time", "glucose", "carbs", "protein", "fat", "fiber"):
        ap.add_argument(f"--{role}-col", default=None, help=f"override the {role} column name")
    args = ap.parse_args(argv)
    overrides = {r: getattr(args, f"{r}_col") for r in ("time", "glucose", "carbs", "protein", "fat", "fiber")
                 if getattr(args, f"{r}_col")}
    build(args.folder, window_min=args.window, baseline_min=args.baseline, max_gap_min=args.max_gap,
          out_path=args.out, dry_run=args.dry_run, overrides=overrides)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
