import { Pencil } from 'lucide-react'
import { Avatar } from '@/components/ui/Avatar'
import { STAGE_LABEL, isKnockoutStage, matchWinnerId } from '@/lib/tournament-engine'
import type { Match, Member } from '@/lib/types'
import { cn } from '@/lib/utils'
import { memberLabel } from '@/features/tournaments/api'
import { canEditMatch, type TournamentView } from '@/features/tournaments/view'
import { legLabel } from './utils'

interface MatchCardProps {
  view: TournamentView
  match: Match
  onEdit: (match: Match) => void
  /** Muestra la etiqueta de ronda/etapa encima. */
  showStage?: boolean
}

function Side({
  member,
  align,
  winner,
  isMe,
}: {
  member: Member | undefined
  align: 'left' | 'right'
  winner: boolean
  isMe: boolean
}) {
  const name = memberLabel(member)
  return (
    <div
      className={cn(
        // móvil: avatar arriba y nombre debajo (cabe el nombre completo); desde sm: en fila
        'flex min-w-0 flex-1 flex-col items-center gap-1 text-center sm:flex-row sm:gap-2.5',
        align === 'right' ? 'sm:flex-row-reverse sm:text-right' : 'sm:text-left',
      )}
    >
      <Avatar name={name} url={member?.profile?.avatar_url} size={40} ring={isMe} />
      <span
        className={cn(
          'line-clamp-2 min-w-0 text-lg leading-tight font-semibold break-words sm:line-clamp-1 sm:text-xl font-display',
          member ? (winner ? 'text-gold-300' : 'text-white') : 'text-slate-500 italic',
        )}
      >
        {name}
      </span>
    </div>
  )
}

export function MatchCard({ view, match, onEdit, showStage = true }: MatchCardProps) {
  const home = match.home_id ? view.memberById.get(match.home_id) : undefined
  const away = match.away_id ? view.memberById.get(match.away_id) : undefined
  const played = match.status === 'played'
  const winnerId = played && isKnockoutStage(match.stage) ? matchWinnerId(match) : null

  const homeWins = played && (match.home_score! > match.away_score! || winnerId === match.home_id)
  const awayWins = played && (match.home_score! < match.away_score! || winnerId === match.away_id)

  const twoLegged =
    isKnockoutStage(match.stage) &&
    view.matches.some((m) => m.stage === match.stage && m.slot === match.slot && m.leg === 2)

  const editable = canEditMatch(view, match) && (view.isAdmin || !played)
  const isMine = Boolean(view.me && (match.home_id === view.me.id || match.away_id === view.me.id))

  const label =
    match.stage === 'league'
      ? `Jornada ${match.round}${match.leg === 2 ? ' · Vuelta' : ''}`
      : [STAGE_LABEL[match.stage], legLabel(match, twoLegged)].filter(Boolean).join(' · ')

  return (
    <article
      className={cn(
        'card !p-3 transition',
        isMine && 'border-neon-400/30',
        played && 'bg-night-800/90',
      )}
    >
      {showStage && (
        <p className="mb-2 flex items-center justify-between text-[11px] font-semibold tracking-widest text-slate-500 uppercase">
          <span>{label}</span>
          {isMine && <span className="text-neon-400">Tu partido</span>}
        </p>
      )}
      <div className="flex items-center gap-2">
        <Side member={home} align="left" winner={homeWins} isMe={home?.id === view.me?.id} />

        <div className="flex shrink-0 flex-col items-center">
          <div
            className={cn(
              'min-w-[5.5rem] rounded-lg px-3 py-1 text-center font-display text-3xl leading-none font-extrabold tabular-nums',
              played ? 'bg-night-950 text-white' : 'text-slate-500',
            )}
          >
            {played ? `${match.home_score} - ${match.away_score}` : 'vs'}
          </div>
          {played && match.pens_home !== null && match.pens_away !== null && (
            <span className="mt-1 text-[11px] font-semibold text-gold-400">
              Pen. {match.pens_home} - {match.pens_away}
            </span>
          )}
        </div>

        <Side member={away} align="right" winner={awayWins} isMe={away?.id === view.me?.id} />

        {editable && (
          <button
            type="button"
            onClick={() => onEdit(match)}
            className="btn btn-ghost btn-sm !px-2.5"
            aria-label={played ? 'Corregir resultado' : 'Registrar resultado'}
          >
            <Pencil size={16} />
          </button>
        )}
      </div>
    </article>
  )
}
