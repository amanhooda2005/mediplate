// Builds the filled VIT Invention Disclosure Format (IDF)-B for MediPlate.
// Numbers come from ../report/results.json; figures from ../report/figures/.
const fs = require('fs')
const path = require('path')
const {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, WidthType, AlignmentType,
  BorderStyle, ShadingType, ImageRun, HeadingLevel, PageOrientation,
} = require('docx')

const DIR = __dirname
const FIGS = path.join(DIR, '..', 'report', 'figures')
const R = JSON.parse(fs.readFileSync(path.join(DIR, '..', 'report', 'results.json'), 'utf8'))
const pl = R.planner
const mm = R.m1_metrics
const ab = R.region_ablation_pct_home
const lr = 'Logistic regression'

const INK = '111111'
const MUTED = '5A5A5A'
const NAVY = '1F2A6E'
const CONTENT_W = 9360 // DXA, A4 with 1 inch margins

// ------------------------------------------------------------------ helpers
function runs(text, base = {}) {
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
const P = (text, opts = {}) => new Paragraph({
  children: runs(text, { size: 21 }), spacing: { after: 120, line: 280 },
  alignment: AlignmentType.JUSTIFIED, ...opts,
})
const SMALL = (text) => new Paragraph({ children: runs(text, { size: 18, color: MUTED }), spacing: { after: 120, line: 260 } })
const Q = (n, t) => new Paragraph({
  children: [new TextRun({ text: `${n}. ${t}`, bold: true, size: 22, color: NAVY })],
  spacing: { before: 260, after: 120 }, keepNext: true,
})
const SUB = (t) => new Paragraph({ children: [new TextRun({ text: t, bold: true, size: 21 })], spacing: { before: 140, after: 80 }, keepNext: true })
const B = (text) => new Paragraph({ children: runs(text, { size: 21 }), bullet: { level: 0 }, spacing: { after: 70, line: 275 } })
const NUM = (text) => new Paragraph({ children: runs(text, { size: 21 }), numbering: { reference: 'objs', level: 0 }, spacing: { after: 70, line: 275 } })
const EQ = (t) => new Paragraph({ children: [new TextRun({ text: t, italics: true, size: 21, font: 'Cambria Math' })], alignment: AlignmentType.CENTER, spacing: { before: 80, after: 120 } })

const thin = { style: BorderStyle.SINGLE, size: 4, color: '888888' }
const borders = { top: thin, bottom: thin, left: thin, right: thin }

function pngSize(file) {
  const b = fs.readFileSync(file)
  return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) }
}
let figNo = 0
function figure(file, caption, widthFrac = 0.92) {
  figNo += 1
  const full = path.join(FIGS, file)
  const { w, h } = pngSize(full)
  const width = Math.round(620 * widthFrac)
  return [
    new Paragraph({
      alignment: AlignmentType.CENTER, spacing: { before: 140, after: 40 },
      children: [new ImageRun({ data: fs.readFileSync(full), type: 'png',
        transformation: { width, height: Math.round(width * h / w) },
        altText: { title: `Figure ${figNo}`, description: caption, name: file } })],
    }),
    new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 160 },
      children: [new TextRun({ text: `Figure ${figNo}. `, bold: true, size: 18 }),
        new TextRun({ text: caption, size: 18, color: MUTED })] }),
  ]
}

function table(headers, rows, widths, fontSize = 17) {
  const total = widths.reduce((a, b) => a + b, 0)
  const ws = widths.map((w) => Math.round(w * CONTENT_W / total))
  ws[ws.length - 1] += CONTENT_W - ws.reduce((a, b) => a + b, 0)
  const cell = (text, i, head) => new TableCell({
    borders, width: { size: ws[i], type: WidthType.DXA },
    shading: head ? { fill: 'E4E7F2', type: ShadingType.CLEAR } : undefined,
    margins: { top: 50, bottom: 50, left: 90, right: 90 },
    children: [new Paragraph({ children: runs(String(text), { size: fontSize, bold: head || undefined, color: head ? NAVY : INK }) })],
  })
  return [
    new Table({ width: { size: CONTENT_W, type: WidthType.DXA }, columnWidths: ws,
      rows: [new TableRow({ tableHeader: true, children: headers.map((h, i) => cell(h, i, true)) }),
        ...rows.map((r) => new TableRow({ children: r.map((c, i) => cell(c, i, false)) }))] }),
    new Paragraph({ spacing: { after: 160 }, children: [] }),
  ]
}

// ------------------------------------------------------------------ letterhead
function letterhead() {
  const logo = path.join(DIR, 'vit_logo.png')
  const { w, h } = pngSize(logo)
  const lw = 150
  const cell = (children, width, shade) => new TableCell({
    borders, width: { size: width, type: WidthType.DXA }, verticalAlign: 'center',
    margins: { top: 60, bottom: 60, left: 90, right: 90 },
    shading: shade ? { fill: shade, type: ShadingType.CLEAR } : undefined, children,
  })
  const txt = (t, opts = {}) => new Paragraph({ children: [new TextRun({ text: t, size: 17, ...opts })] })
  return [
    new Paragraph({ children: [new TextRun({ text: '©VIT IPR&TTCELL', bold: true, size: 18 })], spacing: { after: 80 } }),
    new Table({
      width: { size: CONTENT_W, type: WidthType.DXA }, columnWidths: [2900, 3060, 1700, 1700],
      rows: [
        new TableRow({ children: [
          new TableCell({ borders, width: { size: 2900, type: WidthType.DXA }, rowSpan: 3, verticalAlign: 'center',
            margins: { top: 60, bottom: 60, left: 90, right: 90 },
            children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new ImageRun({ data: fs.readFileSync(logo), type: 'png', transformation: { width: lw, height: Math.round(lw * h / w) }, altText: { title: 'VIT', description: 'VIT logo', name: 'vit_logo.png' } })] })] }),
          new TableCell({ borders, width: { size: 3060, type: WidthType.DXA }, rowSpan: 3, verticalAlign: 'center',
            margins: { top: 60, bottom: 60, left: 90, right: 90 },
            children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: 'Invention Disclosure Format (IDF)-B', bold: true, size: 24 })] })] }),
          cell([txt('Document No.')], 1700), cell([txt('02-IPR-R003')], 1700),
        ] }),
        new TableRow({ children: [cell([txt('Issue No/Date')], 1700), cell([txt('2/01.02.2024')], 1700)] }),
        new TableRow({ children: [cell([txt('Amd. No/Date')], 1700), cell([txt('0/00.00.0000')], 1700)] }),
      ],
    }),
    new Paragraph({ spacing: { after: 200 }, children: [] }),
  ]
}

// ------------------------------------------------------------------ content
const doc = []
const add = (x) => (Array.isArray(x) ? doc.push(...x) : doc.push(x))

add(letterhead())

// 1 ---------------------------------------------------------------- title
add(Q(1, 'Title of the invention:'))
add(P('**A region-first, medication-aware meal-planning system that detects and resolves conflicting dietary rules for patients living with multiple chronic diseases.**'))
add(SMALL('Working name of the prototype: MediPlate.'))

// 2 ---------------------------------------------------------------- field
add(Q(2, 'Field /Area of invention:'))
add(P('Medical informatics and clinical decision support systems; computer-implemented personalised clinical nutrition; food–drug interaction screening; combinatorial optimisation (mixed-integer linear programming) applied to diet formulation; applied machine learning for chronic-disease risk stratification.'))
add(P('**Likely classification:** G16H 20/60 (ICT for dietary therapy), G16H 50/20 (ICT for computer-aided diagnosis/decision support), G16H 20/10 (ICT for medication regimens), G06Q 50/22 (healthcare services), G06N 20/00 (machine learning).'))

// 3 ---------------------------------------------------------------- prior art
add(Q(3, 'Prior Patents and Publications from literature (provide a table summarizing the prior art)'))
add(P('Each item below was retrieved and read. Columns (a), (b) and (c) record whether the reference discloses the three features that this invention combines: **(a)** pre-filtering the food set against the patient\'s _entire_ medicine list, **(b)** detecting and resolving _conflicting_ dietary rules between co-existing diseases and explaining the resolution to the patient, **(c)** selecting dish, portion, salt level and preparation by mixed-integer linear programming under a _home-region-first_ cuisine objective.'))
add(table(['Ref.', 'Year / Owner', 'What it discloses', '(a)', '(b)', '(c)', 'Gap'], [
  ['US10373522B2', '2019, IBM', 'Genetic-algorithm meal generation from seed ingredients and exclusion criteria; fitness on cost, shelf life, flavour pairing, waste, preparation time', 'No', 'No', 'No', 'No medication logic, no disease rules, no clinical constraint optimisation'],
  ['US12354728B2', '2025, Bia Studios LLC', 'Meal building from on-hand ingredients and dietary needs; randomised sub-meal generators, allergy filtering, calorie split', 'No', 'No', 'No', 'Randomised, not optimised; no drug or comorbidity reasoning'],
  ['US8060383B2', '2011, Badinelli', 'Barcode/label scan compared against a stored profile that includes prescriptions, allergies and chronic illness; real-time alert', 'Partial', 'No', 'No', 'Point-of-purchase screening of one product; no plan generation or conflict resolution'],
  ['US10902943B2', '2021, IBM', 'Predicts drug–food interactions from drug/food similarity feature vectors and logistic regression', 'Partial', 'No', 'No', 'Predicts isolated drug–food pairs; is not a meal planner'],
  ['US11580879B2', '2023, Medtronic MiniMed', 'Personalised nutrition from a food ontology with linear optimisation (Simplex) and constraint satisfaction', 'No', 'No', 'Partial', 'Closest on mathematics; no medication filter, no conflict ledger, no region or preparation variables'],
  ['US12254972B2', '2025, Seekingsimple Inc.', '"Nutritional prescription" templates per chronic condition, including patients with several conditions; removes harmful and adds beneficial products', 'No', 'Partial', 'No', 'Additive templates; no priority-based resolution, no optimiser, no drug screening'],
  ['US6872077B2', '2005, Solos Health LLC', 'Recipe templates with ingredient contribution values and nutritional priority values to meet macronutrient allowances', 'No', 'No', 'No', 'Macronutrient personalisation only; no clinical or pharmacological layer'],
  ['Sklan & Dariel, Br J Nutr, 10.1079/bjn19930102', '1993', 'Foundational mixed-integer linear programming formulation of human diet planning with whole-unit foods and frequency constraints', 'No', 'No', 'Partial', 'Establishes the solver class; eating practices are generic, not a regional preference ordering'],
  ['Marashi-Hosseini et al., Sci Rep, 10.1038/s41598-023-39371-4', '2023', 'Mamdani fuzzy dietary decision-support system, 1,144 rules, for co-existing obesity, diabetes, hypertension, hyperlipidaemia and kidney disease', 'No', 'Partial', 'No', 'Blends competing requirements inside fuzzy membership functions; no clinical-priority ranking and no patient-facing explanation'],
  ['Paidipati et al., IJERPH, 10.3390/ijerph18157842', '2021', 'Pre-emptive and non-pre-emptive goal programming over 62 Indian recipes for six calorie levels in diabetes', 'No', 'No', 'Partial', 'Single disease; Indian foods treated as one pool, not regionally stratified'],
  ['Ma et al., Foods, 10.3390/foods13132144', '2024', 'Graph convolutional network over a user–recipe–nutrient graph for health-aware recipe recommendation', 'No', 'No', 'No', 'Learned ranking, not constrained optimisation; no clinical or drug constraints'],
], [1450, 1150, 2950, 500, 500, 500, 2000], 16))

// 4 ---------------------------------------------------------------- summary
add(Q(4, 'Summary and background of the invention (Address the gap / Novelty)'))
add(SUB('Background and problem'))
add(P('About one in four Indian adults over 30 lives with more than one chronic disease at the same time, and more than 40% of people with diabetes also have high blood pressure. Existing diet applications plan for **one** disease at a time. This produces three failures that patients meet in practice:'))
add(B('**Conflicting advice is left to the patient.** Kidney disease says "eat less protein and less potassium"; diabetes says "eat more fibre and pulses"; heart failure says "eat more potassium-rich fruit". A patient with all three receives three plans that contradict each other and no rule for deciding which instruction wins.'))
add(B('**Medicines are ignored.** Warfarin fixes a vitamin-K band, ACE inhibitors and potassium-sparing diuretics make potassium-rich food dangerous, statins clash with grapefruit, MAO inhibitors with fermented and aged foods. Existing planners either store the prescription without acting on it, or score one drug–food pair at a time, and never remove the offending dish from the plan before it is offered.'))
add(B('**The food is unfamiliar.** Plans are built from a national or western food pool, so a patient in Tamil Nadu is told to eat dishes from another region and abandons the plan. In our own measurement, without a region rule only ' + `${ab.without.south}% ` + 'of a South-Indian patient\'s regional dishes came from South India.'))
add(SUB('Novelty: what is new here'))
add(P('The invention is the **combination** of three mechanisms in one pipeline, in this order, where the output of each one constrains the next:'))
add(NUM('**Multi-drug, multi-disease pre-filtering.** The patient\'s complete medicine list is expanded into drug classes and each class contributes food rules. Those rules are merged with the rules of every condition the patient has, and with diet type, allergies and religious choices, into a single removal set that is applied **before** any plan is generated, so an unsafe dish is never presented and then retracted.'))
add(NUM('**Conflict detection and priority-based resolution with a plain-language ledger.** Every condition and medicine contributes numeric targets carrying a clinical priority (1 = immediate safety, 2 = organ protection, 3 = disease control, 4 = weight and general, 5 = wellness). When two targets on the same nutrient disagree, the stricter target from the higher priority is kept, the discarded target is recorded, and the system emits a patient-readable sentence such as "Sodium (salt): the strictest limit (2,000 mg from high blood pressure) was used." The ledger is part of the output, not an internal log.'))
add(NUM('**Region-first optimisation over dish, portion, salt level and preparation.** The surviving dishes are given to a mixed-integer linear program that fills nine meal slots a day. The patient\'s state is mapped to a home food zone; the program searches that zone first, widens to neighbouring zones and then to all-India dishes only when the limits cannot otherwise be met, and treats **salt level** (full / half / quarter) and **potassium-leaching preparation** as decision variables alongside dish and portion.'))
add(P('No reference found in the search (Section 3) discloses this chain. US11580879B2 optimises but ignores medicines and conflicts; Marashi-Hosseini (2023) addresses comorbidity but dissolves conflicts inside fuzzy logic without explanation; US10902943B2 predicts drug–food pairs but does not plan meals; Paidipati (2021) optimises Indian menus for a single disease with no regional stratification. The unclaimed combination is a **full-regimen drug filter feeding a priority-based conflict resolver that emits an explanation, whose surviving food set is optimised region-first with preparation-level decision variables.**'))

// 5 ---------------------------------------------------------------- objectives
add(Q(5, 'Objective(s) of Invention'))
add(NUM('To generate a weekly meal plan that satisfies the dietary limits of **all** of a patient\'s chronic diseases simultaneously, rather than one disease at a time.'))
add(NUM('To remove, before planning, every dish that interacts with any medicine in the patient\'s current regimen.'))
add(NUM('To detect conflicting dietary requirements between co-existing diseases, resolve them by clinical priority, and disclose each resolution to the patient in ordinary language.'))
add(NUM('To keep the plan culturally acceptable by drawing food from the patient\'s own region of India before any other region.'))
add(NUM('To use preparation-level controls — salt reduction and potassium leaching — as a way of keeping a familiar dish in the plan instead of deleting it.'))
add(NUM('To explain every dish, every limit and every removal, so that a clinician can audit the plan and a patient can trust it.'))
add(NUM('To adapt to the individual over time from meal logs, ratings and after-meal blood-sugar readings.'))
add(NUM('To deliver all of the above in the patient\'s own language (English, Tamil and Hindi in the prototype) on an ordinary web browser.'))

// 6 ---------------------------------------------------------------- principle
add(Q(6, 'Working principle of the invent (in brief)'))
add(P('The system converts a patient record into a constrained optimisation problem and solves it, then converts the solution back into explanations. Five stages run on every request:'))
add(table(['Stage', 'Name', 'What it does'], [
  ['E1', 'Profile builder', 'Derives BMI on Indian cut-offs, eGFR by CKD-EPI 2021, kidney stage, reference body weight and energy requirement (Mifflin-St Jeor). Turns on kidney-safe limits automatically when eGFR < 60.'],
  ['E2', 'Safety filter', 'Removes dishes failing diet type, allergies, condition rules, medicine rules, or a hard limit even at the smallest salt-reduced portion.'],
  ['E3', 'Target builder and conflict resolver', 'Collects numeric targets from every condition, medicine and risk result with a clinical priority; merges them; resolves clashes; writes the conflict ledger.'],
  ['E4', 'Optimiser', 'Mixed-integer linear program choosing dish × portion × salt level × leaching for nine slots a day, home region first, hard limits as constraints and soft goals as penalties.'],
  ['E5', 'Explainer', 'Produces the reason for each dish, region of origin, day totals against every limit, meal sugar load, removed dishes and medicine timing, in the patient\'s language.'],
], [700, 2100, 6560]))
add(figure('fig01_architecture.png', 'System architecture. Every plan request passes through the five stages; logs return to the learning models.'))

// 7 ---------------------------------------------------------------- detail
add(Q(7, 'Description of the invention in detail (Include drawing and or photograph as needed)'))

add(SUB('7.1 Knowledge base and data preparation'))
add(P('An offline pipeline builds the data the system runs on and refuses to publish a broken build. It downloads the Indian Food Composition Tables 2017 (542 foods) and gap-fills 11 foods from USDA SR Legacy, giving **553 foods**; converts all units to grams per 100 g and kilocalories; runs an Atwater consistency check that caught one published entry whose stated energy was double its macronutrients; costs **186 regional dishes** across five food zones into nutrients per serving; compiles and schema-checks the rule base — **8 diseases, 65 medicines in 35 drug classes, 23 food tags**; and trains the risk model. All explanations are stored as **195 message keys in English, Tamil and Hindi**, so the engine emits keys and the interface renders language.'))
add(P('The 36 states and union territories are mapped to five food zones (North, South, East, West, North-East) with an explicit list of neighbouring zones per state, which is what makes the widening search in E4 possible.'))
add(figure('fig02_pipeline.png', 'Offline data pipeline: fetch, clean, merge, validate, train.'))

add(SUB('7.2 Stage E1 — patient context'))
add(P('From age, sex, height, weight, waist, activity, state, diet type, conditions, medicines and laboratory results the system derives BMI against Indian cut-offs (overweight ≥ 23, obese ≥ 25), eGFR by the CKD-EPI 2021 race-free equation, kidney stage, and a reference body weight capped at BMI 25 that is used for every per-kilogram target so that protein limits are not inflated by excess weight. Energy is Mifflin-St Jeor times an activity factor, minus 500 kcal where weight loss is indicated. A kidney stage derived from laboratory results switches on kidney limits even if the patient did not report kidney disease.'))

add(SUB('7.3 Stage E2 — pre-filter against the whole regimen'))
add(P('Each medicine is resolved to a drug class, and each class contributes food rules. The rules of every condition, the diet type, the allergy list and the beef/pork choice are unioned into one removal set, and each removed dish carries the reason for its removal. A dish is also removed if it breaks a hard limit even at its smallest portion with quarter salt, so an impossible dish never enters the optimiser. Examples from the implemented rule base:'))
add(table(['Medicine or condition', 'Rule applied', 'Effect on the food set'], [
  ['Warfarin', 'Vitamin K held in a narrow daily band rather than avoided', 'Very-high vitamin-K dishes removed; the rest bounded above and below'],
  ['ACE inhibitor, ARB or potassium-sparing diuretic', 'Potassium ceiling; salt substitutes forbidden', 'High-potassium dishes limited; a no-salt-substitute advice line is emitted'],
  ['Statin (simvastatin, atorvastatin)', 'Grapefruit and related citrus avoided', 'Interacting dishes removed'],
  ['MAO inhibitor', 'Tyramine-bearing aged, fermented and cured foods avoided', 'Interacting dishes removed'],
  ['Metformin', 'Alcohol avoided; medicine taken with meals', 'Timing instruction attached to the plan'],
  ['Chronic kidney disease stage ≥ 4 or serum K⁺ > 5.0', 'Potassium ≤ 2,000 mg/day, phosphorus ≤ 800 mg/day, both hard', 'Star fruit and tender coconut water removed outright; leaching enabled'],
  ['Gout', 'High-purine foods avoided; red meat heavily penalised; alcohol avoided', 'Organ meat and high-purine dishes removed'],
], [2200, 3400, 3760]))

add(SUB('7.4 Stage E3 — targets, conflict detection and the ledger'))
add(P('A target is a tuple {nutrient, bound, value, hardness, priority, reason}, where the value may be absolute, per kilogram of reference weight, a percentage of energy, or per 1,000 kcal, and may be conditional on a laboratory result or disease stage. Targets are gathered from every condition, every medicine, the risk model and the healthy-eating default. Two targets on the same nutrient and bound conflict; the resolver keeps the one with the higher clinical priority, breaks ties by strictness, and records the discarded target with the reason for its discard. This record is rendered as the conflict ledger. A worked example produced by the prototype for a patient with chronic kidney disease stage 4 and high blood pressure:'))
add(SMALL('Conflict ledger: "Potassium: high blood pressure advice suggests at least 3,500 mg a day, but kidney disease at stage 4 needs it below 2,000 mg. The kidney limit was used, because it is the immediate safety limit." · "Sodium (salt): the strictest limit (2,000 mg from high blood pressure) was used."'))
add(P('The priority scale is: **1** immediate safety (for example a potassium ceiling with a raised serum potassium), **2** organ protection (protein restriction in kidney disease), **3** disease control (carbohydrate and sugar limits in diabetes), **4** weight and general health, **5** wellness. Because the priority is attached to the rule rather than hard-coded in the engine, a clinician can revise the knowledge base without touching the software.'))

add(SUB('7.5 Stage E4 — the region-first mixed-integer program'))
add(P('Let a variant be a triple of dish d, portion p and salt level s ∈ {1, 0.5, 0.25}, with a further binary for potassium leaching where the preparation permits it (leaching is disallowed on raw dishes such as salads, curd and sprouts). Let x be 1 when variant v is placed in slot j of day t. For nine slots a day:'))
add(EQ('minimise  Σ penalty(v)·x[v,j,t] + Σ w(g)·shortfall(g,t)   subject to'))
add(EQ('Σ x[v,j,t] = 1 for every slot j;   Σ nutrient(n,v)·x[v,j,t] ≤ limit(n)  for every hard limit n;'))
add(EQ('Σ x over the week ≤ 5 for any one dish;   carbohydrate(meal) ≥ floor;   vitamin K within band'))
add(P('Hard limits become constraints, so they cannot be broken; soft goals become penalised shortfalls, so the solver trades them against each other instead of failing. The penalty term carries the region preference: dishes from the patient\'s home zone carry no penalty, neighbouring zones carry a penalty, all-India dishes carry a larger one, and the program only reaches them when the constraints cannot otherwise be satisfied. Repetition is capped so that the week stays varied. The prototype solves with the CBC mixed-integer solver through OR-Tools at a 5% relative gap.'))
add(P('Salt level and leaching are inside the optimisation rather than applied afterwards, which is what lets a familiar dish survive a strict limit: a South-Indian sambar that fails a 2,000 mg sodium ceiling at full salt is kept at half salt, and a potato dish that fails a potassium ceiling is kept with a leaching instruction (soak and discard the water, retention factor 0.6) instead of being deleted.'))

add(SUB('7.6 Stage E5 — explanation'))
add(P('For every dish the output carries the reason it was chosen, its region of origin, the portion, the salt level and any preparation note; for every day it carries each nutrient total against its limit with the source of that limit; and for the patient it carries the conflict ledger, the list of removed dishes with reasons, medicine timing instructions and the per-meal sugar load. The server sends message keys and parameters, so the same plan renders in English, Tamil or Hindi.'))
add(figure('ss_06-today.png', 'Prototype interface: the day\'s meals with reasons, limit meters, medicine timing and logging controls.', 0.78))

add(SUB('7.7 Learning components'))
add(P('**M1**, a logistic-regression heart-risk indicator trained on 462 adults, together with validated calculators (FIB-4, Indian Diabetes Risk Score, IDF metabolic-syndrome criteria), raises the priority of cardiovascular limits when risk is high. **M2** estimates the patient\'s own blood-sugar response: glycemic load is used until the patient has logged three before/after-meal pairs, after which a personal slope of sugar rise per 10 g of carbohydrate is fitted and used in planning. **M3** learns from eaten, skipped, liked and disliked meals at the level of ingredients, so disliking one dish lowers every dish sharing its main ingredient. None of the three may override a hard limit; they act only on the penalty terms.'))

// 8 ---------------------------------------------------------------- validation
add(Q(8, 'Experimental validation results:'))
add(P('A working full-stack prototype was built and measured. Every number below is produced by a reproducible evaluation script over the implemented system, not by simulation of a design.'))

add(SUB('8.1 Safety of generated plans'))
add(P(`The planner was run for **${pl.patients} synthetic patients** drawn from a fixed seed, covering all 36 states, three diet types, one to four co-existing conditions each, kidney stages 2–5, random potassium and phosphorus results and 14 medicine combinations, for three days each (**${pl.days} planned days**). Each day was then re-totalled independently from the raw dish data rather than from the optimiser's own numbers.`))
add(table(['Measure', 'Result'], [
  ['Days for which a feasible plan was produced', `${pl.feasible_days} of ${pl.days}`],
  ['Hard-limit checks performed (daily limits, meal carbohydrate floors, vitamin-K band, energy window, removed dishes)', `${pl.hard_checks}`],
  ['**Violations**', `**${pl.hard_violations}**`],
  ['Days satisfied inside the home region (tier 1)', `${pl.tiers.tier1}`],
  ['Days needing a neighbouring region (tier 2)', `${pl.tiers.tier2}`],
  ['Mean share of regional dishes from the home zone', `${(100 * pl.home_share_mean).toFixed(1)}%`],
  ['Patients whose limits required conflict resolution', `${pl.patients_with_conflicts} of ${pl.patients}`],
  ['Optimiser time per day (median / 90th percentile / maximum, 2 cores)', `${pl.solve_s_per_day.median} s / ${pl.solve_s_per_day.p90} s / ${pl.solve_s_per_day.max} s`],
], [6200, 3160]))

add(SUB('8.2 Effect of the region-first mechanism (ablation)'))
add(P('The same patients were planned twice, once with the region preference and once with it removed, and the share of regional dishes coming from the patient\'s own zone was measured.'))
add(table(['Home zone', 'With region-first', 'Without region-first'], [
  ['North', `${ab.with_region_first.north.toFixed(1)}%`, `${ab.without.north.toFixed(1)}%`],
  ['South', `${ab.with_region_first.south.toFixed(1)}%`, `${ab.without.south.toFixed(1)}%`],
  ['East', `${ab.with_region_first.east.toFixed(1)}%`, `${ab.without.east.toFixed(1)}%`],
  ['West', `${ab.with_region_first.west.toFixed(1)}%`, `${ab.without.west.toFixed(1)}%`],
  ['North-East', `${ab.with_region_first.northeast.toFixed(1)}%`, `${ab.without.northeast.toFixed(1)}%`],
], [3400, 3000, 2960]))
add(P('The mechanism is therefore responsible for the whole of the cultural fit; without it the North-East patient receives 9.3% of regional dishes from the North-East.'))
add(figure('fig10_region_ablation.png', 'Share of regional dishes from the patient\'s home zone, with and without region-first planning.', 0.8))

add(SUB('8.3 Pre-filter behaviour'))
add(P('Dishes removed before planning, by scenario, out of 186:'))
add(table(['Patient scenario', 'Dishes removed', 'Dishes limited'],
  R.safety_scenarios.map((s) => [s.scenario, `${s.removed}`, `${s.limited}`]), [4800, 2400, 2160]))

add(SUB('8.4 Risk model (M1)'))
add(P(`Trained on the South African Heart Disease dataset (**${mm.n_rows} adults**, ${mm.positives} with coronary heart disease, ${mm.n_features} features), logistic regression was selected over gradient boosting, which overfitted. All figures at the 0.5 decision threshold.`))
add(table(['Metric', 'Training data', '5×5-fold cross-validation', 'Held-out test (30%)'], [
  ['Accuracy', `${mm.train[lr].accuracy.toFixed(3)}`, `${mm.cv[lr].accuracy.mean.toFixed(3)} ± ${mm.cv[lr].accuracy.sd.toFixed(3)}`, `${mm.holdout[lr].test_part.accuracy.toFixed(3)}`],
  ['Precision', `${mm.train[lr].precision.toFixed(3)}`, `${mm.cv[lr].precision.mean.toFixed(3)} ± ${mm.cv[lr].precision.sd.toFixed(3)}`, `${mm.holdout[lr].test_part.precision.toFixed(3)}`],
  ['Recall', `${mm.train[lr].recall.toFixed(3)}`, `${mm.cv[lr].recall.mean.toFixed(3)} ± ${mm.cv[lr].recall.sd.toFixed(3)}`, `${mm.holdout[lr].test_part.recall.toFixed(3)}`],
  ['F1', `${mm.train[lr].f1.toFixed(3)}`, `${mm.cv[lr].f1.mean.toFixed(3)} ± ${mm.cv[lr].f1.sd.toFixed(3)}`, `${mm.holdout[lr].test_part.f1.toFixed(3)}`],
  ['ROC AUC', `${mm.train[lr].auc.toFixed(3)}`, `${mm.cv[lr].roc_auc.mean.toFixed(3)} ± ${mm.cv[lr].roc_auc.sd.toFixed(3)}`, `${mm.holdout[lr].test_part.auc.toFixed(3)}`],
], [2600, 2200, 2760, 1800]))
add(P('The model acts only as a caution flag that tightens cardiovascular limits; it is not used for diagnosis and cannot override a hard limit.'))

add(SUB('8.5 Software verification'))
add(P('91 automated backend tests, including a property test that plans for 36 randomly generated patients across all states, diets, condition combinations, kidney stages, laboratory results and 14 medicine groups and then re-derives every day from raw data; a strict type-checked web build that fails on any missing translation; and 5 browser tests covering sign-up, five-step onboarding, plan generation, meal logging, dish swap, food check in Tamil script, language switching, mobile layout and the administration console. All pass.'))

// 9 ---------------------------------------------------------------- protection
add(Q(9, 'What aspect(s) of the invention need(s) protection?'))
add(P('Protection is sought for the following aspects, in order of importance.'))
add(SUB('A. Principal aspect (system and method)'))
add(P('A computer-implemented method of generating a dietary plan for a patient having **two or more** co-existing chronic conditions and a medication regimen of **one or more** medicines, comprising: resolving each medicine to a drug class and deriving food rules from it; forming a removal set from the union of the drug-class rules, the condition rules and the patient\'s dietary constraints, and excluding the corresponding foods from a candidate set **before** plan generation; deriving numeric nutrient targets each carrying a clinical priority; **detecting a conflict** between two targets on the same nutrient, selecting one by clinical priority, and **emitting a human-readable record of the resolution as part of the output**; and selecting, by mixed-integer optimisation over the reduced candidate set, a combination of dish, portion, salt level and preparation method for each meal slot subject to the resolved targets as hard constraints.'))
add(SUB('B. Region-first selection'))
add(P('The above, wherein candidate dishes are stratified into geographic food zones, the patient\'s residence is mapped to a home zone, and the optimisation applies a penalty ordering that exhausts the home zone before neighbouring zones and neighbouring zones before the remaining set, widening only when the hard constraints cannot otherwise be satisfied.'))
add(SUB('C. Preparation-level decision variables'))
add(P('The above, wherein salt level and a potassium-reducing preparation (leaching with a retention factor) are decision variables within the same optimisation, and a preparation variable is permitted only for dishes marked as cooked, so that a dish that would fail a limit at full salt or without leaching is retained in modified form rather than removed.'))
add(SUB('D. Further aspects'))
add(B('Automatic activation of organ-protective limits from laboratory results (eGFR, serum potassium, serum phosphorus) even where the patient has not reported the condition.'))
add(B('Use of a reference body weight capped at a target BMI for all per-kilogram targets.'))
add(B('Removal of a candidate dish when it breaches a hard limit at its smallest portion and lowest salt level, evaluated before optimisation.'))
add(B('Bounding rather than excluding a nutrient where a medicine requires stability (vitamin K under warfarin).'))
add(B('Ingredient-level propagation of a patient\'s dislike to other dishes sharing that ingredient.'))
add(B('Progressive personalisation of the glycemic response from a small number of paired readings, bounded so that it cannot relax a hard limit.'))
add(B('Emission of language-independent message keys with translated parameters, so that the clinical explanation is reproduced exactly in each supported language.'))
add(SMALL('Disclosure status (to be confirmed by the inventor before submission): no paper has been published, presented or submitted, and the work has not been offered for sale. The prototype source is held in a GitHub repository — if that repository is public, the date of its first public commit is a public disclosure and must be stated here.'))

// 10 --------------------------------------------------------------- TRL
add(Q(10, 'What is Technology readiness level of your invention? (Tick the appropriate TRL)'))
const trlHead = ['Research', '', '', 'Development', '', '', 'Deployment', '', '']
const trlCols = [1040, 1040, 1040, 1040, 1040, 1040, 1040, 1040, 1040]
const trlText = [
  'Basic Principles observed', 'Technology concept formulated', 'Experimental proof of concept',
  'Technology validated in a lab', 'Technology validated in a relevant environment',
  'Technology demonstrated in a relevant environment', 'System prototype demonstration in an operational environment',
  'System complete and qualified', 'Actual system proven in an operational environment',
]
const tcell = (children, i, shade) => new TableCell({
  borders, width: { size: trlCols[i], type: WidthType.DXA }, verticalAlign: 'center',
  margins: { top: 60, bottom: 60, left: 60, right: 60 },
  shading: shade ? { fill: shade, type: ShadingType.CLEAR } : undefined, children,
})
const centre = (t, opts = {}) => new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: t, size: 15, ...opts })] })
add(new Table({
  width: { size: CONTENT_W, type: WidthType.DXA }, columnWidths: trlCols,
  rows: [
    new TableRow({ children: [
      new TableCell({ borders, columnSpan: 3, shading: { fill: 'E4E7F2', type: ShadingType.CLEAR }, children: [centre('Research', { bold: true, size: 17 })] }),
      new TableCell({ borders, columnSpan: 3, shading: { fill: 'E4E7F2', type: ShadingType.CLEAR }, children: [centre('Development', { bold: true, size: 17 })] }),
      new TableCell({ borders, columnSpan: 3, shading: { fill: 'E4E7F2', type: ShadingType.CLEAR }, children: [centre('Deployment', { bold: true, size: 17 })] }),
    ] }),
    new TableRow({ children: trlText.map((_, i) => tcell([centre(`TRL ${i + 1}`, { bold: true, size: 16 })], i, 'F2F3F8')) }),
    new TableRow({ children: trlText.map((t, i) => tcell([centre(t)], i, i === 3 ? 'DCEFE4' : undefined)) }),
    new TableRow({ children: trlText.map((_, i) => tcell([centre(i === 3 ? '✓' : '', { bold: true, size: 28, color: '15703F' })], i, i === 3 ? 'DCEFE4' : undefined)) }),
  ],
}))
add(new Paragraph({ spacing: { after: 160 }, children: [] }))
add(P('**TRL 4 — technology validated in a laboratory.** A complete, working prototype of the whole pipeline exists and has been validated on 300 planned days for 100 synthetic patients with 0 violations in 1,032 hard-limit checks, on a fixed and reproducible test bench. It has not yet been used by real patients or evaluated by a registered dietitian and a pharmacist, which is what TRL 5 would require. The clinical knowledge base is a careful prototype compiled from ICMR-NIN 2024, ADA 2025, KDIGO 2024, AHA/DASH, EASL 2024, ACR 2020 and drug labels, and is marked throughout as requiring clinical review before patient use.'))

add(new Paragraph({ spacing: { before: 300 }, alignment: AlignmentType.CENTER,
  children: [new TextRun({ text: '----------------------END OF THE DOCUMENT-----------------------------', bold: true, size: 21 })] }))

// ------------------------------------------------------------------ assemble
const document = new Document({
  creator: 'MediPlate project', title: 'Invention Disclosure Format (IDF)-B — MediPlate',
  numbering: { config: [{ reference: 'objs', levels: [{ level: 0, format: 'decimal', text: '%1.', alignment: AlignmentType.START,
    style: { paragraph: { indent: { left: 460, hanging: 280 } } } }] }] },
  styles: { default: { document: { run: { font: 'Times New Roman', size: 21, color: INK } } } },
  sections: [{
    properties: { page: { margin: { top: 1000, right: 1000, bottom: 1000, left: 1000 } } },
    children: doc,
  }],
})
const out = path.join(DIR, 'MediPlate_IDF-B_filled.docx')
Packer.toBuffer(document).then((b) => {
  fs.writeFileSync(out, b)
  console.log('wrote', out, `${figNo} figures`)
})
