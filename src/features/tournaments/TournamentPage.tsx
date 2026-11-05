import { useMemo } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { ArrowLeft, CalendarDays, GitBranch, LayoutDashboard, ListOrdered, ShieldQuestion, Swords, Trophy, Users, type LucideIcon } from 'lucide-react'
import { PageLoader } from '@/components/ui/Spinner'
import { useAuth } from '@/features/auth/AuthProvider'
import { BracketTab } from '@/features/matches/BracketTab'
import { MatchesTab } from '@/features/matches/MatchesTab'
import { StandingsTab } from '@/features/matches/StandingsTab'
import { friendlyError } from '@/lib/supabase'
import { TYPE_LABEL } from '@/lib/tournament-engine'
import { cn } from '@/lib/utils'
import { useMatches, useMembers, useTournament, useTournamentRealtime } from './api'
import { MembersTab } from './MembersTab'
import { SummaryTab } from './SummaryTab'
import { StatusChip } from './TournamentCard'
import type { TournamentView } from './view'

type TabId = 'resumen' | 'tabla' | 'partidos' | 'llaves' | 'jugadores'

interface TabDef {
  id: TabId
  label: string
  icon: LucideIcon
}

export function TournamentPage() {
  const { id = '' } = useParams()
  const [params, setParams] = useSearchParams()
  const { userId, isSuperAdmin } = useAuth()

  const tournament = useTournament(id)
  const membersQ = useMembers(id)
  const matchesQ = useMatches(id)
  useTournamentRealtime(id)

  const t = tournament.data
  const members = membersQ.data
  const matches = matchesQ.data

  const view = useMemo<TournamentView | null>(() => {
    if (!t || !members || !matches) return null
    const me = members.find((m) => m.user_id === userId) ?? null
    return {
      t,
      members,
      matches,
      me,
      isAdmin: isSuperAdmin || me?.role === 'admin',
      memberById: new Map(members.map((m) => [m.id, m])),
    }
  }, [t, members, matches, userId, isSuperAdmin])

  if (tournament.isPending || membersQ.isPending || matchesQ.isPending) return <PageLoader />

  const loadError = tournament.error ?? membersQ.error ?? matchesQ.error
  if (loadError) {
    return <NotAvailable text={friendlyError(loadError)} />
  }
  if (!t || !view) {
    return (
      <NotAvailable text="No encontramos este torneo o no eres parte de él. Si te invitaron, usa el código o el enlace de invitación." />
    )
  }

  const started = t.status !== 'draft'
  const tabs: TabDef[] = [
    { id: 'resumen', label: 'Resumen', icon: LayoutDashboard },
    ...(t.type === 'league' && started ? [{ id: 'tabla' as const, label: 'Tabla', icon: ListOrdered }] : []),
    ...(started ? [{ id: 'partidos' as const, label: 'Partidos', icon: CalendarDays }] : []),
    ...(t.status === 'knockout' || t.status === 'finished'
      ? [{ id: 'llaves' as const, label: 'Llaves', icon: GitBranch }]
      : []),
    { id: 'jugadores', label: 'Jugadores', icon: Users },
  ]
  const requested = params.get('tab') as TabId | null
  const active: TabId = tabs.some((x) => x.id === requested) ? requested! : 'resumen'

  return (
    <div className="space-y-5">
      <header className="space-y-3">
        <Link to="/" className="inline-flex items-center gap-1.5 text-sm text-slate-400 hover:text-white">
          <ArrowLeft size={16} /> Mis torneos
        </Link>
        <div className="flex items-start gap-4">
          <span
            className={cn(
              'flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl',
              t.type === 'league' ? 'bg-neon-400/10 text-neon-300' : 'bg-gold-500/10 text-gold-400',
            )}
          >
            {t.type === 'league' ? <Swords size={32} /> : <Trophy size={32} />}
          </span>
          <div className="min-w-0">
            <h1 className="text-4xl leading-none font-extrabold break-words text-white uppercase sm:text-5xl">
              {t.name}
            </h1>
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              <span className="chip">{TYPE_LABEL[t.type]}</span>
              <StatusChip status={t.status} />
              <span className="chip" title="Código de invitación">
                Código {t.code}
              </span>
            </div>
          </div>
        </div>
      </header>

      <nav
        className="sticky top-16 z-20 -mx-4 overflow-x-auto border-b border-white/10 bg-night-900/85 px-4 backdrop-blur-xl"
        aria-label="Secciones del torneo"
      >
        <div role="tablist" className="flex min-w-max gap-1">
          {tabs.map(({ id: tabId, label, icon: Icon }) => (
            <button
              key={tabId}
              role="tab"
              aria-selected={active === tabId}
              onClick={() => setParams(tabId === 'resumen' ? {} : { tab: tabId }, { replace: true })}
              className={cn(
                'flex items-center gap-2 border-b-2 px-4 py-3 font-display text-lg font-semibold tracking-wider whitespace-nowrap uppercase transition',
                active === tabId
                  ? 'border-gold-400 text-gold-300'
                  : 'border-transparent text-slate-500 hover:text-slate-200',
              )}
            >
              <Icon size={17} />
              {label}
            </button>
          ))}
        </div>
      </nav>

      <div role="tabpanel">
        {active === 'resumen' && <SummaryTab view={view} />}
        {active === 'tabla' && <StandingsTab view={view} />}
        {active === 'partidos' && <MatchesTab view={view} />}
        {active === 'llaves' && <BracketTab view={view} />}
        {active === 'jugadores' && <MembersTab view={view} />}
      </div>
    </div>
  )
}

function NotAvailable({ text }: { text: string }) {
  return (
    <div className="card mx-auto mt-10 flex max-w-md flex-col items-center gap-3 py-10 text-center">
      <ShieldQuestion size={44} className="text-slate-600" />
      <h1 className="text-3xl font-bold text-white uppercase">Torneo no disponible</h1>
      <p className="text-sm text-slate-400">{text}</p>
      <Link to="/" className="btn btn-ghost mt-2">
        Volver al inicio
      </Link>
    </div>
  )
}
