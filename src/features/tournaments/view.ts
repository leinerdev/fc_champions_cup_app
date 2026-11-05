import type { Match, Member, Tournament } from '@/lib/types'

/** Datos y permisos que comparten todas las pestañas de un torneo. */
export interface TournamentView {
  t: Tournament
  members: Member[]
  matches: Match[]
  /** Mi jugador dentro del torneo (null si soy super admin sin participar). */
  me: Member | null
  /** Admin del torneo o super admin. */
  isAdmin: boolean
  memberById: Map<string, Member>
}

/** ¿Puedo registrar el resultado de este partido? */
export function canEditMatch(view: TournamentView, match: Match): boolean {
  if (!match.home_id || !match.away_id) return false
  if (view.t.status === 'draft') return false
  if (view.isAdmin) return true
  if (view.t.status === 'finished') return false
  return Boolean(view.me && (match.home_id === view.me.id || match.away_id === view.me.id))
}
