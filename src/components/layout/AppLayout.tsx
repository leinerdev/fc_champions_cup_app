import { Link, NavLink, Outlet } from 'react-router-dom'
import { Home, Shield, UserRound, type LucideIcon } from 'lucide-react'
import { InstallPrompt } from '@/components/InstallPrompt'
import { Avatar } from '@/components/ui/Avatar'
import { LogoMark, Wordmark } from '@/components/ui/Logo'
import { useAuth } from '@/features/auth/AuthProvider'
import { cn } from '@/lib/utils'

interface NavItem {
  to: string
  label: string
  icon: LucideIcon
  end?: boolean
}

export function AppLayout() {
  const { profile, isSuperAdmin } = useAuth()

  const items: NavItem[] = [
    { to: '/', label: 'Inicio', icon: Home, end: true },
    { to: '/perfil', label: 'Perfil', icon: UserRound },
    ...(isSuperAdmin ? [{ to: '/admin', label: 'Admin', icon: Shield }] : []),
  ]

  return (
    <div className="stadium-bg relative min-h-dvh">
      <div className="pitch-lines pointer-events-none absolute inset-x-0 top-0 h-[28rem]" />

      <header className="safe-top sticky top-0 z-30 border-b border-white/10 bg-night-900/80 backdrop-blur-xl">
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

      <main className="relative mx-auto max-w-5xl px-4 pt-6 pb-28 sm:pb-12">
        <Outlet />
      </main>

      <InstallPrompt />

      <nav
        className="safe-bottom fixed inset-x-0 bottom-0 z-30 border-t border-white/10 bg-night-900/90 backdrop-blur-xl sm:hidden"
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
