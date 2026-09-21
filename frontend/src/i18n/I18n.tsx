import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import type { Lang, Meta, Msg } from '../api/types'
import { strings } from './strings'
import type { UIKey } from './strings'

const LANG_KEY = 'mediplate.lang'

interface I18nValue {
  lang: Lang
  setLang: (l: Lang) => void
  t: (key: UIKey, params?: Record<string, string | number>) => string
  m: (msg: Msg | null | undefined) => string
  mk: (key: string, params?: Record<string, string | number>) => string
  dishName: (d: { name: string; name_ta?: string; name_hi?: string }) => string
  num: (n: number, digits?: number) => string
  setMessages: (messages: Meta['messages']) => void
}

const I18nContext = createContext<I18nValue | null>(null)

function fill(text: string, params: Record<string, string | number> | undefined,
  resolve: (key: string) => string): string {
  if (!params) return text
  return text.replace(/\{(\w+)\}/g, (whole, name: string) => {
    const v = params[name]
    if (v === undefined) return whole
    if (typeof v === 'string' && v.startsWith('@')) return resolve(v.slice(1))
    return String(v)
  })
}

function readLang(): Lang {
  try {
    const v = localStorage.getItem(LANG_KEY)
    if (v === 'en' || v === 'ta' || v === 'hi') return v
  } catch {
    /* ignore */
  }
  return 'en'
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(readLang)
  const [messages, setMessages] = useState<Meta['messages']>({})

  useEffect(() => {
    document.documentElement.lang = lang
  }, [lang])

  const setLang = useCallback((l: Lang) => {
    setLangState(l)
    try {
      localStorage.setItem(LANG_KEY, l)
    } catch {
      /* ignore */
    }
  }, [])

  const mk = useCallback((key: string, params?: Record<string, string | number>): string => {
    const entry = messages[key]
    const text = entry ? (entry[lang] || entry.en) : key
    return fill(text, params, (k) => mk(k)).trim()
  }, [messages, lang])

  const value = useMemo<I18nValue>(() => ({
    lang,
    setLang,
    setMessages,
    t: (key, params) => fill(strings[lang][key] ?? strings.en[key], params, (k) => mk(k)),
    mk,
    m: (msg) => {
      if (!msg) return ''
      if (msg.key && messages[msg.key]) return mk(msg.key, msg.params)
      return msg.text
    },
    dishName: (d) => (lang === 'ta' && d.name_ta) ? d.name_ta : (lang === 'hi' && d.name_hi) ? d.name_hi : d.name,
    num: (n, digits = 0) => new Intl.NumberFormat(lang === 'en' ? 'en-IN' : `${lang}-IN`, {
      maximumFractionDigits: digits, minimumFractionDigits: 0,
    }).format(n),
  }), [lang, setLang, mk, messages])

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useI18n(): I18nValue {
  const ctx = useContext(I18nContext)
  if (!ctx) throw new Error('useI18n outside provider')
  return ctx
}
