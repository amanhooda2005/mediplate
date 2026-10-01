"""Tests for the dataset import tools in pipeline/tools/.

Both tools read files this project cannot download (FoodData Central needs no
account but is large; CGMacros needs a data-use agreement), so each test builds
a small fixture in the published shape of the real download and checks the tool
end to end: the traps that matter are unit handling, the kJ/kcal confusion, the
added-sugar meaning, and meal windows that should be rejected.
"""
from __future__ import annotations

import csv
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "pipeline"))
sys.path.insert(0, str(ROOT / "pipeline" / "tools"))

import cgmacros_prep  # noqa: E402
import usda_import  # noqa: E402


# --------------------------------------------------------------- USDA import
def write_csv(path: Path, rows: list[dict], fields: list[str]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w", encoding="utf-8", newline="") as fh:
        w = csv.DictWriter(fh, fieldnames=fields)
        w.writeheader()
        w.writerows(rows)


@pytest.fixture
def fdc(tmp_path: Path) -> Path:
    """A FoodData Central folder in the shape of the published CSV download."""
    folder = tmp_path / "FoodData_Central_sr_legacy_csv"
    # Energy appears twice, in kcal and kJ, exactly as FoodData Central ships it.
    write_csv(folder / "nutrient.csv", [
        {"id": "1008", "name": "Energy", "unit_name": "KCAL", "nutrient_nbr": "208", "rank": "300"},
        {"id": "1062", "name": "Energy", "unit_name": "kJ", "nutrient_nbr": "268", "rank": "400"},
        {"id": "1003", "name": "Protein", "unit_name": "G", "nutrient_nbr": "203", "rank": "600"},
        {"id": "1004", "name": "Total lipid (fat)", "unit_name": "G", "nutrient_nbr": "204", "rank": "800"},
        {"id": "1005", "name": "Carbohydrate, by difference", "unit_name": "G", "nutrient_nbr": "205", "rank": "1110"},
        {"id": "1079", "name": "Fiber, total dietary", "unit_name": "G", "nutrient_nbr": "291", "rank": "1200"},
        {"id": "1258", "name": "Fatty acids, total saturated", "unit_name": "G", "nutrient_nbr": "606", "rank": "9700"},
        {"id": "2000", "name": "Sugars, total including NLEA", "unit_name": "G", "nutrient_nbr": "269", "rank": "1510"},
        {"id": "1093", "name": "Sodium, Na", "unit_name": "MG", "nutrient_nbr": "307", "rank": "5800"},
        {"id": "1092", "name": "Potassium, K", "unit_name": "MG", "nutrient_nbr": "306", "rank": "5600"},
        {"id": "1091", "name": "Phosphorus, P", "unit_name": "MG", "nutrient_nbr": "305", "rank": "5600"},
        {"id": "1087", "name": "Calcium, Ca", "unit_name": "MG", "nutrient_nbr": "301", "rank": "5300"},
        {"id": "1089", "name": "Iron, Fe", "unit_name": "MG", "nutrient_nbr": "303", "rank": "5400"},
        {"id": "1185", "name": "Vitamin K (phylloquinone)", "unit_name": "UG", "nutrient_nbr": "430", "rank": "8800"},
        {"id": "1253", "name": "Cholesterol", "unit_name": "MG", "nutrient_nbr": "601", "rank": "15700"},
        {"id": "1270", "name": "18:3 n-3 c,c,c (ALA)", "unit_name": "G", "nutrient_nbr": "851", "rank": "18200"},
        {"id": "1278", "name": "22:6 n-3 (DHA)", "unit_name": "G", "nutrient_nbr": "621", "rank": "19500"},
    ], ["id", "name", "unit_name", "nutrient_nbr", "rank"])

    write_csv(folder / "food_category.csv", [
        {"id": "20", "code": "2000", "description": "Cereal Grains and Pasta"},
        {"id": "15", "code": "1500", "description": "Finfish and Shellfish Products"},
        {"id": "19", "code": "1900", "description": "Sweets"},
        {"id": "99", "code": "9900", "description": "Imaginary Category"},
    ], ["id", "code", "description"])

    write_csv(folder / "food.csv", [
        {"fdc_id": "169705", "data_type": "sr_legacy_food", "description": "Oats, rolled, dry",
         "food_category_id": "20", "publication_date": "2019-04-01"},
        {"fdc_id": "175168", "data_type": "sr_legacy_food", "description": "Fish, mackerel, raw",
         "food_category_id": "15", "publication_date": "2019-04-01"},
        {"fdc_id": "169656", "data_type": "sr_legacy_food", "description": "Honey",
         "food_category_id": "19", "publication_date": "2019-04-01"},
        {"fdc_id": "100001", "data_type": "sr_legacy_food", "description": "Mystery item",
         "food_category_id": "99", "publication_date": "2019-04-01"},
    ], ["fdc_id", "data_type", "description", "food_category_id", "publication_date"])

    rows = []
    def nut(fid: str, nid: str, amount: float) -> None:
        rows.append({"id": f"{fid}{nid}", "fdc_id": fid, "nutrient_id": nid, "amount": str(amount),
                     "data_points": "", "derivation_id": "", "min": "", "max": "", "median": "",
                     "footnote": "", "min_year_acquired": ""})
    # Oats: energy in kcal AND kJ, so the tool must pick the kcal row.
    for nid, amt in [("1008", 389.0), ("1062", 1628.0), ("1003", 16.9), ("1004", 6.9), ("1005", 66.3),
                     ("1079", 10.6), ("1258", 1.2), ("2000", 0.99), ("1093", 2.0), ("1092", 429.0),
                     ("1091", 523.0), ("1087", 54.0), ("1089", 4.72), ("1185", 2.0), ("1253", 0.0),
                     ("1270", 0.11)]:
        nut("169705", nid, amt)
    for nid, amt in [("1008", 205.0), ("1003", 18.6), ("1004", 13.9), ("1005", 0.0), ("1079", 0.0),
                     ("1258", 3.26), ("1093", 90.0), ("1092", 314.0), ("1091", 217.0), ("1087", 12.0),
                     ("1089", 1.63), ("1185", 5.0), ("1253", 70.0), ("1270", 0.16), ("1278", 0.70)]:
        nut("175168", nid, amt)
    for nid, amt in [("1008", 304.0), ("1003", 0.3), ("1004", 0.0), ("1005", 82.4), ("1079", 0.2),
                     ("2000", 82.12), ("1093", 4.0), ("1092", 52.0)]:
        nut("169656", nid, amt)
    for nid, amt in [("1008", 100.0), ("1003", 2.0), ("1004", 1.0), ("1005", 20.0)]:
        nut("100001", nid, amt)
    write_csv(folder / "food_nutrient.csv", rows,
              ["id", "fdc_id", "nutrient_id", "amount", "data_points", "derivation_id",
               "min", "max", "median", "footnote", "min_year_acquired"])
    return folder


def test_usda_resolves_nutrients_by_name_and_unit(fdc: Path):
    rows = usda_import._read(fdc, "nutrient.csv")
    wanted, omega, sugars, missing = usda_import.resolve_nutrients(rows)
    assert wanted["energy_kcal"] == "1008", "must take the kcal row, not the kJ row"
    assert wanted["vitk_ug"] == "1185"
    assert set(omega) == {"1270", "1278"}
    assert sugars == ["2000"]
    assert missing == []


def test_usda_converts_values_groups_and_diet(fdc: Path, monkeypatch, tmp_path: Path):
    monkeypatch.setattr(usda_import, "OUT", tmp_path / "usda_extra.csv")
    out = usda_import.convert(fdc, matches=[], limit=0, start_index=1, dry_run=False)
    by_name = {r["name"]: r for r in out}

    oats = by_name["Oats, rolled, dry"]
    assert oats["energy_kcal"] == 389.0, "kJ row must not win"
    assert oats["group"] == "Cereals and Millets" and oats["diet"] == "veg"
    assert oats["potassium_mg"] == 429.0 and oats["vitk_ug"] == 2.0
    assert oats["sugar_g"] == 0, "added sugar is 0 outside the sugar group"
    assert oats["omega3_g"] == pytest.approx(0.11)
    assert oats["code"].startswith("USDA")

    fish = by_name["Fish, mackerel, raw"]
    assert fish["group"] == "Marine Fish" and fish["diet"] == "nonveg"
    assert fish["omega3_g"] == pytest.approx(0.86), "omega-3 is the sum of its fatty acids"

    honey = by_name["Honey"]
    assert honey["group"] == "Sugars" and honey["sugar_g"] == pytest.approx(82.12)

    mystery = by_name["Mystery item"]
    assert mystery["group"] == "Miscellaneous Foods"
    assert mystery["diet"] == "nonveg", "unknown category must fail safe, not into veg"

    written = list(csv.DictReader(open(tmp_path / "usda_extra.csv", encoding="utf-8")))
    assert len(written) == 4
    assert list(written[0].keys()) == usda_import.COLUMNS


def test_usda_rows_load_through_the_pipeline_builder(fdc: Path, monkeypatch, tmp_path: Path):
    """The output must be readable by step 2's existing supplement reader."""
    sys.path.insert(0, str(ROOT / "pipeline" / "steps"))
    import s02_build_foods

    monkeypatch.setattr(usda_import, "OUT", tmp_path / "usda_extra.csv")
    usda_import.convert(fdc, matches=["oats"], limit=0, start_index=50, dry_run=False)
    rows = list(csv.DictReader(open(tmp_path / "usda_extra.csv", encoding="utf-8")))
    food = s02_build_foods.build_supplement(rows[0])
    assert food["code"] == "USDA0050"
    assert food["per100"]["energy_kcal"] == 389.0
    assert food["diet"] == "veg"
    assert all(k in food["per100"] for k in ("sodium_mg", "potassium_mg", "vitk_ug"))


def test_usda_match_and_limit(fdc: Path, monkeypatch, tmp_path: Path):
    monkeypatch.setattr(usda_import, "OUT", tmp_path / "usda_extra.csv")
    out = usda_import.convert(fdc, matches=["fish"], limit=0, start_index=1, dry_run=False)
    assert [r["name"] for r in out] == ["Fish, mackerel, raw"]
    out = usda_import.convert(fdc, matches=[], limit=2, start_index=1, dry_run=True)
    assert len(out) == 2


def test_usda_missing_folder_says_what_is_wrong(tmp_path: Path):
    with pytest.raises(FileNotFoundError, match="food.csv"):
        usda_import.convert(tmp_path, matches=[], limit=0, start_index=1, dry_run=True)


# ------------------------------------------------------------ CGMacros prep
@pytest.fixture(autouse=True)
def _never_write_into_the_repo(tmp_path: Path, monkeypatch):
    """A test must never leave a meals.csv in pipeline/raw/, which step 5 would train on."""
    monkeypatch.setattr(cgmacros_prep, "OUT_DEFAULT", tmp_path / "default-out" / "meals.csv")


def cgm_file(path: Path, rows: list[dict], fields: list[str] | None = None) -> None:
    fields = fields or ["Timestamp", "Libre GL", "Dexcom GL", "Calories", "Carbs", "Protein", "Fat", "Fiber"]
    write_csv(path, rows, fields)


def trace(start_min: int, end_min: int, value, step: int = 5) -> list[dict]:
    """Glucose readings every `step` minutes; `value` may be a callable."""
    out = []
    for t in range(start_min, end_min + 1, step):
        g = value(t) if callable(value) else value
        out.append({"Timestamp": f"2026-01-01 {t // 60:02d}:{t % 60:02d}:00",
                    "Libre GL": f"{g:.1f}", "Dexcom GL": f"{g:.1f}",
                    "Calories": "", "Carbs": "", "Protein": "", "Fat": "", "Fiber": ""})
    return out


def test_cgmacros_computes_the_two_hour_rise(tmp_path: Path):
    rows = trace(0, 300, lambda t: 100 + (40 if 540 <= t * 60 <= 0 else 0))
    # flat 100 mg/dL, then a meal at 09:00 (540 min) with a peak of 160 at 10:00
    rows = trace(480, 540, 100)
    rows += [{"Timestamp": "2026-01-01 09:00:00", "Libre GL": "100", "Dexcom GL": "100",
              "Calories": "350", "Carbs": "60", "Protein": "12", "Fat": "8", "Fiber": "4"}]
    rows += trace(545, 600, lambda t: 100 + (t - 540))     # rises to 160 by 10:00
    rows += trace(605, 720, lambda t: 160 - (t - 600) * 0.4)
    cgm_file(tmp_path / "CGMacros-001.csv", rows)

    meals, report = cgmacros_prep.build(tmp_path, window_min=120, out_path=tmp_path / "meals.csv")
    assert len(meals) == 1
    assert meals[0]["carbs"] == 60.0 and meals[0]["fiber"] == 4.0
    assert meals[0]["rise_mgdl"] == pytest.approx(60.0, abs=1.0)
    assert report["kept"] == 1 and report["subjects"] == 1


def test_cgmacros_rejects_overlapping_meals_and_short_traces(tmp_path: Path):
    rows = trace(480, 540, 100)
    rows += [{"Timestamp": "2026-01-01 09:00:00", "Libre GL": "100", "Dexcom GL": "100",
              "Calories": "350", "Carbs": "60", "Protein": "12", "Fat": "8", "Fiber": "4"}]
    rows += trace(545, 600, lambda t: 100 + (t - 540) * 0.5)
    # a second meal inside the first one's window
    rows += [{"Timestamp": "2026-01-01 10:05:00", "Libre GL": "130", "Dexcom GL": "130",
              "Calories": "200", "Carbs": "30", "Protein": "5", "Fat": "3", "Fiber": "1"}]
    rows += trace(610, 660, 130)   # trace stops before the second meal's window closes
    cgm_file(tmp_path / "CGMacros-002.csv", rows)

    # dry run, because build() refuses to write an empty table: for the CLI that
    # is an error worth stopping on, but here it is the result being checked.
    meals, report = cgmacros_prep.build(tmp_path, window_min=120, dry_run=True)
    assert meals == []
    assert report["dropped_overlap"] == 1
    assert report["dropped_short_trace"] == 1


def test_cgmacros_converts_mmol_and_writes_the_expected_columns(tmp_path: Path, monkeypatch):
    # Same meal, but the trace is in mmol/L as European devices report it.
    rows = [{"Timestamp": f"2026-01-01 08:{m:02d}:00", "Libre GL": "5.6", "Dexcom GL": "5.6",
             "Calories": "", "Carbs": "", "Protein": "", "Fat": "", "Fiber": ""} for m in range(0, 60, 5)]
    rows += [{"Timestamp": "2026-01-01 09:00:00", "Libre GL": "5.6", "Dexcom GL": "5.6",
              "Calories": "350", "Carbs": "60", "Protein": "12", "Fat": "8", "Fiber": "4"}]
    rows += [{"Timestamp": f"2026-01-01 {9 + m // 60:02d}:{m % 60:02d}:00",
              "Libre GL": f"{5.6 + m * 0.03:.2f}", "Dexcom GL": f"{5.6 + m * 0.03:.2f}",
              "Calories": "", "Carbs": "", "Protein": "", "Fat": "", "Fiber": ""}
             for m in range(5, 130, 5)]
    cgm_file(tmp_path / "CGMacros-003.csv", rows)

    out = tmp_path / "out" / "meals.csv"
    meals, report = cgmacros_prep.build(tmp_path, window_min=120, out_path=out)
    assert report["units"] == "mmol/L converted to mg/dL"
    assert meals[0]["rise_mgdl"] == pytest.approx(0.03 * 120 * 18.0, rel=0.05)

    written = list(csv.DictReader(open(out, encoding="utf-8")))
    needed = {"carbs", "protein", "fat", "fiber", "rise_mgdl"}
    assert needed.issubset(written[0].keys()), "step 5 requires exactly these column names"


def test_cgmacros_reports_when_it_cannot_find_columns(tmp_path: Path):
    write_csv(tmp_path / "wrong.csv", [{"a": "1", "b": "2"}], ["a", "b"])
    with pytest.raises(ValueError, match="glucose"):
        cgmacros_prep.build(tmp_path, window_min=120)
