import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

/** false cuando faltan las variables de entorno: la app muestra una guía de configuración. */
export const isSupabaseConfigured = Boolean(url && anonKey)

export const supabase = createClient(
  url ?? 'http://localhost:54321',
  anonKey ?? 'public-anon-key-not-configured',
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,
    },
    realtime: { params: { eventsPerSecond: 10 } },
  },
)

/** Dominio sintético: Supabase Auth exige email, el usuario solo escribe su username. */
export const AUTH_EMAIL_DOMAIN = 'fccc.app'

export function usernameToEmail(username: string): string {
  return `${username.trim().toLowerCase()}@${AUTH_EMAIL_DOMAIN}`
}

export const USERNAME_RE = /^[a-z0-9_]{3,20}$/

export function validateUsername(raw: string): string | null {
  const username = raw.trim().toLowerCase()
  if (!USERNAME_RE.test(username)) {
    return 'Usa de 3 a 20 caracteres: letras minúsculas, números o guion bajo.'
  }
  return null
}

export function validatePassword(password: string): string | null {
  if (password.length < 6) return 'La contraseña debe tener al menos 6 caracteres.'
  return null
}

/** Traduce errores comunes de Supabase al español. */
export function friendlyError(error: unknown): string {
  const msg =
    typeof error === 'object' && error && 'message' in error
      ? String((error as { message: unknown }).message)
      : String(error)
  const lower = msg.toLowerCase()
  if (lower.includes('invalid login credentials')) return 'Usuario o contraseña incorrectos.'
  if (lower.includes('user already registered') || lower.includes('already been registered'))
    return 'Ese nombre de usuario ya está en uso.'
  if (
    (lower.includes('duplicate key') && lower.includes('username')) ||
    lower.includes('database error saving new user')
  )
    return 'Ese nombre de usuario ya está en uso.'
  if (lower.includes('password should be at least')) return 'La contraseña es demasiado corta.'
  if (lower.includes('failed to fetch') || lower.includes('networkerror'))
    return 'Sin conexión con el servidor. Revisa tu internet e inténtalo de nuevo.'
  if (lower.includes('rate limit')) return 'Demasiados intentos. Espera un momento.'
  if (lower.includes('row-level security') || lower.includes('permission denied'))
    return 'No tienes permiso para hacer esto.'
  if (lower.includes('jwt expired')) return 'Tu sesión expiró. Vuelve a iniciar sesión.'
  return msg
}
