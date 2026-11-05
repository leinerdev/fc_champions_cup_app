import type { Match } from '@/lib/types'
import { isKnockoutStage, resolveTie } from '@/lib/tournament-engine'

/**
 * ¿Con este marcador hay que registrar penales?
 * - Desempate o partido único de eliminatoria: marcador empatado.
 * - Ida y vuelta: último partido con global y goles de visitante empatados.
 */
export function needsPenalties(
  match: Match,
  home: number,
  away: number,
  allMatches: readonly Match[],
): boolean {
  if (match.stage === 'league') return false
  if (match.stage === 'tiebreak') return home === away
  if (!isKnockoutStage(match.stage)) return false

  const legs = allMatches
    .filter((m) => m.stage === match.stage && m.slot === match.slot)
    .map((m) =>
      m.id === match.id
        ? { ...m, home_score: home, away_score: away, pens_home: null, pens_away: null }
        : m,
    )
  if (legs.length <= 1) return home === away
  return resolveTie(legs).needsPenalties
}

export function scoreText(m: Pick<Match, 'home_score' | 'away_score'>): string {
  return m.home_score === null || m.away_score === null ? 'vs' : `${m.home_score} - ${m.away_score}`
}

export function legLabel(m: Pick<Match, 'leg'>, twoLegged: boolean): string | null {
  if (!twoLegged) return null
  return m.leg === 1 ? 'Ida' : 'Vuelta'
}
