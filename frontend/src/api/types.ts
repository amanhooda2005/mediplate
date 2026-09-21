export type Lang = 'en' | 'ta' | 'hi'

export interface Msg {
  key: string | null
  params: Record<string, string | number>
  text: string
}

export interface User {
  id: number
  name: string
  email: string
  language: Lang
  role: 'patient' | 'admin'
  has_profile: boolean
}

export interface TokenOut {
  token: string
  user: User
}

export type ConditionId =
  | 'diabetes' | 'hypertension' | 'cvd' | 'obesity' | 'ckd' | 'fatty_liver' | 'metabolic_syndrome' | 'arthritis'

export interface Meta {
  states: string[]
  state_zone: Record<string, string>
  zones: Record<string, string>
  conditions: { id: ConditionId; options: Record<string, (string | number | boolean)[]> }[]
  medicines: { id: string; name: string; class_label: string }[]
  allergens: string[]
  labs: { kind: string; unit: string; min: number; max: number }[]
  messages: Record<string, Record<Lang, string>>
  manifest: Record<string, unknown>
}

export interface ProfileData {
  age: number
  sex: 'male' | 'female'
  height_cm: number
  weight_kg: number
  waist_cm: number | null
  activity: 'sedentary' | 'light' | 'moderate' | 'active'
  state: string
  second_zone: string | null
  diet_type: 'veg' | 'egg' | 'nonveg'
  no_beef: boolean
  no_pork: boolean
  allergies: string[]
  diseases: Partial<Record<ConditionId, Record<string, string | number | boolean | null>>>
  medicines: string[]
  smoker: boolean
  family_history_heart: boolean
  family_history_diabetes: number
  exercise: 'none' | 'some' | 'regular'
}

export interface ProfileOut {
  profile: ProfileData | null
  labs: Record<string, number>
}

export interface PlanItem {
  slot: string
  meal: string
  slot_type: string
  dish_id: string
  name: string
  name_ta: string
  name_hi: string
  portion: number
  salt: number
  leach: boolean
  origin: string
  grams: number
  nutrients: Record<string, number>
  glycemic_load: number
  region: Msg
  notes: Msg[]
  why: Msg[]
  tags: string[]
}

export interface DayCheck {
  nutrient: string
  unit: string
  value: number
  min: number | null
  max: number | null
  hard: boolean
  status: 'ok' | 'over' | 'under' | 'above_goal' | 'below_goal' | 'off'
  target?: number
}

export interface GlycemicInfo {
  gl: number
  level: 'low' | 'medium' | 'high'
  estimate_mgdl: number | null
  message: Msg | null
}

export interface PlanDay {
  index: number
  date: string
  feasible: boolean
  tier: number | null
  relaxed: boolean
  message: Msg | null
  meals: Record<'breakfast' | 'lunch' | 'snack' | 'dinner', PlanItem[]>
  totals: Record<string, number>
  checks: DayCheck[]
  glycemic: Partial<Record<string, GlycemicInfo>>
  choice: Record<string, [string, number, number, boolean]>
}

export interface Limit {
  nutrient: string
  unit: string
  min_hard: number | null
  min_soft: number | null
  max_hard: number | null
  max_soft: number | null
  min_sources: string[]
  max_sources: string[]
  reasons: Msg[]
}

export interface Targets {
  energy_kcal: number
  limits: Record<string, Limit>
  meal_carb_min: number | null
  meal_carb_min_reason: Msg | null
  vitk_band: [number, number] | null
  vitk_reason: Msg | null
  glycemic_focus: boolean
  leaching: boolean
  advice: Msg[]
  medicine_schedule: { medicine: string; name: string; class_label: string; timing: Msg; timing_key: string; advice: Msg[] }[]
  alerts: { severity: 'high' | 'medium'; medicine: string; message: Msg }[]
  ledger: Msg[]
  notes: Msg[]
  reference_weight: number
}

export interface Insight {
  id: string
  severity: 'info' | 'warning' | 'urgent'
  message: Msg
}

export interface RemovedSummary {
  count: number
  health_count: number
  examples: { dish_id: string; name: string; name_ta: string; name_hi: string; reasons: Msg[] }[]
}

export interface ContextSummary {
  zone: string
  zone_label: Msg
  second_zone: string | null
  bmi: number
  egfr: number | null
  ckd_stage: string | null
  reference_weight: number
  conditions: { id: string; label: Msg; auto: boolean }[]
  medicines: string[]
  chd_risk: number | null
  glucose_personal: boolean
  glucose_readings: number
  dishes_allowed: number
  dishes_removed: number
}

export interface Plan {
  id: number
  created_at: string
  start: string
  days: PlanDay[]
  tier_message: Msg
  targets: Targets
  removed: RemovedSummary
  context: ContextSummary
  insights: Insight[]
}

export interface InsightsOut {
  insights: Insight[]
  targets: Targets
  context: ContextSummary
  removed: RemovedSummary
}

export interface SearchResult {
  type: 'dish' | 'food'
  id: string
  name: string
  name_ta?: string
  name_hi?: string
  slot?: string
  group?: string
  local_names?: string
}

export interface CheckAlert {
  category: string
  severity: 'avoid' | 'limit' | 'info'
  message: Msg
  sources: string[]
  source_labels: Msg[]
}

export interface CheckOut {
  item_type: 'dish' | 'food'
  id: string
  name: string
  name_ta: string
  name_hi: string
  serving_g: number
  portion: number
  verdict: 'avoid' | 'limit' | 'ok'
  verdict_message: Msg
  alerts: CheckAlert[]
  nutrients: Record<string, number>
  glycemic: GlycemicInfo | null
  ingredients: { code: string; grams: number; name: string }[]
}

export interface MealLog {
  id: number
  day: string
  slot: string
  dish_id: string
  portion: number
  status: 'ate' | 'skipped' | 'swapped' | 'reading'
  rating: -1 | 0 | 1
  glucose_before: number | null
  glucose_after: number | null
  meal_gl: number | null
}

export interface LabRow {
  id: number
  kind: string
  value: number
  unit: string
  taken_on: string
}

export type Series = Record<string, { date: string; value: number }[]>

export interface Adherence {
  days: Record<string, { ate: number; skipped: number; swapped: number }>
  rate: number | null
  logged: number
  readings: MealLog[]
}
