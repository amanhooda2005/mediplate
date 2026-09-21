import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { api, todayISO } from '../api/client'
import { useAuth } from '../auth/AuthContext'
import { Button, Card, ErrorBanner, Notice, PageHeader, Spinner } from '../components/ui'
import { useMeta, useProfile } from '../hooks'
import { useI18n } from '../i18n/I18n'
import { EMPTY_PROFILE, StepAbout, StepConditions, StepFood, StepMedicines, StepTests, toPayload, validateStep } from './ProfileForm'
import type { FormState } from './ProfileForm'

export function ProfilePage() {
  const { t } = useI18n()
  const { user, logout } = useAuth()
  const meta = useMeta()
  const prof = useProfile()
  const qc = useQueryClient()
  const [f, setF] = useState<FormState | null>(null)
  const [errors, setErrors] = useState<Record<string, string | undefined>>({})
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<unknown>(null)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    if (prof.data?.profile && !f) setF({ ...EMPTY_PROFILE, ...prof.data.profile, labs: {} })
  }, [prof.data, f])

  if (!meta.data || prof.isLoading || !f) return prof.error ? <ErrorBanner error={prof.error} /> : <Spinner />
  const set = (patch: Partial<FormState>) => { setSaved(false); setF((prev) => (prev ? { ...prev, ...patch } : prev)) }
  const props = { f, set, errors, meta: meta.data }

  async function save() {
    let all: Record<string, string | undefined> = {}
    for (const s of [0, 1, 4]) all = { ...all, ...validateStep(s, f!, meta.data!, t) }
    setErrors(all)
    if (Object.keys(all).length) return
    setBusy(true)
    setErr(null)
    try {
      await api.saveProfile(toPayload(f!))
      const plan = await api.generatePlan({ days: 7, start: todayISO() })
      qc.setQueryData(['plan'], plan)
      for (const k of ['profile', 'insights', 'series', 'labs']) qc.invalidateQueries({ queryKey: [k] })
      setF((prev) => (prev ? { ...prev, labs: {} } : prev))
      setSaved(true)
    } catch (ex) {
      setErr(ex)
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <PageHeader title={t('profile_title')}
        action={<Button variant="secondary" onClick={logout}>{t('sign_out')}</Button>} />
      <Card className="mb-4 grid gap-1 p-4">
        <h2 className="text-lg font-bold">{t('account')}</h2>
        <p>{user?.name} · <span className="text-muted">{user?.email}</span></p>
      </Card>
      <div className="grid gap-4">
        {[StepAbout, StepFood, StepConditions, StepMedicines].map((Step, i) => (
          <Card key={i} className="p-5"><Step {...props} /></Card>
        ))}
        <Card className="p-5"><StepTests {...props} latest={prof.data?.labs} /></Card>
        <div className="sticky bottom-20 z-10 grid gap-2 rounded-[var(--radius-card)] border border-line bg-surface p-3 md:bottom-4">
          <ErrorBanner error={err} />
          {Object.keys(errors).length > 0 && <Notice tone="avoid">{Object.values(errors).filter(Boolean).join(' · ')}</Notice>}
          {saved && <Notice tone="ok">{t('saved_msg')}</Notice>}
          {busy && <p className="text-sm text-muted" role="status">{t('building_steps')}</p>}
          <Button onClick={save} busy={busy}>{busy ? t('building_plan') : t('save')}</Button>
        </div>
      </div>
    </>
  )
}
