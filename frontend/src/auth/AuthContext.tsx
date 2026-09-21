import { useQuery, useQueryClient } from '@tanstack/react-query'
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { api, getToken, setToken, setUnauthorizedHandler } from '../api/client'
import type { Lang, User } from '../api/types'
import { useI18n } from '../i18n/I18n'

interface AuthValue {
  user: User | null
  loading: boolean
  login: (email: string, password: string) => Promise<User>
  register: (name: string, email: string, password: string, language: Lang) => Promise<User>
  logout: () => void
  refresh: () => Promise<void>
  changeLanguage: (l: Lang) => void
}

const AuthContext = createContext<AuthValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient()
  const { setLang } = useI18n()
  const [token, setTok] = useState<string | null>(getToken)

  const me = useQuery({
    queryKey: ['me', token],
    queryFn: api.me,
    enabled: !!token,
    retry: false,
    staleTime: 60_000,
  })

  const logout = useCallback(() => {
    setToken(null)
    setTok(null)
    qc.clear()
  }, [qc])

  useEffect(() => {
    setUnauthorizedHandler(logout)
  }, [logout])

  // the account's saved language is applied when a user signs in
  const user = token ? (me.data ?? null) : null
  const userId = user?.id
  const userLang = user?.language
  useEffect(() => {
    if (userId && userLang) setLang(userLang)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId])

  const changeLanguage = useCallback((l: Lang) => {
    setLang(l)
    if (user && user.language !== l) {
      api.updateMe({ language: l }).then((u) => qc.setQueryData(['me', token], u)).catch(() => undefined)
    }
  }, [setLang, user, qc, token])

  const login = useCallback(async (email: string, password: string) => {
    const out = await api.login({ email, password })
    setToken(out.token)
    qc.setQueryData(['me', out.token], out.user)
    setTok(out.token)
    return out.user
  }, [qc])

  const register = useCallback(async (name: string, email: string, password: string, language: Lang) => {
    const out = await api.register({ name, email, password, language })
    setToken(out.token)
    qc.setQueryData(['me', out.token], out.user)
    setTok(out.token)
    return out.user
  }, [qc])

  const refresh = useCallback(async () => {
    await qc.invalidateQueries({ queryKey: ['me'] })
  }, [qc])

  const value = useMemo<AuthValue>(() => ({
    user,
    loading: !!token && me.isLoading,
    login, register, logout, refresh, changeLanguage,
  }), [user, token, me.isLoading, login, register, logout, refresh, changeLanguage])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth(): AuthValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth outside provider')
  return ctx
}
