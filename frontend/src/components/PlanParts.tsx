import { useState } from 'react'
import { api } from '../api/client'
import type { DayCheck, GlycemicInfo, MealLog, PlanItem, Targets } from '../api/types'
import type { MealKey } from '../hooks'
import { useI18n } from '../i18n/I18n'
import type { UIKey } from '../i18n/strings'
import { CheckIcon, ChevronIcon, DropIcon, InfoIcon, PillIcon, SwapIcon, ThumbDownIcon, ThumbUpIcon, XIcon } from './icons'
import { Button, Card, Chip, CountUp, ErrorBanner, Field, Input, Notice, cx, stagger } from './ui'

const MEAL_LABEL: Record<MealKey, UIKey> = {
  breakfast: 'meal_breakfast', lunch: 'meal_lunch', snack: 'meal_snack', dinner: 'meal_dinner',
}

export function DishRow({ item, log, onLog, onSwap, swapping, compact }: {
  item: PlanItem
  log?: MealLog
  onLog?: (item: PlanItem, status: 'ate' | 'skipped', rating: -1 | 0 | 1) => void
  onSwap?: (slot: string) => void
  swapping?: boolean
  compact?: boolean
}) {
  const { t, m, lang, dishName, num } = useI18n()
  const n = item.nutrients
  const [open, setOpen] = useState(false)
  const status = log?.status
  const rating = log?.rating ?? 0
  return (
    <li className={cx('grid gap-2 py-3.5 transition-[opacity,background-color] duration-[var(--dur-3)] ease-[var(--ease-out)]',
      status === 'skipped' && 'opacity-60')}>
      <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
        <div className="grid min-w-0 flex-1 gap-0.5">
          <span className="text-[1.08rem] font-semibold leading-snug">{dishName(item)}</span>
          {lang !== 'en' && <span className="text-sm text-muted">{item.name}</span>}
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {item.portion !== 1 && <Chip tone="info">{t('portion_x', { p: item.portion })}</Chip>}
          {status === 'ate' && <Chip tone="ok"><CheckIcon width={14} height={14} />{t('logged_ate')}</Chip>}
          {status === 'skipped' && <Chip tone="limit">{t('logged_skipped')}</Chip>}
        </div>
      </div>
      {item.why.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {item.why.map((w) => <Chip key={w.key ?? w.text} tone="leaf">{m(w)}</Chip>)}
        </div>
      )}
      {item.notes.filter((x) => x.key !== 'portion').map((note) => (
        <p key={note.key ?? note.text} className="flex items-start gap-2 text-sm text-limit">
          <InfoIcon width={16} height={16} className="mt-0.5 shrink-0" />{m(note)}
        </p>
      ))}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted tabular">
        <span>{num(n.energy_kcal)} kcal</span>
        <span>{m({ key: 'n_protein_g', params: {}, text: 'Protein' })} {num(n.protein_g, 1)} g</span>
        <span>{m({ key: 'n_sodium_mg', params: {}, text: 'Sodium' })} {num(n.sodium_mg)} mg</span>
        {!compact && (
          <button type="button" onClick={() => setOpen(!open)} aria-expanded={open}
            className="inline-flex items-center gap-1 font-semibold text-leaf underline-offset-2 hover:underline">
            {t('more_info')}
            <ChevronIcon width={15} height={15}
              className={cx('transition-transform duration-[var(--dur-2)] ease-[var(--ease-out)]', open ? 'rotate-90' : 'rotate-0')} />
          </button>
        )}
      </div>
      {!compact && (
        <div className="collapse" data-open={open}>
          <div>
            <div className="grid gap-1 rounded-[10px] bg-ground px-3 py-2 text-sm">
              <p className="text-muted">{m(item.region)}</p>
              <p className="tabular text-muted">
                {['carb_g', 'fiber_g', 'satfat_g', 'potassium_mg', 'phosphorus_mg'].map((k) => (
                  <span key={k} className="mr-3 inline-block">{m({ key: `n_${k}`, params: {}, text: k })}: {num(n[k] ?? 0, k.endsWith('_g') ? 1 : 0)} {k.endsWith('_g') ? 'g' : 'mg'}</span>
                ))}
                <span className="inline-block">{t('grams_short', { g: item.grams })}</span>
              </p>
            </div>
          </div>
        </div>
      )}
      {(onLog || onSwap) && (
        <div className="flex flex-wrap gap-2">
          {onLog && (
            <>
              <Button variant={status === 'ate' ? 'primary' : 'secondary'} className="min-h-11 px-3.5"
                onClick={() => onLog(item, 'ate', rating as -1 | 0 | 1)} aria-pressed={status === 'ate'}>
                <CheckIcon width={18} height={18} />{t('ate')}
              </Button>
              <Button variant={status === 'skipped' ? 'primary' : 'secondary'} className="min-h-11 px-3.5"
                onClick={() => onLog(item, 'skipped', rating as -1 | 0 | 1)} aria-pressed={status === 'skipped'}>
                <XIcon width={18} height={18} />{t('skipped')}
              </Button>
              <Button variant="ghost" className="min-h-11 px-3" aria-label={t('like')} title={t('like')} aria-pressed={rating === 1}
                onClick={() => onLog(item, (status === 'skipped' ? 'skipped' : 'ate'), rating === 1 ? 0 : 1)}>
                <ThumbUpIcon className={rating === 1 ? 'fill-leaf-soft' : ''} />
              </Button>
              <Button variant="ghost" className="min-h-11 px-3" aria-label={t('dislike')} title={t('dislike')} aria-pressed={rating === -1}
                onClick={() => onLog(item, (status === 'ate' ? 'ate' : 'skipped'), rating === -1 ? 0 : -1)}>
                <ThumbDownIcon className={rating === -1 ? 'fill-avoid-soft text-avoid' : ''} />
              </Button>
            </>
          )}
          {onSwap && (
            <Button variant="ghost" className="min-h-11 px-3" busy={swapping} onClick={() => onSwap(item.slot)}>
              {!swapping && <SwapIcon width={18} height={18} />}{swapping ? t('swapping') : t('swap')}
            </Button>
          )}
        </div>
      )}
    </li>
  )
}

export function MealCard({ meal, items, logs, onLog, onSwap, swappingSlot, glycemic, compact, index = 0 }: {
  meal: MealKey
  items: PlanItem[]
  logs?: Record<string, MealLog>
  onLog?: (item: PlanItem, status: 'ate' | 'skipped', rating: -1 | 0 | 1) => void
  onSwap?: (slot: string) => void
  swappingSlot?: string | null
  glycemic?: GlycemicInfo
  compact?: boolean
  index?: number
}) {
  const { t, m } = useI18n()
  const kcal = items.reduce((s, i) => s + i.nutrients.energy_kcal, 0)
  return (
    <Card className="a-rise px-4 pt-3 sm:px-5" as="article" hover style={stagger(index)}>
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-line pb-2.5">
        <h3 className="text-[1.2rem] font-bold">{t(MEAL_LABEL[meal])}</h3>
        <div className="flex items-center gap-2">
          {glycemic && <GlChip g={glycemic} />}
          <span className="text-sm font-semibold text-muted tabular"><CountUp value={kcal} /> kcal</span>
        </div>
      </header>
      {glycemic?.message && glycemic.level !== 'low' && (
        <p className="pt-2 text-sm text-muted">{m(glycemic.message)}</p>
      )}
      <ul className="divide-y divide-line">
        {items.map((it) => (
          <DishRow key={it.slot} item={it} log={logs?.[it.slot]} onLog={onLog} onSwap={onSwap}
            swapping={swappingSlot === it.slot} compact={compact} />
        ))}
      </ul>
    </Card>
  )
}

export function GlChip({ g }: { g: GlycemicInfo }) {
  const { t } = useI18n()
  const tone = g.level === 'low' ? 'ok' : g.level === 'medium' ? 'limit' : 'avoid'
  const key: UIKey = g.level === 'low' ? 'gl_low' : g.level === 'medium' ? 'gl_medium' : 'gl_high'
  return <Chip tone={tone} title={`GL ${g.gl}`}><DropIcon width={14} height={14} />{t(key)}</Chip>
}

const STATUS_TONE: Record<DayCheck['status'], 'ok' | 'limit' | 'avoid'> = {
  ok: 'ok', above_goal: 'limit', below_goal: 'limit', over: 'avoid', under: 'avoid', off: 'limit',
}

export function LimitMeters({ checks }: { checks: DayCheck[] }) {
  const { t, mk, num } = useI18n()
  const order = ['energy_kcal', 'sodium_mg', 'potassium_mg', 'phosphorus_mg', 'protein_g', 'carb_g', 'sugar_g', 'satfat_g', 'fiber_g', 'vitk_ug']
  const sorted = [...checks].sort((a, b) => order.indexOf(a.nutrient) - order.indexOf(b.nutrient))
  return (
    <ul className="grid gap-3.5">
      {sorted.map((c, i) => {
        const top = c.max ?? c.min ?? c.value
        const scale = Math.max(top * 1.15, c.value * 1.05, 1)
        const pct = Math.min(100, (c.value / scale) * 100)
        const tone = STATUS_TONE[c.status]
        const barColor = tone === 'ok' ? 'bg-ok' : tone === 'limit' ? 'bg-limit' : 'bg-avoid'
        const digits = c.unit === 'g' ? 1 : 0
        return (
          <li key={c.nutrient} className="a-fade grid gap-1" style={stagger(i)}>
            <div className="flex items-baseline justify-between gap-2 text-sm">
              <span className="font-semibold">{mk(`n_${c.nutrient}`)}</span>
              <span className="tabular text-muted">
                <span className="font-semibold text-ink"><CountUp value={c.value} digits={digits} /></span>
                {c.max !== null && c.min !== null ? ` / ${t('limit_range', { min: num(c.min, digits), max: num(c.max, digits) })}`
                  : c.max !== null ? ` / ${t('limit_max')} ${num(c.max, digits)}` : c.min !== null ? ` / ${t('limit_min')} ${num(c.min, digits)}` : ''} {c.unit}
              </span>
            </div>
            <div className="relative h-2.5 rounded-full bg-ground" aria-hidden>
              <div className={cx('meter-fill absolute inset-y-0 left-0 rounded-full', barColor)}
                style={{ width: `${pct}%`, ...stagger(i) }} />
              {c.max !== null && <div className="absolute -inset-y-1 w-0.5 bg-ink/60" style={{ left: `${(c.max / scale) * 100}%` }} />}
              {c.min !== null && <div className="absolute -inset-y-1 w-0.5 bg-ink/35" style={{ left: `${(c.min / scale) * 100}%` }} />}
            </div>
            {c.status !== 'ok' && (
              <span className={cx('a-fade text-xs font-semibold', tone === 'avoid' ? 'text-avoid' : 'text-limit')}>{t(`st_${c.status}` as UIKey)}</span>
            )}
          </li>
        )
      })}
    </ul>
  )
}

export function MedicineTiming({ targets }: { targets: Targets }) {
  const { t, m } = useI18n()
  if (!targets.medicine_schedule.length) return null
  return (
    <Card className="grid gap-3 p-4">
      <h2 className="flex items-center gap-2 text-lg font-bold"><PillIcon className="text-leaf" />{t('medicines_today')}</h2>
      <ul className="a-stagger grid gap-3">
        {targets.medicine_schedule.map((s) => (
          <li key={s.medicine} className="grid gap-1">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <span className="font-semibold">{s.name}</span>
              <Chip tone="info">{m(s.timing)}</Chip>
            </div>
            {s.advice.map((a) => <p key={a.key ?? a.text} className="text-sm text-muted">{m(a)}</p>)}
          </li>
        ))}
      </ul>
      <p className="text-xs text-muted">{t('medicine_note')}</p>
    </Card>
  )
}

export function DrugAlerts({ targets }: { targets: Targets }) {
  const { t, m } = useI18n()
  if (!targets.alerts.length) return null
  return (
    <Notice tone="avoid">
      <p className="font-bold">{t('alerts_title')}</p>
      <ul className="mt-1 grid gap-1">
        {targets.alerts.map((a) => <li key={a.medicine + a.message.key}><span className="font-semibold">{a.medicine}:</span> {m(a.message)}</li>)}
      </ul>
    </Notice>
  )
}

export function GlucoseLogger({ day, meal, onSaved }: { day: string; meal: 'breakfast' | 'lunch' | 'dinner'; onSaved?: () => void }) {
  const { t } = useI18n()
  const [before, setBefore] = useState('')
  const [after, setAfter] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<unknown>(null)
  const [done, setDone] = useState(false)
  async function save() {
    setBusy(true)
    setErr(null)
    try {
      await api.logGlucose({ day, meal, before: Number(before), after: Number(after) })
      setDone(true)
      setBefore('')
      setAfter('')
      onSaved?.()
    } catch (e) {
      setErr(e)
    } finally {
      setBusy(false)
    }
  }
  const valid = Number(before) >= 40 && Number(before) <= 600 && Number(after) >= 40 && Number(after) <= 700
  return (
    <div className="grid gap-2">
      <div className="grid grid-cols-2 gap-2">
        <Field id={`gb-${meal}`} label={t('before_meal')}>
          <Input id={`gb-${meal}`} type="number" inputMode="numeric" value={before} onChange={(e) => { setBefore(e.target.value); setDone(false) }} />
        </Field>
        <Field id={`ga-${meal}`} label={t('after_meal')}>
          <Input id={`ga-${meal}`} type="number" inputMode="numeric" value={after} onChange={(e) => { setAfter(e.target.value); setDone(false) }} />
        </Field>
      </div>
      <ErrorBanner error={err} />
      {done && (
        <p className="a-pop flex items-center gap-1.5 text-sm font-medium text-ok" role="status">
          <CheckIcon width={16} height={16} />{t('reading_saved')}
        </p>
      )}
      <Button variant="secondary" onClick={save} busy={busy} disabled={!valid}>{t('save_reading')}</Button>
    </div>
  )
}
