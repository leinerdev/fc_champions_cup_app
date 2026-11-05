import type { KnockoutStage, TournamentConfig, TournamentType } from '../types'
import { stagesForParticipants } from './knockout'

export const LIMITS = {
  league: { min: 3, max: 20 },
  cup: { min: 2, max: 32 },
} as const

export function defaultConfig(type: TournamentType): TournamentConfig {
  if (type === 'league') {
    return {
      size: 6,
      league: { double_leg: false, advance_count: 4 },
      knockout: { two_legged: {}, third_place: false },
    }
  }
  return { size: 8, knockout: { two_legged: {}, third_place: false } }
}

/** Cantidad de participantes que juegan la fase eliminatoria. */
export function knockoutParticipants(type: TournamentType, config: TournamentConfig): number {
  return type === 'league' ? (config.league?.advance_count ?? 0) : config.size
}

/** Rondas eliminatorias del torneo (incluye tercer puesto si está activado y hay semifinales). */
export function knockoutStagesOf(type: TournamentType, config: TournamentConfig): KnockoutStage[] {
  const n = knockoutParticipants(type, config)
  if (n < 2) return []
  return stagesForParticipants(n, config.knockout.third_place)
}

/** Devuelve un mensaje de error en español o null si la configuración es válida. */
export function validateConfig(type: TournamentType, config: TournamentConfig): string | null {
  const { min, max } = LIMITS[type]
  const { size } = config
  if (!Number.isInteger(size) || size < min || size > max) {
    return type === 'league'
      ? `La liga admite entre ${min} y ${max} jugadores.`
      : `La copa admite entre ${min} y ${max} participantes.`
  }
  if (type === 'cup') {
    if (size % 2 !== 0) return 'La copa necesita un número par de participantes.'
    return null
  }
  const adv = config.league?.advance_count
  if (adv === undefined || !Number.isInteger(adv)) return 'Indica cuántos jugadores avanzan.'
  if (adv % 2 !== 0) return 'El número de clasificados debe ser par.'
  if (adv < 2) return 'Deben avanzar al menos 2 jugadores.'
  if (adv > size) return 'No pueden avanzar más jugadores que los que participan.'
  if (adv > 32) return 'Máximo 32 clasificados.'
  return null
}
