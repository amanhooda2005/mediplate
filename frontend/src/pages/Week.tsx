import { useState } from 'react'
import type { Limit, Plan } from '../api/types'
import { DrugAlerts, LimitMeters, MealCard, MedicineTiming } from '../components/PlanParts'
import { Card, Chip, Empty, ErrorBanner, Notice, PageHeader, Spinner, cx } from '../components/ui'
import { MEALS, formatDate, usePlan } from '../hooks'
import { useI18n } from '../i18n/I18n'
import { MakePlanButton, useSwap } from './Today'

export function Week() {
  const { t, lang, m } = useI18n()
  const plan = usePlan()
  const [sel, setSel] = useState(0)
  const { swap, swappingSlot, error: swapError } = useSwap()

  if (plan.isLoading) return <Spinner />
  if (plan.error) return <div className="pt-6"><ErrorBanner error={plan.error} onRetry={() => plan.refetch()} /></div>
  const p = plan.data
  if (!p) {
    return (
      <>
        <PageHeader title={t('week_title')} />
        <Empty>
          <p className="mb-4 text-lg">{t('no_plan_yet')}</p>
          <div className="mx-auto max-w-xs"><MakePlanButton label={t('make_plan_btn')} /></div>
        </Empty>
      </>
    )
  }
  const day = p.days[Math.min(sel, p.days.length - 1)]
  return (
    <>
      <PageHeader title={t('week_title')}
        sub={<>{t('plan_made', { date: formatDate(p.created_at.slice(0, 10), lang, { day: 'numeric', month: 'long' }) })} · {m(p.tier_message)}</>}
        action={<div className="w-full sm:w-auto"><MakePlanButton label={t('new_plan')} variant="secondary" /></div>} />

      <div role="tablist" aria-label={t('week_title')} className="-mx-4 mb-4 flex gap-2 overflow-x-auto px-4 pb-1">
        {p.days.map((d, i) => (
          <button key={d.date} role="tab" type="button" aria-selected={i === sel} onClick={() => setSel(i)}
            className={cx('grid min-w-[5.2rem] shrink-0 justify-items-center rounded-[12px] border px-3 py-2',
              i === sel ? 'border-leaf bg-leaf text-white' : 'border-line bg-surface hover:border-leaf')}>
            <span className="text-xs font-semibold uppercase tracking-wide opacity-85">{formatDate(d.date, lang, { weekday: 'short' })}</span>
            <span className="font-display text-xl font-bold">{formatDate(d.date, lang, { day: 'numeric' })}</span>
          </button>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="grid content-start gap-4">
          <ErrorBanner error={swapError} />
          {!day.feasible && day.message && <Notice tone="avoid">{m(day.message)}</Notice>}
          {day.relaxed && day.message && <Notice tone="limit">{m(day.message)}</Notice>}
          {day.feasible && MEALS.map((meal) => (
            <MealCard key={meal} meal={meal} items={day.meals[meal]} glycemic={day.glycemic[meal]}
              onSwap={(slot) => swap({ day_index: day.index, slot })} swappingSlot={swappingSlot} />
          ))}
        </div>
        <aside className="grid content-start gap-4">
          {day.feasible && (
            <Card className="grid gap-3 p-4">
              <h2 className="text-lg font-bold">{t('day_totals')}</h2>
              <LimitMeters checks={day.checks} />
            </Card>
          )}
        </aside>
      </div>

      <PlanExplanation plan={p} />
    </>
  )
}

function sourceLabel(src: string, plan: Plan, mk: (k: string) => string): string {
  if (src === 'general') return mk('d_general')
  if (src === 'risk_heart') return mk('d_cvd')
  const cond = plan.context.conditions.find((c) => c.id === src)
  if (cond) return mk(`d_${src}`)
  const med = plan.targets.medicine_schedule.find((s) => s.medicine === src)
  return med ? med.name : src
}

function LimitRow({ lim, plan }: { lim: Limit; plan: Plan }) {
  const { t, mk, m, num } = useI18n()
  const digits = lim.unit === 'g' ? 1 : 0
  const parts: { label: string; value: number; hard: boolean; sources: string[] }[] = []
  if (lim.max_hard !== null) parts.push({ label: t('limit_max'), value: lim.max_hard, hard: true, sources: lim.max_sources })
  if (lim.max_soft !== null) parts.push({ label: t('limit_max'), value: lim.max_soft, hard: false, sources: lim.max_sources })
  if (lim.min_hard !== null) parts.push({ label: t('limit_min'), value: lim.min_hard, hard: true, sources: lim.min_sources })
  if (lim.min_soft !== null) parts.push({ label: t('limit_min'), value: lim.min_soft, hard: false, sources: lim.min_sources })
  if (!parts.length) return null
  return (
    <li className="grid gap-1.5 py-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="font-semibold">{mk(`n_${lim.nutrient}`)}</span>
        <span className="flex flex-wrap gap-1.5">
          {parts.map((pt, i) => (
            <Chip key={i} tone={pt.hard ? 'avoid' : 'leaf'} title={pt.hard ? t('hard_limit') : t('soft_goal')}>
              {pt.label} {num(pt.value, digits)} {lim.unit} · {pt.hard ? t('hard_limit') : t('soft_goal')}
            </Chip>
          ))}
        </span>
      </div>
      <p className="text-sm text-muted">
        {[...new Set(parts.flatMap((pt) => pt.sources))].filter((s) => s !== 'general' || parts.length === 1)
          .map((s) => sourceLabel(s, plan, mk)).join(' · ')}
      </p>
      {lim.reasons.slice(0, 2).map((r) => <p key={r.key ?? r.text} className="text-sm">{m(r)}</p>)}
    </li>
  )
}

export function PlanExplanation({ plan }: { plan: Plan }) {
  const { t, m, mk, dishName, num } = useI18n()
  const tg = plan.targets
  const order = ['sodium_mg', 'potassium_mg', 'phosphorus_mg', 'protein_g', 'carb_g', 'sugar_g', 'satfat_g', 'fiber_g']
  const limits = Object.values(tg.limits).sort((a, b) => order.indexOf(a.nutrient) - order.indexOf(b.nutrient))
  return (
    <div className="mt-8 grid gap-4 lg:grid-cols-2">
      <Card className="grid content-start gap-2 p-5">
        <h2 className="text-xl font-bold">{t('why_limits')}</h2>
        <p className="text-sm text-muted">{t('why_limits_help')}</p>
        <p className="font-semibold">{t('energy_target', { kcal: num(tg.energy_kcal) })}</p>
        {tg.notes.map((n) => <p key={n.key ?? n.text} className="text-sm text-muted">{m(n)}</p>)}
        <ul className="divide-y divide-line">
          {limits.map((l) => <LimitRow key={l.nutrient} lim={l} plan={plan} />)}
        </ul>
        {tg.vitk_band && (
          <p className="rounded-[10px] bg-ground px-3 py-2 text-sm"><span className="font-semibold">{t('vitk_band', { min: tg.vitk_band[0], max: tg.vitk_band[1] })}.</span> {m(tg.vitk_reason)}</p>
        )}
        {tg.meal_carb_min && (
          <p className="rounded-[10px] bg-ground px-3 py-2 text-sm"><span className="font-semibold">{t('meal_carb_rule', { g: tg.meal_carb_min })}.</span> {m(tg.meal_carb_min_reason)}</p>
        )}
      </Card>

      <div className="grid content-start gap-4">
        <DrugAlerts targets={tg} />
        <Card className="grid gap-2 p-5">
          <h2 className="text-lg font-bold">{t('your_conditions')}</h2>
          <div className="flex flex-wrap gap-1.5">
            {plan.context.conditions.map((c) => (
              <Chip key={c.id} tone="leaf">{mk(`d_${c.id}`)}{c.auto && ` (${t('auto_found')})`}</Chip>
            ))}
          </div>
          <p className="text-sm text-muted">
            {t('bmi')} {plan.context.bmi}{plan.context.egfr !== null && ` · ${t('egfr')} ${plan.context.egfr}`}
            {plan.context.ckd_stage && ` (${plan.context.ckd_stage})`}
          </p>
        </Card>
        {tg.ledger.length > 0 && (
          <Card className="grid gap-2 p-5">
            <h2 className="text-lg font-bold">{t('ledger_title')}</h2>
            <ul className="grid gap-2">{tg.ledger.map((l, i) => <li key={i} className="rounded-[10px] bg-limit-soft px-3 py-2 text-sm">{m(l)}</li>)}</ul>
          </Card>
        )}
        {plan.removed.health_count > 0 && (
          <Card className="grid gap-2 p-5">
            <h2 className="text-lg font-bold">{t('removed_title')}</h2>
            <p className="text-sm text-muted">{t('removed_help', { count: plan.removed.health_count })}</p>
            <ul className="divide-y divide-line">
              {plan.removed.examples.slice(0, 8).map((e) => (
                <li key={e.dish_id} className="grid gap-0.5 py-2">
                  <span className="font-semibold">{dishName(e)}</span>
                  <span className="text-sm text-muted">{e.reasons.map((r) => m(r)).join(' ')}</span>
                </li>
              ))}
            </ul>
          </Card>
        )}
        {tg.advice.length > 0 && (
          <Card className="grid gap-2 p-5">
            <h2 className="text-lg font-bold">{t('advice_title')}</h2>
            <ul className="grid list-disc gap-1 pl-5">{tg.advice.map((a) => <li key={a.key ?? a.text}>{m(a)}</li>)}</ul>
          </Card>
        )}
        <MedicineTiming targets={tg} />
      </div>
    </div>
  )
}
