import { useEffect } from 'react'
import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query'
import { notify } from '@/features/notifications/notify'
import { supabase } from '@/lib/supabase'
import {
  blockingTies,
  buildTiebreakMatches,
  computeBracketProgress,
  computeStandings,
  drawKnockout,
  roundRobin,
} from '@/lib/tournament-engine'
import type {
  Match,
  Member,
  MemberRole,
  NewMatch,
  Tournament,
  TournamentConfig,
  TournamentType,
} from '@/lib/types'

export const keys = {
  tournaments: (userId: string | null) => ['tournaments', userId] as const,
  tournament: (id: string) => ['tournament', id] as const,
  members: (id: string) => ['tournament', id, 'members'] as const,
  matches: (id: string) => ['tournament', id, 'matches'] as const,
  preview: (code: string) => ['preview', code] as const,
}

/* ---------------------------------- Lecturas ---------------------------------- */

export type TournamentListItem = Tournament & {
  members: { count: number }[]
  me: { role: MemberRole }[]
}

export function useMyTournaments(userId: string | null) {
  return useQuery({
    queryKey: keys.tournaments(userId),
    enabled: Boolean(userId),
    queryFn: async () => {
      // Se parte de mis membresías. Las pistas `!tournament_id` desambiguan la relación:
      // tournaments y tournament_members también se vinculan por champion_member_id.
      const { data, error } = await supabase
        .from('tournament_members')
        .select('role, tournament:tournaments!tournament_id(*, members:tournament_members!tournament_id(count))')
        .eq('user_id', userId!)
      if (error) throw error
      const rows = data as unknown as {
        role: MemberRole
        tournament: (Tournament & { members: { count: number }[] }) | null
      }[]
      return rows
        .filter((r) => r.tournament)
        .map((r): TournamentListItem => ({ ...r.tournament!, me: [{ role: r.role }] }))
        .sort((a, b) => b.created_at.localeCompare(a.created_at))
    },
  })
}

export function useTournament(id: string) {
  return useQuery({
    queryKey: keys.tournament(id),
    queryFn: async () => {
      const { data, error } = await supabase.from('tournaments').select('*').eq('id', id).maybeSingle()
      if (error) throw error
      return data as Tournament | null
    },
  })
}

export function useMembers(id: string) {
  return useQuery({
    queryKey: keys.members(id),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('tournament_members')
        .select('*, profile:profiles(username, full_name, avatar_url)')
        .eq('tournament_id', id)
        .order('created_at', { ascending: true })
      if (error) throw error
      return data as unknown as Member[]
    },
  })
}

export function useMatches(id: string) {
  return useQuery({
    queryKey: keys.matches(id),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('matches')
        .select('*')
        .eq('tournament_id', id)
        .order('stage')
        .order('round')
        .order('slot')
        .order('leg')
      if (error) throw error
      return data as Match[]
    },
  })
}

export interface TournamentPreview {
  id: string
  name: string
  type: TournamentType
  status: Tournament['status']
  size: number
  members: number
  creator: string | null
  already_member: boolean
}

export function usePreview(code: string) {
  return useQuery({
    queryKey: keys.preview(code),
    enabled: /^\d{6}$/.test(code),
    retry: false,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('preview_tournament', { p_code: code })
      if (error) throw error
      return data as TournamentPreview | null
    },
  })
}

/** Nombre a mostrar: el nombre completo del perfil si existe, si no el nombre guardado. */
export function memberLabel(m: Pick<Member, 'display_name' | 'profile'> | undefined | null): string {
  if (!m) return 'Por definir'
  return m.profile?.full_name?.trim() || m.display_name
}

/* ------------------------------- Tiempo real -------------------------------- */

/** Refresca los datos del torneo cuando alguien más cambia algo (con coalescencia). */
export function useTournamentRealtime(id: string | undefined) {
  const queryClient = useQueryClient()
  useEffect(() => {
    if (!id) return
    const pending = new Set<readonly string[]>()
    let timer: number | undefined
    const schedule = (key: readonly string[]) => {
      pending.add(key)
      window.clearTimeout(timer)
      timer = window.setTimeout(() => {
        for (const k of pending) void queryClient.invalidateQueries({ queryKey: k })
        pending.clear()
      }, 250)
    }
    const channel = supabase
      .channel(`tournament:${id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'matches', filter: `tournament_id=eq.${id}` },
        () => schedule(keys.matches(id)),
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'tournament_members', filter: `tournament_id=eq.${id}` },
        () => schedule(keys.members(id)),
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'tournaments', filter: `id=eq.${id}` },
        () => schedule(keys.tournament(id)),
      )
      .subscribe()
    return () => {
      window.clearTimeout(timer)
      void supabase.removeChannel(channel)
    }
  }, [id, queryClient])
}

/* ----------------------------------- Acciones --------------------------------- */

function invalidateTournament(queryClient: QueryClient, id: string) {
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: ['tournament', id] }),
    queryClient.invalidateQueries({ queryKey: ['tournaments'] }),
  ])
}

export function useCreateTournament() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: { name: string; type: TournamentType; config: TournamentConfig }) => {
      const { data, error } = await supabase.rpc('create_tournament', {
        p_name: input.name,
        p_type: input.type,
        p_config: input.config,
      })
      if (error) throw error
      return data as Tournament
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['tournaments'] }),
  })
}

export function useJoinTournament() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (code: string) => {
      const { data, error } = await supabase.rpc('join_tournament', { p_code: code })
      if (error) throw error
      return data as string
    },
    onSuccess: (tournamentId) => {
      notify({ type: 'joined', tournament_id: tournamentId })
      return queryClient.invalidateQueries({ queryKey: ['tournaments'] })
    },
  })
}

export function useAddGhost(tournamentId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (name: string) => {
      const { error } = await supabase
        .from('tournament_members')
        .insert({ tournament_id: tournamentId, display_name: name.trim(), role: 'guest' })
      if (error) throw error
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: keys.members(tournamentId) }),
  })
}

export function useSetMemberRole(tournamentId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ memberId, role }: { memberId: string; role: MemberRole }) => {
      const { error } = await supabase.from('tournament_members').update({ role }).eq('id', memberId)
      if (error) throw error
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: keys.members(tournamentId) }),
  })
}

export function useRemoveMember(tournamentId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (memberId: string) => {
      const { data, error } = await supabase
        .from('tournament_members')
        .delete()
        .eq('id', memberId)
        .select('id')
      if (error) throw error
      if (!data?.length) throw new Error('No se pudo quitar al jugador (¿el torneo ya comenzó?)')
    },
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: keys.members(tournamentId) }),
        queryClient.invalidateQueries({ queryKey: ['tournaments'] }),
      ]),
  })
}

export function useDeleteTournament() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await supabase.from('tournaments').delete().eq('id', id).select('id')
      if (error) throw error
      if (!data?.length) throw new Error('No tienes permiso para eliminar este torneo')
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['tournaments'] }),
  })
}

async function commit(tournamentId: string, matches: NewMatch[], status: string | null) {
  const { error } = await supabase.rpc('commit_matches', {
    p_tournament: tournamentId,
    p_matches: matches,
    p_status: status,
  })
  if (error) throw error
}

/** Inicia el torneo: calendario de liga o sorteo de la copa. */
export function useStartTournament(tournament: Tournament, members: Member[]) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async () => {
      const ids = members.map((m) => m.id)
      if (tournament.type === 'league') {
        const matches = roundRobin(ids, tournament.config.league?.double_leg ?? false)
        await commit(tournament.id, matches, 'league')
      } else {
        const { two_legged, third_place } = tournament.config.knockout
        const matches = drawKnockout(ids, (stage) => Boolean(two_legged[stage]), third_place)
        await commit(tournament.id, matches, 'knockout')
      }
    },
    onSuccess: async () => {
      notify({ type: 'started', tournament_id: tournament.id })
      await invalidateTournament(queryClient, tournament.id)
      await queryClient.invalidateQueries({ queryKey: keys.matches(tournament.id) })
    },
  })
}

/** Cierra la fase de liga y sortea las eliminatorias con los clasificados. */
export function useCloseLeague(tournament: Tournament, members: Member[], matches: Match[]) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async () => {
      const adv = tournament.config.league?.advance_count ?? 0
      const standings = computeStandings(
        members.map((m) => m.id),
        matches,
      )
      if (!standings.complete) throw new Error('Aún faltan partidos de la fase de liga.')
      if (blockingTies(standings.unresolvedTies, adv).length > 0) {
        throw new Error('Hay un empate en la línea de clasificación: resuélvelo con un desempate.')
      }
      const qualified = standings.rows.slice(0, adv).map((r) => r.memberId)
      const { two_legged, third_place } = tournament.config.knockout
      const draw = drawKnockout(qualified, (stage) => Boolean(two_legged[stage]), third_place)
      await commit(tournament.id, draw, 'knockout')
    },
    onSuccess: async () => {
      notify({ type: 'knockout', tournament_id: tournament.id })
      await invalidateTournament(queryClient, tournament.id)
      await queryClient.invalidateQueries({ queryKey: keys.matches(tournament.id) })
    },
  })
}

/** Crea partidos de desempate (partido único) entre jugadores empatados. */
export function useCreateTiebreaks(tournament: Tournament, matches: Match[]) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (memberIds: string[]) => {
      const startSlot = Math.max(0, ...matches.filter((m) => m.stage === 'tiebreak').map((m) => m.slot)) + 1
      await commit(tournament.id, buildTiebreakMatches(memberIds, startSlot), null)
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: keys.matches(tournament.id) }),
  })
}

export interface ResultInput {
  match: Match
  home: number
  away: number
  pensHome: number | null
  pensAway: number | null
}

/**
 * Avanza la llave según los resultados guardados (ganadores a la siguiente ronda y campeón).
 * Cualquier miembro puede dispararlo; el servidor solo deja rellenar plazas vacías a quien no es admin.
 */
export interface AdvanceOutcome {
  /** Partidos que acaban de quedar con sus dos jugadores definidos (para avisarles). */
  newMatchups: string[]
  /** Se acaba de coronar (o cambiar) al campeón. */
  crowned: boolean
}

export async function advanceBracket(tournament: Tournament, isAdmin: boolean): Promise<AdvanceOutcome> {
  const none: AdvanceOutcome = { newMatchups: [], crowned: false }
  const { data, error } = await supabase
    .from('matches')
    .select('*')
    .eq('tournament_id', tournament.id)
  if (error) throw error
  const progress = computeBracketProgress(data as Match[])

  let status = tournament.status
  const champion = progress.championId

  // Corrección de la final tras terminar el torneo: solo un admin lo reabre.
  if (status === 'finished' && champion !== tournament.champion_member_id) {
    if (!isAdmin) return none
    const { error: reopenError } = await supabase.rpc('apply_bracket_updates', {
      p_tournament: tournament.id,
      p_updates: [],
      p_champion: null,
      p_status: 'knockout',
    })
    if (reopenError) throw reopenError
    status = 'knockout'
  }

  if (status !== 'knockout') return none
  if (progress.updates.length === 0 && !champion) return none

  const { error: applyError } = await supabase.rpc('apply_bracket_updates', {
    p_tournament: tournament.id,
    p_updates: progress.updates,
    p_champion: champion,
    p_status: null,
  })
  if (applyError) throw applyError

  return {
    newMatchups: progress.updates.filter((u) => u.home_id && u.away_id).map((u) => u.matchId),
    crowned: champion !== null && champion !== tournament.champion_member_id,
  }
}

export function useSaveResult(tournament: Tournament, isAdmin: boolean) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ match, home, away, pensHome, pensAway }: ResultInput) => {
      const { data, error } = await supabase
        .from('matches')
        .update({
          home_score: home,
          away_score: away,
          pens_home: pensHome,
          pens_away: pensAway,
        })
        .eq('id', match.id)
        .select('id')
      if (error) throw error
      if (!data?.length) throw new Error('No tienes permiso para registrar este resultado.')
      notify({
        type: 'result',
        tournament_id: tournament.id,
        match_id: match.id,
        corrected: match.status === 'played',
      })
      if (tournament.status === 'knockout' || tournament.status === 'finished') {
        const outcome = await advanceBracket(tournament, isAdmin)
        if (outcome.newMatchups.length > 0) {
          notify({ type: 'next', tournament_id: tournament.id, match_ids: outcome.newMatchups })
        }
        if (outcome.crowned) notify({ type: 'champion', tournament_id: tournament.id })
      }
    },
    onSettled: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: keys.matches(tournament.id) }),
        queryClient.invalidateQueries({ queryKey: keys.tournament(tournament.id) }),
        queryClient.invalidateQueries({ queryKey: ['stats'] }),
      ])
    },
  })
}

/** Un admin borra un resultado (vuelve a "por jugar") y reajusta la llave. */
export function useClearResult(tournament: Tournament, isAdmin: boolean) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (match: Match) => {
      const { error } = await supabase
        .from('matches')
        .update({ home_score: null, away_score: null, pens_home: null, pens_away: null })
        .eq('id', match.id)
      if (error) throw error
      if (tournament.status === 'knockout' || tournament.status === 'finished') {
        await advanceBracket(tournament, isAdmin)
      }
    },
    onSettled: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: keys.matches(tournament.id) }),
        queryClient.invalidateQueries({ queryKey: keys.tournament(tournament.id) }),
        queryClient.invalidateQueries({ queryKey: ['stats'] }),
      ])
    },
  })
}
