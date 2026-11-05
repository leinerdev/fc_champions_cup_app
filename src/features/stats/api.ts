import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { StatsInput, StatsMatch, StatsMember, StatsTournament } from './compute'

export const STATS_KEY = ['stats'] as const

const PAGE = 1000

/** PostgREST devuelve como máximo 1000 filas por petición: se pagina hasta agotar. */
async function fetchAll<T>(
  page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: Error | null }>,
): Promise<T[]> {
  const out: T[] = []
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await page(from, from + PAGE - 1)
    if (error) throw error
    out.push(...(data ?? []))
    if (!data || data.length < PAGE) return out
  }
}

/** Todo lo que el usuario puede ver (RLS): sus torneos, sus jugadores y sus partidos jugados. */
export function useStatsData() {
  return useQuery({
    queryKey: STATS_KEY,
    staleTime: 30_000,
    queryFn: async (): Promise<StatsInput> => {
      const [tournaments, members, matches] = await Promise.all([
        fetchAll<StatsTournament>((from, to) =>
          supabase
            .from('tournaments')
            .select('id, name, type, status, champion_member_id, created_at')
            .order('created_at')
            .range(from, to),
        ),
        fetchAll<StatsMember>((from, to) =>
          supabase
            .from('tournament_members')
            .select('id, tournament_id, user_id, display_name, profile:profiles(username, full_name, avatar_url)')
            .order('created_at')
            .order('id')
            .range(from, to) as unknown as PromiseLike<{ data: StatsMember[] | null; error: Error | null }>,
        ),
        fetchAll<StatsMatch>((from, to) =>
          supabase
            .from('matches')
            .select('id, tournament_id, stage, home_id, away_id, home_score, away_score, status, played_at, created_at')
            .eq('status', 'played')
            .order('created_at')
            .order('id')
            .range(from, to),
        ),
      ])
      return { tournaments, members, matches }
    },
  })
}
