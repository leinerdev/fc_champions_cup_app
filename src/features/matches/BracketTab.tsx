import { useMemo, useState } from 'react'
import { GitBranch, Trophy } from 'lucide-react'
import { Avatar } from '@/components/ui/Avatar'
import { Modal } from '@/components/ui/Modal'
import { STAGE_LABEL, buildTies, stageRank, type Tie } from '@/lib/tournament-engine'
import type { Match, MatchStage } from '@/lib/types'
import { cn } from '@/lib/utils'
import { memberLabel } from '@/features/tournaments/api'
import type { TournamentView } from '@/features/tournaments/view'
import { MatchCard } from './MatchCard'
import { ScoreDialog } from './ScoreDialog'

function legScore(match: Match, memberId: string | null): number | null {
  if (!memberId || match.home_score === null || match.away_score === null) return null
  return match.home_id === memberId ? match.home_score : match.away_score
}

function legPens(match: Match, memberId: string | null): number | null {
  if (!memberId || match.pens_home === null || match.pens_away === null) return null
  return match.home_id === memberId ? match.pens_home : match.pens_away
}

function TieRow({ tie, side, view }: { tie: Tie; side: 'a' | 'b'; view: TournamentView }) {
  const id = tie[side]
  const member = id ? view.memberById.get(id) : undefined
  const name = memberLabel(member)
  const isWinner = Boolean(id && tie.result.winnerId === id)
  const isLoser = Boolean(id && tie.result.loserId === id)
  const twoLegged = tie.legs.length > 1
  const agg = side === 'a' ? tie.result.goalsA : tie.result.goalsB
  const anyPlayed = tie.legs.some((l) => l.status === 'played')

  return (
    <div
      className={cn(
        'flex items-center gap-2 px-3 py-2',
        isWinner && 'bg-gold-500/10',
        isLoser && 'opacity-60',
      )}
    >
      <Avatar name={name} url={member?.profile?.avatar_url} size={28} ring={member?.id === view.me?.id} />
      <span
        className={cn(
          'min-w-0 flex-1 truncate font-display text-lg font-semibold',
          member ? (isWinner ? 'text-gold-300' : 'text-white') : 'text-slate-500 italic',
        )}
      >
        {name}
      </span>
      <span className="flex items-center gap-1.5 font-display text-xl font-bold tabular-nums">
        {tie.legs.map((leg) => {
          const s = legScore(leg, id)
          const p = legPens(leg, id)
          return (
            <span
              key={leg.id}
              className={cn(
                'min-w-6 rounded bg-night-950 px-1.5 text-center',
                s === null ? 'text-slate-600' : 'text-white',
              )}
            >
              {s ?? '–'}
              {p !== null && <sup className="ml-0.5 text-[10px] text-gold-400">({p})</sup>}
            </span>
          )
        })}
        {twoLegged && (
          <span className={cn('min-w-7 rounded px-1.5 text-center', anyPlayed ? 'bg-neon-400/15 text-neon-300' : 'text-slate-600')}>
            {anyPlayed ? agg : '–'}
          </span>
        )}
      </span>
    </div>
  )
}

function TieCard({ tie, view, onOpen }: { tie: Tie; view: TournamentView; onOpen: (t: Tie) => void }) {
  const ready = Boolean(tie.a && tie.b)
  const complete = tie.result.complete
  return (
    <button
      type="button"
      onClick={() => ready && onOpen(tie)}
      disabled={!ready}
      aria-label={`${STAGE_LABEL[tie.stage]}, llave ${tie.slot}`}
      className={cn(
        'card block w-full overflow-hidden !p-0 text-left transition',
        ready && 'hover:-translate-y-0.5 hover:border-neon-400/50',
        complete && 'border-gold-500/30',
        !ready && 'cursor-default opacity-80',
      )}
    >
      <TieRow tie={tie} side="a" view={view} />
      <div className="h-px bg-white/10" />
      <TieRow tie={tie} side="b" view={view} />
      {tie.legs.length > 1 && (
        <div className="border-t border-white/10 bg-night-950/40 px-3 py-1 text-[10px] font-semibold tracking-widest text-slate-500 uppercase">
          Ida · Vuelta · Global
        </div>
      )}
      {tie.result.needsPenalties && (
        <div className="border-t border-gold-500/30 bg-gold-500/10 px-3 py-1 text-[11px] font-semibold text-gold-300">
          Falta definir por penales
        </div>
      )}
      {tie.result.decidedBy === 'away_goals' && (
        <div className="border-t border-white/10 bg-night-950/40 px-3 py-1 text-[10px] font-semibold tracking-widest text-slate-400 uppercase">
          Gol de visitante
        </div>
      )}
    </button>
  )
}

export function BracketTab({ view }: { view: TournamentView }) {
  const [openTie, setOpenTie] = useState<Tie | null>(null)
  const [editing, setEditing] = useState<Match | null>(null)

  const ties = useMemo(() => buildTies(view.matches), [view.matches])
  const columns = useMemo(() => {
    const stages = [...new Set(ties.map((t) => t.stage))].filter((s) => s !== 'third_place')
    stages.sort((a, b) => stageRank(a) - stageRank(b))
    return stages as MatchStage[]
  }, [ties])
  const third = ties.find((t) => t.stage === 'third_place')

  // Mantiene el modal sincronizado con los datos más recientes
  const liveTie = openTie ? ties.find((t) => t.key === openTie.key) ?? openTie : null

  if (ties.length === 0) {
    return (
      <div className="card flex flex-col items-center gap-2 py-12 text-center">
        <GitBranch size={44} className="text-slate-600" />
        <p className="font-display text-2xl text-slate-300 uppercase">La llave aún no existe</p>
        <p className="max-w-xs text-sm text-slate-500">
          {view.t.type === 'league'
            ? 'Se sortea cuando termina la fase de liga.'
            : 'Se sortea cuando el administrador inicia el torneo.'}
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="-mx-4 overflow-x-auto px-4 pb-3">
        <div className="flex min-w-max gap-5">
          {columns.map((stage) => {
            const stageTies = ties.filter((t) => t.stage === stage)
            return (
              <section key={stage} className="flex w-64 shrink-0 flex-col gap-3">
                <h3
                  className={cn(
                    'flex items-center gap-2 text-xl font-bold tracking-wider uppercase',
                    stage === 'final' ? 'text-gold-300' : 'text-slate-300',
                  )}
                >
                  {stage === 'final' && <Trophy size={18} />}
                  {STAGE_LABEL[stage]}
                </h3>
                <div className="flex flex-1 flex-col justify-around gap-4">
                  {stageTies.map((t) => (
                    <TieCard key={t.key} tie={t} view={view} onOpen={setOpenTie} />
                  ))}
                </div>
                {stage === 'final' && third && (
                  <>
                    <h3 className="mt-2 text-xl font-bold tracking-wider text-slate-300 uppercase">
                      {STAGE_LABEL.third_place}
                    </h3>
                    <TieCard tie={third} view={view} onOpen={setOpenTie} />
                  </>
                )}
              </section>
            )
          })}
        </div>
      </div>
      <p className="text-center text-xs text-slate-500">Toca una llave para ver o registrar sus partidos.</p>

      <Modal
        open={Boolean(liveTie)}
        onClose={() => setOpenTie(null)}
        title={liveTie ? STAGE_LABEL[liveTie.stage] : ''}
      >
        {liveTie && (
          <div className="space-y-3">
            {liveTie.legs.map((leg) => (
              <MatchCard key={leg.id} view={view} match={leg} onEdit={setEditing} />
            ))}
            {liveTie.result.complete && (
              <p className="text-center text-sm text-gold-300">
                Avanza {memberLabel(view.memberById.get(liveTie.result.winnerId!))}
                {liveTie.result.decidedBy === 'penalties' && ' por penales'}
                {liveTie.result.decidedBy === 'away_goals' && ' por goles de visitante'}
                {liveTie.result.decidedBy === 'aggregate' && ' por marcador global'}.
              </p>
            )}
          </div>
        )}
      </Modal>
      <ScoreDialog view={view} match={editing} onClose={() => setEditing(null)} />
    </div>
  )
}
