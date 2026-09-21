import { useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import type { ConditionId, Meta, ProfileData } from '../api/types'
import { Button, Card, Choice, ErrorBanner, Field, Input, Select, Toggle, cx } from '../components/ui'
import { useI18n } from '../i18n/I18n'
import type { UIKey } from '../i18n/strings'

export type FormState = ProfileData & { labs: Record<string, string> }

export const EMPTY_PROFILE: FormState = {
  age: 0, sex: 'female', height_cm: 0, weight_kg: 0, waist_cm: null, activity: 'light', state: '', second_zone: null,
  diet_type: 'veg', no_beef: true, no_pork: false, allergies: [], diseases: {}, medicines: [], smoker: false,
  family_history_heart: false, family_history_diabetes: 0, exercise: 'none', labs: {},
}

const LAB_GROUPS: { title: UIKey; kinds: string[] }[] = [
  { title: 'tests_group_bp', kinds: ['sbp', 'dbp'] },
  { title: 'tests_group_sugar', kinds: ['fasting_glucose', 'hba1c'] },
  { title: 'tests_group_kidney', kinds: ['creatinine', 'potassium', 'phosphorus'] },
  { title: 'tests_group_lipids', kinds: ['ldl', 'hdl', 'triglycerides', 'total_cholesterol'] },
  { title: 'tests_group_liver', kinds: ['alt', 'ast', 'platelets', 'uric_acid'] },
]

const CONDITIONS: ConditionId[] = ['diabetes', 'hypertension', 'cvd', 'obesity', 'ckd', 'fatty_liver', 'metabolic_syndrome', 'arthritis']

type Errors = Partial<Record<string, string>>

export function validateStep(step: number, f: FormState, meta: Meta, t: (k: UIKey) => string): Errors {
  const e: Errors = {}
  const range = (v: number | null | undefined, lo: number, hi: number) => v !== null && v !== undefined && v >= lo && v <= hi
  if (step === 0) {
    if (!range(f.age, 30, 100)) e.age = '30 – 100'
    if (!range(f.height_cm, 120, 220)) e.height_cm = '120 – 220'
    if (!range(f.weight_kg, 30, 250)) e.weight_kg = '30 – 250'
    if (f.waist_cm !== null && !range(f.waist_cm, 50, 200)) e.waist_cm = '50 – 200'
  }
  if (step === 1) {
    if (!f.state) e.state = t('choose_state')
  }
  if (step === 4) {
    for (const lab of meta.labs) {
      const raw = f.labs[lab.kind]
      if (raw === undefined || raw === '') continue
      const v = Number(raw)
      if (!Number.isFinite(v) || v < lab.min || v > lab.max) e[`lab_${lab.kind}`] = `${lab.min} – ${lab.max} ${lab.unit}`
    }
  }
  return e
}

export function toPayload(f: FormState): ProfileData & { labs: Record<string, number> } {
  const labs: Record<string, number> = {}
  for (const [k, v] of Object.entries(f.labs)) {
    if (v !== '' && v !== undefined && Number.isFinite(Number(v))) labs[k] = Number(v)
  }
  const { labs: _unused, ...rest } = f
  void _unused
  return { ...rest, labs }
}

function numOrZero(v: string): number {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

function Section({ title, children, hint }: { title: ReactNode; children: ReactNode; hint?: ReactNode }) {
  return (
    <div className="grid gap-4">
      <div className="grid gap-1">
        <h2 className="text-xl font-bold">{title}</h2>
        {hint && <p className="text-muted">{hint}</p>}
      </div>
      {children}
    </div>
  )
}

export function StepAbout({ f, set, errors }: StepProps) {
  const { t } = useI18n()
  return (
    <Section title={t('step_about')}>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field id="age" label={t('age')} error={errors.age}>
          <Input id="age" type="number" inputMode="numeric" value={f.age || ''} onChange={(e) => set({ age: numOrZero(e.target.value) })} />
        </Field>
        <Field id="height" label={t('height_cm')} error={errors.height_cm}>
          <Input id="height" type="number" inputMode="decimal" value={f.height_cm || ''} onChange={(e) => set({ height_cm: numOrZero(e.target.value) })} />
        </Field>
        <Field id="weight" label={t('weight_kg')} error={errors.weight_kg}>
          <Input id="weight" type="number" inputMode="decimal" value={f.weight_kg || ''} onChange={(e) => set({ weight_kg: numOrZero(e.target.value) })} />
        </Field>
      </div>
      <Field id="sex" label={t('sex')} hint={t('sex_hint')}>
        <Choice name="sex" value={f.sex} onChange={(v) => set({ sex: v })}
          options={[{ value: 'female', label: t('female') }, { value: 'male', label: t('male') }]} />
      </Field>
      <Field id="waist" label={<>{t('waist_cm')} <span className="font-normal text-muted">({t('optional')})</span></>} hint={t('waist_hint')} error={errors.waist_cm}>
        <Input id="waist" type="number" inputMode="decimal" className="sm:max-w-60" value={f.waist_cm ?? ''}
          onChange={(e) => set({ waist_cm: e.target.value === '' ? null : numOrZero(e.target.value) })} />
      </Field>
      <Field id="activity" label={t('activity')}>
        <Choice name="activity" value={f.activity} onChange={(v) => set({ activity: v })}
          options={[
            { value: 'sedentary', label: t('act_sedentary') }, { value: 'light', label: t('act_light') },
            { value: 'moderate', label: t('act_moderate') }, { value: 'active', label: t('act_active') },
          ]} />
      </Field>
      <Field id="exercise" label={t('exercise')}>
        <Choice name="exercise" value={f.exercise} onChange={(v) => set({ exercise: v })} columns={3}
          options={[{ value: 'none', label: t('ex_none') }, { value: 'some', label: t('ex_some') }, { value: 'regular', label: t('ex_regular') }]} />
      </Field>
      <div className="grid gap-2 sm:grid-cols-2">
        <Toggle id="smoker" checked={f.smoker} onChange={(v) => set({ smoker: v })} label={t('smoker')} />
        <Toggle id="fh_heart" checked={f.family_history_heart} onChange={(v) => set({ family_history_heart: v })} label={t('family_heart')} />
      </div>
      <Field id="fh_diabetes" label={t('family_diabetes')}>
        <Choice name="fh_diabetes" value={f.family_history_diabetes} onChange={(v) => set({ family_history_diabetes: v })} columns={3}
          options={[{ value: 0, label: t('fam_none') }, { value: 1, label: t('fam_one') }, { value: 2, label: t('fam_both') }]} />
      </Field>
    </Section>
  )
}

export function StepFood({ f, set, errors, meta }: StepProps) {
  const { t, mk } = useI18n()
  const zone = f.state ? meta.state_zone[f.state] : null
  return (
    <Section title={t('step_food')}>
      <Field id="state" label={t('state')} error={errors.state}>
        <Select id="state" value={f.state} onChange={(e) => set({ state: e.target.value, second_zone: null })}>
          <option value="">{t('choose_state')}</option>
          {meta.states.map((s) => <option key={s} value={s}>{s}</option>)}
        </Select>
      </Field>
      {zone && (
        <p className="rounded-[10px] bg-leaf-soft px-4 py-3 font-semibold text-leaf-dark">{t('your_zone', { zone: mk(`z_${zone}`) })}</p>
      )}
      {zone && (
        <Field id="second_zone" label={t('second_zone')} hint={t('second_zone_hint')}>
          <Select id="second_zone" value={f.second_zone ?? ''} onChange={(e) => set({ second_zone: e.target.value || null })}>
            <option value="">{t('none_option')}</option>
            {Object.keys(meta.zones).filter((z) => z !== zone).map((z) => <option key={z} value={z}>{mk(`z_${z}`)}</option>)}
          </Select>
        </Field>
      )}
      <Field id="diet" label={t('diet_type')}>
        <Choice name="diet" value={f.diet_type} onChange={(v) => set({ diet_type: v })} columns={3}
          options={[{ value: 'veg', label: t('diet_veg') }, { value: 'egg', label: t('diet_egg') }, { value: 'nonveg', label: t('diet_nonveg') }]} />
      </Field>
      {f.diet_type === 'nonveg' && (
        <div className="grid gap-2 sm:grid-cols-2">
          <Toggle id="no_beef" checked={f.no_beef} onChange={(v) => set({ no_beef: v })} label={t('no_beef')} />
          <Toggle id="no_pork" checked={f.no_pork} onChange={(v) => set({ no_pork: v })} label={t('no_pork')} />
        </div>
      )}
      <Field id="allergies" label={<>{t('allergies')} <span className="font-normal text-muted">({t('optional')})</span></>}>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {meta.allergens.map((a) => (
            <Toggle key={a} id={`allergy-${a}`} checked={f.allergies.includes(a)} label={mk(`a_${a}`)}
              onChange={(v) => set({ allergies: v ? [...f.allergies, a] : f.allergies.filter((x) => x !== a) })} />
          ))}
        </div>
      </Field>
    </Section>
  )
}

export function StepConditions({ f, set }: StepProps) {
  const { t, mk } = useI18n()
  const toggle = (c: ConditionId, on: boolean) => {
    const next = { ...f.diseases }
    if (on) {
      next[c] = c === 'diabetes' ? { type: 'type2' } : c === 'cvd' ? { type: 'coronary' }
        : c === 'arthritis' ? { type: 'osteoarthritis' } : c === 'ckd' ? { stage: null, dialysis: false } : {}
    } else {
      delete next[c]
    }
    set({ diseases: next })
  }
  const setOpt = (c: ConditionId, key: string, value: string | number | boolean | null) =>
    set({ diseases: { ...f.diseases, [c]: { ...(f.diseases[c] ?? {}), [key]: value } } })

  return (
    <Section title={t('step_conditions')} hint={t('conditions_help')}>
      <div className="grid gap-3 md:grid-cols-2">
        {CONDITIONS.map((c) => {
          const on = c in f.diseases
          const opts = f.diseases[c] ?? {}
          return (
            <div key={c} className={cx('grid content-start gap-3 rounded-[12px]', on && 'bg-leaf-soft/50 p-2 pb-3')}>
              <Toggle id={`cond-${c}`} checked={on} onChange={(v) => toggle(c, v)} label={mk(`d_${c}`)} hint={t(`cond_${c}_d` as UIKey)} />
              {on && c === 'diabetes' && (
                <Choice name="diabetes-type" value={String(opts.type ?? 'type2')} onChange={(v) => setOpt(c, 'type', v)}
                  options={[{ value: 'type2', label: t('opt_type2') }, { value: 'type1', label: t('opt_type1') }]} />
              )}
              {on && c === 'cvd' && (
                <Choice name="cvd-type" value={String(opts.type ?? 'coronary')} onChange={(v) => setOpt(c, 'type', v)} columns={1}
                  options={[{ value: 'coronary', label: t('opt_coronary') }, { value: 'stroke', label: t('opt_stroke') },
                    { value: 'heart_failure', label: t('opt_heart_failure') }]} />
              )}
              {on && c === 'arthritis' && (
                <Choice name="arthritis-type" value={String(opts.type ?? 'osteoarthritis')} onChange={(v) => setOpt(c, 'type', v)} columns={1}
                  options={[{ value: 'osteoarthritis', label: t('opt_osteoarthritis') }, { value: 'rheumatoid', label: t('opt_rheumatoid') },
                    { value: 'gout', label: t('opt_gout') }]} />
              )}
              {on && c === 'ckd' && (
                <div className="grid gap-2">
                  <Field id="ckd-stage" label={t('opt_stage')}>
                    <Select id="ckd-stage" value={opts.stage === null || opts.stage === undefined ? '' : String(opts.stage)}
                      onChange={(e) => setOpt(c, 'stage', e.target.value ? Number(e.target.value) : null)}>
                      <option value="">{t('opt_stage_unknown')}</option>
                      {[1, 2, 3, 4, 5].map((s) => <option key={s} value={s}>{s}</option>)}
                    </Select>
                  </Field>
                  <Toggle id="ckd-dialysis" checked={Boolean(opts.dialysis)} onChange={(v) => setOpt(c, 'dialysis', v)} label={t('opt_dialysis')} />
                </div>
              )}
            </div>
          )
        })}
      </div>
    </Section>
  )
}

export function StepMedicines({ f, set, meta }: StepProps) {
  const { t } = useI18n()
  const [q, setQ] = useState('')
  const groups = useMemo(() => {
    const needle = q.trim().toLowerCase()
    const out = new Map<string, Meta['medicines']>()
    for (const m of meta.medicines) {
      if (needle && !m.name.toLowerCase().includes(needle) && !m.class_label.toLowerCase().includes(needle)) continue
      out.set(m.class_label, [...(out.get(m.class_label) ?? []), m])
    }
    return [...out.entries()]
  }, [q, meta.medicines])
  const toggle = (id: string, on: boolean) => set({ medicines: on ? [...f.medicines, id] : f.medicines.filter((m) => m !== id) })
  return (
    <Section title={t('step_medicines')} hint={t('medicines_help')}>
      <div className="flex flex-wrap items-center gap-3">
        <Input aria-label={t('search_medicines')} placeholder={t('search_medicines')} value={q} onChange={(e) => setQ(e.target.value)} className="sm:max-w-sm" />
        <span className="font-semibold text-leaf">{t('selected_count', { n: f.medicines.length })}</span>
      </div>
      {f.medicines.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {f.medicines.map((id) => {
            const m = meta.medicines.find((x) => x.id === id)
            return (
              <button key={id} type="button" onClick={() => toggle(id, false)}
                className="rounded-full border border-leaf bg-leaf-soft px-3 py-1 text-sm font-semibold text-leaf-dark">
                {m?.name ?? id} ×
              </button>
            )
          })}
        </div>
      )}
      <div className="grid max-h-[28rem] gap-4 overflow-y-auto rounded-[12px] border border-line bg-surface p-3">
        {groups.length === 0 && <p className="text-muted">{t('no_meds_found')}</p>}
        {groups.map(([label, meds]) => (
          <div key={label} className="grid gap-2">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-muted">{label}</h3>
            <div className="grid gap-2 sm:grid-cols-2">
              {meds.map((m) => (
                <Toggle key={m.id} id={`med-${m.id}`} checked={f.medicines.includes(m.id)} onChange={(v) => toggle(m.id, v)} label={m.name} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </Section>
  )
}

export function StepTests({ f, set, errors, meta, latest }: StepProps & { latest?: Record<string, number> }) {
  const { t } = useI18n()
  const unit = (k: string) => meta.labs.find((l) => l.kind === k)?.unit ?? ''
  return (
    <Section title={t('step_tests')} hint={t('tests_help')}>
      {LAB_GROUPS.map((g) => (
        <Card key={g.title} className="grid gap-3 p-4">
          <h3 className="font-bold">{t(g.title)}</h3>
          <div className="grid gap-3 sm:grid-cols-2">
            {g.kinds.map((k) => (
              <Field key={k} id={`lab-${k}`} label={<>{t(`lab_${k}` as UIKey)} <span className="font-normal text-muted">({unit(k)})</span></>}
                hint={latest?.[k] !== undefined ? `${latest[k]} ${unit(k)}` : undefined} error={errors[`lab_${k}`]}>
                <Input id={`lab-${k}`} type="number" inputMode="decimal" step="any" value={f.labs[k] ?? ''}
                  onChange={(e) => set({ labs: { ...f.labs, [k]: e.target.value } })} />
              </Field>
            ))}
          </div>
        </Card>
      ))}
    </Section>
  )
}

export interface StepProps {
  f: FormState
  set: (patch: Partial<FormState>) => void
  errors: Errors
  meta: Meta
}

export const STEPS: UIKey[] = ['step_about', 'step_food', 'step_conditions', 'step_medicines', 'step_tests']

export function StepNav({ step, total, onBack, onNext, nextLabel, busy, error }:
  { step: number; total: number; onBack: () => void; onNext: () => void; nextLabel: string; busy?: boolean; error?: unknown }) {
  const { t } = useI18n()
  return (
    <div className="grid gap-3">
      <ErrorBanner error={error} />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button variant="secondary" onClick={onBack} disabled={step === 0 || busy}>{t('back')}</Button>
        <span className="text-sm text-muted">{t('step_of', { n: step + 1, total })}</span>
        <Button onClick={onNext} busy={busy}>{nextLabel}</Button>
      </div>
    </div>
  )
}
