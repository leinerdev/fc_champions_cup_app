import type { Match } from '../types'

export interface StandingRow {
  memberId: string
  position: number
  played: number
  won: number
  drawn: number
  lost: number
  gf: number
  ga: number
  gd: number
  pts: number
  /** true si sigue empatado con otros tras todos los criterios (hace falta desempate). */
  tied: boolean
}

export interface UnresolvedTie {
  memberIds: string[]
  /** Posiciones (1-based) que ocupa el grupo empatado. */
  from: number
  to: number
}

export interface StandingsResult {
  rows: StandingRow[]
  /** Todos los partidos de liga jugados. */
  complete: boolean
  /** Empates sin resolver (solo se reportan cuando la liga está completa). */
  unresolvedTies: UnresolvedTie[]
}

export const POINTS = { win: 3, draw: 1, loss: 0 } as const

export function isPlayed(m: Pick<Match, 'home_score' | 'away_score'>): boolean {
  return m.home_score !== null && m.away_score !== null
}

/** Ganador de un partido concreto (usa penales si hay empate). null = sin ganador. */
export function matchWinnerId(m: Match): string | null {
  if (!isPlayed(m) || !m.home_id || !m.away_id) return null
  if (m.home_score! > m.away_score!) return m.home_id
  if (m.home_score! < m.away_score!) return m.away_id
  if (m.pens_home !== null && m.pens_away !== null && m.pens_home !== m.pens_away) {
    return m.pens_home > m.pens_away ? m.home_id : m.away_id
  }
  return null
}

interface Mini {
  pts: number
  gd: number
}

/** Mini-tabla (solo partidos entre `ids`). `byPens` usa los penales para decidir empates (desempates). */
function miniTable(
  ids: string[],
  matches: Match[],
  byPens: boolean,
): Map<string, Mini> {
  const set = new Set(ids)
  const table = new Map<string, Mini>(ids.map((id) => [id, { pts: 0, gd: 0 }]))
  for (const m of matches) {
    if (!isPlayed(m) || !m.home_id || !m.away_id) continue
    if (!set.has(m.home_id) || !set.has(m.away_id)) continue
    const h = table.get(m.home_id)!
    const a = table.get(m.away_id)!
    const hs = m.home_score!
    const as = m.away_score!
    h.gd += hs - as
    a.gd += as - hs
    let winner: string | null = null
    if (byPens) winner = matchWinnerId(m)
    else if (hs > as) winner = m.home_id
    else if (hs < as) winner = m.away_id
    if (winner === m.home_id) h.pts += POINTS.win
    else if (winner === m.away_id) a.pts += POINTS.win
    else {
      h.pts += POINTS.draw
      a.pts += POINTS.draw
    }
  }
  return table
}

/** Divide `ids` en bloques ordenados por (pts, gd) de la mini-tabla. */
function splitByMini(ids: string[], table: Map<string, Mini>, useGd: boolean): string[][] {
  const sorted = [...ids].sort((x, y) => {
    const a = table.get(x)!
    const b = table.get(y)!
    return b.pts - a.pts || (useGd ? b.gd - a.gd : 0)
  })
  const blocks: string[][] = []
  for (const id of sorted) {
    const last = blocks[blocks.length - 1]
    const ref = last?.[0]
    if (
      last &&
      table.get(ref)!.pts === table.get(id)!.pts &&
      (!useGd || table.get(ref)!.gd === table.get(id)!.gd)
    ) {
      last.push(id)
    } else {
      blocks.push([id])
    }
  }
  return blocks
}

/**
 * Resuelve un grupo empatado en puntos y diferencia de goles.
 * 1) Enfrentamiento directo (mini-tabla entre los empatados), recursivo para subgrupos.
 * 2) Partidos de desempate ('tiebreak') jugados entre ellos.
 * Devuelve bloques ordenados; un bloque con más de un id sigue empatado.
 */
function resolveGroup(ids: string[], league: Match[], tiebreaks: Match[]): string[][] {
  if (ids.length <= 1) return [ids]

  const h2h = splitByMini(ids, miniTable(ids, league, false), true)
  if (h2h.length > 1) return h2h.flatMap((block) => resolveGroup(block, league, tiebreaks))

  const tb = splitByMini(ids, miniTable(ids, tiebreaks, true), false)
  if (tb.length > 1) return tb.flatMap((block) => resolveGroup(block, league, tiebreaks))

  return [ids]
}

export function computeStandings(
  memberIds: readonly string[],
  matches: readonly Match[],
): StandingsResult {
  const league = matches.filter((m) => m.stage === 'league')
  const tiebreaks = matches.filter((m) => m.stage === 'tiebreak')

  const stats = new Map<string, Omit<StandingRow, 'position' | 'tied'>>()
  for (const id of memberIds) {
    stats.set(id, { memberId: id, played: 0, won: 0, drawn: 0, lost: 0, gf: 0, ga: 0, gd: 0, pts: 0 })
  }

  for (const m of league) {
    if (!isPlayed(m) || !m.home_id || !m.away_id) continue
    const h = stats.get(m.home_id)
    const a = stats.get(m.away_id)
    if (!h || !a) continue
    const hs = m.home_score!
    const as = m.away_score!
    h.played++
    a.played++
    h.gf += hs
    h.ga += as
    a.gf += as
    a.ga += hs
    if (hs > as) {
      h.won++
      a.lost++
      h.pts += POINTS.win
    } else if (hs < as) {
      a.won++
      h.lost++
      a.pts += POINTS.win
    } else {
      h.drawn++
      a.drawn++
      h.pts += POINTS.draw
      a.pts += POINTS.draw
    }
  }
  for (const s of stats.values()) s.gd = s.gf - s.ga

  // 1) puntos, 2) diferencia de goles -> grupos
  const base = [...stats.values()].sort((x, y) => y.pts - x.pts || y.gd - x.gd)
  const groups: string[][] = []
  for (const s of base) {
    const last = groups[groups.length - 1]
    if (last) {
      const ref = stats.get(last[0])!
      if (ref.pts === s.pts && ref.gd === s.gd) {
        last.push(s.memberId)
        continue
      }
    }
    groups.push([s.memberId])
  }

  // 3) enfrentamiento directo y partidos de desempate dentro de cada grupo
  const blocks = groups.flatMap((g) => resolveGroup(g, league, tiebreaks))

  const complete = league.length > 0 && league.every(isPlayed)
  const rows: StandingRow[] = []
  const unresolvedTies: UnresolvedTie[] = []
  let position = 1
  for (const block of blocks) {
    const tied = block.length > 1
    if (tied && complete) {
      unresolvedTies.push({ memberIds: block, from: position, to: position + block.length - 1 })
    }
    for (const id of block) {
      rows.push({ ...stats.get(id)!, position: position++, tied: tied && complete })
    }
  }

  return { rows, complete, unresolvedTies }
}

/** Empates sin resolver que cruzan la línea de clasificación a la fase eliminatoria. */
export function blockingTies(
  ties: readonly UnresolvedTie[],
  advanceCount: number,
): UnresolvedTie[] {
  return ties.filter((t) => t.from <= advanceCount && t.to > advanceCount)
}
