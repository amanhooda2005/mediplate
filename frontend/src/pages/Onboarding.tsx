import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../api/client'
import { useAuth } from '../auth/AuthContext'
import { CheckIcon, PlateLogo } from '../components/icons'
import { Card, PageHeader, Spinner, cx } from '../components/ui'
import { useMeta } from '../hooks'
import { useI18n } from '../i18n/I18n'
import {
  EMPTY_PROFILE, STEPS, StepAbout, StepConditions, StepFood, StepMedicines, StepNav, StepTests, toPayload, validateStep,
} from './ProfileForm'
import type { FormState } from './ProfileForm'

export function Onboarding() {
  const { t } = useI18n()
  const meta = useMeta()
  const qc = useQueryClient()
  const nav = useNavigate()
  const { refresh } = useAuth()
  const [step, setStep] = useState(0)
  const [f, setF] = useState<FormState>(EMPTY_PROFILE)
  const [errors, setErrors] = useState<Record<string, string | undefined>>({})
  const [busy, setBusy] = useState(false)
  const [phase, setPhase] = useState<'form' | 'building'>('form')
  const [err, setErr] = useState<unknown>(null)

  if (!meta.data) return <Spinner />
  const set = (patch: Partial<FormState>) => setF((prev) => ({ ...prev, ...patch }))
  const props = { f, set, errors, meta: meta.data }

  async function next() {
    const e = validateStep(step, f, meta.data!, t)
    setErrors(e)
    if (Object.keys(e).length) return
    if (step < STEPS.length - 1) {
      setStep(step + 1)
      window.scrollTo({ top: 0 })
      return
    }
    setBusy(true)
    setErr(null)
    try {
      await api.saveProfile(toPayload(f))
      setPhase('building')
      await api.generatePlan({ days: 7 })
      await Promise.all([refresh(), qc.invalidateQueries({ queryKey: ['plan'] }), qc.invalidateQueries({ queryKey: ['profile'] }),
        qc.invalidateQueries({ queryKey: ['insights'] })])
      nav('/today', { replace: true })
    } catch (ex) {
      setErr(ex)
      setPhase('form')
    } finally {
      setBusy(false)
    }
  }

  if (phase === 'building') return <BuildingPlan />

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title={t('ob_title')} sub={t('ob_intro')} />
      <ol className="mb-5 grid grid-cols-5 gap-1.5" aria-label={t('step_of', { n: step + 1, total: STEPS.length })}>
        {STEPS.map((s, i) => (
          <li key={s} className="grid gap-1">
            <span className="h-1.5 overflow-hidden rounded-full bg-line">
              <span className={cx('block h-full origin-left rounded-full bg-leaf',
                'transition-transform duration-[var(--dur-3)] ease-[var(--ease-out)]')}
                style={{ transform: `scaleX(${i <= step ? 1 : 0})`, transitionDelay: `${i * 45}ms` }} />
            </span>
            <span className={cx('hidden text-xs font-semibold transition-colors duration-[var(--dur-2)] sm:block',
              i === step ? 'text-leaf' : 'text-muted')}>{t(s)}</span>
          </li>
        ))}
      </ol>
      <Card className="grid gap-6 p-5 sm:p-6">
        {/* Keyed on the step so each one slides in as the patient moves forward. */}
        <div key={step} className="a-slide grid gap-6">
          {step === 0 && <StepAbout {...props} />}
          {step === 1 && <StepFood {...props} />}
          {step === 2 && <StepConditions {...props} />}
          {step === 3 && <StepMedicines {...props} />}
          {step === 4 && <StepTests {...props} />}
        </div>
        <StepNav step={step} total={STEPS.length} busy={busy} error={err}
          onBack={() => { setStep(Math.max(0, step - 1)); setErrors({}) }}
          onNext={next} nextLabel={step === STEPS.length - 1 ? t('make_plan') : t('next')} />
      </Card>
    </div>
  )
}

/** The wait after the profile is saved: the five engine stages light up in turn. */
function BuildingPlan() {
  const { t } = useI18n()
  const [stage, setStage] = useState(0)
  const stages: string[] = [t('bs_profile'), t('bs_targets'), t('bs_filter'), t('bs_optimise'), t('bs_explain')]
  useEffect(() => {
    const id = setInterval(() => setStage((s) => (s + 1) % stages.length), 1100)
    return () => clearInterval(id)
  }, [stages.length])
  return (
    <Card className="a-pop mx-auto mt-10 grid max-w-lg gap-4 p-6">
      <div className="flex items-center justify-center gap-3">
        <PlateLogo className="spin" width={34} height={34} />
        <span className="font-display text-xl font-bold">{t('building_plan')}</span>
      </div>
      <ol className="grid gap-2" role="status" aria-live="polite">
        {stages.map((label, i) => (
          <li key={label} className={cx('flex items-center gap-3 rounded-[10px] px-3 py-2',
            'transition-[background-color,color,opacity] duration-[var(--dur-3)] ease-[var(--ease-out)]',
            i === stage ? 'bg-leaf-soft text-leaf-dark' : i < stage ? 'text-muted' : 'text-muted opacity-55')}>
            <span className={cx('grid size-6 shrink-0 place-items-center rounded-full border transition-all duration-[var(--dur-3)]',
              i < stage ? 'border-ok bg-ok text-white' : i === stage ? 'border-leaf bg-surface' : 'border-line bg-surface')}>
              {i < stage ? <CheckIcon width={14} height={14} /> : <span className={cx('size-2 rounded-full', i === stage ? 'bg-leaf' : 'bg-line')} />}
            </span>
            <span className="text-sm font-medium">{label}</span>
          </li>
        ))}
      </ol>
      <p className="text-center text-sm text-muted">{t('building_steps')}</p>
    </Card>
  )
}
