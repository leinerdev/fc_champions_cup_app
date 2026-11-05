import { describe, expect, it } from 'vitest'
import type { Match, NewMatch } from '../types'
import {
  blockingTies,
  bracketSizeFor,
  buildTiebreakMatches,
  buildTies,
  computeBracketProgress,
  computeStandings,
  drawKnockout,
  expectedLeagueMatches,
  resolveTie,
  roundRobin,
  seededRng,
  stagesForParticipants,
  stagesForSize,
  validateConfig,
} from './index'

let counter = 0
function toMatch(m: NewMatch, score?: [number, number], pens?: [number, number]): Match {
  return {
    id: `m${++counter}`,
    tournament_id: 't',
    stage: m.stage,
    round: m.round,
    slot: m.slot,
    leg: m.leg,
    home_id: m.home_id,
    away_id: m.away_id,
    home_score: score?.[0] ?? null,
    away_score: score?.[1] ?? null,
    pens_home: pens?.[0] ?? null,
    pens_away: pens?.[1] ?? null,
    status: score ? 'played' : 'scheduled',
    played_at: null,
    created_at: '',
  }
}

const ids = (n: number) => Array.from({ length: n }, (_, i) => `p${i + 1}`)

function league(home: string, away: string, hs: number, as: number, round = 1): Match {
  return toMatch({ stage: 'league', round, slot: 1, leg: 1, home_id: home, away_id: away }, [hs, as])
}

describe('roundRobin', () => {
  it.each([3, 4, 5, 6, 8, 9])('cada pareja se enfrenta una vez con %i jugadores', (n) => {
    const matches = roundRobin(ids(n), false, seededRng(n))
    expect(matches).toHaveLength(expectedLeagueMatches(n, false))
    const pairs = new Set(matches.map((m) => [m.home_id, m.away_id].sort().join('-')))
    expect(pairs.size).toBe(matches.length)
  })

  it('nadie juega dos veces en la misma jornada', () => {
    for (const n of [4, 5, 7, 8]) {
      const matches = roundRobin(ids(n), true, seededRng(7))
      const byRound = new Map<number, string[]>()
      for (const m of matches) {
        byRound.set(m.round, [...(byRound.get(m.round) ?? []), m.home_id!, m.away_id!])
      }
      for (const players of byRound.values()) expect(new Set(players).size).toBe(players.length)
    }
  })

  it('ida y vuelta duplica los partidos e invierte local/visitante', () => {
    const matches = roundRobin(ids(4), true, seededRng(1))
    expect(matches).toHaveLength(12)
    const first = matches.filter((m) => m.leg === 1)
    const second = matches.filter((m) => m.leg === 2)
    for (const m of first) {
      expect(second.some((s) => s.home_id === m.away_id && s.away_id === m.home_id)).toBe(true)
    }
    expect(Math.max(...matches.map((m) => m.round))).toBe(6)
  })

  it('con impares hay una jornada más y cada jugador descansa una vez', () => {
    const matches = roundRobin(ids(5), false, seededRng(3))
    expect(Math.max(...matches.map((m) => m.round))).toBe(5)
    for (const p of ids(5)) {
      expect(matches.filter((m) => m.home_id === p || m.away_id === p)).toHaveLength(4)
    }
  })
})

describe('computeStandings', () => {
  it('ordena por puntos y calcula estadísticas', () => {
    const matches = [league('p1', 'p2', 2, 0), league('p2', 'p3', 1, 1), league('p3', 'p1', 0, 3)]
    const { rows, complete } = computeStandings(ids(3), matches)
    expect(complete).toBe(true)
    expect(rows.map((r) => r.memberId)).toEqual(['p1', 'p2', 'p3'])
    expect(rows[0]).toMatchObject({ pts: 6, won: 2, gf: 5, ga: 0, gd: 5, played: 2 })
    expect(rows[1]).toMatchObject({ pts: 1, drawn: 1, lost: 1 })
  })

  it('desempata por diferencia de goles', () => {
    // p1 y p2 con 3 pts; p2 mejor diferencia
    const matches = [
      league('p1', 'p3', 1, 0),
      league('p2', 'p3', 4, 0),
      league('p1', 'p2', 0, 0),
    ]
    const { rows } = computeStandings(ids(3), matches)
    // p2: 4 pts (+4); p1: 4 pts (+1)
    expect(rows.map((r) => r.memberId)).toEqual(['p2', 'p1', 'p3'])
  })

  it('con igual puntos y diferencia, decide el enfrentamiento directo', () => {
    // p1 y p2: 6 pts, DG +1 cada uno; p1 le ganó a p2
    const matches = [
      league('p1', 'p2', 1, 0),
      league('p1', 'p3', 0, 1),
      league('p2', 'p3', 1, 0),
      league('p4', 'p1', 0, 1),
      league('p4', 'p2', 0, 1),
      league('p4', 'p3', 0, 0),
    ]
    // p1: W(p2) L(p3) W(p4) = 6 pts, GF 2 GA 1 -> +1
    // p2: L(p1) W(p3) W(p4) = 6 pts, GF 2 GA 1 -> +1
    // p3: W(p1) L(p2) D(p4) = 4 pts
    const { rows } = computeStandings(ids(4), matches)
    expect(rows.slice(0, 2).map((r) => r.memberId)).toEqual(['p1', 'p2'])
    expect(rows[0].pts).toBe(6)
    expect(rows[1].pts).toBe(6)
    expect(rows[0].gd).toBe(rows[1].gd)
  })

  it('el directo se evalúa solo entre los empatados (no en la tabla general)', () => {
    // p1, p2, p3 empatados a 4 pts y DG 0 entre sí gracias al ciclo; p4 pierde con todos
    const matches = [
      league('p1', 'p2', 1, 0),
      league('p2', 'p3', 1, 0),
      league('p3', 'p1', 1, 0),
      league('p1', 'p4', 1, 1),
      league('p2', 'p4', 1, 1),
      league('p3', 'p4', 1, 1),
    ]
    const { rows, unresolvedTies } = computeStandings(ids(4), matches)
    // p1,p2,p3: 3+1 = 4 pts, GF 3, GA 2... el ciclo no resuelve: empate triple sin resolver
    expect(rows.map((r) => r.memberId).slice(0, 3).sort()).toEqual(['p1', 'p2', 'p3'])
    expect(unresolvedTies).toHaveLength(1)
    expect(unresolvedTies[0]).toMatchObject({ from: 1, to: 3 })
    expect(rows[3].memberId).toBe('p4')
  })

  it('un partido de desempate resuelve el empate; con penales si empatan', () => {
    const base = [
      league('p1', 'p2', 1, 0),
      league('p2', 'p3', 1, 0),
      league('p3', 'p1', 1, 0),
    ]
    const tie = computeStandings(['p1', 'p2', 'p3'], base)
    expect(tie.unresolvedTies).toHaveLength(1)

    // desempate p1 vs p2: gana p2 por penales tras 1-1 (los tres siguen empatados
    // entre sí, el mini-torneo de desempates define el orden)
    const tbs = buildTiebreakMatches(['p1', 'p2', 'p3']).map((m) => {
      if (m.home_id === 'p1' && m.away_id === 'p2') return toMatch(m, [1, 1], [3, 4])
      if (m.home_id === 'p1' && m.away_id === 'p3') return toMatch(m, [2, 0])
      return toMatch(m, [0, 1]) // p2 vs p3 -> p3 gana
    })
    // p1: gana a p3, pierde con p2 (pens) -> 3 pts; p2: gana a p1 (pens), pierde con p3 -> 3; p3: gana p2, pierde p1 -> 3
    // sigue en ciclo: aún sin resolver
    expect(computeStandings(['p1', 'p2', 'p3'], [...base, ...tbs]).unresolvedTies).toHaveLength(1)

    // con un orden claro sí se resuelve
    const clear = buildTiebreakMatches(['p1', 'p2', 'p3']).map((m) => toMatch(m, [2, 0])) // local siempre gana
    const res = computeStandings(['p1', 'p2', 'p3'], [...base, ...clear])
    expect(res.unresolvedTies).toHaveLength(0)
    expect(res.rows.map((r) => r.memberId)).toEqual(['p1', 'p2', 'p3'])
  })

  it('desempate directo entre dos: resuelve y no reporta empate', () => {
    // p1 y p2 empatados totalmente (se empataron entre sí y mismo resto)
    const matches = [
      league('p1', 'p2', 1, 1),
      league('p1', 'p3', 1, 0),
      league('p2', 'p3', 1, 0),
    ]
    const before = computeStandings(ids(3), matches)
    expect(before.unresolvedTies).toHaveLength(1)
    expect(before.unresolvedTies[0].memberIds.sort()).toEqual(['p1', 'p2'])

    const tb = toMatch(buildTiebreakMatches(['p1', 'p2'])[0], [0, 0], [2, 5])
    const after = computeStandings(ids(3), [...matches, tb])
    expect(after.unresolvedTies).toHaveLength(0)
    expect(after.rows.map((r) => r.memberId)).toEqual(['p2', 'p1', 'p3'])
  })

  it('no reporta empates mientras la liga no esté completa', () => {
    const pending = toMatch({ stage: 'league', round: 2, slot: 1, leg: 1, home_id: 'p1', away_id: 'p3' })
    const { complete, unresolvedTies } = computeStandings(ids(3), [league('p1', 'p2', 1, 1), pending])
    expect(complete).toBe(false)
    expect(unresolvedTies).toHaveLength(0)
  })

  it('blockingTies solo marca empates que cruzan la línea de clasificación', () => {
    const ties = [
      { memberIds: ['a', 'b'], from: 2, to: 3 },
      { memberIds: ['c', 'd'], from: 5, to: 6 },
    ]
    expect(blockingTies(ties, 2)).toHaveLength(1) // el 2º y el 3º: cruza la línea de 2
    expect(blockingTies(ties, 4)).toHaveLength(0) // 4 -> ninguno cruza
    expect(blockingTies(ties, 5)).toHaveLength(1) // 5 y 6 cruzan
  })
})

describe('knockout: tamaños y rondas', () => {
  it('bracketSizeFor / stagesForSize', () => {
    expect(bracketSizeFor(2)).toBe(2)
    expect(bracketSizeFor(6)).toBe(8)
    expect(bracketSizeFor(16)).toBe(16)
    expect(bracketSizeFor(18)).toBe(32)
    expect(stagesForSize(2)).toEqual(['final'])
    expect(stagesForSize(4)).toEqual(['semi', 'final'])
    expect(stagesForSize(8)).toEqual(['quarter', 'semi', 'final'])
    expect(stagesForSize(32)).toEqual(['round_of_32', 'round_of_16', 'quarter', 'semi', 'final'])
  })

  it('tercer puesto antes de la final solo si hay semifinales', () => {
    expect(stagesForParticipants(4, true)).toEqual(['semi', 'third_place', 'final'])
    expect(stagesForParticipants(2, true)).toEqual(['final'])
    expect(stagesForParticipants(8, false)).toEqual(['quarter', 'semi', 'final'])
  })
})

describe('drawKnockout', () => {
  const single = () => false
  const double = () => true

  it('8 participantes: 4 cuartos, 2 semis y final, todos distintos', () => {
    const ms = drawKnockout(ids(8), single, false, seededRng(11))
    expect(ms.filter((m) => m.stage === 'quarter')).toHaveLength(4)
    expect(ms.filter((m) => m.stage === 'semi')).toHaveLength(2)
    expect(ms.filter((m) => m.stage === 'final')).toHaveLength(1)
    const qPlayers = ms.filter((m) => m.stage === 'quarter').flatMap((m) => [m.home_id, m.away_id])
    expect(new Set(qPlayers).size).toBe(8)
    for (const m of ms.filter((m) => m.stage !== 'quarter')) {
      expect(m.home_id).toBeNull()
      expect(m.away_id).toBeNull()
    }
  })

  it('el sorteo es aleatorio (distintas semillas, distintos cruces)', () => {
    const key = (seed: number) =>
      drawKnockout(ids(8), single, false, seededRng(seed))
        .filter((m) => m.stage === 'quarter')
        .map((m) => `${m.home_id}-${m.away_id}`)
        .join('|')
    expect(new Set([1, 2, 3, 4, 5].map(key)).size).toBeGreaterThan(1)
  })

  it('ida y vuelta: dos partidos por llave con local/visitante invertidos', () => {
    const ms = drawKnockout(ids(4), double, false, seededRng(5))
    const semis = ms.filter((m) => m.stage === 'semi')
    expect(semis).toHaveLength(4)
    const leg1 = semis.find((m) => m.slot === 1 && m.leg === 1)!
    const leg2 = semis.find((m) => m.slot === 1 && m.leg === 2)!
    expect(leg2.home_id).toBe(leg1.away_id)
    expect(leg2.away_id).toBe(leg1.home_id)
    expect(ms.filter((m) => m.stage === 'final')).toHaveLength(2)
  })

  it('tercer puesto: partido único, solo si hay semifinales', () => {
    expect(drawKnockout(ids(4), double, true, seededRng(1)).filter((m) => m.stage === 'third_place')).toHaveLength(1)
    expect(drawKnockout(ids(2), single, true, seededRng(1)).filter((m) => m.stage === 'third_place')).toHaveLength(0)
  })

  it('6 participantes: 2 byes aleatorios pasan directo a semifinales', () => {
    const ms = drawKnockout(ids(6), single, false, seededRng(21))
    const quarters = ms.filter((m) => m.stage === 'quarter')
    expect(quarters).toHaveLength(2) // 2 llaves reales, 2 byes
    const semis = ms.filter((m) => m.stage === 'semi')
    expect(semis).toHaveLength(2)
    const seeded = semis.flatMap((m) => [m.home_id, m.away_id]).filter(Boolean)
    expect(seeded).toHaveLength(2) // los dos byes ya están sembrados
    const all = new Set([...quarters.flatMap((m) => [m.home_id, m.away_id]), ...seeded])
    expect(all.size).toBe(6)
  })

  it('10 y 12 participantes también cuadran', () => {
    for (const n of [10, 12, 14, 18]) {
      const ms = drawKnockout(ids(n), single, false, seededRng(n))
      const first = stagesForSize(bracketSizeFor(n))[0]
      const real = ms.filter((m) => m.stage === first).flatMap((m) => [m.home_id, m.away_id])
      const seeded = ms
        .filter((m) => m.stage !== first)
        .flatMap((m) => [m.home_id, m.away_id])
        .filter(Boolean)
      expect(new Set([...real, ...seeded]).size).toBe(n)
    }
  })
})

describe('resolveTie', () => {
  const leg = (n: number, h: string, a: string, hs?: number, as?: number, pens?: [number, number]) =>
    toMatch(
      { stage: 'semi', round: 1, slot: 1, leg: n, home_id: h, away_id: a },
      hs === undefined ? undefined : [hs, as!],
      pens,
    )

  it('partido único: gana el del marcador', () => {
    const r = resolveTie([leg(1, 'a', 'b', 2, 1)])
    expect(r).toMatchObject({ complete: true, winnerId: 'a', loserId: 'b', decidedBy: 'score' })
  })

  it('partido único empatado: pide penales y luego decide por ellos', () => {
    expect(resolveTie([leg(1, 'a', 'b', 1, 1)])).toMatchObject({ complete: false, needsPenalties: true })
    expect(resolveTie([leg(1, 'a', 'b', 1, 1, [4, 5])])).toMatchObject({
      complete: true,
      winnerId: 'b',
      decidedBy: 'penalties',
    })
  })

  it('ida y vuelta: marcador global', () => {
    const r = resolveTie([leg(1, 'a', 'b', 2, 0), leg(2, 'b', 'a', 2, 1)])
    expect(r).toMatchObject({ complete: true, winnerId: 'a', goalsA: 3, goalsB: 2, decidedBy: 'aggregate' })
  })

  it('ida y vuelta: no está completa hasta jugar ambos partidos', () => {
    const r = resolveTie([leg(1, 'a', 'b', 2, 0), leg(2, 'b', 'a')])
    expect(r.complete).toBe(false)
    expect(r.needsPenalties).toBe(false)
  })

  it('global empatado: gana quien marcó más goles de visitante', () => {
    // a: 1-2 en casa de b (marca 2 de visita) ... ida: a(1) vs b(2); vuelta en casa de b? no: b es local en la vuelta
    // ida: a 1-2 b ; vuelta: b 1-2 a -> global 3-3; goles de visitante: a marcó 2 (visita en vuelta), b marcó 2 (visita en ida) -> igual
    // ajustamos: ida a 0-1 b ; vuelta b 1-2 a -> global 2-2; visitante: a 2, b 1 -> gana a
    const r = resolveTie([leg(1, 'a', 'b', 0, 1), leg(2, 'b', 'a', 1, 2)])
    expect(r).toMatchObject({ complete: true, winnerId: 'a', decidedBy: 'away_goals' })
  })

  it('global y visitante empatados: penales en el último partido', () => {
    // ida a 1-1 b; vuelta b 1-1 a -> global 2-2, visitante 1-1
    const pending = resolveTie([leg(1, 'a', 'b', 1, 1), leg(2, 'b', 'a', 1, 1)])
    expect(pending).toMatchObject({ complete: false, needsPenalties: true })
    // penales registrados en el partido de vuelta (local = b)
    const done = resolveTie([leg(1, 'a', 'b', 1, 1), leg(2, 'b', 'a', 1, 1, [3, 4])])
    expect(done).toMatchObject({ complete: true, winnerId: 'a', decidedBy: 'penalties' })
  })

  it('sin participantes la llave no está completa', () => {
    expect(resolveTie([toMatch({ stage: 'semi', round: 1, slot: 1, leg: 1, home_id: null, away_id: null })])).toMatchObject({
      complete: false,
    })
  })
})

describe('computeBracketProgress', () => {
  /** Simula un torneo reproduciendo resultados con `home` siempre ganador salvo override. */
  function play(
    matches: Match[],
    decide: (m: Match) => [number, number] | undefined = () => [2, 0],
  ): Match[] {
    return matches.map((m) => {
      if (m.home_score !== null || !m.home_id || !m.away_id) return m
      const s = decide(m)
      return s ? { ...m, home_score: s[0], away_score: s[1], status: 'played' as const } : m
    })
  }

  function applyUpdates(matches: Match[]): { matches: Match[]; changed: boolean } {
    const progress = computeBracketProgress(matches)
    if (progress.updates.length === 0) return { matches, changed: false }
    const map = new Map(progress.updates.map((u) => [u.matchId, u]))
    return {
      matches: matches.map((m) => (map.has(m.id) ? { ...m, home_id: map.get(m.id)!.home_id, away_id: map.get(m.id)!.away_id } : m)),
      changed: true,
    }
  }

  function simulate(matches: Match[], decide?: (m: Match) => [number, number] | undefined) {
    let current = matches
    for (let i = 0; i < 20; i++) {
      current = play(current, decide)
      const { matches: next, changed } = applyUpdates(current)
      current = next
      if (!changed && play(current, decide) === current) break
      if (!changed && current.every((m) => m.home_score !== null || !m.home_id || !m.away_id)) break
    }
    return current
  }

  it('copa de 8: avanza hasta el campeón con partido único', () => {
    const drawn = drawKnockout(ids(8), () => false, false, seededRng(2)).map((m) => toMatch(m))
    const final = simulate(drawn)
    const progress = computeBracketProgress(final)
    expect(progress.championId).not.toBeNull()
    expect(final.every((m) => m.home_score !== null)).toBe(true)
    // el campeón jugó 3 partidos y ganó todos
    const champ = progress.championId!
    const games = final.filter((m) => m.home_id === champ || m.away_id === champ)
    expect(games).toHaveLength(3)
  })

  it('llaves de ida y vuelta: la ronda siguiente solo se rellena al terminar la vuelta', () => {
    const drawn = drawKnockout(ids(4), () => true, false, seededRng(9)).map((m) => toMatch(m))
    // se juega solo la ida de la semifinal 1
    const semi1Leg1 = drawn.find((m) => m.stage === 'semi' && m.slot === 1 && m.leg === 1)!
    const afterLeg1 = drawn.map((m) => (m.id === semi1Leg1.id ? { ...m, home_score: 3, away_score: 0 } : m))
    expect(computeBracketProgress(afterLeg1).updates).toHaveLength(0)

    const semi1Leg2 = drawn.find((m) => m.stage === 'semi' && m.slot === 1 && m.leg === 2)!
    const afterLeg2 = afterLeg1.map((m) => (m.id === semi1Leg2.id ? { ...m, home_score: 1, away_score: 0 } : m))
    const { updates } = computeBracketProgress(afterLeg2)
    // ida: local gana 3-0; vuelta: el local de la ida visita y pierde 0-1 -> global 3-1 para el local de la ida
    const winner = semi1Leg1.home_id
    const finalLeg1 = updates.find((u) => u.matchId === drawn.find((m) => m.stage === 'final' && m.leg === 1)!.id)!
    const finalLeg2 = updates.find((u) => u.matchId === drawn.find((m) => m.stage === 'final' && m.leg === 2)!.id)!
    expect(finalLeg1.home_id).toBe(winner)
    expect(finalLeg1.away_id).toBeNull()
    expect(finalLeg2.away_id).toBe(winner)
  })

  it('byes: los sembrados en la segunda ronda se conservan', () => {
    const drawn = drawKnockout(ids(6), () => false, false, seededRng(4)).map((m) => toMatch(m))
    const firstUpdates = computeBracketProgress(drawn).updates
    expect(firstUpdates).toHaveLength(0) // nada que cambiar antes de jugar
    const final = simulate(drawn)
    expect(computeBracketProgress(final).championId).not.toBeNull()
    expect(final.filter((m) => m.stage === 'quarter')).toHaveLength(2)
  })

  it('tercer puesto: recibe a los perdedores de semifinales', () => {
    const drawn = drawKnockout(ids(4), () => false, true, seededRng(6)).map((m) => toMatch(m))
    // solo se juegan las semifinales (la final y el tercer puesto quedan pendientes)
    const afterSemis = simulate(drawn, (m) => (m.stage === 'semi' ? [1, 0] : undefined))
    const semis = afterSemis.filter((m) => m.stage === 'semi')
    const losers = semis.map((m) => m.away_id).sort()
    const third = afterSemis.find((m) => m.stage === 'third_place')!
    expect([third.home_id, third.away_id].sort()).toEqual(losers)
    const finalM = afterSemis.find((m) => m.stage === 'final')!
    expect([finalM.home_id, finalM.away_id].sort()).toEqual(semis.map((m) => m.home_id).sort())
  })

  it('no toca llaves cuya ronda ya se jugó', () => {
    const drawn = drawKnockout(ids(4), () => false, false, seededRng(8)).map((m) => toMatch(m))
    const played = simulate(drawn)
    // corregir una semifinal después de jugada la final no modifica la final jugada
    const tampered = played.map((m) =>
      m.stage === 'semi' && m.slot === 1 ? { ...m, home_score: 0, away_score: 5 } : m,
    )
    expect(computeBracketProgress(tampered).updates).toHaveLength(0)
  })

  it('campeón por penales en la final', () => {
    const drawn = drawKnockout(ids(2), () => false, false, seededRng(3))
    const final = toMatch(drawn[0], [1, 1], [5, 4])
    const progress = computeBracketProgress([final])
    expect(progress.championId).toBe(final.home_id)
    expect(progress.runnerUpId).toBe(final.away_id)
  })

  it('buildTies agrupa por ronda y orden de presentación', () => {
    const drawn = drawKnockout(ids(8), () => false, true, seededRng(1)).map((m) => toMatch(m))
    const ties = buildTies(drawn)
    expect(ties.map((t) => t.stage)).toEqual([
      'quarter', 'quarter', 'quarter', 'quarter', 'semi', 'semi', 'third_place', 'final',
    ])
  })
})

describe('liguilla completa: liga -> semifinales -> campeón', () => {
  it('flujo de extremo a extremo', () => {
    const players = ids(6)
    // liga a una vuelta: gana siempre el de menor número (p1 > p2 > ...)
    const fixtures = roundRobin(players, false, seededRng(42)).map((m) => {
      const h = Number(m.home_id!.slice(1))
      const a = Number(m.away_id!.slice(1))
      return toMatch(m, h < a ? [2, 0] : [0, 2])
    })
    expect(fixtures).toHaveLength(15)

    const standings = computeStandings(players, fixtures)
    expect(standings.complete).toBe(true)
    expect(standings.unresolvedTies).toHaveLength(0)
    expect(standings.rows.map((r) => r.memberId)).toEqual(players)

    const qualified = standings.rows.slice(0, 4).map((r) => r.memberId)
    const ko = drawKnockout(qualified, () => true, true, seededRng(1)).map((m) => toMatch(m))
    expect(ko.filter((m) => m.stage === 'semi')).toHaveLength(4) // 2 llaves x ida y vuelta
    expect(ko.filter((m) => m.stage === 'third_place')).toHaveLength(1)
    expect(ko.filter((m) => m.stage === 'final')).toHaveLength(2)
    const semiPlayers = ko.filter((m) => m.stage === 'semi').flatMap((m) => [m.home_id, m.away_id])
    expect(new Set(semiPlayers)).toEqual(new Set(qualified))
  })
})

describe('validateConfig', () => {
  const k = { two_legged: {}, third_place: false }
  it('valida copa', () => {
    expect(validateConfig('cup', { size: 8, knockout: k })).toBeNull()
    expect(validateConfig('cup', { size: 7, knockout: k })).toMatch(/par/)
    expect(validateConfig('cup', { size: 40, knockout: k })).toMatch(/entre/)
  })
  it('valida liga', () => {
    const ok = { size: 6, league: { double_leg: false, advance_count: 4 }, knockout: k }
    expect(validateConfig('league', ok)).toBeNull()
    expect(validateConfig('league', { ...ok, league: { double_leg: false, advance_count: 3 } })).toMatch(/par/)
    expect(validateConfig('league', { ...ok, league: { double_leg: false, advance_count: 8 } })).toMatch(/más/)
    expect(validateConfig('league', { ...ok, size: 2 })).toMatch(/entre/)
  })
})
