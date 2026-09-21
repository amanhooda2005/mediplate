import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { api, todayISO } from '../api/client'
import type { MealLog, Plan, PlanItem } from '../api/types'
import { useAuth } from '../auth/AuthContext'
import { DropIcon } from '../components/icons'
import { DrugAlerts, GlucoseLogger, LimitMeters, MealCard, MedicineTiming } from '../components/PlanParts'
import { Button, Card, Empty, ErrorBanner, Notice, PageHeader, Spinner } from '../components/ui'
import { MEALS, formatDate, usePlan } from '../hooks'
import { useI18n } from '../i18n/I18n'

export function MakePlanButton({ label, variant = 'primary' }: { label: string; variant?: 'primary' | 'secondary' }) {
  const { t } = useI18n()
  const qc = useQueryClient()
  const gen = useMutation({
    mutationFn: () => api.generatePlan({ days: 7, start: todayISO() }),
    onSuccess: (plan) => {
      qc.setQueryData(['plan'], plan)
      qc.invalidateQueries({ queryKey: ['insights'] })
    },
  })
  return (
    <div className="grid gap-2">
      <Button variant={variant} busy={gen.isPending} onClick={() => gen.mutate()}>
        {gen.isPending ? t('building_plan') : label}
      </Button>
      {gen.isPending && <p className="text-sm text-muted" role="status">{t('building_steps')}</p>}
      <ErrorBanner error={gen.error} />
    </div>
  )
}

export function useSwap() {
  const qc = useQueryClient()
  const [slot, setSlot] = useState<string | null>(null)
  const mut = useMutation({
    mutationFn: (v: { day_index: number; slot: string }) => api.swap(v),
    onMutate: (v) => setSlot(v.slot),
    onSuccess: (plan: Plan) => qc.setQueryData(['plan'], plan),
    onSettled: () => setSlot(null),
  })
  return { swap: mut.mutate, swappingSlot: slot, error: mut.error }
}

export function Today() {
  const { t, num } = useI18n()
  const { lang } = useI18n()
  const { user } = useAuth()
  const plan = usePlan()
  const qc = useQueryClient()
  const today = todayISO()
  const logsQ = useQuery({ queryKey: ['logs', today], queryFn: () => api.mealLogs(today, today) })
  const { swap, swappingSlot, error: swapError } = useSwap()
  const logMut = useMutation({
    mutationFn: api.logMeal,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['logs', today] })
      qc.invalidateQueries({ queryKey: ['adherence'] })
    },
  })

  if (plan.isLoading) return <Spinner />
  if (plan.error) return <div className="pt-6"><ErrorBanner error={plan.error} onRetry={() => plan.refetch()} /></div>

  const p = plan.data
  const heading = <PageHeader title={t('hello', { name: user?.name ?? '' })} sub={formatDate(today, lang, { weekday: 'long', day: 'numeric', month: 'long' })} />
  if (!p) {
    return (
      <>
        {heading}
        <Empty>
          <p className="mb-4 text-lg">{t('no_plan_yet')}</p>
          <div className="mx-auto max-w-xs"><MakePlanButton label={t('make_plan_btn')} /></div>
        </Empty>
      </>
    )
  }
  const day = p.days.find((d) => d.date === today)
  const dayIndex = day ? day.index : -1
  const logs: Record<string, MealLog> = {}
  for (const l of logsQ.data ?? []) if (l.status !== 'reading') logs[l.slot] = l

  const onLog = (item: PlanItem, status: 'ate' | 'skipped', rating: -1 | 0 | 1) =>
    logMut.mutate({ day: today, slot: item.slot, dish_id: item.dish_id, portion: item.portion, status, rating })

  return (
    <>
      {heading}
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="grid content-start gap-4">
          <DrugAlerts targets={p.targets} />
          {p.insights.filter((i) => i.severity === 'urgent').map((i) => (
            <Notice key={i.id} tone="avoid"><InsightText msg={i.message} /></Notice>
          ))}
          {!day && (
            <Notice tone="limit">
              <p className="mb-3">{t('not_in_plan_today')}</p>
              <div className="max-w-xs"><MakePlanButton label={t('new_plan')} /></div>
            </Notice>
          )}
          {day && !day.feasible && day.message && <Notice tone="avoid"><InsightText msg={day.message} /></Notice>}
          {day?.relaxed && day.message && <Notice tone="limit"><InsightText msg={day.message} /></Notice>}
          <ErrorBanner error={swapError ?? logMut.error} />
          {day?.feasible && (
            <>
              <h2 className="text-xl font-bold">{t('today_title')}</h2>
              {MEALS.map((meal) => (
                <MealCard key={meal} meal={meal} items={day.meals[meal]} logs={logs} onLog={onLog}
                  onSwap={(slot) => swap({ day_index: dayIndex, slot })} swappingSlot={swappingSlot}
                  glycemic={day.glycemic[meal]} />
              ))}
            </>
          )}
        </div>

        <aside className="grid content-start gap-4">
          {day?.feasible && (
            <Card className="grid gap-3 p-4">
              <h2 className="text-lg font-bold">{t('limits_today')}</h2>
              <p className="text-sm text-muted">{t('energy_target', { kcal: num(p.targets.energy_kcal) })}</p>
              <LimitMeters checks={day.checks} />
            </Card>
          )}
          <MedicineTiming targets={p.targets} />
          {day?.feasible && p.targets.glycemic_focus && (
            <Card className="grid gap-3 p-4">
              <h2 className="flex items-center gap-2 text-lg font-bold"><DropIcon className="text-leaf" />{t('log_sugar')}</h2>
              <SugarTabs day={today} />
            </Card>
          )}
        </aside>
      </div>
    </>
  )
}

function SugarTabs({ day }: { day: string }) {
  const { t } = useI18n()
  const qc = useQueryClient()
  const [meal, setMeal] = useState<'breakfast' | 'lunch' | 'dinner'>('lunch')
  const labels = { breakfast: t('meal_breakfast'), lunch: t('meal_lunch'), dinner: t('meal_dinner') }
  return (
    <div className="grid gap-3">
      <div role="tablist" className="grid grid-cols-3 gap-1 rounded-[10px] bg-ground p-1">
        {(['breakfast', 'lunch', 'dinner'] as const).map((m) => (
          <button key={m} role="tab" type="button" aria-selected={meal === m} onClick={() => setMeal(m)}
            className={`min-h-10 rounded-[8px] text-sm font-semibold ${meal === m ? 'bg-surface text-leaf shadow-sm' : 'text-muted'}`}>
            {labels[m]}
          </button>
        ))}
      </div>
      <GlucoseLogger key={meal} day={day} meal={meal} onSaved={() => qc.invalidateQueries({ queryKey: ['insights'] })} />
    </div>
  )
}

export function InsightText({ msg }: { msg: { key: string | null; params: Record<string, string | number>; text: string } }) {
  const { m } = useI18n()
  return <span>{m(msg)}</span>
}
