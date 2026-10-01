import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import type { FormEvent } from 'react'
import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { api, todayISO } from '../api/client'
import type { Series } from '../api/types'
import { Button, Card, CountUp, Empty, ErrorBanner, Field, Input, Notice, PageHeader, Reveal, Select, stagger } from '../components/ui'
import { formatDate, useInsights, useMeta } from '../hooks'
import { useI18n } from '../i18n/I18n'
import type { UIKey } from '../i18n/strings'

// Validated with the dataviz palette checker (lightness, chroma, CVD and normal-vision separation all pass).
const SERIES = ['#1A7F5A', '#7E4CC2']
const INK_MUTED = '#56655F'
const GRID = '#E3EAE6'

interface ChartSpec {
  title: UIKey
  lines: { kind: string; label: UIKey }[]
  refs?: { y: number; label: string }[]
  digits?: number
}

const CHARTS: ChartSpec[] = [
  { title: 'ch_weight', lines: [{ kind: 'weight', label: 'lab_weight' }], digits: 1 },
  { title: 'ch_bp', lines: [{ kind: 'sbp', label: 'lab_sbp' }, { kind: 'dbp', label: 'lab_dbp' }], refs: [{ y: 130, label: '130' }, { y: 80, label: '80' }] },
  { title: 'ch_sugar', lines: [{ kind: 'fasting_glucose', label: 'lab_fasting_glucose' }], refs: [{ y: 100, label: '100' }] },
  { title: 'lab_hba1c', lines: [{ kind: 'hba1c', label: 'lab_hba1c' }], refs: [{ y: 7, label: '7%' }], digits: 1 },
  { title: 'ch_kidney', lines: [{ kind: 'egfr', label: 'lab_egfr' }], refs: [{ y: 60, label: '60' }] },
  { title: 'ch_potassium', lines: [{ kind: 'potassium', label: 'lab_potassium' }], refs: [{ y: 5, label: '5.0' }], digits: 1 },
]

function TrendChart({ spec, series }: { spec: ChartSpec; series: Series }) {
  const { t, lang, num } = useI18n()
  const dates = [...new Set(spec.lines.flatMap((l) => (series[l.kind] ?? []).map((p) => p.date)))].sort()
  if (!dates.length) return null
  const rows = dates.map((d) => {
    const row: Record<string, string | number | null> = { date: d }
    for (const l of spec.lines) row[l.kind] = series[l.kind]?.find((p) => p.date === d)?.value ?? null
    return row
  })
  const multi = spec.lines.length > 1
  return (
    <Card className="grid gap-2 p-4" as="article">
      <h3 className="font-bold">{t(spec.title)}</h3>
      {multi && (
        <ul className="flex flex-wrap gap-4 text-sm text-muted" aria-label="Legend">
          {spec.lines.map((l, i) => (
            <li key={l.kind} className="flex items-center gap-2">
              <span className="inline-block h-0.5 w-5 rounded" style={{ background: SERIES[i] }} />{t(l.label)}
            </li>
          ))}
        </ul>
      )}
      <div className="h-48" role="img" aria-label={`${t(spec.title)}: ${rows.length}`}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={rows} margin={{ top: 8, right: multi ? 56 : 16, bottom: 0, left: -8 }}>
            <CartesianGrid stroke={GRID} vertical={false} />
            <XAxis dataKey="date" tickFormatter={(d: string) => formatDate(d, lang, { day: 'numeric', month: 'short' })}
              tick={{ fill: INK_MUTED, fontSize: 12 }} axisLine={{ stroke: GRID }} tickLine={false} minTickGap={24} />
            <YAxis tick={{ fill: INK_MUTED, fontSize: 12 }} axisLine={false} tickLine={false} width={48}
              domain={['auto', 'auto']} allowDecimals={Boolean(spec.digits)} />
            {spec.refs?.map((r) => (
              <ReferenceLine key={r.y} y={r.y} stroke={INK_MUTED} strokeDasharray="4 4" strokeOpacity={0.6}
                label={{ value: r.label, position: 'insideTopRight', fill: INK_MUTED, fontSize: 11 }} />
            ))}
            <Tooltip
              formatter={(v, name) => [num(Number(v), spec.digits ?? 0), t(spec.lines.find((l) => l.kind === name)?.label ?? spec.title)]}
              labelFormatter={(d) => formatDate(String(d), lang, { day: 'numeric', month: 'long', year: 'numeric' })}
              contentStyle={{ borderRadius: 10, borderColor: '#D6E0DB', fontSize: 14 }} />
            {spec.lines.map((l, i) => (
              <Line key={l.kind} type="monotone" dataKey={l.kind} stroke={SERIES[i]} strokeWidth={2} connectNulls
                dot={{ r: 4, strokeWidth: 2, stroke: '#fff', fill: SERIES[i] }} activeDot={{ r: 6 }}
                isAnimationActive animationDuration={700} animationBegin={i * 120} animationEasing="ease-out"
                label={multi ? ({ x, y, index }: { x?: number | string; y?: number | string; index?: number }) =>
                  index === rows.length - 1 && x !== undefined && y !== undefined ? (
                    <text x={Number(x) + 8} y={Number(y) + 4} fontSize={12} fill={INK_MUTED}>{t(l.label).split(' ')[0]}</text>
                  ) : <g /> : undefined} />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </Card>
  )
}

/** Adherence as a ring that draws itself, with the number counting up beside it. */
function AdherenceRing({ rate }: { rate: number }) {
  const r = 34
  const c = 2 * Math.PI * r
  return (
    <div className="flex items-center gap-4">
      <svg width={92} height={92} viewBox="0 0 92 92" aria-hidden className="shrink-0">
        <circle cx={46} cy={46} r={r} fill="none" stroke="var(--color-ground)" strokeWidth={9} />
        <circle cx={46} cy={46} r={r} fill="none" stroke="var(--color-leaf)" strokeWidth={9} strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={c * (1 - rate)} transform="rotate(-90 46 46)"
          className="draw" style={{ ['--dash' as string]: c, transition: 'stroke-dashoffset var(--dur-4) var(--ease-out)' }} />
      </svg>
      <div className="grid">
        <span className="font-display text-4xl font-bold tabular text-leaf-dark">
          <CountUp value={Math.round(rate * 100)} duration={900} />%
        </span>
      </div>
    </div>
  )
}

export function Progress() {
  const { t, m, num, lang } = useI18n()
  const meta = useMeta()
  const qc = useQueryClient()
  const series = useQuery({ queryKey: ['series'], queryFn: api.series })
  const labs = useQuery({ queryKey: ['labs'], queryFn: api.labs })
  const adherence = useQuery({ queryKey: ['adherence'], queryFn: api.adherence })
  const insights = useInsights()
  const [kind, setKind] = useState('weight')
  const [value, setValue] = useState('')
  const [date, setDate] = useState(todayISO())
  const [saved, setSaved] = useState(false)

  const refresh = () => {
    for (const k of ['series', 'labs', 'insights', 'profile']) qc.invalidateQueries({ queryKey: [k] })
  }
  const add = useMutation({
    mutationFn: api.addLab,
    onSuccess: () => { setValue(''); setSaved(true); refresh() },
  })
  const del = useMutation({ mutationFn: api.deleteLab, onSuccess: refresh })

  const labMeta = meta.data?.labs.find((l) => l.kind === kind)
  const v = Number(value)
  const valid = value !== '' && labMeta !== undefined && v >= labMeta.min && v <= labMeta.max

  function submit(e: FormEvent) {
    e.preventDefault()
    if (!valid) return
    setSaved(false)
    add.mutate({ kind, value: v, taken_on: date })
  }

  const charts = series.data ? CHARTS.filter((c) => c.lines.some((l) => (series.data![l.kind] ?? []).length > 0)) : []
  const rate = adherence.data?.rate

  return (
    <>
      <PageHeader title={t('progress_title')} />
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="grid content-start gap-4">
          {insights.data && insights.data.insights.length > 0 && (
            <Card className="grid gap-2 p-4">
              <h2 className="text-lg font-bold">{t('insights_title')}</h2>
              <ul className="grid gap-2">
                {insights.data.insights.map((i) => (
                  <li key={i.id}>
                    <Notice tone={i.severity === 'urgent' ? 'avoid' : i.severity === 'warning' ? 'limit' : 'info'}>{m(i.message)}</Notice>
                  </li>
                ))}
              </ul>
            </Card>
          )}
          {series.isLoading && (
            <div className="grid gap-4 md:grid-cols-2">
              {[0, 1].map((i) => (
                <div key={i} className="rounded-[var(--radius-card)] border border-line bg-surface p-4">
                  <div className="skeleton mb-3 h-5 w-28" /><div className="skeleton h-40 w-full" />
                </div>
              ))}
            </div>
          )}
          <ErrorBanner error={series.error} onRetry={() => series.refetch()} />
          {series.data && charts.length === 0 && <Empty>{t('no_data')}</Empty>}
          <div className="grid gap-4 md:grid-cols-2">
            {charts.map((c, i) => (
              <Reveal key={c.title} delay={i * 70}><TrendChart spec={c} series={series.data!} /></Reveal>
            ))}
          </div>
          {labs.data && labs.data.length > 0 && (
            <Card className="grid gap-2 p-4">
              <h2 className="text-lg font-bold">{t('history')}</h2>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[26rem] text-left text-sm">
                  <thead className="text-muted">
                    <tr><th className="py-2 font-semibold">{t('date')}</th><th className="font-semibold">{t('test')}</th><th className="text-right font-semibold">{t('value')}</th><th /></tr>
                  </thead>
                  <tbody className="tabular">
                    {labs.data.map((r, i) => (
                      <tr key={r.id} className="a-fade border-t border-line transition-colors duration-[var(--dur-1)] hover:bg-ground"
                        style={stagger(Math.min(i, 8))}>
                        <td className="py-2">{formatDate(r.taken_on, lang, { day: 'numeric', month: 'short', year: 'numeric' })}</td>
                        <td>{t(`lab_${r.kind}` as UIKey)}</td>
                        <td className="text-right font-semibold">{num(r.value, 1)} <span className="font-normal text-muted">{r.unit}</span></td>
                        <td className="text-right">
                          <button type="button" className="min-h-10 px-2 font-semibold text-avoid hover:underline"
                            onClick={() => del.mutate(r.id)}>{t('delete')}</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}
        </div>

        <aside className="grid content-start gap-4">
          <Card className="grid gap-3 p-4">
            <h2 className="text-lg font-bold">{t('add_result')}</h2>
            <form onSubmit={submit} className="grid gap-3">
              <Field id="lab-kind" label={t('test')}>
                <Select id="lab-kind" value={kind} onChange={(e) => { setKind(e.target.value); setSaved(false) }}>
                  {meta.data?.labs.map((l) => <option key={l.kind} value={l.kind}>{t(`lab_${l.kind}` as UIKey)} ({l.unit})</option>)}
                </Select>
              </Field>
              <Field id="lab-value" label={t('value')} hint={labMeta ? `${labMeta.min} – ${labMeta.max} ${labMeta.unit}` : undefined}>
                <Input id="lab-value" type="number" inputMode="decimal" step="any" value={value} onChange={(e) => setValue(e.target.value)} />
              </Field>
              <Field id="lab-date" label={t('date')}>
                <Input id="lab-date" type="date" max={todayISO()} value={date} onChange={(e) => setDate(e.target.value)} />
              </Field>
              <ErrorBanner error={add.error} />
              {saved && <p className="a-pop text-sm font-medium text-ok" role="status">{t('result_saved')}</p>}
              <Button type="submit" busy={add.isPending} disabled={!valid}>{t('add')}</Button>
            </form>
          </Card>
          <Card className="grid gap-2 p-4">
            <h2 className="text-lg font-bold">{t('adherence')}</h2>
            {rate === null || rate === undefined ? <p className="text-muted">{t('adherence_none')}</p> : <AdherenceRing rate={rate} />}
          </Card>
          {adherence.data && adherence.data.readings.length > 0 && (
            <Card className="grid gap-2 p-4">
              <h2 className="text-lg font-bold">{t('readings_title')}</h2>
              <ul className="grid gap-1 text-sm tabular">
                {adherence.data.readings.slice(-8).map((r) => (
                  <li key={r.id} className="flex justify-between border-b border-line py-1">
                    <span>{formatDate(r.day, lang)} · {t(`meal_${r.slot.replace('_glucose', '')}` as UIKey)}</span>
                    <span className="font-semibold">{r.glucose_before} → {r.glucose_after} mg/dL</span>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </aside>
      </div>
    </>
  )
}
