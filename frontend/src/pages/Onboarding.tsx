import { useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../api/client'
import { useAuth } from '../auth/AuthContext'
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

  if (phase === 'building') {
    return (
      <Card className="mx-auto mt-10 grid max-w-lg gap-2 p-6 text-center">
        <Spinner label={t('building_plan')} />
        <p className="text-muted">{t('building_steps')}</p>
      </Card>
    )
  }

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title={t('ob_title')} sub={t('ob_intro')} />
      <ol className="mb-5 grid grid-cols-5 gap-1.5" aria-label={t('step_of', { n: step + 1, total: STEPS.length })}>
        {STEPS.map((s, i) => (
          <li key={s} className="grid gap-1">
            <span className={cx('h-1.5 rounded-full', i <= step ? 'bg-leaf' : 'bg-line')} />
            <span className={cx('hidden text-xs font-semibold sm:block', i === step ? 'text-leaf' : 'text-muted')}>{t(s)}</span>
          </li>
        ))}
      </ol>
      <Card className="grid gap-6 p-5 sm:p-6">
        {step === 0 && <StepAbout {...props} />}
        {step === 1 && <StepFood {...props} />}
        {step === 2 && <StepConditions {...props} />}
        {step === 3 && <StepMedicines {...props} />}
        {step === 4 && <StepTests {...props} />}
        <StepNav step={step} total={STEPS.length} busy={busy} error={err}
          onBack={() => { setStep(Math.max(0, step - 1)); setErrors({}) }}
          onNext={next} nextLabel={step === STEPS.length - 1 ? t('make_plan') : t('next')} />
      </Card>
    </div>
  )
}
