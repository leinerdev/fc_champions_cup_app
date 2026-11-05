import { useMemo, useState } from 'react'
import { AlertTriangle, Swords } from 'lucide-react'
import { Avatar } from '@/components/ui/Avatar'
import { useToast } from '@/components/ui/Toast'
import { friendlyError } from '@/lib/supabase'
import { blockingTies, computeStandings } from '@/lib/tournament-engine'
import type { Match } from '@/lib/types'
import { cn } from '@/lib/utils'
import { memberLabel, useCreateTiebreaks } from '@/features/tournaments/api'
import type { TournamentView } from '@/features/tournaments/view'
import { MatchCard } from './MatchCard'
import { ScoreDialog } from './ScoreDialog'

export function StandingsTab({ view }: { view: TournamentView }) {
  const { t, members, matches, memberById } = view
  const toast = useToast()
  const createTiebreaks = useCreateTiebreaks(t, matches)
  const [editing, setEditing] = useState<Match | null>(null)

  const standings = useMemo(
    () =>
      computeStandings(
        members.map((m) => m.id),
        matches,
      ),
    [members, matches],
  )
  const advance = t.config.league?.advance_count ?? 0
  const blocking = blockingTies(standings.unresolvedTies, advance)
  const tiebreakMatches = matches.filter((m) => m.stage === 'tiebreak')
  const hasKnockout = t.status === 'knockout' || t.status === 'finished'

  async function onCreate(ids: string[]) {
    try {
      await createTiebreaks.mutateAsync(ids)
      toast.success('Partidos de desempate creados')
    } catch (err) {
      toast.error(friendlyError(err))
    }
  }

  return (
    <div className="space-y-5">
      <div className="card overflow-hidden !p-0">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[22rem] text-sm tabular-nums">
            <thead>
              <tr className="border-b border-white/10 bg-night-950/40 font-display text-base tracking-wider text-slate-400 uppercase">
                <th className="w-9 py-2.5 pl-3 text-left">#</th>
                <th className="py-2.5 text-left">Jugador</th>
                <th className="px-1.5 py-2.5 text-center" title="Partidos jugados">PJ</th>
                <th className="hidden px-1.5 py-2.5 text-center sm:table-cell" title="Ganados">G</th>
                <th className="hidden px-1.5 py-2.5 text-center sm:table-cell" title="Empatados">E</th>
                <th className="hidden px-1.5 py-2.5 text-center sm:table-cell" title="Perdidos">P</th>
                <th className="px-1.5 py-2.5 text-center" title="Goles a favor">GF</th>
                <th className="px-1.5 py-2.5 text-center" title="Goles en contra">GC</th>
                <th className="px-1.5 py-2.5 text-center" title="Diferencia de goles">DG</th>
                <th className="py-2.5 pr-3 pl-1.5 text-center text-gold-300" title="Puntos">Pts</th>
              </tr>
            </thead>
            <tbody>
              {standings.rows.map((r) => {
                const m = memberById.get(r.memberId)
                const name = memberLabel(m)
                const qualified = r.position <= advance
                const isMe = m?.id === view.me?.id
                return (
                  <tr
                    key={r.memberId}
                    className={cn(
                      'border-b border-white/5 last:border-0',
                      qualified && 'bg-neon-400/[0.04]',
                      isMe && 'bg-gold-500/[0.07]',
                      r.position === advance && 'border-b-2 border-b-neon-400/50',
                    )}
                  >
                    <td className="py-2 pl-3">
                      <span
                        className={cn(
                          'flex h-6 w-6 items-center justify-center rounded-md font-display text-base font-bold',
                          r.position === 1 && 'bg-gold-500 text-night-950',
                          r.position !== 1 && qualified && 'bg-neon-400/20 text-neon-300',
                          !qualified && 'text-slate-500',
                        )}
                      >
                        {r.position}
                      </span>
                    </td>
                    <td className="py-2">
                      <span className="flex items-center gap-2">
                        <Avatar name={name} url={m?.profile?.avatar_url} size={28} />
                        <span className={cn('max-w-[9rem] truncate font-semibold sm:max-w-none', isMe ? 'text-gold-300' : 'text-white')}>
                          {name}
                        </span>
                        {r.tied && (
                          <span title="Empate sin resolver" className="text-gold-400">
                            <AlertTriangle size={14} />
                          </span>
                        )}
                      </span>
                    </td>
                    <td className="px-1.5 py-2 text-center text-slate-300">{r.played}</td>
                    <td className="hidden px-1.5 py-2 text-center text-slate-400 sm:table-cell">{r.won}</td>
                    <td className="hidden px-1.5 py-2 text-center text-slate-400 sm:table-cell">{r.drawn}</td>
                    <td className="hidden px-1.5 py-2 text-center text-slate-400 sm:table-cell">{r.lost}</td>
                    <td className="px-1.5 py-2 text-center text-slate-300">{r.gf}</td>
                    <td className="px-1.5 py-2 text-center text-slate-300">{r.ga}</td>
                    <td className={cn('px-1.5 py-2 text-center', r.gd > 0 ? 'text-win' : r.gd < 0 ? 'text-loss' : 'text-slate-400')}>
                      {r.gd > 0 ? `+${r.gd}` : r.gd}
                    </td>
                    <td className="py-2 pr-3 pl-1.5 text-center font-display text-xl font-extrabold text-gold-300">
                      {r.pts}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-white/10 bg-night-950/40 px-3 py-2 text-[11px] text-slate-500">
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm bg-neon-400/40" /> Clasifican a eliminatorias ({advance})
          </span>
          <span>Desempate: DG → enfrentamiento directo → partido de desempate</span>
        </div>
      </div>

      {standings.complete && standings.unresolvedTies.length > 0 && !hasKnockout && (
        <div className="card card-gold space-y-3">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 shrink-0 text-gold-400" size={22} />
            <div>
              <h3 className="text-2xl font-bold text-gold-300 uppercase">Empate sin resolver</h3>
              <p className="text-sm text-slate-300">
                {blocking.length > 0
                  ? 'Hay un empate en la línea de clasificación. Se necesita un partido de desempate antes de sortear las eliminatorias.'
                  : 'Hay empates fuera de la línea de clasificación: no afectan a quién avanza, pero puedes desempatarlos si quieres.'}
              </p>
            </div>
          </div>
          {standings.unresolvedTies.map((tie) => {
            const names = tie.memberIds.map((id) => memberLabel(memberById.get(id)))
            const already = tiebreakMatches.length > 0 && tie.memberIds.every((id) =>
              tiebreakMatches.some((m) => m.home_id === id || m.away_id === id),
            )
            const isBlocking = blocking.includes(tie)
            return (
              <div
                key={tie.memberIds.join('-')}
                className="flex flex-col gap-2 rounded-xl border border-white/10 bg-night-950/50 p-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div>
                  <p className="font-semibold text-white">{names.join(' · ')}</p>
                  <p className="text-xs text-slate-400">
                    Posiciones {tie.from}–{tie.to}
                    {isBlocking && <span className="ml-2 chip chip-gold">Define la clasificación</span>}
                  </p>
                </div>
                {view.isAdmin && !already && (
                  <button
                    className="btn btn-gold btn-sm"
                    disabled={createTiebreaks.isPending}
                    onClick={() => void onCreate(tie.memberIds)}
                  >
                    <Swords size={16} /> Crear desempate
                  </button>
                )}
                {already && <span className="chip chip-neon">Desempate creado: registra el resultado</span>}
              </div>
            )
          })}
        </div>
      )}

      {tiebreakMatches.length > 0 && (
        <section className="space-y-2">
          <h3 className="text-2xl font-bold tracking-wider text-slate-300 uppercase">Partidos de desempate</h3>
          {tiebreakMatches.map((m) => (
            <MatchCard key={m.id} view={view} match={m} onEdit={setEditing} />
          ))}
        </section>
      )}

      <ScoreDialog view={view} match={editing} onClose={() => setEditing(null)} />
    </div>
  )
}
