// Builds report/MediPlate_Project_Report.docx from report/results.json and report/figures/.
// Run: node report/build_report.js
const fs = require('fs')
const path = require('path')
const {
  Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType, ImageRun, Table, TableRow, TableCell,
  WidthType, ShadingType, BorderStyle, PageBreak, TableOfContents, Footer, PageNumber, LevelFormat,
  PageOrientation, Header,
} = require('docx')

const DIR = __dirname
const R = JSON.parse(fs.readFileSync(path.join(DIR, 'results.json'), 'utf8'))
const FIG = (f) => path.join(DIR, 'figures', f)
const GREEN = '1E6B52'
const INK = '1A1A1A'
const MUTED = '5A6A64'
const CONTENT_W = 9026 // A4 with 1" margins, in DXA
const PX_W = 600       // content width in px for images

// ---------------------------------------------------------------- helpers
function runs(text, base = {}) {
  // **bold** and _italic_ inline markup
  const out = []
  const re = /(\*\*[^*]+\*\*|_[^_]+_)/g
  let last = 0
  let m
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(new TextRun({ text: text.slice(last, m.index), ...base }))
    const t = m[0]
    if (t.startsWith('**')) out.push(new TextRun({ text: t.slice(2, -2), bold: true, ...base }))
    else out.push(new TextRun({ text: t.slice(1, -1), italics: true, ...base }))
    last = m.index + t.length
  }
  if (last < text.length) out.push(new TextRun({ text: text.slice(last), ...base }))
  return out
}
const P = (text, opts = {}) => new Paragraph({ children: runs(text), spacing: { after: 140, line: 300 }, alignment: AlignmentType.JUSTIFIED, ...opts })
const H1 = (t) => new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun(t)], pageBreakBefore: true })
const H2 = (t) => new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun(t)] })
const H3 = (t) => new Paragraph({ heading: HeadingLevel.HEADING_3, children: [new TextRun(t)] })
const B = (text, level = 0) => new Paragraph({ children: runs(text), numbering: { reference: 'bullets', level }, spacing: { after: 80, line: 290 } })
const N = (text) => new Paragraph({ children: runs(text), numbering: { reference: 'numbers', level: 0 }, spacing: { after: 80, line: 290 } })
const EQ = (text) => new Paragraph({ children: [new TextRun({ text, italics: true, font: 'Cambria Math' })], alignment: AlignmentType.CENTER, spacing: { before: 80, after: 140 } })

function pngSize(file) {
  const b = fs.readFileSync(file)
  return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) }
}
let figNo = 0
const figList = []
function figure(file, caption, widthFrac = 1) {
  figNo += 1
  const { w, h } = pngSize(FIG(file))
  const width = Math.round(PX_W * widthFrac)
  const height = Math.round(width * h / w)
  figList.push(`Figure ${figNo}. ${caption}`)
  return [
    new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 120, after: 60 }, keepNext: true,
      children: [new ImageRun({ type: 'png', data: fs.readFileSync(FIG(file)), transformation: { width, height },
        altText: { title: `Figure ${figNo}`, description: caption, name: file } })] }),
    new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 220 },
      children: [new TextRun({ text: `Figure ${figNo}. `, bold: true, size: 19, color: INK }), new TextRun({ text: caption, size: 19, color: MUTED })] }),
  ]
}
let tabNo = 0
const border = { style: BorderStyle.SINGLE, size: 4, color: 'C9D5D0' }
const borders = { top: border, bottom: border, left: border, right: border }
function table(headers, rows, widths, caption) {
  tabNo += 1
  const total = widths.reduce((a, b) => a + b, 0)
  const scale = CONTENT_W / total
  const ws = widths.map((w) => Math.round(w * scale))
  ws[ws.length - 1] += CONTENT_W - ws.reduce((a, b) => a + b, 0)
  const cell = (text, i, head) => new TableCell({
    borders, width: { size: ws[i], type: WidthType.DXA },
    shading: head ? { fill: 'E1EFE9', type: ShadingType.CLEAR } : undefined,
    margins: { top: 60, bottom: 60, left: 100, right: 100 },
    children: [new Paragraph({ children: runs(String(text), { size: 18, bold: head || undefined, color: head ? '155240' : INK }) })],
  })
  return [
    new Paragraph({ spacing: { before: 160, after: 80 }, keepNext: true,
      children: [new TextRun({ text: `Table ${tabNo}. `, bold: true, size: 19 }), new TextRun({ text: caption, size: 19, color: MUTED })] }),
    new Table({ width: { size: CONTENT_W, type: WidthType.DXA }, columnWidths: ws,
      rows: [new TableRow({ tableHeader: true, children: headers.map((h, i) => cell(h, i, true)) }),
        ...rows.map((r) => new TableRow({ children: r.map((c, i) => cell(c, i, false)) }))] }),
    new Paragraph({ spacing: { after: 160 }, children: [] }),
  ]
}
const pct = (x, d = 1) => `${(100 * x).toFixed(d)}%`
const m1 = R.m1
const mm = R.m1_metrics
const pl = R.planner
const man = R.manifest

// ---------------------------------------------------------------- title page
const title = [
  new Paragraph({ spacing: { before: 1800 }, alignment: AlignmentType.CENTER,
    children: [new TextRun({ text: 'MediPlate', bold: true, size: 72, color: GREEN, font: 'Arial' })] }),
  new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 400 },
    children: [new TextRun({ text: 'A region-first, medicine-aware meal planning system for adults living with multiple chronic diseases', size: 30, color: INK })] }),
  new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 1200 },
    children: [new TextRun({ text: 'Project Report', size: 28, bold: true })] }),
  ...[['Submitted by', '[Your name]   ·   [Roll number]'], ['Under the guidance of', '[Guide name], [Designation]'],
    ['Department', '[Department name]'], ['Institution', '[College / University name]'], ['Date', 'September 2026']]
    .map(([k, v]) => new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 160 },
      children: [new TextRun({ text: `${k}: `, bold: true, size: 24 }), new TextRun({ text: v, size: 24 })] })),
]

// ---------------------------------------------------------------- body
const body = []
const add = (...xs) => xs.flat().forEach((x) => body.push(x))

add(new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun('Abstract')] }))
add(P(`Adults over 30 with chronic disease rarely have only one condition. Diabetes, high blood pressure, heart disease, kidney disease, fatty liver, obesity, metabolic syndrome and arthritis often occur together, each with its own diet advice, and those pieces of advice can contradict each other and the patient's medicines. Existing diet apps plan for one disease at a time and use foods that many Indian patients do not eat.`))
add(P(`**MediPlate** is a full-stack web application that turns a patient's conditions, medicines and laboratory results into a safe weekly meal plan built from the food of their own region (North, South, East, West or North-East India). A data pipeline builds a food table from the Indian Food Composition Tables 2017 (${man.foods} foods) and costs ${man.dishes} regional recipes. A rules knowledge base encodes eight conditions and ${man.medicines} medicines. A five-step engine then builds a patient context, merges and resolves nutrient targets with an explainable conflict ledger, removes unsafe dishes, and selects dish, portion, salt level and potassium-leaching for nine meal slots per day with a mixed-integer linear programme. It widens the search from the home region to neighbouring regions only when limits cannot be met.`))
add(P(`On ${pl.patients} randomly generated patients (${pl.days} planned days) the planner produced a plan for every day with **${pl.hard_violations} violations in ${pl.hard_checks} hard-limit checks**; ${pct(pl.home_share_mean)} of regional dishes came from the patient's home region, against 9–47% without the region-first logic. A heart-risk model trained on 462 adults reached a cross-validated ROC AUC of ${m1.auc_mean['Logistic regression']} ± ${m1.auc_sd['Logistic regression']}, with accuracy ${mm.cv['Logistic regression'].accuracy.mean.toFixed(3)}, precision ${mm.cv['Logistic regression'].precision.mean.toFixed(3)}, recall ${mm.cv['Logistic regression'].recall.mean.toFixed(3)} and F1 ${mm.cv['Logistic regression'].f1.mean.toFixed(3)} at its 0.5 threshold. The system is available in English, Tamil and Hindi and is covered by 91 automated backend tests and 5 browser tests.`))
add(new Paragraph({ children: [new TextRun({ text: 'Keywords: ', bold: true }), new TextRun('multimorbidity, clinical nutrition, mixed-integer programming, food–drug interaction, regional Indian diet, explainable recommendation')] }))

add(new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun('Contents')], pageBreakBefore: true }))
add(new TableOfContents('Contents', { hyperlink: true, headingStyleRange: '1-2' }))
add(new Paragraph({ children: [new TextRun({ text: 'Right-click the table and choose "Update field" in Word if page numbers are missing.', italics: true, size: 18, color: MUTED })] }))

// 1 Introduction
add(H1('1. Introduction'))
add(H2('1.1 Problem'))
add(P(`About one in three adults with a chronic disease has two or more at once, and more than 40% of people with diabetes have three or more other conditions. Their diet advice conflicts: a person with high blood pressure is told to eat potassium-rich vegetables and fruit, while the same person with advanced kidney disease must limit potassium to about 2,000 mg a day; someone on warfarin must keep vitamin K steady rather than avoid greens; a person on a sulfonylurea or insulin must not have very low-carbohydrate meals. Dietitians resolve these by hand, and there are far too few of them.`))
add(P(`Most digital tools make this worse in India: they are built around Western food databases, handle one disease at a time, and check medicines only reactively, if at all.`))
add(H2('1.2 Objectives'))
add(N('Build a food and recipe database from Indian food-composition data, with every dish tagged by region.'))
add(N('Encode nutrition rules for eight chronic conditions and food rules for common medicines in a checkable knowledge base.'))
add(N('Design an engine that merges all applicable limits, resolves conflicts by clinical priority and explains each decision.'))
add(N('Remove unsafe dishes before planning, and never break a hard safety limit in any plan.'))
add(N('Prefer the patient\'s own regional food, falling back to neighbouring regions only when limits require it.'))
add(N('Train and integrate machine-learning components where data allows, and learn from each patient\'s logs.'))
add(N('Deliver it as an easy-to-use website in English, Tamil and Hindi, verified by automated tests.'))
add(H2('1.3 Scope'))
add(P('Version 1 covers adults aged 30 and above with diabetes, high blood pressure, heart disease or stroke (including heart failure), obesity, chronic kidney disease (stages 1–5 and dialysis), fatty liver, metabolic syndrome and arthritis (osteoarthritis, rheumatoid arthritis, gout). Food prices, a doctor portal, food-photo recognition and live glucose-sensor sync were left for later versions by design.'))

// 2 Related work
add(H1('2. Related work'))
add(P('A prior-art review of patent databases (Google Patents, EPO, USPTO, WIPO) and the literature (PubMed, Nature, Frontiers, arXiv) found two separate groups of work that rarely meet:'))
add(B('**AI nutrition recommenders**, such as US 2023/0170071 A1 (AI and big-data nutrition recommendations), the digital-twin platforms of US 2021/0050089 A1 and US 2021/0196195 A1 (Twin Health), and microbiome-based systems (US 10,811,126 B2; EP 4143842 A1). These mostly optimise one signal, such as blood glucose, and do not resolve conflicts between several diseases.'))
add(B('**Nutraceutical compositions** for single conditions such as arthritis (US 7,416,748 B2; WO 2023/063523 A1), with no personalisation layer.'))
add(P('Research systems come closer. A fuzzy-logic clinical decision support system for multiple chronic conditions reached about 97% agreement with dietitians on 100 records, but it is rule-only and does not handle medicines or adapt to biomarkers (Sci. Rep. 2023). NutriOrion, a 2026 multi-agent LLM framework, names multimorbidity conflicts and medicine–diet checks as open problems. Large language models tested on stage-specific kidney diets showed inconsistent guideline adherence (2025). Scoping reviews of diet recommender systems for chronic disease find most target diabetes alone and few combine biomarkers with medication data.'))
add(P('**Gap addressed by MediPlate:** one system that (i) merges limits from several diseases and medicines with an explicit, explainable conflict ledger, (ii) removes medicine- and disease-unsafe foods before optimisation rather than warning afterwards, (iii) guarantees hard limits with an exact optimiser, and (iv) plans from the patient\'s regional Indian cuisine first.'))

// 3 System design
add(H1('3. System design'))
add(P('MediPlate has three layers: an offline data pipeline, a Python backend containing the recommendation engine, and a React website. The identifiers used below (E1–E5, M1–M3, D1–D4) match the project blueprint.'))
add(figure('fig01_architecture.png', 'System architecture. Every plan request passes through the five engine steps; logs flow back to the data stores and the learning models.'))
add(table(['ID', 'Component', 'Role'], [
  ['E1', 'Profile builder', 'BMI (Indian cut-offs), eGFR (CKD-EPI 2021), kidney stage, reference body weight, energy need'],
  ['E3', 'Targets + conflict ledger', 'Collects every daily limit, merges them, resolves clashes by priority, explains each decision'],
  ['E2', 'Safety filter', 'Removes dishes that clash with diet, allergies, conditions, medicines or a hard limit'],
  ['E4', 'MILP optimizer', 'Chooses dish × portion × salt level × leaching for 9 slots/day; region tiers'],
  ['E5', 'Explainer', 'Why each dish fits, region, day totals vs limits, sugar load, medicine timing'],
  ['M1', 'Health-risk scorer', 'Trained heart-risk model + validated calculators (FIB-4, IDRS, metabolic syndrome)'],
  ['M2', 'Glucose response', 'Glycemic load; personal response slope from logged readings'],
  ['M3', 'Meal ranker', 'Learns preferences from eaten, skipped, liked and disliked meals'],
  ['D1–D4', 'Data stores', 'Patients and logs; foods and dishes; rules; model files'],
], [900, 2300, 5800], 'Engine components.'))
add(H2('3.1 Data pipeline'))
add(P('The pipeline runs in five steps and stops with a clear error rather than writing half-built files. Every rule file is validated against a strict schema, so a typo cannot silently disable a safety rule.'))
add(figure('fig02_pipeline.png', 'Data pipeline from raw sources to the files loaded by the backend.'))
add(H2('3.2 Region model'))
add(P('Each of the 36 states and union territories maps to one of five food zones. Every regional dish is tagged with the zones where it is an everyday food; basics such as fruit, curd and salad are "universal"; some dishes are "all-India". The optimizer searches in tiers: tier 1 uses home-zone (and an optional second zone) plus universal dishes; tier 2 adds neighbouring zones; tier 3 adds all-India dishes. A day only moves to the next tier when the previous one cannot satisfy every hard limit.'))

// 4 Data
add(H1('4. Data'))
add(table(['Source', 'Content', 'Use'], [
  ['IFCT 2017, NIN-ICMR (via ifct2017 package)', '542 foods, 151 nutrients, local names', 'All nutrient values'],
  ['USDA SR Legacy', '11 foods absent from IFCT (curd, salt, oats, sago, soy chunks…)', 'Gap filling'],
  ['South African Heart Disease (PMLB)', '462 adults, coronary heart disease outcome', 'M1 training'],
  ['MediPlate recipes (hand-built)', `${man.dishes} dishes, 5 zones, raw gram weights mapped to IFCT codes`, 'Dish table'],
  ['Rules knowledge base (hand-built)', `8 conditions, ${man.medicines} medicines in 35 classes, ${man.food_tags} food tags`, 'Safety filter and limits'],
  ['Glycemic index table', 'Approximate GI by food and food group', 'Glycemic load'],
  ['Message library', `${man.messages} messages in English, Tamil and Hindi`, 'Explanations'],
], [3000, 3800, 2200], 'Data sources.'))
add(P('Guideline sources for the rules include the ICMR-NIN Dietary Guidelines for Indians (2024), ADA Standards of Care (2025), KDIGO 2024 and KDOQI 2020 for kidney disease, AHA/DASH, the EASL-EASD-EASO 2024 fatty-liver guideline, the ACR 2020 gout guideline and medicine labels.'))
add(figure('fig03_food_groups.png', 'Foods in the food table by IFCT group.', 0.8))
add(figure('fig04_dish_coverage.png', 'Number of dishes per food region and meal slot.', 0.85))
add(figure('fig05_dish_nutrients.png', 'Sodium and potassium per serving across the dish table.'))
add(P('**Data quality.** Every food\'s listed energy was checked against its protein, fat, carbohydrate and fibre (Atwater factors). One IFCT entry (chicken leg, skinless) listed 384 kcal per 100 g while its macronutrients give 192 kcal; the calculated value is used and the correction is logged.'))

// 5 Methods
add(H1('5. Methods'))
add(H2('5.1 Profile builder (E1)'))
add(P('BMI uses Indian cut-offs (≥ 23 overweight, ≥ 25 obese). Kidney function is estimated with the race-free CKD-EPI 2021 creatinine equation:'))
add(EQ('eGFR = 142 × min(Scr/κ, 1)^α × max(Scr/κ, 1)^−1.200 × 0.9938^age × 1.012 [female]'))
add(P('with κ = 0.7 (female) or 0.9 (male) and α = −0.241 or −0.302. If eGFR is below 60 and kidney disease was not reported, kidney-safe limits are applied automatically and the patient is told. Protein targets use a reference weight capped at BMI 25, so protein is not overestimated in obesity. Energy need uses the Mifflin–St Jeor equation times an activity factor, minus 500 kcal when a condition calls for weight loss (floor 1,200 kcal for women, 1,500 kcal for men).'))
add(H2('5.2 Targets and conflict resolution (E3)'))
add(P('Every applicable rule contributes an entry (nutrient, bound, value, hard or soft, priority, source). For each nutrient the strictest maximum and highest minimum are kept, separately for hard and soft entries. When a minimum exceeds a maximum, the entry with the better clinical priority wins and the other is removed, and the decision is written to the ledger in plain language.'))
add(table(['Priority', 'Meaning', 'Examples'], [
  ['1', 'Immediate safety', 'Potassium limit in advanced kidney disease; carbohydrate floor with SGLT2 inhibitors'],
  ['2', 'Organ protection', 'Kidney protein and phosphorus limits'],
  ['3', 'Disease control', 'Sodium for high BP; carbohydrate and sugar for diabetes'],
  ['4', 'Weight / general', 'Protein for weight loss; DASH potassium goal'],
  ['5', 'Wellness', 'General fibre, sugar and saturated-fat defaults'],
], [1100, 2400, 5500], 'Clinical priority levels used to settle conflicts.'))
add(P('Example ledger entry, generated for a patient with high blood pressure and kidney disease stage 4: "_' + R.cases.A.ledger[0] + '_"'))
add(H2('5.3 Safety filter (E2)'))
add(P('Before any meal is chosen, each dish is checked for diet type, beef and pork preferences, nine allergen groups, condition "avoid" rules (for example star fruit and coconut water in kidney disease, high-purine foods in gout), medicine rules (for example fermented soybean with warfarin, pummelo with simvastatin or felodipine), and whether even its smallest, lowest-salt version would break a hard daily limit or the vitamin K band. Removed dishes can never be selected; dishes marked "limit" are allowed but penalised.'))
add(H2('5.4 Meal optimizer (E4)'))
add(P('Each day is solved as a mixed-integer linear programme with OR-Tools (CBC). Let x_{s,o} be 1 if option o (a dish at a given portion, salt level and leaching choice) fills slot s. There are nine slots: breakfast; lunch staple, protein, vegetable, side; snack; dinner staple, protein, vegetable.'))
add(EQ('minimise  Σ c_o·x_{s,o}  +  |E − E*|  +  Σ w_p · (% beyond each soft goal)'))
add(EQ('subject to  Σ_o x_{s,o} = 1 for every slot;   Σ n_{k,o}·x_{s,o} ≤ U_k (hard maxima);   ≥ L_k (hard minima)'))
add(P('Additional hard constraints: energy within 85–115% of target; at least 30 g carbohydrate in each main meal for insulin or sulfonylurea users; daily vitamin K between 50 and 150 µg for warfarin-type medicines; no dish twice in a day; at most five uses of a dish per week. The option cost c_o combines region tier, preference score, rule penalties or bonuses, salt reduction, portion change and glycemic load. Salt can be reduced to one half or one quarter, and when potassium is limited, vegetables are soaked and boiled (retaining about 60% of their potassium). If no tier yields a feasible day, lower-priority hard limits are relaxed into strong penalties while priority 1–2 limits stay hard, and the patient is told.'))
add(H2('5.5 Models'))
add(P('**M1, health-risk scorer.** Logistic regression and gradient boosting were compared on the South African Heart Disease data using six inputs a patient can enter (age, systolic BP, LDL cholesterol, family history, BMI, smoking), with 5 × 5 repeated stratified cross-validation. The better model is used for people without known heart disease; a predicted risk ≥ 0.5 tightens the saturated-fat limit. M1 also includes validated calculators that need no training: FIB-4 for liver scarring, the Indian Diabetes Risk Score, IDF metabolic-syndrome criteria with South Asian waist cut-offs, and HbA1c, BP and potassium checks.'))
add(P('**M2, glucose response.** Glycemic load (GL) is computed per dish from ingredient carbohydrate and GI. Bands are ≤ 10 / < 20 / ≥ 20 per serving and ≤ 20 / < 35 / ≥ 35 per whole meal. After three before/after-meal readings, a personal slope (mg/dL rise per GL unit) is fitted by least squares through the origin and used both for estimates and to weight glycemic load in the optimizer.'))
add(P('**M3, meal ranker.** Each log contributes a signal (liked +3, ate +0.5, skipped −1, disliked −4) to the dish and, weighted by share, to its main ingredients. A dish\'s preference bonus combines both, capped at ±30 cost units.'))
add(H2('5.6 Food check'))
add(P('Any dish or IFCT food can be checked. All rules are evaluated, alerts about the same thing are merged (salt flagged by both high BP and kidney disease becomes one alert naming both sources and using the strictest limit), and alerts are sorted by severity (avoid, limit, information) to give one verdict.'))

// 6 Implementation
add(H1('6. Implementation'))
add(table(['Layer', 'Technology'], [
  ['Website', 'React 19, TypeScript (strict), Vite, Tailwind CSS, TanStack Query, Recharts; bundled Noto fonts for Tamil and Devanagari'],
  ['Backend', 'Python 3.11, FastAPI, SQLAlchemy 2, Pydantic 2, JWT login, bcrypt password hashing'],
  ['Optimisation and ML', 'Google OR-Tools (CBC MILP), scikit-learn, pandas, NumPy'],
  ['Database', 'SQLite (default) or PostgreSQL (tested)'],
  ['Testing', 'pytest, Playwright browser tests'],
  ['Deployment', 'Docker image; free hosting on Render with a Neon PostgreSQL database'],
], [2200, 6800], 'Technology stack.'))
add(table(['Endpoint', 'Purpose'], [
  ['POST /api/auth/register, /login', 'Create account, sign in (JWT)'],
  ['GET/PUT /api/profile', 'Health profile with validation'],
  ['POST /api/plans/generate', 'Run the engine and store a 7-day plan'],
  ['POST /api/plans/current/swap', 'Replace one dish while keeping every limit'],
  ['GET /api/foods/search, POST /api/foods/check', 'Search in three languages; unified verdict'],
  ['POST /api/logs/meals, /api/logs/glucose', 'Learning signals for M3 and M2'],
  ['GET /api/insights, /api/labs/series', 'Risk results and progress charts'],
  ['/api/admin/*', 'Data, rule and model status; reload after pipeline runs'],
], [3800, 5200], 'Main API endpoints.'))
add(P('Messages are sent from the server as a key plus parameters, and the website renders them in the patient\'s language, so every explanation, including the conflict ledger, appears in English, Tamil or Hindi.'))

// 7 Results
add(H1('7. Results'))
add(H2('7.1 Heart-risk model (M1)'))
add(figure('fig06_m1_roc.png', 'M1 discrimination: out-of-fold ROC curves and AUC across 25 cross-validation folds.'))
add(table(['Metric', 'Logistic regression', 'Gradient boosting'], [
  ['ROC AUC, 5×5 repeated CV (mean ± SD)', `${m1.auc_mean['Logistic regression']} ± ${m1.auc_sd['Logistic regression']}`, `${m1.auc_mean['Gradient boosting']} ± ${m1.auc_sd['Gradient boosting']}`],
  ['ROC AUC, out-of-fold', `${m1.oof_auc['Logistic regression']}`, `${m1.oof_auc['Gradient boosting']}`],
  ['Brier score', `${m1.brier}`, '–'],
  ['Sensitivity at 0.5', `${m1.sensitivity}`, '–'],
  ['Specificity at 0.5', `${m1.specificity}`, '–'],
  ['Positive predictive value at 0.5', `${m1.ppv}`, '–'],
  ['Accuracy at 0.5', `${m1.accuracy}`, '–'],
], [4200, 2400, 2400], `M1 performance (n = ${m1.n}, ${m1.positives} with coronary heart disease).`))
add(P(`Logistic regression was chosen: it discriminated better and its coefficients are interpretable. Age, family history, smoking and LDL cholesterol increase risk the most (Figure 7). At the 0.5 threshold the model is specific (${m1.specificity}) but only moderately sensitive (${m1.sensitivity}), which suits its role as a caution flag that tightens limits rather than a diagnosis.`))
add(figure('fig07_m1_calibration_coef.png', 'M1 calibration by quintile and standardised coefficients.'))

// --- classification metrics
const lr = 'Logistic regression'
const gb = 'Gradient boosting'
const pc = mm.per_class
const cvp = (n, k) => `${mm.cv[n][k].mean.toFixed(3)} ± ${mm.cv[n][k].sd.toFixed(3)}`
const f3 = (v) => Number(v).toFixed(3)

add(H3('7.1.1 Accuracy, precision, recall and F1'))
add(P(`The dataset holds **${mm.n_rows} adults** described by ${mm.n_features} features, of whom **${mm.positives} (${pct(mm.positive_rate)}) had coronary heart disease** and ${mm.negatives} did not. A model that simply answered "no disease" for everybody would therefore already be ${pct(1 - mm.positive_rate)} accurate, so accuracy alone is not enough: precision, recall and F1 are reported with it. All four are measured at the ${mm.threshold} decision threshold used by the application.`))
add(table(['Term', 'Meaning here', 'Formula'], [
  ['Accuracy', 'Share of all patients placed in the right group', '(TP + TN) / all'],
  ['Precision', 'Of those flagged high risk, the share who really had heart disease', 'TP / (TP + FP)'],
  ['Recall (sensitivity)', 'Of those who really had heart disease, the share the model flagged', 'TP / (TP + FN)'],
  ['F1', 'Harmonic mean of precision and recall; low if either is low', '2PR / (P + R)'],
  ['Specificity', 'Of the healthy patients, the share correctly left unflagged', 'TN / (TN + FP)'],
], [2200, 5200, 2200], 'The four metrics as they apply to M1.'))

add(P('Each model is measured three ways. **Training data** means the model is fitted on all 462 patients and then scored on the same patients: this number is always flattering and is reported only to show how much the model memorises. **Cross-validation** splits the data into 5 parts, trains on 4 and tests on the part held back, repeats that 25 times in all, and averages: this is the number to trust. **Held-out test** keeps 30% of patients (139 of them) completely aside, trains on the other 323, and scores the untouched 30% once.'))
add(table(['Model and metric', 'Training data', '5×5-fold CV (mean ± SD)', 'Held-out test (30%)'], [
  [`**${lr} (chosen)**`, '', '', ''],
  ['Accuracy', f3(mm.train[lr].accuracy), cvp(lr, 'accuracy'), f3(mm.holdout[lr].test_part.accuracy)],
  ['Precision', f3(mm.train[lr].precision), cvp(lr, 'precision'), f3(mm.holdout[lr].test_part.precision)],
  ['Recall', f3(mm.train[lr].recall), cvp(lr, 'recall'), f3(mm.holdout[lr].test_part.recall)],
  ['F1', f3(mm.train[lr].f1), cvp(lr, 'f1'), f3(mm.holdout[lr].test_part.f1)],
  ['ROC AUC', f3(mm.train[lr].auc), cvp(lr, 'roc_auc'), f3(mm.holdout[lr].test_part.auc)],
  [`**${gb}**`, '', '', ''],
  ['Accuracy', f3(mm.train[gb].accuracy), cvp(gb, 'accuracy'), f3(mm.holdout[gb].test_part.accuracy)],
  ['Precision', f3(mm.train[gb].precision), cvp(gb, 'precision'), f3(mm.holdout[gb].test_part.precision)],
  ['Recall', f3(mm.train[gb].recall), cvp(gb, 'recall'), f3(mm.holdout[gb].test_part.recall)],
  ['F1', f3(mm.train[gb].f1), cvp(gb, 'f1'), f3(mm.holdout[gb].test_part.f1)],
  ['ROC AUC', f3(mm.train[gb].auc), cvp(gb, 'roc_auc'), f3(mm.holdout[gb].test_part.auc)],
], [3400, 2000, 2600, 2000], `Classification performance of both candidate models at threshold ${mm.threshold}.`))
add(figure('fig16_m1_metric_bars.png', 'Accuracy, precision, recall and F1 for both models on the training data, under cross-validation (bars show ±1 SD across 25 folds) and on the held-out test set.'))

add(P(`Logistic regression loses very little between the training data and cross-validation (accuracy ${f3(mm.train[lr].accuracy)} → ${mm.cv[lr].accuracy.mean.toFixed(3)}, F1 ${f3(mm.train[lr].f1)} → ${mm.cv[lr].f1.mean.toFixed(3)}), so it is **not overfitted**. Gradient boosting is the opposite: fitted on the 323 training patients it reached an accuracy of ${f3(mm.holdout[gb].train_part.accuracy)} and an F1 of ${f3(mm.holdout[gb].train_part.f1)}, but on the untouched test patients it fell to ${f3(mm.holdout[gb].test_part.accuracy)} and ${f3(mm.holdout[gb].test_part.f1)}. That gap is memorisation, and it is why the simpler model was kept.`))

add(table(['Class', 'Precision', 'Recall', 'F1', 'Patients'], [
  ['No heart disease', f3(pc['No heart disease'].precision), f3(pc['No heart disease'].recall), f3(pc['No heart disease']['f1-score']), `${pc['No heart disease'].support}`],
  ['Heart disease', f3(pc['Heart disease'].precision), f3(pc['Heart disease'].recall), f3(pc['Heart disease']['f1-score']), `${pc['Heart disease'].support}`],
  ['**Macro average**', f3(pc['macro avg'].precision), f3(pc['macro avg'].recall), f3(pc['macro avg']['f1-score']), `${pc['macro avg'].support}`],
  ['**Weighted average**', f3(pc['weighted avg'].precision), f3(pc['weighted avg'].recall), f3(pc['weighted avg']['f1-score']), `${pc['weighted avg'].support}`],
  ['**Overall accuracy**', '', '', f3(pc.accuracy), `${pc['weighted avg'].support}`],
], [3000, 1800, 1800, 1800, 1600], 'Per-class results for the chosen model on out-of-fold predictions. The weighted average is the figure usually quoted as "precision / recall / F1" for the whole model.'))
add(P(`Read per class, the model is good at clearing healthy patients (recall ${f3(pc['No heart disease'].recall)}) and much weaker at catching diseased ones (recall ${f3(pc['Heart disease'].recall)}). The confusion matrices in Figure ${figNo + 1} show the same thing as counts: out of ${mm.positives} patients with heart disease, ${mm.oof[lr].tp} are flagged and ${mm.oof[lr].fn} are missed, while ${mm.oof[lr].fp} healthy patients are flagged unnecessarily.`))
add(figure('fig15_m1_confusion.png', 'Confusion matrices for the chosen model: fitted and scored on the training data (left) and cross-validated (right). The two are nearly identical, which again shows no overfitting.'))

add(P(`The 0.5 threshold is a choice, not a property of the model, and it is what holds recall down. Lowering it trades precision for recall (Figure ${figNo + 1}). F1 is highest at a threshold of ${mm.best_f1_threshold} (F1 = ${f3(mm.best_f1)}), and at 0.35 the model catches ${pct(mm.thresholds.find(t => t.threshold === 0.35).recall)} of the patients with heart disease instead of ${pct(mm.thresholds.find(t => t.threshold === 0.5).recall)}, at the cost of more false alarms.`))
add(table(['Threshold', 'Accuracy', 'Precision', 'Recall', 'F1', 'Specificity', 'Missed cases'], mm.thresholds.map(t => [
  t.threshold === mm.threshold ? `**${t.threshold.toFixed(2)}** (in use)` : t.threshold.toFixed(2),
  f3(t.accuracy), f3(t.precision), f3(t.recall), f3(t.f1), f3(t.specificity), `${t.fn}`,
]), [1900, 1500, 1500, 1400, 1300, 1500, 1500], 'Effect of the high-risk threshold on the chosen model (out-of-fold predictions).'))
add(figure('fig17_m1_threshold.png', 'Left: precision-recall curves for both models, against the baseline of flagging everybody. Right: how accuracy, precision, recall and F1 move with the threshold.'))
add(P(`Because M1 only tightens a diet plan and never withholds treatment, a missed case costs more than a false alarm, so a threshold near ${mm.best_f1_threshold}–0.35 would be the better clinical setting; version 1 keeps 0.5 so that the flag stays rare and the plan stays close to the patient's own preferences. Changing one configuration value moves the system to the other setting.`))

add(H3('7.1.2 Why M2 and M3 have no accuracy figure'))
add(P('Accuracy, precision, recall and F1 only apply to a model that answers yes or no, which M1 does. The other two learning parts answer different kinds of question and are measured on their own terms: **M2** estimates how far blood sugar rises after a meal, a number, so it is measured by the error of that estimate (Section 7.6: the personal slope settles within ±0.4 mmol/L per 10 g of carbohydrate after about 8 readings, and the trained CGMacros version would be reported as mean absolute error in mg/dL); **M3** re-orders dishes rather than classifying them, so it is measured by how quickly a disliked dish and its main ingredient leave the plan (Section 7.6). The **safety filter and the planner** are not learned at all — they are checked for correctness instead, and got 0 violations in 1032 hard-limit checks (Section 7.2).'))
add(H2('7.2 Safety of generated plans'))
add(P(`The planner was run for ${pl.patients} random patients generated from a fixed seed, covering all 36 states, three diet types, 1–4 conditions each, kidney stages 2–5, random potassium and phosphorus results and 14 medicine combinations, for 3 days each (${pl.days} days). Each day was re-totalled independently from the raw dish data, not from the optimizer's own numbers.`))
add(table(['Measure', 'Result'], [
  ['Days with a plan', `${pl.feasible_days} of ${pl.days}`],
  ['Hard-limit checks (daily limits, meal carbohydrate floors, vitamin K band, energy window, removed dishes)', `${pl.hard_checks}`],
  ['Violations', `**${pl.hard_violations}**`],
  ['Days in tier 1 (home region)', `${pl.tiers.tier1 ?? 0}`],
  ['Days that needed tier 2 (neighbouring region)', `${pl.tiers.tier2 ?? 0}`],
  ['Days with relaxed limits', `${Object.entries(pl.tiers).filter(([k]) => k.includes('relaxed')).reduce((a, [, v]) => a + v, 0)}`],
  ['Mean share of regional dishes from home zone', pct(pl.home_share_mean)],
  ['Optimizer time per day: median / 90th percentile / max', `${pl.solve_s_per_day.median} s / ${pl.solve_s_per_day.p90} s / ${pl.solve_s_per_day.max} s`],
  ['Patients whose limits needed conflict resolution', `${pl.patients_with_conflicts} of ${pl.patients}`],
], [6000, 3000], 'Planner evaluation on random patients.'))
add(figure('fig08_planner_limits_time.png', 'Left: day total divided by the hard limit for every limited nutrient-day (all ≤ 1). Right: optimizer time per day on a 2-core machine.'))
add(H2('7.3 Soft goals'))
add(P('Soft goals are traded off rather than enforced. Sodium, phosphorus and sugar goals were met on every day; fibre and saturated fat on almost all. The DASH potassium goal was met least often because it conflicts with kidney limits for some patients and is hard to reach with a lower-energy diet; protein goals were missed mainly on vegetarian days.'))
add(figure('fig09_soft_goals.png', 'Share of planned days meeting each soft goal.', 0.8))
add(H2('7.4 Region-first planning'))
const ra = R.region_ablation_pct_home
add(P(`To isolate the effect of region-first planning, the same patients were planned with the region logic turned off (all non-universal dishes treated equally). With MediPlate's region-first tiers, 100% of regional dishes came from the home zone in every zone; without it the share fell to ${ra.without.north}% (North), ${ra.without.south}% (South), ${ra.without.east}% (East), ${ra.without.west}% (West) and ${ra.without.northeast}% (North-East).`))
add(figure('fig10_region_ablation.png', 'Share of regional dishes from the patient\'s home zone with and without region-first planning.', 0.85))
add(H2('7.5 Safety filter'))
add(P('Figure 11 shows how many plan dishes the safety filter removes for different patients. Personal settings (diet type, allergies) remove the most; medicine rules remove specific high-risk foods, such as all fermented-soybean dishes and very high vitamin K dishes for warfarin. Kidney potassium and phosphorus limits mostly act inside the optimizer through portion, salt and leaching, so few dishes need to be removed outright.'))
add(figure('fig11_safety_filter.png', 'Dishes removed before planning for example patients.', 0.85))
add(H2('7.6 Learning from the patient'))
const rk = R.ranker
add(P(`**M3.** A South Indian vegetarian patient was planned for six rounds of three days, disliking the dish that appeared most often in round one (${rk.disliked_dish.replace('_', ' ')}) whenever it was planned. Its appearances fell from ${rk.appearances_of_dish[0]} to ${rk.appearances_of_dish[rk.appearances_of_dish.length - 1]}, while other dishes built on the same main ingredient (${rk.main_ingredient}) stayed available, because toor dal is also needed to meet protein goals.`))
add(figure('fig12_ranker.png', 'Effect of repeated dislikes on how often a dish is planned.', 0.85))
const g = R.m2_simulation
add(P(`**M2 (simulation).** Because continuous-glucose data were not available to the project, personalisation was tested in simulation: ${g.sims} simulated patients with a true response of ${g.true_slope} mg/dL per GL unit and reading noise of ±${g.noise_sd} mg/dL. After 3 readings the 90% range of the estimate was ${g.by_n['3'].p5}–${g.by_n['3'].p95}; after 15 readings it narrowed to ${g.by_n['15'].p5}–${g.by_n['15'].p95}.`))
add(figure('fig13_glucose_simulation.png', 'Personal glucose-response estimate as readings accumulate (simulated patients).', 0.85))
add(H2('7.7 Case studies'))
for (const key of ['A', 'B', 'C']) {
  const c = R.cases[key]
  add(H3(`Patient ${key}: ${c.title}`))
  add(table(['Meal', 'Dishes (day 1)'], Object.entries(c.meals).map(([m, d]) => [m[0].toUpperCase() + m.slice(1), d.join('; ')]),
    [1500, 7500], `Day-1 plan for patient ${key} (energy target ${c.energy} kcal; ${c.removed} dishes removed for health reasons).`))
  if (c.ledger.length) add(P('Conflict ledger: ' + c.ledger.map((l) => `"_${l}_"`).join(' ')))
  if (c.schedule.length) add(P('Medicine timing shown: ' + c.schedule.map(([n, t]) => `${n} (${t})`).join('; ') + '.'))
  add(figure(`fig14_case_${key}.png`, `Patient ${key}: day-1 totals as a percentage of each limit.`, 0.85))
}
add(H2('7.8 Software testing'))
add(table(['Test suite', 'What it covers', 'Result'], [
  ['Data tests', 'Every ingredient resolves; nutrients valid; energy vs macronutrients; 3-language messages; every zone can feed every diet', 'Pass'],
  ['Clinical calculator tests', 'CKD-EPI 2021 vs reference, stages, BMI cut-offs, IDRS, FIB-4, metabolic syndrome, automatic kidney detection', 'Pass'],
  ['Engine tests', 'Conflict ledger, protein caps, SGLT2 and sulfonylurea rules, warfarin band, gout, allergies, region-first, ranker', 'Pass'],
  ['Random-patient property test', '36 patients × 2 days, independent recomputation of every hard limit', 'Pass'],
  ['API tests', 'Full journey, validation, access control, swap, logs, admin; also run on PostgreSQL 16', 'Pass'],
  ['Browser tests (Playwright)', 'Sign-up → onboarding → plan → log → swap → food check in Tamil → progress → languages → mobile layout → admin', 'Pass (5/5)'],
], [2400, 5200, 1400], 'Automated tests: 91 backend tests and 5 browser tests, all passing.'))
add(H2('7.9 User interface'))
add(figure('ss_01-landing.png', 'Landing page.', 0.85))
add(figure('ss_04-onboarding-conditions.png', 'Onboarding, step 3 of 5: conditions.', 0.85))
add(figure('ss_06-today.png', 'Today page: meals with reasons, logging and swap buttons, daily limit meters, medicine timing and blood-sugar logging.', 0.85))
add(figure('ss_07-week.png', 'Week page with day totals and the explanation of limits.', 0.8))
add(figure('ss_08-food-check.png', 'Food check: tender coconut water searched in Tamil for a patient with kidney disease.', 0.85))
add(figure('ss_10-today-tamil.png', 'The same Today page in Tamil.', 0.85))
add(figure('ss_09-progress.png', 'Progress page: insights, result charts and adherence.', 0.85))
add(figure('ss_11-today-mobile.png', 'Mobile layout.', 0.35))

// 8 Discussion
add(H1('8. Discussion and limitations'))
add(P('The results show that separating hard safety limits (constraints) from goals (penalties) lets the planner guarantee safety while still personalising: no hard limit was broken in any evaluated day, yet 97% of days stayed within the patient\'s own regional cuisine at tier 1. Settling conflicts by explicit priority, and writing each decision down, makes the system auditable by a clinician in a way that single-score and language-model approaches are not.'))
add(P('**Limitations.**'))
add(B('Recipes, rules and translations are careful prototypes built from published guidelines. They must be reviewed by a registered dietitian, a pharmacist and native speakers before any patient use.'))
add(B('M1 was trained on 462 South African adults and is shown only as a research indicator. It should be retrained on Indian data, for example NHANES-like Indian cohorts, before clinical use.'))
add(B('M2 personalisation was evaluated in simulation. A real continuous-glucose dataset (such as CGMacros) can be dropped into the pipeline to train a population model.'))
add(B('Nutrient values come from raw-ingredient composition; cooking losses and retention factors are not yet applied except for potassium leaching.'))
add(B('Some public datasets (NHANES, USDA FoodData Central, Indian Food 101, UCI kidney disease) could not be downloaded in the build environment and remain future additions.'))
add(B('On free hosting (0.1 CPU) a weekly plan takes 1–2 minutes; on a normal computer it takes seconds.'))

// 9 Conclusion
add(H1('9. Conclusion and future work'))
add(P('MediPlate demonstrates that a multimorbid patient\'s conflicting diet advice can be merged, explained and turned into safe, regionally familiar weekly meals automatically. The full stack (data pipeline, knowledge base, explainable engine, learning components and a three-language website) is connected end to end and verified by automated tests.'))
add(P('**Future work:** clinical review and a pilot with a dietitian; retraining M1 on Indian data; training M2 on continuous-glucose data; a doctor/dietitian portal; more dishes per region, especially North-East staples; cooking-loss factors; food-photo logging; and live glucose-sensor integration.'))

// References
add(H1('References'))
const refs = [
  'Longvah T, Ananthan R, Bhaskarachary K, Venkaiah K. Indian Food Composition Tables 2017. National Institute of Nutrition, ICMR, Hyderabad.',
  'ICMR-National Institute of Nutrition. Dietary Guidelines for Indians, 2024.',
  'Inker LA et al. New creatinine- and cystatin C–based equations to estimate GFR without race. N Engl J Med 2021;385:1737–1749.',
  'KDIGO 2024 Clinical Practice Guideline for the Evaluation and Management of Chronic Kidney Disease. Kidney Int 2024;105(4S).',
  'Ikizler TA et al. KDOQI Clinical Practice Guideline for Nutrition in CKD: 2020 update. Am J Kidney Dis 2020;76(3 Suppl 1).',
  'American Diabetes Association. Standards of Care in Diabetes—2025. Diabetes Care 2025;48(Suppl 1).',
  'EASL-EASD-EASO Clinical Practice Guidelines on the management of MASLD. J Hepatol 2024.',
  'FitzGerald JD et al. 2020 American College of Rheumatology Guideline for the Management of Gout. Arthritis Care Res 2020.',
  'Mohan V et al. A simplified Indian Diabetes Risk Score for screening for undiagnosed diabetic subjects. J Assoc Physicians India 2005;53:759–763.',
  'Sterling RK et al. Development of a simple noninvasive index to predict significant fibrosis (FIB-4). Hepatology 2006;43:1317–1325.',
  'Alberti KGMM, Zimmet P, Shaw J. Metabolic syndrome—a new world-wide definition (IDF consensus). Diabet Med 2006;23:469–480.',
  'Mifflin MD, St Jeor ST et al. A new predictive equation for resting energy expenditure. Am J Clin Nutr 1990;51:241–247.',
  'Atkinson FS, Brand-Miller JC, Foster-Powell K et al. International tables of glycemic index and glycemic load values 2021. Am J Clin Nutr 2021;114:1625–1632.',
  'Rousseauw J et al. Coronary risk factor screening in three rural communities (South African Heart Disease data). S Afr Med J 1983;64:430–436.',
  'Romano JD et al. PMLB v1.0: an open-source dataset collection for benchmarking machine learning methods. Bioinformatics 2022;38:878–880.',
  'A fuzzy based dietary clinical decision support system for patients with multiple chronic conditions. Scientific Reports 2023;13:12166.',
  'NutriOrion: a hierarchical multi-agent framework for personalized nutrition intervention grounded in clinical guidelines. arXiv:2602.18650, 2026.',
  'Diet-related health recommender systems for patients with chronic health conditions: scoping review. JMIR / PMC, 2025.',
  'Benchmarking ChatGPT and other large language models for personalized stage-specific dietary recommendations in CKD. PMC, 2025.',
  'Perron L, Furnon V. OR-Tools. Google, 2024. https://developers.google.com/optimization',
  'Pedregosa F et al. Scikit-learn: machine learning in Python. J Mach Learn Res 2011;12:2825–2830.',
]
refs.forEach((r, i) => add(new Paragraph({ children: [new TextRun({ text: `[${i + 1}] `, bold: true }), new TextRun(r)], spacing: { after: 100 }, indent: { left: 440, hanging: 440 } })))

// Appendix
add(H1('Appendix A. Running the project'))
add(P('Source code: github.com/amanhooda2005/mediplate (private). To run locally on macOS or Linux: `./scripts/start.sh`; on Windows: `scripts\\start.bat`; then open http://localhost:8000. To rebuild all data: `python pipeline/run_all.py`. To regenerate every figure and number in this report: `python report/experiments.py`, then `node report/build_report.js`. To run all tests: `./scripts/test_all.sh`.'))
add(table(['Folder', 'Contents'], [
  ['pipeline/', 'Source datasets, rules (YAML), recipe file, five pipeline steps, reports'],
  ['backend/app/engine/', 'E1–E5, M1–M3, food check'],
  ['backend/app/routers/', 'REST API'],
  ['backend/tests/', '91 automated tests'],
  ['frontend/src/', 'React website, translations'],
  ['e2e/', 'Playwright browser tests'],
  ['report/', 'Experiment script, figures, this report'],
], [2600, 6400], 'Repository structure.'))
add(H1('Appendix B. List of figures'))
figList.forEach((f) => add(new Paragraph({ children: [new TextRun({ text: f, size: 20 })], spacing: { after: 60 } })))

// ---------------------------------------------------------------- document
const doc = new Document({
  creator: 'MediPlate project', title: 'MediPlate Project Report',
  styles: {
    default: { document: { run: { font: 'Arial', size: 22, color: INK } } },
    paragraphStyles: [
      { id: 'Heading1', name: 'Heading 1', basedOn: 'Normal', next: 'Normal', quickFormat: true,
        run: { size: 34, bold: true, font: 'Arial', color: GREEN }, paragraph: { spacing: { before: 240, after: 200 }, outlineLevel: 0 } },
      { id: 'Heading2', name: 'Heading 2', basedOn: 'Normal', next: 'Normal', quickFormat: true,
        run: { size: 27, bold: true, font: 'Arial', color: '155240' }, paragraph: { spacing: { before: 260, after: 120 }, outlineLevel: 1 } },
      { id: 'Heading3', name: 'Heading 3', basedOn: 'Normal', next: 'Normal', quickFormat: true,
        run: { size: 23, bold: true, font: 'Arial', color: INK }, paragraph: { spacing: { before: 200, after: 100 }, outlineLevel: 2 } },
    ],
  },
  numbering: { config: [
    { reference: 'bullets', levels: [{ level: 0, format: LevelFormat.BULLET, text: '•', alignment: AlignmentType.LEFT,
      style: { paragraph: { indent: { left: 720, hanging: 360 } } } }] },
    { reference: 'numbers', levels: [{ level: 0, format: LevelFormat.DECIMAL, text: '%1.', alignment: AlignmentType.LEFT,
      style: { paragraph: { indent: { left: 720, hanging: 360 } } } }] },
  ] },
  sections: [
    { properties: { page: { size: { width: 11906, height: 16838 }, margin: { top: 1440, bottom: 1440, left: 1440, right: 1440 } } },
      children: title },
    { properties: { page: { size: { width: 11906, height: 16838 }, margin: { top: 1440, bottom: 1440, left: 1440, right: 1440 },
        pageNumbers: { start: 1 } } },
      headers: { default: new Header({ children: [new Paragraph({ alignment: AlignmentType.RIGHT,
        children: [new TextRun({ text: 'MediPlate · Project Report', size: 16, color: MUTED })] })] }) },
      footers: { default: new Footer({ children: [new Paragraph({ alignment: AlignmentType.CENTER,
        children: [new TextRun({ children: [PageNumber.CURRENT], size: 18, color: MUTED })] })] }) },
      children: body },
  ],
})

Packer.toBuffer(doc).then((buf) => {
  const out = path.join(DIR, 'MediPlate_Project_Report.docx')
  fs.writeFileSync(out, buf)
  console.log('wrote', out, `${figNo} figures, ${tabNo} tables`)
})
