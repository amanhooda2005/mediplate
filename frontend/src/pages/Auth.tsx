import { useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { LeafIcon, PillIcon, PinIcon } from '../components/icons'
import { PublicLayout } from '../components/Layout'
import { Button, Card, ErrorBanner, Field, Input, Reveal, stagger } from '../components/ui'
import { useI18n } from '../i18n/I18n'

export function Landing() {
  const { t } = useI18n()
  const points = [
    { Icon: PillIcon, title: t('landing_p1_t'), body: t('landing_p1') },
    { Icon: PinIcon, title: t('landing_p2_t'), body: t('landing_p2') },
    { Icon: LeafIcon, title: t('landing_p3_t'), body: t('landing_p3') },
  ]
  return (
    <PublicLayout>
      <section className="grid gap-8 py-8 md:grid-cols-[1.25fr_1fr] md:items-center md:py-14">
        <div className="grid gap-5">
          <h1 className="a-rise text-[2.3rem] font-bold leading-[1.08] sm:text-[3.1rem]">{t('landing_title')}</h1>
          <p className="a-rise max-w-[58ch] text-[1.1rem] text-muted" style={stagger(1)}>{t('landing_body')}</p>
          <div className="a-rise flex flex-wrap gap-3" style={stagger(2)}>
            <Link to="/register"><Button>{t('get_started')}</Button></Link>
            <Link to="/login"><Button variant="secondary">{t('sign_in')}</Button></Link>
          </div>
        </div>
        <PlatePreview />
      </section>
      <section className="grid gap-3 sm:grid-cols-3">
        {points.map(({ Icon, title, body }, i) => (
          <Reveal key={title} delay={i * 90}>
            <Card className="grid h-full gap-2 p-5" hover>
              <Icon className="text-leaf" width={26} height={26} />
              <h2 className="text-lg font-bold">{title}</h2>
              <p className="text-muted">{body}</p>
            </Card>
          </Reveal>
        ))}
      </section>
      <p className="mt-10 text-sm text-muted">{t('disclaimer')}</p>
    </PublicLayout>
  )
}

/**
 * The idea in one picture: four conditions are drawn in, their arrows trace
 * across, and the safe plate lands last. Purely decorative, so it is hidden
 * from assistive technology beyond its label.
 */
function PlatePreview() {
  const { mk } = useI18n()
  const conds = ['d_diabetes', 'd_hypertension', 'd_ckd', 'd_arthritis']
  return (
    <figure className="a-rise m-0 rounded-[var(--radius-card)] border border-line bg-surface p-5" style={stagger(1)}>
      <svg viewBox="0 0 320 230" role="img" aria-label="Four conditions feed one safe plate" className="w-full">
        {conds.map((c, i) => (
          <g key={c}>
            <g className="a-slide" style={{ ...stagger(i), animationDuration: '520ms' }}>
              <rect x={8} y={14 + i * 52} width={128} height={38} rx={10} fill="#E1EFE9" stroke="#1E6B52" strokeOpacity={0.35} />
              <text x={72} y={38 + i * 52} textAnchor="middle" fontSize={12.5} fill="#155240" fontWeight={600}>{mk(c)}</text>
            </g>
            <path d={`M136 ${33 + i * 52} C 175 ${33 + i * 52}, 180 115, 214 115`} stroke="#1E6B52" strokeOpacity={0.45}
              strokeWidth={2} fill="none" className="draw" pathLength={100}
              strokeDasharray={100} style={{ ...stagger(i + 2), ['--dash' as string]: 100 }} />
          </g>
        ))}
        <g className="a-pop" style={{ transformOrigin: '262px 115px', transformBox: 'view-box', animationDelay: '620ms' }}>
          <g className="float" style={{ animationDelay: '900ms' }}>
            <circle cx={262} cy={115} r={50} fill="#fff" stroke="#1E6B52" strokeWidth={3} />
            <circle cx={262} cy={115} r={35} fill="#F3F6F4" />
            <path d="M244 105a18 18 0 0 1 36 0z" fill="#E8B04B" />
            <circle cx={250} cy={128} r={9} fill="#6DA56A" />
            <circle cx={274} cy={128} r={9} fill="#C9763C" />
          </g>
        </g>
      </svg>
    </figure>
  )
}

export function Login() {
  const { t } = useI18n()
  const { login } = useAuth()
  const nav = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [err, setErr] = useState<unknown>(null)
  const [busy, setBusy] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setErr(null)
    try {
      const u = await login(email.trim(), password)
      nav(u.has_profile ? '/today' : '/onboarding', { replace: true })
    } catch (ex) {
      setErr(ex)
    } finally {
      setBusy(false)
    }
  }

  return (
    <PublicLayout>
      <Card className="a-pop mx-auto mt-6 grid max-w-md gap-5 p-6">
        <h1 className="text-[1.8rem] font-bold">{t('sign_in')}</h1>
        <form onSubmit={submit} className="grid gap-4" noValidate>
          <Field id="email" label={t('email')}>
            <Input id="email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </Field>
          <Field id="password" label={t('password')}>
            <Input id="password" type="password" autoComplete="current-password" required value={password}
              onChange={(e) => setPassword(e.target.value)} />
          </Field>
          <ErrorBanner error={err} />
          <Button type="submit" busy={busy}>{t('sign_in')}</Button>
        </form>
        <p className="text-muted">{t('no_account')} <Link className="font-semibold text-leaf underline" to="/register">{t('create_account')}</Link></p>
      </Card>
    </PublicLayout>
  )
}

export function Register() {
  const { t, lang } = useI18n()
  const { register } = useAuth()
  const nav = useNavigate()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [err, setErr] = useState<unknown>(null)
  const [busy, setBusy] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setErr(null)
    try {
      await register(name.trim(), email.trim(), password, lang)
      nav('/onboarding', { replace: true })
    } catch (ex) {
      setErr(ex)
    } finally {
      setBusy(false)
    }
  }

  return (
    <PublicLayout>
      <Card className="a-pop mx-auto mt-6 grid max-w-md gap-5 p-6">
        <h1 className="text-[1.8rem] font-bold">{t('create_account')}</h1>
        <form onSubmit={submit} className="grid gap-4" noValidate>
          <Field id="name" label={t('your_name')}>
            <Input id="name" autoComplete="name" required value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <Field id="email" label={t('email')}>
            <Input id="email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </Field>
          <Field id="password" label={t('password')} hint={t('password_hint')}>
            <Input id="password" type="password" autoComplete="new-password" minLength={8} required value={password}
              onChange={(e) => setPassword(e.target.value)} />
          </Field>
          <ErrorBanner error={err} />
          <Button type="submit" busy={busy} disabled={!name.trim() || !email.trim() || password.length < 8}>{t('create_account')}</Button>
        </form>
        <p className="text-muted">{t('have_account')} <Link className="font-semibold text-leaf underline" to="/login">{t('sign_in')}</Link></p>
      </Card>
    </PublicLayout>
  )
}
