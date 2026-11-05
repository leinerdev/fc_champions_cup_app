import { lazy, Suspense } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { SetupNotice } from '@/components/SetupNotice'
import { AppLayout } from '@/components/layout/AppLayout'
import { PageLoader } from '@/components/ui/Spinner'
import { ToastProvider } from '@/components/ui/Toast'
import { AuthProvider } from '@/features/auth/AuthProvider'
import { LoginPage } from '@/features/auth/LoginPage'
import { RegisterPage } from '@/features/auth/RegisterPage'
import { RequireAuth, RequireSuperAdmin } from '@/features/auth/guards'
import { HomePage } from '@/features/tournaments/HomePage'
import { isSupabaseConfigured } from '@/lib/supabase'

// Pantallas pesadas se cargan bajo demanda para que el arranque sea rápido.
const ProfilePage = lazy(() =>
  import('@/features/profile/ProfilePage').then((m) => ({ default: m.ProfilePage })),
)
const CreateTournamentPage = lazy(() =>
  import('@/features/tournaments/CreateTournamentPage').then((m) => ({ default: m.CreateTournamentPage })),
)
const JoinPage = lazy(() =>
  import('@/features/tournaments/JoinPage').then((m) => ({ default: m.JoinPage })),
)
const TournamentPage = lazy(() =>
  import('@/features/tournaments/TournamentPage').then((m) => ({ default: m.TournamentPage })),
)
const StatsPage = lazy(() =>
  import('@/features/stats/StatsPage').then((m) => ({ default: m.StatsPage })),
)
const AdminPage = lazy(() =>
  import('@/features/admin/AdminPage').then((m) => ({ default: m.AdminPage })),
)

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 15_000, retry: 1, refetchOnWindowFocus: true },
  },
})

export default function App() {
  if (!isSupabaseConfigured) return <SetupNotice />

  return (
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <BrowserRouter>
          <AuthProvider>
            <Suspense fallback={<PageLoader />}>
              <Routes>
                <Route path="/login" element={<LoginPage />} />
                <Route path="/registro" element={<RegisterPage />} />
                <Route element={<RequireAuth />}>
                  <Route element={<AppLayout />}>
                    <Route path="/" element={<HomePage />} />
                    <Route path="/torneos/nuevo" element={<CreateTournamentPage />} />
                    <Route path="/torneos/:id" element={<TournamentPage />} />
                    <Route path="/join/:code" element={<JoinPage />} />
                    <Route path="/estadisticas" element={<StatsPage />} />
                    <Route path="/perfil" element={<ProfilePage />} />
                    <Route element={<RequireSuperAdmin />}>
                      <Route path="/admin" element={<AdminPage />} />
                    </Route>
                  </Route>
                </Route>
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </Suspense>
          </AuthProvider>
        </BrowserRouter>
      </ToastProvider>
    </QueryClientProvider>
  )
}
