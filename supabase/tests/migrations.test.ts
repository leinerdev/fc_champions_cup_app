// Prueba las migraciones y la RLS contra un Postgres real (PGlite, en memoria).
// Simula lo mínimo de Supabase: roles, auth.uid(), storage y la publicación realtime.
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const dir = path.dirname(fileURLToPath(import.meta.url))
const sql = (f: string) => readFileSync(path.join(dir, '..', 'migrations', f), 'utf8')

const STUBS = `
  create role anon nologin;
  create role authenticated nologin;
  create schema auth;
  create table auth.users (
    id uuid primary key default gen_random_uuid(),
    email text,
    raw_user_meta_data jsonb default '{}'::jsonb
  );
  create function auth.uid() returns uuid language sql stable as $$
    select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
  $$;
  create schema storage;
  create table storage.buckets (
    id text primary key, name text, public boolean,
    file_size_limit int, allowed_mime_types text[]
  );
  create table storage.objects (id uuid default gen_random_uuid(), bucket_id text, name text);
  alter table storage.objects enable row level security;
  create function storage.foldername(name text) returns text[] language sql as $$
    select (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1) - 1]
  $$;
  create publication supabase_realtime;
  grant usage on schema public, auth, storage to anon, authenticated;
`

const GRANTS = `
  grant select, insert, update, delete on all tables in schema public to authenticated;
  grant select on all tables in schema storage to authenticated;
`

let db: PGlite
const ids: Record<string, string> = {}

async function signUp(username: string) {
  const r = await db.query<{ id: string }>(
    `insert into auth.users (email, raw_user_meta_data) values ($1, $2) returning id`,
    [`${username}@fccc.app`, JSON.stringify({ username })],
  )
  ids[username] = r.rows[0].id
}

/** Ejecuta `fn` como el usuario autenticado indicado (con RLS). */
async function as<T>(username: string | null, fn: () => Promise<T>): Promise<T> {
  await db.exec(`set role ${username ? 'authenticated' : 'anon'}`)
  await db.query(`select set_config('request.jwt.claim.sub', $1, false)`, [username ? ids[username] : ''])
  try {
    return await fn()
  } finally {
    await db.exec('reset role')
    await db.query(`select set_config('request.jwt.claim.sub', '', false)`)
  }
}

async function fails(p: Promise<unknown>, re: RegExp) {
  await expect(p).rejects.toThrow(re)
}

beforeAll(async () => {
  db = new PGlite()
  await db.exec(STUBS)
  await db.exec(sql('0001_profiles_storage.sql'))
  await db.exec(sql('0002_tournaments.sql'))
  await db.exec(GRANTS)
  for (const u of ['leinerdev', 'ana', 'beto', 'carla', 'diego', 'extra']) await signUp(u)
  // El super admin se asigna desde el SQL Editor (auth.uid() es null)
  await db.query(`update public.profiles set is_super_admin = true where username = 'leinerdev'`)
})

afterAll(async () => {
  await db.close()
})

describe('perfiles', () => {
  it('crea el perfil automáticamente al registrarse', async () => {
    const r = await db.query<{ username: string }>(`select username from public.profiles order by username`)
    expect(r.rows.map((x) => x.username)).toEqual(['ana', 'beto', 'carla', 'diego', 'extra', 'leinerdev'])
  })

  it('permite editar el propio nombre pero no el rol de super admin ni el username', async () => {
    await as('ana', () =>
      db.query(`update public.profiles set full_name = 'Ana Gómez' where id = $1`, [ids.ana]),
    )
    await fails(
      as('ana', () => db.query(`update public.profiles set is_super_admin = true where id = $1`, [ids.ana])),
      /super admin/,
    )
    await fails(
      as('ana', () => db.query(`update public.profiles set username = 'otra' where id = $1`, [ids.ana])),
      /nombre de usuario/,
    )
  })

  it('no permite editar el perfil de otro usuario', async () => {
    const r = await as('ana', () =>
      db.query(`update public.profiles set full_name = 'Hackeado' where id = $1 returning id`, [ids.beto]),
    )
    expect(r.rows).toHaveLength(0)
  })

  it('el email es privado: solo el dueño y el super admin', async () => {
    await as('ana', () =>
      db.query(`update public.profile_private set email = 'ana@example.com' where id = $1`, [ids.ana]),
    )
    const own = await as('ana', () => db.query(`select email from public.profile_private`))
    expect(own.rows).toHaveLength(1)
    const other = await as('beto', () => db.query(`select email from public.profile_private`))
    expect(other.rows).toHaveLength(1) // solo el suyo
    const sup = await as('leinerdev', () => db.query(`select email from public.profile_private`))
    expect(sup.rows.length).toBe(6)
  })
})

describe('torneos', () => {
  let cupId = ''
  let code = ''
  const memberId: Record<string, string> = {}

  it('create_tournament genera código de 6 dígitos y deja al creador como admin', async () => {
    const r = await as('ana', () =>
      db.query<{ id: string; code: string }>(
        `select * from public.create_tournament('Copa Amigos', 'cup', $1::jsonb)`,
        [JSON.stringify({ size: 4, knockout: { two_legged: { semi: true }, third_place: true } })],
      ),
    )
    cupId = r.rows[0].id
    code = r.rows[0].code
    expect(code).toMatch(/^\d{6}$/)
    const m = await as('ana', () =>
      db.query<{ role: string }>(`select role from public.tournament_members where tournament_id = $1`, [cupId]),
    )
    expect(m.rows).toEqual([{ role: 'admin' }])
  })

  it('valida la configuración (copa impar, liga con clasificados impares)', async () => {
    await fails(
      as('ana', () =>
        db.query(`select * from public.create_tournament('Mala', 'cup', $1::jsonb)`, [JSON.stringify({ size: 5 })]),
      ),
      /par/,
    )
    await fails(
      as('ana', () =>
        db.query(`select * from public.create_tournament('Mala', 'league', $1::jsonb)`, [
          JSON.stringify({ size: 6, league: { advance_count: 3, double_leg: false } }),
        ]),
      ),
      /par/,
    )
  })

  it('un no-miembro no ve el torneo; con el código se une como guest', async () => {
    const before = await as('beto', () => db.query(`select id from public.tournaments`))
    expect(before.rows).toHaveLength(0)

    const preview = await as('beto', () =>
      db.query<{ preview_tournament: { name: string; members: number } }>(
        `select public.preview_tournament($1)`,
        [code],
      ),
    )
    expect(preview.rows[0].preview_tournament.name).toBe('Copa Amigos')
    expect(preview.rows[0].preview_tournament.members).toBe(1)

    await as('beto', () => db.query(`select public.join_tournament($1)`, [code]))
    await as('carla', () => db.query(`select public.join_tournament($1)`, [code]))
    const after = await as('beto', () => db.query(`select id from public.tournaments`))
    expect(after.rows).toHaveLength(1)

    const roles = await as('ana', () =>
      db.query<{ id: string; display_name: string; role: string; user_id: string }>(
        `select id, display_name, role, user_id from public.tournament_members where tournament_id = $1`,
        [cupId],
      ),
    )
    for (const r of roles.rows) {
      for (const [u, uid] of Object.entries(ids)) if (uid === r.user_id) memberId[u] = r.id
    }
    expect(roles.rows.find((r) => r.user_id === ids.beto)!.role).toBe('guest')
    // se usa el nombre completo si existe, si no el username
    expect(roles.rows.find((r) => r.user_id === ids.ana)!.display_name).toBe('Ana Gómez')
  })

  it('código inválido y unirse dos veces es idempotente', async () => {
    await fails(as('diego', () => db.query(`select public.join_tournament('000000')`)), /Código inválido/)
    await as('beto', () => db.query(`select public.join_tournament($1)`, [code]))
    const c = await as('ana', () =>
      db.query<{ n: string }>(`select count(*)::text n from public.tournament_members where tournament_id = $1`, [cupId]),
    )
    expect(c.rows[0].n).toBe('3')
  })

  it('solo admins agregan fantasmas; se respeta la capacidad', async () => {
    await fails(
      as('beto', () =>
        db.query(`insert into public.tournament_members (tournament_id, display_name) values ($1, 'Pepe')`, [cupId]),
      ),
      /row-level security/,
    )
    await as('ana', () =>
      db.query(`insert into public.tournament_members (tournament_id, display_name) values ($1, 'Fantasma')`, [cupId]),
    )
    // ya hay 4 (cupo lleno)
    await fails(
      as('ana', () =>
        db.query(`insert into public.tournament_members (tournament_id, display_name) values ($1, 'Otro')`, [cupId]),
      ),
      /completo/,
    )
    await fails(as('diego', () => db.query(`select public.join_tournament($1)`, [code])), /completo/)
  })

  it('un guest no puede promoverse a admin; el admin sí promueve a otros', async () => {
    const r = await as('beto', () =>
      db.query(`update public.tournament_members set role = 'admin' where id = $1 returning id`, [memberId.beto]),
    )
    expect(r.rows).toHaveLength(0)
    await as('ana', () =>
      db.query(`update public.tournament_members set role = 'admin' where id = $1`, [memberId.carla]),
    )
    // el creador no puede ser degradado
    await fails(
      as('ana', () =>
        db.query(`update public.tournament_members set role = 'guest' where id = $1`, [memberId.ana]),
      ),
      /creador/,
    )
    // un fantasma no puede ser admin
    await fails(
      as('ana', () =>
        db.query(
          `update public.tournament_members set role = 'admin' where tournament_id = $1 and user_id is null`,
          [cupId],
        ),
      ),
      /sin cuenta/,
    )
  })

  it('solo un admin puede iniciar el torneo (commit_matches)', async () => {
    const ghost = (
      await db.query<{ id: string }>(
        `select id from public.tournament_members where tournament_id = $1 and user_id is null`,
        [cupId],
      )
    ).rows[0].id
    memberId.ghost = ghost
    const semis = [
      { stage: 'semi', slot: 1, leg: 1, home_id: memberId.ana, away_id: memberId.beto },
      { stage: 'semi', slot: 1, leg: 2, home_id: memberId.beto, away_id: memberId.ana },
      { stage: 'semi', slot: 2, leg: 1, home_id: memberId.carla, away_id: memberId.ghost },
      { stage: 'semi', slot: 2, leg: 2, home_id: memberId.ghost, away_id: memberId.carla },
      { stage: 'third_place', slot: 1, leg: 1, home_id: null, away_id: null },
      { stage: 'final', slot: 1, leg: 1, home_id: null, away_id: null },
    ]
    await fails(
      as('beto', () =>
        db.query(`select public.commit_matches($1, $2::jsonb, 'knockout')`, [cupId, JSON.stringify(semis)]),
      ),
      /administrador/,
    )
    // un admin no puede saltarse transiciones
    await fails(
      as('ana', () =>
        db.query(`select public.commit_matches($1, '[]'::jsonb, 'finished')`, [cupId]),
      ),
      /Transición/,
    )
    await as('ana', () =>
      db.query(`select public.commit_matches($1, $2::jsonb, 'knockout')`, [cupId, JSON.stringify(semis)]),
    )
    const t = await as('ana', () => db.query<{ status: string }>(`select status from public.tournaments where id = $1`, [cupId]))
    expect(t.rows[0].status).toBe('knockout')
    // ya comenzó: no se puede cambiar la configuración ni el estado a mano
    await fails(
      as('ana', () => db.query(`update public.tournaments set status = 'finished' where id = $1`, [cupId])),
      /automáticamente/,
    )
    await fails(
      as('ana', () => db.query(`update public.tournaments set config = '{"size":8}' where id = $1`, [cupId])),
      /configuración/,
    )
    await fails(
      as('ana', () => db.query(`update public.tournaments set code = '111111' where id = $1`, [cupId])),
      /código/,
    )
  })

  const matchOf = async (stage: string, slot: number, leg: number) =>
    (
      await db.query<{ id: string }>(
        `select id from public.matches where tournament_id = $1 and stage = $2 and slot = $3 and leg = $4`,
        [cupId, stage, slot, leg],
      )
    ).rows[0].id

  it('un jugador registra su marcador; no el de partidos ajenos ni cambiar participantes', async () => {
    const s1l1 = await matchOf('semi', 1, 1)
    const s2l1 = await matchOf('semi', 2, 1)

    // beto juega la semi 1 (visita en la ida)
    const ok = await as('beto', () =>
      db.query<{ status: string }>(
        `update public.matches set home_score = 2, away_score = 1 where id = $1 returning status`,
        [s1l1],
      ),
    )
    expect(ok.rows[0].status).toBe('played')

    // partido ajeno: la RLS no encuentra la fila
    const other = await as('beto', () =>
      db.query(`update public.matches set home_score = 1, away_score = 1 where id = $1 returning id`, [s2l1]),
    )
    expect(other.rows).toHaveLength(0)

    const s1l2 = await matchOf('semi', 1, 2)
    // no puede cambiar participantes
    await fails(
      as('beto', () =>
        db.query(`update public.matches set home_id = $2 where id = $1`, [s1l2, memberId.carla]),
      ),
      /administrador/,
    )
    // marcador a medias
    await fails(
      as('beto', () => db.query(`update public.matches set home_score = 1 where id = $1`, [s1l2])),
      /ambos/,
    )
  })

  it('un resultado ya registrado solo lo corrige un admin', async () => {
    const s1l1 = await matchOf('semi', 1, 1)
    await fails(
      as('beto', () => db.query(`update public.matches set home_score = 0, away_score = 5 where id = $1`, [s1l1])),
      /corregir/,
    )
    await as('ana', () => db.query(`update public.matches set home_score = 2, away_score = 1 where id = $1`, [s1l1]))
  })

  it('apply_bracket_updates: un miembro solo rellena plazas vacías; el admin corrige', async () => {
    const fin = await matchOf('final', 1, 1)
    // beto (guest) rellena la final con un finalista
    await as('beto', () =>
      db.query(`select public.apply_bracket_updates($1, $2::jsonb)`, [
        cupId,
        JSON.stringify([{ matchId: fin, home_id: memberId.ana, away_id: memberId.carla }]),
      ]),
    )
    let f = await db.query<{ home_id: string; away_id: string }>(`select home_id, away_id from public.matches where id = $1`, [fin])
    expect(f.rows[0]).toEqual({ home_id: memberId.ana, away_id: memberId.carla })

    // un guest NO puede sobrescribir una plaza ya ocupada
    await as('beto', () =>
      db.query(`select public.apply_bracket_updates($1, $2::jsonb)`, [
        cupId,
        JSON.stringify([{ matchId: fin, home_id: memberId.beto, away_id: memberId.ghost }]),
      ]),
    )
    f = await db.query(`select home_id, away_id from public.matches where id = $1`, [fin])
    expect(f.rows[0]).toEqual({ home_id: memberId.ana, away_id: memberId.carla })

    // un participante de otro torneo es rechazado
    await fails(
      as('beto', () =>
        db.query(`select public.apply_bracket_updates($1, $2::jsonb)`, [
          cupId,
          JSON.stringify([{ matchId: fin, home_id: '00000000-0000-0000-0000-000000000001', away_id: null }]),
        ]),
      ),
      /inválido/,
    )

    // un no-miembro no puede
    await fails(
      as('extra', () => db.query(`select public.apply_bracket_updates($1, '[]'::jsonb)`, [cupId])),
      /perteneces/,
    )

    // el admin sí puede reemplazar
    await as('ana', () =>
      db.query(`select public.apply_bracket_updates($1, $2::jsonb)`, [
        cupId,
        JSON.stringify([{ matchId: fin, home_id: memberId.ana, away_id: memberId.beto }]),
      ]),
    )
    f = await db.query(`select home_id, away_id from public.matches where id = $1`, [fin])
    expect(f.rows[0]).toEqual({ home_id: memberId.ana, away_id: memberId.beto })
  })

  it('el campeón solo se acepta con la final completa y siendo finalista', async () => {
    const fin = await matchOf('final', 1, 1)
    // aún sin jugar: se ignora
    await as('beto', () =>
      db.query(`select public.apply_bracket_updates($1, '[]'::jsonb, $2)`, [cupId, memberId.ana]),
    )
    let t = await db.query<{ status: string }>(`select status from public.tournaments where id = $1`, [cupId])
    expect(t.rows[0].status).toBe('knockout')

    await as('ana', () => db.query(`update public.matches set home_score = 3, away_score = 1 where id = $1`, [fin]))
    // un no finalista no puede ser campeón
    await as('beto', () =>
      db.query(`select public.apply_bracket_updates($1, '[]'::jsonb, $2)`, [cupId, memberId.carla]),
    )
    t = await db.query(`select status from public.tournaments where id = $1`, [cupId])
    expect(t.rows[0].status).toBe('knockout')

    await as('beto', () =>
      db.query(`select public.apply_bracket_updates($1, '[]'::jsonb, $2)`, [cupId, memberId.ana]),
    )
    const done = await db.query<{ status: string; champion_member_id: string }>(
      `select status, champion_member_id from public.tournaments where id = $1`,
      [cupId],
    )
    expect(done.rows[0]).toEqual({ status: 'finished', champion_member_id: memberId.ana })

    // el admin puede reabrir tras corregir un resultado
    await as('ana', () =>
      db.query(`select public.apply_bracket_updates($1, '[]'::jsonb, null, 'knockout')`, [cupId]),
    )
    t = await db.query(`select status from public.tournaments where id = $1`, [cupId])
    expect(t.rows[0].status).toBe('knockout')
  })

  it('el super admin ve y administra todos los torneos', async () => {
    const r = await as('leinerdev', () => db.query(`select id from public.tournaments`))
    expect(r.rows).toHaveLength(1)
    const upd = await as('leinerdev', () =>
      db.query(`update public.tournaments set name = 'Copa Renombrada' where id = $1 returning name`, [cupId]),
    )
    expect(upd.rows[0]).toEqual({ name: 'Copa Renombrada' })
  })

  it('salir del torneo solo en draft; el creador no puede salir; borrar torneo en cascada', async () => {
    // torneo en draft
    const t = await as('beto', () =>
      db.query<{ id: string; code: string }>(
        `select * from public.create_tournament('Liga Beto', 'league', $1::jsonb)`,
        [JSON.stringify({ size: 4, league: { double_leg: false, advance_count: 2 }, knockout: { two_legged: {}, third_place: false } })],
      ),
    )
    await as('diego', () => db.query(`select public.join_tournament($1)`, [t.rows[0].code]))
    const left = await as('diego', () =>
      db.query(`delete from public.tournament_members where tournament_id = $1 and user_id = $2 returning id`, [t.rows[0].id, ids.diego]),
    )
    expect(left.rows).toHaveLength(1)
    await fails(
      as('beto', () =>
        db.query(`delete from public.tournament_members where tournament_id = $1 and user_id = $2`, [t.rows[0].id, ids.beto]),
      ),
      /creador/,
    )
    // en torneo iniciado no se puede salir
    const gone = await as('carla', () =>
      db.query(`delete from public.tournament_members where id = $1 returning id`, [memberId.carla]),
    )
    expect(gone.rows).toHaveLength(0)

    // un guest no puede borrar; el admin sí (cascada limpia miembros y partidos)
    const nope = await as('beto', () => db.query(`delete from public.tournaments where id = $1 returning id`, [cupId]))
    expect(nope.rows).toHaveLength(0)
    await as('ana', () => db.query(`delete from public.tournaments where id = $1`, [cupId]))
    const left2 = await db.query<{ n: string }>(
      `select (select count(*) from public.matches where tournament_id = $1)::text n`,
      [cupId],
    )
    expect(left2.rows[0].n).toBe('0')
  })
})
