import { describe, expect, it } from 'vitest'
import {
  computeStats,
  headToHead,
  playedGames,
  ranking,
  rivalsOf,
  type StatsInput,
  type StatsMatch,
  type StatsMember,
} from './compute'

const mem = (id: string, t: string, user: string | null, name: string): StatsMember => ({
  id,
  tournament_id: t,
  user_id: user,
  display_name: name,
  profile: user ? { username: user, full_name: name, avatar_url: null } : null,
})

let n = 0
const match = (
  t: string,
  home: string | null,
  away: string | null,
  hs: number | null,
  as: number | null,
  extra: Partial<StatsMatch> = {},
): StatsMatch => ({
  id: `m${++n}`,
  tournament_id: t,
  stage: 'league',
  home_id: home,
  away_id: away,
  home_score: hs,
  away_score: as,
  status: hs === null ? 'scheduled' : 'played',
  played_at: `2026-10-${String(10 + n).padStart(2, '0')}T12:00:00Z`,
  created_at: '2026-10-01T00:00:00Z',
  ...extra,
})

// Dos torneos: ana, beto y leiner juegan ambos; "pepe" es un jugador sin cuenta.
const input: StatsInput = {
  tournaments: [
    { id: 'T1', name: 'Liga 1', type: 'league', status: 'finished', champion_member_id: 'a1', created_at: '2026-10-01' },
    { id: 'T2', name: 'Copa 2', type: 'cup', status: 'knockout', champion_member_id: null, created_at: '2026-10-20' },
  ],
  members: [
    mem('a1', 'T1', 'ana', 'Ana'),
    mem('b1', 'T1', 'beto', 'Beto'),
    mem('l1', 'T1', 'leiner', 'Leiner'),
    mem('p1', 'T1', null, 'Pepe'),
    mem('a2', 'T2', 'ana', 'Ana'),
    mem('b2', 'T2', 'beto', 'Beto'),
  ],
  matches: [
    match('T1', 'a1', 'b1', 3, 1), // Ana gana a Beto
    match('T1', 'b1', 'l1', 2, 2), // Beto empata con Leiner
    match('T1', 'l1', 'a1', 0, 1), // Ana gana a Leiner (visitante)
    match('T1', 'p1', 'a1', 0, 4), // Ana golea a Pepe (sin cuenta)
    match('T1', 'l1', 'p1', 5, null), // inválido: sin marcador de visitante -> se ignora
    match('T2', 'a2', 'b2', 1, 1), // empate Ana-Beto
    match('T2', 'b2', 'a2', 2, 0), // gana Beto
    match('T2', 'b2', 'a2', null, null), // por jugar
  ],
}

describe('playedGames', () => {
  it('solo cuenta partidos jugados con marcador y los dos lados', () => {
    const games = playedGames(input)
    expect(games).toHaveLength(6)
    expect(games.every((g) => g.tournamentName)).toBe(true)
  })

  it('ignora partidos de torneos o miembros desconocidos', () => {
    const bad: StatsInput = { ...input, matches: [match('TX', 'a1', 'b1', 1, 0), match('T1', 'zz', 'b1', 1, 0)] }
    expect(playedGames(bad)).toHaveLength(0)
  })
})

describe('computeStats', () => {
  const stats = computeStats(input)
  const by = (u: string) => stats.players.find((p) => p.userId === u)!

  it('acumula partidos, goles y puntos por usuario (también contra jugadores sin cuenta)', () => {
    const ana = by('ana')
    // 3-1 G, 1-0 G, 4-0 G (vs Pepe), 1-1 E, 0-2 P
    expect(ana).toMatchObject({ played: 5, won: 3, drawn: 1, lost: 1, gf: 9, ga: 4, gd: 5, points: 10 })
    expect(ana.gfAvg).toBeCloseTo(9 / 5)
    expect(ana.cleanSheets).toBe(2)
    expect(ana.tournaments).toBe(2)
  })

  it('no crea filas para jugadores sin cuenta', () => {
    expect(stats.players.map((p) => p.userId).sort()).toEqual(['ana', 'beto', 'leiner'])
  })

  it('cuenta los títulos solo de torneos finalizados', () => {
    expect(by('ana').titles).toBe(1)
    expect(by('beto').titles).toBe(0)
  })

  it('calcula efectividad sobre los puntos posibles', () => {
    expect(by('ana').effectiveness).toBeCloseTo((10 / 15) * 100)
    expect(by('leiner').effectiveness).toBeCloseTo((1 / 6) * 100)
  })

  it('calcula las marcas: mayor goleada y partido con más goles', () => {
    expect(stats.records.biggestWin?.value).toBe(4)
    expect(stats.records.biggestWin?.game.homeScore).toBe(0)
    expect(stats.records.mostGoals?.value).toBe(4)
  })
})

describe('ranking', () => {
  const { players } = computeStats(input)

  it('goleadores: por goles totales', () => {
    const r = ranking(players, 'goals')
    expect(r.map((x) => x.player.userId)).toEqual(['ana', 'beto', 'leiner'])
    expect(r[0].value).toBe(9)
  })

  it('victorias: por partidos ganados', () => {
    const r = ranking(players, 'wins')
    expect(r[0].player.userId).toBe('ana')
    expect(r[0].value).toBe(3)
  })

  it('títulos: solo quien tiene al menos uno', () => {
    expect(ranking(players, 'titles').map((x) => x.player.userId)).toEqual(['ana'])
  })

  it('defensa y efectividad exigen un mínimo de partidos', () => {
    const r = ranking(players, 'defense')
    expect(r.map((x) => x.player.userId)).toEqual(['ana', 'beto']) // leiner tiene 2 PJ
    expect(ranking(players, 'effectiveness')[0].player.userId).toBe('ana')
  })
})

describe('headToHead', () => {
  const { games } = computeStats(input)

  it('suma victorias, empates y goles entre dos usuarios en todos los torneos', () => {
    const h = headToHead(games, 'ana', 'beto')
    expect(h).toMatchObject({ played: 3, aWins: 1, draws: 1, bWins: 1, aGoals: 4, bGoals: 4 })
  })

  it('el marcador se ve desde A aunque haya jugado de visitante', () => {
    const h = headToHead(games, 'ana', 'leiner')
    expect(h.games).toHaveLength(1)
    expect(h.games[0]).toMatchObject({ aScore: 1, bScore: 0 })
  })

  it('es simétrico y ordena por fecha descendente', () => {
    const ab = headToHead(games, 'ana', 'beto')
    const ba = headToHead(games, 'beto', 'ana')
    expect(ba).toMatchObject({ aWins: ab.bWins, bWins: ab.aWins, aGoals: ab.bGoals })
    const dates = ab.games.map((g) => g.game.date)
    expect(dates).toEqual([...dates].sort().reverse())
  })

  it('devuelve vacío contra uno mismo o sin partidos', () => {
    expect(headToHead(games, 'ana', 'ana').played).toBe(0)
    expect(headToHead(games, 'beto', 'zzz').played).toBe(0)
  })
})

describe('rivalsOf', () => {
  it('ordena por partidos enfrentados', () => {
    const { games } = computeStats(input)
    expect(rivalsOf(games, 'ana')).toEqual([
      { userId: 'beto', played: 3 },
      { userId: 'leiner', played: 1 },
    ])
  })
})
