export type TournamentType = 'league' | 'cup'
export type TournamentStatus = 'draft' | 'league' | 'knockout' | 'finished'
export type MemberRole = 'admin' | 'guest'

/** Rondas eliminatorias, de la más temprana a la final. */
export type KnockoutStage =
  | 'round_of_32'
  | 'round_of_16'
  | 'quarter'
  | 'semi'
  | 'third_place'
  | 'final'

export type MatchStage = 'league' | 'tiebreak' | KnockoutStage

export interface Profile {
  id: string
  username: string
  full_name: string | null
  avatar_url: string | null
  is_super_admin: boolean
  created_at: string
}

export interface ProfilePrivate {
  id: string
  email: string | null
}

export interface TournamentConfig {
  /** Número de jugadores (liga) o participantes (copa). */
  size: number
  /** Solo para torneos de tipo liga. */
  league?: {
    /** Liga a ida y vuelta. */
    double_leg: boolean
    /** Jugadores que avanzan a la fase eliminatoria (par). */
    advance_count: number
  }
  knockout: {
    /** Por ronda: true = ida y vuelta, false o ausente = partido único. */
    two_legged: Partial<Record<KnockoutStage, boolean>>
    /** Partido por el tercer puesto (requiere semifinales). */
    third_place: boolean
  }
}

export interface Tournament {
  id: string
  name: string
  type: TournamentType
  code: string
  status: TournamentStatus
  created_by: string
  config: TournamentConfig
  champion_member_id: string | null
  created_at: string
}

export interface MemberProfile {
  username: string
  full_name: string | null
  avatar_url: string | null
}

export interface Member {
  id: string
  tournament_id: string
  user_id: string | null
  display_name: string
  role: MemberRole
  created_at: string
  profile?: MemberProfile | null
}

export interface Match {
  id: string
  tournament_id: string
  stage: MatchStage
  /** Jornada (liga). En eliminatorias se usa 1. */
  round: number
  /** Posición de la llave dentro de la ronda (eliminatorias). */
  slot: number
  /** 1 = ida / partido único, 2 = vuelta. */
  leg: number
  home_id: string | null
  away_id: string | null
  home_score: number | null
  away_score: number | null
  pens_home: number | null
  pens_away: number | null
  status: 'scheduled' | 'played'
  played_at: string | null
  created_at: string
}

/** Partido por crear (sin id ni resultado). */
export type NewMatch = Pick<
  Match,
  'stage' | 'round' | 'slot' | 'leg' | 'home_id' | 'away_id'
>

export const KNOCKOUT_ORDER: KnockoutStage[] = [
  'round_of_32',
  'round_of_16',
  'quarter',
  'semi',
  'final',
]
