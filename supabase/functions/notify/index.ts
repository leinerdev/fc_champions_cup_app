// Edge Function: envía notificaciones push (Web Push) por eventos del torneo.
//
// El cliente avisa de lo que acaba de pasar ({ type, tournament_id, ... }) con su JWT.
// La función NO se fía del cliente: comprueba que pertenece al torneo, relee el estado
// real desde la base de datos con la service role y calcula ella misma los destinatarios.
//
// Secretos necesarios (supabase secrets set ...):
//   VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT (p. ej. mailto:tu@correo.com)
//
// Despliegue:  supabase functions deploy notify
import { createClient } from 'npm:@supabase/supabase-js@2'
import webpush from 'npm:web-push@3.6.7'
import {
  championPayload,
  joinedPayload,
  knockoutPayload,
  nextPayload,
  parseEvent,
  resultPayload,
  startedPayload,
  type PushPayload,
} from './messages.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function json(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

interface MemberRow {
  id: string
  user_id: string | null
  display_name: string
  role: 'admin' | 'guest'
  created_at: string
  profile: { full_name: string | null } | null
}

interface MatchRow {
  id: string
  stage: string
  home_id: string | null
  away_id: string | null
  home_score: number | null
  away_score: number | null
  pens_home: number | null
  pens_away: number | null
  status: string
}

/** Un solo aviso por usuario: si ya tiene uno, se conserva el primero. */
type Recipients = Map<string, PushPayload>

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'Método no permitido' }, 405)

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return json({ error: 'No autenticado' }, 401)

    const url = Deno.env.get('SUPABASE_URL')!
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const vapidPublic = Deno.env.get('VAPID_PUBLIC_KEY')
    const vapidPrivate = Deno.env.get('VAPID_PRIVATE_KEY')
    const vapidSubject = Deno.env.get('VAPID_SUBJECT') ?? 'mailto:admin@fccc.app'

    // 1) ¿Quién llama?
    const caller = createClient(url, anonKey, { global: { headers: { Authorization: authHeader } } })
    const { data: userData, error: userError } = await caller.auth.getUser()
    if (userError || !userData.user) return json({ error: 'Sesión inválida' }, 401)
    const callerId = userData.user.id

    // 2) ¿Evento válido?
    const event = parseEvent(await req.json().catch(() => null))
    if (!event) return json({ error: 'Evento inválido' }, 400)

    // Sin claves VAPID no hay push: no es un error para la app.
    if (!vapidPublic || !vapidPrivate) return json({ ok: true, skipped: 'vapid_not_configured' })
    webpush.setVapidDetails(vapidSubject, vapidPublic, vapidPrivate)

    const db = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } })

    // 3) Estado real del torneo
    const [{ data: t }, { data: membersData }, { data: callerProfile }] = await Promise.all([
      db.from('tournaments').select('id, name, type, status, champion_member_id').eq('id', event.tournament_id).maybeSingle(),
      db
        .from('tournament_members')
        .select('id, user_id, display_name, role, created_at, profile:profiles(full_name)')
        .eq('tournament_id', event.tournament_id),
      db.from('profiles').select('is_super_admin').eq('id', callerId).maybeSingle(),
    ])
    if (!t) return json({ error: 'Torneo no encontrado' }, 404)

    const members = (membersData ?? []) as unknown as MemberRow[]
    const byId = new Map(members.map((m) => [m.id, m]))
    const nameOf = (m: MemberRow | undefined) => m?.profile?.full_name?.trim() || m?.display_name || 'Jugador'
    const me = members.find((m) => m.user_id === callerId)
    const isAdmin = Boolean(callerProfile?.is_super_admin) || me?.role === 'admin'
    if (!me && !callerProfile?.is_super_admin) return json({ error: 'No perteneces a este torneo' }, 403)

    // 4) Destinatarios y mensaje según el evento
    const recipients: Recipients = new Map()
    const add = (userId: string | null | undefined, payload: PushPayload) => {
      if (userId && userId !== callerId && !recipients.has(userId)) recipients.set(userId, payload)
    }

    switch (event.type) {
      case 'result': {
        const { data } = await db
          .from('matches')
          .select('id, stage, home_id, away_id, home_score, away_score, pens_home, pens_away, status')
          .eq('id', event.match_id)
          .eq('tournament_id', t.id)
          .maybeSingle()
        const m = data as MatchRow | null
        if (!m || m.status !== 'played' || m.home_score === null || m.away_score === null) {
          return json({ error: 'Partido sin resultado' }, 400)
        }
        const home = m.home_id ? byId.get(m.home_id) : undefined
        const away = m.away_id ? byId.get(m.away_id) : undefined
        const isPlayer = [home, away].some((x) => x?.user_id === callerId)
        if (!isAdmin && !isPlayer) return json({ error: 'No autorizado' }, 403)
        const payload = resultPayload({
          tournamentId: t.id,
          tournamentName: t.name,
          matchId: m.id,
          stage: m.stage,
          homeName: nameOf(home),
          awayName: nameOf(away),
          homeScore: m.home_score,
          awayScore: m.away_score,
          pensHome: m.pens_home,
          pensAway: m.pens_away,
          corrected: event.corrected,
        })
        add(home?.user_id, payload)
        add(away?.user_id, payload)
        break
      }

      case 'next': {
        if (t.status !== 'knockout') return json({ error: 'El torneo no está en eliminatorias' }, 400)
        const { data } = await db
          .from('matches')
          .select('id, stage, home_id, away_id, home_score, away_score, pens_home, pens_away, status')
          .eq('tournament_id', t.id)
          .in('id', event.match_ids)
        for (const m of (data ?? []) as MatchRow[]) {
          if (m.status !== 'scheduled' || !m.home_id || !m.away_id) continue
          const home = byId.get(m.home_id)
          const away = byId.get(m.away_id)
          const base = { tournamentId: t.id, tournamentName: t.name, matchId: m.id, stage: m.stage }
          add(home?.user_id, nextPayload({ ...base, opponentName: nameOf(away) }))
          add(away?.user_id, nextPayload({ ...base, opponentName: nameOf(home) }))
        }
        break
      }

      case 'started': {
        if (!isAdmin) return json({ error: 'No autorizado' }, 403)
        if (t.status === 'draft') return json({ error: 'El torneo aún no empezó' }, 400)
        const payload = startedPayload({ tournamentId: t.id, tournamentName: t.name, type: t.type })
        for (const m of members) add(m.user_id, payload)
        break
      }

      case 'knockout': {
        if (!isAdmin) return json({ error: 'No autorizado' }, 403)
        if (t.status !== 'knockout') return json({ error: 'El torneo no está en eliminatorias' }, 400)
        const { data } = await db
          .from('matches')
          .select('home_id, away_id, stage')
          .eq('tournament_id', t.id)
          .not('stage', 'in', '(league,tiebreak)')
        const payload = knockoutPayload({ tournamentId: t.id, tournamentName: t.name })
        for (const m of (data ?? []) as { home_id: string | null; away_id: string | null }[]) {
          add(m.home_id ? byId.get(m.home_id)?.user_id : null, payload)
          add(m.away_id ? byId.get(m.away_id)?.user_id : null, payload)
        }
        break
      }

      case 'champion': {
        if (t.status !== 'finished' || !t.champion_member_id) return json({ error: 'El torneo aún no tiene campeón' }, 400)
        const payload = championPayload({
          tournamentId: t.id,
          tournamentName: t.name,
          championName: nameOf(byId.get(t.champion_member_id)),
        })
        for (const m of members) add(m.user_id, payload)
        break
      }

      case 'joined': {
        // Solo si acaba de entrar: evita avisos repetidos al reabrir el enlace.
        if (!me || Date.now() - new Date(me.created_at).getTime() > 5 * 60_000) {
          return json({ ok: true, recipients: 0, skipped: 'not_recent' })
        }
        const payload = joinedPayload({ tournamentId: t.id, tournamentName: t.name, playerName: nameOf(me) })
        for (const m of members) if (m.role === 'admin') add(m.user_id, payload)
        break
      }
    }

    if (recipients.size === 0) return json({ ok: true, recipients: 0, sent: 0 })

    // 5) Enviar a todos los dispositivos de los destinatarios
    const { data: subs } = await db
      .from('push_subscriptions')
      .select('endpoint, p256dh, auth, user_id')
      .in('user_id', [...recipients.keys()])

    const dead: string[] = []
    let sent = 0
    await Promise.allSettled(
      (subs ?? []).map(async (s: { endpoint: string; p256dh: string; auth: string; user_id: string }) => {
        const payload = recipients.get(s.user_id)
        if (!payload) return
        try {
          await webpush.sendNotification(
            { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
            JSON.stringify(payload),
            { TTL: 60 * 60 * 24, urgency: 'normal' },
          )
          sent++
        } catch (err) {
          const status = (err as { statusCode?: number }).statusCode
          // 404/410: la suscripción ya no existe (app desinstalada o permiso revocado)
          if (status === 404 || status === 410) dead.push(s.endpoint)
          else console.error('push error', status, (err as Error).message)
        }
      }),
    )
    if (dead.length > 0) await db.from('push_subscriptions').delete().in('endpoint', dead)

    return json({ ok: true, recipients: recipients.size, sent, removed: dead.length })
  } catch (err) {
    console.error(err)
    return json({ error: 'Error interno' }, 500)
  }
})
