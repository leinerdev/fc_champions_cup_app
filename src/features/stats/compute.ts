// Estadísticas entre amigos: funciones puras sobre los datos que el usuario puede ver.
//
// - La identidad es la cuenta (user_id): los jugadores "sin cuenta" no tienen historial
//   propio entre torneos, así que no aparecen en rankings ni en el cara a cara
//   (sus partidos sí cuentan para el rival que tiene cuenta).
// - Cada partido jugado cuenta una vez (en ida y vuelta, cada partido por separado).
//   Los penales no cambian el marcador: un 1-1 definido en penales cuenta como empate.
import type { MatchStage, TournamentStatus, TournamentType } from '@/lib/types'

export interface StatsTournament {
  id: string
  name: string
  type: TournamentType
  status: TournamentStatus
  champion_member_id: string | null
  created_at: string
}

export interface StatsMember {
  id: string
  tournament_id: string
  user_id: string | null
  display_name: string
  profile?: { username: string; full_name: string | null; avatar_url: string | null } | null
}

export interface StatsMatch {
  id: string
  tournament_id: string
  stage: MatchStage
  home_id: string | null
  away_id: string | null
  home_score: number | null
  away_score: number | null
  status: 'scheduled' | 'played'
  played_at: string | null
  created_at: string
}

export interface StatsInput {
  tournaments: StatsTournament[]
  members: StatsMember[]
  matches: StatsMatch[]
}

export interface PlayerStats {
  userId: string
  name: string
  username: string
  avatarUrl: string | null
  tournaments: number
  played: number
  won: number
  drawn: number
  lost: number
  gf: number
  ga: number
  gd: number
  /** Puntos con el sistema 3-1-0 (para la efectividad). */
  points: number
  /** Goles a favor por partido. */
  gfAvg: number
  /** Goles en contra por partido. */
  gaAvg: number
  /** Porcentaje de puntos disponibles que se lograron (0-100). */
  effectiveness: number
  titles: number
  cleanSheets: number
}

export interface PlayedGame {
  matchId: string
  tournamentId: string
  tournamentName: string
  stage: MatchStage
  date: string
  homeUser: string | null
  awayUser: string | null
  homeScore: number
  awayScore: number
}

export interface HeadToHead {
  played: number
  aWins: number
  draws: number
  bWins: number
  aGoals: number
  bGoals: number
  /** Más recientes primero. Marcador visto desde A y desde B. */
  games: { game: PlayedGame; aScore: number; bScore: number }[]
}

export interface RecordGame {
  game: PlayedGame
  /** Diferencia de goles (goleada) o suma de goles (partido loco). */
  value: number
}

export interface Records {
  biggestWin: RecordGame | null
  mostGoals: RecordGame | null
}

export interface Stats {
  players: PlayerStats[]
  games: PlayedGame[]
  records: Records
}

function displayName(m: StatsMember): string {
  return m.profile?.full_name?.trim() || m.display_name
}

/** Partidos jugados con marcador y los dos lados definidos, ya con el usuario de cada lado. */
export function playedGames(input: StatsInput): PlayedGame[] {
  const memberById = new Map(input.members.map((m) => [m.id, m]))
  const tournamentById = new Map(input.tournaments.map((t) => [t.id, t]))
  const games: PlayedGame[] = []
  for (const m of input.matches) {
    if (m.status !== 'played' || m.home_score === null || m.away_score === null) continue
    if (!m.home_id || !m.away_id) continue
    const t = tournamentById.get(m.tournament_id)
    const home = memberById.get(m.home_id)
    const away = memberById.get(m.away_id)
    if (!t || !home || !away) continue
    games.push({
      matchId: m.id,
      tournamentId: t.id,
      tournamentName: t.name,
      stage: m.stage,
      date: m.played_at ?? m.created_at,
      homeUser: home.user_id,
      awayUser: away.user_id,
      homeScore: m.home_score,
      awayScore: m.away_score,
    })
  }
  return games
}

export function computeStats(input: StatsInput): Stats {
  const games = playedGames(input)

  // Perfil de cada usuario (el más completo que aparezca en cualquier torneo).
  const info = new Map<string, { name: string; username: string; avatarUrl: string | null }>()
  const tournamentsOf = new Map<string, Set<string>>()
  for (const m of input.members) {
    if (!m.user_id) continue
    info.set(m.user_id, {
      name: displayName(m),
      username: m.profile?.username ?? m.display_name,
      avatarUrl: m.profile?.avatar_url ?? null,
    })
    const set = tournamentsOf.get(m.user_id) ?? new Set<string>()
    set.add(m.tournament_id)
    tournamentsOf.set(m.user_id, set)
  }

  const blank = (userId: string): PlayerStats => {
    const i = info.get(userId)!
    return {
      userId,
      name: i.name,
      username: i.username,
      avatarUrl: i.avatarUrl,
      tournaments: tournamentsOf.get(userId)?.size ?? 0,
      played: 0,
      won: 0,
      drawn: 0,
      lost: 0,
      gf: 0,
      ga: 0,
      gd: 0,
      points: 0,
      gfAvg: 0,
      gaAvg: 0,
      effectiveness: 0,
      titles: 0,
      cleanSheets: 0,
    }
  }
  const table = new Map<string, PlayerStats>()
  const get = (userId: string) => {
    let row = table.get(userId)
    if (!row) {
      row = blank(userId)
      table.set(userId, row)
    }
    return row
  }

  const addSide = (userId: string | null, gf: number, ga: number) => {
    if (!userId || !info.has(userId)) return
    const p = get(userId)
    p.played += 1
    p.gf += gf
    p.ga += ga
    if (gf > ga) {
      p.won += 1
      p.points += 3
    } else if (gf === ga) {
      p.drawn += 1
      p.points += 1
    } else {
      p.lost += 1
    }
    if (ga === 0) p.cleanSheets += 1
  }
  for (const g of games) {
    addSide(g.homeUser, g.homeScore, g.awayScore)
    addSide(g.awayUser, g.awayScore, g.homeScore)
  }

  // Títulos: campeón de torneos finalizados.
  const memberById = new Map(input.members.map((m) => [m.id, m]))
  for (const t of input.tournaments) {
    if (t.status !== 'finished' || !t.champion_member_id) continue
    const champ = memberById.get(t.champion_member_id)
    if (champ?.user_id && info.has(champ.user_id)) get(champ.user_id).titles += 1
  }

  // También aparecen quienes solo se inscribieron (aún sin partidos).
  for (const userId of info.keys()) get(userId)

  const players = [...table.values()].map((p) => ({
    ...p,
    gd: p.gf - p.ga,
    gfAvg: p.played ? p.gf / p.played : 0,
    gaAvg: p.played ? p.ga / p.played : 0,
    effectiveness: p.played ? (p.points / (p.played * 3)) * 100 : 0,
  }))

  return { players, games, records: computeRecords(games) }
}

function computeRecords(games: PlayedGame[]): Records {
  let biggestWin: RecordGame | null = null
  let mostGoals: RecordGame | null = null
  for (const g of games) {
    const margin = Math.abs(g.homeScore - g.awayScore)
    if (margin > 0 && (!biggestWin || margin > biggestWin.value)) biggestWin = { game: g, value: margin }
    const total = g.homeScore + g.awayScore
    if (total > 0 && (!mostGoals || total > mostGoals.value)) mostGoals = { game: g, value: total }
  }
  return { biggestWin, mostGoals }
}

/** Cara a cara entre dos usuarios (todos los torneos que ambos comparten). */
export function headToHead(games: PlayedGame[], a: string, b: string): HeadToHead {
  const out: HeadToHead = { played: 0, aWins: 0, draws: 0, bWins: 0, aGoals: 0, bGoals: 0, games: [] }
  if (a === b) return out
  for (const g of games) {
    let aScore: number
    let bScore: number
    if (g.homeUser === a && g.awayUser === b) {
      aScore = g.homeScore
      bScore = g.awayScore
    } else if (g.homeUser === b && g.awayUser === a) {
      aScore = g.awayScore
      bScore = g.homeScore
    } else {
      continue
    }
    out.played += 1
    out.aGoals += aScore
    out.bGoals += bScore
    if (aScore > bScore) out.aWins += 1
    else if (aScore < bScore) out.bWins += 1
    else out.draws += 1
    out.games.push({ game: g, aScore, bScore })
  }
  out.games.sort((x, y) => y.game.date.localeCompare(x.game.date))
  return out
}

/** Usuarios contra los que `userId` ha jugado, del más enfrentado al menos. */
export function rivalsOf(games: PlayedGame[], userId: string): { userId: string; played: number }[] {
  const count = new Map<string, number>()
  for (const g of games) {
    const other = g.homeUser === userId ? g.awayUser : g.awayUser === userId ? g.homeUser : null
    if (other && other !== userId) count.set(other, (count.get(other) ?? 0) + 1)
  }
  return [...count.entries()]
    .map(([id, played]) => ({ userId: id, played }))
    .sort((x, y) => y.played - x.played)
}

export type RankingMetric = 'goals' | 'wins' | 'titles' | 'defense' | 'effectiveness'

export interface RankingRow {
  player: PlayerStats
  /** Valor principal mostrado (ya formateable). */
  value: number
  /** Texto secundario (promedio, partidos, etc.). */
  detail: string
}

/** Partidos mínimos para entrar en rankings de promedio (defensa y efectividad). */
export const MIN_GAMES_FOR_AVERAGES = 3

export function ranking(players: PlayerStats[], metric: RankingMetric): RankingRow[] {
  const fmt = (n: number) => n.toFixed(2).replace(/\.?0+$/, '')
  const byName = (a: PlayerStats, b: PlayerStats) => a.name.localeCompare(b.name, 'es')
  const active = players.filter((p) => p.played > 0 || (metric === 'titles' && p.titles > 0))

  switch (metric) {
    case 'goals':
      return active
        .toSorted((a, b) => b.gf - a.gf || b.gfAvg - a.gfAvg || a.played - b.played || byName(a, b))
        .map((p) => ({ player: p, value: p.gf, detail: `${fmt(p.gfAvg)} por partido · ${p.played} PJ` }))
    case 'wins':
      return active
        .toSorted((a, b) => b.won - a.won || b.effectiveness - a.effectiveness || byName(a, b))
        .map((p) => ({ player: p, value: p.won, detail: `${p.won}G ${p.drawn}E ${p.lost}P · ${p.played} PJ` }))
    case 'titles':
      return active
        .filter((p) => p.titles > 0)
        .toSorted((a, b) => b.titles - a.titles || b.won - a.won || byName(a, b))
        .map((p) => ({ player: p, value: p.titles, detail: `${p.tournaments} torneos jugados` }))
    case 'defense':
      return active
        .filter((p) => p.played >= MIN_GAMES_FOR_AVERAGES)
        .toSorted((a, b) => a.gaAvg - b.gaAvg || b.cleanSheets - a.cleanSheets || byName(a, b))
        .map((p) => ({
          player: p,
          value: p.gaAvg,
          detail: `${p.ga} recibidos · ${p.cleanSheets} porterías a cero`,
        }))
    case 'effectiveness':
      return active
        .filter((p) => p.played >= MIN_GAMES_FOR_AVERAGES)
        .toSorted((a, b) => b.effectiveness - a.effectiveness || b.played - a.played || byName(a, b))
        .map((p) => ({ player: p, value: p.effectiveness, detail: `${p.points} pts en ${p.played} PJ` }))
  }
}
