import { useEffect } from 'react'
import type { ReactNode } from 'react'
import { Link, Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { useAuth } from './auth/AuthContext'
import { AppLayout, PublicLayout } from './components/Layout'
import { Button, ErrorBanner, Spinner } from './components/ui'
import { useMeta } from './hooks'
import { useI18n } from './i18n/I18n'
import { Admin } from './pages/Admin'
import { Landing, Login, Register } from './pages/Auth'
import { FoodCheck } from './pages/FoodCheck'
import { Onboarding } from './pages/Onboarding'
import { ProfilePage } from './pages/Profile'
import { Progress } from './pages/Progress'
import { Today } from './pages/Today'
import { Week } from './pages/Week'

/** Loads the shared reference data (states, medicines, messages) once. */
function MetaGate({ children }: { children: ReactNode }) {
  const meta = useMeta()
  const { setMessages } = useI18n()
  useEffect(() => {
    if (meta.data) setMessages(meta.data.messages)
  }, [meta.data, setMessages])
  if (meta.error) return <div className="mx-auto max-w-lg p-6"><ErrorBanner error={meta.error} onRetry={() => meta.refetch()} /></div>
  if (!meta.data) return <div className="mx-auto max-w-lg p-6"><Spinner /></div>
  return <>{children}</>
}

function RequireUser({ children, needProfile = true, admin = false }: { children: ReactNode; needProfile?: boolean; admin?: boolean }) {
  const { user, loading } = useAuth()
  const loc = useLocation()
  if (loading) return <div className="mx-auto max-w-lg p-6"><Spinner /></div>
  if (!user) return <Navigate to="/login" replace state={{ from: loc.pathname }} />
  if (needProfile && !user.has_profile && user.role !== 'admin') return <Navigate to="/onboarding" replace />
  if (admin && user.role !== 'admin') return <Navigate to="/today" replace />
  return <>{children}</>
}

function PublicOnly({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth()
  if (loading) return <div className="mx-auto max-w-lg p-6"><Spinner /></div>
  if (user) return <Navigate to={user.has_profile || user.role === 'admin' ? '/today' : '/onboarding'} replace />
  return <>{children}</>
}

function NotFound() {
  const { t } = useI18n()
  return (
    <PublicLayout>
      <div className="grid justify-items-start gap-4 py-10">
        <h1 className="text-3xl font-bold">{t('not_found')}</h1>
        <Link to="/today"><Button>{t('go_home')}</Button></Link>
      </div>
    </PublicLayout>
  )
}

export default function App() {
  return (
    <MetaGate>
      <Routes>
        <Route path="/" element={<PublicOnly><Landing /></PublicOnly>} />
        <Route path="/login" element={<PublicOnly><Login /></PublicOnly>} />
        <Route path="/register" element={<PublicOnly><Register /></PublicOnly>} />
        <Route element={<RequireUser needProfile={false}><AppLayout /></RequireUser>}>
          <Route path="/onboarding" element={<Onboarding />} />
        </Route>
        <Route element={<RequireUser><AppLayout /></RequireUser>}>
          <Route path="/today" element={<Today />} />
          <Route path="/week" element={<Week />} />
          <Route path="/check" element={<FoodCheck />} />
          <Route path="/progress" element={<Progress />} />
          <Route path="/profile" element={<ProfilePage />} />
        </Route>
        <Route element={<RequireUser admin needProfile={false}><AppLayout /></RequireUser>}>
          <Route path="/admin" element={<Admin />} />
        </Route>
        <Route path="*" element={<NotFound />} />
      </Routes>
    </MetaGate>
  )
}
