import { useQuery } from '@tanstack/react-query'
import { api } from './api/client'

export const useMeta = () => useQuery({ queryKey: ['meta'], queryFn: api.meta, staleTime: Infinity, retry: 2 })
export const usePlan = () => useQuery({ queryKey: ['plan'], queryFn: api.currentPlan, staleTime: 30_000 })
export const useProfile = () => useQuery({ queryKey: ['profile'], queryFn: api.profile, staleTime: 30_000 })
export const useInsights = () => useQuery({ queryKey: ['insights'], queryFn: api.insights, staleTime: 30_000 })

export function formatDate(iso: string, lang: string, opts: Intl.DateTimeFormatOptions = { weekday: 'short', day: 'numeric', month: 'short' }): string {
  const [y, m, d] = iso.split('-').map(Number)
  const date = new Date(y, m - 1, d)
  const locale = lang === 'en' ? 'en-IN' : `${lang}-IN`
  return new Intl.DateTimeFormat(locale, opts).format(date)
}

export const MEALS = ['breakfast', 'lunch', 'snack', 'dinner'] as const
export type MealKey = typeof MEALS[number]
