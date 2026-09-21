import type {
  Adherence, CheckOut, InsightsOut, LabRow, MealLog, Meta, Plan, ProfileData, ProfileOut, SearchResult, Series,
  TokenOut, User,
} from './types'

const TOKEN_KEY = 'mediplate.token'

export class ApiError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

export function getToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY)
  } catch {
    return null
  }
}

export function setToken(token: string | null): void {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token)
    else localStorage.removeItem(TOKEN_KEY)
  } catch {
    /* storage unavailable: the session lasts until the tab closes */
  }
}

let onUnauthorized: (() => void) | null = null
export function setUnauthorizedHandler(fn: () => void): void {
  onUnauthorized = fn
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = { Accept: 'application/json' }
  const token = getToken()
  if (token) headers.Authorization = `Bearer ${token}`
  if (body !== undefined) headers['Content-Type'] = 'application/json'
  let res: Response
  try {
    res = await fetch(path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) })
  } catch {
    throw new ApiError(0, 'network')
  }
  if (res.status === 204) return undefined as T
  let data: unknown = null
  const text = await res.text()
  if (text) {
    try {
      data = JSON.parse(text)
    } catch {
      data = null
    }
  }
  if (!res.ok) {
    if (res.status === 401 && token && onUnauthorized) onUnauthorized()
    const detail = (data as { detail?: unknown } | null)?.detail
    throw new ApiError(res.status, typeof detail === 'string' ? detail : `HTTP ${res.status}`)
  }
  return data as T
}

export const api = {
  meta: () => request<Meta>('GET', '/api/meta'),
  register: (b: { name: string; email: string; password: string; language: string }) =>
    request<TokenOut>('POST', '/api/auth/register', b),
  login: (b: { email: string; password: string }) => request<TokenOut>('POST', '/api/auth/login', b),
  me: () => request<User>('GET', '/api/auth/me'),
  updateMe: (b: { name?: string; language?: string }) => request<User>('PUT', '/api/auth/me', b),

  profile: () => request<ProfileOut>('GET', '/api/profile'),
  saveProfile: (b: ProfileData & { labs: Record<string, number> }) => request<ProfileOut>('PUT', '/api/profile', b),

  currentPlan: () => request<Plan | null>('GET', '/api/plans/current'),
  generatePlan: (b: { start?: string; days?: number } = {}) => request<Plan>('POST', '/api/plans/generate', b),
  swap: (b: { day_index: number; slot: string }) => request<Plan>('POST', '/api/plans/current/swap', b),
  insights: () => request<InsightsOut>('GET', '/api/insights'),

  search: (q: string) => request<SearchResult[]>('GET', `/api/foods/search?q=${encodeURIComponent(q)}`),
  check: (b: { item_type: 'dish' | 'food'; id: string; grams?: number; portion?: number }) =>
    request<CheckOut>('POST', '/api/foods/check', b),

  logMeal: (b: { day: string; slot: string; dish_id: string; portion: number; status: string; rating: number }) =>
    request<MealLog>('POST', '/api/logs/meals', b),
  logGlucose: (b: { day: string; meal: string; before: number; after: number }) =>
    request<MealLog>('POST', '/api/logs/glucose', b),
  mealLogs: (start?: string, end?: string) => {
    const qs = new URLSearchParams()
    if (start) qs.set('start', start)
    if (end) qs.set('end', end)
    return request<MealLog[]>('GET', `/api/logs/meals?${qs.toString()}`)
  },
  adherence: () => request<Adherence>('GET', '/api/logs/adherence'),

  addLab: (b: { kind: string; value: number; taken_on?: string }) => request<LabRow>('POST', '/api/labs', b),
  labs: () => request<LabRow[]>('GET', '/api/labs'),
  deleteLab: (id: number) => request<void>('DELETE', `/api/labs/${id}`),
  series: () => request<Series>('GET', '/api/labs/series'),

  adminOverview: () => request<Record<string, unknown>>('GET', '/api/admin/overview'),
  adminDishes: () => request<Record<string, unknown>[]>('GET', '/api/admin/dishes'),
  adminRules: () => request<Record<string, unknown>>('GET', '/api/admin/rules'),
  adminReload: () => request<Record<string, unknown>>('POST', '/api/admin/reload'),
}

export function todayISO(): string {
  const d = new Date()
  const off = d.getTimezoneOffset()
  return new Date(d.getTime() - off * 60000).toISOString().slice(0, 10)
}
