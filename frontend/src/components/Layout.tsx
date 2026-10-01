import { useIsFetching } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import type { Lang } from '../api/types'
import { useAuth } from '../auth/AuthContext'
import { useI18n } from '../i18n/I18n'
import type { UIKey } from '../i18n/strings'
import { CalendarIcon, ChartIcon, PlateLogo, SearchIcon, ShieldIcon, SunIcon, UserIcon } from './icons'
import { cx } from './ui'

/** A thin progress bar across the top whenever the app is waiting on the API. */
function FetchBar() {
  const fetching = useIsFetching()
  const [width, setWidth] = useState(0)
  useEffect(() => {
    if (!fetching) { setWidth(100); const id = setTimeout(() => setWidth(0), 320); return () => clearTimeout(id) }
    setWidth(18)
    const id = setInterval(() => setWidth((w) => (w < 88 ? w + (90 - w) * 0.16 : w)), 240)
    return () => clearInterval(id)
  }, [fetching])
  return (
    <div aria-hidden className="pointer-events-none fixed inset-x-0 top-0 z-50 h-0.5">
      <div className="topbar h-full bg-leaf"
        style={{ width: `${width}%`, opacity: width === 0 || width === 100 ? 0 : 1 }} />
    </div>
  )
}

/** Lifts the header with a shadow once the page has scrolled. */
function useScrolled(px = 6): boolean {
  const [on, setOn] = useState(false)
  useEffect(() => {
    const h = () => setOn(window.scrollY > px)
    h()
    window.addEventListener('scroll', h, { passive: true })
    return () => window.removeEventListener('scroll', h)
  }, [px])
  return on
}

const LANGS: { id: Lang; label: string }[] = [
  { id: 'en', label: 'English' },
  { id: 'ta', label: 'தமிழ்' },
  { id: 'hi', label: 'हिंदी' },
]

export function LangSwitch() {
  const { lang, setLang } = useI18n()
  const { user, changeLanguage } = useAuth()
  return (
    <div role="group" aria-label="Language" className="flex rounded-[10px] border border-line bg-surface p-0.5">
      {LANGS.map((l) => (
        <button key={l.id} type="button" onClick={() => (user ? changeLanguage(l.id) : setLang(l.id))}
          aria-pressed={lang === l.id}
          className={cx('press min-h-10 rounded-[8px] px-2.5 text-sm font-semibold',
            'transition-[color,background-color] duration-[var(--dur-2)] ease-[var(--ease-out)]',
            lang === l.id ? 'bg-leaf text-white shadow-[0_4px_12px_-8px_rgb(21_33_29/0.8)]' : 'text-muted hover:bg-leaf-soft hover:text-leaf')}>
          {l.label}
        </button>
      ))}
    </div>
  )
}

const NAV: { to: string; key: UIKey; Icon: typeof SunIcon }[] = [
  { to: '/today', key: 'nav_today', Icon: SunIcon },
  { to: '/week', key: 'nav_week', Icon: CalendarIcon },
  { to: '/check', key: 'nav_check', Icon: SearchIcon },
  { to: '/progress', key: 'nav_progress', Icon: ChartIcon },
  { to: '/profile', key: 'nav_profile', Icon: UserIcon },
]

export function Brand() {
  const { t } = useI18n()
  return (
    <span className="group flex items-center gap-2">
      <PlateLogo className="transition-transform duration-[var(--dur-4)] ease-[var(--ease-spring)] group-hover:rotate-[18deg]" />
      <span className="font-display text-[1.35rem] font-bold tracking-tight text-leaf-dark">{t('app_name')}</span>
    </span>
  )
}

export function AppLayout() {
  const { t } = useI18n()
  const { user } = useAuth()
  const loc = useLocation()
  const scrolled = useScrolled()
  const items = user?.role === 'admin' ? [...NAV, { to: '/admin', key: 'nav_admin' as UIKey, Icon: ShieldIcon }] : NAV
  return (
    <div className="min-h-dvh">
      <FetchBar />
      <header className={cx('sticky top-0 z-20 border-b bg-surface/90 backdrop-blur-md',
        'transition-[box-shadow,border-color,background-color] duration-[var(--dur-3)] ease-[var(--ease-out)]',
        scrolled ? 'border-line shadow-[0_8px_24px_-20px_rgb(21_33_29/0.9)]' : 'border-transparent')}
        style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}>
        <div className="mx-auto flex max-w-6xl items-center gap-4 px-4 py-2.5">
          <NavLink to="/today" aria-label={t('nav_today')}><Brand /></NavLink>
          <nav className="ml-4 hidden flex-1 items-center gap-1 md:flex" aria-label="Main">
            {items.map(({ to, key, Icon }, i) => (
              <NavLink key={to} to={to} style={{ ['--i' as string]: i }}
                className={({ isActive }) => cx('navlink a-fade flex min-h-11 items-center gap-2 rounded-[10px] px-3 font-semibold',
                  isActive ? 'bg-leaf-soft text-leaf-dark' : 'text-muted hover:bg-leaf-soft/50 hover:text-leaf')}>
                <Icon width={20} height={20} />{t(key)}
              </NavLink>
            ))}
          </nav>
          <div className="ml-auto md:ml-0"><LangSwitch /></div>
        </div>
      </header>

      <main className="pb-safe mx-auto max-w-6xl px-4">
        {/* Keying on the path replays the entrance animation on every route change. */}
        <div key={loc.pathname} className="a-slide">
          <Outlet />
        </div>
        <p className="mt-10 border-t border-line pt-4 text-sm text-muted">{t('disclaimer')}</p>
      </main>

      <nav aria-label="Main" className="fixed inset-x-0 bottom-0 z-20 grid border-t border-line bg-surface/95 backdrop-blur-md md:hidden"
        style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))`, paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}>
        {items.map(({ to, key, Icon }) => (
          <NavLink key={to} to={to} className={({ isActive }) => cx('navtab press relative flex min-h-16 flex-col items-center justify-center gap-0.5 px-1 text-[0.72rem] font-semibold leading-tight',
            'transition-colors duration-[var(--dur-2)]', isActive ? 'text-leaf' : 'text-muted')}>
            {({ isActive }) => (
              <>
                {isActive && <span aria-hidden className="a-pop absolute inset-x-3 top-1.5 h-1 rounded-full bg-leaf" />}
                <Icon />
                <span className="text-center">{t(key)}</span>
              </>
            )}
          </NavLink>
        ))}
      </nav>
    </div>
  )
}

export function PublicLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-dvh">
      <FetchBar />
      <header className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-4">
        <NavLink to="/"><Brand /></NavLink>
        <LangSwitch />
      </header>
      <main className="mx-auto max-w-6xl px-4 pb-12">{children}</main>
    </div>
  )
}
