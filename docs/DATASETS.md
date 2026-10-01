# Adding datasets

What MediPlate uses today, what it could use, and exactly how to add each one.
Every dataset below changes the numbers in the report, so finish with the
rebuild steps at the end.

## What is in the build today

| Source | Where it lives | Used for |
|---|---|---|
| IFCT 2017 (ICMR-NIN), 542 foods | downloaded, cached in `pipeline/raw/` | all nutrient values |
| USDA SR Legacy, 11 gap-fill foods | `pipeline/sources/supplements.csv` | curd, salt, oats and others missing from IFCT |
| South African Heart Disease, 462 adults | downloaded via PMLB | training M1 |
| 186 regional recipes, 5 zones | `pipeline/sources/recipes.yaml` | the dish table |
| 8 diseases, 65 medicines, 23 food tags | `pipeline/sources/rules/` | safety filter and limits |
| Glycemic index table, 105 entries | `pipeline/sources/glycemic_index.csv` | sugar load |
| 195 messages × 3 languages | `pipeline/sources/rules/messages.yaml` | every explanation |

## What can be added, and what it costs

| Dataset | Tool | Blocker | What it adds |
|---|---|---|---|
| USDA FoodData Central | `pipeline/tools/usda_import.py` | none | more foods in the ingredient table |
| CGMacros (PhysioNet) | `pipeline/tools/cgmacros_prep.py` | data-use agreement | a trained M2 glucose model |
| Kaggle Indian Food 101 | none yet | Kaggle account | more dishes, especially North-East |
| UCI Chronic Kidney Disease | none yet | none | a learned CKD classifier (of doubtful value — see below) |
| NHANES | none yet | none | little for this project — see below |

---

## 1. USDA FoodData Central

Widens the ingredient table past 553 foods.

**Get the data.** Download a dataset from
<https://fdc.nal.usda.gov/download-datasets.html> and unzip it. "SR Legacy" is
the right one for general foods; "Foundation Foods" is smaller and newer. The
full download is not needed. The folder must contain `food.csv`,
`food_nutrient.csv` and `nutrient.csv`.

**Look before importing.**

```bash
python pipeline/tools/usda_import.py ~/Downloads/FoodData_Central_sr_legacy_csv --dry-run
```

This prints which USDA nutrient it matched to each MediPlate nutrient and shows
the first rows it would write. Check the matches against the source file before
going further.

**Import.** Importing all of SR Legacy (7,700 foods) would swamp the planner
with American supermarket items, so select what you need:

```bash
python pipeline/tools/usda_import.py ~/Downloads/FoodData_Central_sr_legacy_csv \
    --match "oat" --match "quinoa" --match "flaxseed" --limit 40
```

The tool writes `pipeline/sources/usda_extra.csv` in the same schema as
`supplements.csv`, which step 2 already merges. `supplements.csv` itself is
hand-checked and is never modified.

**Three things the tool handles that a naive import gets wrong.**

* *Energy.* FoodData Central carries energy twice, in kcal and in kJ. Taking the
  wrong row overstates energy by 4.184×. Nutrients are matched by name **and
  unit**, so the kcal row wins.
* *Sugar.* `sugar_g` means **added** sugar in MediPlate, not total sugars. USDA
  reports total. The tool writes 0 outside the sugar group, matching how step 2
  treats IFCT data. Without this, every apple would look like a dessert.
* *Diet type.* An unmapped USDA category becomes `nonveg`. A wrongly excluded
  food costs variety; a wrongly included one could put meat in a vegetarian
  patient's plan.

**After importing,** step 2's Atwater check runs over the new foods too: any
food whose stated energy disagrees with its macronutrients is corrected and
logged to `pipeline/reports/data_quality.md`. Read that file.

To undo an import, delete `pipeline/sources/usda_extra.csv` and rebuild.

---

## 2. CGMacros (PhysioNet) — trains M2

**Get the data.** Register at physionet.org, complete the required training,
sign the data-use agreement, and download. You will have one CSV per
participant: a glucose reading every few minutes with the logged meals written
into the same rows.

**Reduce it to meals.** Step 5 wants one row per meal with the columns
`carbs, protein, fat, fiber, rise_mgdl`. The raw files are not in that shape, so:

```bash
python pipeline/tools/cgmacros_prep.py ~/Downloads/cgmacros --dry-run   # check the columns it found
python pipeline/tools/cgmacros_prep.py ~/Downloads/cgmacros             # writes pipeline/raw/cgmacros/meals.csv
python pipeline/run_all.py                                              # step 5 trains M2
```

For each logged meal the tool takes the glucose at the meal as the baseline, the
highest reading in the next two hours as the peak, and writes the difference.

**It drops a meal, and says so, when:**

* another meal falls inside the two-hour window — the rise cannot be attributed
  to one meal;
* the trace ends before the window closes;
* the trace has a gap longer than 20 minutes inside the window;
* there is no reading near the meal to use as a baseline.

Expect to lose meals this way. A run that keeps everything usually means the
meal detection is wrong, not that the data is perfect.

**Negative rises are kept.** Glucose sometimes falls after a small meal.
Dropping those rows would bias the model upward.

**Column names are detected, not assumed**, because the published files have
changed between releases. The run prints what it chose; override with
`--glucose-col`, `--time-col`, `--carbs-col` and so on. A trace that looks like
mmol/L is multiplied by 18 and the conversion is reported.

Once M2 is trained the app uses it instead of glycemic-load bands, until the
patient has logged three of their own readings and a personal slope takes over.

---

## 3. Kaggle Indian Food 101 — no tool yet

255 dishes with name, ingredients, diet, course, state and region. This is the
obvious fix for the thinnest part of the dish table: the North-East has 22
regional dishes, which is why the planner widens to a neighbouring zone on 9 of
300 days.

The catch is that it carries **no nutrients and no quantities** — only
ingredient names. So a converter can draft `recipes.yaml` entries (map each
ingredient to an IFCT food code, `region` to a zone, `course` to a slot) but a
person has to add gram quantities per serving and a dietitian has to check them
before any of it reaches a patient. Step 4 refuses a recipe that references a
food code it cannot find, which is the safety net.

A few hours of code; days of review.

---

## 4. UCI Chronic Kidney Disease — works, but think first

400 patients, 24 features, clean. Training would mirror `train_heart_model()` in
`pipeline/steps/s05_train_models.py`.

Before doing it: most of its features (specific gravity, red blood cell counts,
packed cell volume) are not things a patient can enter in the app. For the ones
they can, MediPlate already computes eGFR with CKD-EPI 2021 — a validated
equation that gives the kidney stage directly. A learned classifier would be
less trustworthy than what is already there. Worth doing as a comparison in the
report; not an improvement to the product.

---

## 5. NHANES — probably skip

A large US survey across many linked files. It offers population nutrient
distributions, or an alternative training set for M1. But it is US adults, which
is the same population-mismatch that already limits the South African model. The
real gap is an Indian cardiovascular cohort; NHANES does not close it.

---

## After adding anything

```bash
python pipeline/run_all.py                      # rebuild data and models
cd backend && python3 -m pytest tests -q        # 100 tests must pass
cd .. && python report/experiments.py           # regenerate every reported number
python report/metrics_m1.py
node report/build_report.js && node report/build_dossier.js
```

Restart the backend, or use the reload button in the admin console, so it loads
the new files.

The property test in `backend/tests/test_plans_property.py` is the real
protection: it plans for 36 random patients and re-checks every hard limit
against the raw data. A bad sodium value in a new food surfaces there, not in a
patient's plan.
