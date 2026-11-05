import { useEffect, useRef } from 'react'
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { BarChart3, Home, Shield, UserRound, type LucideIcon } from 'lucide-react'
import { InstallPrompt } from '@/components/InstallPrompt'
import { Avatar } from '@/components/ui/Avatar'
import { LogoMark, Wordmark } from '@/components/ui/Logo'
import { useAuth } from '@/features/auth/AuthProvider'
import { syncSubscription } from '@/lib/push'
import { cn } from '@/lib/utils'

interface NavItem {
  to: string
  label: string
  icon: LucideIcon
  end?: boolean
}

export function AppLayout() {
  const { profile, isSuperAdmin, userId } = useAuth()
  const navigate = useNavigate()

  const items: NavItem[] = [
    { to: '/', label: 'Inicio', icon: Home, end: true },
    { to: '/estadisticas', label: 'Stats', icon: BarChart3 },
    { to: '/perfil', label: 'Perfil', icon: UserRound },
    ...(isSuperAdmin ? [{ to: '/admin', label: 'Admin', icon: Shield }] : []),
  ]

  // Al cambiar de pantalla, volver arriba (el scroll vive en #app-scroll, no en window).
  const { pathname } = useLocation()
  const scrollRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0 })
  }, [pathname])

  // Notificaciones push: re-asocia este dispositivo con el usuario actual
  // y abre la pantalla correcta cuando se toca una notificación con la app ya abierta.
  useEffect(() => {
    if (userId) void syncSubscription().catch(() => undefined)
  }, [userId])
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return
    const onMessage = (e: MessageEvent) => {
      const data = e.data as { type?: string; url?: string } | null
      if (data?.type === 'fccc:navigate' && typeof data.url === 'string' && data.url.startsWith('/')) {
        navigate(data.url)
      }
    }
    navigator.serviceWorker.addEventListener('message', onMessage)
    return () => navigator.serviceWorker.removeEventListener('message', onMessage)
  }, [navigate])

  // "App shell": la ventana no se desplaza. Cabecera y barra inferior son hijos
  // normales de un contenedor de alto fijo (100dvh) y solo el contenido scrollea.
  // Así la barra inferior nunca depende de position:fixed ni de la barra del
  // navegador / rebote de iOS, que la hacía "subir" al hacer scroll.
  return (
    <div className="stadium-bg relative flex h-dvh flex-col overflow-hidden">
      <header className="safe-top z-30 shrink-0 border-b border-white/10 bg-night-900/80 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-5xl items-center gap-4 px-4">
          <Link to="/" className="flex items-center gap-2.5" aria-label="FC Champions Cup, inicio">
            <LogoMark size={36} />
            <Wordmark className="text-xl sm:text-2xl" />
          </Link>

          <nav className="ml-auto hidden items-center gap-1 sm:flex" aria-label="Principal">
            {items.map(({ to, label, icon: Icon, end }) => (
              <NavLink
                key={to}
                to={to}
                end={end}
                className={({ isActive }) =>
                  cn(
                    'flex items-center gap-2 rounded-lg px-3.5 py-2 font-display text-lg font-semibold tracking-wider uppercase transition',
                    isActive
                      ? 'bg-white/10 text-gold-300'
                      : 'text-slate-400 hover:bg-white/5 hover:text-white',
                  )
                }
              >
                <Icon size={18} />
                {label}
              </NavLink>
            ))}
          </nav>

          <Link to="/perfil" className="ml-auto sm:ml-2" aria-label="Mi perfil">
            <Avatar
              name={profile?.full_name || profile?.username || '?'}
              url={profile?.avatar_url}
              size={38}
            />
          </Link>
        </div>
      </header>

      <div
        id="app-scroll"
        ref={scrollRef}
        className="relative min-h-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain"
      >
        <div className="pitch-lines pointer-events-none absolute inset-x-0 top-0 h-[28rem]" />
        <main className="relative mx-auto max-w-5xl px-4 pt-6 pb-10">
          <Outlet />
        </main>
      </div>

      <InstallPrompt />

      <nav
        className="safe-bottom z-30 shrink-0 border-t border-white/10 bg-night-900 sm:hidden"
        aria-label="Principal"
      >
        <div className="mx-auto flex max-w-md items-stretch justify-around">
          {items.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                cn(
                  'flex flex-1 flex-col items-center gap-0.5 py-2.5 font-display text-sm font-semibold tracking-widest uppercase transition',
                  isActive ? 'text-gold-300' : 'text-slate-500',
                )
              }
            >
              <Icon size={22} />
              {label}
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  )
}
