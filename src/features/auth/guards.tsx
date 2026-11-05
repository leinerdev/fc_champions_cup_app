import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { FullScreenLoader } from '@/components/ui/Spinner'
import { useAuth } from './AuthProvider'

/** Exige sesión y perfil completo (nombre, foto y correo). */
export function RequireAuth() {
  const { session, loading, profileIncomplete } = useAuth()
  const location = useLocation()
  const here = location.pathname + location.search

  if (loading) return <FullScreenLoader />
  if (!session) return <Navigate to={`/login?next=${encodeURIComponent(here)}`} replace />
  if (profileIncomplete && location.pathname !== '/perfil') {
    return <Navigate to={`/perfil?next=${encodeURIComponent(here)}`} replace />
  }
  return <Outlet />
}

export function RequireSuperAdmin() {
  const { isSuperAdmin } = useAuth()
  if (!isSuperAdmin) return <Navigate to="/" replace />
  return <Outlet />
}
