import type { NewMatch } from '../types'
import { cryptoRng, shuffle, type Rng } from './rng'

/**
 * Calendario de todos contra todos con el método del círculo.
 * - Con número impar de jugadores se añade un descanso (ese jugador libra la jornada).
 * - Con `doubleLeg` se añade la segunda vuelta con local y visitante invertidos.
 * Los jugadores se barajan antes, así el calendario es aleatorio.
 */
export function roundRobin(
  memberIds: readonly string[],
  doubleLeg: boolean,
  rng: Rng = cryptoRng,
): NewMatch[] {
  if (memberIds.length < 2) return []
  const order: (string | null)[] = shuffle(memberIds, rng)
  if (order.length % 2 === 1) order.push(null) // descanso

  const n = order.length
  const roundsPerLeg = n - 1
  const firstLeg: NewMatch[] = []

  let ring = [...order]
  for (let r = 0; r < roundsPerLeg; r++) {
    let slot = 0
    for (let i = 0; i < n / 2; i++) {
      const a = ring[i]
      const b = ring[n - 1 - i]
      if (a === null || b === null) continue
      slot++
      // alterna local/visitante para equilibrar
      const flip = (r + i) % 2 === 1
      firstLeg.push({
        stage: 'league',
        round: r + 1,
        slot,
        leg: 1,
        home_id: flip ? b : a,
        away_id: flip ? a : b,
      })
    }
    // rota todos menos el primero
    ring = [ring[0], ring[n - 1], ...ring.slice(1, n - 1)]
  }

  if (!doubleLeg) return firstLeg

  const secondLeg: NewMatch[] = firstLeg.map((m) => ({
    ...m,
    round: m.round + roundsPerLeg,
    leg: 2,
    home_id: m.away_id,
    away_id: m.home_id,
  }))
  return [...firstLeg, ...secondLeg]
}

/** Cantidad de partidos de liga esperados. */
export function expectedLeagueMatches(players: number, doubleLeg: boolean): number {
  const single = (players * (players - 1)) / 2
  return doubleLeg ? single * 2 : single
}
