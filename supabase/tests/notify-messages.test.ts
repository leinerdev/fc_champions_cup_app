import { describe, expect, it } from 'vitest'
import {
  championPayload,
  joinedPayload,
  knockoutPayload,
  nextPayload,
  parseEvent,
  resultPayload,
  startedPayload,
} from '../functions/notify/messages'

const T = '3f0c6a52-8d1e-4b7a-9c35-2a6e1f0b9d44'
const M1 = '11111111-1111-4111-8111-111111111111'
const M2 = '22222222-2222-4222-8222-222222222222'

describe('parseEvent', () => {
  it('acepta los eventos válidos', () => {
    expect(parseEvent({ type: 'result', tournament_id: T, match_id: M1 })).toEqual({
      type: 'result',
      tournament_id: T,
      match_id: M1,
      corrected: false,
    })
    expect(parseEvent({ type: 'result', tournament_id: T, match_id: M1, corrected: true })).toMatchObject({ corrected: true })
    expect(parseEvent({ type: 'next', tournament_id: T, match_ids: [M1, M2, M1] })).toEqual({
      type: 'next',
      tournament_id: T,
      match_ids: [M1, M2],
    })
    for (const type of ['started', 'knockout', 'champion', 'joined'] as const) {
      expect(parseEvent({ type, tournament_id: T })).toEqual({ type, tournament_id: T })
    }
  })

  it('rechaza cuerpos mal formados', () => {
    expect(parseEvent(null)).toBeNull()
    expect(parseEvent('x')).toBeNull()
    expect(parseEvent({ type: 'started' })).toBeNull()
    expect(parseEvent({ type: 'started', tournament_id: 'no-uuid' })).toBeNull()
    expect(parseEvent({ type: 'hackeo', tournament_id: T })).toBeNull()
    expect(parseEvent({ type: 'result', tournament_id: T })).toBeNull()
    expect(parseEvent({ type: 'result', tournament_id: T, match_id: 'x' })).toBeNull()
    expect(parseEvent({ type: 'next', tournament_id: T, match_ids: [] })).toBeNull()
    expect(parseEvent({ type: 'next', tournament_id: T, match_ids: ['x'] })).toBeNull()
    expect(parseEvent({ type: 'next', tournament_id: T, match_ids: Array(21).fill(M1) })).toBeNull()
  })
})

describe('textos', () => {
  const base = { tournamentId: T, tournamentName: 'Liga de los Cracks' }

  it('resultado, con penales y corregido', () => {
    const p = resultPayload({
      ...base,
      matchId: M1,
      stage: 'final',
      homeName: 'Ana',
      awayName: 'Beto',
      homeScore: 1,
      awayScore: 1,
      pensHome: 4,
      pensAway: 3,
      corrected: false,
    })
    expect(p.title).toBe('Resultado registrado')
    expect(p.body).toBe('Ana 1 - 1 Beto (pen. 4-3) · Liga de los Cracks')
    expect(p.url).toBe(`/torneos/${T}?tab=partidos`)
    expect(p.tag).toBe(`result:${M1}`)
    expect(
      resultPayload({ ...base, matchId: M1, stage: 'league', homeName: 'A', awayName: 'B', homeScore: 2, awayScore: 0, pensHome: null, pensAway: null, corrected: true }),
    ).toMatchObject({ title: 'Resultado corregido', body: 'A 2 - 0 B · Liga de los Cracks' })
  })

  it('siguiente partido usa el nombre de la ronda', () => {
    const p = nextPayload({ ...base, matchId: M1, stage: 'semi', opponentName: 'Carla' })
    expect(p.body).toBe('Semifinales: te enfrentas a Carla · Liga de los Cracks')
    expect(p.tag).toBe(`next:${M1}`)
  })

  it('inicio, eliminatorias, campeón y nuevo jugador', () => {
    expect(startedPayload({ ...base, type: 'league' })).toMatchObject({
      title: '¡Arrancó Liga de los Cracks!',
      url: `/torneos/${T}?tab=partidos`,
    })
    expect(startedPayload({ ...base, type: 'cup' }).url).toBe(`/torneos/${T}?tab=llaves`)
    expect(knockoutPayload(base).url).toBe(`/torneos/${T}?tab=llaves`)
    expect(championPayload({ ...base, championName: 'Ana' }).title).toBe('🏆 Ana es campeón')
    expect(joinedPayload({ ...base, playerName: 'Diego' }).body).toBe('Diego se unió a Liga de los Cracks.')
  })
})
