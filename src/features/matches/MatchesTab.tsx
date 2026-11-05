import { useMemo, useState } from 'react'
import { CalendarX } from 'lucide-react'
import { STAGE_LABEL, stageRank } from '@/lib/tournament-engine'
import type { Match, MatchStage } from '@/lib/types'
import { cn } from '@/lib/utils'
import type { TournamentView } from '@/features/tournaments/view'
import { MatchCard } from './MatchCard'
import { ScoreDialog } from './ScoreDialog'

type Filter = 'all' | 'mine' | 'pending'

interface Group {
  key: string
  title: string
  rank: number
  matches: Match[]
}

export function MatchesTab({ view }: { view: TournamentView }) {
  const [filter, setFilter] = useState<Filter>('all')
  const [editing, setEditing] = useState<Match | null>(null)

  const groups = useMemo(() => {
    const list = view.matches.filter((m) => {
      if (filter === 'mine') return view.me && (m.home_id === view.me.id || m.away_id === view.me.id)
      if (filter === 'pending') return m.status !== 'played'
      return true
    })
    const map = new Map<string, Group>()
    for (const m of list) {
      const key = m.stage === 'league' ? `league-${m.round}` : (m.stage as MatchStage)
      const group =
        map.get(key) ??
        ({
          key,
          title: m.stage === 'league' ? `Jornada ${m.round}` : STAGE_LABEL[m.stage],
          // las jornadas de liga van primero, ordenadas por número
          rank: m.stage === 'league' ? -100 + m.round / 1000 : stageRank(m.stage),
          matches: [],
        } satisfies Group)
      group.matches.push(m)
      map.set(key, group)
    }
    const out = [...map.values()].sort((a, b) => a.rank - b.rank)
    for (const g of out) g.matches.sort((x, y) => x.slot - y.slot || x.leg - y.leg)
    return out
  }, [view.matches, view.me, filter])

  const filters: [Filter, string][] = [
    ['all', 'Todos'],
    ['mine', 'Mis partidos'],
    ['pending', 'Por jugar'],
  ]

  return (
    <div className="space-y-5">
      <div className="flex gap-2 overflow-x-auto pb-1" role="tablist" aria-label="Filtro de partidos">
        {filters.map(([id, label]) => (
          <button
            key={id}
            role="tab"
            aria-selected={filter === id}
            onClick={() => setFilter(id)}
            className={cn('btn btn-sm shrink-0', filter === id ? 'btn-neon' : 'btn-ghost')}
          >
            {label}
          </button>
        ))}
      </div>

      {groups.length === 0 ? (
        <div className="card flex flex-col items-center gap-2 py-10 text-center">
          <CalendarX size={40} className="text-slate-600" />
          <p className="font-display text-2xl text-slate-300 uppercase">Sin partidos</p>
          <p className="text-sm text-slate-500">
            {filter === 'all' ? 'Los partidos aparecerán cuando comience el torneo.' : 'No hay partidos con este filtro.'}
          </p>
        </div>
      ) : (
        groups.map((g) => (
          <section key={g.key} className="space-y-2">
            <h3 className="flex items-center gap-3 text-2xl font-bold tracking-wider text-slate-300 uppercase">
              {g.title}
              <span className="h-px flex-1 bg-white/10" />
              <span className="text-sm font-semibold text-slate-500">
                {g.matches.filter((m) => m.status === 'played').length}/{g.matches.length}
              </span>
            </h3>
            <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
              {g.matches.map((m) => (
                <MatchCard key={m.id} view={view} match={m} onEdit={setEditing} />
              ))}
            </div>
          </section>
        ))
      )}

      <ScoreDialog view={view} match={editing} onClose={() => setEditing(null)} />
    </div>
  )
}
