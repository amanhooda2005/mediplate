import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes } from 'react'
import { ApiError } from '../api/client'
import { useI18n } from '../i18n/I18n'
import { AlertIcon, CheckIcon, InfoIcon, PlateLogo, XIcon } from './icons'

export function cx(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(' ')
}

type BtnVariant = 'primary' | 'secondary' | 'ghost' | 'danger'
export function Button({ variant = 'primary', busy, className, children, ...rest }:
  ButtonHTMLAttributes<HTMLButtonElement> & { variant?: BtnVariant; busy?: boolean }) {
  const styles: Record<BtnVariant, string> = {
    primary: 'bg-leaf text-white hover:bg-leaf-dark border border-leaf',
    secondary: 'bg-surface text-ink border border-line-strong hover:border-leaf hover:text-leaf',
    ghost: 'bg-transparent text-leaf border border-transparent hover:bg-leaf-soft',
    danger: 'bg-surface text-avoid border border-avoid/40 hover:bg-avoid-soft',
  }
  return (
    <button
      {...rest}
      disabled={rest.disabled || busy}
      className={cx('inline-flex min-h-12 items-center justify-center gap-2 rounded-[10px] px-5 text-[0.97rem] font-semibold',
        'transition-colors disabled:cursor-not-allowed disabled:opacity-55', styles[variant], className)}
    >
      {busy && <PlateLogo className="spin" width={20} height={20} />}
      {children}
    </button>
  )
}

export function Card({ children, className, as: Tag = 'section' }: { children: ReactNode; className?: string; as?: 'section' | 'div' | 'article' }) {
  return <Tag className={cx('rounded-[var(--radius-card)] border border-line bg-surface', className)}>{children}</Tag>
}

export function Field({ label, hint, id, children, error }: { label: ReactNode; hint?: ReactNode; id: string; children: ReactNode; error?: string | null }) {
  return (
    <div className="grid gap-1.5">
      <label htmlFor={id} className="text-[0.95rem] font-semibold">{label}</label>
      {children}
      {hint && <p className="text-sm text-muted">{hint}</p>}
      {error && <p className="text-sm font-medium text-avoid" role="alert">{error}</p>}
    </div>
  )
}

const inputCls = 'min-h-12 w-full rounded-[10px] border border-line-strong bg-surface px-3.5 text-[1rem] text-ink placeholder:text-muted/70 focus:border-leaf'

export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={cx(inputCls, props.className)} />
}

export function Select(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={cx(inputCls, 'pr-8', props.className)} />
}

export function Choice<T extends string | number>({ name, value, options, onChange, columns = 2 }:
  { name: string; value: T | null; options: { value: T; label: ReactNode; hint?: ReactNode }[]; onChange: (v: T) => void; columns?: number }) {
  return (
    <div role="radiogroup" className={cx('grid gap-2', columns === 3 ? 'sm:grid-cols-3' : columns === 1 ? '' : 'sm:grid-cols-2')}>
      {options.map((o) => {
        const active = o.value === value
        const id = `${name}-${o.value}`
        return (
          <label key={String(o.value)} htmlFor={id}
            className={cx('flex min-h-12 cursor-pointer items-start gap-3 rounded-[10px] border px-3.5 py-3',
              active ? 'border-leaf bg-leaf-soft' : 'border-line-strong bg-surface hover:border-leaf')}>
            <input id={id} type="radio" name={name} checked={active} onChange={() => onChange(o.value)}
              aria-labelledby={`${id}-label`} aria-describedby={o.hint ? `${id}-hint` : undefined}
              className="mt-1 size-5 accent-[var(--color-leaf)]" />
            <span className="grid">
              <span id={`${id}-label`} className="font-medium">{o.label}</span>
              {o.hint && <span id={`${id}-hint`} className="text-sm text-muted">{o.hint}</span>}
            </span>
          </label>
        )
      })}
    </div>
  )
}

export function Toggle({ id, checked, onChange, label, hint }: { id: string; checked: boolean; onChange: (v: boolean) => void; label: ReactNode; hint?: ReactNode }) {
  return (
    <label htmlFor={id} className={cx('flex min-h-12 cursor-pointer items-start gap-3 rounded-[10px] border px-3.5 py-3',
      checked ? 'border-leaf bg-leaf-soft' : 'border-line-strong bg-surface hover:border-leaf')}>
      <input id={id} type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)}
        aria-labelledby={`${id}-label`} aria-describedby={hint ? `${id}-hint` : undefined}
        className="mt-1 size-5 shrink-0 accent-[var(--color-leaf)]" />
      <span className="grid">
        <span id={`${id}-label`} className="font-medium">{label}</span>
        {hint && <span id={`${id}-hint`} className="text-sm text-muted">{hint}</span>}
      </span>
    </label>
  )
}

export function Spinner({ label }: { label?: string }) {
  const { t } = useI18n()
  return (
    <div className="flex items-center gap-3 py-10 text-muted" role="status" aria-live="polite">
      <PlateLogo className="spin" />
      <span>{label ?? t('loading')}</span>
    </div>
  )
}

export function errorText(err: unknown, t: ReturnType<typeof useI18n>['t']): string {
  if (err instanceof ApiError) {
    if (err.status === 0) return t('error_network')
    if (err.message && !err.message.startsWith('HTTP')) return err.message
  }
  return t('error_generic')
}

export function ErrorBanner({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const { t } = useI18n()
  if (!error) return null
  return (
    <div role="alert" className="flex flex-wrap items-center gap-3 rounded-[10px] border border-avoid/30 bg-avoid-soft px-4 py-3 text-avoid">
      <AlertIcon className="shrink-0" />
      <span className="flex-1 font-medium">{errorText(error, t)}</span>
      {onRetry && <Button variant="secondary" onClick={onRetry}>{t('retry')}</Button>}
    </div>
  )
}

export function Notice({ tone = 'info', children }: { tone?: 'info' | 'ok' | 'limit' | 'avoid'; children: ReactNode }) {
  const tones = {
    info: 'border-info/25 bg-info-soft text-info',
    ok: 'border-ok/25 bg-ok-soft text-ok',
    limit: 'border-limit/30 bg-limit-soft text-limit',
    avoid: 'border-avoid/30 bg-avoid-soft text-avoid',
  }
  const Icon = tone === 'ok' ? CheckIcon : tone === 'info' ? InfoIcon : AlertIcon
  return (
    <div className={cx('flex items-start gap-3 rounded-[10px] border px-4 py-3', tones[tone])}>
      <Icon className="mt-0.5 shrink-0" />
      <div className="min-w-0 flex-1 text-ink">{children}</div>
    </div>
  )
}

export function Chip({ children, tone = 'neutral', title }: { children: ReactNode; tone?: 'neutral' | 'leaf' | 'ok' | 'limit' | 'avoid' | 'info'; title?: string }) {
  const tones = {
    neutral: 'bg-ground text-muted border-line',
    leaf: 'bg-leaf-soft text-leaf-dark border-leaf/20',
    ok: 'bg-ok-soft text-ok border-ok/20',
    limit: 'bg-limit-soft text-limit border-limit/25',
    avoid: 'bg-avoid-soft text-avoid border-avoid/25',
    info: 'bg-info-soft text-info border-info/20',
  }
  return (
    <span title={title} className={cx('inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[0.8rem] font-medium', tones[tone])}>
      {children}
    </span>
  )
}

export function Verdict({ verdict, label }: { verdict: 'ok' | 'limit' | 'avoid'; label: string }) {
  const map = {
    ok: { cls: 'bg-ok text-white', Icon: CheckIcon },
    limit: { cls: 'bg-limit text-white', Icon: AlertIcon },
    avoid: { cls: 'bg-avoid text-white', Icon: XIcon },
  }[verdict]
  return (
    <span className={cx('inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-lg font-bold', map.cls)}>
      <map.Icon width={20} height={20} /> {label}
    </span>
  )
}

export function PageHeader({ title, sub, action }: { title: ReactNode; sub?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3 pb-5 pt-6">
      <div className="grid gap-1">
        <h1 className="text-[1.9rem] font-bold sm:text-[2.2rem]">{title}</h1>
        {sub && <p className="max-w-[62ch] text-muted">{sub}</p>}
      </div>
      {action}
    </div>
  )
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="rounded-[var(--radius-card)] border border-dashed border-line-strong px-5 py-8 text-center text-muted">{children}</div>
}
