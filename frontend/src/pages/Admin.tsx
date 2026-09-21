import { useMutation, useQuery } from '@tanstack/react-query'
import { useMemo, useState } from 'react'
import { api } from '../api/client'
import { Button, Card, Chip, ErrorBanner, Input, Notice, PageHeader, Spinner } from '../components/ui'
import { useI18n } from '../i18n/I18n'
import type { UIKey } from '../i18n/strings'

interface Overview {
  manifest: Record<string, unknown>
  counts: Record<string, number>
  coverage: Record<string, Record<string, number>>
  models: { M1: { chosen: string; scores: Record<string, { auc_mean: number; auc_sd: number }>; n_rows: number; dataset: string; limitations: string; features: string[] }; M2: { status: string } }
}

interface DishRow {
  id: string; name: string; slot: string; diet: string; zones: string[]; common: boolean; universal: boolean
  tags: string[]; nutrients: Record<string, number>; glycemic_load: number
}

export function Admin() {
  const { t, num } = useI18n()
  const ov = useQuery({ queryKey: ['admin-overview'], queryFn: () => api.adminOverview() as Promise<unknown> as Promise<Overview> })
  const dishes = useQuery({ queryKey: ['admin-dishes'], queryFn: () => api.adminDishes() as Promise<unknown> as Promise<DishRow[]> })
  const reload = useMutation({ mutationFn: api.adminReload, onSuccess: () => { ov.refetch(); dishes.refetch() } })
  const [q, setQ] = useState('')
  const rows = useMemo(() => (dishes.data ?? []).filter((d) => !q || d.name.toLowerCase().includes(q.toLowerCase()) || d.id.includes(q.toLowerCase())), [dishes.data, q])

  if (ov.isLoading) return <Spinner />
  if (ov.error) return <ErrorBanner error={ov.error} onRetry={() => ov.refetch()} />
  const o = ov.data!
  const counts: [UIKey, number][] = [
    ['foods_count', o.counts.foods], ['dishes_count', o.counts.dishes], ['medicines_count', o.counts.medicines],
    ['users_count', o.counts.users], ['plans_count', o.counts.plans], ['logs_count', o.counts.meal_logs],
  ]
  const slots = ['breakfast', 'staple', 'protein', 'veg', 'side', 'snack', 'sweet']
  const m1 = o.models.M1
  return (
    <>
      <PageHeader title={t('admin_title')}
        action={<Button variant="secondary" busy={reload.isPending} onClick={() => reload.mutate()}>{t('reload_data')}</Button>} />
      {reload.isSuccess && <div className="mb-4"><Notice tone="ok">{t('reloaded')}</Notice></div>}
      <ErrorBanner error={reload.error} />
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="grid content-start gap-2 p-4">
          <h2 className="text-lg font-bold">{t('admin_counts')}</h2>
          <dl className="grid gap-1">
            {counts.map(([k, v]) => (
              <div key={k} className="flex justify-between gap-3 border-b border-line py-1.5">
                <dt className="text-muted">{t(k)}</dt><dd className="font-semibold tabular">{num(v)}</dd>
              </div>
            ))}
          </dl>
          <p className="text-xs text-muted">Built {String(o.manifest.built_at ?? '')}</p>
        </Card>
        <Card className="grid content-start gap-2 p-4">
          <h2 className="text-lg font-bold">{t('model_title')}</h2>
          <p><span className="text-muted">{t('auc')}:</span> <span className="font-semibold tabular">{m1.scores[m1.chosen].auc_mean} ± {m1.scores[m1.chosen].auc_sd}</span> ({m1.chosen.replace('_', ' ')})</p>
          <p className="text-sm text-muted">{m1.dataset} · n = {m1.n_rows}</p>
          <p className="text-sm text-muted">{m1.features.join(', ')}</p>
          <p className="text-sm">{m1.limitations}</p>
          <p className="text-sm"><span className="font-semibold">M2:</span> {o.models.M2.status}</p>
        </Card>
        <Card className="grid content-start gap-2 p-4">
          <h2 className="text-lg font-bold">{t('coverage_title')}</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm tabular">
              <thead className="text-muted"><tr><th className="py-1 text-left font-semibold" />{slots.map((s) => <th key={s} className="px-1 font-semibold">{s.slice(0, 5)}</th>)}</tr></thead>
              <tbody>
                {Object.entries(o.coverage).sort().map(([z, c]) => (
                  <tr key={z} className="border-t border-line"><td className="py-1 font-semibold">{z}</td>{slots.map((s) => <td key={s} className="px-1 text-center">{c[s] ?? 0}</td>)}</tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
      <Card className="mt-4 grid gap-3 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-bold">{t('dish_table')} ({rows.length})</h2>
          <Input aria-label={t('search_dishes')} placeholder={t('search_dishes')} value={q} onChange={(e) => setQ(e.target.value)} className="max-w-xs" />
        </div>
        <div className="max-h-[36rem] overflow-auto">
          <table className="w-full min-w-[56rem] text-left text-sm tabular">
            <thead className="sticky top-0 bg-surface text-muted">
              <tr>{['Dish', 'Slot', 'Region', 'kcal', 'Protein g', 'Carb g', 'Na mg', 'K mg', 'P mg', 'Vit K µg', 'GL', 'Tags'].map((h) => <th key={h} className="py-2 pr-2 font-semibold">{h}</th>)}</tr>
            </thead>
            <tbody>
              {rows.map((d) => (
                <tr key={d.id} className="border-t border-line align-top">
                  <td className="py-1.5 pr-2 font-medium">{d.name}</td>
                  <td className="pr-2">{d.slot}</td>
                  <td className="pr-2">{d.universal ? 'universal' : d.common ? 'all-India' : d.zones.join(', ')}</td>
                  {(['energy_kcal', 'protein_g', 'carb_g', 'sodium_mg', 'potassium_mg', 'phosphorus_mg', 'vitk_ug'] as const).map((k) => (
                    <td key={k} className="pr-2 text-right">{num(d.nutrients[k], k.endsWith('_g') ? 1 : 0)}</td>
                  ))}
                  <td className="pr-2 text-right">{num(d.glycemic_load, 1)}</td>
                  <td className="flex flex-wrap gap-1 py-1">{d.tags.slice(0, 4).map((tg) => <Chip key={tg}>{tg}</Chip>)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  )
}
