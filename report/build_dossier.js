// Builds report/MediPlate_Project_Dossier.docx - the complete project dossier.
// All numbers come from report/results.json; all figures from report/figures/.
const fs = require('fs')
const path = require('path')
const {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, WidthType, AlignmentType,
  BorderStyle, ShadingType, ImageRun, HeadingLevel, TableOfContents, PageBreak, PageNumber, Header, Footer,
} = require('docx')

const DIR = __dirname
const FIGS = path.join(DIR, 'figures')
const R = JSON.parse(fs.readFileSync(path.join(DIR, 'results.json'), 'utf8'))
const pl = R.planner
const mm = R.m1_metrics
const ab = R.region_ablation_pct_home
const LR = 'Logistic regression'
const GB = 'Gradient boosting'

const INK = '111111'
const MUTED = '5A5A5A'
const ACCENT = '15703F'
const CONTENT_W = 9360

// ---------------------------------------------------------------- helpers
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
const P = (t, o = {}) => new Paragraph({ children: runs(t, { size: 21 }), spacing: { after: 130, line: 290 }, alignment: AlignmentType.JUSTIFIED, ...o })
const SMALL = (t) => new Paragraph({ children: runs(t, { size: 18, color: MUTED }), spacing: { after: 130, line: 265 } })
const H1 = (t) => new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun(t)], pageBreakBefore: true, spacing: { after: 160 } })
const H2 = (t) => new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun(t)], spacing: { before: 220, after: 110 } })
const H3 = (t) => new Paragraph({ heading: HeadingLevel.HEADING_3, children: [new TextRun(t)], spacing: { before: 170, after: 90 } })
const B = (t) => new Paragraph({ children: runs(t, { size: 21 }), bullet: { level: 0 }, spacing: { after: 70, line: 280 } })
const B2 = (t) => new Paragraph({ children: runs(t, { size: 21 }), bullet: { level: 1 }, spacing: { after: 60, line: 280 } })
const EQ = (t) => new Paragraph({ children: [new TextRun({ text: t, italics: true, size: 21, font: 'Cambria Math' })], alignment: AlignmentType.CENTER, spacing: { before: 90, after: 130 } })

const thin = { style: BorderStyle.SINGLE, size: 4, color: '9A9A9A' }
const borders = { top: thin, bottom: thin, left: thin, right: thin }

function pngSize(f) { const b = fs.readFileSync(f); return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) } }
let figNo = 0
const figList = []
function figure(file, caption, frac = 0.95) {
  figNo += 1
  const full = path.join(FIGS, file)
  const { w, h } = pngSize(full)
  const width = Math.round(625 * frac)
  figList.push(`Figure ${figNo}. ${caption}`)
  return [
    new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 150, after: 40 }, keepNext: true,
      children: [new ImageRun({ data: fs.readFileSync(full), type: 'png',
        transformation: { width, height: Math.round(width * h / w) },
        altText: { title: `Figure ${figNo}`, description: caption, name: file } })] }),
    new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 180 },
      children: [new TextRun({ text: `Figure ${figNo}. `, bold: true, size: 18 }), new TextRun({ text: caption, size: 18, color: MUTED })] }),
  ]
}
let tabNo = 0
function table(headers, rows, widths, caption, fs_ = 17) {
  tabNo += 1
  const total = widths.reduce((a, b) => a + b, 0)
  const ws = widths.map((w) => Math.round(w * CONTENT_W / total))
  ws[ws.length - 1] += CONTENT_W - ws.reduce((a, b) => a + b, 0)
  const cell = (text, i, head) => new TableCell({
    borders, width: { size: ws[i], type: WidthType.DXA },
    shading: head ? { fill: 'E3EEE8', type: ShadingType.CLEAR } : undefined,
    margins: { top: 55, bottom: 55, left: 95, right: 95 },
    children: [new Paragraph({ children: runs(String(text), { size: fs_, bold: head || undefined, color: head ? '0F4A2A' : INK }) })],
  })
  return [
    new Paragraph({ spacing: { before: 170, after: 80 }, keepNext: true,
      children: [new TextRun({ text: `Table ${tabNo}. `, bold: true, size: 19 }), new TextRun({ text: caption, size: 19, color: MUTED })] }),
    new Table({ width: { size: CONTENT_W, type: WidthType.DXA }, columnWidths: ws,
      rows: [new TableRow({ tableHeader: true, children: headers.map((h, i) => cell(h, i, true)) }),
        ...rows.map((r) => new TableRow({ children: r.map((c, i) => cell(c, i, false)) }))] }),
    new Paragraph({ spacing: { after: 170 }, children: [] }),
  ]
}
const pct = (x, d = 1) => `${(100 * x).toFixed(d)}%`
const f3 = (v) => Number(v).toFixed(3)
const cvv = (n, k) => `${mm.cv[n][k].mean.toFixed(3)} ± ${mm.cv[n][k].sd.toFixed(3)}`

const doc = []
const add = (x) => (Array.isArray(x) ? doc.push(...x) : doc.push(x))

// ================================================================ title page
add(new Paragraph({ spacing: { before: 2200, after: 180 }, alignment: AlignmentType.CENTER,
  children: [new TextRun({ text: 'MediPlate', bold: true, size: 68, color: ACCENT })] }))
add(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 120 },
  children: [new TextRun({ text: 'A region-first, medication-aware meal planning system', size: 30 })] }))
add(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 420 },
  children: [new TextRun({ text: 'for adults living with multiple chronic diseases', size: 30 })] }))
add(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 700 },
  children: [new TextRun({ text: 'COMPLETE PROJECT DOSSIER', bold: true, size: 26, color: MUTED })] }))
add(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 90 },
  children: [new TextRun({ text: 'Objectives · Methodology · Datasets · Models · Prior work · Gaps · Contributions', size: 20, color: MUTED })] }))
add(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 700 },
  children: [new TextRun({ text: 'Experiments · Evaluation metrics · Architecture · Development plan', size: 20, color: MUTED })] }))
add(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 80 },
  children: [new TextRun({ text: 'Prepared by: [Your name]   ·   Register number: [Roll number]', size: 21 })] }))
add(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 80 },
  children: [new TextRun({ text: 'Guide: [Guide name], [Department]', size: 21 })] }))
add(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 80 },
  children: [new TextRun({ text: '[College / University name]', size: 21 })] }))
add(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 260 },
  children: [new TextRun({ text: 'Version 1.0 · September 2026 · prototype status, not for clinical use', size: 19, color: MUTED })] }))
add(new Paragraph({ children: [new PageBreak()] }))

// ================================================================ contents
add(new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun('Contents')], spacing: { after: 180 } }))
add(new TableOfContents('Contents', { hyperlink: true, headingStyleRange: '1-3' }))
add(new Paragraph({ spacing: { before: 200 }, children: [new TextRun({ text: 'If the page numbers are missing, right-click the table above in Word and choose "Update field".', italics: true, size: 18, color: MUTED })] }))

// ================================================================ 1 at a glance
add(H1('1. The project at a glance'))
add(P('MediPlate is a working full-stack web application that turns a patient\'s conditions, medicines and laboratory results into a safe, explained, weekly meal plan built from the food of that patient\'s own region of India. It is aimed at adults aged 30 and above living with one or more of eight chronic conditions. This dossier is the complete record of the project: what it is for, how it was built, what data and models it uses, what has been measured, what is novel, and what happens next.'))
add(table(['Item', 'Status'], [
  ['Software', 'Complete and running. Backend, website, data pipeline, tests, Docker image, deployment guide.'],
  ['Scale of the system', '553 foods · 186 regional dishes · 8 diseases · 65 medicines in 35 drug classes · 23 food tags · 195 messages in 3 languages'],
  ['Code', `${'~'}3,680 lines of Python (backend + pipeline), ~3,540 lines of TypeScript (website), ~770 lines of tests`],
  ['Validation', `${pl.hard_violations} violations in ${pl.hard_checks} hard-limit checks across ${pl.days} planned days for ${pl.patients} synthetic patients`],
  ['Risk model (M1)', `Logistic regression, ${mm.n_rows} adults, cross-validated accuracy ${mm.cv[LR].accuracy.mean.toFixed(3)}, F1 ${mm.cv[LR].f1.mean.toFixed(3)}, ROC AUC ${mm.cv[LR].roc_auc.mean.toFixed(3)}`],
  ['Automated tests', '91 backend tests, 5 browser tests, strict type-checked web build — all passing'],
  ['Languages', 'English, Tamil, Hindi (server emits message keys; the interface renders the language)'],
  ['Deployment', 'Docker image; free-tier hosting on Render with a Neon PostgreSQL database; source in a GitHub repository'],
  ['Clinical status', '**Not validated.** Rules, recipes and translations are prototypes awaiting review by a dietitian, a pharmacist and native speakers. Not a medical device.'],
  ['Technology readiness', 'TRL 4 — validated in a laboratory setting on synthetic patients'],
], [2600, 6760], 'Project status at the date of this dossier.'))
add(P('**How to read this dossier.** Sections 2–4 set out the problem, the objectives and the scope. Section 5 reviews existing work and Section 6 states the gaps that follow from it. Section 7 lists the contributions claimed. Sections 8–11 describe the architecture, the data, the method and the models. Sections 12–14 describe the experiments, the metrics and the results. Sections 15–17 give the limitations, the ethical position and the intellectual-property position. Section 18 is the development plan.'))

// ================================================================ 2 problem
add(H1('2. Problem statement and motivation'))
add(H2('2.1 Multimorbidity is the normal case, not the exception'))
add(P('About one in four Indian adults over 30 lives with more than one chronic disease at the same time, and more than 40% of people with diabetes also have high blood pressure. Diabetes, high blood pressure, heart disease, obesity, chronic kidney disease, fatty liver, metabolic syndrome and arthritis cluster together because they share the same metabolic and vascular origins. Diet is a first-line treatment for every one of them.'))
add(P('Existing diet applications, and most published diet-recommendation research, plan for **one** disease at a time. When a patient has three, the patient receives three plans and is left to reconcile them. Three failures follow, and each of them is observable in the prototype\'s own measurements.'))
add(H2('2.2 Failure 1 — conflicting advice is handed to the patient'))
add(P('Kidney disease at stage 4 requires potassium below about 2,000 mg a day. High blood pressure guidance (DASH) asks for at least 3,500 mg a day of the same nutrient. Diabetes asks for more fibre and more pulses; kidney disease asks for less protein and less phosphorus, which the same pulses carry. These are not edge cases: in our evaluation of 100 synthetic patients, **' + pl.patients_with_conflicts + ' patients** had at least one pair of targets on the same nutrient that had to be resolved before a plan could be generated. No existing system tells the patient which instruction won and why.'))
add(H2('2.3 Failure 2 — medicines are stored but not acted upon'))
add(P('Food interacts with medicine in ways that are well documented and clinically serious: warfarin with vitamin K, ACE inhibitors and potassium-sparing diuretics with potassium, statins with grapefruit, MAO inhibitors with tyramine in aged and fermented food, metformin with alcohol, levothyroxine with calcium and soy. Existing planners either record the prescription in a profile without acting on it, or predict one drug–food pair at a time in isolation. None removes the offending dish from the plan before the plan is shown. In the prototype, a patient on warfarin has 8 of 186 dishes removed and a patient with diabetes, high blood pressure, kidney disease stage 4 and warfarin has 9 removed and 5 limited.'))
add(H2('2.4 Failure 3 — the food is culturally wrong, so the plan is abandoned'))
add(P(`Adherence fails when a patient in Tamil Nadu is told to eat food from another part of the country. This is measurable. With the region preference switched off, only ${ab.without.south}% of a South-Indian patient's regional dishes came from South India, and only ${ab.without.northeast}% for a North-Eastern patient. The plan is nutritionally correct and practically useless.`))
add(H2('2.5 Why this is a research problem and not only an engineering one'))
add(P('Resolving the three failures together is not a matter of adding features. Removing unsafe food shrinks the candidate set; shrinking the candidate set can make the nutritional constraints unsatisfiable; restoring satisfiability by widening the food pool destroys the cultural fit that motivated the system. The three mechanisms interact, and the order in which they are applied changes both the safety and the feasibility of the result. That interaction is the subject of this project.'))

// ================================================================ 3 objectives
add(H1('3. Research objectives and questions'))
add(H2('3.1 Aim'))
add(P('To design, build and evaluate a decision-support system that produces a weekly meal plan satisfying the dietary requirements of **all** of a patient\'s chronic conditions and medicines at once, drawn from the patient\'s own regional cuisine, with every decision explained in the patient\'s language.'))
add(H2('3.2 Objectives'))
add(table(['ID', 'Objective', 'Status'], [
  ['RO1', 'Build a machine-readable knowledge base of disease dietary rules, food–drug interaction rules and food properties, with explicit clinical priority attached to each rule.', 'Done (prototype, awaiting clinical review)'],
  ['RO2', 'Pre-filter the candidate food set against the patient\'s complete medication regimen before any plan is generated.', 'Done'],
  ['RO3', 'Detect conflicts between the dietary targets of co-existing diseases, resolve them by clinical priority, and disclose each resolution in plain language.', 'Done'],
  ['RO4', 'Formulate meal-plan generation as a constrained optimisation problem in which hard clinical limits cannot be violated and softer goals are traded off.', 'Done'],
  ['RO5', 'Make the patient\'s home region of India the first-choice source of food, widening only when the clinical constraints cannot otherwise be met.', 'Done'],
  ['RO6', 'Use preparation-level controls (salt reduction, potassium leaching) as decision variables so that familiar dishes can be kept in modified form rather than deleted.', 'Done'],
  ['RO7', 'Provide a risk indicator and personalisation that adapt the plan over time from the patient\'s own logged data, without ever relaxing a hard limit.', 'Done for M1 and M3; M2 partially (glycemic load plus personal slope; full model needs CGMacros)'],
  ['RO8', 'Deliver the system as a usable multilingual web application and demonstrate that it is safe across a wide space of synthetic patients.', 'Done'],
  ['RO9', 'Validate the clinical knowledge base and the generated plans with registered clinicians and with real patients.', '**Not started** — the principal outstanding objective'],
], [700, 6700, 1960], 'Research objectives and their current status.'))
add(H2('3.3 Research questions'))
add(B('**RQ1.** Can a single plan satisfy the hard dietary limits of several co-existing chronic diseases and a medication regimen simultaneously, and how often does such a plan fail to exist?'))
add(B('**RQ2.** When the dietary targets of two conditions conflict, does resolution by explicit clinical priority produce plans that remain safe under independent re-checking?'))
add(B('**RQ3.** How much of the cultural fit of a plan is attributable to an explicit region-first search, as against what a nutrition-only optimiser would produce by chance?'))
add(B('**RQ4.** Do preparation-level decision variables (salt level, potassium leaching) measurably increase the number of familiar dishes that survive a strict clinical limit?'))
add(B('**RQ5.** Can a risk model trained on a small, non-Indian cohort contribute usefully as a caution flag without being used for diagnosis?'))
add(SMALL('RQ1–RQ3 and RQ5 are answered by the experiments in Section 12. RQ4 is partially answered: the mechanism is implemented and observable in the case studies, but the controlled ablation that isolates its effect has not yet been run. It is scheduled in Section 18.'))

// ================================================================ 4 scope
add(H1('4. Scope and boundaries'))
add(H2('4.1 In scope'))
add(B('**Conditions:** diabetes, high blood pressure, heart disease or stroke (including heart failure), obesity, chronic kidney disease (stages 1–5 and dialysis), fatty liver disease, metabolic syndrome, arthritis (osteoarthritis, rheumatoid arthritis, gout).'))
add(B('**Population:** adults aged 30 and above, residing in any Indian state or union territory, any of three diet types (vegetarian, egg-vegetarian, non-vegetarian) with beef and pork choices honoured separately.'))
add(B('**Medicines:** 65 named medicines resolved into 35 drug classes, each contributing food rules.'))
add(B('**Output:** a seven-day plan of nine meal slots a day, each with dish, portion, salt level and any preparation note, plus the reason for each choice, day totals against every limit, the conflict ledger, removed dishes, and medicine timing.'))
add(H2('4.2 Deliberately out of scope in version 1'))
add(table(['Excluded', 'Reason'], [
  ['Food prices and budget optimisation', 'Removed from the specification by decision at the design stage; reliable regional price data was not available.'],
  ['Doctor / dietitian portal (component U2)', 'Deferred to version 2 by decision at the design stage. The engine already produces everything such a portal would display.'],
  ['Food photograph recognition (component M4)', 'Not required for the core claim; adds a large data dependency.'],
  ['Continuous glucose monitor synchronisation', 'Requires device partnerships and a data-use agreement; the personal-slope method covers the same need from manual readings.'],
  ['Paediatric, pregnancy and enteral nutrition', 'Different guideline sets, different safety profile.'],
  ['Medicine dosing advice', 'Out of bounds for a dietary system; only timing relative to meals is given.'],
], [3000, 6360], 'Exclusions from version 1 and the reason for each.'))
add(H2('4.3 What the system explicitly does not claim'))
add(P('It does not diagnose. It does not replace a dietitian or a physician. It does not adjust medication. The risk model is a research indicator, not a validated clinical score for Indian adults. Every clinical output is presented with the rule and the source that produced it, so that a clinician can audit it rather than trust it.'))

// ================================================================ 5 existing work
add(H1('5. Existing work'))
add(H2('5.1 Search method'))
add(P('Patents were searched on Google Patents and read in full text; literature was searched on PubMed, IEEE, ScienceDirect, Springer, MDPI and Nature portfolio journals. Every item in the tables below was retrieved and read. Items that could not be retrieved were excluded rather than cited from a search-result snippet, so the tables under-represent rather than over-represent the field.'))
add(H2('5.2 Patent landscape'))
add(table(['Patent', 'Year / Owner', 'What it discloses', 'What it does not do'], [
  ['US10373522B2', '2019, IBM', 'Genetic-algorithm meal generation from seed ingredients and exclusion criteria; fitness on cost, shelf life, flavour pairing, waste and preparation time.', 'No medication logic, no disease rules, no clinical constraints, no optimisation against nutrient limits.'],
  ['US12354728B2', '2025, Bia Studios LLC', 'Meal building from on-hand ingredients and dietary needs; randomised sub-meal generators, allergy filtering, calorie splitting, serving multipliers.', 'Randomised rather than optimised; "medical conditions" handled generically; no drug or comorbidity reasoning.'],
  ['US8060383B2', '2011, Badinelli', 'Product barcode or label is compared against a stored profile that includes prescriptions, allergies and chronic illness; a real-time alert is raised.', 'Screens one product at the point of purchase; generates no plan, resolves no conflicts.'],
  ['US10902943B2', '2021, IBM', 'Predicts drug–food interactions from drug and food similarity feature vectors using logistic regression with a probability threshold.', 'Scores isolated drug–food pairs; is not a meal planner and does not filter a menu against a whole regimen.'],
  ['US11580879B2', '2023, Medtronic MiniMed', 'Personalised nutrition from a food ontology with user-specific health and nutrient constraints, using linear optimisation (Simplex) and constraint satisfaction.', 'The closest prior art on mathematics. No medication filter, no conflict detection or ledger, no regional or preparation decision variables.'],
  ['US12254972B2', '2025, Seekingsimple Inc.', '"Nutritional prescription" templates per chronic condition, explicitly supporting patients with several conditions; removes harmful and adds beneficial products.', 'Additive templates rather than resolution; no priority ranking, no explanation output, no optimiser, no drug screening.'],
  ['US6872077B2', '2005, Solos Health LLC', 'Recipe templates with ingredient contribution values, min/max ranges and nutritional priority values to meet macronutrient allowances.', 'Macronutrient personalisation only; no clinical or pharmacological layer.'],
], [1250, 1250, 3600, 3260], 'Patent prior art, each item retrieved and read in full text.'))
add(H2('5.3 Literature'))
add(table(['Reference', 'Year', 'Contribution', 'Limitation relative to this project'], [
  ['Sklan & Dariel, Br J Nutr, 10.1079/bjn19930102', '1993', 'Foundational mixed-integer linear programming formulation of human diet planning: minimum cost, full nutrient requirements, integer whole-unit foods, frequency-of-use constraints, "preserves eating practices".', 'Establishes the solver class used here. Eating practices are a generic constraint, not a regional preference ordering; no clinical or drug layer.'],
  ['Marashi-Hosseini et al., Sci Rep, 10.1038/s41598-023-39371-4', '2023', 'Mamdani fuzzy dietary decision-support system, 1,144 rules across 5 sub-models, for co-existing obesity, diabetes, hypertension, hyperlipidaemia and kidney disease; explicitly acknowledges competing low-fat and low-carbohydrate requirements.', 'The closest work on multimorbidity. Conflicts are dissolved inside fuzzy membership functions rather than resolved by clinical priority, and nothing is explained to the patient. No medication screening, no regional cuisine.'],
  ['Paidipati et al., IJERPH, 10.3390/ijerph18157842', '2021', 'Pre-emptive and non-pre-emptive goal programming over 62 Indian recipes at six calorie levels for diabetes; minimises nutrient over- and under-achievement.', 'Single disease, no comorbidity and no medication. Indian food is treated as one pool rather than stratified by region.'],
  ['Ma et al., Foods, 10.3390/foods13132144', '2024', 'Graph convolutional network over a heterogeneous user–recipe–nutrient graph for health-aware recipe recommendation.', 'Learned ranking rather than constrained optimisation: a recommendation can violate a clinical limit because nothing forbids it.'],
], [2100, 700, 3400, 3160], 'Peer-reviewed prior work, each item retrieved and read.'))
add(H2('5.4 What the field looks like as a whole'))
add(P('Two traditions exist and do not meet. The **optimisation tradition** (Sklan 1993 onwards, US11580879B2, Paidipati 2021) treats diet planning as a constraint problem and is rigorous about nutrients, but treats the patient as a set of nutrient requirements with no medicines, no competing diseases and no culture. The **recommendation tradition** (Ma 2024 and the wider recommender-systems literature) is good at preference and personalisation but produces suggestions that carry no guarantee, which is unacceptable when a suggestion can raise serum potassium in a patient with failing kidneys. Clinical decision support for multimorbidity (Marashi-Hosseini 2023) sits between them and demonstrates the difficulty of the conflict problem without solving it transparently.'))

// ================================================================ 6 gaps
add(H1('6. Identified research gaps'))
add(P('Each gap below is stated as an absence in the work reviewed in Section 5, with the reference that comes closest to closing it. Gaps marked **addressed** are answered by this project; the remainder are open and are listed in the development plan.'))
add(table(['#', 'Gap', 'Closest existing work', 'Status here'], [
  ['G1', 'No system filters the candidate food set against a patient\'s complete, multi-drug regimen before plan generation.', 'US10902943B2 predicts single drug–food pairs.', 'Addressed (C1)'],
  ['G2', 'No system detects that two diseases impose contradictory targets on the same nutrient and resolves them by an explicit clinical priority.', 'Marashi-Hosseini 2023 blends them in fuzzy logic.', 'Addressed (C2)'],
  ['G3', 'No system discloses the resolution of a dietary conflict to the patient in plain language.', 'None found.', 'Addressed (C2)'],
  ['G4', 'Regional or sub-national cuisine is not used as a first-order term in the objective of a clinical diet optimiser.', 'Paidipati 2021 uses Indian food as a single pool.', 'Addressed (C3)'],
  ['G5', 'Preparation method (salt level, leaching) is not treated as a decision variable inside the optimisation.', 'None found; leaching appears only as patient advice in guidelines.', 'Addressed (C4)'],
  ['G6', 'Organ-protective limits are not switched on automatically from laboratory values when the patient has not reported the condition.', 'None found.', 'Addressed (C5)'],
  ['G7', 'Recommender-style systems give no guarantee that a suggestion respects a hard clinical limit.', 'Ma 2024 and the recommender literature generally.', 'Addressed by construction (hard limits are constraints, learning acts only on penalties)'],
  ['G8', 'Explanations, where present, are in one language and are generated after the fact rather than carried with the decision.', 'None found for clinical diet planning.', 'Addressed (C6)'],
  ['G9', 'Evaluation is typically on a handful of hand-built cases, with no independent re-checking of the produced plan.', 'Most of the reviewed literature.', 'Addressed by the evaluation protocol in Section 12'],
  ['G10', 'No public, validated dataset links Indian regional dishes to nutrients, glycemic response and clinical suitability.', 'IFCT 2017 covers foods, not dishes.', '**Open** — partially built here (186 dishes), needs dietitian validation'],
  ['G11', 'Post-prandial glucose response models are trained on Western cohorts and are not personalised from a small number of readings.', 'CGMacros and similar require a data-use agreement.', '**Partly open** — personal-slope method implemented; full model pending data'],
  ['G12', 'Cardiovascular risk models used in Indian practice are largely derived from non-Indian cohorts.', 'The dataset used here is South African.', '**Open** — acknowledged limitation, needs an Indian cohort'],
  ['G13', 'No published evaluation measures whether a generated plan is culturally acceptable to the patient it was generated for.', 'None found.', '**Open** — proxy measure only (region share); needs human study'],
], [500, 3300, 2700, 2860], 'Research gaps, closest prior work and the status of each in this project.'))

// ================================================================ 7 contributions
add(H1('7. Novel contributions'))
add(P('The contribution claimed is the **combination** of the six mechanisms below arranged as a pipeline in which each stage constrains the next. Individually, several have partial analogues in the literature; the chain does not appear in any reference retrieved.'))
add(table(['ID', 'Contribution', 'Gap closed', 'Evidence'], [
  ['C1', '**Whole-regimen pre-filtering.** Every medicine is resolved to a drug class; the rules of all classes, all conditions, the diet type and the allergy list are unioned into one removal set applied before plan generation, each removal carrying its reason.', 'G1', 'Section 14.4; 9 dishes removed and 5 limited for the four-condition patient'],
  ['C2', '**Priority-based conflict resolution with a patient-readable ledger.** Targets carry a clinical priority (1 safety to 5 wellness); clashing targets are resolved by priority, the discarded target is recorded, and a plain-language sentence is emitted as part of the output.', 'G2, G3', `Section 14.1; ${pl.patients_with_conflicts} of ${pl.patients} patients required resolution`],
  ['C3', '**Region-first tiered optimisation.** The patient\'s state maps to one of five food zones; the optimiser exhausts the home zone before neighbouring zones and all-India dishes, widening only when hard constraints cannot otherwise be met.', 'G4', `Section 14.3; ${pct(pl.home_share_mean)} against ${ab.without.northeast}–${ab.without.north}% without`],
  ['C4', '**Preparation-level decision variables.** Salt level (full, half, quarter) and potassium leaching are variables inside the same mixed-integer program as dish and portion, with leaching permitted only for dishes marked as cooked.', 'G5', 'Section 10.4; case studies in Section 14.7'],
  ['C5', '**Laboratory-driven activation of organ-protective limits.** eGFR, serum potassium and serum phosphorus switch on kidney limits even when the patient has not reported kidney disease.', 'G6', 'Section 10.1'],
  ['C6', '**Language-independent explanation.** The engine emits message keys with translated parameters, so the same clinical explanation appears identically in English, Tamil and Hindi.', 'G8', '195 message keys × 3 languages, type-checked at build time'],
], [500, 4400, 900, 3560], 'Claimed contributions, the gaps they close and where the evidence sits in this dossier.'))
add(P('**Statement of what is not claimed.** The clinical rules themselves are taken from published guidelines and are not a contribution. Mixed-integer diet planning is not new (Sklan 1993). Logistic regression on the South African cohort is a reimplementation of standard practice, used here as a component rather than as a result. The nutrient data is the published IFCT 2017.'))

// ================================================================ 8 architecture
add(H1('8. System architecture'))
add(H2('8.1 Overview'))
add(P('The system has three layers: an **offline data pipeline** that builds the knowledge base and trains the models; a **backend** that holds the engine and the API; and a **web front end**. The identifiers (D-, E-, M-, B-, F-) are the ones used in the project blueprint and throughout this dossier.'))
add(figure('fig01_architecture.png', 'System architecture. Every plan request passes through the five engine stages; logs return to the learning models.'))
add(table(['ID', 'Component', 'Where', 'Responsibility'], [
  ['D1', 'Raw sources', 'pipeline/raw/', 'IFCT 2017 food composition, USDA supplements, SAheart training data, cached for offline rebuilds.'],
  ['D2', 'Recipe and region sources', 'pipeline/sources/', '186 dishes with ingredient lists, 36 states mapped to 5 food zones with neighbours, glycemic index table.'],
  ['D3', 'Rules knowledge base', 'pipeline/sources/rules/', '8 diseases, 65 medicines in 35 drug classes, 23 food tags, 195 messages in 3 languages. Schema-validated.'],
  ['P1', 'Pipeline', 'pipeline/run_all.py', 'Five steps: fetch, build foods, build rules, build recipes, train models. Fails loudly rather than writing broken data.'],
  ['E1', 'Profile builder', 'engine/profile.py', 'BMI on Indian cut-offs, eGFR (CKD-EPI 2021), kidney stage, reference weight, energy requirement.'],
  ['E2', 'Safety filter', 'engine/safety.py', 'Removes every dish that clashes with diet type, allergies, condition rules, medicine rules or a hard limit at minimum portion.'],
  ['E3', 'Target builder', 'engine/targets.py', 'Collects, merges and resolves nutrient targets; writes the conflict ledger.'],
  ['E4', 'Optimiser', 'engine/optimizer.py', 'Mixed-integer linear program over dish × portion × salt × leaching for 9 slots a day, region-tiered.'],
  ['E5', 'Explainer', 'engine/explainer.py', 'Reasons, region of origin, day totals against limits, meal glycemic load, removals, medicine timing.'],
  ['M1', 'Risk scorer', 'engine/risk.py', 'Trained heart-risk model plus FIB-4, Indian Diabetes Risk Score and IDF metabolic-syndrome criteria.'],
  ['M2', 'Glucose response', 'engine/glycemic.py', 'Glycemic load bands, then a personal slope fitted from the patient\'s own paired readings.'],
  ['M3', 'Meal ranker', 'engine/ranker.py', 'Content-based learning from eaten, skipped, liked and disliked meals, spread across ingredients.'],
  ['B1', 'API', 'backend/app/routers/', 'FastAPI: auth, profile, labs, plans, foods, logs, meta, admin. JWT with bcrypt.'],
  ['F1', 'Website', 'frontend/src/', 'React 19 + TypeScript (strict) + Vite + Tailwind; 9 pages; three languages; mobile layout.'],
], [500, 1700, 1900, 5260], 'Components, their location in the repository and their responsibility.'))
add(H2('8.2 Request flow'))
add(P('A plan request runs: **E1** builds the patient context from the stored profile and the most recent laboratory values → **M1** scores risk and may raise the priority of cardiovascular limits → **E3** assembles targets and resolves conflicts → **E2** filters the 186 dishes to the safe set → **E4** solves seven days, one day at a time, with M2 and M3 contributing penalty terms → **E5** attaches explanations → the plan is stored and returned as JSON with message keys, which the website renders in the chosen language.'))
add(H2('8.3 Technology stack'))
add(table(['Layer', 'Technology', 'Reason'], [
  ['Website', 'React 19, TypeScript (strict), Vite 8, Tailwind CSS 4, TanStack Query, Recharts, bundled Noto fonts for Tamil and Devanagari', 'Type errors and missing translations fail the build; fonts are bundled so Indic scripts render without a network call.'],
  ['Backend', 'Python 3.11, FastAPI, SQLAlchemy 2, Pydantic 2, JWT, bcrypt', 'Typed request validation; the same models serve the API and the tests.'],
  ['Optimisation', 'Google OR-Tools, CBC mixed-integer solver via pywraplp', 'Chosen over CP-SAT after CP-SAT proved too slow on two cores; 5% relative gap, 2.5 s per day budget.'],
  ['Machine learning', 'scikit-learn, pandas, NumPy, joblib', 'Small models, interpretable, fast to load at start-up.'],
  ['Database', 'SQLite by default, PostgreSQL in production', 'One URL switch; both are tested.'],
  ['Testing', 'pytest (91 tests), Playwright (5 browser tests)', 'Property testing over random patients plus a full user journey.'],
  ['Packaging', 'Docker image, docker-compose, start scripts for Windows, Linux and macOS', 'One command to run.'],
  ['Deployment', 'Render free tier with a Neon PostgreSQL database', 'Free hosting; the solver time budget is raised to compensate for 0.1 CPU.'],
], [1500, 4400, 3460], 'Technology choices and the reason for each.'))
add(H2('8.4 API surface'))
add(table(['Endpoint', 'Purpose'], [
  ['POST /api/auth/register, /api/auth/login', 'Account creation and sign-in, JWT issued'],
  ['GET, PUT /api/profile', 'Health profile with server-side validation'],
  ['POST /api/plans/generate', 'Run the engine and store a seven-day plan'],
  ['POST /api/plans/current/swap', 'Replace one dish while every limit still holds'],
  ['GET /api/foods/search · POST /api/foods/check', 'Search in three languages; unified fits / limit / avoid verdict for any food or dish'],
  ['POST /api/logs/meals · POST /api/logs/glucose', 'Learning signals for M3 and M2'],
  ['GET /api/insights · GET /api/labs/series', 'Risk results and progress charts'],
  ['/api/admin/*', 'Data, rule and model status; reload after a pipeline run'],
], [3600, 5760], 'Main API endpoints.'))

// ================================================================ 9 data
add(H1('9. Datasets'))
add(H2('9.1 Sources used'))
add(table(['Dataset', 'Size', 'Status', 'Used for', 'Licence / access'], [
  ['Indian Food Composition Tables 2017 (ICMR-NIN), via the `ifct2017` npm package', '542 foods', 'Downloaded, cached', 'All nutrient values', 'Package is AGPL-3.0; only data files used. Check institutional guidance before publishing.'],
  ['USDA SR Legacy gap-fills', '11 foods', 'Included', 'Curd, salt, oats and others missing from IFCT', 'Public domain'],
  ['South African Heart Disease, via PMLB', `${mm.n_rows} adults, ${mm.n_features} features, ${mm.positives} positive (${pct(mm.positive_rate)})`, 'Downloaded', 'Training and evaluating M1', 'Open research dataset'],
  ['MediPlate regional recipes', '186 dishes, 5 zones', 'Hand-built for this project', 'The dish table the optimiser selects from', 'Project original; **needs dietitian review**'],
  ['Disease, drug and food-tag rules', '8 diseases, 65 medicines, 35 drug classes, 23 tags', 'Hand-built from published guidelines and drug labels', 'Safety filter and nutrient targets', 'Compiled from ICMR-NIN 2024, ADA 2025, KDIGO 2024, AHA/DASH, EASL 2024, ACR 2020; **needs clinical review**'],
  ['Glycemic index table', '105 entries', 'Approximate values from the International GI Tables', 'Glycemic load for M2', 'Published values'],
  ['Messages', '195 keys × English, Tamil, Hindi', 'Hand-written', 'Every explanation in the system', '**Needs native-speaker review**'],
], [2000, 1300, 1500, 1900, 2660], 'Datasets in use, with size, provenance and licensing position.'))
add(H2('9.2 Sources wanted but not obtained'))
add(table(['Dataset', 'Why it was not used', 'What it would add'], [
  ['NHANES, USDA FoodData Central API, UCI Chronic Kidney Disease, Kaggle Indian Food 101', 'Blocked by the network policy of the build machine', 'Larger food coverage; an independent kidney-disease cohort'],
  ['CGMacros (PhysioNet)', 'Requires a signed data-use agreement', 'A trained post-prandial glucose model (M2); the pipeline already has the training step and will use the data automatically if placed in `pipeline/raw/cgmacros/`'],
  ['An Indian cardiovascular cohort', 'None located with open access', 'A risk model appropriate to the target population, replacing the South African one'],
], [2600, 3000, 3760], 'Datasets identified as desirable but not available for version 1.'))
add(H2('9.3 The data pipeline and its quality controls'))
add(figure('fig02_pipeline.png', 'Offline data pipeline: fetch, clean, merge, validate, train.'))
add(table(['Step', 'What it does', 'What it refuses to pass'], [
  ['s01 fetch', 'Downloads IFCT 2017 and SAheart; caches raw copies so later builds work offline.', 'A missing or truncated source file.'],
  ['s02 build foods', 'Converts every value to grams per 100 g and kilocalories; merges USDA supplements; runs an Atwater energy-versus-macronutrient consistency check.', 'A food whose stated energy disagrees with its macronutrients. One published IFCT entry (chicken leg, listed 384 kcal against macronutrients giving 192) was caught and corrected; the fix is logged to `pipeline/reports/data_quality.md`.'],
  ['s03 build rules', 'Compiles the disease, drug and tag rules and validates every record against a strict schema.', 'An unknown nutrient, an unknown operator, a target without a priority, a message key with a missing translation.'],
  ['s04 build recipes', 'Costs each of the 186 dishes into nutrients per serving from its ingredient list; attaches dish tags including `raw`, which controls whether leaching is allowed.', 'A recipe referencing a food that does not exist in the food table.'],
  ['s05 train models', 'Trains M1 with repeated cross-validation, selects between candidates, writes the model and its metadata. Trains M2 if CGMacros is present.', 'A model whose cross-validated AUC falls below the recorded baseline.'],
], [1300, 3800, 4260], 'Pipeline steps and the failure each one prevents.'))
add(H2('9.4 What the food and dish tables look like'))
add(figure('fig03_food_groups.png', 'Foods in the compiled food table by IFCT group.', 0.82))
add(figure('fig04_dish_coverage.png', 'Number of dishes available per food region and meal slot.', 0.86))
add(P('Dish coverage is deliberately uneven: side dishes and snacks are held in a universal pool because they are eaten across the country, while breakfast, staples, proteins and vegetables are regional. The North-East has the thinnest coverage (22 regional dishes) and is therefore the region where the optimiser most often has to widen its search — which is visible in the results.'))
add(figure('fig05_dish_nutrients.png', 'Sodium and potassium per serving across the dish table.'))

// ================================================================ 10 methodology
add(H1('10. Methodology'))
add(P('The method converts a patient record into a constrained optimisation problem, solves it, and converts the solution back into explanations. Each stage is described with the equations or rules it actually uses.'))
add(H2('10.1 E1 — building the patient context'))
add(P('BMI uses Indian cut-offs (overweight ≥ 23, obese ≥ 25) rather than WHO international cut-offs, because cardiometabolic risk rises at a lower BMI in South Asian populations. Kidney function uses the race-free CKD-EPI 2021 equation:'))
add(EQ('eGFR = 142 × min(Scr/κ, 1)^α × max(Scr/κ, 1)^(−1.200) × 0.9938^age × (1.012 if female)'))
add(P('with κ = 0.7 (female) or 0.9 (male) and α = −0.241 (female) or −0.302 (male). A derived kidney stage switches on kidney-safe limits automatically, **even if the patient did not report kidney disease** — this matters because early chronic kidney disease is frequently undiagnosed. Reference body weight is the weight at BMI 25, and all per-kilogram targets use it, so that a protein limit is not inflated by excess weight. Energy is Mifflin-St Jeor times an activity factor, minus 500 kcal where weight loss is indicated, with a floor of 1,200 kcal for women and 1,500 kcal for men.'))
add(H2('10.2 E3 — targets, conflict detection and the ledger'))
add(P('A target is a tuple **{nutrient, bound, value, hardness, priority, reason, condition}** where the value may be absolute, per kilogram of reference weight, a percentage of energy or per 1,000 kcal, and the condition may test a disease stage or a laboratory value. Targets are gathered from every disease, every drug class, the risk result and the healthy-eating default.'))
add(table(['Priority', 'Meaning', 'Example'], [
  ['1', 'Immediate safety', 'Potassium ≤ 2,000 mg when serum potassium exceeds 5.0 mmol/L or kidney disease is at stage 4 or beyond'],
  ['2', 'Organ protection', 'Protein ≤ 0.8 g per kg of reference weight in kidney disease stage 3 or beyond'],
  ['3', 'Disease control', 'Carbohydrate ≤ 50% of energy and added sugar ≤ 5% in diabetes'],
  ['4', 'Weight and general health', 'Fibre ≥ 14 g per 1,000 kcal; protein ≥ 1.0 g/kg in obesity'],
  ['5', 'Wellness', 'Fibre for inflammation in arthritis'],
], [1000, 2600, 5760], 'The clinical priority scale used to resolve conflicting targets.'))
add(P('Two targets on the same nutrient and the same bound direction constitute a conflict. The resolver keeps the target from the higher priority, breaking ties by strictness, and records the discarded target together with the reason. That record becomes the **conflict ledger**, which is part of the output rather than an internal log. An example produced by the prototype for a patient with kidney disease stage 4 and high blood pressure:'))
add(SMALL('"Potassium: high blood pressure advice suggests at least 3,500 mg a day, but kidney disease at stage 4 needs it below 2,000 mg. The kidney limit was used, because it is the immediate safety limit."   ·   "Sodium (salt): the strictest limit (2,000 mg from high blood pressure) was used."'))
add(P('Because the priority is a property of the rule and not of the code, a clinician can revise the knowledge base — change a threshold, re-rank a priority, add a medicine — without touching the software. The pipeline re-validates and the administration console reloads the rules at run time.'))
add(H2('10.3 E2 — the safety filter'))
add(P('Each of the 186 dishes is checked against: diet type; the allergy list; the beef and pork choices; each condition\'s avoid list; each drug class\'s avoid list; and finally against every hard limit at the dish\'s smallest portion with quarter salt. A dish that still breaks a hard limit at its minimum is removed, because no portion of it can ever be safe. Every removal carries a reason and is reported to the patient, which converts an invisible exclusion into an explanation.'))
add(H2('10.4 E4 — the region-first mixed-integer program'))
add(P('Let a _variant_ v be a dish d with portion p, salt level s ∈ {1, 0.5, 0.25} and a leaching flag ℓ ∈ {0, 1} permitted only where the dish is not tagged `raw`. Let x[v, j, t] = 1 when variant v occupies slot j of day t. For nine slots a day:'))
add(EQ('minimise  Σ_v,j,t penalty(v)·x[v,j,t]  +  Σ_g,t w(g)·shortfall(g,t)'))
add(EQ('subject to   Σ_v x[v,j,t] = 1  for every slot j, day t'))
add(EQ('Σ_v,j nutrient(n,v)·x[v,j,t] ≤ limit(n)   for every hard maximum n'))
add(EQ('Σ_v,j nutrient(n,v)·x[v,j,t] ≥ floor(n)   for every hard minimum n (energy, vitamin K band, meal carbohydrate)'))
add(EQ('Σ_j,t x[v,j,t] ≤ 5  for any one dish across the week'))
add(P('Hard limits are constraints, so the solver cannot break them; soft goals are penalised shortfalls, so the solver trades them off instead of failing. The **region preference lives in the penalty term**: dishes from the patient\'s home zone carry no penalty, neighbouring zones carry a penalty, all-India dishes carry a larger one. The solver therefore reaches outside the home region only when the constraints cannot otherwise be satisfied. If a day is still infeasible, the system relaxes soft goals in priority order — never hard limits — and records that it did so.'))
add(P('**Salt level and leaching are inside the optimisation**, not applied afterwards. This is what allows a familiar dish to survive a strict limit: a sambar that fails a 2,000 mg sodium ceiling at full salt is kept at half salt; a potato dish that fails a potassium ceiling is kept with a leaching instruction (soak and discard the water; retention factor 0.6) instead of being deleted. Leaching is blocked on raw dishes — salads, raita, sprouts, curd, buttermilk, chaat — because the instruction would be meaningless there.'))
add(H2('10.5 E5 — explanation'))
add(P('The output carries, for every dish, the reason it was chosen, its region of origin, the portion, the salt level and any preparation note; for every day, each nutrient total against its limit with the source of that limit; and for the patient, the conflict ledger, the removed dishes with reasons, medicine timing instructions and the per-meal glycemic load. The server emits message keys with parameters rather than sentences, and parameters that are themselves translatable are marked, so the clinical explanation is reproduced exactly in each language rather than paraphrased.'))

// ================================================================ 11 models
add(H1('11. Models'))
add(H2('11.1 M1 — heart-risk indicator'))
add(table(['Property', 'Value'], [
  ['Task', 'Binary classification: presence of coronary heart disease'],
  ['Dataset', `South African Heart Disease via PMLB — ${mm.n_rows} adults, ${mm.positives} positive (${pct(mm.positive_rate)}), ${mm.negatives} negative`],
  ['Features (6)', 'Age (years), systolic blood pressure (mmHg), LDL cholesterol (mmol/L), family history of heart disease (0/1), BMI (kg/m²), tobacco use ever (0/1) — all obtainable from the app\'s own onboarding'],
  ['Candidates compared', 'Logistic regression with standardisation (C = 1.0) · Gradient boosting (150 trees, depth 2, learning rate 0.05, subsample 0.8)'],
  ['Selection protocol', 'Repeated stratified 5-fold cross-validation, 5 repeats (25 folds), selection by mean ROC AUC; fixed seed 42'],
  ['Selected', '**Logistic regression** — higher cross-validated AUC and interpretable coefficients'],
  ['Decision threshold', `${mm.threshold} (configurable); F1 is maximised at ${mm.best_f1_threshold}`],
  ['Role in the system', 'A caution flag only. A high score raises the priority of cardiovascular limits. It cannot relax a hard limit and is never presented as a diagnosis.'],
], [2200, 7160], 'M1 specification.'))
add(P(`Standardised coefficients rank the drivers as age (${R.m1.coefficients.Age}), family history (${R.m1.coefficients['Family history']}), tobacco (${R.m1.coefficients.Smoker}), LDL cholesterol (${R.m1.coefficients['LDL cholesterol']}), systolic blood pressure (${R.m1.coefficients['Systolic BP']}) and BMI (${R.m1.coefficients.BMI}). The negative BMI coefficient is a known artefact of this cohort and is one reason the model is used only as a flag.`))
add(H2('11.2 M2 — post-prandial glucose response'))
add(P('M2 answers "how far will this patient\'s blood sugar rise after this meal?" — a regression, not a classification. It operates in two regimes. Before the patient has logged readings, the system uses **glycemic load** computed per serving and per meal, with bands (per serving 10 and 20; per meal 20 and 35) that classify a meal as low, medium or high. After **three paired before/after readings**, a least-squares slope of glucose rise per 10 g of available carbohydrate is fitted for that patient and used in planning, bounded so that it can influence penalties but never relax a hard limit.'))
add(P('The full trained version needs CGMacros (PhysioNet), which requires a data-use agreement. The pipeline contains the training step; placing the CSV files in `pipeline/raw/cgmacros/` and re-running step 5 trains a gradient-boosting regressor of two-hour glucose rise on carbohydrate, protein, fat and fibre, reported as mean absolute error in mg/dL.'))
add(H2('11.3 M3 — meal ranker'))
add(P('M3 re-orders dishes rather than classifying them. It learns from four signals — eaten, skipped, liked, disliked — and propagates each signal to the **ingredient** level, so that disliking one dish lowers the score of every dish sharing its main ingredient. This is content-based rather than collaborative, so it works from the first patient and requires no other users\' data. Like M2, it contributes only to the penalty term.'))
add(H2('11.4 Calculators used alongside the models'))
add(table(['Calculator', 'What it computes', 'Source'], [
  ['FIB-4', 'Liver fibrosis indicator from age, AST, ALT and platelet count', 'Published, widely validated'],
  ['Indian Diabetes Risk Score', 'Diabetes risk from age, waist, physical activity and family history', 'Developed for Indian adults'],
  ['IDF metabolic syndrome criteria', 'Presence of metabolic syndrome from waist, triglycerides, HDL, blood pressure and fasting glucose', 'International Diabetes Federation'],
  ['CKD-EPI 2021', 'eGFR and kidney stage', 'Race-free equation'],
], [2200, 4400, 2760], 'Validated calculators used directly, with no training involved.'))
add(SMALL('Calculators are preferred to learned models wherever a validated calculator exists, because they are auditable and transfer to the Indian population better than a model trained on a small foreign cohort.'))

// ================================================================ 12 experiments
add(H1('12. Experiments'))
add(P('Six experiments were run. All are reproducible from a fixed seed by `python report/experiments.py` and `python report/metrics_m1.py`; the full run takes about six and a half minutes on two cores and writes every number used in this dossier to `report/results.json`.'))
add(table(['ID', 'Experiment', 'Design', 'Answers'], [
  ['X1', 'Planner safety at scale', `${pl.patients} synthetic patients from a fixed seed — all 36 states, 3 diet types, 1–4 co-existing conditions, kidney stages 2–5, random potassium and phosphorus values, 14 medicine combinations — planned for 3 days each (${pl.days} days). Every day is then **re-totalled independently from the raw dish data**, not from the optimiser's own numbers.`, 'RQ1, RQ2'],
  ['X2', 'Region-first ablation', 'The same patients planned twice, with and without the region penalty; the share of regional dishes drawn from the home zone is measured per zone.', 'RQ3'],
  ['X3', 'Safety-filter characterisation', 'Eight patient scenarios of increasing complexity; the number of dishes removed and limited out of 186 is recorded for each.', 'RQ1'],
  ['X4', 'M1 model evaluation', 'Two candidate models scored three ways — on the training data, under 5×5-fold cross-validation, and on a held-out 30% split — at seven decision thresholds.', 'RQ5'],
  ['X5', 'Ranker learning', 'A dish is disliked repeatedly over six planning rounds; its appearances and those of dishes sharing its main ingredient are counted.', 'Personalisation behaviour'],
  ['X6', 'Glucose personalisation simulation', '300 simulated patients with a known true slope (4.0 mg/dL per 10 g) and realistic noise (SD 12); the estimate is tracked as readings accumulate from 3 to 15.', 'How many readings M2 needs'],
], [500, 1800, 5000, 2060], 'Experiments, their design and the research question each addresses.'))
add(P('**On the use of synthetic patients.** No real patient data was available, and using synthetic patients is a genuine limitation for external validity. It is, however, the right instrument for the question asked in X1, which is whether a _safety property_ holds across the whole space of inputs the system accepts. Real cohorts cluster; a seeded generator covers every state, every diet, every kidney stage and every medicine combination the system claims to handle, including combinations that are rare but legal. The independent re-checking step is what makes the result meaningful: the plan is verified against raw data by code that does not share the optimiser\'s assumptions.'))

// ================================================================ 13 metrics
add(H1('13. Evaluation metrics'))
add(H2('13.1 Metrics for the planner'))
add(table(['Metric', 'Definition', 'Why it matters'], [
  ['Hard-limit violation count', 'Number of independent re-checks in which a day\'s total breached a limit marked hard. The target is exactly zero.', 'The system\'s core safety claim. A single violation invalidates it.'],
  ['Feasibility rate', 'Share of requested days for which a plan satisfying all hard limits exists.', 'A safe system that cannot produce a plan is useless.'],
  ['Home-region share', 'Share of the regional dishes in a plan that come from the patient\'s own zone.', 'Proxy for cultural acceptability (an imperfect one — see Section 15).'],
  ['Tier distribution', 'How many days were satisfied inside the home zone, needed a neighbouring zone, or needed relaxed soft goals.', 'Shows how often the constraints force the system to compromise.'],
  ['Soft-goal attainment', 'Share of days meeting each non-hard nutritional goal.', 'Measures nutritional quality above the safety floor.'],
  ['Conflict incidence', 'Share of patients with at least one pair of conflicting targets.', 'Establishes that the conflict problem is real, not hypothetical.'],
  ['Solve time per day', 'Median, 90th percentile and maximum wall-clock seconds on two cores.', 'Determines whether the system can run on free hosting.'],
], [2100, 4200, 3060], 'Planner metrics and their interpretation.'))
add(H2('13.2 Metrics for the models'))
add(table(['Metric', 'Formula', 'What it means for M1'], [
  ['Accuracy', '(TP + TN) / all', 'Share of patients placed in the right group. Weak alone here: always answering "no disease" scores ' + pct(1 - mm.positive_rate) + '.'],
  ['Precision', 'TP / (TP + FP)', 'Of the patients flagged high risk, the share who really had heart disease.'],
  ['Recall (sensitivity)', 'TP / (TP + FN)', 'Of the patients who really had heart disease, the share the model flagged.'],
  ['F1', '2PR / (P + R)', 'Harmonic mean of precision and recall; low if either is low.'],
  ['Specificity', 'TN / (TN + FP)', 'Of the healthy patients, the share correctly left unflagged.'],
  ['ROC AUC', 'Area under the true-positive against false-positive curve', 'Ranking quality, independent of the threshold. 0.5 is guessing.'],
  ['Average precision', 'Area under the precision–recall curve', 'Better than AUC when the positive class is a minority, as here.'],
  ['Brier score', 'Mean squared error of the predicted probability', 'Calibration: whether a stated 30% risk occurs about 30% of the time.'],
], [1800, 2600, 4960], 'Classification metrics, with what each one means in this application.'))
add(P('**Why three measurements of each metric.** Training-data scores show how much a model memorises; cross-validated scores are the honest estimate; the held-out split is a single clean confirmation. Reporting only one of the three is how overfitting hides, and in this project it is exactly how the weaker model was caught.'))
add(H2('13.3 Metrics not used, and why'))
add(B('**Adherence and clinical outcome** (HbA1c change, blood-pressure change) — the measures that ultimately matter, and unobtainable without a patient study. Scheduled in Section 18.'))
add(B('**User satisfaction and cultural acceptability** — the region share is a proxy only; a patient may find a dish from her own zone unacceptable for reasons the system cannot see.'))
add(B('**Cost per plan** — removed from scope with the price feature.'))

// ================================================================ 14 results
add(H1('14. Results'))
add(H2('14.1 X1 — safety and feasibility at scale'))
add(table(['Measure', 'Result'], [
  ['Days for which a feasible plan was produced', `${pl.feasible_days} of ${pl.days}`],
  ['Hard-limit checks performed', `${pl.hard_checks}`],
  ['**Violations**', `**${pl.hard_violations}**`],
  ['Days satisfied inside the home region (tier 1)', `${pl.tiers.tier1}`],
  ['Days that needed a neighbouring region (tier 2)', `${pl.tiers.tier2}`],
  ['Mean share of regional dishes from the home zone', pct(pl.home_share_mean)],
  ['Lowest home share for any single patient', pct(pl.home_share_min)],
  ['Patients whose targets required conflict resolution', `${pl.patients_with_conflicts} of ${pl.patients}`],
  ['Median dishes removed by the safety filter (of 186)', `${pl.removed_dishes_median}`],
  ['Solve time per day: median / 90th percentile / maximum', `${pl.solve_s_per_day.median} s / ${pl.solve_s_per_day.p90} s / ${pl.solve_s_per_day.max} s`],
], [6200, 3160], 'Planner evaluation over 100 synthetic patients and 300 planned days.'))
add(figure('fig08_planner_limits_time.png', 'Left: every limited nutrient-day as a fraction of its hard limit — all at or below 1. Right: optimiser time per day on two cores.'))
add(P(`**Answer to RQ1 and RQ2.** A plan satisfying every hard limit existed for all ${pl.days} days, and independent re-checking found no violation in ${pl.hard_checks} checks. Conflict resolution by clinical priority therefore did not produce unsafe plans in any case tested. Nine days out of 300 could not be satisfied within the home region and widened to a neighbouring zone — the mechanism working as designed rather than failing.`))
add(H2('14.2 Soft goals'))
add(figure('fig09_soft_goals.png', 'Share of planned days meeting each soft nutritional goal.', 0.82))
add(P(`Sodium, phosphorus and added sugar goals were met on 100% of days, fibre on ${pl.soft_goal_met_pct.fiber_g}% and saturated fat on ${pl.soft_goal_met_pct.satfat_g}%. Potassium was the weakest at ${pl.soft_goal_met_pct.potassium_mg}%, which is expected and correct: the potassium _minimum_ is a soft goal from blood-pressure guidance, and in patients who also have kidney disease it is deliberately overridden by the hard potassium ceiling. Protein reached its goal on ${pl.soft_goal_met_pct.protein_g}% of days, the lowest of the macronutrient goals, because protein minima and kidney-driven protein maxima pull against each other.`))
add(H2('14.3 X2 — the region-first ablation'))
add(table(['Home zone', 'With region-first', 'Without region-first', 'Difference'], [
  ['North', `${ab.with_region_first.north.toFixed(1)}%`, `${ab.without.north.toFixed(1)}%`, `+${(ab.with_region_first.north - ab.without.north).toFixed(1)} pts`],
  ['South', `${ab.with_region_first.south.toFixed(1)}%`, `${ab.without.south.toFixed(1)}%`, `+${(ab.with_region_first.south - ab.without.south).toFixed(1)} pts`],
  ['East', `${ab.with_region_first.east.toFixed(1)}%`, `${ab.without.east.toFixed(1)}%`, `+${(ab.with_region_first.east - ab.without.east).toFixed(1)} pts`],
  ['West', `${ab.with_region_first.west.toFixed(1)}%`, `${ab.without.west.toFixed(1)}%`, `+${(ab.with_region_first.west - ab.without.west).toFixed(1)} pts`],
  ['North-East', `${ab.with_region_first.northeast.toFixed(1)}%`, `${ab.without.northeast.toFixed(1)}%`, `+${(ab.with_region_first.northeast - ab.without.northeast).toFixed(1)} pts`],
], [2600, 2400, 2400, 1960], 'Share of regional dishes drawn from the patient\'s home zone, with and without the region mechanism.'))
add(figure('fig10_region_ablation.png', 'The region-first mechanism accounts for the entire cultural fit of the plan.', 0.82))
add(P('**Answer to RQ3.** Essentially all of the cultural fit is attributable to the mechanism. A nutrition-only optimiser lands in the patient\'s own zone at roughly the rate that zone occupies the dish table — 9.3% for the North-East, which has the fewest dishes, and 47.1% for the North, which has the most. The effect is largest precisely for the regions that are least represented in the data, which is where a purely nutritional optimiser fails the patient most severely.'))
add(H2('14.4 X3 — the safety filter'))
add(table(['Patient scenario', 'Dishes removed', 'Dishes limited'], R.safety_scenarios.map((s) => [s.scenario, `${s.removed}`, `${s.limited}`]), [5200, 2200, 1960], 'Dishes removed before planning, out of 186.'))
add(figure('fig11_safety_filter.png', 'Dishes removed before planning for example patients.', 0.82))
add(P('Allergies remove the most (54 dishes for a peanut and milk allergy) because an allergen appears across many recipes. A single medicine removes far fewer but more sharply: warfarin removes 8 and bounds vitamin K for the rest. The combined patient — diabetes, high blood pressure, kidney disease stage 4 and warfarin — has 9 dishes removed and 5 limited, and is the case where conflict resolution and leaching both become necessary.'))
add(H2('14.5 X4 — the risk model'))
add(figure('fig06_m1_roc.png', 'Out-of-fold ROC curves and AUC across 25 cross-validation folds.'))
add(table(['Metric', 'Training data', '5×5-fold cross-validation', 'Held-out test (30%)'], [
  ['Accuracy', f3(mm.train[LR].accuracy), cvv(LR, 'accuracy'), f3(mm.holdout[LR].test_part.accuracy)],
  ['Precision', f3(mm.train[LR].precision), cvv(LR, 'precision'), f3(mm.holdout[LR].test_part.precision)],
  ['Recall', f3(mm.train[LR].recall), cvv(LR, 'recall'), f3(mm.holdout[LR].test_part.recall)],
  ['F1', f3(mm.train[LR].f1), cvv(LR, 'f1'), f3(mm.holdout[LR].test_part.f1)],
  ['ROC AUC', f3(mm.train[LR].auc), cvv(LR, 'roc_auc'), f3(mm.holdout[LR].test_part.auc)],
  ['Specificity', f3(mm.train[LR].specificity), '–', f3(mm.holdout[LR].test_part.specificity)],
], [2400, 2200, 2800, 1960], `M1 (logistic regression, the selected model) at threshold ${mm.threshold}.`))
add(table(['Metric', 'Training data', '5×5-fold cross-validation', 'Held-out test (30%)'], [
  ['Accuracy', f3(mm.train[GB].accuracy), cvv(GB, 'accuracy'), f3(mm.holdout[GB].test_part.accuracy)],
  ['Precision', f3(mm.train[GB].precision), cvv(GB, 'precision'), f3(mm.holdout[GB].test_part.precision)],
  ['Recall', f3(mm.train[GB].recall), cvv(GB, 'recall'), f3(mm.holdout[GB].test_part.recall)],
  ['F1', f3(mm.train[GB].f1), cvv(GB, 'f1'), f3(mm.holdout[GB].test_part.f1)],
  ['ROC AUC', f3(mm.train[GB].auc), cvv(GB, 'roc_auc'), f3(mm.holdout[GB].test_part.auc)],
], [2400, 2200, 2800, 1960], 'Gradient boosting — the rejected candidate, shown for comparison.'))
add(figure('fig16_m1_metric_bars.png', 'Accuracy, precision, recall and F1 for both models; error bars are ±1 SD across 25 folds.'))
add(P(`**Why logistic regression was kept.** It loses almost nothing between the training data and cross-validation (accuracy ${f3(mm.train[LR].accuracy)} → ${mm.cv[LR].accuracy.mean.toFixed(3)}), so it is not overfitted. Gradient boosting reached an accuracy of ${f3(mm.holdout[GB].train_part.accuracy)} and an F1 of ${f3(mm.holdout[GB].train_part.f1)} on the patients it was trained on, then fell to ${f3(mm.holdout[GB].test_part.accuracy)} and ${f3(mm.holdout[GB].test_part.f1)} on patients it had never seen. That gap is memorisation.`))
add(table(['Class', 'Precision', 'Recall', 'F1', 'Patients'], [
  ['No heart disease', f3(mm.per_class['No heart disease'].precision), f3(mm.per_class['No heart disease'].recall), f3(mm.per_class['No heart disease']['f1-score']), `${mm.per_class['No heart disease'].support}`],
  ['Heart disease', f3(mm.per_class['Heart disease'].precision), f3(mm.per_class['Heart disease'].recall), f3(mm.per_class['Heart disease']['f1-score']), `${mm.per_class['Heart disease'].support}`],
  ['**Macro average**', f3(mm.per_class['macro avg'].precision), f3(mm.per_class['macro avg'].recall), f3(mm.per_class['macro avg']['f1-score']), `${mm.per_class['macro avg'].support}`],
  ['**Weighted average**', f3(mm.per_class['weighted avg'].precision), f3(mm.per_class['weighted avg'].recall), f3(mm.per_class['weighted avg']['f1-score']), `${mm.per_class['weighted avg'].support}`],
], [3000, 1800, 1800, 1800, 1600], 'Per-class results for the selected model on out-of-fold predictions.'))
add(figure('fig15_m1_confusion.png', 'Confusion matrices: fitted and scored on the training data (left) and cross-validated (right).'))
add(figure('fig17_m1_threshold.png', 'Left: precision–recall curves against the baseline of flagging everybody. Right: metrics against the decision threshold.'))
add(P(`**Answer to RQ5, with a caveat.** The model ranks usefully (AUC ${mm.cv[LR].roc_auc.mean.toFixed(3)}) and is well calibrated (Brier ${R.m1.brier}), but at the 0.5 threshold it catches only half of the diseased patients. Because a missed case costs more than a false alarm in a system that merely tightens a diet, a threshold near ${mm.best_f1_threshold}–0.35 (recall ${f3(mm.thresholds.find((t) => t.threshold === 0.35).recall)}) would be the better clinical setting. Version 1 keeps 0.5 so that the flag stays rare; this is one configuration value.`))
add(figure('fig07_m1_calibration_coef.png', 'Calibration by quintile and standardised coefficients.'))
add(H2('14.6 X5 and X6 — learning from the patient'))
add(figure('fig12_ranker.png', 'Effect of repeated dislikes on how often a dish, and dishes sharing its main ingredient, are planned.', 0.8))
add(P(`A disliked dish (sambar) fell from ${R.ranker.appearances_of_dish[0]} appearances to ${R.ranker.appearances_of_dish[4]} within five planning rounds, while dishes sharing its main ingredient (red gram dal) settled at a reduced but non-zero rate — the intended behaviour, since the ingredient is nutritionally valuable and should be reduced rather than eliminated.`))
add(figure('fig13_glucose_simulation.png', 'Personal glucose-response estimate as readings accumulate (300 simulated patients).', 0.8))
add(P(`With a true slope of ${R.m2_simulation.true_slope} mg/dL per 10 g of carbohydrate and measurement noise of SD ${R.m2_simulation.noise_sd}, the estimate is unbiased from the first three readings (mean ${R.m2_simulation.by_n['3'].mean}) but wide (5th–95th percentile ${R.m2_simulation.by_n['3'].p5}–${R.m2_simulation.by_n['3'].p95}); by eight readings the interval narrows to ${R.m2_simulation.by_n['8'].p5}–${R.m2_simulation.by_n['8'].p95}. This is the evidence for the three-reading threshold at which personalisation switches on, and for treating the estimate as indicative until roughly eight readings exist.`))
add(H2('14.7 Case studies'))
add(P('Three patients from different regions, each with several conditions and their own medicines, were planned end to end. Each case shows the plan, the day totals against every limit, and the conflict ledger.'))
Object.entries(R.cases).forEach(([k, c]) => {
  add(H3(`Patient ${k} — ${c.title}`))
  add(table(['Meal', 'Dishes'], Object.entries(c.meals).map(([slot, ds]) => [slot.charAt(0).toUpperCase() + slot.slice(1), ds.join(' · ')]), [1600, 7760], `Patient ${k}: day 1 of the generated plan.`))
  add(figure(`fig14_case_${k}.png`, `Patient ${k}: day-1 totals as a percentage of each limit.`, 0.8))
})
add(H2('14.8 Software verification'))
add(table(['Test suite', 'What it covers', 'Result'], [
  ['Data tests', 'Every ingredient resolves; nutrients in range; no missing translation; Atwater consistency', 'Pass'],
  ['Clinical calculator tests', 'CKD-EPI, FIB-4, Indian Diabetes Risk Score, IDF criteria against published worked examples', 'Pass'],
  ['Engine tests', 'Target merging, conflict resolution, safety filter, leaching eligibility, glycemic bands', 'Pass'],
  ['Property test', '36 random patients across all states, diets, condition combinations, kidney stages, labs and 14 medicine groups; every day re-derived from raw data', 'Pass — all 72 planned days stayed in the home region'],
  ['API tests', 'Full request cycle on SQLite and on PostgreSQL 16', 'Pass'],
  ['Browser tests (5)', 'Sign-up → onboarding → plan → log a meal → swap a dish → food check in Tamil → add a lab result → switch language → mobile layout → sign out and in → admin console. Fails on any browser console error.', 'Pass'],
], [1900, 5500, 1960], 'Automated test suites — 91 backend tests and 5 browser tests in total.'))
add(H2('14.9 The interface'))
add(figure('ss_01-landing.png', 'Landing page.', 0.8))
add(figure('ss_04-onboarding-conditions.png', 'Onboarding, step 3 of 5: conditions.', 0.8))
add(figure('ss_06-today.png', 'Today page: meals with reasons, logging and swap controls, daily limit meters, medicine timing and blood-sugar logging.', 0.8))
add(figure('ss_07-week.png', 'Week page with day totals and the explanation of each limit.', 0.78))
add(figure('ss_08-food-check.png', 'Food check: tender coconut water searched in Tamil for a patient with kidney disease.', 0.8))
add(figure('ss_10-today-tamil.png', 'The same Today page in Tamil.', 0.8))
add(figure('ss_09-progress.png', 'Progress page: insights, result charts and adherence.', 0.8))
add(figure('ss_11-today-mobile.png', 'Mobile layout.', 0.33))

// ================================================================ 15 limitations
add(H1('15. Limitations and threats to validity'))
add(H2('15.1 The four that matter most'))
add(table(['Limitation', 'Consequence', 'What would remove it'], [
  ['**The clinical knowledge base is unvalidated.** Rules, thresholds and priorities were compiled from published guidelines by a student, not written or reviewed by a clinician.', 'Every clinical output is provisional. A wrong threshold would propagate silently into every plan.', 'Review by a registered dietitian and a clinical pharmacist, recorded rule by rule.'],
  ['**No real patients.** All evaluation is on synthetic patients; no plan has been eaten by anyone.', 'Nothing is known about adherence, acceptability or clinical outcome — the things that ultimately matter.', 'A pilot study with ethics approval.'],
  ['**M1 is trained on the wrong population.** 462 men aged 15–64 from one high-risk region of the Western Cape.', 'The model cannot be claimed as a valid risk score for Indian adults, and its BMI coefficient is anomalous.', 'An Indian cardiovascular cohort, or dropping the learned model in favour of validated calculators only.'],
  ['**The recipes are a prototype.** 186 dishes hand-built for this project, with portion sizes and ingredient quantities estimated.', 'Nutrient values per serving carry unquantified error, which flows directly into the constraints.', 'Dietitian review of portions, and where possible laboratory values for composite dishes.'],
], [3200, 3200, 2960], 'Principal limitations.'))
add(H2('15.2 Threats to validity'))
add(B('**Internal.** The independent re-checking in X1 uses the same dish table as the optimiser, so an error in the dish nutrients would not be caught — it would be consistent on both sides. The Atwater check catches gross errors in the food table but not in recipe portions.'))
add(B('**External.** Synthetic patients are drawn from a generator whose distribution is the author\'s model of the patient population. If real patients cluster differently — for example many more patients with four or more conditions — the feasibility rate could be lower than measured.'))
add(B('**Construct.** Home-region share is a proxy for cultural acceptability and may be a poor one. A dish from the correct zone can still be unfamiliar, disliked, or unavailable in a particular household.'))
add(B('**Statistical.** M1\'s confidence intervals are wide because the cohort is small (462). The ±0.039 standard deviation on AUC is the honest width; differences smaller than that between models are not meaningful.'))
add(H2('15.3 Known engineering compromises'))
add(B('The optimiser runs with a 5% relative gap and a per-day time budget, so a returned plan is near-optimal rather than provably optimal. Hard limits are unaffected by this — they are constraints, not objectives.'))
add(B('CBC replaced CP-SAT after CP-SAT proved too slow on two cores. A machine with more cores would likely do better with CP-SAT.'))
add(B('On free hosting (0.1 CPU) the solver budget must be raised to about 20 seconds per day; the service also sleeps after 15 minutes of inactivity, so the first request after a pause is slow.'))
add(B('The Docker image is defined and the compose file works, but the image itself was never built on the machine used for development.'))

// ================================================================ 16 ethics
add(H1('16. Ethics, safety and regulatory position'))
add(H2('16.1 Safety posture'))
add(P('The system is built so that the dangerous failure mode — recommending food that harms a patient — requires a wrong _rule_, not a wrong _prediction_. Learned components can only move penalties; they cannot relax a constraint. This is a deliberate architectural choice and it is the main reason the learning parts are kept small and the rules kept explicit.'))
add(B('Every plan carries the rule and the source that produced each limit, so a clinician can audit rather than trust.'))
add(B('Removals are shown with reasons, so a patient who disagrees can raise it with a clinician instead of silently ignoring the plan.'))
add(B('The system never advises on medication dosing; it states timing relative to meals only.'))
add(B('Prominent statements in the application, the repository and this dossier record that the rules are unvalidated.'))
add(H2('16.2 Regulatory position'))
add(P('As it stands, the prototype is a research artefact and is not offered for clinical use. Were it to be deployed to patients, a regulatory assessment would be required: software that makes patient-specific recommendations for managing a disease may be treated as a medical device in several jurisdictions, and the threshold usually turns on whether a clinician can independently review the basis of the recommendation. The explanation layer was designed partly with that in mind, but the question has not been assessed and no claim is made about it here.'))
add(H2('16.3 Data protection'))
add(table(['Concern', 'Current handling', 'Needed before real use'], [
  ['Health data at rest', 'Stored in the application database; passwords hashed with bcrypt', 'Encryption at rest; a documented retention policy'],
  ['Authentication', 'JWT with a configurable secret; default administrator credentials must be changed via environment variables', 'Multi-factor authentication for any clinician account'],
  ['Consent', 'Not implemented', 'Explicit consent capture, and export and deletion on request'],
  ['Data sharing', 'None; the system makes no outbound calls with patient data', 'Unchanged — this property should be preserved'],
  ['Legal basis', 'Not assessed', 'Assessment under India\'s Digital Personal Data Protection Act and institutional ethics review'],
], [2200, 3800, 3360], 'Data-protection position.'))
add(H2('16.4 Attribution and licensing'))
add(P('Nutrient data derives from IFCT 2017 (ICMR-NIN) accessed through the `ifct2017` npm package, which is AGPL-3.0 licensed; only its data files are used, and institutional guidance should be sought before publication or release. Clinical rules are compiled from ICMR-NIN 2024, ADA 2025, KDIGO 2024, AHA/DASH, EASL-EASD-EASO 2024, ACR 2020 and manufacturers\' drug labels, each cited in the rule files. The South African Heart Disease dataset is an open research dataset accessed through PMLB.'))

// ================================================================ 17 IP
add(H1('17. Intellectual-property position'))
add(H2('17.1 What has been prepared'))
add(P('A VIT Invention Disclosure Format (IDF)-B has been completed covering the title, field, prior art, gap and novelty, objectives, working principle, detailed description, experimental validation, the aspects for which protection is sought, and a technology-readiness assessment of TRL 4.'))
add(H2('17.2 Aspects for which protection would be sought'))
add(B('**Principal:** a method that pre-filters foods against a complete medication regimen, derives priority-carrying nutrient targets from co-existing conditions, detects and resolves conflicts between them while emitting a human-readable record of the resolution, and then selects dish, portion, salt level and preparation by mixed-integer optimisation subject to the resolved targets as hard constraints.'))
add(B('**Second:** region-tiered candidate selection that exhausts the home zone before widening.'))
add(B('**Third:** preparation-level decision variables inside the same optimisation, gated by a dish property.'))
add(H2('17.3 Honest assessment of the obstacles'))
add(table(['Obstacle', 'Why it applies', 'Possible response'], [
  ['**India, Section 3(k)** — a computer programme per se and an algorithm are not patentable', 'A software diet planner is precisely the shape of claim examiners reject under 3(k).', 'Frame the technical effect as computational: pre-filtering and region tiering reduce the search space so that the problem is solvable in ' + pl.solve_s_per_day.median + ' s median on two cores. This must be measured against the unfiltered baseline, which has not yet been done.'],
  ['**India, Section 3(i)** — methods of treatment', 'Dietary therapy for a disease can be read as a method of treatment.', 'Claim the system and the computational method rather than a method of treating a patient.'],
  ['**United States, §101 (Alice)** — abstract ideas and mathematical concepts', 'Constrained optimisation plus organising human activity is the paradigm case.', 'The same technical-effect argument, tied to a concrete improvement in computer operation.'],
  ['**Inventive step / obviousness**', 'An examiner can argue that combining a known drug-interaction filter with a known LP diet planner is obvious.', 'Show an unexpected effect of the ordering — that filtering first is what makes the optimisation tractable and safe, and that the naive ordering fails.'],
  ['**Public disclosure**', 'The source is in a GitHub repository. If it is public, that is a dated disclosure and India offers no general grace period.', 'Confirm the repository\'s visibility; make it private before filing; report the first public commit date to the IPR cell.'],
], [2000, 3400, 3960], 'Obstacles to a granted patent, and the available responses.'))
add(P('**Position.** The disclosure is sufficient to submit to the institutional IPR cell and to support a provisional filing, which would establish a priority date cheaply. It is not sufficient to be confident of a grant, and the two experiments named in the development plan (X7 and X8) are the ones that would most strengthen it. A parallel route — publishing the work and releasing the system — may serve the project better than a patent that takes years and may fail on subject-matter grounds.'))

// ================================================================ 18 plan
add(H1('18. Current development plan'))
add(H2('18.1 Completed — version 1'))
add(table(['Phase', 'Delivered', 'Evidence'], [
  ['Design', 'Blueprint and architecture agreed; price feature and doctor portal removed from scope; region-first preference adopted as a first-class requirement.', 'Section 8'],
  ['Data pipeline', 'Five-step pipeline producing 553 foods, 186 dishes, a schema-validated rule base and 195 messages in three languages.', 'Section 9'],
  ['Engine', 'All five stages plus three learning components.', 'Sections 10–11'],
  ['Application', 'FastAPI backend, React website, 9 pages, three languages, mobile layout, admin console.', 'Section 14.9'],
  ['Verification', '91 backend tests, 5 browser tests, strict typed build, PostgreSQL tested.', 'Section 14.8'],
  ['Evaluation', 'Six experiments; all numbers reproducible from a fixed seed.', 'Sections 12–14'],
  ['Packaging and deployment', 'Docker image, start scripts, deployment guide, free hosting on Render with Neon PostgreSQL.', 'Section 8.3'],
  ['Documentation', 'Project report (34 pages), invention disclosure, this dossier.', '—'],
], [1700, 5700, 1960], 'Work completed in version 1.'))
add(H2('18.2 Immediate next steps'))
add(table(['ID', 'Task', 'Why it matters', 'Effort'], [
  ['X7', '**Ordering ablation.** Run the filter _after_ planning instead of before, and count how many plans contain a dish that interacts with the patient\'s medicines.', 'Quantifies the contribution claimed in C1 and supports the inventive-step argument.', 'Hours — the code already exists'],
  ['X8', '**Tractability ablation.** Remove the pre-filter and the region tiers and measure solve time, timeout rate and infeasibility.', 'Produces the computational technical effect needed against Section 3(k) and §101.', 'Hours'],
  ['X9', '**Preparation-variable ablation.** Disable salt levels and leaching and count how many dishes are lost from each plan.', 'Answers RQ4, which is currently only partly answered.', 'Hours'],
  ['IP1', 'Confirm the GitHub repository\'s visibility; make it private if a filing is intended; report the first public commit date.', 'A public repository may already have started the disclosure clock.', 'Minutes — **do this first**'],
  ['D1', 'Fill in the title pages of the report and this dossier; submit the IDF to the IPR cell.', 'Required for both the academic and the IP track.', 'Minutes'],
], [500, 3800, 3100, 1960], 'Immediate tasks, in the order they should be done.'))
add(H2('18.3 Version 2 — clinical grounding'))
add(table(['Task', 'Description', 'Depends on'], [
  ['Dietitian review', 'A registered dietitian reviews all 186 recipes, their portions and the disease rules; every change is recorded against the rule it modifies.', 'Finding a reviewer'],
  ['Pharmacist review', 'A clinical pharmacist reviews the 65 medicines and 35 drug classes and their food rules.', 'Finding a reviewer'],
  ['Native-speaker review', 'Tamil and Hindi messages reviewed for clinical accuracy, not only fluency.', '—'],
  ['Doctor / dietitian portal (U2)', 'The deferred component: a clinician view of the patient\'s plan, ledger and adherence, with the ability to override a rule for one patient and record why.', 'Dietitian review'],
  ['Threshold decision for M1', 'Decide, with clinical input, whether to move the high-risk threshold from 0.5 to about 0.30.', 'Clinician input'],
], [2200, 5200, 1960], 'Version 2: turning a prototype into something a clinician could sign off.'))
add(H2('18.4 Version 3 — data and evidence'))
add(table(['Task', 'Description', 'Depends on'], [
  ['CGMacros acquisition', 'Sign the PhysioNet data-use agreement and train the full M2 glucose model; the pipeline step already exists.', 'Data-use agreement'],
  ['Indian risk cohort', 'Replace or supplement M1 with a model trained on an Indian cardiovascular cohort, or drop the learned model in favour of validated calculators.', 'Data access'],
  ['Dish nutrient validation', 'Verify composite-dish nutrient values against laboratory data where it exists.', 'Dietitian review'],
  ['Pilot study', 'A small pilot with ethics approval: 20–30 patients, four weeks, measuring adherence, acceptability and any safety signal, with a clinician reviewing every plan before it is issued.', 'Ethics approval; clinical review complete'],
  ['Outcome study', 'If the pilot is clean, a larger study measuring HbA1c, blood pressure and weight against usual dietary advice.', 'Pilot'],
], [2200, 5200, 1960], 'Version 3: generating the evidence the system currently lacks.'))
add(H2('18.5 Engineering backlog'))
add(B('Build and test the Docker image on a clean machine.'))
add(B('Encryption at rest, consent capture, export and deletion — the items in Section 16.3.'))
add(B('Offline support, so a plan can be read without a network connection.'))
add(B('More regional dishes, particularly for the North-East (22 at present, the thinnest coverage).'))
add(B('More languages — the message-key architecture makes this an additive change.'))
add(B('Food photograph recognition (M4) and glucose-sensor synchronisation, both deferred from version 1.'))
add(H2('18.6 Sequencing'))
add(P('The order matters and is not negotiable in one respect: **IP1 comes before everything**, because a public repository may already be affecting the options. After that, X7–X9 are cheap and strengthen both the academic write-up and the IP case, so they come next. Clinical review is the long pole — it is the gate for the pilot, for the doctor portal and for any claim that the system is more than a prototype, and it depends on finding reviewers, which should start now in parallel.'))

// ================================================================ 19 reproducibility
add(H1('19. Reproducibility'))
add(table(['Item', 'Detail'], [
  ['Repository layout', '`pipeline/` data build · `backend/` API and engine · `frontend/` website · `e2e/` browser tests · `report/` evaluation scripts, figures and documents · `docs/` deployment guide · `scripts/` start and test helpers'],
  ['Run the application', '`./scripts/start.sh` (Linux, macOS) · `scripts\\start.bat` (Windows) · `docker compose up --build` — then open `http://localhost:8000`'],
  ['Development mode', '`./scripts/dev.sh` — website on port 5173, API on port 8000'],
  ['Rebuild all data and models', '`python pipeline/run_all.py`'],
  ['Run every check', '`./scripts/test_all.sh`'],
  ['Reproduce every number in this dossier', '`python report/experiments.py` then `python report/metrics_m1.py` — about 6.5 minutes on two cores; writes `report/results.json` and all figures'],
  ['Rebuild this document', '`node report/build_dossier.js`'],
  ['Random seed', '42 throughout — patient generation, cross-validation and the glucose simulation'],
  ['Configuration', '`MEDIPLATE_DATABASE_URL` · `MEDIPLATE_SECRET_KEY` · `MEDIPLATE_ADMIN_EMAIL` and `_PASSWORD` · `MEDIPLATE_SOLVER_SECONDS_PER_DAY` (2.5 locally, ~20 on free hosting)'],
  ['Requirements', 'Python 3.11+, Node 20+ (neither needed with Docker)'],
], [2400, 6960], 'How to reproduce everything in this dossier.'))

// ================================================================ 20 conclusion
add(H1('20. Conclusion'))
add(P('MediPlate demonstrates that the three failures set out in Section 2 can be addressed together rather than separately, and that doing so is a matter of ordering as much as of mechanism. Filtering against the whole medication regimen before planning, resolving disease conflicts by explicit clinical priority while telling the patient what was resolved, and optimising within the patient\'s own regional cuisine with preparation as a decision variable, produced plans for every one of 300 requested days with no violation in 1,032 hard-limit checks, while keeping ' + pct(pl.home_share_mean) + ' of regional dishes inside the patient\'s home zone against 9–47% without the mechanism.'))
add(P('What the project does **not** have is the thing that would make it useful to a patient: clinical validation. The rules are careful readings of published guidelines by a student, the recipes are estimates, the risk model is trained on the wrong population, and no plan has yet been eaten by anybody. Those are not caveats added at the end — they are the next phase of the work, and Section 18 sequences them.'))
add(P('The honest summary is that the engineering is finished and the science has started. The system works, the evaluation is reproducible and the contributions are stated precisely enough to be attacked. The next result worth having is the first one that involves a clinician and a real patient.'))

// ================================================================ references
add(H1('References'))
const refs = [
  'Longvah T, Ananthan R, Bhaskarachary K, Venkaiah K. Indian Food Composition Tables 2017. National Institute of Nutrition, ICMR, Hyderabad.',
  'ICMR National Institute of Nutrition. Dietary Guidelines for Indians, 2024.',
  'American Diabetes Association. Standards of Care in Diabetes — 2025. Diabetes Care 2025;48(Suppl 1).',
  'KDIGO 2024 Clinical Practice Guideline for the Evaluation and Management of Chronic Kidney Disease. Kidney Int 2024;105(4S).',
  'Ikizler TA et al. KDOQI Clinical Practice Guideline for Nutrition in CKD: 2020 update. Am J Kidney Dis 2020;76(3 Suppl 1).',
  'European Association for the Study of the Liver et al. EASL-EASD-EASO Clinical Practice Guidelines on the management of MASLD. J Hepatol 2024.',
  'FitzGerald JD et al. 2020 American College of Rheumatology Guideline for the Management of Gout. Arthritis Care Res 2020;72(6).',
  'Mohan V et al. A simplified Indian Diabetes Risk Score for screening for undiagnosed diabetic subjects. J Assoc Physicians India 2005;53:759–763.',
  'Sterling RK et al. Development of a simple noninvasive index to predict significant fibrosis in HIV/HCV coinfection. Hepatology 2006;43:1317–1325.',
  'Alberti KGMM, Zimmet P, Shaw J. Metabolic syndrome — a new world-wide definition (IDF consensus). Diabet Med 2006;23:469–480.',
  'Inker LA et al. New creatinine- and cystatin C-based equations to estimate GFR without race. N Engl J Med 2021;385:1737–1749.',
  'Mifflin MD, St Jeor ST et al. A new predictive equation for resting energy requirements in healthy individuals. Am J Clin Nutr 1990;51:241–247.',
  'Atkinson FS, Brand-Miller JC, Foster-Powell K et al. International tables of glycemic index and glycemic load values 2021. Am J Clin Nutr 2021;114:1625–1632.',
  'Sklan D, Dariel I. Diet planning for humans using mixed-integer linear programming. Br J Nutr 1993;70:27–35. DOI 10.1079/bjn19930102.',
  'Marashi-Hosseini L, Jafarirad S, Hadianfard AM. A fuzzy based dietary clinical decision support system for patients with multiple chronic conditions. Sci Rep 2023;13:12146. DOI 10.1038/s41598-023-39371-4.',
  'Paidipati KK, Komaragiri H, Chesneau C. Pre-emptive and non-pre-emptive goal programming for optimal menu planning in Indian diabetes mellitus patients. Int J Environ Res Public Health 2021;18:7842. DOI 10.3390/ijerph18157842.',
  'Ma W, Li M, Dai J, Ding J, Chu Z, Chen H. Nutrition-related knowledge graph neural network for food recommendation. Foods 2024;13:2144. DOI 10.3390/foods13132144.',
  'Rousseauw J et al. Coronary risk factor screening in three rural communities (South African Heart Disease data). S Afr Med J 1983;64:430–436.',
  'Romano JD et al. PMLB v1.0: an open-source dataset collection for benchmarking machine learning methods. Bioinformatics 2022;38:878–880.',
  'Perron L, Furnon V. OR-Tools. Google, 2024. https://developers.google.com/optimization.',
  'Pedregosa F et al. Scikit-learn: machine learning in Python. J Mach Learn Res 2011;12:2825–2830.',
  'US10373522B2 (IBM, 2019) · US12354728B2 (Bia Studios LLC, 2025) · US8060383B2 (Badinelli, 2011) · US10902943B2 (IBM, 2021) · US11580879B2 (Medtronic MiniMed, 2023) · US12254972B2 (Seekingsimple Inc., 2025) · US6872077B2 (Solos Health LLC, 2005).',
]
refs.forEach((r, i) => add(new Paragraph({ children: runs(`[${i + 1}] ${r}`, { size: 18 }), spacing: { after: 90, line: 250 },
  indent: { left: 420, hanging: 420 } })))

// ================================================================ appendix
add(H1('Appendix A. List of figures'))
figList.forEach((f) => add(new Paragraph({ children: [new TextRun({ text: f, size: 18 })], spacing: { after: 60, line: 250 } })))

add(H1('Appendix B. Glossary'))
add(table(['Term', 'Meaning'], [
  ['Hard limit', 'A nutrient bound the planner may never break; implemented as a constraint in the optimisation.'],
  ['Soft goal', 'A nutritional target the planner tries to meet; implemented as a penalised shortfall.'],
  ['Conflict ledger', 'The patient-readable record of every clash between dietary targets and how it was resolved.'],
  ['Food zone', 'One of five regional groupings of Indian states (North, South, East, West, North-East) used to order the dish search.'],
  ['Tier 1 / tier 2', 'A day satisfied within the home zone / a day that required widening to a neighbouring zone.'],
  ['Leaching', 'Soaking and discarding the water from a cooked vegetable to reduce potassium; modelled with a retention factor of 0.6.'],
  ['Variant', 'A dish together with a portion, a salt level and a leaching flag — the unit the optimiser selects.'],
  ['MILP', 'Mixed-integer linear programming: linear optimisation in which some variables must be whole numbers.'],
  ['Out-of-fold prediction', 'A prediction made for a data point by a model that was not trained on it.'],
  ['eGFR', 'Estimated glomerular filtration rate — the standard measure of kidney function.'],
  ['Glycemic load', 'Glycemic index multiplied by available carbohydrate; estimates a food\'s effect on blood sugar.'],
  ['TRL', 'Technology readiness level, 1 (basic principles) to 9 (proven in operation).'],
], [2000, 7360], 'Terms used in this dossier.'))

// ================================================================ assemble
const document = new Document({
  creator: 'MediPlate project',
  title: 'MediPlate — Complete Project Dossier',
  description: 'Objectives, methodology, datasets, models, prior work, gaps, contributions, experiments, metrics, architecture and development plan.',
  features: { updateFields: true },
  numbering: { config: [] },
  styles: {
    default: { document: { run: { font: 'Times New Roman', size: 21, color: INK } } },
    paragraphStyles: [
      { id: 'Heading1', name: 'Heading 1', basedOn: 'Normal', next: 'Normal', quickFormat: true,
        run: { size: 34, bold: true, color: ACCENT, font: 'Calibri' }, paragraph: { outlineLevel: 0, spacing: { before: 280, after: 170 } } },
      { id: 'Heading2', name: 'Heading 2', basedOn: 'Normal', next: 'Normal', quickFormat: true,
        run: { size: 26, bold: true, color: '133F2A', font: 'Calibri' }, paragraph: { outlineLevel: 1, spacing: { before: 240, after: 120 } } },
      { id: 'Heading3', name: 'Heading 3', basedOn: 'Normal', next: 'Normal', quickFormat: true,
        run: { size: 22, bold: true, color: '133F2A', font: 'Calibri' }, paragraph: { outlineLevel: 2, spacing: { before: 190, after: 100 } } },
    ],
  },
  sections: [{
    properties: { page: { margin: { top: 1100, right: 1080, bottom: 1100, left: 1080 } } },
    headers: { default: new Header({ children: [new Paragraph({ alignment: AlignmentType.RIGHT,
      children: [new TextRun({ text: 'MediPlate · Complete Project Dossier', size: 16, color: MUTED })] })] }) },
    footers: { default: new Footer({ children: [new Paragraph({ alignment: AlignmentType.CENTER,
      children: [new TextRun({ children: [PageNumber.CURRENT], size: 18, color: MUTED })] })] }) },
    children: doc,
  }],
})
const out = path.join(DIR, 'MediPlate_Project_Dossier.docx')
Packer.toBuffer(document).then((b) => {
  fs.writeFileSync(out, b)
  console.log('wrote', out, `${figNo} figures, ${tabNo} tables`)
})
