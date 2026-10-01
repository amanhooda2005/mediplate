import { useMutation, useQuery } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { api } from '../api/client'
import type { CheckOut, SearchResult } from '../api/types'
import { AlertIcon, CheckIcon, InfoIcon, SearchIcon, XIcon } from '../components/icons'
import { GlChip } from '../components/PlanParts'
import { Button, Card, Chip, ErrorBanner, Field, Input, PageHeader, Select, Skeleton, Spinner, Verdict, cx, stagger } from '../components/ui'
import { useI18n } from '../i18n/I18n'

function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value)
  useEffect(() => {
    const id = setTimeout(() => setV(value), ms)
    return () => clearTimeout(id)
  }, [value, ms])
  return v
}

export function FoodCheck() {
  const { t, dishName } = useI18n()
  const [q, setQ] = useState('')
  const dq = useDebounced(q.trim(), 250)
  const [picked, setPicked] = useState<SearchResult | null>(null)
  const [portion, setPortion] = useState(1)
  const [grams, setGrams] = useState(100)

  const search = useQuery({ queryKey: ['search', dq], queryFn: () => api.search(dq), enabled: dq.length >= 2 })
  const check = useMutation({ mutationFn: api.check })

  useEffect(() => {
    if (!picked) return
    check.mutate(picked.type === 'dish' ? { item_type: 'dish', id: picked.id, portion } : { item_type: 'food', id: picked.id, grams })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [picked, portion, grams])

  return (
    <>
      <PageHeader title={t('check_title')} sub={t('check_help')} />
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
        <Card className="grid content-start gap-3 p-4">
          <label htmlFor="food-search" className="sr-only">{t('check_title')}</label>
          <div className="relative">
            <SearchIcon className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
            <Input id="food-search" type="search" autoComplete="off" placeholder={t('search_placeholder')} value={q}
              onChange={(e) => setQ(e.target.value)} className="pl-11 text-[1.05rem]" />
          </div>
          {dq.length < 2 && <p className="text-sm text-muted">{t('try_search')}</p>}
          {search.isFetching && !search.data && <div className="py-2"><Skeleton className="h-11" lines={4} /></div>}
          <ErrorBanner error={search.error} />
          {search.data && search.data.length === 0 && <p className="a-fade text-muted">{t('no_results')}</p>}
          {search.data && search.data.length > 0 && (
            <ul className={cx('grid max-h-[32rem] gap-1 overflow-y-auto transition-opacity duration-[var(--dur-2)]',
              search.isFetching && 'opacity-60')}>
              {search.data.map((r, i) => (
                <li key={`${r.type}-${r.id}`} className="a-fade" style={stagger(Math.min(i, 8))}>
                  <button type="button" onClick={() => { setPicked(r); setPortion(1); setGrams(100) }}
                    className={cx('flex min-h-12 w-full items-center justify-between gap-3 rounded-[10px] px-3 py-2 text-left',
                      'transition-[background-color,transform] duration-[var(--dur-1)] ease-[var(--ease-out)] active:scale-[0.99]',
                      picked?.id === r.id && picked.type === r.type ? 'bg-leaf-soft' : 'hover:bg-ground')}>
                    <span className="grid">
                      <span className="font-semibold">{r.type === 'dish' ? dishName({ name: r.name, name_ta: r.name_ta, name_hi: r.name_hi }) : r.name}</span>
                      {r.type === 'food' && r.local_names && <span className="line-clamp-1 text-xs text-muted">{r.local_names}</span>}
                    </span>
                    <Chip tone={r.type === 'dish' ? 'leaf' : 'neutral'}>{r.type === 'dish' ? t('dish_label') : t('food_label')}</Chip>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <div className="grid content-start gap-4">
          {picked && (
            <Card className="a-rise grid gap-3 p-4">
              {picked.type === 'dish' ? (
                <Field id="portion" label={t('portion')}>
                  <Select id="portion" value={portion} onChange={(e) => setPortion(Number(e.target.value))} className="max-w-48">
                    {[0.5, 0.75, 1, 1.25, 1.5, 2].map((p) => <option key={p} value={p}>{p}×</option>)}
                  </Select>
                </Field>
              ) : (
                <Field id="grams" label={t('grams')}>
                  <Input id="grams" type="number" min={1} max={2000} value={grams} className="max-w-48"
                    onChange={(e) => setGrams(Math.max(1, Math.min(2000, Number(e.target.value) || 100)))} />
                </Field>
              )}
            </Card>
          )}
          {check.isPending && <Spinner />}
          <ErrorBanner error={check.error} />
          {check.data && !check.isPending && (
            <div key={`${check.data.item_type}-${check.data.name}-${check.data.portion}`}><CheckResult r={check.data} /></div>
          )}
        </div>
      </div>
    </>
  )
}

function CheckResult({ r }: { r: CheckOut }) {
  const { t, m, dishName, num, lang } = useI18n()
  const order = ['energy_kcal', 'protein_g', 'carb_g', 'sugar_g', 'fat_g', 'satfat_g', 'fiber_g', 'sodium_mg', 'potassium_mg', 'phosphorus_mg', 'vitk_ug']
  const unit = (k: string) => k === 'energy_kcal' ? 'kcal' : k === 'vitk_ug' ? 'µg' : k.endsWith('_g') ? 'g' : 'mg'
  const { mk } = useI18n()
  return (
    <Card className="a-rise grid gap-4 p-5" as="article">
      <div className="grid gap-2">
        <h2 className="text-[1.6rem] font-bold">{dishName(r)}</h2>
        {lang !== 'en' && r.item_type === 'dish' && <p className="text-muted">{r.name}</p>}
        <div className="flex flex-wrap items-center gap-2">
          <Verdict verdict={r.verdict} label={m(r.verdict_message)} />
          {r.glycemic && <GlChip g={r.glycemic} />}
          <span className="text-sm text-muted">{t('serving')}: {r.serving_g} g</span>
        </div>
      </div>

      {r.alerts.length > 0 && (
        <ul className="a-stagger grid gap-2">
          {r.alerts.map((a) => {
            const Icon = a.severity === 'avoid' ? XIcon : a.severity === 'limit' ? AlertIcon : InfoIcon
            const tone = a.severity === 'avoid' ? 'border-avoid/30 bg-avoid-soft' : a.severity === 'limit' ? 'border-limit/30 bg-limit-soft' : 'border-line bg-ground'
            const ic = a.severity === 'avoid' ? 'text-avoid' : a.severity === 'limit' ? 'text-limit' : 'text-info'
            return (
              <li key={a.category} className={cx('flex items-start gap-3 rounded-[10px] border px-3.5 py-3', tone)}>
                <Icon className={cx('mt-0.5 shrink-0', ic)} />
                <div className="grid gap-0.5">
                  <span>{m(a.message)}</span>
                  <span className="text-xs text-muted">{t('because_of')}: {a.source_labels.map((s) => m(s)).join(', ')}</span>
                </div>
              </li>
            )
          })}
        </ul>
      )}
      {r.alerts.length === 0 && (
        <p className="flex items-center gap-2 text-ok"><CheckIcon />{m(r.verdict_message)}</p>
      )}

      <div className="grid gap-2">
        <h3 className="font-bold">{t('per_serving')}</h3>
        <dl className="grid grid-cols-2 gap-x-6 gap-y-1.5 sm:grid-cols-3">
          {order.filter((k) => k in r.nutrients).map((k) => (
            <div key={k} className="flex justify-between gap-2 border-b border-line py-1 text-sm">
              <dt className="text-muted">{mk(`n_${k}`)}</dt>
              <dd className="font-semibold tabular">{num(r.nutrients[k], unit(k) === 'g' ? 1 : 0)} {unit(k)}</dd>
            </div>
          ))}
        </dl>
      </div>
      {r.item_type === 'dish' && r.ingredients.length > 0 && (
        <details className="text-sm">
          <summary className="cursor-pointer font-semibold text-leaf">{t('ingredients')}</summary>
          <ul className="mt-2 grid gap-0.5 text-muted sm:grid-cols-2">
            {r.ingredients.map((i) => <li key={i.code}>{i.name}: {Math.round(i.grams * r.portion)} g</li>)}
          </ul>
        </details>
      )}
      <Button variant="ghost" className="justify-self-start" onClick={() => document.getElementById('food-search')?.focus()}>{t('check_again')}</Button>
    </Card>
  )
}
