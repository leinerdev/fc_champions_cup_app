// Lógica pura de la función `notify`: validación del evento y textos de cada aviso.
// Sin dependencias de Deno para poder probarla con Vitest.

export type NotifyEvent =
  | { type: 'result'; tournament_id: string; match_id: string; corrected: boolean }
  | { type: 'next'; tournament_id: string; match_ids: string[] }
  | { type: 'started'; tournament_id: string }
  | { type: 'knockout'; tournament_id: string }
  | { type: 'champion'; tournament_id: string }
  | { type: 'joined'; tournament_id: string }

export interface PushPayload {
  title: string
  body: string
  /** Ruta interna que se abre al tocar la notificación. */
  url: string
  /** Avisos con la misma etiqueta se reemplazan en el dispositivo en vez de apilarse. */
  tag: string
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const MAX_MATCH_IDS = 20

export const STAGE_LABEL: Record<string, string> = {
  league: 'Fase de liga',
  tiebreak: 'Desempate',
  round_of_32: 'Dieciseisavos de final',
  round_of_16: 'Octavos de final',
  quarter: 'Cuartos de final',
  semi: 'Semifinales',
  third_place: 'Tercer puesto',
  final: 'Final',
}

/** Valida el cuerpo de la petición. Devuelve null si no es un evento válido. */
export function parseEvent(body: unknown): NotifyEvent | null {
  if (!body || typeof body !== 'object') return null
  const b = body as Record<string, unknown>
  const tid = b.tournament_id
  if (typeof tid !== 'string' || !UUID_RE.test(tid)) return null

  switch (b.type) {
    case 'result':
      if (typeof b.match_id !== 'string' || !UUID_RE.test(b.match_id)) return null
      return { type: 'result', tournament_id: tid, match_id: b.match_id, corrected: b.corrected === true }
    case 'next': {
      if (!Array.isArray(b.match_ids) || b.match_ids.length === 0 || b.match_ids.length > MAX_MATCH_IDS) return null
      if (!b.match_ids.every((id) => typeof id === 'string' && UUID_RE.test(id))) return null
      return { type: 'next', tournament_id: tid, match_ids: [...new Set(b.match_ids as string[])] }
    }
    case 'started':
    case 'knockout':
    case 'champion':
    case 'joined':
      return { type: b.type, tournament_id: tid }
    default:
      return null
  }
}

export function resultPayload(p: {
  tournamentId: string
  tournamentName: string
  matchId: string
  stage: string
  homeName: string
  awayName: string
  homeScore: number
  awayScore: number
  pensHome: number | null
  pensAway: number | null
  corrected: boolean
}): PushPayload {
  const pens = p.pensHome !== null && p.pensAway !== null ? ` (pen. ${p.pensHome}-${p.pensAway})` : ''
  return {
    title: p.corrected ? 'Resultado corregido' : 'Resultado registrado',
    body: `${p.homeName} ${p.homeScore} - ${p.awayScore} ${p.awayName}${pens} · ${p.tournamentName}`,
    url: `/torneos/${p.tournamentId}?tab=partidos`,
    tag: `result:${p.matchId}`,
  }
}

export function nextPayload(p: {
  tournamentId: string
  tournamentName: string
  matchId: string
  stage: string
  opponentName: string
}): PushPayload {
  const stage = STAGE_LABEL[p.stage] ?? 'Siguiente ronda'
  return {
    title: '¡Te toca jugar!',
    body: `${stage}: te enfrentas a ${p.opponentName} · ${p.tournamentName}`,
    url: `/torneos/${p.tournamentId}?tab=partidos`,
    tag: `next:${p.matchId}`,
  }
}

export function startedPayload(p: { tournamentId: string; tournamentName: string; type: string }): PushPayload {
  return {
    title: `¡Arrancó ${p.tournamentName}!`,
    body: p.type === 'league' ? 'Ya está el calendario: revisa tus partidos.' : 'Ya se sortearon las llaves: mira tu cruce.',
    url: `/torneos/${p.tournamentId}?tab=${p.type === 'league' ? 'partidos' : 'llaves'}`,
    tag: `started:${p.tournamentId}`,
  }
}

export function knockoutPayload(p: { tournamentId: string; tournamentName: string }): PushPayload {
  return {
    title: 'Eliminatorias sorteadas',
    body: `Terminó la liga de ${p.tournamentName}. Mira las llaves.`,
    url: `/torneos/${p.tournamentId}?tab=llaves`,
    tag: `knockout:${p.tournamentId}`,
  }
}

export function championPayload(p: { tournamentId: string; tournamentName: string; championName: string }): PushPayload {
  return {
    title: `🏆 ${p.championName} es campeón`,
    body: `Se acabó ${p.tournamentName}. Mira cómo quedó todo.`,
    url: `/torneos/${p.tournamentId}`,
    tag: `champion:${p.tournamentId}`,
  }
}

export function joinedPayload(p: { tournamentId: string; tournamentName: string; playerName: string }): PushPayload {
  return {
    title: 'Nuevo jugador',
    body: `${p.playerName} se unió a ${p.tournamentName}.`,
    url: `/torneos/${p.tournamentId}?tab=jugadores`,
    tag: `joined:${p.tournamentId}:${p.playerName}`,
  }
}
