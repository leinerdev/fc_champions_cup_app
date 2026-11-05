// Prueba visual con Supabase simulado (solo para verificación local)
import { chromium } from 'playwright-core'

const BASE = process.env.BASE ?? 'http://localhost:5199'
const MOCK = 'http://mock.supabase.local'
const ME = 'u-me'
const out = (n) => `.tmp-shots/${n}.png`

const people = [
  ['u-me', 'leinerdev', 'Leiner Barrios'],
  ['u-ana', 'ana', 'Ana Gómez'],
  ['u-beto', 'beto', 'Beto Ruiz'],
  ['u-carla', 'carla', 'Carla Díaz'],
  ['u-diego', 'diego', 'Diego Soto'],
  ['u-elena', 'elena', 'Elena Paz'],
  ['u-fer', 'fer', 'Fernando Gil'],
  ['u-gabo', 'gabo', 'Gabriel Mora'],
]
const profile = (i) => ({ username: people[i][1], full_name: people[i][2], avatar_url: null })
const mk = (tid, i, role = 'guest') => ({
  id: `${tid}-m${i}`, tournament_id: tid, user_id: people[i][0], display_name: people[i][2],
  role: i === 0 ? 'admin' : role, created_at: `2026-11-0${i + 1}T10:00:00Z`, profile: profile(i),
})

const base = { champion_member_id: null, created_by: ME, created_at: '2026-11-03T10:00:00Z' }
const t1 = { ...base, id: 't1', name: 'Liga de los Cracks', type: 'league', code: '482913', status: 'league',
  config: { size: 6, league: { double_leg: false, advance_count: 4 }, knockout: { two_legged: { semi: true }, third_place: true } } }
const t2 = { ...base, id: 't2', name: 'Copa Champions', type: 'cup', code: '120934', status: 'knockout',
  config: { size: 8, knockout: { two_legged: {}, third_place: false } } }
const t3 = { ...base, id: 't3', name: 'Copa Relámpago', type: 'cup', code: '777001', status: 'finished', champion_member_id: 't3-m1',
  config: { size: 4, knockout: { two_legged: { semi: true }, third_place: true } } }
const t4 = { ...base, id: 't4', name: 'Mini Liga Viernes', type: 'league', code: '555123', status: 'draft',
  config: { size: 6, league: { double_leg: true, advance_count: 4 }, knockout: { two_legged: {}, third_place: false } } }

const members = {
  t1: [0, 1, 2, 3, 4, 5].map((i) => mk('t1', i)),
  t2: [0, 1, 2, 3, 4, 5, 6, 7].map((i) => mk('t2', i)),
  t3: [0, 1, 2, 3].map((i) => mk('t3', i)),
  t4: [0, 1, 2].map((i) => mk('t4', i)),
}
members.t4.push({ id: 't4-ghost', tournament_id: 't4', user_id: null, display_name: 'Pepe (sin cuenta)', role: 'guest', created_at: '2026-11-04T10:00:00Z', profile: null })

let mid = 0
const match = (tid, stage, round, slot, leg, h, a, hs = null, as = null, ph = null, pa = null) => ({
  id: `x${++mid}`, tournament_id: tid, stage, round, slot, leg,
  home_id: h === null ? null : `${tid}-m${h}`, away_id: a === null ? null : `${tid}-m${a}`,
  home_score: hs, away_score: as, pens_home: ph, pens_away: pa,
  status: hs === null ? 'scheduled' : 'played', played_at: null, created_at: '',
})

// Liga: 6 jugadores, todos contra todos
const league = []
const pairs = []
for (let i = 0; i < 6; i++) for (let j = i + 1; j < 6; j++) pairs.push([i, j])
const scores = [[2, 1], [0, 0], [3, 1], [1, 2], [2, 2], [0, 1], [4, 0], [1, 1], [2, 0], [0, 3]]
pairs.forEach(([i, j], k) => {
  const s = scores[k]
  league.push(match('t1', 'league', (k % 5) + 1, k + 1, 1, i, j, s?.[0] ?? null, s?.[1] ?? null))
})

// Copa de 8: cuartos jugados, semis en curso
const cup = [
  match('t2', 'quarter', 1, 1, 1, 0, 1, 2, 0), match('t2', 'quarter', 1, 2, 1, 2, 3, 1, 1, 4, 5),
  match('t2', 'quarter', 1, 3, 1, 4, 5, 0, 3), match('t2', 'quarter', 1, 4, 1, 6, 7, 2, 1),
  match('t2', 'semi', 1, 1, 1, 0, 3, 1, 0), match('t2', 'semi', 1, 2, 1, 5, 6),
  match('t2', 'final', 1, 1, 1, 0, null),
]
// Copa finalizada de 4 con ida y vuelta en semis
const done = [
  match('t3', 'semi', 1, 1, 1, 1, 2, 2, 0), match('t3', 'semi', 1, 1, 2, 2, 1, 1, 1),
  match('t3', 'semi', 1, 2, 1, 0, 3, 0, 1), match('t3', 'semi', 1, 2, 2, 3, 0, 2, 1),
  match('t3', 'third_place', 1, 1, 1, 0, 2, 3, 3, 4, 2),
  match('t3', 'final', 1, 1, 1, 1, 3, 2, 1),
]
const matches = { t1: league, t2: cup, t3: done, t4: [] }
const tournaments = { t1, t2, t3, t4 }

const mePrivate = { id: ME, email: 'leiner@example.com' }
const meProfile = { id: ME, username: 'leinerdev', full_name: 'Leiner Barrios', avatar_url: null, is_super_admin: true, created_at: '2026-10-01T00:00:00Z' }

function handle(route) {
  const url = new URL(route.request().url())
  const p = url.pathname
  const q = url.search
  const json = (body, status = 200) =>
    route.fulfill({ status, contentType: 'application/json', headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' }, body: JSON.stringify(body) })
  if (route.request().method() === 'OPTIONS') return json({})
  if (p.startsWith('/auth/v1/user')) return json({ id: ME, aud: 'authenticated', email: 'leinerdev@fccc.app' })
  if (p === '/rest/v1/profiles') {
    if (q.includes('select=*%2Cprofile_private') || q.includes('profile_private')) {
      return json(people.map((x, i) => ({ id: x[0], username: x[1], full_name: x[2], avatar_url: null, is_super_admin: i === 0, created_at: `2026-10-0${i + 1}T00:00:00Z`, profile_private: { email: `${x[1]}@example.com` } })))
    }
    return json(meProfile)
  }
  if (p === '/rest/v1/profile_private') return json(mePrivate)
  if (p === '/rest/v1/tournament_members') {
    if (q.includes('user_id=eq.')) {
      return json(Object.values(tournaments).map((t) => ({ role: 'admin', tournament: { ...t, members: [{ count: members[t.id].length }] } })))
    }
    const tid = /tournament_id=eq\.(\w+)/.exec(q)?.[1]
    return json(members[tid] ?? [])
  }
  if (p === '/rest/v1/tournaments') {
    const id = /id=eq\.(\w+)/.exec(q)?.[1]
    if (id) return json(tournaments[id] ?? null)
    return json(Object.values(tournaments).map((t) => ({ ...t, creator: { username: 'leinerdev', full_name: 'Leiner Barrios' }, members: [{ count: members[t.id].length }] })))
  }
  if (p === '/rest/v1/matches') {
    const tid = /tournament_id=eq\.(\w+)/.exec(q)?.[1]
    return json(matches[tid] ?? [])
  }
  if (p === '/rest/v1/rpc/preview_tournament') return json({ id: 't4', name: 'Mini Liga Viernes', type: 'league', status: 'draft', size: 6, members: 3, creator: 'Leiner Barrios', already_member: false })
  return json([])
}

const exp = Math.floor(Date.now() / 1000) + 3600
const session = {
  access_token: 'a.b.c', refresh_token: 'r', token_type: 'bearer', expires_in: 3600, expires_at: exp,
  user: { id: ME, aud: 'authenticated', email: 'leinerdev@fccc.app', app_metadata: {}, user_metadata: { username: 'leinerdev' }, created_at: '2026-10-01T00:00:00Z' },
}

const browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true })
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'es-ES' })
await ctx.route(`${MOCK}/**`, handle)
await ctx.addInitScript((s) => { if (!location.pathname.startsWith('/login-test')) localStorage.setItem('sb-mock-auth-token', JSON.stringify(s)); localStorage.setItem('fccc-install-dismissed', String(Date.now())) }, session)
const page = await ctx.newPage()
const errors = []
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message))
page.on('console', (m) => { if (m.type() === 'error' && !m.text().includes('WebSocket') && !m.text().includes('ERR_')) errors.push('console: ' + m.text()) })

async function shot(path, name, { wait = 900, full = false, action } = {}) {
  await page.goto(BASE + path, { waitUntil: 'networkidle' }).catch(() => {})
  await page.waitForTimeout(wait)
  if (action) await action()
  await page.screenshot({ path: out(name), fullPage: full })
  console.log('shot', name)
}

await shot('/', 'home', { full: true })
await shot('/torneos/nuevo', 'create-1')
await shot('/torneos/nuevo', 'create-2', { action: async () => { await page.getByRole('button', { name: /Liga \/ Liguilla/ }).click(); await page.getByLabel('Nombre del torneo').fill('Liga de los Cracks'); await page.waitForTimeout(400) }, full: true })
await shot('/torneos/t4', 'draft', { full: true })
await shot('/torneos/t4?tab=jugadores', 'members', { full: true })
await shot('/torneos/t1', 'league-summary', { full: true })
await shot('/torneos/t1?tab=tabla', 'standings', { full: true })
await shot('/torneos/t1?tab=partidos', 'matches', { full: true })
await shot('/torneos/t2?tab=llaves', 'bracket', { full: true })
await shot('/torneos/t3', 'champion', { full: true, wait: 1500 })
await shot('/torneos/t3?tab=llaves', 'bracket-done', { full: true })
await shot('/perfil', 'profile', { full: true })
await shot('/admin', 'admin', { full: true })
await shot('/join/555123', 'join')

// Escritorio
await page.setViewportSize({ width: 1280, height: 800 })
await shot('/', 'home-desktop')
await shot('/torneos/t1?tab=tabla', 'standings-desktop', { full: true })
await shot('/torneos/t2?tab=llaves', 'bracket-desktop', { full: true })

// Diálogo de marcador
await page.setViewportSize({ width: 390, height: 844 })
await shot('/torneos/t1?tab=partidos', 'score-dialog', { action: async () => { await page.getByRole('button', { name: 'Registrar resultado' }).first().click(); await page.waitForTimeout(500) } })

// login sin sesión
const ctx2 = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true })
await ctx2.route(`${MOCK}/**`, handle)
const p2 = await ctx2.newPage()
await p2.goto(BASE + '/login', { waitUntil: 'networkidle' }).catch(() => {})
await p2.waitForTimeout(800)
await p2.screenshot({ path: out('login') })
console.log('shot login')

console.log(errors.length ? 'ERRORES:\n' + errors.join('\n') : 'sin errores de consola')
await browser.close()
