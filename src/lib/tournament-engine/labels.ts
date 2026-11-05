import type { MatchStage, TournamentStatus, TournamentType } from '../types'

export const STAGE_LABEL: Record<MatchStage, string> = {
  league: 'Fase de liga',
  tiebreak: 'Desempate',
  round_of_32: 'Dieciseisavos de final',
  round_of_16: 'Octavos de final',
  quarter: 'Cuartos de final',
  semi: 'Semifinales',
  third_place: 'Tercer puesto',
  final: 'Final',
}

export const STAGE_SHORT: Record<MatchStage, string> = {
  league: 'Liga',
  tiebreak: 'Desempate',
  round_of_32: '1/16',
  round_of_16: 'Octavos',
  quarter: 'Cuartos',
  semi: 'Semis',
  third_place: '3.er puesto',
  final: 'Final',
}

export const TYPE_LABEL: Record<TournamentType, string> = {
  league: 'Liga',
  cup: 'Copa',
}

export const STATUS_LABEL: Record<TournamentStatus, string> = {
  draft: 'Reuniendo jugadores',
  league: 'Fase de liga',
  knockout: 'Eliminatorias',
  finished: 'Finalizado',
}
