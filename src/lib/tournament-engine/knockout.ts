import type { KnockoutStage, Match, MatchStage, NewMatch } from '../types'
import { KNOCKOUT_ORDER } from '../types'
import { cryptoRng, shuffle, type Rng } from './rng'
import { isPlayed } from './standings'

export const KNOCKOUT_STAGES: readonly MatchStage[] = [...KNOCKOUT_ORDER, 'third_place']

export function isKnockoutStage(stage: MatchStage): stage is KnockoutStage {
  return KNOCKOUT_STAGES.includes(stage)
}

/** Tamaño de llave: siguiente potencia de 2 >= n (mínimo 2). */
export function bracketSizeFor(n: number): number {
  let size = 2
  while (size < n) size *= 2
  return size
}

/** Rondas (sin tercer puesto) de una llave de `size` plazas, de la primera a la final. */
export function stagesForSize(size: number): KnockoutStage[] {
  const rounds = Math.log2(size)
  return KNOCKOUT_ORDER.slice(KNOCKOUT_ORDER.length - rounds)
}

/** Rondas que tendrá un torneo con `participants` clasificados (con tercer puesto si aplica). */
export function stagesForParticipants(participants: number, thirdPlace: boolean): KnockoutStage[] {
  const stages = stagesForSize(bracketSizeFor(participants))
  if (!thirdPlace || !stages.includes('semi')) return stages
  const out: KnockoutStage[] = []
  for (const s of stages) {
    if (s === 'final') out.push('third_place')
    out.push(s)
  }
  return out
}

export type TwoLegged = (stage: KnockoutStage) => boolean

function makeTie(
  stage: KnockoutStage,
  slot: number,
  a: string | null,
  b: string | null,
  twoLegged: boolean,
): NewMatch[] {
  const legs: NewMatch[] = [
    { stage, round: 1, slot, leg: 1, home_id: a, away_id: b },
  ]
  if (twoLegged) legs.push({ stage, round: 1, slot, leg: 2, home_id: b, away_id: a })
  return legs
}

/**
 * Sorteo de la fase eliminatoria.
 * - Emparejamientos aleatorios en la primera ronda.
 * - Si el número de participantes no es potencia de 2 se reparten "byes" aleatorios:
 *   esos jugadores pasan directamente a la siguiente ronda.
 * - Genera la llave completa (rondas posteriores con plazas vacías) y el tercer puesto.
 */
export function drawKnockout(
  participantIds: readonly string[],
  twoLegged: TwoLegged,
  thirdPlace: boolean,
  rng: Rng = cryptoRng,
): NewMatch[] {
  const n = participantIds.length
  if (n < 2) return []

  const size = bracketSizeFor(n)
  const stages = stagesForSize(size)
  const byes = size - n
  const firstSlots = size / 2

  const players = shuffle(participantIds, rng)
  const slotOrder = shuffle(
    Array.from({ length: firstSlots }, (_, i) => i + 1),
    rng,
  )
  const byeSlots = new Set(slotOrder.slice(0, byes))

  const out: NewMatch[] = []
  // plazas conocidas de la segunda ronda: slot -> [A, B]
  const seeded = new Map<number, [string | null, string | null]>()

  let cursor = 0
  for (let slot = 1; slot <= firstSlots; slot++) {
    if (byeSlots.has(slot)) {
      const id = players[cursor++]
      const next = Math.ceil(slot / 2)
      const sides = seeded.get(next) ?? [null, null]
      sides[slot % 2 === 1 ? 0 : 1] = id
      seeded.set(next, sides)
    } else {
      const a = players[cursor++]
      const b = players[cursor++]
      out.push(...makeTie(stages[0], slot, a, b, twoLegged(stages[0])))
    }
  }

  for (let i = 1; i < stages.length; i++) {
    const stage = stages[i]
    const slots = size / 2 ** (i + 1)
    for (let slot = 1; slot <= slots; slot++) {
      const [a, b] = i === 1 ? (seeded.get(slot) ?? [null, null]) : [null, null]
      out.push(...makeTie(stage, slot, a, b, twoLegged(stage)))
    }
  }

  if (thirdPlace && stages.includes('semi')) {
    out.push(...makeTie('third_place', 1, null, null, false))
  }
  return out
}

/* ------------------------------------------------------------------ */
/* Eliminatorias: resultado de una llave (partido único o ida y vuelta) */
/* ------------------------------------------------------------------ */

export type TieDecision = 'score' | 'aggregate' | 'away_goals' | 'penalties'

export interface TieResult {
  /** Todos los partidos jugados y hay un ganador. */
  complete: boolean
  /** Todos los partidos jugados pero hay empate total: faltan penales. */
  needsPenalties: boolean
  winnerId: string | null
  loserId: string | null
  goalsA: number
  goalsB: number
  decidedBy: TieDecision | null
}

export interface Tie {
  key: string
  stage: KnockoutStage
  slot: number
  legs: Match[]
  /** Participante A (local de la ida) y B (visitante de la ida). */
  a: string | null
  b: string | null
  result: TieResult
}

const EMPTY_RESULT: TieResult = {
  complete: false,
  needsPenalties: false,
  winnerId: null,
  loserId: null,
  goalsA: 0,
  goalsB: 0,
  decidedBy: null,
}

/**
 * Decide una llave. Criterios: marcador global, goles de visitante (solo ida y vuelta)
 * y penales (registrados en el último partido jugado de la llave).
 */
export function resolveTie(legs: readonly Match[]): TieResult {
  const ordered = [...legs].sort((x, y) => x.leg - y.leg)
  const first = ordered[0]
  if (!first || !first.home_id || !first.away_id) return { ...EMPTY_RESULT }
  const a = first.home_id
  const b = first.away_id

  let goalsA = 0
  let goalsB = 0
  let awayA = 0
  let awayB = 0
  for (const m of ordered) {
    if (!isPlayed(m)) continue
    const hs = m.home_score!
    const as = m.away_score!
    if (m.home_id === a) {
      goalsA += hs
      goalsB += as
      awayB += as
    } else {
      goalsA += as
      goalsB += hs
      awayA += as
    }
  }

  const allPlayed = ordered.every(isPlayed)
  const base: TieResult = { ...EMPTY_RESULT, goalsA, goalsB }
  if (!allPlayed) return base

  const two = ordered.length > 1
  const win = (id: string, by: TieDecision): TieResult => ({
    ...base,
    complete: true,
    winnerId: id,
    loserId: id === a ? b : a,
    decidedBy: by,
  })

  if (goalsA !== goalsB) return win(goalsA > goalsB ? a : b, two ? 'aggregate' : 'score')
  if (two && awayA !== awayB) return win(awayA > awayB ? a : b, 'away_goals')

  // penales: último partido que los tenga registrados
  for (let i = ordered.length - 1; i >= 0; i--) {
    const m = ordered[i]
    if (m.pens_home !== null && m.pens_away !== null && m.pens_home !== m.pens_away) {
      const homeWins = m.pens_home > m.pens_away
      return win(homeWins ? m.home_id! : m.away_id!, 'penalties')
    }
  }
  return { ...base, needsPenalties: true }
}

/** Agrupa los partidos eliminatorios en llaves. */
export function buildTies(matches: readonly Match[]): Tie[] {
  const groups = new Map<string, Match[]>()
  for (const m of matches) {
    if (!isKnockoutStage(m.stage)) continue
    const key = `${m.stage}:${m.slot}`
    const list = groups.get(key)
    if (list) list.push(m)
    else groups.set(key, [m])
  }
  const ties: Tie[] = []
  for (const [key, legs] of groups) {
    legs.sort((x, y) => x.leg - y.leg)
    const first = legs[0]
    ties.push({
      key,
      stage: first.stage as KnockoutStage,
      slot: first.slot,
      legs,
      a: first.home_id,
      b: first.away_id,
      result: resolveTie(legs),
    })
  }
  return ties.sort((x, y) => stageRank(x.stage) - stageRank(y.stage) || x.slot - y.slot)
}

/** Orden de presentación: ... semifinales, tercer puesto, final. */
export function stageRank(stage: MatchStage): number {
  if (stage === 'third_place') return KNOCKOUT_ORDER.indexOf('final') - 0.5
  if (stage === 'league') return -2
  if (stage === 'tiebreak') return -1
  return KNOCKOUT_ORDER.indexOf(stage)
}

export interface BracketUpdate {
  matchId: string
  home_id: string | null
  away_id: string | null
}

export interface BracketProgress {
  /** Asignaciones de participantes en rondas siguientes. */
  updates: BracketUpdate[]
  championId: string | null
  runnerUpId: string | null
  thirdId: string | null
}

/**
 * Calcula qué debe pasar tras registrar resultados:
 * ganadores a la siguiente ronda, perdedores de semifinales al tercer puesto y campeón.
 * No toca llaves que ya tienen algún partido jugado.
 */
export function computeBracketProgress(matches: readonly Match[]): BracketProgress {
  const ties = buildTies(matches)
  const byKey = new Map(ties.map((t) => [t.key, t]))
  const updates: BracketUpdate[] = []

  const stages = KNOCKOUT_ORDER.filter((s) => ties.some((t) => t.stage === s))

  const applySides = (target: Tie, a: string | null, b: string | null) => {
    if (target.legs.some(isPlayed)) return
    for (const leg of target.legs) {
      const home = leg.leg === 1 ? a : b
      const away = leg.leg === 1 ? b : a
      if (leg.home_id !== home || leg.away_id !== away) {
        updates.push({ matchId: leg.id, home_id: home, away_id: away })
      }
    }
  }

  for (let i = 1; i < stages.length; i++) {
    const prev = stages[i - 1]
    const stage = stages[i]
    for (const target of ties.filter((t) => t.stage === stage)) {
      const feederA = byKey.get(`${prev}:${target.slot * 2 - 1}`)
      const feederB = byKey.get(`${prev}:${target.slot * 2}`)
      // Sin llave previa (bye) se conserva la plaza sembrada en el sorteo.
      const a = feederA ? feederA.result.winnerId : target.a
      const b = feederB ? feederB.result.winnerId : target.b
      applySides(target, a, b)
    }
  }

  const third = byKey.get('third_place:1')
  if (third) {
    const s1 = byKey.get('semi:1')
    const s2 = byKey.get('semi:2')
    applySides(third, s1?.result.loserId ?? null, s2?.result.loserId ?? null)
  }

  const final = byKey.get('final:1')
  const thirdResult = third?.result
  return {
    updates,
    championId: final?.result.winnerId ?? null,
    runnerUpId: final?.result.loserId ?? null,
    thirdId: thirdResult?.winnerId ?? null,
  }
}

/**
 * Partidos de desempate (a partido único) entre todos los miembros empatados.
 * `startSlot` evita repetir el número de llave de desempates anteriores.
 */
export function buildTiebreakMatches(memberIds: readonly string[], startSlot = 1): NewMatch[] {
  const out: NewMatch[] = []
  let slot = startSlot
  for (let i = 0; i < memberIds.length; i++) {
    for (let j = i + 1; j < memberIds.length; j++) {
      out.push({
        stage: 'tiebreak',
        round: 1,
        slot: slot++,
        leg: 1,
        home_id: memberIds[i],
        away_id: memberIds[j],
      })
    }
  }
  return out
}
